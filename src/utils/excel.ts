import * as XLSX from 'xlsx';
import {
  ExportValidationResult,
  IposCustomer,
  IposItem,
  IposItemCategory,
  IposMasterData,
  IposPriceList,
  IposReason,
  IposRecipe,
  IposStockNorm,
  IposSupplier,
  IposSupplierGroup,
  IposUnit,
  IposUnitConversion,
  IposWarehouse,
  MatchedInvoiceRow,
} from '../types';
import {
  normalizeText,
  normalizeWithoutAccents,
  parseVietnameseNumber,
  resolveStandardUnitCode,
  resolveStandardUnitName,
} from './vietnamese';

/**
 * Helper to read a File as an ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Helper to convert ArrayBuffer to Base64 string for storage
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper to convert Base64 string back to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Clean and normalize header text for keyword matching
 */
export function cleanHeaderText(val: string): string {
  return normalizeWithoutAccents(val)
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}\*\:\_\-\.\,\;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scan a sheet to detect header row and map columns with domain-specific keyword priorities
 */
export function findHeaderRowAndMap(
  sheet: XLSX.WorkSheet,
  domainHint?: string
): {
  headerRowIndex: number;
  colMap: Record<string, number>;
  dataStartRow: number;
} {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
  let headerRowIndex = -1;
  let colMap: Record<string, number> = {};

  // Scan up to top 30 rows for known headers
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 30); r++) {
    const currentMap: Record<string, number> = {};
    let matchedKeywords = 0;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      if (!cell || cell.v === undefined) continue;

      const rawVal = String(cell.v).trim();
      const norm = cleanHeaderText(rawVal);
      if (!norm) continue;

      // STT / Line
      if (norm === 'stt' || norm === 'no' || norm === 'tt' || norm === 'so tt' || norm === 'so thu tu') {
        currentMap['stt'] = c;
      }

      // 1. Supplier Code & Name
      else if (
        norm === 'ma nha cung cap' ||
        norm === 'ma ncc' ||
        norm === 'ma doi tuong' ||
        norm === 'ma dt' ||
        norm.includes('supplier code') ||
        norm.includes('vendor code') ||
        (domainHint === 'supplier' && (norm === 'ma' || norm === 'ma so' || norm === 'ma doi tuong'))
      ) {
        currentMap['supplier_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten nha cung cap' ||
        norm === 'ten ncc' ||
        norm === 'ten doi tuong' ||
        norm === 'ten dt' ||
        norm.includes('supplier name') ||
        norm.includes('vendor name') ||
        (domainHint === 'supplier' && (norm === 'ten' || norm === 'ten doi tuong' || norm.startsWith('ten ')))
      ) {
        currentMap['supplier_name'] = c;
        matchedKeywords++;
      } else if (norm === 'ma so thue' || norm === 'mst' || norm.includes('tax code') || norm.includes('ma so thue')) {
        currentMap['tax_code'] = c;
        matchedKeywords++;
      } else if (
        norm === 'dien thoai' ||
        norm === 'so dien thoai' ||
        norm === 'sdt' ||
        norm === 'so dt' ||
        norm.includes('phone') ||
        norm.includes('mobile')
      ) {
        currentMap['phone'] = c;
      } else if (norm === 'dia chi' || norm.includes('address') || norm.includes('dia chi')) {
        currentMap['address'] = c;
      } else if (
        norm.includes('nhom doi tuong') ||
        norm.includes('nhom ncc') ||
        norm.includes('nhom nha cung cap') ||
        norm.includes('supplier group')
      ) {
        currentMap['supplier_group'] = c;
      }

      // 2. Customer Code & Name
      else if (
        norm === 'ma khach hang' ||
        norm === 'ma kh' ||
        norm.includes('customer code') ||
        (domainHint === 'customer' && (norm === 'ma' || norm === 'ma so' || norm === 'ma khach hang' || norm === 'ma kh'))
      ) {
        currentMap['customer_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten khach hang' ||
        norm === 'ten kh' ||
        norm.includes('customer name') ||
        (domainHint === 'customer' && (norm === 'ten' || norm === 'ten khach hang' || norm === 'ten kh'))
      ) {
        currentMap['customer_name'] = c;
        matchedKeywords++;
      }

      // 3. Warehouse Code & Name
      else if (
        norm === 'ma kho' ||
        norm === 'ma kho hang' ||
        norm === 'ma dia diem' ||
        norm.includes('warehouse code') ||
        (domainHint === 'warehouse' && (norm === 'ma' || norm === 'ma so' || norm === 'ma kho'))
      ) {
        currentMap['warehouse_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten kho' ||
        norm === 'ten kho hang' ||
        norm === 'ten dia diem' ||
        norm.includes('warehouse name') ||
        (domainHint === 'warehouse' && (norm === 'ten' || norm === 'ten kho' || norm === 'ten kho hang'))
      ) {
        currentMap['warehouse_name'] = c;
        matchedKeywords++;
      } else if (
        norm.includes('ma chi nhanh') ||
        norm.includes('chi nhanh') ||
        norm.includes('branch code') ||
        norm.includes('branch')
      ) {
        currentMap['branch_id'] = c;
      }

      // 4. Category (Nhóm hàng)
      else if (
        norm === 'ma nhom' ||
        norm === 'ma nhom hang' ||
        norm === 'ma nhom hang hoa' ||
        norm === 'ma danh muc' ||
        norm.includes('category code') ||
        (domainHint === 'category' && (norm === 'ma' || norm === 'ma so' || norm === 'ma nhom'))
      ) {
        currentMap['category_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten nhom' ||
        norm === 'ten nhom hang' ||
        norm === 'ten nhom hang hoa' ||
        norm === 'nhom hang' ||
        norm === 'nhom hang hoa' ||
        norm === 'nhom mat hang' ||
        norm === 'nhom vat tu' ||
        norm === 'ten danh muc' ||
        norm.includes('category name') ||
        (domainHint === 'category' && (norm === 'ten' || norm === 'ten nhom' || norm === 'ten nhom hang'))
      ) {
        currentMap['category_name'] = c;
        matchedKeywords++;
      }

      // 5. Item Type (Loại hàng / Phân loại)
      else if (
        norm === 'ma loai' ||
        norm === 'ma loai hang' ||
        norm === 'ma phan loai' ||
        norm.includes('item type code') ||
        norm.includes('type code')
      ) {
        currentMap['item_type_id'] = c;
      } else if (
        norm === 'ten loai' ||
        norm === 'ten loai hang' ||
        norm === 'loai hang' ||
        norm === 'loai hang hoa' ||
        norm === 'phan loai' ||
        norm.includes('item type name') ||
        norm.includes('type name')
      ) {
        currentMap['item_type_name'] = c;
      }

      // 6. Unit & Unit Conversion
      else if (
        norm === 'ma don vi tinh quy doi' ||
        norm === 'ma dvt quy doi' ||
        norm === 'ma don vi quy doi' ||
        norm === 'ma dvt phu' ||
        norm === 'ma don vi tinh phu' ||
        norm === 'ma dvt nhap' ||
        norm === 'ma don vi tinh nhap' ||
        norm === 'ma dvt nguon' ||
        norm === 'dvt quy doi ma' ||
        (norm.includes('quy doi') && (norm.includes('ma') || norm.includes('code'))) ||
        norm.includes('conversion unit code')
      ) {
        currentMap['conv_unit_id'] = c;
        currentMap['source_unit_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten don vi tinh quy doi' ||
        norm === 'ten dvt quy doi' ||
        norm === 'ten don vi quy doi' ||
        norm === 'dvt quy doi' ||
        norm === 'don vi tinh quy doi' ||
        norm === 'don vi quy doi' ||
        norm === 'ten dvt phu' ||
        norm === 'dvt phu' ||
        norm === 'dvt nguon' ||
        norm === 'dvt nhap' ||
        norm === 'dvt mua' ||
        (norm.includes('quy doi') && (norm.includes('ten') || norm.includes('name') || norm.includes('dvt') || norm.includes('don vi')) && !norm.includes('ty le') && !norm.includes('ti le') && !norm.includes('he so') && !norm.includes('rate')) ||
        (norm.includes('dvt phu') && !norm.includes('ma'))
      ) {
        currentMap['conv_unit_name'] = c;
        currentMap['source_unit'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ty le quy doi' ||
        norm === 'ti le quy doi' ||
        norm === 'he so quy doi' ||
        norm === 'ty le qd' ||
        norm === 'ti le qd' ||
        norm === 'he so qd' ||
        norm === 'ty le' ||
        norm === 'ti le' ||
        norm === 'he so' ||
        norm.includes('conversion rate') ||
        (norm.includes('quy doi') && (norm.includes('ty le') || norm.includes('ti le') || norm.includes('he so') || norm.includes('rate')))
      ) {
        currentMap['conv_rate'] = c;
        currentMap['rate'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ma dvt chinh' ||
        norm === 'ma don vi tinh chinh' ||
        norm === 'ma don vi chinh' ||
        norm === 'ma dvt' ||
        norm === 'ma don vi tinh' ||
        norm === 'ma don vi' ||
        norm === 'dvt ma' ||
        norm === 'ma dvt goc' ||
        norm === 'ma dvt co ban' ||
        norm === 'ma dvt chuan' ||
        norm === 'unit id' ||
        norm === 'unit code' ||
        norm === 'uom code' ||
        norm.includes('unit code') ||
        norm.includes('uom code') ||
        (norm.includes('dvt chinh') && (norm.includes('ma') || norm.includes('code'))) ||
        (norm.includes('don vi tinh chinh') && (norm.includes('ma') || norm.includes('code'))) ||
        ((norm.startsWith('ma dvt') || norm.startsWith('ma don vi')) && !norm.includes('quy doi') && !norm.includes('phu') && !norm.includes('nhap') && !norm.includes('nguon') && !norm.includes('ncc') && !norm.includes('kho') && !norm.includes('khach')) ||
        (domainHint === 'unit' && (norm === 'ma' || norm === 'ma so' || norm === 'ma dvt'))
      ) {
        currentMap['unit_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten dvt chinh' ||
        norm === 'ten don vi tinh chinh' ||
        norm === 'ten don vi chinh' ||
        norm === 'dvt chinh' ||
        norm === 'don vi tinh chinh' ||
        norm === 'don vi chinh' ||
        norm === 'ten dvt' ||
        norm === 'ten don vi tinh' ||
        norm === 'ten don vi' ||
        norm === 'dvt' ||
        norm === 'don vi tinh' ||
        norm === 'don vi' ||
        norm === 'dvt goc' ||
        norm === 'ten dvt goc' ||
        norm === 'dvt co ban' ||
        norm === 'ten dvt co ban' ||
        norm === 'dvt dich' ||
        norm === 'dvt ton' ||
        norm === 'dvt co so' ||
        norm === 'dvt chuan' ||
        norm === 'unit' ||
        norm === 'uom' ||
        norm.includes('unit name') ||
        norm.includes('dvt chinh') ||
        norm.includes('don vi tinh chinh') ||
        ((norm.startsWith('ten dvt') || norm.startsWith('ten don vi')) && !norm.includes('quy doi') && !norm.includes('phu') && !norm.includes('nhap') && !norm.includes('nguon') && !norm.includes('ncc') && !norm.includes('kho') && !norm.includes('khach')) ||
        (domainHint === 'unit' && (norm === 'ten' || norm === 'ten dvt' || norm === 'ten don vi'))
      ) {
        currentMap['unit_name'] = c;
        matchedKeywords++;
      }

      // 7. Reasons
      else if (
        norm === 'ma ly do' ||
        norm.includes('reason code') ||
        (domainHint === 'reason' && (norm === 'ma' || norm === 'ma so' || norm === 'ma ly do'))
      ) {
        currentMap['reason_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten ly do' ||
        norm.includes('reason name') ||
        (domainHint === 'reason' && (norm === 'ten' || norm === 'ten ly do'))
      ) {
        currentMap['reason_name'] = c;
        matchedKeywords++;
      } else if (norm.includes('loai ly do') || norm.includes('phan loai')) {
        currentMap['reason_type'] = c;
      }

      // 8. Recipes / BOM
      else if (norm.includes('ma mon') || norm.includes('ma thanh pham')) {
        currentMap['parent_item_id'] = c;
        matchedKeywords++;
      } else if (norm.includes('ten mon') || norm.includes('ten thanh pham')) {
        currentMap['parent_item_name'] = c;
        matchedKeywords++;
      } else if (norm.includes('ma nguyen lieu') || norm.includes('ma nvl')) {
        currentMap['ingredient_item_id'] = c;
        matchedKeywords++;
      } else if (norm.includes('ten nguyen lieu') || norm.includes('ten nvl')) {
        currentMap['ingredient_item_name'] = c;
        matchedKeywords++;
      } else if (norm.includes('dinh luong') || norm.includes('so luong nvl') || norm.includes('dinh muc')) {
        currentMap['recipe_qty'] = c;
        matchedKeywords++;
      } else if (norm.includes('hao hut') || norm.includes('loss rate')) {
        currentMap['loss_rate'] = c;
      }

      // 9. Stock Norms
      else if (norm.includes('dinh muc toi thieu') || norm.includes('ton toi thieu') || norm.includes('min stock')) {
        currentMap['min_stock'] = c;
        matchedKeywords++;
      } else if (norm.includes('dinh muc toi da') || norm.includes('ton toi da') || norm.includes('max stock')) {
        currentMap['max_stock'] = c;
        matchedKeywords++;
      }

      // 10. General Item Code & Name
      else if (
        norm === 'ma hang' ||
        norm === 'ma hang hoa' ||
        norm === 'ma mat hang' ||
        norm === 'ma san pham' ||
        norm === 'ma sp' ||
        norm === 'ma vat tu' ||
        norm === 'ma nvl' ||
        norm === 'ma ccdc' ||
        norm === 'ma thiet bi' ||
        norm === 'sku' ||
        norm.startsWith('ma hang') ||
        norm.startsWith('ma sp') ||
        norm.startsWith('ma san pham') ||
        norm.startsWith('ma vat tu') ||
        norm.startsWith('ma mat hang') ||
        norm.includes('item code') ||
        norm.includes('product code') ||
        (domainHint === 'item' && (norm === 'ma' || norm === 'ma so' || norm === 'ma hang' || norm === 'ma sp' || norm.includes('ma hang')))
      ) {
        currentMap['item_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten hang' ||
        norm === 'ten hang hoa' ||
        norm === 'ten mat hang' ||
        norm === 'ten san pham' ||
        norm === 'ten sp' ||
        norm === 'ten vat tu' ||
        norm === 'ten nvl' ||
        norm === 'ten ccdc' ||
        norm === 'ten thiet bi' ||
        norm.startsWith('ten hang') ||
        norm.startsWith('ten sp') ||
        norm.startsWith('ten san pham') ||
        norm.startsWith('ten vat tu') ||
        norm.startsWith('ten mat hang') ||
        norm.includes('item name') ||
        norm.includes('product name') ||
        (domainHint === 'item' && (norm === 'ten' || norm === 'ten hang' || norm === 'ten mat hang' || norm === 'ten sp' || norm.includes('ten hang')))
      ) {
        currentMap['item_name'] = c;
        matchedKeywords++;
      } else if (norm === 'ma vach' || norm === 'barcode' || norm.includes('barcode')) {
        currentMap['barcode'] = c;
      } else if (norm === 'ma ke toan' || norm.includes('accounting code')) {
        currentMap['accounting_code'] = c;
      } else if (norm === 'trang thai' || norm === 'status' || norm === 'tinh trang') {
        currentMap['status'] = c;
      } else if (norm === 'mo ta' || norm === 'dien giai' || norm === 'ghi chu' || norm === 'description' || norm === 'note') {
        currentMap['note'] = c;
        currentMap['description'] = c;
      }

      // Category / Group fallback
      else if (
        norm.includes('nhom hang') ||
        norm.includes('nhom mat hang') ||
        norm.includes('nhom vat tu') ||
        norm.includes('danh muc') ||
        norm.includes('category')
      ) {
        currentMap['category'] = c;
      }

      // Quantity & Pricing
      else if (
        norm === 'so luong' ||
        norm === 'sl' ||
        norm === 'so luong mua' ||
        norm === 'so luong nhap' ||
        norm.includes('quantity') ||
        norm.includes('qty')
      ) {
        currentMap['quantity'] = c;
        matchedKeywords++;
      } else if (
        norm === 'gia von' ||
        norm === 'gia von chuan' ||
        norm === 'gia mua' ||
        norm === 'gia nhap' ||
        norm === 'don gia' ||
        norm === 'don gia mua' ||
        norm === 'don gia nhap' ||
        norm === 'gia chuan' ||
        norm.includes('cost price') ||
        norm.includes('price') ||
        (domainHint === 'item' && norm === 'gia')
      ) {
        currentMap['price'] = c;
        matchedKeywords++;
      } else if (
        norm === 'thanh tien' ||
        norm === 'tong tien' ||
        norm.includes('subtotal') ||
        norm.includes('amount') ||
        norm.includes('thanh tien')
      ) {
        currentMap['sub_total'] = c;
        matchedKeywords++;
      } else if (
        norm.includes('chiet khau (%)') ||
        norm.includes('ck (%)') ||
        norm.includes('ti le ck') ||
        norm.includes('ty le ck') ||
        norm === 'chiet khau' ||
        norm === 'ck'
      ) {
        currentMap['discount'] = c;
      } else if (norm.includes('tien chiet khau') || norm.includes('tien ck')) {
        currentMap['discount_amount'] = c;
      } else if (norm.includes('thue suat') || norm.includes('vat (%)') || norm === 'vat' || norm === 'thue vat' || norm === 'thue') {
        currentMap['vat'] = c;
      } else if (norm.includes('tien thue') || norm.includes('tien vat')) {
        currentMap['amount_vat'] = c;
      }
    }

    if (matchedKeywords >= 2 || (domainHint && matchedKeywords >= 1)) {
      headerRowIndex = r;
      colMap = currentMap;
      break;
    }
  }

  // General Unit fallback
  if (colMap['unit'] === undefined) {
    if (colMap['unit_name'] !== undefined) colMap['unit'] = colMap['unit_name'];
    else if (colMap['unit_id'] !== undefined) colMap['unit'] = colMap['unit_id'];
  }

  // Category fallback
  if (colMap['category'] === undefined) {
    if (colMap['category_name'] !== undefined) colMap['category'] = colMap['category_name'];
    else if (colMap['category_id'] !== undefined) colMap['category'] = colMap['category_id'];
    else if (colMap['item_type_name'] !== undefined) colMap['category'] = colMap['item_type_name'];
  }

  return {
    headerRowIndex,
    colMap,
    dataStartRow: headerRowIndex !== -1 ? headerRowIndex + 1 : 1,
  };
}

// -------------------------------------------------------------
// EXTRACTORS FOR EACH CATALOG
// -------------------------------------------------------------

export interface ExtractedItemsBundle {
  items: IposItem[];
  categories: IposItemCategory[];
  units: IposUnit[];
  conversions: IposUnitConversion[];
}

// 1. Items (Hàng hoá) with detailed bundle extraction
export function extractItemsDetailedFromSheet(sheet: XLSX.WorkSheet, sheetName: string): ExtractedItemsBundle {
  const normSheetName = normalizeWithoutAccents(sheetName).toLowerCase();
  
  // Only exclude purely descriptive/help sheets
  if (
    normSheetName.includes('huong dan') ||
    normSheetName.includes('readme') ||
    normSheetName.includes('help')
  ) {
    return { items: [], categories: [], units: [], conversions: [] };
  }

  const items: IposItem[] = [];
  const categoriesMap = new Map<string, IposItemCategory>();
  const unitsMap = new Map<string, IposUnit>();
  const conversions: IposUnitConversion[] = [];

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
  const { headerRowIndex, colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'item');

  if (headerRowIndex === -1 || (colMap['item_name'] === undefined && colMap['item_id'] === undefined)) {
    // Check fallback if no formal headers detected (e.g. data starts at row 0 or 1)
    const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
    if (json && json.length > 0) {
      // Try first row as header or raw 2-column format
      for (let r = 0; r < Math.min(json.length, 3); r++) {
        const row = json[r];
        if (Array.isArray(row) && row.length >= 2) {
          const col0 = cleanHeaderText(String(row[0] || ''));
          const col1 = cleanHeaderText(String(row[1] || ''));
          if (col0.includes('ma') && col1.includes('ten')) {
            // Found header row manually
            const manualColMap: Record<string, number> = { item_id: 0, item_name: 1 };
            for (let c = 2; c < row.length; c++) {
              const cn = cleanHeaderText(String(row[c] || ''));
              if (cn.includes('dvt') || cn.includes('don vi')) manualColMap['unit_name'] = c;
              if (cn.includes('nhom') || cn.includes('loai')) manualColMap['category_name'] = c;
              if (cn.includes('gia')) manualColMap['price'] = c;
            }
            return extractItemsWithExplicitMap(sheet, r + 1, manualColMap, sheetName);
          }
        }
      }
    }
    return { items: [], categories: [], units: [], conversions: [] };
  }

  return extractItemsWithExplicitMap(sheet, dataStartRow, colMap, sheetName);
}

function extractItemsWithExplicitMap(
  sheet: XLSX.WorkSheet,
  dataStartRow: number,
  colMap: Record<string, number>,
  sheetName: string
): ExtractedItemsBundle {
  const items: IposItem[] = [];
  const categoriesMap = new Map<string, IposItemCategory>();
  const unitsMap = new Map<string, IposUnit>();
  const conversions: IposUnitConversion[] = [];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const codeCell = colMap['item_id'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['item_id'] })] : null;
    const nameCell = colMap['item_name'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['item_name'] })] : null;
    const unitIdCell = colMap['unit_id'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['unit_id'] })] : null;
    const unitNameCell = colMap['unit_name'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['unit_name'] })] : null;
    const generalUnitCell = colMap['unit'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['unit'] })] : null;

    // Categories & Types
    const catNameCell = colMap['category_name'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['category_name'] })] : null;
    const catIdCell = colMap['category_id'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['category_id'] })] : null;
    const generalCatCell = colMap['category'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['category'] })] : null;
    const typeNameCell = colMap['item_type_name'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['item_type_name'] })] : null;
    const typeIdCell = colMap['item_type_id'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['item_type_id'] })] : null;

    // Conversions in item sheet
    const convUnitIdCell = colMap['conv_unit_id'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['conv_unit_id'] })] : null;
    const convUnitNameCell = colMap['conv_unit_name'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['conv_unit_name'] })] : null;
    const convRateCell = colMap['conv_rate'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['conv_rate'] })] : null;

    const priceCell = colMap['price'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['price'] })] : null;
    const barcodeCell = colMap['barcode'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['barcode'] })] : null;
    const statusCell = colMap['status'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['status'] })] : null;
    const noteCell = colMap['note'] !== undefined ? sheet[XLSX.utils.encode_cell({ r, c: colMap['note'] })] : null;

    const rawItemName = nameCell && nameCell.v !== undefined ? String(nameCell.v).trim() : '';
    const rawItemId = codeCell && codeCell.v !== undefined ? String(codeCell.v).trim() : '';

    if (!rawItemName && !rawItemId) continue;

    const cleanName = cleanHeaderText(rawItemName);
    const cleanId = cleanHeaderText(rawItemId);

    // Skip total rows or repeated headers
    if (
      cleanName.includes('tong cong') ||
      cleanName.includes('cong:') ||
      cleanName === 'ten hang' ||
      cleanName === 'ten hang hoa' ||
      cleanName === 'ten mat hang' ||
      cleanId === 'ma hang' ||
      cleanId === 'ma hang hoa'
    ) {
      continue;
    }

    // CRITICAL FIX: Detect and filter out system Item Types if inadvertently present
    // e.g. 0: Nguyên vật liệu, 1: Thành phẩm, 2: Bán thành phẩm, 3: Hàng bán thẳng, 4: Khác, 5: Ghi chú
    const isSystemTypeRow =
      (rawItemId === '0' || rawItemId === '1' || rawItemId === '2' || rawItemId === '3' || rawItemId === '4' || rawItemId === '5') &&
      (cleanName === 'nguyen vat lieu' ||
        cleanName === 'thanh pham' ||
        cleanName === 'ban thanh pham' ||
        cleanName === 'hang ban thang' ||
        cleanName.includes('cong cu dung cu') ||
        cleanName.includes('ghi chu'));

    if (isSystemTypeRow) {
      // Put into category mapping rather than items
      if (!categoriesMap.has(rawItemId)) {
        categoriesMap.set(rawItemId, {
          categoryId: `TYPE_${rawItemId}`,
          categoryName: rawItemName,
          description: `Phân loại iPOS (${rawItemId})`,
        });
      }
      continue;
    }

    const rawUnitId = unitIdCell && unitIdCell.v !== undefined ? String(unitIdCell.v).trim() : '';
    const rawUnitName = unitNameCell && unitNameCell.v !== undefined ? String(unitNameCell.v).trim() : '';
    const fallbackUnit = generalUnitCell && generalUnitCell.v !== undefined ? String(generalUnitCell.v).trim() : '';

    let finalUnitId = rawUnitId || (rawUnitName ? resolveStandardUnitCode(rawUnitName) : fallbackUnit ? resolveStandardUnitCode(fallbackUnit) : undefined);
    let finalUnitName = rawUnitName || (rawUnitId ? resolveStandardUnitName(rawUnitId) : fallbackUnit ? resolveStandardUnitName(fallbackUnit) : undefined);
    if (!finalUnitName && finalUnitId) {
      finalUnitName = resolveStandardUnitName(finalUnitId) || finalUnitId;
    }
    if (!finalUnitId && finalUnitName) {
      finalUnitId = resolveStandardUnitCode(finalUnitName) || finalUnitName.toUpperCase();
    }

    // Collect Unit into Units Map
    if (finalUnitId || finalUnitName) {
      const uKey = (finalUnitId || finalUnitName || '').toLowerCase();
      if (uKey && !unitsMap.has(uKey)) {
        unitsMap.set(uKey, {
          unitId: finalUnitId || resolveStandardUnitCode(finalUnitName) || 'UNIT',
          unitName: finalUnitName || resolveStandardUnitName(finalUnitId) || 'Đơn vị',
        });
      }
    }

    // Determine category
    let rawCatName = catNameCell && catNameCell.v !== undefined ? String(catNameCell.v).trim() : '';
    let rawCatId = catIdCell && catIdCell.v !== undefined ? String(catIdCell.v).trim() : '';
    const rawGeneralCat = generalCatCell && generalCatCell.v !== undefined ? String(generalCatCell.v).trim() : '';
    const rawTypeName = typeNameCell && typeNameCell.v !== undefined ? String(typeNameCell.v).trim() : '';
    const rawTypeId = typeIdCell && typeIdCell.v !== undefined ? String(typeIdCell.v).trim() : '';

    // Split category ID and name if combined like "3SGE9DBXDA4 ĐỒ DÙNG NHÀ HÀNG"
    if (!rawCatId && rawCatName) {
      const compositeMatch = rawCatName.match(/^([A-Za-z0-9_-]{5,})\s+(.+)$/);
      if (compositeMatch) {
        rawCatId = compositeMatch[1];
        rawCatName = compositeMatch[2].trim();
      }
    }

    const category = rawCatName || rawGeneralCat || rawTypeName || rawCatId || undefined;
    const categoryId = rawCatId || rawTypeId || undefined;

    // Collect Category into Categories Map
    if (category || categoryId) {
      const cKey = (categoryId || category || '').toLowerCase();
      if (cKey && !categoriesMap.has(cKey)) {
        categoriesMap.set(cKey, {
          categoryId: categoryId || category || `CAT_${categoriesMap.size + 1}`,
          categoryName: category || categoryId || 'Nhóm chung',
          description: rawTypeName ? `Phân loại: ${rawTypeName}` : undefined,
        });
      }
    }

    // Collect Conversion if present in items row (e.g. Columns O & P)
    const rawConvUnit =
      convUnitNameCell && convUnitNameCell.v !== undefined
        ? String(convUnitNameCell.v).trim()
        : convUnitIdCell && convUnitIdCell.v !== undefined
        ? String(convUnitIdCell.v).trim()
        : '';
    const rawConvRate = convRateCell ? parseVietnameseNumber(convRateCell.v) : 0;
    if (rawConvUnit && rawConvRate && rawConvRate > 0) {
      conversions.push({
        itemId: rawItemId || undefined,
        itemName: rawItemName || undefined,
        sourceUnitName: rawConvUnit,
        targetUnitName: finalUnitName || finalUnitId || 'Cái',
        conversionRate: rawConvRate,
      });
    }

    const costPrice = priceCell ? parseVietnameseNumber(priceCell.v) || undefined : undefined;
    const barcode = barcodeCell && barcodeCell.v !== undefined ? String(barcodeCell.v).trim() : undefined;
    
    // Status normalization: 1 -> Đang dùng, 0 -> Ngưng dùng
    let status = 'Đang dùng';
    if (statusCell && statusCell.v !== undefined) {
      const sVal = String(statusCell.v).trim();
      if (sVal === '1' || sVal.toLowerCase() === 'true' || cleanHeaderText(sVal) === 'dang dung' || cleanHeaderText(sVal) === 'hoat dong') {
        status = 'Đang dùng';
      } else if (sVal === '0' || sVal.toLowerCase() === 'false' || cleanHeaderText(sVal) === 'ngung dung' || cleanHeaderText(sVal) === 'tam dung') {
        status = 'Ngưng dùng';
      } else {
        status = sVal;
      }
    }

    const description = noteCell && noteCell.v !== undefined ? String(noteCell.v).trim() : undefined;

    items.push({
      itemId: rawItemId || `ITEM_${items.length + 1}`,
      itemName: rawItemName || rawItemId,
      unitId: finalUnitId || undefined,
      unitName: finalUnitName || undefined,
      category: category || undefined,
      categoryId: categoryId || undefined,
      costPrice,
      barcode,
      status,
      description,
      sourceSheet: sheetName,
    });
  }

  return {
    items,
    categories: Array.from(categoriesMap.values()),
    units: Array.from(unitsMap.values()),
    conversions,
  };
}

