import { IposReceiptLine } from '../types';

/**
 * 3-Way Matching: Convert OCR scanned paper delivery notes / thermal slips into IposReceiptLine format
 */
export async function parseDeliveryNoteImage(
  file: File,
  warehouseCode = 'KHO_TONG'
): Promise<IposReceiptLine[]> {
  const reader = new FileReader();

  const base64Data = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await fetch('/api/extract-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64Data,
      mimeType: file.type || 'image/jpeg',
      fileName: file.name,
    }),
  });

  const resJson = await response.json();
  if (!resJson.success || !resJson.data) {
    throw new Error(resJson.error || 'Không thể trích xuất phiếu giao hàng giấy');
  }

  const raw = resJson.data;
  const supplierName = raw.supplier_raw_name || 'Nhà cung cấp (Phiếu giao hàng giấy)';
  const receiptNumber = raw.invoice_number || `PGH-${Date.now().toString().slice(-6)}`;
  const receiptDate = raw.document_date || new Date().toISOString().split('T')[0];

  const results: IposReceiptLine[] = (raw.rows || []).map((r: any, idx: number) => {
    const qty = Number(r.quantity) || 1;
    const price = Number(r.price) || 0;
    const amt = Number(r.amount) || Math.round(qty * price);

    return {
      id: `pgh_ocr_${receiptNumber}_${idx + 1}_${Date.now()}`,
      receiptNumber,
      receiptDate,
      supplierName,
      warehouseCode,
      itemName: r.raw_item_name || `Món ${idx + 1}`,
      unitName: r.raw_unit || 'kg',
      quantity: qty,
      unitPrice: price,
      amount: amt,
      totalAmount: amt,
      note: `Phiếu giấy OCR (${file.name})` + (r.review_reason ? ` • ${r.review_reason}` : ''),
      sourceFile: file.name,
    };
  });

  return results;
}
