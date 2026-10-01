import { VendorInvoiceLine } from '../types';

/**
 * Universal XML Parser for Vietnamese e-Invoices (Nghị định 123/2020/NĐ-CP & Thông tư 78/2021/TT-BTC)
 * Compatible with: Viettel S-Invoice, VNPT, MISA meInvoice, BKAV, Fast, EasyInvoice, CyberBill, etc.
 */

function getElementText(parent: Element, tagNames: string[]): string {
  for (const tag of tagNames) {
    // 1. Direct tag name
    let el = parent.getElementsByTagName(tag)[0];
    if (el && el.textContent) return el.textContent.trim();

    // 2. Case insensitive search
    const allEls = parent.getElementsByTagName('*');
    for (let i = 0; i < allEls.length; i++) {
      const node = allEls[i];
      const localName = node.localName || node.nodeName.split(':').pop() || '';
      if (localName.toLowerCase() === tag.toLowerCase() && node.textContent) {
        return node.textContent.trim();
      }
    }
  }
  return '';
}

function findElement(parent: Element, tagNames: string[]): Element | null {
  for (const tag of tagNames) {
    const list = parent.getElementsByTagName(tag);
    if (list && list.length > 0) return list[0];
    const allEls = parent.getElementsByTagName('*');
    for (let i = 0; i < allEls.length; i++) {
      const node = allEls[i];
      const localName = node.localName || node.nodeName.split(':').pop() || '';
      if (localName.toLowerCase() === tag.toLowerCase()) {
        return node;
      }
    }
  }
  return null;
}

