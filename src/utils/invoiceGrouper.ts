import JSZip from 'jszip';
import {
  InvoiceDocumentSession,
  InvoiceImageItem,
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
  MatchedInvoiceRow,
  RawInvoiceData,
  RawInvoiceRow,
} from '../types';
import { CatalogResolver } from './resolver';
import { generateIposExportWorkbook, writeXlsxFile } from './excel';
import * as XLSX from 'xlsx';

/**
 * Compresses an image file if it is larger than max dimension or file size
 * Returns a base64 data URL
 */
export async function compressImageIfNeeded(file: File, maxDim = 1800, quality = 0.85): Promise<string> {
  // If not an image (e.g. PDF), read as normal data URL
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Check if downscale is needed
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Use white background in case of transparent png
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const compressedBase64 = canvas.toDataURL(mime, quality);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        resolve(e.target?.result as string);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface ExtractedImageResult {
  image: InvoiceImageItem;
  rawInvoice: RawInvoiceData;
}

/**
 * Normalizes text for comparing invoice numbers / suppliers
 */
function cleanKey(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

/**
 * Smart automatic grouping of multiple scanned images into invoices.
 *
 * Rules:
 * 1. If 2+ images share the exact same valid invoice_number (length >= 3), they belong to the same invoice.
 * 2. If both have identical non-empty supplier AND date AND invoice_number matches or is empty for one page, they are grouped.
 * 3. In all other cases, each image is treated as a separate invoice.
 */
export function groupExtractedInvoices(
  results: ExtractedImageResult[],
  defaultWarehouseId: string,
  defaultWarehouseName: string,
  masterData: IposMasterData | null,
  learnedAliases: LearnedItemAlias[],
  learnedUnitAliases: LearnedUnitAlias[],
  userSelectedSupplierId?: string
): InvoiceDocumentSession[] {
  if (!results || results.length === 0) return [];

  const resolver = new CatalogResolver(
    masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] },
    learnedAliases,
    learnedUnitAliases
  );

  // Group buckets
  const groups: Array<{
    images: InvoiceImageItem[];
    rawList: RawInvoiceData[];
    invoiceNumber: string;
    supplierRaw: string;
    date: string;
    note: string;
  }> = [];

  for (const item of results) {
    const rawInv = item.rawInvoice;
    const invNum = (rawInv.invoice_number || '').trim();
    const cleanInv = cleanKey(invNum);
    const suppRaw = (rawInv.supplier_raw_name || '').trim();
    const cleanSupp = cleanKey(suppRaw);
    const docDate = (rawInv.document_date || '').trim();

    let matchedGroup: (typeof groups)[0] | null = null;

    // Check existing groups
    for (const grp of groups) {
      const grpCleanInv = cleanKey(grp.invoiceNumber);
      const grpCleanSupp = cleanKey(grp.supplierRaw);

      // Rule 1: Non-empty identical invoice numbers (at least 3 characters)
      if (cleanInv.length >= 3 && grpCleanInv.length >= 3 && cleanInv === grpCleanInv) {
        matchedGroup = grp;
        break;
      }

      // Rule 2: Same supplier and same document date, and neither has conflicting different invoice numbers
      if (
        cleanSupp.length >= 4 &&
        grpCleanSupp.length >= 4 &&
        (cleanSupp.includes(grpCleanSupp) || grpCleanSupp.includes(cleanSupp)) &&
        docDate &&
        grp.date &&
        docDate === grp.date &&
        (!cleanInv || !grpCleanInv || cleanInv === grpCleanInv)
      ) {
        matchedGroup = grp;
        break;
      }
    }

    if (matchedGroup) {
      // Append image and raw data to existing group
      matchedGroup.images.push(item.image);
      matchedGroup.rawList.push(rawInv);
      if (!matchedGroup.invoiceNumber && invNum) matchedGroup.invoiceNumber = invNum;
      if (!matchedGroup.supplierRaw && suppRaw) matchedGroup.supplierRaw = suppRaw;
      if (!matchedGroup.date && docDate) matchedGroup.date = docDate;
      if (rawInv.note) {
        matchedGroup.note = matchedGroup.note ? `${matchedGroup.note}; ${rawInv.note}` : rawInv.note;
      }
    } else {
      // Create new group
      groups.push({
        images: [item.image],
        rawList: [rawInv],
        invoiceNumber: invNum,
        supplierRaw: suppRaw,
        date: docDate || new Date().toISOString().slice(0, 10),
        note: rawInv.note || '',
      });
    }
  }

  // Convert groups into InvoiceDocumentSession
  const sessions: InvoiceDocumentSession[] = groups.map((grp, idx) => {
    // Merge all rows from all pages in this group
    const combinedRows: RawInvoiceRow[] = [];
    let currentLineNo = 1;

    for (const raw of grp.rawList) {
      if (Array.isArray(raw.rows)) {
        for (const row of raw.rows) {
          combinedRows.push({
            ...row,
            line_no: currentLineNo++,
          });
        }
      }
    }

    // Resolve supplier
    let resolvedSupplierId = userSelectedSupplierId || '';
    let resolvedSupplierName = grp.supplierRaw || 'Nhà cung cấp chưa xác định';

    if (!resolvedSupplierId && grp.supplierRaw && masterData?.suppliers) {
      const match = masterData.suppliers.find((s) => {
        const sNorm = cleanKey(s.supplierName);
        const rawNorm = cleanKey(grp.supplierRaw);
        return sNorm && rawNorm && (sNorm.includes(rawNorm) || rawNorm.includes(sNorm));
      });
      if (match) {
        resolvedSupplierId = match.supplierId;
        resolvedSupplierName = match.supplierName;
      }
    } else if (resolvedSupplierId && masterData?.suppliers) {
      const match = masterData.suppliers.find((s) => s.supplierId === resolvedSupplierId);
      if (match) resolvedSupplierName = match.supplierName;
    }

    // Create consolidated rawInvoice
    const consolidatedRaw: RawInvoiceData = {
      supplier_raw_name: grp.supplierRaw || null,
      document_date: grp.date || null,
      invoice_number: grp.invoiceNumber || null,
      note: grp.note || null,
      rows: combinedRows,
    };

    // Match rows against iPOS catalog
    const matchedRows = resolver.processInvoiceRows(combinedRows, resolvedSupplierId);

    // Calculate status
    const hasRed = matchedRows.some((r) => r.status === 'RED');
    const hasUnconfirmedYellow = matchedRows.some((r) => r.status === 'YELLOW' && !r.isManuallyConfirmed);
    const status: 'READY' | 'NEEDS_REVIEW' = hasRed || hasUnconfirmedYellow ? 'NEEDS_REVIEW' : 'READY';

    return {
      id: `inv_${Date.now()}_${idx + 1}`,
      orderIndex: idx + 1,
      supplierId: resolvedSupplierId,
      supplierName: resolvedSupplierName,
      warehouseId: defaultWarehouseId || 'KHO_TONG',
      warehouseName: defaultWarehouseName || 'Kho Tổng Trung Tâm',
      documentDate: grp.date || new Date().toISOString().slice(0, 10),
      invoiceNumber: grp.invoiceNumber || '',
      note: grp.note,
      images: grp.images,
      rawInvoice: consolidatedRaw,
      matchedRows,
      status,
      extractedAt: Date.now(),
    };
  });

  return sessions;
}