export function extractItemsFromSheet(sheet: XLSX.WorkSheet, sheetName: string): IposItem[] {
  return extractItemsDetailedFromSheet(sheet, sheetName).items;
}

// 2. Categories (Nhóm hàng hoá)
export function extractCategoriesFromSheet(sheet: XLSX.WorkSheet): IposItemCategory[] {
  const categories: IposItemCategory[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'category');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let description: string | undefined = undefined;

    if (colMap['category_id'] !== undefined && row[colMap['category_id']] !== undefined) {
      id = String(row[colMap['category_id']]).trim();
    }
    if (colMap['category_name'] !== undefined && row[colMap['category_name']] !== undefined) {
      name = String(row[colMap['category_name']]).trim();
    }
    if (colMap['note'] !== undefined && row[colMap['note']] !== undefined) {
      description = String(row[colMap['note']]).trim() || undefined;
    }

    if (!id && !name && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) description = String(row[2]).trim() || undefined;
    }

    if (name || id) {
      const clean = cleanHeaderText(name || id);
      if (clean.includes('ten nhom') || clean.includes('ma nhom') || clean.includes('tong cong')) continue;

      categories.push({
        categoryId: id || `NH_${categories.length + 1}`,
        categoryName: name || id,
        description,
      });
    }
  }

  return categories;
}

