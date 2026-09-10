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
  isSameOrEquivalentUnit,
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
  let bestScore = -1;
  let bestHeaderRowIndex = -1;
  let bestColMap: Record<string, number> = {};

  // Scan up to top 30 rows for known headers
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 30); r++) {
    const currentMap: Record<string, number> = {};
    let matchedKeywords = 0;
    let unitIdIsChinh = false;
    let unitNameIsChinh = false;

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
        norm === 'ma don vi tinh chuyen doi' ||
        norm === 'ma dvt chuyen doi' ||
        norm === 'ma don vi chuyen doi' ||
        norm === 'ma dvt phu' ||
        norm === 'ma don vi tinh phu' ||
        norm === 'ma dvt nhap' ||
        norm === 'ma don vi tinh nhap' ||
        norm === 'ma dvt nguon' ||
        norm === 'ma dvt 2' ||
        norm === 'ma dvt dinh luong' ||
        norm === 'ma don vi tinh dinh luong' ||
        norm === 'ma dvt cong thuc' ||
        norm === 'ma dvt tieu hao' ||
        norm === 'dvt quy doi ma' ||
        norm === 'dvt chuyen doi ma' ||
        ((norm.includes('quy doi') || norm.includes('chuyen doi') || norm.includes('bien doi') || norm.includes('dinh luong') || norm.includes('cong thuc') || norm.includes('tieu hao')) &&
          (norm.includes('ma') || norm.includes('code') || norm.includes('id'))) ||
        norm.includes('conversion unit code')
      ) {
        currentMap['conv_unit_id'] = c;
        currentMap['source_unit_id'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ten don vi tinh quy doi' ||
        norm === 'ten dvt quy doi' ||
        norm === 'ten don vi quy doi' ||
        norm === 'ten don vi tinh chuyen doi' ||
        norm === 'ten dvt chuyen doi' ||
        norm === 'ten don vi chuyen doi' ||
        norm === 'dvt quy doi' ||
        norm === 'don vi tinh quy doi' ||
        norm === 'don vi quy doi' ||
        norm === 'dvt chuyen doi' ||
        norm === 'don vi tinh chuyen doi' ||
        norm === 'don vi chuyen doi' ||
        norm === 'ten dvt phu' ||
        norm === 'dvt phu' ||
        norm === 'dvt nguon' ||
        norm === 'dvt nhap' ||
        norm === 'dvt mua' ||
        norm === 'dvt 2' ||
        norm === 'ten dvt 2' ||
        norm === 'ten dvt dinh luong' ||
        norm === 'dvt dinh luong' ||
        norm === 'don vi dinh luong' ||
        norm === 'don vi tinh dinh luong' ||
        norm === 'ten dvt cong thuc' ||
        norm === 'dvt cong thuc' ||
        norm === 'don vi cong thuc' ||
        norm === 'ten dvt tieu hao' ||
        norm === 'dvt tieu hao' ||
        norm === 'don vi tieu hao' ||
        ((norm.includes('quy doi') || norm.includes('chuyen doi') || norm.includes('bien doi') || norm.includes('dinh luong') || norm.includes('cong thuc') || norm.includes('tieu hao')) &&
          (norm.includes('ten') || norm.includes('name') || norm.includes('dvt') || norm.includes('don vi')) &&
          !norm.includes('ty le') &&
          !norm.includes('ti le') &&
          !norm.includes('he so') &&
          !norm.includes('rate')) ||
        (norm.includes('dvt phu') && !norm.includes('ma'))
      ) {
        currentMap['conv_unit_name'] = c;
        currentMap['source_unit'] = c;
        matchedKeywords++;
      } else if (
        norm === 'ty le quy doi' ||
        norm === 'ti le quy doi' ||
        norm === 'he so quy doi' ||
        norm === 'ty le chuyen doi' ||
        norm === 'ti le chuyen doi' ||
        norm === 'he so chuyen doi' ||
        norm === 'ty le dinh luong' ||
        norm === 'ti le dinh luong' ||
        norm === 'he so dinh luong' ||
        norm === 'ty le qd' ||
        norm === 'ti le qd' ||
        norm === 'he so qd' ||
        norm === 'ty le cd' ||
        norm === 'ti le cd' ||
        norm === 'he so cd' ||
        norm === 'ty le' ||
        norm === 'ti le' ||
        norm === 'he so' ||
        norm.includes('conversion rate') ||
        ((norm.includes('quy doi') || norm.includes('chuyen doi') || norm.includes('bien doi') || norm.includes('dinh luong')) &&
          (norm.includes('ty le') || norm.includes('ti le') || norm.includes('he so') || norm.includes('rate')))
      ) {
        currentMap['conv_rate'] = c;
        currentMap['rate'] = c;
        matchedKeywords++;
      } else if (
        !norm.includes('quy doi') &&
        !norm.includes('chuyen doi') &&
        !norm.includes('bien doi') &&
        !norm.includes('dinh luong') &&
        !norm.includes('cong thuc') &&
        !norm.includes('tieu hao') &&
        !norm.includes('phu') &&
        !norm.includes('nhap') &&
        !norm.includes('nguon') &&
        !norm.includes('ncc') &&
        !norm.includes('kho') &&
        !norm.includes('khach') &&
        !norm.includes('dvt 2') &&
        !norm.includes('ma dvt 2') &&
        (norm === 'ma dvt chinh' ||
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
          (norm.includes('dvt chinh') && (norm.includes('ma') || norm.includes('code') || norm.includes('id'))) ||
          (norm.includes('don vi tinh chinh') && (norm.includes('ma') || norm.includes('code') || norm.includes('id'))) ||
          ((norm.startsWith('ma dvt') || norm.startsWith('ma don vi')) &&
            !norm.includes('quy doi') &&
            !norm.includes('chuyen doi') &&
            !norm.includes('dinh luong')) ||
          (domainHint === 'unit' && (norm === 'ma' || norm === 'ma so' || norm === 'ma dvt')))
      ) {
        const isChinh = norm.includes('chinh');
        if (currentMap['unit_id'] === undefined || (isChinh && !unitIdIsChinh)) {
          currentMap['unit_id'] = c;
          if (isChinh) unitIdIsChinh = true;
          matchedKeywords++;
        }
      } else if (
        !norm.includes('quy doi') &&
        !norm.includes('chuyen doi') &&
        !norm.includes('bien doi') &&
        !norm.includes('dinh luong') &&
        !norm.includes('cong thuc') &&
        !norm.includes('tieu hao') &&
        !norm.includes('phu') &&
        !norm.includes('nhap') &&
        !norm.includes('nguon') &&
        !norm.includes('ncc') &&
        !norm.includes('kho') &&
        !norm.includes('khach') &&
        !norm.includes('dvt 2') &&
        (norm === 'ten dvt chinh' ||
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
          ((norm.startsWith('ten dvt') || norm.startsWith('ten don vi')) &&
            !norm.includes('quy doi') &&
            !norm.includes('chuyen doi') &&
            !norm.includes('dinh luong')) ||
          (domainHint === 'unit' && (norm === 'ten' || norm === 'ten dvt' || norm === 'ten don vi')))
      ) {
        const isChinh = norm.includes('chinh');
        if (currentMap['unit_name'] === undefined || (isChinh && !unitNameIsChinh)) {
          currentMap['unit_name'] = c;
          if (isChinh) unitNameIsChinh = true;
          matchedKeywords++;
        }
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
        norm === 'tong tien' ||
        norm === 'tong thanh toan' ||
        norm === 'tong cong' ||
        norm === 'tong gia tri' ||
        norm === 'tong tien thanh toan' ||
        norm.includes('total amount') ||
        norm.includes('tong thanh toan') ||
        (norm.includes('tong tien') && !norm.includes('thue'))
      ) {
        currentMap['total_amount'] = c;
        currentMap['total'] = c;
        matchedKeywords++;
      } else if (
        norm === 'thanh tien' ||
        norm === 'tien hang' ||
        norm === 'thanh tien chua thue' ||
        norm.includes('subtotal') ||
        norm.includes('amount') ||
        norm.includes('thanh tien') ||
        norm.includes('tien hang')
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

    // Calculate specificity score for row r
    let rowScore = 0;
    if (currentMap['item_id'] !== undefined) rowScore += 10;
    if (currentMap['item_name'] !== undefined) rowScore += 10;
    if (currentMap['unit_id'] !== undefined) rowScore += 6;
    if (currentMap['unit_name'] !== undefined) rowScore += 6;
    if (currentMap['conv_unit_id'] !== undefined) rowScore += 4;
    if (currentMap['conv_rate'] !== undefined) rowScore += 4;
    if (currentMap['price'] !== undefined || currentMap['cost_price'] !== undefined) rowScore += 4;
    if (currentMap['category_id'] !== undefined || currentMap['category_name'] !== undefined) rowScore += 3;
    if (currentMap['supplier_id'] !== undefined || currentMap['supplier_name'] !== undefined) rowScore += 10;
    if (currentMap['customer_id'] !== undefined || currentMap['customer_name'] !== undefined) rowScore += 10;
    if (currentMap['quantity'] !== undefined) rowScore += 4;
    rowScore += matchedKeywords;

    if (currentMap['item_id'] !== undefined && currentMap['item_name'] !== undefined) {
      rowScore += 15;
    }
    if (currentMap['supplier_id'] !== undefined && currentMap['supplier_name'] !== undefined) {
      rowScore += 15;
    }

    if (rowScore > bestScore) {
      bestScore = rowScore;
      bestHeaderRowIndex = r;
      bestColMap = currentMap;
      // High confidence match found
      if (rowScore >= 35) {
        break;
      }
    }
  }

  if (bestScore >= 2 || (domainHint && bestScore >= 1)) {
    headerRowIndex = bestHeaderRowIndex;
    colMap = bestColMap;
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

    // Collect Conversion info from row (Columns L/M or O/P)
    const rawConvUnit =
      convUnitNameCell && convUnitNameCell.v !== undefined
        ? String(convUnitNameCell.v).trim()
        : convUnitIdCell && convUnitIdCell.v !== undefined
        ? String(convUnitIdCell.v).trim()
        : '';
    const rawConvRate = convRateCell ? parseVietnameseNumber(convRateCell.v) : 0;

    let finalUnitId = rawUnitId || (rawUnitName ? resolveStandardUnitCode(rawUnitName) : fallbackUnit ? resolveStandardUnitCode(fallbackUnit) : undefined);
    let finalUnitName = rawUnitName || (rawUnitId ? resolveStandardUnitName(rawUnitId) : fallbackUnit ? resolveStandardUnitName(fallbackUnit) : undefined);
    let autoInferredUnit = false;
    let itemWarning: string | undefined = undefined;

    // Self-healing fallback for missing primary unit (e.g. CP22 in iPOS export)
    // When primary unit is blank, never overwrite with conversion unit (like GR).
    // Instead, intelligently infer primary purchasing unit from conversion rate and item context:
    if (!finalUnitId && !finalUnitName) {
      const normConv = rawConvUnit ? normalizeWithoutAccents(rawConvUnit).toUpperCase() : '';
      if ((normConv === 'GR' || normConv === 'G' || normConv === 'GRAM') && rawConvRate === 1000) {
        finalUnitId = 'KG';
        finalUnitName = 'Kg';
        autoInferredUnit = true;
        itemWarning = `Mã ${rawItemId} thiếu ĐVT chính trong file Excel gốc, hệ thống đã tự động gán KG theo tỷ lệ 1000 GR`;
      } else if (normConv === 'ML' && rawConvRate === 1000) {
        finalUnitId = 'LIT';
        finalUnitName = 'Lít';
        autoInferredUnit = true;
        itemWarning = `Mã ${rawItemId} thiếu ĐVT chính trong file Excel gốc, hệ thống đã tự động gán LIT theo tỷ lệ 1000 ML`;
      } else if (rawConvUnit && rawConvRate && rawConvRate > 1) {
        finalUnitId = 'THUNG';
        finalUnitName = 'Thùng';
        autoInferredUnit = true;
        itemWarning = `Mã ${rawItemId} thiếu ĐVT chính trong file Excel gốc, hệ thống đã tự động gán Thùng theo tỷ lệ ${rawConvRate} ${rawConvUnit}`;
      } else if (rawConvUnit) {
        finalUnitId = resolveStandardUnitCode(rawConvUnit) || rawConvUnit.toUpperCase();
        finalUnitName = resolveStandardUnitName(rawConvUnit) || rawConvUnit;
      }
    }

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

    // Collect Conversion: Primary unit (KG) is sourceUnitName, Conversion unit (GR) is targetUnitName
    // 1 sourceUnitName (KG) = rawConvRate targetUnitName (GR)
    if (rawConvUnit && rawConvRate && rawConvRate > 0) {
      const primaryUnit = finalUnitName || finalUnitId || 'Kg';
      conversions.push({
        itemId: rawItemId || undefined,
        itemName: rawItemName || undefined,
        sourceUnitName: primaryUnit,
        targetUnitName: rawConvUnit,
        conversionRate: rawConvRate,
        description: `1 ${primaryUnit} = ${rawConvRate} ${rawConvUnit}${autoInferredUnit ? ' (Tự động suy luận)' : ''}`,
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

    // Item Type (0 - NVL, 1 - TP)
    let itemType: number | string | undefined = undefined;
    if (rawTypeId) {
      if (rawTypeId === '0' || rawTypeId.toLowerCase().includes('nvl') || rawTypeId.toLowerCase().includes('nguyen vat lieu')) {
        itemType = 0;
      } else if (rawTypeId === '1' || rawTypeId.toLowerCase().includes('thanh pham')) {
        itemType = 1;
      } else {
        itemType = rawTypeId;
      }
    } else if (rawItemId.toUpperCase().startsWith('CP') || rawItemId.toUpperCase().startsWith('NVL')) {
      itemType = 0;
    } else if (rawItemId.toUpperCase().startsWith('ITEM') || rawItemId.toUpperCase().startsWith('TP')) {
      itemType = 1;
    }

    items.push({
      itemId: rawItemId || `ITEM_${items.length + 1}`,
      itemName: rawItemName || rawItemId,
      unitId: finalUnitId || undefined,
      unitName: finalUnitName || undefined,
      category: category || undefined,
      categoryId: categoryId || undefined,
      itemType,
      costPrice,
      barcode,
      status,
      description: itemWarning || description,
      sourceSheet: sheetName,
      warning: itemWarning,
      autoInferredUnit,
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

  const isNumericValue = (val?: string | null) => {
    if (!val) return true;
    return /^[\d.,\s\+\-\*\/%]+$/.test(val.trim());
  };

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
      if (clean.includes('ma don vi') || clean.includes('ten don vi') || clean.includes('tong cong') || clean.includes('ti le')) continue;

      // Filter out purely numeric units or conversion ratios
      if (isNumericValue(id) && isNumericValue(name)) continue;
      if (!id && isNumericValue(name)) continue;
      if (!name && isNumericValue(id)) continue;

      const finalId = id || resolveStandardUnitCode(name) || name.toUpperCase();
      const finalName = name || resolveStandardUnitName(id) || id;

      if (isNumericValue(finalId) || isNumericValue(finalName)) continue;

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

  const isNumericValue = (val?: string | null) => {
    if (!val) return true;
    return /^[\d.,\s\+\-\*\/%]+$/.test(val.trim());
  };

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
        cleanSrc.includes('tong cong') ||
        isNumericValue(srcUnit) ||
        isNumericValue(tgtUnit)
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
      normFileName.includes('template') ||
      normFileName.includes('mau_excel_ipos')
    ) {
      masterData.templateWorkbookBase64 = arrayBufferToBase64(arrayBuffer);
      masterData.templateFileName = fileName;
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const normSheet = normalizeWithoutAccents(sheetName).toLowerCase();
      if (normSheet.includes('huong dan') || normSheet.includes('readme')) continue;

      // 1. Check specific domain files and sheets FIRST by filename & sheet title
      if (
        normFileName.includes('don vi tinh') ||
        normFileName.includes('dvt') ||
        normSheet.includes('don vi tinh') ||
        normSheet.includes('dvt') ||
        normFileName.includes('mau_nhap_don_vi_tinh')
      ) {
        const u = extractUnitsFromSheet(sheet);
        if (u.length > 0) parsedUnits.push(...u);
      } else if (
        normFileName.includes('quy doi') ||
        normSheet.includes('quy doi') ||
        normFileName.includes('conversion') ||
        normSheet.includes('conversion') ||
        normFileName.includes('bang_quy_doi')
      ) {
        const c = extractConversionsFromSheet(sheet, true);
        if (c.length > 0) parsedConversions.push(...c);
      } else if (
        normFileName.includes('kho') ||
        normSheet.includes('kho') ||
        normFileName.includes('warehouse') ||
        normSheet.includes('warehouse')
      ) {
        const w = extractWarehousesFromSheet(sheet, true);
        if (w.length > 0) parsedWarehouses.push(...w);
      } else if (
        normFileName.includes('nha cung cap') ||
        normFileName.includes('ncc') ||
        normSheet.includes('nha cung cap') ||
        normSheet.includes('ncc') ||
        normFileName.includes('supplier') ||
        normSheet.includes('supplier')
      ) {
        const s = extractSuppliersFromSheet(sheet, true);
        if (s.length > 0) parsedSuppliers.push(...s);
      } else if (
        normFileName.includes('nhom hang') ||
        normSheet.includes('nhom hang') ||
        normFileName.includes('loai hang') ||
        normSheet.includes('loai hang') ||
        normFileName.includes('category')
      ) {
        const cats = extractCategoriesFromSheet(sheet);
        if (cats.length > 0) parsedCategories.push(...cats);
      } else if (
        normFileName.includes('cong thuc') ||
        normSheet.includes('cong thuc') ||
        normFileName.includes('bom') ||
        normSheet.includes('bom') ||
        normFileName.includes('recipe')
      ) {
        const r = extractRecipesFromSheet(sheet);
        if (r.length > 0) parsedRecipes.push(...r);
      } else if (
        normFileName.includes('khach hang') ||
        normSheet.includes('khach hang') ||
        normFileName.includes('customer')
      ) {
        const cust = extractCustomersFromSheet(sheet);
        if (cust.length > 0) parsedCustomers.push(...cust);
      } else if (
        normFileName.includes('ly do') ||
        normSheet.includes('ly do') ||
        normFileName.includes('reason')
      ) {
        const r = extractReasonsFromSheet(sheet);
        if (r.length > 0) parsedReasons.push(...r);
      } else {
        // 2. Otherwise extract items catalog
        const bundle = extractItemsDetailedFromSheet(sheet, `${fileName} -> ${sheetName}`);
        if (bundle.items.length > 0) {
          parsedItems.push(...bundle.items);
          parsedCategories.push(...bundle.categories);
          // Only add units from items if not purely numeric
          const cleanItemUnits = bundle.units.filter(
            (u) =>
              u.unitId &&
              u.unitName &&
              !/^[\d.,\s\+\-\*\/%]+$/.test(u.unitId) &&
              !/^[\d.,\s\+\-\*\/%]+$/.test(u.unitName)
          );
          parsedUnits.push(...cleanItemUnits);
          parsedConversions.push(...bundle.conversions);
        }
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

  // Merge units cleanly: ensure no pure numeric units
  if (parsedUnits.length > 0) {
    const unitMap = new Map<string, IposUnit>();
    if (mode === 'merge' && masterData.units) {
      masterData.units.forEach((u) => {
        if (u.unitId && !/^[\d.,\s\+\-\*\/%]+$/.test(u.unitId)) {
          unitMap.set(u.unitId.toLowerCase(), u);
        }
      });
    }
    parsedUnits.forEach((u) => {
      if (
        u.unitId &&
        u.unitName &&
        !/^[\d.,\s\+\-\*\/%]+$/.test(u.unitId) &&
        !/^[\d.,\s\+\-\*\/%]+$/.test(u.unitName)
      ) {
        const key = u.unitId.toLowerCase();
        unitMap.set(key, { ...(unitMap.get(key) || {}), ...u });
      }
    });
    masterData.units = Array.from(unitMap.values());
  }

  // Merge conversions: ensure clean non-numeric units
  if (parsedConversions.length > 0) {
    const cleanConvs = parsedConversions.filter(
      (c) =>
        c.sourceUnitName &&
        c.targetUnitName &&
        !/^[\d.,\s\+\-\*\/%]+$/.test(c.sourceUnitName) &&
        !/^[\d.,\s\+\-\*\/%]+$/.test(c.targetUnitName)
    );
    masterData.unitConversions = mode === 'merge' ? [...(masterData.unitConversions || []), ...cleanConvs] : cleanConvs;
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
// RESOLVE UNIT CODE FOR IPOS IMPORT (PREVENTS INCOMPATIBLE UOM ERRORS)
// -------------------------------------------------------------

export function resolveIposExportUnitCode(
  row: MatchedInvoiceRow,
  masterData?: IposMasterData | null
): string {
  // 1. Locate current matched item in Master Data items
  const itemId = row.item_id || row.selectedCandidate?.itemId;
  const currentItem =
    masterData?.items?.find((i) => i.itemId === itemId) ||
    row.selectedCandidate;

  const rawUnit = (row.unit || row.raw?.raw_unit || '').trim();
  const rawUnitCode = resolveStandardUnitCode(rawUnit);
  const rawUnitNorm = normalizeWithoutAccents(rawUnit).toLowerCase();

  if (currentItem) {
    // Official primary Unit ID in DB (e.g. CP35 -> "BAP", CP08 -> "KG", CP169 -> "CAI", CP271 -> "QUA")
    const primaryUnitId = (
      currentItem.unitId ||
      resolveStandardUnitCode(currentItem.unitName) ||
      'KG'
    ).trim().toUpperCase();

    const primaryUnitName = (currentItem.unitName || '').trim();
    const primaryUnitNameNorm = normalizeWithoutAccents(primaryUnitName).toLowerCase();
    const primaryUnitIdNorm = normalizeWithoutAccents(primaryUnitId).toLowerCase();

    // RULE 1: If unit on receipt/image is missing or empty -> MANDATORY fallback to primary unitId in DB
    if (!rawUnit || rawUnitNorm.length === 0) {
      return primaryUnitId;
    }

    // Direct match between receipt unit and DB primary unit (e.g. "Bắp" -> "BAP", "kg" -> "KG", "Cái" -> "CAI")
    if (
      isSameOrEquivalentUnit(rawUnit, primaryUnitId) ||
      isSameOrEquivalentUnit(rawUnit, primaryUnitName) ||
      rawUnitNorm === primaryUnitNameNorm ||
      rawUnitNorm === primaryUnitIdNorm ||
      rawUnitCode === primaryUnitId
    ) {
      return primaryUnitId;
    }

    // RULE 2: CHECK UNIT CONVERSIONS TABLE
    // If unit on receipt differs from primary unit in DB (e.g. DB is "BAP" but receipt is "kg"):
    // Step 1: Look up in Unit Conversions table (masterData.unitConversions)
    let isSrcConversion = false;
    const validConversion = masterData?.unitConversions?.find((c) => {
      const itemMatch = !c.itemId || c.itemId === currentItem.itemId;
      if (!itemMatch) return false;

      const isSrc =
        isSameOrEquivalentUnit(c.sourceUnitName, rawUnit) ||
        normalizeWithoutAccents(c.sourceUnitName).toLowerCase() === rawUnitNorm;
      const isTgt =
        isSameOrEquivalentUnit(c.targetUnitName, rawUnit) ||
        normalizeWithoutAccents(c.targetUnitName).toLowerCase() === rawUnitNorm;

      if (!isSrc && !isTgt) return false;

      // Check if conversion connects rawUnit to primary unit
      if (isSrc) {
        const connects =
          isSameOrEquivalentUnit(c.targetUnitName, primaryUnitId) ||
          isSameOrEquivalentUnit(c.targetUnitName, primaryUnitName) ||
          !c.itemId;
        if (connects) {
          isSrcConversion = true;
          return true;
        }
      }
      if (isTgt) {
        const connects =
          isSameOrEquivalentUnit(c.sourceUnitName, primaryUnitId) ||
          isSameOrEquivalentUnit(c.sourceUnitName, primaryUnitName) ||
          !c.itemId;
        if (connects) {
          isSrcConversion = false;
          return true;
        }
      }
      return false;
    });

    // Step 3: IF there is a valid conversion in DB -> use the valid converted unit code (UPPERCASE)
    if (validConversion) {
      const convUnitName = isSrcConversion ? validConversion.sourceUnitName : validConversion.targetUnitName;
      const matchedDbUnit = masterData?.units?.find(
        (u) =>
          isSameOrEquivalentUnit(u.unitId, rawUnit) ||
          isSameOrEquivalentUnit(u.unitName, rawUnit) ||
          isSameOrEquivalentUnit(u.unitName, convUnitName) ||
          isSameOrEquivalentUnit(u.unitId, convUnitName)
      );
      return (matchedDbUnit?.unitId || rawUnitCode || resolveStandardUnitCode(convUnitName)).trim().toUpperCase();
    }

    // Step 2: IF NO valid conversion exists between receipt unit and primary unit in DB ->
    // MANDATORY fallback to primary unitId in DB (to prevent iPOS error "Không có quy đổi đơn vị tính...")
    return primaryUnitId;
  }

  // If item not found in DB at all, return standard uppercase unit code
  return rawUnitCode || 'KG';
}

// -------------------------------------------------------------
// CENTRALIZED XLSX FILE WRITER WITH SHARED STRING TABLE (SST)
// -------------------------------------------------------------

/**
 * Writes an XLSX workbook with Shared String Table (SST) and compression enabled.
 * Strictly required for compatibility with the iPOS import parser.
 */
export function writeXlsxFile(workbook: XLSX.WorkBook, fileName: string): void {
  XLSX.writeFile(workbook, fileName, {
    bookType: 'xlsx',
    bookSST: true,
    compression: true,
  });
}

// -------------------------------------------------------------
// DEFAULT BUNDLED IPOS PURCHASE IMPORT TEMPLATE
// -------------------------------------------------------------

export const IPOS_DEFAULT_SHEET_NAME = 'Dữ liệu dùng để import';

export const IPOS_11_COLUMN_HEADERS_VN = [
  'Mã hàng hóa (*)',
  'Tên hàng hoá',
  'Mã đơn vị tính (*)',
  'Số lượng (*)',
  'Đơn giá',
  'Giảm giá (%)',
  'Tiền giảm giá',
  'Vat',
  'Tiền vat',
  'Ghi chú',
  'Tổng',
];

export const IPOS_11_COLUMN_KEYS = [
  'item_id',
  'item_name',
  'unit_id',
  'quantity',
  'price',
  'discount',
  'discount_amount',
  'vat',
  'amount_vat',
  'note',
  'sub_total',
];

/**
 * Builds a pristine, canonical iPOS purchase import workbook with the exact 2-row header structure.
 */
export function createDefaultIposImportTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {
    '!ref': 'A1:K2',
    '!cols': [
      { wch: 18 }, // Mã hàng hóa (*) [item_id]
      { wch: 36 }, // Tên hàng hoá [item_name]
      { wch: 20 }, // Mã đơn vị tính (*) [unit_id]
      { wch: 14 }, // Số lượng (*) [quantity]
      { wch: 16 }, // Đơn giá [price]
      { wch: 14 }, // Giảm giá (%) [discount]
      { wch: 16 }, // Tiền giảm giá [discount_amount]
      { wch: 12 }, // Vat [vat]
      { wch: 16 }, // Tiền vat [amount_vat]
      { wch: 24 }, // Ghi chú [note]
      { wch: 18 }, // Tổng [sub_total]
    ],
  };

  for (let c = 0; c < IPOS_11_COLUMN_HEADERS_VN.length; c++) {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: IPOS_11_COLUMN_HEADERS_VN[c] };
    ws[XLSX.utils.encode_cell({ r: 1, c })] = { t: 's', v: IPOS_11_COLUMN_KEYS[c] };
  }

  XLSX.utils.book_append_sheet(wb, ws, IPOS_DEFAULT_SHEET_NAME);
  return wb;
}

/**
 * Returns a template ArrayBuffer for template-based reading via XLSX.read.
 */
export function getDefaultIposImportTemplateArrayBuffer(): ArrayBuffer {
  const wb = createDefaultIposImportTemplateWorkbook();
  const u8arr = XLSX.write(wb, { bookType: 'xlsx', bookSST: true, type: 'array' });
  return u8arr.buffer;
}

/**
 * Triggers download of the default iPOS purchase import template.
 */
export function downloadDefaultIposTemplate(fileName = 'MAU_NHAP_MUA_HANG_IPOS_CHUAN.xlsx'): void {
  const wb = createDefaultIposImportTemplateWorkbook();
  writeXlsxFile(wb, fileName);
}

// -------------------------------------------------------------
// CLEAN CELL UTILITIES (PREVENTS EMPTY STRING ARTIFACTS IN SST)
// -------------------------------------------------------------

/**
 * Creates a clean XLSX WorkSheet from array-of-arrays without empty string ("") cells.
 * Numbers are strictly typed as 'n' and non-empty strings as 's'.
 */
export function createWorksheetFromAoaClean(
  data: any[][],
  colsWidth?: Array<{ wch: number }>
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxR = 0;
  let maxC = 0;

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val === null || val === undefined) continue;

      if (typeof val === 'number') {
        if (!isNaN(val)) {
          ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v: val };
          maxR = Math.max(maxR, r);
          maxC = Math.max(maxC, c);
        }
      } else {
        const str = String(val).trim();
        // DO NOT write empty string "" to avoid useless entries in sharedStrings.xml
        if (str.length > 0) {
          ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: str };
          maxR = Math.max(maxR, r);
          maxC = Math.max(maxC, c);
        }
      }
    }
  }

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, maxR), c: Math.max(0, maxC) },
  });

  if (colsWidth && colsWidth.length > 0) {
    ws['!cols'] = colsWidth;
  }

  return ws;
}

