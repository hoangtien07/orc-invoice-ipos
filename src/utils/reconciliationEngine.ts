import {
  IposReceiptLine,
  VendorInvoiceLine,
  ReconciliationMatchPair,
  ReconciliationStatus,
  ReconciliationSummary,
  LearnedItemAlias,
  IposUnitConversion,
} from '../types';
import { isSameOrEquivalentUnit, normalizeWithoutAccents } from './vietnamese';

/**
 * Advanced Reconciliation Engine for IVT iPOS
 * Supports:
 * - Multi-supplier partitioning (prevents cross-supplier contamination)
 * - N-to-1 matching (Grouping multiple daily iPOS receipts into one monthly vendor e-invoice line)
 * - Invoice number anchor priority & date proximity scoping
 * - UoM conversion (e.g. Thùng <-> Lon, Kg <-> g)
 * - Semantic name matching with learned aliases & Vietnamese fuzzy tokens
 * - Category-aware tolerance check (moisture/meat loss vs strict dry goods)
 * - Accurate overcharged amount calculation (including unmatched invoice lines)
 */

export interface ReconciliationOptions {
  freshFoodQtyTolerancePercent?: number; // default: 3% (thịt, cá, thủy hải sản)
  vegetableQtyTolerancePercent?: number; // default: 2% (rau củ quả tươi, nấm)
  dryGoodsQtyTolerancePercent?: number;  // default: 0% (hàng khô, gia vị, đồ hộp)
  currencyRoundingTolerance?: number;    // default: 2000 VND
  matchDateRangeDays?: number;           // default: 35 days
  unitConversions?: IposUnitConversion[];
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeWithoutAccents(str1);
  const s2 = normalizeWithoutAccents(str2);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;

  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.85;
  }

  // Token overlap (Jaccard similarity on words)
  const tokens1 = new Set(s1.split(' ').filter((w) => w.length > 1));
  const tokens2 = new Set(s2.split(' ').filter((w) => w.length > 1));

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Clean vendor name to verify supplier compatibility and avoid cross-vendor contamination
 */
function isCompatibleSupplier(sellerName?: string, receiptSupplierName?: string): boolean {
  if (!sellerName || !receiptSupplierName) return true;
  const s2 = normalizeWithoutAccents(receiptSupplierName);

  // If receipt is from generic OCR or paper delivery note placeholder, consider compatible
  if (
    s2.includes('phieu giao hang') ||
    s2.includes('phieu giay') ||
    s2.includes('chua xac dinh') ||
    s2.includes('ocr') ||
    s2.includes('bien ban')
  ) {
    return true;
  }

  const clean1 = normalizeWithoutAccents(sellerName)
    .replace(/\b(cty|cong ty|cp|tnhh|dntn|chi nhanh|doanh nghiep|nha cung cap)\b/g, '')
    .trim();
  const clean2 = s2
    .replace(/\b(cty|cong ty|cp|tnhh|dntn|chi nhanh|doanh nghiep|nha cung cap)\b/g, '')
    .trim();
  if (!clean1 || !clean2) return true;
  return clean1.includes(clean2) || clean2.includes(clean1) || calculateSimilarity(clean1, clean2) >= 0.4;
}

/**
 * Find conversion factor between two units (e.g. 1 Thùng = 24 Lon)
 */
function findConversionFactor(
  invoiceUnit: string,
  iposUnit: string,
  conversions: IposUnitConversion[] = []
): number | null {
  if (isSameOrEquivalentUnit(invoiceUnit, iposUnit)) return 1.0;
  const invNorm = normalizeWithoutAccents(invoiceUnit);
  const iposNorm = normalizeWithoutAccents(iposUnit);

  // Check custom conversion table
  for (const c of conversions) {
    const cs = normalizeWithoutAccents(c.sourceUnitName);
    const ct = normalizeWithoutAccents(c.targetUnitName);
    // If invoice is in sourceUnit and iPOS is in targetUnit (e.g. 1 Thùng = 24 Lon)
    if (cs === invNorm && ct === iposNorm && c.conversionRate > 0) {
      return c.conversionRate;
    }
    // Reverse
    if (cs === iposNorm && ct === invNorm && c.conversionRate > 0) {
      return 1 / c.conversionRate;
    }
  }

  // Standard metric conversions
  if ((invNorm === 'kg' && iposNorm === 'g') || (invNorm === 'kg' && iposNorm === 'gr')) return 1000;
  if ((invNorm === 'g' || invNorm === 'gr') && iposNorm === 'kg') return 0.001;
  if (invNorm === 'lit' && iposNorm === 'ml') return 1000;
  if (invNorm === 'ml' && iposNorm === 'lit') return 0.001;

  return null;
}