// 3. Units (Đơn vị tính)
export function extractUnitsFromSheet(sheet: XLSX.WorkSheet): IposUnit[] {
  const units: IposUnit[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'unit');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let description: string | undefined = undefined;

    if (colMap['unit_id'] !== undefined && row[colMap['unit_id']] !== undefined) {
      id = String(row[colMap['unit_id']]).trim();
    }
    if (colMap['unit_name'] !== undefined && row[colMap['unit_name']] !== undefined) {
      name = String(row[colMap['unit_name']]).trim();
    }
    if (colMap['note'] !== undefined && row[colMap['note']] !== undefined) {
      description = String(row[colMap['note']]).trim() || undefined;
    }

    if (!id && !name && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) description = String(row[2]).trim() || undefined;
    }

    if (name || id) {
      const clean = cleanHeaderText(name || id);
      if (clean.includes('ma don vi') || clean.includes('ten don vi') || clean.includes('tong cong')) continue;

      const finalId = id || resolveStandardUnitCode(name) || name.toUpperCase();
      const finalName = name || resolveStandardUnitName(id) || id;

      units.push({
        unitId: finalId,
        unitName: finalName,
        description,
      });
    }
  }

  return units;
}

// 4. Conversions (Quy đổi ĐVT)
export function extractConversionsFromSheet(sheet: XLSX.WorkSheet, isDedicatedFile = false): IposUnitConversion[] {
  const conversions: IposUnitConversion[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'conversion');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let srcUnit = '';
    let tgtUnit = '';
    let rate = 1;
    let itemId = '';
    let itemName = '';
    let description: string | undefined = undefined;

    if (colMap['source_unit'] !== undefined && row[colMap['source_unit']]) {
      srcUnit = String(row[colMap['source_unit']]).trim();
    }
    if (colMap['target_unit'] !== undefined && row[colMap['target_unit']]) {
      tgtUnit = String(row[colMap['target_unit']]).trim();
    }
    if (colMap['rate'] !== undefined && row[colMap['rate']]) {
      rate = parseVietnameseNumber(row[colMap['rate']]) || 1;
    }
    if (colMap['item_id'] !== undefined && row[colMap['item_id']]) {
      itemId = String(row[colMap['item_id']]).trim();
    }
    if (colMap['item_name'] !== undefined && row[colMap['item_name']]) {
      itemName = String(row[colMap['item_name']]).trim();
    }
    if (colMap['note'] !== undefined && row[colMap['note']]) {
      description = String(row[colMap['note']]).trim() || undefined;
    }

    if ((!srcUnit || !tgtUnit) && isDedicatedFile && row.length >= 3) {
      if (row.length >= 5) {
        itemId = String(row[0] || '').trim();
        itemName = String(row[1] || '').trim();
        srcUnit = String(row[2] || '').trim();
        tgtUnit = String(row[3] || '').trim();
        rate = parseVietnameseNumber(row[4]) || 1;
        if (row[5]) description = String(row[5]).trim() || undefined;
      } else {
        srcUnit = String(row[0] || '').trim();
        tgtUnit = String(row[1] || '').trim();
        rate = parseVietnameseNumber(row[2]) || 1;
      }
    }

    if (srcUnit && tgtUnit) {
      const cleanSrc = cleanHeaderText(srcUnit);
      const cleanTgt = cleanHeaderText(tgtUnit);
      if (
        cleanSrc.includes('dvt quy doi') ||
        cleanSrc.includes('dvt phu') ||
        cleanTgt.includes('dvt goc') ||
        cleanTgt.includes('dvt chinh') ||
        cleanSrc.includes('tong cong')
      ) {
        continue;
      }

      conversions.push({
        sourceUnitName: srcUnit,
        targetUnitName: tgtUnit,
        conversionRate: rate,
        itemId: itemId || undefined,
        itemName: itemName || undefined,
        description,
      });
    }
  }

  return conversions;
}