// -------------------------------------------------------------
// GENERATE EXCEL PURCHASE INVOICE EXPORT FOR IPOS IMPORT
// -------------------------------------------------------------

export function generateIposExportWorkbook(
  masterData: IposMasterData,
  rows: MatchedInvoiceRow[],
  meta: {
    supplierName?: string;
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
  const rowsToExport = rows && rows.length > 0 ? rows : [];

  // Step 1: Create the canonical 11-column iPOS purchase import workbook directly
  const workbook = createDefaultIposImportTemplateWorkbook();
  const sheet = workbook.Sheets[IPOS_DEFAULT_SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error(`Không tìm thấy bảng tính hợp lệ (${IPOS_DEFAULT_SHEET_NAME})`);
  }

  // Step 2: Populate detail rows starting at Row 3 (0-indexed r = 2) matching image.png exactly
  const currentRow = 2;

  rowsToExport.forEach((row, idx) => {
    const r = currentRow + idx;
    const resolvedUnitCode = resolveIposExportUnitCode(row, masterData);
    const resolvedItemName = row.item_name || row.selectedCandidate?.itemName || row.raw_item_name || '';
    const resolvedItemId = row.item_id || row.selectedCandidate?.itemId || '';

    const qty = typeof row.quantity === 'number' ? row.quantity : Number(row.quantity) || 0;
    const price = typeof row.price === 'number' ? row.price : Number(row.price) || 0;
    const discount = typeof row.discount === 'number' ? row.discount : Number(row.discount) || 0;
    const discountAmount =
      row.discount_amount !== undefined && row.discount_amount !== null
        ? Number(row.discount_amount)
        : (qty * price * discount) / 100;
    const subTotal =
      row.sub_total !== undefined && row.sub_total !== null
        ? Number(row.sub_total)
        : qty * price - discountAmount;
    const vatPct = typeof row.vat === 'number' ? row.vat : Number(row.vat) || 0;
    const amountVat =
      row.amount_vat !== undefined && row.amount_vat !== null
        ? Number(row.amount_vat)
        : (subTotal * vatPct) / 100;
    const totalAmount =
      row.total_amount !== undefined && row.total_amount !== null
        ? Number(row.total_amount)
        : subTotal + amountVat;

    // Col A (0): item_id (string)
    if (resolvedItemId && resolvedItemId.trim().length > 0) {
      sheet[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 's', v: resolvedItemId.trim() };
    }

    // Col B (1): item_name (string)
    if (resolvedItemName && resolvedItemName.trim().length > 0) {
      sheet[XLSX.utils.encode_cell({ r, c: 1 })] = { t: 's', v: resolvedItemName.trim() };
    }

    // Col C (2): unit_id (string)
    if (resolvedUnitCode && resolvedUnitCode.trim().length > 0) {
      sheet[XLSX.utils.encode_cell({ r, c: 2 })] = { t: 's', v: resolvedUnitCode.trim() };
    }

    // Col D (3): quantity (number)
    sheet[XLSX.utils.encode_cell({ r, c: 3 })] = { t: 'n', v: qty };

    // Col E (4): price (number)
    sheet[XLSX.utils.encode_cell({ r, c: 4 })] = { t: 'n', v: price };

    // Col F (5): discount (number)
    sheet[XLSX.utils.encode_cell({ r, c: 5 })] = { t: 'n', v: discount };

    // Col G (6): discount_amount (number)
    sheet[XLSX.utils.encode_cell({ r, c: 6 })] = { t: 'n', v: discountAmount };

    // Col H (7): vat (number)
    sheet[XLSX.utils.encode_cell({ r, c: 7 })] = { t: 'n', v: vatPct };

    // Col I (8): amount_vat (number)
    sheet[XLSX.utils.encode_cell({ r, c: 8 })] = { t: 'n', v: amountVat };

    // Col J (9): note (string, omit if empty)
    const noteText = (row.note || '').trim();
    if (noteText.length > 0) {
      sheet[XLSX.utils.encode_cell({ r, c: 9 })] = { t: 's', v: noteText };
    }

    // Col K (10): sub_total (number)
    sheet[XLSX.utils.encode_cell({ r, c: 10 })] = { t: 'n', v: totalAmount };
  });

  // Step 3: Update worksheet reference range
  const endRow = Math.max(1, 1 + rowsToExport.length);
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: endRow, c: 10 },
  });

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
// DEDICATED CATALOG EXPORTERS (WITH SST & CLEAN CELLS)
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
    it.unitId,
    it.unitName,
    it.costPrice,
    it.category,
    it.barcode,
    it.status || 'Đang dùng',
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 18 },
    { wch: 32 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Hàng hoá');
  writeXlsxFile(wb, fileName);
}