/**
 * Merge two invoice sessions into one (e.g. user clicks "Gộp với hóa đơn trên")
 */
export function mergeInvoiceSessions(
  targetSession: InvoiceDocumentSession,
  sourceSession: InvoiceDocumentSession,
  masterData: IposMasterData | null,
  learnedAliases: LearnedItemAlias[],
  learnedUnitAliases: LearnedUnitAlias[]
): InvoiceDocumentSession {
  const resolver = new CatalogResolver(
    masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] },
    learnedAliases,
    learnedUnitAliases
  );

  const mergedImages = [...targetSession.images, ...sourceSession.images];

  // Re-number rows
  let nextLineNo = 1;
  const mergedRawRows: RawInvoiceRow[] = [
    ...targetSession.rawInvoice.rows.map((r) => ({ ...r, line_no: nextLineNo++ })),
    ...sourceSession.rawInvoice.rows.map((r) => ({ ...r, line_no: nextLineNo++ })),
  ];

  const mergedRaw: RawInvoiceData = {
    ...targetSession.rawInvoice,
    note: [targetSession.note, sourceSession.note].filter(Boolean).join('; ') || null,
    rows: mergedRawRows,
  };

  // Re-process matched rows
  const reprocessedRows = resolver.processInvoiceRows(mergedRawRows, targetSession.supplierId);

  const hasRed = reprocessedRows.some((r) => r.status === 'RED');
  const hasYellow = reprocessedRows.some((r) => r.status === 'YELLOW' && !r.isManuallyConfirmed);

  return {
    ...targetSession,
    images: mergedImages,
    rawInvoice: mergedRaw,
    matchedRows: reprocessedRows,
    status: hasRed || hasYellow ? 'NEEDS_REVIEW' : 'READY',
  };
}