// 5. Recipes (Công thức chế biến / BOM)
export function extractRecipesFromSheet(sheet: XLSX.WorkSheet): IposRecipe[] {
  const recipes: IposRecipe[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'recipe');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let parentItemId = '';
    let parentItemName = '';
    let ingredientItemId = '';
    let ingredientItemName = '';
    let quantity = 1;
    let unitName = '';
    let lossRate: number | undefined = undefined;
    let note: string | undefined = undefined;

    if (colMap['parent_item_id'] !== undefined && row[colMap['parent_item_id']]) parentItemId = String(row[colMap['parent_item_id']]).trim();
    if (colMap['parent_item_name'] !== undefined && row[colMap['parent_item_name']]) parentItemName = String(row[colMap['parent_item_name']]).trim();
    if (colMap['ingredient_item_id'] !== undefined && row[colMap['ingredient_item_id']]) ingredientItemId = String(row[colMap['ingredient_item_id']]).trim();
    if (colMap['ingredient_item_name'] !== undefined && row[colMap['ingredient_item_name']]) ingredientItemName = String(row[colMap['ingredient_item_name']]).trim();
    if (colMap['recipe_qty'] !== undefined && row[colMap['recipe_qty']]) quantity = parseVietnameseNumber(row[colMap['recipe_qty']]) || 1;
    if (colMap['unit_name'] !== undefined && row[colMap['unit_name']]) unitName = String(row[colMap['unit_name']]).trim();
    if (colMap['loss_rate'] !== undefined && row[colMap['loss_rate']]) lossRate = parseVietnameseNumber(row[colMap['loss_rate']]) || undefined;
    if (colMap['note'] !== undefined && row[colMap['note']]) note = String(row[colMap['note']]).trim() || undefined;

    // Positional fallback
    if ((!parentItemName && !ingredientItemName) && row.length >= 4) {
      parentItemId = String(row[0] || '').trim();
      parentItemName = String(row[1] || '').trim();
      ingredientItemId = String(row[2] || '').trim();
      ingredientItemName = String(row[3] || '').trim();
      quantity = parseVietnameseNumber(row[4]) || 1;
      unitName = String(row[5] || '').trim();
      if (row[6]) lossRate = parseVietnameseNumber(row[6]) || undefined;
      if (row[7]) note = String(row[7]).trim() || undefined;
    }

    if (ingredientItemName || ingredientItemId) {
      recipes.push({
        parentItemId: parentItemId || parentItemName,
        parentItemName: parentItemName || parentItemId,
        ingredientItemId: ingredientItemId || ingredientItemName,
        ingredientItemName: ingredientItemName || ingredientItemId,
        quantity,
        unitName: unitName || 'g',
        lossRate,
        note,
      });
    }
  }

  return recipes;
}

// 6. Warehouses (Kho hàng)
export function extractWarehousesFromSheet(sheet: XLSX.WorkSheet, isDedicatedFile = false): IposWarehouse[] {
  const warehouses: IposWarehouse[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'warehouse');

  if (!isDedicatedFile && colMap['warehouse_name'] === undefined && colMap['warehouse_id'] === undefined) {
    return [];
  }

  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let branchId: string | undefined = undefined;
    let address: string | undefined = undefined;
    let phone: string | undefined = undefined;

    if (colMap['warehouse_id'] !== undefined && row[colMap['warehouse_id']] !== undefined) {
      id = String(row[colMap['warehouse_id']]).trim();
    }
    if (colMap['warehouse_name'] !== undefined && row[colMap['warehouse_name']] !== undefined) {
      name = String(row[colMap['warehouse_name']]).trim();
    }
    if (colMap['branch_id'] !== undefined && row[colMap['branch_id']] !== undefined) {
      branchId = String(row[colMap['branch_id']]).trim() || undefined;
    }
    if (colMap['address'] !== undefined && row[colMap['address']] !== undefined) {
      address = String(row[colMap['address']]).trim() || undefined;
    }
    if (colMap['phone'] !== undefined && row[colMap['phone']] !== undefined) {
      phone = String(row[colMap['phone']]).trim() || undefined;
    }

    if (!name && isDedicatedFile && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) branchId = String(row[2]).trim() || undefined;
      if (row[3]) address = String(row[3]).trim() || undefined;
      if (row[4]) phone = String(row[4]).trim() || undefined;
    }

    if (!name && id) name = id;

    if (name) {
      const clean = cleanHeaderText(name);
      const cleanId = cleanHeaderText(id);
      if (
        clean.includes('ten kho') ||
        clean.includes('tong cong') ||
        clean.includes('danh sach kho') ||
        cleanId.includes('ma kho')
      ) {
        continue;
      }

      warehouses.push({
        warehouseId: id || `KHO_${warehouses.length + 1}`,
        warehouseName: name,
        branchId,
        address,
        phone,
      });
    }
  }

  return warehouses;
}

// 7. Customers (Khách hàng)
export function extractCustomersFromSheet(sheet: XLSX.WorkSheet): IposCustomer[] {
  const customers: IposCustomer[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'customer');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let phone: string | undefined = undefined;
    let address: string | undefined = undefined;
    let taxCode: string | undefined = undefined;
    let customerGroup: string | undefined = undefined;

    if (colMap['customer_id'] !== undefined && row[colMap['customer_id']] !== undefined) {
      id = String(row[colMap['customer_id']]).trim();
    }
    if (colMap['customer_name'] !== undefined && row[colMap['customer_name']] !== undefined) {
      name = String(row[colMap['customer_name']]).trim();
    }
    if (colMap['phone'] !== undefined && row[colMap['phone']] !== undefined) {
      phone = String(row[colMap['phone']]).trim() || undefined;
    }
    if (colMap['address'] !== undefined && row[colMap['address']] !== undefined) {
      address = String(row[colMap['address']]).trim() || undefined;
    }
    if (colMap['tax_code'] !== undefined && row[colMap['tax_code']] !== undefined) {
      taxCode = String(row[colMap['tax_code']]).trim() || undefined;
    }

    if (!name && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) phone = String(row[2]).trim() || undefined;
      if (row[3]) address = String(row[3]).trim() || undefined;
      if (row[4]) taxCode = String(row[4]).trim() || undefined;
    }

    if (name || id) {
      const clean = cleanHeaderText(name || id);
      if (clean.includes('ten khach') || clean.includes('ma khach') || clean.includes('tong cong')) continue;

      customers.push({
        customerId: id || `KH_${customers.length + 1}`,
        customerName: name || id,
        phone,
        address,
        taxCode,
        customerGroup,
      });
    }
  }

  return customers;
}

// 8. Suppliers (Nhà cung cấp)
export function extractSuppliersFromSheet(sheet: XLSX.WorkSheet, isDedicatedFile = false): IposSupplier[] {
  const suppliers: IposSupplier[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'supplier');

  if (!isDedicatedFile && colMap['supplier_name'] === undefined && colMap['supplier_id'] === undefined) {
    return [];
  }

  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let taxCode: string | undefined = undefined;
    let phone: string | undefined = undefined;
    let address: string | undefined = undefined;
    let supplierGroup: string | undefined = undefined;

    if (colMap['supplier_id'] !== undefined && row[colMap['supplier_id']] !== undefined) {
      id = String(row[colMap['supplier_id']]).trim();
    }
    if (colMap['supplier_name'] !== undefined && row[colMap['supplier_name']] !== undefined) {
      name = String(row[colMap['supplier_name']]).trim();
    }
    if (colMap['tax_code'] !== undefined && row[colMap['tax_code']] !== undefined) {
      taxCode = String(row[colMap['tax_code']]).trim() || undefined;
    }
    if (colMap['phone'] !== undefined && row[colMap['phone']] !== undefined) {
      phone = String(row[colMap['phone']]).trim() || undefined;
    }
    if (colMap['address'] !== undefined && row[colMap['address']] !== undefined) {
      address = String(row[colMap['address']]).trim() || undefined;
    }
    if (colMap['category'] !== undefined && row[colMap['category']] !== undefined) {
      supplierGroup = String(row[colMap['category']]).trim() || undefined;
    }

    if (!name && isDedicatedFile && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) address = String(row[2]).trim() || undefined;
      if (row[3]) phone = String(row[3]).trim() || undefined;
      if (row[4]) taxCode = String(row[4]).trim() || undefined;
    }

    if (!name && id) name = id;

    if (name) {
      const clean = cleanHeaderText(name);
      const cleanId = cleanHeaderText(id);
      if (
        clean.includes('ten nha cung cap') ||
        clean.includes('ten ncc') ||
        clean.includes('tong cong') ||
        cleanId.includes('ma ncc')
      ) {
        continue;
      }

      suppliers.push({
        supplierId: id || `NCC_${suppliers.length + 1}`,
        supplierName: name,
        taxCode,
        phone,
        address,
        supplierGroup,
      });
    }
  }

  return suppliers;
}