function parseNumber(val: string): number {
  if (!val) return 0;
  // Replace comma with dot if needed, handle thousand separators
  const clean = val.replace(/\s+/g, '').replace(/,/g, '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

export function parseEinvoiceXml(xmlContent: string, fileName?: string): VendorInvoiceLine[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

  // Check for parse error
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('File XML không đúng định dạng: ' + parserError.textContent?.slice(0, 100));
  }

  // Find invoice header fields
  const root = xmlDoc.documentElement;

  // Invoice Number
  const invoiceNumber =
    getElementText(root, ['SHDon', 'InvoiceNumber', 'No', 'InvNum', 'SoHDon']) ||
    getElementText(root, ['so_hd', 'so_hoa_don', 'invoice_no']) ||
    'HD-' + Math.floor(Math.random() * 10000);

  // Invoice Symbol
  const invoiceSymbol =
    getElementText(root, ['KHHDon', 'InvoiceSeries', 'Series', 'KyHieu', 'kh_hd']) || '1C24T';

  // Invoice Date
  let invoiceDate =
    getElementText(root, ['NLap', 'InvoiceDate', 'IssueDate', 'NgayLap', 'ngay_hd']) ||
    new Date().toISOString().split('T')[0];
  if (invoiceDate.includes('T')) {
    invoiceDate = invoiceDate.split('T')[0];
  }

  // Seller info scoped strictly to NBan / Seller block to avoid collision with buyer or currency
  const sellerBlock = findElement(root, ['NBan', 'Seller', 'Supplier', 'BenBan']);
  const sellerTaxCode = sellerBlock
    ? getElementText(sellerBlock, ['MST', 'SellerTaxCode', 'MaSoThue', 'mst_ban'])
    : getElementText(root, ['SellerTaxCode', 'mst_ban']) || '';

  const sellerName = sellerBlock
    ? getElementText(sellerBlock, ['Ten', 'SellerName', 'SupplierName', 'ten_ban'])
    : getElementText(root, ['SellerName', 'SupplierName', 'ten_ban']) || 'Nhà cung cấp HĐ ' + invoiceNumber;

  // Buyer info scoped strictly to NMua / Buyer block
  const buyerBlock = findElement(root, ['NMua', 'Buyer', 'Customer', 'BenMua']);
  const buyerTaxCode = buyerBlock
    ? getElementText(buyerBlock, ['MST', 'MSTTCN', 'BuyerTaxCode', 'MaSoThue', 'mst_mua'])
    : getElementText(root, ['BuyerTaxCode', 'mst_mua']) || '';

  // Invoice-level fallback VAT rate
  const globalVatStr = getElementText(root, ['LTSuat', 'TSuat', 'TaxRate', 'VATRate']);
  let globalVatRate = 0;
  if (globalVatStr.includes('10')) globalVatRate = 10;
  else if (globalVatStr.includes('8')) globalVatRate = 8;
  else if (globalVatStr.includes('5')) globalVatRate = 5;

  // Find all line items across different vendor tags
  const itemCandidateTags = [
    'HHDVu',
    'Item',
    'Row',
    'InvItem',
    'InvoiceItem',
    'DSHangHoa',
    'hang_hoa',
  ];

  let itemNodes: Element[] = [];
  for (const tag of itemCandidateTags) {
    const list = xmlDoc.getElementsByTagName(tag);
    if (list && list.length > 0) {
      itemNodes = Array.from(list);
      break;
    }
  }

  // Fallback: look for elements that have item-like children
  if (itemNodes.length === 0) {
    const all = xmlDoc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const hasName =
        getElementText(el, ['THHDVu', 'ItemName', 'TenHang', 'ten_vt', 'ProductName']).length > 0;
      const hasPrice =
        getElementText(el, ['DGia', 'UnitPrice', 'DonGia', 'gia', 'Price']).length > 0;
      if (hasName && hasPrice) {
        itemNodes.push(el);
      }
    }
  }

  const results: VendorInvoiceLine[] = [];

  for (let idx = 0; idx < itemNodes.length; idx++) {
    const node = itemNodes[idx];
    const itemName = getElementText(node, [
      'THHDVu',
      'ItemName',
      'TenHang',
      'ten_vt',
      'ProductName',
      'Ten',
    ]);
    if (!itemName) continue;

    const unitName =
      getElementText(node, ['DVTinh', 'UnitName', 'DonViTinh', 'dvt', 'Unit']) || 'kg';
    const quantity = parseNumber(
      getElementText(node, ['SLuong', 'Quantity', 'SoLuong', 'sl', 'Qty'])
    );
    const unitPrice = parseNumber(
      getElementText(node, ['DGia', 'UnitPrice', 'DonGia', 'gia', 'Price'])
    );
    let amount = parseNumber(
      getElementText(node, ['ThTien', 'Amount', 'ThanhTien', 'tien_hang', 'TotalAmount'])
    );

    // If amount is 0, compute from quantity and price
    if (!amount && quantity && unitPrice) {
      amount = Math.round(quantity * unitPrice);
    }

    // Tax rate and amount
    const vatRateStr = getElementText(node, ['TSuat', 'TaxRate', 'VATRate', 'thue_suat', 'VAT']);
    let vatRate = 0;
    if (vatRateStr.includes('10')) vatRate = 10;
    else if (vatRateStr.includes('8')) vatRate = 8;
    else if (vatRateStr.includes('5')) vatRate = 5;
    else if (globalVatRate > 0) vatRate = globalVatRate;

    let vatAmount = parseNumber(
      getElementText(node, ['TTienThue', 'TaxAmount', 'TienThue', 'tien_thue', 'VATAmount'])
    );
    if (!vatAmount && vatRate > 0 && amount > 0) {
      vatAmount = Math.round((amount * vatRate) / 100);
    }

    const discountAmount = parseNumber(
      getElementText(node, ['STCKhau', 'DiscountAmount', 'TienCK', 'chiet_khau'])
    );
    const totalAmount = amount + vatAmount - (discountAmount || 0);

    results.push({
      id: `inv_xml_${invoiceNumber}_${idx + 1}_${Date.now()}`,
      invoiceNumber,
      invoiceSymbol,
      invoiceDate,
      sellerTaxCode,
      sellerName,
      buyerTaxCode,
      itemName,
      unitName,
      quantity,
      unitPrice,
      amount,
      vatRate,
      vatAmount,
      totalAmount,
      discountAmount,
      sourceFile: fileName,
      sourceType: 'XML_E_INVOICE',
    });
  }

  return results;
}