export function runReconciliation(
  iposLines: IposReceiptLine[],
  invoiceLines: VendorInvoiceLine[],
  aliases: LearnedItemAlias[] = [],
  options: ReconciliationOptions = {}
): {
  pairs: ReconciliationMatchPair[];
  summary: ReconciliationSummary;
} {
  const {
    freshFoodQtyTolerancePercent = 3.0,
    vegetableQtyTolerancePercent = 2.0,
    dryGoodsQtyTolerancePercent = 0.0,
    currencyRoundingTolerance = 2000,
    unitConversions = [],
  } = options;

  const pairs: ReconciliationMatchPair[] = [];
  const usedIposIds = new Set<string>();
  const usedInvoiceIds = new Set<string>();

  // 1. Group invoice lines and find best matching iPOS receipts (N-to-1)
  for (const invLine of invoiceLines) {
    const invNameNorm = normalizeWithoutAccents(invLine.itemName);

    // Look for matched alias first
    const alias = aliases.find(
      (a) =>
        normalizeWithoutAccents(a.raw_item_sample) === invNameNorm ||
        normalizeWithoutAccents(a.selected_item_name) === invNameNorm
    );

    // Find candidate iPOS receipts with compatible supplier and matching item name
    const candidateIposLines = iposLines.filter((rec) => {
      if (usedIposIds.has(rec.id)) return false;

      // Ensure same supplier to prevent cross-supplier contamination
      if (!isCompatibleSupplier(invLine.sellerName, rec.supplierName)) {
        return false;
      }

      // 1. Exact alias match
      if (alias && (rec.itemId === alias.selected_item_id || normalizeWithoutAccents(rec.itemName) === normalizeWithoutAccents(alias.selected_item_name))) {
        return true;
      }

      // 2. High semantic similarity
      const sim = calculateSimilarity(rec.itemName, invLine.itemName);
      return sim >= 0.45;
    });

    if (candidateIposLines.length > 0) {
      // Prioritize candidates:
      // A. Receipts explicitly mentioning this invoice number in invoiceNoRef
      // B. Receipts closer in date to invoiceDate
      candidateIposLines.sort((a, b) => {
        const aHasInv = a.invoiceNoRef && invLine.invoiceNumber.includes(a.invoiceNoRef) ? 1 : 0;
        const bHasInv = b.invoiceNoRef && invLine.invoiceNumber.includes(b.invoiceNoRef) ? 1 : 0;
        if (aHasInv !== bHasInv) return bHasInv - aHasInv;

        // Date proximity
        const dateA = new Date(a.receiptDate || 0).getTime();
        const dateB = new Date(b.receiptDate || 0).getTime();
        const invDate = new Date(invLine.invoiceDate || 0).getTime();
        return Math.abs(dateA - invDate) - Math.abs(dateB - invDate);
      });

      // Mark selected candidates as used
      candidateIposLines.forEach((l) => usedIposIds.add(l.id));
      usedInvoiceIds.add(invLine.id);

      // Check UoM conversion
      const sampleIposUnit = candidateIposLines[0]?.unitName || 'kg';
      const conversionRate = findConversionFactor(invLine.unitName, sampleIposUnit, unitConversions);

      const rawIposQty = candidateIposLines.reduce((acc, l) => acc + (l.quantity || 0), 0);
      const totalIposAmount = candidateIposLines.reduce((acc, l) => acc + (l.amount || 0), 0);

      // Converted iPOS qty matching invoice unit if rate found
      const effectiveIposQty = conversionRate && conversionRate !== 1.0 ? rawIposQty / conversionRate : rawIposQty;
      const effectiveIposPrice = effectiveIposQty > 0 ? Math.round(totalIposAmount / effectiveIposQty) : (candidateIposLines[0]?.unitPrice || 0);

      const invQty = invLine.quantity || 0;
      const invPrice = invLine.unitPrice || 0;
      const invAmount = invLine.amount || 0;

      // Deltas (Invoice - iPOS). If positive, invoice charged more than iPOS recorded
      const qtyDelta = Math.round((invQty - effectiveIposQty) * 100) / 100;
      const priceDelta = invPrice - effectiveIposPrice;
      const amountDelta = invAmount - totalIposAmount;

      const unitMatch = conversionRate !== null || isSameOrEquivalentUnit(sampleIposUnit, invLine.unitName);

      // Determine Status
      let status: ReconciliationStatus = 'PERFECT_MATCH';
      let severity: 'OK' | 'WARNING' | 'CRITICAL' = 'OK';
      let suggestedAction: 'APPROVE' | 'DEBIT_VENDOR' | 'UPDATE_IPOS' | 'CHECK_DELIVERY_NOTE' = 'APPROVE';

      const isPriceLệch = Math.abs(priceDelta) > 500;
      const isQtyLệch = Math.abs(qtyDelta) > 0.05;

      // F&B Category classification for natural tolerance check
      const isMeatOrSeafood =
        invNameNorm.includes('thit') ||
        invNameNorm.includes('bo') ||
        invNameNorm.includes('heo') ||
        invNameNorm.includes('ga') ||
        invNameNorm.includes('ca') ||
        invNameNorm.includes('tom') ||
        invNameNorm.includes('muc') ||
        invNameNorm.includes('cua') ||
        invNameNorm.includes('suon') ||
        invNameNorm.includes('vit') ||
        invNameNorm.includes('ngheu') ||
        invNameNorm.includes('so') ||
        invNameNorm.includes('oc');

      const isVegetable =
        invNameNorm.includes('rau') ||
        invNameNorm.includes('cu') ||
        invNameNorm.includes('qua') ||
        invNameNorm.includes('cai') ||
        invNameNorm.includes('hanh') ||
        invNameNorm.includes('toi') ||
        invNameNorm.includes('ot') ||
        invNameNorm.includes('nam') ||
        invNameNorm.includes('dua leo') ||
        invNameNorm.includes('ca chua') ||
        invNameNorm.includes('ngo') ||
        invNameNorm.includes('bap') ||
        invNameNorm.includes('mung toi') ||
        invNameNorm.includes('khoai') ||
        invNameNorm.includes('sa') ||
        invNameNorm.includes('gung');

      let applicableTolerancePercent = dryGoodsQtyTolerancePercent;
      if (isMeatOrSeafood) {
        applicableTolerancePercent = freshFoodQtyTolerancePercent;
      } else if (isVegetable) {
        applicableTolerancePercent = vegetableQtyTolerancePercent;
      }

      const qtyTolerancePercent = (Math.abs(qtyDelta) / (invQty || 1)) * 100;

      if (isPriceLệch && isQtyLệch) {
        status = 'PRICE_AND_QTY_DIFF';
        severity = 'CRITICAL';
        suggestedAction = 'DEBIT_VENDOR';
      } else if (isPriceLệch) {
        status = 'PRICE_DIFF';
        severity = 'CRITICAL';
        suggestedAction = priceDelta > 0 ? 'DEBIT_VENDOR' : 'UPDATE_IPOS';
      } else if (isQtyLệch) {
        if (applicableTolerancePercent > 0 && qtyTolerancePercent <= applicableTolerancePercent && qtyDelta > 0) {
          // Inside natural loss tolerance
          status = 'QUANTITY_DIFF';
          severity = 'WARNING';
          suggestedAction = 'CHECK_DELIVERY_NOTE';
        } else {
          status = 'QUANTITY_DIFF';
          severity = 'CRITICAL';
          suggestedAction = 'DEBIT_VENDOR';
        }
      } else if (Math.abs(amountDelta) > currencyRoundingTolerance) {
        status = 'PRICE_DIFF';
        severity = 'WARNING';
        suggestedAction = 'DEBIT_VENDOR';
      } else {
        status = 'PERFECT_MATCH';
        severity = 'OK';
        suggestedAction = 'APPROVE';
      }

      pairs.push({
        id: `pair_${invLine.id}`,
        status,
        supplierName: invLine.sellerName || candidateIposLines[0].supplierName,
        matchedItemName: invLine.itemName,
        iposLines: candidateIposLines,
        invoiceLine: invLine,
        iposQty: Math.round(effectiveIposQty * 100) / 100,
        invoiceQty: invQty,
        iposPrice: effectiveIposPrice,
        invoicePrice: invPrice,
        iposAmount: totalIposAmount,
        invoiceAmount: invAmount,
        qtyDelta,
        priceDelta,
        amountDelta,
        unitMatch,
        severity,
        suggestedAction,
        resolutionStatus: 'PENDING',
      });
    }
  }

  // 2. Leftover Invoice Lines (Unmatched in iPOS - Invoiced but never received in warehouse)
  for (const invLine of invoiceLines) {
    if (!usedInvoiceIds.has(invLine.id)) {
      pairs.push({
        id: `pair_unmatched_inv_${invLine.id}`,
        status: 'UNMATCHED_INVOICE',
        supplierName: invLine.sellerName,
        matchedItemName: invLine.itemName,
        iposLines: [],
        invoiceLine: invLine,
        iposQty: 0,
        invoiceQty: invLine.quantity || 0,
        iposPrice: 0,
        invoicePrice: invLine.unitPrice || 0,
        iposAmount: 0,
        invoiceAmount: invLine.amount || 0,
        qtyDelta: invLine.quantity || 0,
        priceDelta: invLine.unitPrice || 0,
        amountDelta: invLine.amount || 0,
        unitMatch: false,
        severity: 'CRITICAL',
        suggestedAction: 'DEBIT_VENDOR',
        resolutionStatus: 'PENDING',
        resolutionNote: 'Có hóa đơn VAT nhưng iPOS chưa ghi nhận phiếu nhập kho tương ứng',
      });
    }
  }

  // 3. Leftover iPOS Lines (Unmatched in Invoices - Received in warehouse but vendor hasn't invoiced)
  for (const rec of iposLines) {
    if (!usedIposIds.has(rec.id)) {
      pairs.push({
        id: `pair_unmatched_ipos_${rec.id}`,
        status: 'UNMATCHED_IPOS',
        supplierName: rec.supplierName,
        matchedItemName: rec.itemName,
        iposLines: [rec],
        invoiceLine: undefined,
        iposQty: rec.quantity || 0,
        invoiceQty: 0,
        iposPrice: rec.unitPrice || 0,
        invoicePrice: 0,
        iposAmount: rec.amount || 0,
        invoiceAmount: 0,
        qtyDelta: -(rec.quantity || 0),
        priceDelta: -(rec.unitPrice || 0),
        amountDelta: -(rec.amount || 0),
        unitMatch: false,
        severity: 'WARNING',
        suggestedAction: 'CHECK_DELIVERY_NOTE',
        resolutionStatus: 'PENDING',
        resolutionNote: 'Đã nhập kho trên iPOS nhưng chưa nhận được hóa đơn VAT từ NCC',
      });
    }
  }

  // 4. Compute Summary Statistics
  const totalPairs = pairs.length;
  const perfectMatchCount = pairs.filter((p) => p.status === 'PERFECT_MATCH').length;
  const priceDiffCount = pairs.filter((p) => p.status === 'PRICE_DIFF' || p.status === 'PRICE_AND_QTY_DIFF').length;
  const qtyDiffCount = pairs.filter((p) => p.status === 'QUANTITY_DIFF' || p.status === 'PRICE_AND_QTY_DIFF').length;
  const unmatchedIposCount = pairs.filter((p) => p.status === 'UNMATCHED_IPOS').length;
  const unmatchedInvoiceCount = pairs.filter((p) => p.status === 'UNMATCHED_INVOICE').length;

  const totalIposAmount = pairs.reduce((acc, p) => acc + p.iposAmount, 0);
  const totalInvoiceAmount = pairs.reduce((acc, p) => acc + p.invoiceAmount, 0);

  // Total overcharged amount:
  // - If unmatched invoice line: vendor billed for items never received -> 100% overcharge
  // - If matched line and amountDelta > 0: vendor charged more than actual goods -> delta overcharge
  const totalOverchargedAmount = pairs.reduce((acc, p) => {
    if (p.status === 'UNMATCHED_INVOICE') {
      return acc + (p.invoiceAmount || 0);
    }
    if (p.amountDelta > 0) {
      return acc + p.amountDelta;
    }
    return acc;
  }, 0);

  const matchRatePercent = totalPairs > 0 ? Math.round((perfectMatchCount / totalPairs) * 100) : 0;

  const summary: ReconciliationSummary = {
    totalPairs,
    perfectMatchCount,
    priceDiffCount,
    qtyDiffCount,
    unmatchedIposCount,
    unmatchedInvoiceCount,
    totalIposAmount,
    totalInvoiceAmount,
    totalOverchargedAmount,
    matchRatePercent,
  };

  return { pairs, summary };
}