// 9. Reasons (Lý do)
export function extractReasonsFromSheet(sheet: XLSX.WorkSheet): IposReason[] {
  const reasons: IposReason[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'reason');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let type: any = 'NHAP';
    let description: string | undefined = undefined;

    if (colMap['reason_id'] !== undefined && row[colMap['reason_id']] !== undefined) {
      id = String(row[colMap['reason_id']]).trim();
    }
    if (colMap['reason_name'] !== undefined && row[colMap['reason_name']] !== undefined) {
      name = String(row[colMap['reason_name']]).trim();
    }
    if (colMap['reason_type'] !== undefined && row[colMap['reason_type']] !== undefined) {
      const rawType = String(row[colMap['reason_type']]).toUpperCase();
      if (rawType.includes('XUAT')) type = 'XUAT';
      else if (rawType.includes('DIEU') || rawType.includes('KIEM')) type = 'DIEU_CHINH';
      else type = 'NHAP';
    }
    if (colMap['note'] !== undefined && row[colMap['note']] !== undefined) {
      description = String(row[colMap['note']]).trim() || undefined;
    }

    if (!name && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) {
        const rawType = String(row[2]).toUpperCase();
        if (rawType.includes('XUAT')) type = 'XUAT';
        else if (rawType.includes('DIEU')) type = 'DIEU_CHINH';
      }
      if (row[3]) description = String(row[3]).trim() || undefined;
    }

    if (name || id) {
      const clean = cleanHeaderText(name || id);
      if (clean.includes('ten ly do') || clean.includes('ma ly do') || clean.includes('tong cong')) continue;

      reasons.push({
        reasonId: id || `LD_${reasons.length + 1}`,
        reasonName: name || id,
        reasonType: type,
        description,
        isDefault: id === 'NM' || name.toLowerCase().includes('mua hang'),
      });
    }
  }

  return reasons;
}

// 10. Supplier Groups (Nhóm nhà cung cấp)
export function extractSupplierGroupsFromSheet(sheet: XLSX.WorkSheet): IposSupplierGroup[] {
  const groups: IposSupplierGroup[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'supplier_group');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let id = '';
    let name = '';
    let description: string | undefined = undefined;

    if (colMap['supplier_group_id'] !== undefined && row[colMap['supplier_group_id']] !== undefined) {
      id = String(row[colMap['supplier_group_id']]).trim();
    }
    if (colMap['supplier_group_name'] !== undefined && row[colMap['supplier_group_name']] !== undefined) {
      name = String(row[colMap['supplier_group_name']]).trim();
    }
    if (colMap['note'] !== undefined && row[colMap['note']] !== undefined) {
      description = String(row[colMap['note']]).trim() || undefined;
    }

    if (!name && row.length >= 2) {
      id = String(row[0] || '').trim();
      name = String(row[1] || '').trim();
      if (row[2]) description = String(row[2]).trim() || undefined;
    }

    if (name || id) {
      const clean = cleanHeaderText(name || id);
      if (clean.includes('ten nhom') || clean.includes('ma nhom') || clean.includes('tong cong')) continue;
      groups.push({
        groupId: id || `GNCC_${groups.length + 1}`,
        groupName: name || id,
        supplierGroupId: id || `GNCC_${groups.length + 1}`,
        supplierGroupName: name || id,
        description,
      });
    }
  }
  return groups;
}

// 11. Price Lists (Bảng giá mua)
export function extractPriceListsFromSheet(sheet: XLSX.WorkSheet): IposPriceList[] {
  const prices: IposPriceList[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'price_list');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let priceListId = 'BG_MUA';
    let priceListName = 'Bảng giá mua';
    let itemId = '';
    let itemName = '';
    let unitName: string | undefined = undefined;
    let price = 0;
    let effectiveDate: string | undefined = undefined;

    if (colMap['item_id'] !== undefined && row[colMap['item_id']] !== undefined) {
      itemId = String(row[colMap['item_id']]).trim();
    }
    if (colMap['item_name'] !== undefined && row[colMap['item_name']] !== undefined) {
      itemName = String(row[colMap['item_name']]).trim();
    }
    if (colMap['unit_name'] !== undefined && row[colMap['unit_name']] !== undefined) {
      unitName = String(row[colMap['unit_name']]).trim() || undefined;
    }
    if (colMap['price'] !== undefined && row[colMap['price']] !== undefined) {
      price = Number(row[colMap['price']]) || 0;
    }
    if (colMap['date'] !== undefined && row[colMap['date']] !== undefined) {
      effectiveDate = String(row[colMap['date']]).trim() || undefined;
    }

    if (!itemName && row.length >= 2) {
      itemId = String(row[0] || '').trim();
      itemName = String(row[1] || '').trim();
      if (row[2]) unitName = String(row[2]).trim() || undefined;
      if (row[3]) price = Number(row[3]) || 0;
    }

    if (itemName || itemId) {
      const clean = cleanHeaderText(itemName || itemId);
      if (clean.includes('ten hang') || clean.includes('ma hang') || clean.includes('tong cong')) continue;
      prices.push({
        priceListId,
        priceListName,
        itemId: itemId || `SP_${prices.length + 1}`,
        itemName: itemName || itemId,
        unitName,
        price,
        effectiveDate,
      });
    }
  }
  return prices;
}

// 12. Stock Norms (Định mức tồn kho)
export function extractStockNormsFromSheet(sheet: XLSX.WorkSheet): IposStockNorm[] {
  const norms: IposStockNorm[] = [];
  const { colMap, dataStartRow } = findHeaderRowAndMap(sheet, 'stock_norm');
  const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  for (let r = dataStartRow; r < json.length; r++) {
    const row = json[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let itemId = '';
    let itemName = '';
    let warehouseId = 'KHO_CHINH';
    let minStock = 0;
    let maxStock = 0;
    let unitName: string | undefined = undefined;

    if (colMap['item_id'] !== undefined && row[colMap['item_id']] !== undefined) {
      itemId = String(row[colMap['item_id']]).trim();
    }
    if (colMap['item_name'] !== undefined && row[colMap['item_name']] !== undefined) {
      itemName = String(row[colMap['item_name']]).trim();
    }
    if (colMap['warehouse_id'] !== undefined && row[colMap['warehouse_id']] !== undefined) {
      warehouseId = String(row[colMap['warehouse_id']]).trim();
    }
    if (colMap['quantity'] !== undefined && row[colMap['quantity']] !== undefined) {
      minStock = Number(row[colMap['quantity']]) || 0;
    }
    if (colMap['unit_name'] !== undefined && row[colMap['unit_name']] !== undefined) {
      unitName = String(row[colMap['unit_name']]).trim() || undefined;
    }

    if (!itemName && row.length >= 2) {
      itemId = String(row[0] || '').trim();
      itemName = String(row[1] || '').trim();
      if (row[2]) warehouseId = String(row[2]).trim() || 'KHO_CHINH';
      if (row[3]) minStock = Number(row[3]) || 0;
      if (row[4]) maxStock = Number(row[4]) || minStock * 2;
    }

    if (itemName || itemId) {
      const clean = cleanHeaderText(itemName || itemId);
      if (clean.includes('ten hang') || clean.includes('ma hang') || clean.includes('tong cong')) continue;
      norms.push({
        itemId: itemId || `SP_${norms.length + 1}`,
        itemName: itemName || itemId,
        warehouseId,
        minStock,
        maxStock: maxStock || minStock * 2,
        unitName,
      });
    }
  }
  return norms;
}

// -------------------------------------------------------------
// DEDICATED PARSERS PER FILE / TAB
// -------------------------------------------------------------

export async function parseItemsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingItems?: IposItem[]
): Promise<{
  items: IposItem[];
  categories: IposItemCategory[];
  units: IposUnit[];
  conversions: IposUnitConversion[];
  info: string;
}> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const candidateItems: IposItem[] = [];
  const candidateCategories: IposItemCategory[] = [];
  const candidateUnits: IposUnit[] = [];
  const candidateConversions: IposUnitConversion[] = [];

  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const bundle = extractItemsDetailedFromSheet(workbook.Sheets[sheetName], `${file.name} -> ${sheetName}`);
    if (bundle.items.length > 0) {
      candidateItems.push(...bundle.items);
      candidateCategories.push(...bundle.categories);
      candidateUnits.push(...bundle.units);
      candidateConversions.push(...bundle.conversions);
    }
  }

  const mergedMap = new Map<string, IposItem>();
  if (mode === 'merge' && existingItems) {
    for (const it of existingItems) {
      if (it.itemId) mergedMap.set(it.itemId, { ...it });
    }
  }

  for (const it of candidateItems) {
    if (!it.itemId) continue;
    mergedMap.set(it.itemId, { ...(mergedMap.get(it.itemId) || {}), ...it });
  }

  const finalItems = Array.from(mergedMap.values());
  return {
    items: finalItems,
    categories: candidateCategories,
    units: candidateUnits,
    conversions: candidateConversions,
    info: `${file.name} (${finalItems.length} mặt hàng)`,
  };
}

export async function parseIposMasterDataFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingMasterData?: IposMasterData
): Promise<{
  masterData: IposMasterData;
  itemCount: number;
  categoryCount: number;
  unitCount: number;
  conversionCount: number;
}> {
  const mode = options?.mode || 'replace';
  const res = await parseItemsFromExcelFile(file, options, existingMasterData?.items);

  const base: IposMasterData = existingMasterData || {
    items: [],
    suppliers: [],
    warehouses: [],
    unitConversions: [],
    categories: [],
    units: [],
  };

  const updated: IposMasterData = {
    ...base,
    items: res.items,
    catalogSourceInfo: res.info,
  };

  // Merge extracted categories
  if (res.categories.length > 0) {
    const catMap = new Map<string, IposItemCategory>();
    if (mode === 'merge' && base.categories) {
      base.categories.forEach((c) => catMap.set(c.categoryId, c));
    }
    res.categories.forEach((c) => catMap.set(c.categoryId, { ...(catMap.get(c.categoryId) || {}), ...c }));
    updated.categories = Array.from(catMap.values());
  }

  // Merge extracted units
  if (res.units.length > 0) {
    const unitMap = new Map<string, IposUnit>();
    if (mode === 'merge' && base.units) {
      base.units.forEach((u) => unitMap.set(u.unitId.toLowerCase(), u));
    }
    res.units.forEach((u) =>
      unitMap.set(u.unitId.toLowerCase(), { ...(unitMap.get(u.unitId.toLowerCase()) || {}), ...u })
    );
    updated.units = Array.from(unitMap.values());
  }

  // Merge extracted conversions
  if (res.conversions.length > 0) {
    if (mode === 'merge' && base.unitConversions) {
      updated.unitConversions = [...base.unitConversions, ...res.conversions];
    } else {
      updated.unitConversions = res.conversions;
    }
  }

  return {
    masterData: updated,
    itemCount: updated.items.length,
    categoryCount: updated.categories?.length || 0,
    unitCount: updated.units?.length || 0,
    conversionCount: updated.unitConversions?.length || 0,
  };
}