/**
 * Split an image out of an invoice session to form a new independent invoice
 */
export function splitInvoiceSession(
  session: InvoiceDocumentSession,
  imageIdToSplit: string,
  masterData: IposMasterData | null,
  learnedAliases: LearnedItemAlias[],
  learnedUnitAliases: LearnedUnitAlias[]
): [InvoiceDocumentSession, InvoiceDocumentSession] | null {
  if (session.images.length <= 1) return null;

  const imageIndex = session.images.findIndex((img) => img.id === imageIdToSplit);
  if (imageIndex < 0) return null;

  const splitImage = session.images[imageIndex];
  const remainingImages = session.images.filter((img) => img.id !== imageIdToSplit);

  // Divide rows proportionally (or first half / second half)
  const totalRows = session.rawInvoice.rows.length;
  const splitPoint = Math.max(1, Math.floor(totalRows * (1 / session.images.length)));

  const remainingRawRows = session.rawInvoice.rows.slice(0, session.rawInvoice.rows.length - splitPoint);
  const splitRawRows = session.rawInvoice.rows.slice(session.rawInvoice.rows.length - splitPoint);

  const resolver = new CatalogResolver(
    masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] },
    learnedAliases,
    learnedUnitAliases
  );

  const targetMatched = resolver.processInvoiceRows(remainingRawRows, session.supplierId);
  const newMatched = resolver.processInvoiceRows(splitRawRows, session.supplierId);

  const remainingSession: InvoiceDocumentSession = {
    ...session,
    images: remainingImages,
    rawInvoice: { ...session.rawInvoice, rows: remainingRawRows },
    matchedRows: targetMatched,
  };

  const newSession: InvoiceDocumentSession = {
    ...session,
    id: `inv_${Date.now()}_split`,
    orderIndex: session.orderIndex + 1,
    images: [splitImage],
    rawInvoice: { ...session.rawInvoice, rows: splitRawRows },
    matchedRows: newMatched,
  };

  return [remainingSession, newSession];
}

/**
 * Exports all given invoices as a single ZIP file containing separate Excel files.
 * Each Excel file complies strictly with the iPOS 11-column purchase import template.
 */
export async function exportAllInvoicesToZip(
  invoices: InvoiceDocumentSession[],
  masterData: IposMasterData,
  zipFileName = 'DANH_SACH_HOA_DON_IPOS.zip'
): Promise<void> {
  if (!invoices || invoices.length === 0) return;

  const zip = new JSZip();

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const { workbook, fileName } = generateIposExportWorkbook(masterData, inv.matchedRows, {
      supplierName: inv.supplierName,
      supplierId: inv.supplierId,
      warehouseId: inv.warehouseId,
      warehouseName: inv.warehouseName,
      invoiceNumber: inv.invoiceNumber,
      documentDate: inv.documentDate,
      note: inv.note,
    });

    // Generate ArrayBuffer with SST for each workbook
    const arrayBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      bookSST: true,
      compression: true,
      type: 'array',
    });

    const safeIndex = String(i + 1).padStart(2, '0');
    const safeName = `${safeIndex}_${fileName}`;
    zip.file(safeName, arrayBuffer);
  }

  // Generate zip file and trigger download
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
