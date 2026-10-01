import * as XLSX from 'xlsx';
import { IposReceiptLine, VendorInvoiceLine } from '../types';
import { cleanHeaderText } from './excel';
import { parseVietnameseNumber } from './vietnamese';

/**
 * Parser for IVT iPOS Excel Reports
 * Specifically:
 * - "Báo cáo chi tiết mua hàng"
 * - "Bảng kê phiếu nhập mua hàng"
 * - "Sổ chi tiết nguyên vật liệu"
 */

export function parseIposReceiptExcel(
  workbook: XLSX.WorkBook,
  fileName?: string
): IposReceiptLine[] {
  let sheet: XLSX.WorkSheet | null = null;
  let range: XLSX.Range | null = null;
  let headerRowIndex = -1;
  const colMap: Record<string, number> = {};

  // Scan through all sheets to find the one containing iPOS receipt headers
  for (const sheetName of workbook.SheetNames) {
    const candidateSheet = workbook.Sheets[sheetName];
    if (!candidateSheet) continue;
    const candidateRange = XLSX.utils.decode_range(candidateSheet['!ref'] || 'A1:Z100');

    for (let r = candidateRange.s.r; r <= Math.min(candidateRange.e.r, candidateRange.s.r + 30); r++) {
      const tempMap: Record<string, number> = {};
      let matchedKeywords = 0;

      for (let c = candidateRange.s.c; c <= candidateRange.e.c; c++) {
        const cell = candidateSheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined) continue;
        const norm = cleanHeaderText(String(cell.v));
        if (!norm) continue;

        if (
          norm === 'ma phieu' ||
          norm === 'so phieu' ||
          norm === 'so chung tu' ||
          norm === 'ma chung tu' ||
          norm.includes('receipt') ||
          norm.includes('voucher')
        ) {
          tempMap['receipt_number'] = c;
          matchedKeywords++;
        } else if (
          norm === 'ngay' ||
          norm === 'ngay lap' ||
          norm === 'ngay chung tu' ||
          norm === 'ngay nhap' ||
          norm.includes('date')
        ) {
          tempMap['receipt_date'] = c;
          matchedKeywords++;
        } else if (
          norm === 'ma ncc' ||
          norm === 'ma nha cung cap' ||
          norm.includes('supplier code')
        ) {
          tempMap['supplier_code'] = c;
          matchedKeywords++;
        } else if (
          norm === 'nha cung cap' ||
          norm === 'ten ncc' ||
          norm === 'ten nha cung cap' ||
          norm.includes('supplier name')
        ) {
          tempMap['supplier_name'] = c;
          matchedKeywords++;
        } else if (
          norm === 'ma kho' ||
          norm === 'kho nhap' ||
          norm === 'ma kho nhap' ||
          norm.includes('warehouse')
        ) {
          tempMap['warehouse_code'] = c;
        } else if (
          norm === 'ma hang' ||
          norm === 'ma hang hoa' ||
          norm === 'ma vat tu' ||
          norm.includes('item code')
        ) {
          tempMap['item_id'] = c;
          matchedKeywords++;
        } else if (
          norm === 'ten hang' ||
          norm === 'ten hang hoa' ||
          norm === 'ten vat tu' ||
          norm.includes('item name')
        ) {
          tempMap['item_name'] = c;
          matchedKeywords++;
        } else if (
          norm === 'dvt' ||
          norm === 'don vi tinh' ||
          norm === 'don vi' ||
          norm.includes('unit')
        ) {
          tempMap['unit_name'] = c;
          matchedKeywords++;
        } else if (
          norm === 'so luong' ||
          norm === 'sl' ||
          norm === 'sl thuc nhap' ||
          norm === 'so luong thuc nhap' ||
          norm.includes('quantity') ||
          norm.includes('qty')
        ) {
          tempMap['quantity'] = c;
          matchedKeywords++;
        } else if (
          norm === 'don gia' ||
          norm === 'don gia nhap' ||
          norm === 'gia mua' ||
          norm.includes('unit price') ||
          norm.includes('price')
        ) {
          tempMap['unit_price'] = c;
          matchedKeywords++;
        } else if (
          norm === 'thanh tien' ||
          norm === 'tien hang' ||
          norm === 'tien truoc thue' ||
          norm.includes('amount')
        ) {
          tempMap['amount'] = c;
          matchedKeywords++;
        } else if (
          norm === 'thue' ||
          norm === 'vat' ||
          norm === 'tien thue' ||
          norm.includes('vat amount')
        ) {
          tempMap['vat_amount'] = c;
        } else if (
          norm === 'tong tien' ||
          norm === 'tong thanh toan' ||
          norm === 'tong cong' ||
          norm.includes('total')
        ) {
          tempMap['total_amount'] = c;
        } else if (
          norm === 'so hd' ||
          norm === 'so hoa don' ||
          norm.includes('invoice no')
        ) {
          tempMap['invoice_ref'] = c;
        } else if (
          norm === 'ghi chu' ||
          norm === 'dien giai' ||
          norm.includes('note')
        ) {
          tempMap['note'] = c;
        }
      }

      if (matchedKeywords >= 4) {
        sheet = candidateSheet;
        range = candidateRange;
        headerRowIndex = r;
        Object.assign(colMap, tempMap);
        break;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (!sheet || !range || headerRowIndex === -1) {
    throw new Error(
      'Không thể nhận diện tiêu đề báo cáo iPOS. Vui lòng đảm bảo file có các cột: Mã/Số phiếu, Tên hàng, ĐVT, Số lượng, Đơn giá.'
    );
  }

  // 2. Iterate data rows with unmerge / fill-down support
  const rows: IposReceiptLine[] = [];

  let currentReceiptNumber = '';
  let currentReceiptDate = '';
  let currentSupplierName = 'Nhà cung cấp';
  let currentSupplierCode = '';
  let currentWarehouseCode = '';
  let currentInvoiceRef = '';

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const getCellStr = (colKey: string): string => {
      const c = colMap[colKey];
      if (c === undefined) return '';
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v === undefined) return '';
      if (cell.w !== undefined) return String(cell.w).trim();
      return String(cell.v).trim();
    };

    const getCellNum = (colKey: string): number => {
      const s = getCellStr(colKey);
      return parseVietnameseNumber(s) || 0;
    };

    // Update fill-down header context if present
    const rNum = getCellStr('receipt_number');
    if (rNum) currentReceiptNumber = rNum;

    const rDate = getCellStr('receipt_date');
    if (rDate) currentReceiptDate = rDate;

    const sName = getCellStr('supplier_name');
    if (sName) currentSupplierName = sName;

    const sCode = getCellStr('supplier_code');
    if (sCode) currentSupplierCode = sCode;

    const wCode = getCellStr('warehouse_code');
    if (wCode) currentWarehouseCode = wCode;

    const invRef = getCellStr('invoice_ref');
    if (invRef) currentInvoiceRef = invRef;

    // Line item fields
    const itemName = getCellStr('item_name');
    const itemId = getCellStr('item_id');
    const unitName = getCellStr('unit_name') || 'kg';
    const quantity = getCellNum('quantity');
    const unitPrice = getCellNum('unit_price');
    let amount = getCellNum('amount');

    // Skip summary / empty rows
    if (!itemName && !quantity && !unitPrice) continue;
    if (itemName.toLowerCase().includes('tổng cộng') || itemName.toLowerCase().includes('cộng nhóm')) continue;

    if (!amount && quantity && unitPrice) {
      amount = Math.round(quantity * unitPrice);
    }

    const vatAmount = getCellNum('vat_amount');
    let totalAmount = getCellNum('total_amount');
    if (!totalAmount) {
      totalAmount = amount + vatAmount;
    }

    rows.push({
      id: `ipos_rec_${currentReceiptNumber || 'PN'}_${r}_${Date.now()}`,
      receiptNumber: currentReceiptNumber || `PN${r}`,
      receiptDate: currentReceiptDate || new Date().toISOString().split('T')[0],
      supplierCode: currentSupplierCode,
      supplierName: currentSupplierName,
      warehouseCode: currentWarehouseCode,
      itemId,
      itemName,
      unitName,
      quantity,
      unitPrice,
      amount,
      vatAmount,
      totalAmount,
      invoiceNoRef: currentInvoiceRef,
      note: getCellStr('note'),
      sourceFile: fileName,
    });
  }

  return rows;
}