export async function parseCategoriesFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingCategories?: IposItemCategory[]
): Promise<{ categories: IposItemCategory[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposItemCategory[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const cats = extractCategoriesFromSheet(workbook.Sheets[sheetName]);
    if (cats.length > 0) parsed.push(...cats);
  }

  const mergedMap = new Map<string, IposItemCategory>();
  if (mode === 'merge' && existingCategories) {
    for (const c of existingCategories) mergedMap.set(c.categoryId, c);
  }
  for (const c of parsed) mergedMap.set(c.categoryId, { ...(mergedMap.get(c.categoryId) || {}), ...c });

  const result = Array.from(mergedMap.values());
  return { categories: result, count: result.length };
}

export async function parseUnitsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingUnits?: IposUnit[]
): Promise<{ units: IposUnit[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposUnit[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const u = extractUnitsFromSheet(workbook.Sheets[sheetName]);
    if (u.length > 0) parsed.push(...u);
  }

  const mergedMap = new Map<string, IposUnit>();
  if (mode === 'merge' && existingUnits) {
    for (const u of existingUnits) mergedMap.set(u.unitId.toLowerCase(), u);
  }
  for (const u of parsed) mergedMap.set(u.unitId.toLowerCase(), { ...(mergedMap.get(u.unitId.toLowerCase()) || {}), ...u });

  const result = Array.from(mergedMap.values());
  return { units: result, count: result.length };
}

export async function parseConversionsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingConversions?: IposUnitConversion[]
): Promise<{ conversions: IposUnitConversion[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposUnitConversion[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const convs = extractConversionsFromSheet(workbook.Sheets[sheetName], true);
    if (convs.length > 0) parsed.push(...convs);
  }

  const result = mode === 'merge' && existingConversions ? [...existingConversions, ...parsed] : parsed;
  return { conversions: result, count: result.length };
}

export async function parseRecipesFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingRecipes?: IposRecipe[]
): Promise<{ recipes: IposRecipe[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposRecipe[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const recs = extractRecipesFromSheet(workbook.Sheets[sheetName]);
    if (recs.length > 0) parsed.push(...recs);
  }

  const result = mode === 'merge' && existingRecipes ? [...existingRecipes, ...parsed] : parsed;
  return { recipes: result, count: result.length };
}

export async function parseWarehousesFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingWarehouses?: IposWarehouse[]
): Promise<{ warehouses: IposWarehouse[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposWarehouse[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const whs = extractWarehousesFromSheet(workbook.Sheets[sheetName], true);
    if (whs.length > 0) parsed.push(...whs);
  }

  const mergedMap = new Map<string, IposWarehouse>();
  if (mode === 'merge' && existingWarehouses) {
    for (const w of existingWarehouses) mergedMap.set(w.warehouseId, w);
  }
  for (const w of parsed) mergedMap.set(w.warehouseId, { ...(mergedMap.get(w.warehouseId) || {}), ...w });

  const result = Array.from(mergedMap.values());
  return { warehouses: result, count: result.length };
}

export async function parseCustomersFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingCustomers?: IposCustomer[]
): Promise<{ customers: IposCustomer[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposCustomer[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const custs = extractCustomersFromSheet(workbook.Sheets[sheetName]);
    if (custs.length > 0) parsed.push(...custs);
  }

  const mergedMap = new Map<string, IposCustomer>();
  if (mode === 'merge' && existingCustomers) {
    for (const c of existingCustomers) mergedMap.set(c.customerId, c);
  }
  for (const c of parsed) mergedMap.set(c.customerId, { ...(mergedMap.get(c.customerId) || {}), ...c });

  const result = Array.from(mergedMap.values());
  return { customers: result, count: result.length };
}

export async function parseSuppliersFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingSuppliers?: IposSupplier[]
): Promise<{ suppliers: IposSupplier[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposSupplier[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const supps = extractSuppliersFromSheet(workbook.Sheets[sheetName], true);
    if (supps.length > 0) parsed.push(...supps);
  }

  const mergedMap = new Map<string, IposSupplier>();
  if (mode === 'merge' && existingSuppliers) {
    for (const s of existingSuppliers) mergedMap.set(s.supplierId, s);
  }
  for (const s of parsed) mergedMap.set(s.supplierId, { ...(mergedMap.get(s.supplierId) || {}), ...s });

  const result = Array.from(mergedMap.values());
  return { suppliers: result, count: result.length };
}

export async function parseSupplierGroupsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingSupplierGroups?: IposSupplierGroup[]
): Promise<{ supplierGroups: IposSupplierGroup[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposSupplierGroup[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const groups = extractSupplierGroupsFromSheet(workbook.Sheets[sheetName]);
    if (groups.length > 0) parsed.push(...groups);
  }

  const mergedMap = new Map<string, IposSupplierGroup>();
  if (mode === 'merge' && existingSupplierGroups) {
    for (const g of existingSupplierGroups) {
      const key = g.groupId || g.supplierGroupId || '';
      if (key) mergedMap.set(key, g);
    }
  }
  for (const g of parsed) {
    const key = g.groupId || g.supplierGroupId || '';
    if (key) mergedMap.set(key, { ...(mergedMap.get(key) || {}), ...g });
  }

  const result = Array.from(mergedMap.values());
  return { supplierGroups: result, count: result.length };
}

export async function parsePriceListsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingPriceLists?: IposPriceList[]
): Promise<{ priceLists: IposPriceList[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposPriceList[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const prices = extractPriceListsFromSheet(workbook.Sheets[sheetName]);
    if (prices.length > 0) parsed.push(...prices);
  }

  const result = mode === 'merge' && existingPriceLists ? [...existingPriceLists, ...parsed] : parsed;
  return { priceLists: result, count: result.length };
}

export async function parseStockNormsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingStockNorms?: IposStockNorm[]
): Promise<{ stockNorms: IposStockNorm[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposStockNorm[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const norms = extractStockNormsFromSheet(workbook.Sheets[sheetName]);
    if (norms.length > 0) parsed.push(...norms);
  }

  const result = mode === 'merge' && existingStockNorms ? [...existingStockNorms, ...parsed] : parsed;
  return { stockNorms: result, count: result.length };
}

export async function parseReasonsFromExcelFile(
  file: File,
  options?: { mode?: 'replace' | 'merge' },
  existingReasons?: IposReason[]
): Promise<{ reasons: IposReason[]; count: number }> {
  const mode = options?.mode || 'replace';
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

  const parsed: IposReason[] = [];
  for (const sheetName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sheetName).toLowerCase();
    if (norm.includes('huong dan') || norm.includes('readme')) continue;
    const r = extractReasonsFromSheet(workbook.Sheets[sheetName]);
    if (r.length > 0) parsed.push(...r);
  }

  const mergedMap = new Map<string, IposReason>();
  if (mode === 'merge' && existingReasons) {
    for (const r of existingReasons) mergedMap.set(r.reasonId, r);
  }
  for (const r of parsed) mergedMap.set(r.reasonId, { ...(mergedMap.get(r.reasonId) || {}), ...r });

  const result = Array.from(mergedMap.values());
  return { reasons: result, count: result.length };
}

// -------------------------------------------------------------
// MULTI-FILE SMART PARSER & ROUTER
// -------------------------------------------------------------

