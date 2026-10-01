import * as XLSX from 'xlsx';
import { ReconciliationMatchPair, ReconciliationSummary } from '../types';

/**
 * Export Reconciliation Result to Professional Excel Report
 * "Biên bản Đối soát Chi tiết Công nợ & Hàng hóa gửi Nhà Cung Cấp"
 */
export function exportReconciliationToExcel(
  supplierName: string,
  pairs: ReconciliationMatchPair[],
  summary: ReconciliationSummary,
  periodTitle = 'Kỳ đối soát tháng hiện tại'
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Bảng tổng hợp & Biên bản đối soát
  const headerData = [
    ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
    ['Độc lập - Tự do - Hạnh phúc'],
    [''],
    ['BIÊN BẢN ĐỐI SOÁT CÔNG NỢ & HÀNG HÓA NHẬP KHO (IVT iPOS vs HÓA ĐƠN NCC)'],
    [`Nhà cung cấp: ${supplierName || 'Tất cả Nhà Cung Cấp'}`],
    [`Thời gian đối soát: ${periodTitle} - Xuất ngày: ${new Date().toLocaleDateString('vi-VN')}`],
    [''],
    [
      'TỔNG KẾT ĐỐI SOÁT:',
      `Tổng số mục: ${summary.totalPairs}`,
      `Khớp 100%: ${summary.perfectMatchCount} mục (${summary.matchRatePercent}%)`,
      `Lệch đơn giá: ${summary.priceDiffCount} mục`,
      `Lệch số lượng: ${summary.qtyDiffCount} mục`,
    ],
    [
      `Tổng tiền thực nhận (iPOS): ${summary.totalIposAmount.toLocaleString('vi-VN')} đ`,
      `Tổng tiền Hóa đơn NCC: ${summary.totalInvoiceAmount.toLocaleString('vi-VN')} đ`,
      `TỔNG TIỀN TÍNH THỪA (ĐỀ NGHỊ TRỪ CÔNG NỢ): ${summary.totalOverchargedAmount.toLocaleString('vi-VN')} đ`,
    ],
    [''],
    [
      'STT',
      'Tên hàng hóa',
      'ĐVT',
      'Số lượng iPOS',
      'Đơn giá iPOS (đ)',
      'Thành tiền iPOS (đ)',
      'Số lượng HĐ',
      'Đơn giá HĐ (đ)',
      'Thành tiền HĐ (đ)',
      'Chênh lệch SL (HĐ - iPOS)',
      'Chênh lệch Giá (đ)',
      'TIỀN CHÊNH LỆCH (đ)',
      'Trạng thái',
      'Đề xuất xử lý',
      'Mã phiếu iPOS / Số HĐ đối ứng',
    ],
  ];

  const rowData = pairs.map((p, idx) => {
    const iposReceiptRefs = p.iposLines.map((l) => `${l.receiptNumber} (${l.receiptDate})`).join(', ');
    const invRef = p.invoiceLine ? `HĐ: ${p.invoiceLine.invoiceNumber} (${p.invoiceLine.invoiceDate})` : 'Chưa có HĐ';
    const combinedRefs = [iposReceiptRefs, invRef].filter(Boolean).join(' <=> ');

    let statusText = 'Khớp 100%';
    if (p.status === 'PRICE_DIFF') statusText = 'Lệch đơn giá';
    else if (p.status === 'QUANTITY_DIFF') statusText = 'Lệch số lượng (thiếu hàng)';
    else if (p.status === 'PRICE_AND_QTY_DIFF') statusText = 'Lệch cả giá và lượng';
    else if (p.status === 'UNMATCHED_IPOS') statusText = 'Đã nhập kho - Chưa có HĐ';
    else if (p.status === 'UNMATCHED_INVOICE') statusText = 'HĐ xuất thừa - Chưa nhập kho';

    let actionText = 'Đồng ý thanh toán';
    if (p.suggestedAction === 'DEBIT_VENDOR') actionText = 'TRỪ TIỀN CÔNG NỢ';
    else if (p.suggestedAction === 'CHECK_DELIVERY_NOTE') actionText = 'Kiểm tra phiếu cân tươi sống';
    else if (p.suggestedAction === 'UPDATE_IPOS') actionText = 'Bổ sung phiếu nhập kho iPOS';

    return [
      idx + 1,
      p.matchedItemName,
      p.iposLines[0]?.unitName || p.invoiceLine?.unitName || 'kg',
      p.iposQty,
      p.iposPrice,
      p.iposAmount,
      p.invoiceQty,
      p.invoicePrice,
      p.invoiceAmount,
      p.qtyDelta,
      p.priceDelta,
      p.amountDelta,
      statusText,
      actionText,
      combinedRefs,
    ];
  });

  // Footer signature lines
  const footerData = [
    [''],
    ['ĐẠI DIỆN NHÀ HÀNG (QUẢN LÝ KHO / KẾ TOÁN)', '', '', '', '', '', '', 'ĐẠI DIỆN NHÀ CUNG CẤP'],
    ['(Ký, ghi rõ họ tên & đóng dấu)', '', '', '', '', '', '', '(Ký, ghi rõ họ tên & đóng dấu)'],
    [''],
    [''],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...headerData, ...rowData, ...footerData]);

  // Adjust column widths
  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 32 }, // Tên hàng
    { wch: 8 },  // ĐVT
    { wch: 14 }, // SL iPOS
    { wch: 16 }, // Giá iPOS
    { wch: 18 }, // Tiền iPOS
    { wch: 14 }, // SL HĐ
    { wch: 16 }, // Giá HĐ
    { wch: 18 }, // Tiền HĐ
    { wch: 15 }, // Delta SL
    { wch: 15 }, // Delta Giá
    { wch: 20 }, // Tiền chênh lệch
    { wch: 24 }, // Trạng thái
    { wch: 22 }, // Đề xuất xử lý
    { wch: 40 }, // Tham chiếu
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Bien_Ban_Doi_Soat');

  const safeSupplier = (supplierName || 'NCC').replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 30);
  const fileName = `Bien_ban_doi_soat_${safeSupplier}_${new Date().toISOString().split('T')[0]}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