export function exportCategoriesToExcel(cats: IposItemCategory[], fileName = 'DANH_SACH_NHOM_HANG_HOA_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã nhóm (*)', 'Tên nhóm hàng (*)', 'Nhóm cha', 'Mô tả'];
  const rows = cats.map((c, idx) => [idx + 1, c.categoryId, c.categoryName, c.parentCategoryId, c.description]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 18 },
    { wch: 28 },
    { wch: 18 },
    { wch: 30 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Nhóm hàng hoá');
  writeXlsxFile(wb, fileName);
}

export function exportUnitsToExcel(units: IposUnit[], fileName = 'MAU_NHAP_DON_VI_TINH_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã đơn vị tính (*)', 'Tên đơn vị tính (*)', 'Mô tả'];
  const rows = units.map((u, idx) => [idx + 1, u.unitId, u.unitName, u.description]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 20 },
    { wch: 24 },
    { wch: 30 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Đơn vị tính');
  writeXlsxFile(wb, fileName);
}

export function exportConversionsToExcel(convs: IposUnitConversion[], fileName = 'DANH_SACH_QUY_DOI_DON_VI_TINH_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT quy đổi (Nguồn)', 'ĐVT gốc (Đích)', 'Tỷ lệ quy đổi', 'Mô tả'];
  const rows = convs.map((c, idx) => [
    idx + 1,
    c.itemId,
    c.itemName,
    c.sourceUnitName,
    c.targetUnitName,
    c.conversionRate,
    c.description,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 18 },
    { wch: 28 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 28 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Quy đổi ĐVT');
  writeXlsxFile(wb, fileName);
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
    r.note,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 26 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 24 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Công thức chế biến');
  writeXlsxFile(wb, fileName);
}

export function exportWarehousesToExcel(warehouses: IposWarehouse[], fileName = 'DANH_SACH_KHO_HANG_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã kho (*)', 'Tên kho (*)', 'Mã chi nhánh', 'Địa chỉ', 'Số điện thoại'];
  const rows = warehouses.map((w, idx) => [
    idx + 1,
    w.warehouseId,
    w.warehouseName,
    w.branchId,
    w.address,
    w.phone,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 30 },
    { wch: 18 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Kho hàng');
  writeXlsxFile(wb, fileName);
}

export function exportCustomersToExcel(customers: IposCustomer[], fileName = 'DANH_SACH_KHACH_HANG_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã khách hàng (*)', 'Tên khách hàng (*)', 'Số điện thoại', 'Địa chỉ', 'Mã số thuế', 'Nhóm khách'];
  const rows = customers.map((c, idx) => [
    idx + 1,
    c.customerId,
    c.customerName,
    c.phone,
    c.address,
    c.taxCode,
    c.customerGroup,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 18 },
    { wch: 26 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 18 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
  writeXlsxFile(wb, fileName);
}

export function exportSuppliersToExcel(suppliers: IposSupplier[], fileName = 'DANH_SACH_NHA_CUNG_CAP_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã NCC (*)', 'Tên nhà cung cấp (*)', 'Mã số thuế', 'Số điện thoại', 'Địa chỉ', 'Nhóm NCC'];
  const rows = suppliers.map((s, idx) => [
    idx + 1,
    s.supplierId,
    s.supplierName,
    s.taxCode,
    s.phone,
    s.address,
    s.supplierGroup,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 16 },
    { wch: 30 },
    { wch: 18 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Nhà cung cấp');
  writeXlsxFile(wb, fileName);
}

export function exportSupplierGroupsToExcel(groups: IposSupplierGroup[], fileName = 'DANH_SACH_NHOM_NHA_CUNG_CAP_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã nhóm NCC (*)', 'Tên nhóm NCC (*)', 'Mô tả'];
  const rows = groups.map((g, idx) => [
    idx + 1,
    g.groupId || g.supplierGroupId,
    g.groupName || g.supplierGroupName,
    g.description,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 18 },
    { wch: 26 },
    { wch: 30 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Nhóm NCC');
  writeXlsxFile(wb, fileName);
}

export function exportReasonsToExcel(reasons: IposReason[], fileName = 'DANH_SACH_LY_DO_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã lý do (*)', 'Tên lý do (*)', 'Loại lý do', 'Mô tả', 'Mặc định'];
  const rows = reasons.map((r, idx) => [
    idx + 1,
    r.reasonId,
    r.reasonName,
    r.reasonType,
    r.description,
    r.isDefault ? 'Có' : 'Không',
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Lý do');
  writeXlsxFile(wb, fileName);
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
    p.unitName,
    p.price,
    p.effectiveDate,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 26 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Bảng giá');
  writeXlsxFile(wb, fileName);
}

export function exportStockNormsToExcel(norms: IposStockNorm[], fileName = 'DINH_MUC_TON_KHO_IPOS.xlsx'): void {
  const wb = XLSX.utils.book_new();
  const headers = ['STT', 'Mã hàng', 'Tên hàng', 'Mã kho', 'Tên kho', 'Tồn tối thiểu (Min)', 'Tồn tối đa (Max)', 'ĐVT'];
  const rows = norms.map((n, idx) => [
    idx + 1,
    n.itemId,
    n.itemName,
    n.warehouseId,
    n.warehouseName,
    n.minStock,
    n.maxStock,
    n.unitName,
  ]);
  const ws = createWorksheetFromAoaClean([headers, ...rows], [
    { wch: 8 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Định mức tồn kho');
  writeXlsxFile(wb, fileName);
}