export async function parseMultipleIposExcelFiles(
  files: File[],
  existingData?: IposMasterData | null,
  options?: { mode?: 'replace' | 'merge' }
): Promise<IposMasterData> {
  const mode = options?.mode || 'replace';

  const masterData: IposMasterData = {
    items: mode === 'merge' && existingData?.items ? [...existingData.items] : [],
    categories: mode === 'merge' && existingData?.categories ? [...existingData.categories] : [],
    units: mode === 'merge' && existingData?.units ? [...existingData.units] : [],
    unitConversions: mode === 'merge' && existingData?.unitConversions ? [...existingData.unitConversions] : [],
    recipes: mode === 'merge' && existingData?.recipes ? [...existingData.recipes] : [],
    warehouses: mode === 'merge' && existingData?.warehouses ? [...existingData.warehouses] : [],
    customers: mode === 'merge' && existingData?.customers ? [...existingData.customers] : [],
    suppliers: mode === 'merge' && existingData?.suppliers ? [...existingData.suppliers] : [],
    supplierGroups: mode === 'merge' && existingData?.supplierGroups ? [...existingData.supplierGroups] : [],
    priceLists: mode === 'merge' && existingData?.priceLists ? [...existingData.priceLists] : [],
    reasons: mode === 'merge' && existingData?.reasons ? [...existingData.reasons] : [],
    stockNorms: mode === 'merge' && existingData?.stockNorms ? [...existingData.stockNorms] : [],
    templateWorkbookBase64: existingData?.templateWorkbookBase64,
    templateFileName: existingData?.templateFileName,
    catalogSourceInfo: existingData?.catalogSourceInfo,
  };

  const parsedItems: IposItem[] = [];
  const parsedCategories: IposItemCategory[] = [];
  const parsedUnits: IposUnit[] = [];
  const parsedConversions: IposUnitConversion[] = [];
  const parsedRecipes: IposRecipe[] = [];
  const parsedWarehouses: IposWarehouse[] = [];
  const parsedCustomers: IposCustomer[] = [];
  const parsedSuppliers: IposSupplier[] = [];
  const parsedReasons: IposReason[] = [];

  for (const file of files) {
    const fileName = file.name;
    const normFileName = normalizeWithoutAccents(fileName).toLowerCase();
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true });

    // Check if template
    if (
      normFileName.includes('nhap mau') ||
      normFileName.includes('nhap mua') ||
      normFileName.includes('mau nhap') ||
      normFileName.includes('template')
    ) {
      masterData.templateWorkbookBase64 = arrayBufferToBase64(arrayBuffer);
      masterData.templateFileName = fileName;
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const normSheet = normalizeWithoutAccents(sheetName).toLowerCase();
      if (normSheet.includes('huong dan') || normSheet.includes('readme')) continue;

      // 1. Try item extraction first as items often contain categories, units & conversions
      const bundle = extractItemsDetailedFromSheet(sheet, `${fileName} -> ${sheetName}`);
      if (bundle.items.length > 0) {
        parsedItems.push(...bundle.items);
        parsedCategories.push(...bundle.categories);
        parsedUnits.push(...bundle.units);
        parsedConversions.push(...bundle.conversions);
        continue;
      }

      // 2. If not an items sheet, classify by file & sheet content/name
      if (normFileName.includes('nhom hang') || normSheet.includes('nhom hang') || normSheet.includes('loai hang') || normSheet.includes('category')) {
        const cats = extractCategoriesFromSheet(sheet);
        if (cats.length > 0) parsedCategories.push(...cats);
      } else if (normFileName.includes('don vi tinh') || normSheet.includes('don vi tinh') || normFileName.includes('dvt') || normSheet.includes('dvt') || normSheet.includes('unit')) {
        const u = extractUnitsFromSheet(sheet);
        if (u.length > 0) parsedUnits.push(...u);
      } else if (normFileName.includes('quy doi') || normSheet.includes('quy doi') || normSheet.includes('conversion')) {
        const c = extractConversionsFromSheet(sheet, true);
        if (c.length > 0) parsedConversions.push(...c);
      } else if (normFileName.includes('cong thuc') || normSheet.includes('cong thuc') || normFileName.includes('bom') || normSheet.includes('recipe')) {
        const r = extractRecipesFromSheet(sheet);
        if (r.length > 0) parsedRecipes.push(...r);
      } else if (normFileName.includes('kho') || normSheet.includes('kho') || normSheet.includes('warehouse')) {
        const w = extractWarehousesFromSheet(sheet, true);
        if (w.length > 0) parsedWarehouses.push(...w);
      } else if (normFileName.includes('khach hang') || normSheet.includes('khach hang') || normSheet.includes('customer')) {
        const cust = extractCustomersFromSheet(sheet);
        if (cust.length > 0) parsedCustomers.push(...cust);
      } else if (normFileName.includes('nha cung cap') || normFileName.includes('ncc') || normSheet.includes('nha cung cap') || normSheet.includes('ncc') || normSheet.includes('supplier')) {
        const s = extractSuppliersFromSheet(sheet, true);
        if (s.length > 0) parsedSuppliers.push(...s);
      } else if (normFileName.includes('ly do') || normSheet.includes('ly do') || normSheet.includes('reason')) {
        const r = extractReasonsFromSheet(sheet);
        if (r.length > 0) parsedReasons.push(...r);
      } else {
        // Fallback checks
        const cats = extractCategoriesFromSheet(sheet);
        if (cats.length > 0) parsedCategories.push(...cats);
        const supps = extractSuppliersFromSheet(sheet);
        if (supps.length > 0) parsedSuppliers.push(...supps);
        const whs = extractWarehousesFromSheet(sheet);
        if (whs.length > 0) parsedWarehouses.push(...whs);
      }
    }
  }

  // Merge items
  if (parsedItems.length > 0) {
    const itemMap = new Map<string, IposItem>();
    if (mode === 'merge' && masterData.items) masterData.items.forEach((i) => itemMap.set(i.itemId, i));
    parsedItems.forEach((i) => itemMap.set(i.itemId, { ...(itemMap.get(i.itemId) || {}), ...i }));
    masterData.items = Array.from(itemMap.values());
  }

  // Merge categories
  if (parsedCategories.length > 0) {
    const catMap = new Map<string, IposItemCategory>();
    if (mode === 'merge' && masterData.categories) masterData.categories.forEach((c) => catMap.set(c.categoryId, c));
    parsedCategories.forEach((c) => catMap.set(c.categoryId, { ...(catMap.get(c.categoryId) || {}), ...c }));
    masterData.categories = Array.from(catMap.values());
  }

  // Merge units
  if (parsedUnits.length > 0) {
    const unitMap = new Map<string, IposUnit>();
    if (mode === 'merge' && masterData.units) masterData.units.forEach((u) => unitMap.set(u.unitId.toLowerCase(), u));
    parsedUnits.forEach((u) => unitMap.set(u.unitId.toLowerCase(), { ...(unitMap.get(u.unitId.toLowerCase()) || {}), ...u }));
    masterData.units = Array.from(unitMap.values());
  }

  // Merge conversions
  if (parsedConversions.length > 0) {
    masterData.unitConversions = mode === 'merge' ? [...(masterData.unitConversions || []), ...parsedConversions] : parsedConversions;
  }

  // Merge recipes
  if (parsedRecipes.length > 0) {
    masterData.recipes = mode === 'merge' ? [...(masterData.recipes || []), ...parsedRecipes] : parsedRecipes;
  }

  // Merge warehouses
  if (parsedWarehouses.length > 0) {
    const whMap = new Map<string, IposWarehouse>();
    if (mode === 'merge' && masterData.warehouses) masterData.warehouses.forEach((w) => whMap.set(w.warehouseId, w));
    parsedWarehouses.forEach((w) => whMap.set(w.warehouseId, { ...(whMap.get(w.warehouseId) || {}), ...w }));
    masterData.warehouses = Array.from(whMap.values());
  }

  // Merge customers
  if (parsedCustomers.length > 0) {
    const custMap = new Map<string, IposCustomer>();
    if (mode === 'merge' && masterData.customers) masterData.customers.forEach((c) => custMap.set(c.customerId, c));
    parsedCustomers.forEach((c) => custMap.set(c.customerId, { ...(custMap.get(c.customerId) || {}), ...c }));
    masterData.customers = Array.from(custMap.values());
  }

  // Merge suppliers
  if (parsedSuppliers.length > 0) {
    const suppMap = new Map<string, IposSupplier>();
    if (mode === 'merge' && masterData.suppliers) masterData.suppliers.forEach((s) => suppMap.set(s.supplierId, s));
    parsedSuppliers.forEach((s) => suppMap.set(s.supplierId, { ...(suppMap.get(s.supplierId) || {}), ...s }));
    masterData.suppliers = Array.from(suppMap.values());
  }

  // Merge reasons
  if (parsedReasons.length > 0) {
    const reasonMap = new Map<string, IposReason>();
    if (mode === 'merge' && masterData.reasons) masterData.reasons.forEach((r) => reasonMap.set(r.reasonId, r));
    parsedReasons.forEach((r) => reasonMap.set(r.reasonId, { ...(reasonMap.get(r.reasonId) || {}), ...r }));
    masterData.reasons = Array.from(reasonMap.values());
  }

  const parts = [];
  if (masterData.items.length) parts.push(`${masterData.items.length} hàng hóa`);
  if (masterData.categories?.length) parts.push(`${masterData.categories.length} nhóm`);
  if (masterData.units?.length) parts.push(`${masterData.units.length} ĐVT`);
  if (masterData.unitConversions?.length) parts.push(`${masterData.unitConversions.length} quy đổi`);
  if (masterData.warehouses.length) parts.push(`${masterData.warehouses.length} kho`);
  if (masterData.suppliers.length) parts.push(`${masterData.suppliers.length} NCC`);
  if (masterData.reasons?.length) parts.push(`${masterData.reasons.length} lý do`);

  masterData.catalogSourceInfo = `iPOS Master (${parts.join(', ')})`;
  masterData.importedAt = Date.now();

  return masterData;
}

// -------------------------------------------------------------
// EXPORT VALIDATION
// -------------------------------------------------------------

export function validateForExport(rows: MatchedInvoiceRow[]): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let redCount = 0;
  let unconfirmedYellowCount = 0;

  rows.forEach((r, idx) => {
    if (r.status === 'RED') {
      redCount++;
      errors.push(`Dòng ${idx + 1}: ${r.raw_item_name} (chưa gán mã iPOS hợp lệ hoặc thiếu thông tin bắt buộc)`);
    } else if (r.status === 'YELLOW' && !r.isManuallyConfirmed) {
      unconfirmedYellowCount++;
      warnings.push(`Dòng ${idx + 1}: ${r.raw_item_name} (khớp độ tin cậy vừa, cần xác nhận)`);
    }
  });

  const canExport = redCount === 0 && unconfirmedYellowCount === 0 && rows.length > 0;

  return {
    canExport,
    redCount,
    unconfirmedYellowCount,
    totalRows: rows.length,
    errors,
    warnings,
  };
}

// -------------------------------------------------------------
// GENERATE EXCEL PURCHASE INVOICE EXPORT FOR IPOS IMPORT
// -------------------------------------------------------------