/**
 * Built-in Generator for Realistic F&B Reconciliation Demonstration
 * Real restaurant scenario:
 * Supplier: "Công ty Cổ phần Thực phẩm Sạch Minh Phát"
 * Products: Ba chỉ heo, Bắp cải trắng, Sữa đặc Ông Thọ, Dầu ăn Simply, Thịt bò ba chỉ Úc
 * Contains:
 * - 1 Perfect match
 * - 1 Price creep (NCC tăng giá 15k/kg)
 * - 1 Quantity loss on fresh meat (Kho thực nhận 19.2 kg nhưng HĐ tính 20.0 kg)
 * - 1 N-to-1 Match (3 phiếu giao hàng gộp lại thành 1 dòng HĐ)
 * - 1 Missing invoice (Phiếu nhập chưa có HĐ)
 */
export function generateSampleReconciliationData(): {
  iposLines: IposReceiptLine[];
  invoiceLines: VendorInvoiceLine[];
} {
  const supplierName = 'Công ty Cổ phần Thực phẩm Sạch Minh Phát';
  const sellerTaxCode = '0108923456';

  const iposLines: IposReceiptLine[] = [
    // 1. Thịt ba chỉ heo - Gộp N phiếu (3 đợt giao: ngày 05, 12, 19)
    {
      id: 'ipos_p1',
      receiptNumber: 'PN240905-001',
      receiptDate: '2026-09-05',
      supplierName,
      warehouseCode: 'KHO_TONG',
      itemId: 'CP07',
      itemName: 'Ba chỉ heo',
      unitName: 'kg',
      quantity: 15.0,
      unitPrice: 135000,
      amount: 2025000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 2025000,
      note: 'Giao đợt 1',
    },
    {
      id: 'ipos_p2',
      receiptNumber: 'PN240912-004',
      receiptDate: '2026-09-12',
      supplierName,
      warehouseCode: 'KHO_TONG',
      itemId: 'CP07',
      itemName: 'Ba chỉ heo',
      unitName: 'kg',
      quantity: 20.0,
      unitPrice: 135000,
      amount: 2700000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 2700000,
      note: 'Giao đợt 2',
    },
    {
      id: 'ipos_p3',
      receiptNumber: 'PN240919-002',
      receiptDate: '2026-09-19',
      supplierName,
      warehouseCode: 'KHO_TONG',
      itemId: 'CP07',
      itemName: 'Ba chỉ heo',
      unitName: 'kg',
      quantity: 15.0,
      unitPrice: 135000,
      amount: 2025000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 2025000,
      note: 'Giao đợt 3',
    },

    // 2. Thịt bò ba chỉ Úc - Thực tế nhận 19.2 kg (lệch mất nước 0.8kg so với HĐ xuất 20kg)
    {
      id: 'ipos_p4',
      receiptNumber: 'PN240920-008',
      receiptDate: '2026-09-20',
      supplierName,
      warehouseCode: 'KHO_BEP',
      itemId: 'HH0001',
      itemName: 'Thịt bò ba chỉ Úc đông lạnh',
      unitName: 'kg',
      quantity: 19.2,
      unitPrice: 195000,
      amount: 3744000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 3744000,
      note: 'Cân thực nhận tại bếp: 19.2kg (bao bì hao hụt 0.8kg)',
    },

    // 3. Sữa tươi tiệt trùng TH True Milk - Lệch đơn giá (NCC tự ý tăng lên 38.000đ, thỏa thuận là 34.000đ)
    {
      id: 'ipos_p5',
      receiptNumber: 'PN240922-003',
      receiptDate: '2026-09-22',
      supplierName,
      warehouseCode: 'KHO_BAR',
      itemId: 'HH0003',
      itemName: 'Sữa tươi tiệt trùng TH True Milk không đường 1L',
      unitName: 'hộp',
      quantity: 60,
      unitPrice: 34000,
      amount: 2040000,
      vatRate: 8,
      vatAmount: 163200,
      totalAmount: 2203200,
      note: 'Giá PO thỏa thuận: 34.000đ/hộp',
    },

    // 4. Dầu ăn Simply 5L - Khớp hoàn toàn 100%
    {
      id: 'ipos_p6',
      receiptNumber: 'PN240924-001',
      receiptDate: '2026-09-24',
      supplierName,
      warehouseCode: 'KHO_BEP',
      itemId: 'HH0014',
      itemName: 'Dầu ăn Simply đậu nành 5L',
      unitName: 'can',
      quantity: 10,
      unitPrice: 275000,
      amount: 2750000,
      vatRate: 8,
      vatAmount: 220000,
      totalAmount: 2970000,
      note: 'Khớp 100%',
    },

    // 5. Cà chua bi tươi Đà Lạt - Đã nhập kho ngày 28 nhưng NCC chưa xuất HĐ (Missing Invoice)
    {
      id: 'ipos_p7',
      receiptNumber: 'PN240928-005',
      receiptDate: '2026-09-28',
      supplierName,
      warehouseCode: 'KHO_BEP',
      itemId: 'HH0006',
      itemName: 'Cà chua bi tươi Đà Lạt',
      unitName: 'kg',
      quantity: 25,
      unitPrice: 35000,
      amount: 875000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 875000,
      note: 'Hàng đã về bếp, đang đợi HĐ điện tử cuối tháng',
    },
  ];

  const invoiceLines: VendorInvoiceLine[] = [
    // 1. Hóa đơn dòng 1: Gom Ba chỉ heo (Tổng 50 kg - Khớp hoàn hảo với 3 phiếu nhập 15+20+15)
    {
      id: 'inv_line_1',
      invoiceNumber: '0004521',
      invoiceSymbol: '1C24TMP',
      invoiceDate: '2026-09-28',
      sellerTaxCode,
      sellerName: supplierName,
      itemName: 'Thịt ba chỉ heo sạch CP',
      unitName: 'kg',
      quantity: 50.0,
      unitPrice: 135000,
      amount: 6750000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 6750000,
      sourceType: 'XML_E_INVOICE',
    },

    // 2. Hóa đơn dòng 2: Bò ba chỉ Úc - NCC xuất 20 kg (Lệch số lượng +0.8 kg = 156.000 đ)
    {
      id: 'inv_line_2',
      invoiceNumber: '0004521',
      invoiceSymbol: '1C24TMP',
      invoiceDate: '2026-09-28',
      sellerTaxCode,
      sellerName: supplierName,
      itemName: 'Ba chỉ bò Úc đông lạnh',
      unitName: 'kg',
      quantity: 20.0,
      unitPrice: 195000,
      amount: 3900000,
      vatRate: 0,
      vatAmount: 0,
      totalAmount: 3900000,
      sourceType: 'XML_E_INVOICE',
    },

    // 3. Hóa đơn dòng 3: Sữa tươi TH True Milk - NCC tính giá 38.000đ (Lệch giá +4.000đ/hộp = 240.000 đ + VAT)
    {
      id: 'inv_line_3',
      invoiceNumber: '0004521',
      invoiceSymbol: '1C24TMP',
      invoiceDate: '2026-09-28',
      sellerTaxCode,
      sellerName: supplierName,
      itemName: 'Sữa tươi tiệt trùng TH True Milk không đường 1L',
      unitName: 'hộp',
      quantity: 60,
      unitPrice: 38000,
      amount: 2280000,
      vatRate: 8,
      vatAmount: 182400,
      totalAmount: 2462400,
      sourceType: 'XML_E_INVOICE',
    },

    // 4. Hóa đơn dòng 4: Dầu ăn Simply - Khớp hoàn toàn
    {
      id: 'inv_line_4',
      invoiceNumber: '0004521',
      invoiceSymbol: '1C24TMP',
      invoiceDate: '2026-09-28',
      sellerTaxCode,
      sellerName: supplierName,
      itemName: 'Dầu đậu nành Simply 5L',
      unitName: 'can',
      quantity: 10,
      unitPrice: 275000,
      amount: 2750000,
      vatRate: 8,
      vatAmount: 220000,
      totalAmount: 2970000,
      sourceType: 'XML_E_INVOICE',
    },

    // 5. Hóa đơn dòng 5: Hóa đơn tính thêm 1 món mà trên iPOS chưa nhập kho (Unmatched Invoice)
    {
      id: 'inv_line_5',
      invoiceNumber: '0004521',
      invoiceSymbol: '1C24TMP',
      invoiceDate: '2026-09-28',
      sellerTaxCode,
      sellerName: supplierName,
      itemName: 'Hạt nêm Knorr thịt thăn & xương ống 1kg',
      unitName: 'gói',
      quantity: 5,
      unitPrice: 78000,
      amount: 390000,
      vatRate: 8,
      vatAmount: 31200,
      totalAmount: 421200,
      sourceType: 'XML_E_INVOICE',
    },
  ];

  return { iposLines, invoiceLines };
}