export function generateIposExportWorkbook(
  masterData: IposMasterData,
  rows: MatchedInvoiceRow[],
  meta: {
    supplierName: string;
    supplierId?: string;
    warehouseId?: string;
    warehouseName?: string;
    reasonId?: string;
    reasonName?: string;
    invoiceNumber?: string;
    documentDate?: string;
    note?: string;
  }
): { workbook: XLSX.WorkBook; fileName: string } {
  let workbook: XLSX.WorkBook;

  if (masterData.templateWorkbookBase64) {
    const arrayBuffer = base64ToArrayBuffer(masterData.templateWorkbookBase64);
    workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
  } else {
    // Build default standard iPOS inventory import workbook
    workbook = XLSX.utils.book_new();
    const wsData = [
      ['PHIẾU NHẬP MUA HÀNG IPOS INVENTORY'],
      ['Nhà cung cấp (*):', meta.supplierName || '', 'Mã NCC (*):', meta.supplierId || ''],
      ['Kho nhập (*):', meta.warehouseName || '', 'Mã kho (*):', meta.warehouseId || ''],
      ['Lý do nhập:', meta.reasonName || 'Nhập mua hàng thông thường', 'Mã lý do:', meta.reasonId || 'NM'],
      ['Ngày chứng từ (*):', meta.documentDate || '', 'Số hóa đơn:', meta.invoiceNumber || '', 'Ghi chú:', meta.note || ''],
      [],
      [
        'STT',
        'Mã hàng hóa (*)',
        'Tên hàng hóa',
        'Mã ĐVT (*)',
        'Tên ĐVT',
        'Số lượng (*)',
        'Đơn giá mua (*)',
        'Chiết khấu (%)',
        'Tiền chiết khấu',
        'Thuế VAT (%)',
        'Tiền thuế VAT',
        'Thành tiền (*)',
        'Ghi chú',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(workbook, ws, 'Nhập mua hàng');
  }

  let targetSheetName = workbook.SheetNames[0];
  for (const sName of workbook.SheetNames) {
    const norm = normalizeWithoutAccents(sName).toLowerCase();
    if (norm.includes('nhap mua') || norm.includes('chi tiet') || norm.includes('phieu nhap') || norm.includes('import')) {
      targetSheetName = sName;
      break;
    }
  }

  const sheet = workbook.Sheets[targetSheetName];
  const { headerRowIndex, colMap, dataStartRow } = findHeaderRowAndMap(sheet);
  const validRows = rows.filter((r) => r.status !== 'RED' && (r.status === 'GREEN' || r.isManuallyConfirmed));

  if (headerRowIndex !== -1 && Object.keys(colMap).length >= 2) {
    let currentRow = dataStartRow;

    // Fill metadata headers if available in top lines
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
    for (let r = range.s.r; r < headerRowIndex; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'string') {
          const cellText = normalizeWithoutAccents(cell.v).toLowerCase();
          const nextCellAddr = XLSX.utils.encode_cell({ r, c: c + 1 });
          if (cellText.includes('nha cung cap') && meta.supplierName) {
            sheet[nextCellAddr] = { t: 's', v: meta.supplierName };
          } else if (cellText.includes('ma ncc') && meta.supplierId) {
            sheet[nextCellAddr] = { t: 's', v: meta.supplierId };
          } else if (cellText.includes('kho') && meta.warehouseName) {
            sheet[nextCellAddr] = { t: 's', v: meta.warehouseName };
          } else if (cellText.includes('ngay') && meta.documentDate) {
            sheet[nextCellAddr] = { t: 's', v: meta.documentDate };
          } else if (cellText.includes('so hoa don') && meta.invoiceNumber) {
            sheet[nextCellAddr] = { t: 's', v: meta.invoiceNumber };
          }
        }
      }
    }

    // Populate detail items
    validRows.forEach((row, idx) => {
      const r = currentRow + idx;

      const setCell = (colIdx: number | undefined, val: any, type: 's' | 'n' = 's') => {
        if (colIdx === undefined) return;
        const addr = XLSX.utils.encode_cell({ r, c: colIdx });
        if (val !== null && val !== undefined && val !== '') {
          sheet[addr] = { t: type, v: val };
        }
      };

      setCell(colMap['stt'] ?? 0, idx + 1, 'n');
      setCell(colMap['item_id'], row.item_id || row.selectedCandidate?.itemId, 's');
      setCell(colMap['item_name'], row.item_name || row.selectedCandidate?.itemName, 's');
      setCell(colMap['unit_id'], row.selectedCandidate?.unitId || row.unit, 's');
      setCell(colMap['unit_name'] || colMap['unit'], row.unit || row.selectedCandidate?.unitName, 's');
      setCell(colMap['quantity'], row.quantity, 'n');
      setCell(colMap['price'], row.price, 'n');
      setCell(colMap['discount'], row.discount, 'n');
      setCell(colMap['discount_amount'], row.discount_amount, 'n');
      setCell(colMap['vat'], row.vat, 'n');
      setCell(colMap['amount_vat'], row.amount_vat, 'n');
      setCell(
        colMap['sub_total'],
        row.sub_total || (row.quantity && row.price ? row.quantity * row.price : 0),
        'n'
      );
      setCell(colMap['note'], row.note, 's');
    });

    range.e.r = Math.max(range.e.r, currentRow + validRows.length);
    sheet['!ref'] = XLSX.utils.encode_range(range);
  } else {
    const newRowsAOA: any[][] = validRows.map((r, idx) => [
      idx + 1,
      r.item_id || r.selectedCandidate?.itemId || '',
      r.item_name || r.selectedCandidate?.itemName || '',
      r.selectedCandidate?.unitId || r.unit || '',
      r.unit || r.selectedCandidate?.unitName || '',
      r.quantity || 0,
      r.price || 0,
      r.discount || 0,
      r.discount_amount || 0,
      r.vat || 0,
      r.amount_vat || 0,
      r.sub_total || (r.quantity && r.price ? r.quantity * r.price : 0),
      r.note || '',
    ]);

    XLSX.utils.sheet_add_aoa(sheet, newRowsAOA, { origin: -1 });
  }

  const safeSupplier = meta.supplierName
    ? normalizeWithoutAccents(meta.supplierName).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    : 'NCC';
  const safeDate = meta.documentDate
    ? meta.documentDate.replace(/[^0-9\-]/g, '')
    : new Date().toISOString().slice(0, 10);
  const fileName = `NHAP_MUA_${safeSupplier || 'NCC'}_${safeDate}.xlsx`;

  return { workbook, fileName };
}

// -------------------------------------------------------------
// DEDICATED CATALOG EXPORTERS
// -------------------------------------------------------------

export function exportMasterDataToExcel(masterData: IposMasterData, fileName = 'DANH_SACH_HANG_HOA_IPOS.xlsx'): void {
  exportItemsToExcel(masterData.items || [], fileName);
}

export function exportItemsToExcel(items: IposItem[], fileName = 'DANH_SACH_HANG_HOA_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã hàng (*)', 'Tên hàng hóa (*)', 'Mã ĐVT (*)', 'Tên ĐVT', 'Giá vốn chuẩn', 'Nhóm hàng', 'Mã vạch', 'Trạng thái'];
  const rows = items.map((it, idx) => [
    idx + 1,
    it.itemId,
    it.itemName,
    it.unitId || '',
    it.unitName || '',
    it.costPrice || '',
    it.category || '',
    it.barcode || '',
    it.status || 'Đang dùng',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Hàng hoá');
  XLSX.writeFile(wb, fileName);
}

export function exportCategoriesToExcel(cats: IposItemCategory[], fileName = 'DANH_SACH_NHOM_HANG_HOA_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã nhóm (*)', 'Tên nhóm hàng (*)', 'Nhóm cha', 'Mô tả'];
  const rows = cats.map((c, idx) => [idx + 1, c.categoryId, c.categoryName, c.parentCategoryId || '', c.description || '']);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Nhóm hàng hoá');
  XLSX.writeFile(wb, fileName);
}

export function exportUnitsToExcel(units: IposUnit[], fileName = 'MAU_NHAP_DON_VI_TINH_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã đơn vị tính (*)', 'Tên đơn vị tính (*)', 'Mô tả'];
  const rows = units.map((u, idx) => [idx + 1, u.unitId, u.unitName, u.description || '']);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Đơn vị tính');
  XLSX.writeFile(wb, fileName);
}

export function exportConversionsToExcel(convs: IposUnitConversion[], fileName = 'DANH_SACH_QUY_DOI_DON_VI_TINH_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT quy đổi (Nguồn)', 'ĐVT gốc (Đích)', 'Tỷ lệ quy đổi', 'Mô tả'];
  const rows = convs.map((c, idx) => [
    idx + 1,
    c.itemId || '',
    c.itemName || '',
    c.sourceUnitName,
    c.targetUnitName,
    c.conversionRate,
    c.description || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Quy đổi ĐVT');
  XLSX.writeFile(wb, fileName);
}

export function exportRecipesToExcel(recipes: IposRecipe[], fileName = 'DANH_SACH_CONG_THUC_CHE_BIEN_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã món (*)', 'Tên món (*)', 'Mã nguyên liệu (*)', 'Tên nguyên liệu (*)', 'Định lượng (*)', 'ĐVT', 'Tỷ lệ hao hụt (%)', 'Ghi chú'];
  const rows = recipes.map((r, idx) => [
    idx + 1,
    r.parentItemId,
    r.parentItemName,
    r.ingredientItemId,
    r.ingredientItemName,
    r.quantity,
    r.unitName,
    r.lossRate || 0,
    r.note || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Công thức chế biến');
  XLSX.writeFile(wb, fileName);
}

export function exportWarehousesToExcel(warehouses: IposWarehouse[], fileName = 'DANH_SACH_KHO_HANG_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã kho (*)', 'Tên kho (*)', 'Mã chi nhánh', 'Địa chỉ', 'Số điện thoại'];
  const rows = warehouses.map((w, idx) => [
    idx + 1,
    w.warehouseId,
    w.warehouseName,
    w.branchId || '',
    w.address || '',
    w.phone || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Kho hàng');
  XLSX.writeFile(wb, fileName);
}

export function exportCustomersToExcel(customers: IposCustomer[], fileName = 'DANH_SACH_KHACH_HANG_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã khách hàng (*)', 'Tên khách hàng (*)', 'Số điện thoại', 'Địa chỉ', 'Mã số thuế', 'Nhóm khách'];
  const rows = customers.map((c, idx) => [
    idx + 1,
    c.customerId,
    c.customerName,
    c.phone || '',
    c.address || '',
    c.taxCode || '',
    c.customerGroup || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
  XLSX.writeFile(wb, fileName);
}

export function exportSuppliersToExcel(suppliers: IposSupplier[], fileName = 'DANH_SACH_NHA_CUNG_CAP_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã NCC (*)', 'Tên nhà cung cấp (*)', 'Mã số thuế', 'Số điện thoại', 'Địa chỉ', 'Nhóm NCC'];
  const rows = suppliers.map((s, idx) => [
    idx + 1,
    s.supplierId,
    s.supplierName,
    s.taxCode || '',
    s.phone || '',
    s.address || '',
    s.supplierGroup || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Nhà cung cấp');
  XLSX.writeFile(wb, fileName);
}

export function exportSupplierGroupsToExcel(groups: IposSupplierGroup[], fileName = 'DANH_SACH_NHOM_NHA_CUNG_CAP_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã nhóm NCC (*)', 'Tên nhóm NCC (*)', 'Mô tả'];
  const rows = groups.map((g, idx) => [
    idx + 1,
    g.groupId || g.supplierGroupId || '',
    g.groupName || g.supplierGroupName || '',
    g.description || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Nhóm NCC');
  XLSX.writeFile(wb, fileName);
}

export function exportReasonsToExcel(reasons: IposReason[], fileName = 'DANH_SACH_LY_DO_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã lý do (*)', 'Tên lý do (*)', 'Loại lý do', 'Mô tả', 'Mặc định'];
  const rows = reasons.map((r, idx) => [
    idx + 1,
    r.reasonId,
    r.reasonName,
    r.reasonType,
    r.description || '',
    r.isDefault ? 'Có' : 'Không',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Lý do');
  XLSX.writeFile(wb, fileName);
}

export function exportPriceListsToExcel(priceLists: IposPriceList[], fileName = 'BANG_GIA_MUA_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã bảng giá', 'Tên bảng giá', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Đơn giá', 'Ngày hiệu lực'];
  const rows = priceLists.map((p, idx) => [
    idx + 1,
    p.priceListId,
    p.priceListName,
    p.itemId,
    p.itemName,
    p.unitName || '',
    p.price,
    p.effectiveDate || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Bảng giá');
  XLSX.writeFile(wb, fileName);
}

export function exportStockNormsToExcel(norms: IposStockNorm[], fileName = 'DINH_MUC_TON_KHO_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã hàng', 'Tên hàng', 'Mã kho', 'Tên kho', 'Tồn tối thiểu (Min)', 'Tồn tối đa (Max)', 'ĐVT'];
  const rows = norms.map((n, idx) => [
    idx + 1,
    n.itemId,
    n.itemName,
    n.warehouseId,
    n.warehouseName || '',
    n.minStock,
    n.maxStock,
    n.unitName || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Định mức tồn kho');
  XLSX.writeFile(wb, fileName);
}
