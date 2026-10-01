export type VisualCertainty = 'high' | 'medium' | 'low';

export type RowStatus = 'GREEN' | 'YELLOW' | 'RED';

// 1. Hàng hoá (Danh sách hàng hoá.xlsx)
export interface IposItem {
  itemId: string;
  itemName: string;
  unitId?: string;
  unitName?: string;
  category?: string;
  categoryId?: string;
  itemType?: number | string; // 0 - NVL (Nguyên vật liệu), 1 - Thành phẩm / Đồ uống / Món ăn
  costPrice?: number;
  barcode?: string;
  status?: string;
  description?: string;
  sourceSheet?: string;
  warning?: string;
  autoInferredUnit?: boolean;
}

// 2. Nhóm hàng hoá (Danh sách nhóm hàng hoá.xlsx)
export interface IposItemCategory {
  categoryId: string;
  categoryName: string;
  parentCategoryId?: string;
  description?: string;
}

// 3. Đơn vị tính (MAU_NHAP_DON_VI_TINH.xlsx)
export interface IposUnit {
  unitId: string;
  unitName: string;
  description?: string;
}

// 4. Quy đổi đơn vị tính (Danh sách quy đổi đơn vị tính.xlsx)
export interface IposUnitConversion {
  itemId?: string;
  itemName?: string;
  sourceUnitId?: string;
  sourceUnitName: string;
  targetUnitId?: string;
  targetUnitName: string;
  conversionRate: number; // e.g. 1 thùng = 24 lon -> conversionRate = 24
  description?: string;
}

// 5. Công thức chế biến / Định lượng BOM (Danh sách công thức chế biến.xlsx)
export interface IposRecipe {
  recipeId?: string;
  parentItemId: string;
  parentItemName: string;
  ingredientItemId: string;
  ingredientItemName: string;
  quantity: number;
  unitName: string;
  lossRate?: number; // % hao hụt
  note?: string;
}

// 6. Kho hàng (Danh sách kho hàng.xlsx)
export interface IposWarehouse {
  warehouseId: string;
  warehouseName: string;
  branchId?: string;
  address?: string;
  phone?: string;
}

// 7. Khách hàng (Danh sách khách hàng.xlsx)
export interface IposCustomer {
  customerId: string;
  customerName: string;
  phone?: string;
  address?: string;
  taxCode?: string;
  customerGroup?: string;
}

// 8. Nhà cung cấp (Danh sách nhà cung cấp.xlsx)
export interface IposSupplier {
  supplierId: string;
  supplierName: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  supplierGroup?: string;
}

// 9. Nhóm nhà cung cấp
export interface IposSupplierGroup {
  groupId: string;
  groupName: string;
  supplierGroupId?: string;
  supplierGroupName?: string;
  description?: string;
}

// 10. Bảng giá
export interface IposPriceList {
  priceListId: string;
  priceListName: string;
  itemId: string;
  itemName: string;
  unitName?: string;
  price: number;
  effectiveDate?: string;
}

// 11. Lý do nhập/xuất/điều chỉnh (Danh sách lý do.xlsx)
export interface IposReason {
  reasonId: string;
  reasonName: string;
  reasonType: 'NHAP' | 'XUAT' | 'DIEU_CHINH' | 'KHAC' | 'IMPORT' | 'EXPORT';
  description?: string;
  isDefault?: boolean;
}

// 12. Định mức tồn kho
export interface IposStockNorm {
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName?: string;
  minStock: number;
  maxStock: number;
  unitName?: string;
}

// iPOS Master Data Root Container
export interface IposMasterData {
  items: IposItem[];
  categories?: IposItemCategory[];
  units?: IposUnit[];
  unitConversions?: IposUnitConversion[];
  recipes?: IposRecipe[];
  warehouses?: IposWarehouse[];
  customers?: IposCustomer[];
  suppliers?: IposSupplier[];
  supplierGroups?: IposSupplierGroup[];
  priceLists?: IposPriceList[];
  reasons?: IposReason[];
  stockNorms?: IposStockNorm[];
  templateWorkbookBase64?: string; // FILE_NHAP_MAU_NHAP_MUA_HANG.xlsx
  templateFileName?: string;
  importedAt?: number;
  updatedAt?: number;
  catalogSourceInfo?: string;
}

export interface RawInvoiceRow {
  line_no: number;
  raw_item_name: string;
  raw_unit: string | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  visual_certainty: VisualCertainty;
  needs_review: boolean;
  review_reason: string | null;
}

export interface RawInvoiceData {
  supplier_raw_name: string | null;
  document_date: string | null;
  invoice_number: string | null;
  note: string | null;
  rows: RawInvoiceRow[];
}

export interface CandidateMatch {
  item: IposItem;
  score: number; // 0 to 1
  confidencePercent: number; // 0 - 100%
  matchType: 'learned_alias' | 'exact_code' | 'exact_name' | 'fuzzy' | 'unit_matched' | 'manual';
  unitMatch: boolean;
}

export interface MatchedInvoiceRow {
  id: string;
  line_no: number;
  raw: RawInvoiceRow;
  selectedCandidate: IposItem | null;
  candidates: CandidateMatch[];
  status: RowStatus;
  warnings: string[];
  
  // Editable fields
  raw_item_name: string;
  item_id: string;
  item_name: string;
  unit: string;
  quantity: number | null;
  price: number | null;
  discount: number | null;
  discount_amount: number | null;
  vat: number | null;
  amount_vat: number | null;
  sub_total: number | null;
  total_amount?: number | null;
  note: string;
  
  // Relational & Conversion state
  conversionRule?: IposUnitConversion | null;
  convertedQuantity?: number | null;
  convertedUnit?: string | null;
  convertedPrice?: number | null;
  isConvertedToBaseUnit?: boolean;

  isManuallyConfirmed: boolean;
  learnedAliasApplied?: boolean;
}

export interface LearnedItemAlias {
  id?: string;
  supplier_id: string; // or '*' for global
  supplier_name?: string;
  normalized_raw_item_name: string;
  raw_item_sample: string;
  selected_item_id: string;
  selected_item_name: string;
  selected_unit?: string;
  updatedAt: number;
  timesUsed: number;
}

export interface LearnedUnitAlias {
  id?: string;
  normalized_raw_unit: string;
  target_unit_name: string;
  updatedAt: number;
}

export interface InvoiceImageItem {
  id: string;
  fileName: string;
  previewUrl: string;
  fileType?: string;
  fileSize?: number;
}

export interface InvoiceDocumentSession {
  id: string;
  orderIndex: number;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  documentDate: string;
  invoiceNumber: string;
  note?: string;
  images: InvoiceImageItem[];
  rawInvoice: RawInvoiceData;
  matchedRows: MatchedInvoiceRow[];
  status?: 'READY' | 'NEEDS_REVIEW' | 'EXPORTED';
  extractedAt?: number;
}

export interface ExportValidationResult {
  canExport: boolean;
  redCount: number;
  unconfirmedYellowCount: number;
  totalRows: number;
  errors: string[];
  warnings: string[];
}

// ==========================================
// RECONCILIATION DATA TYPES (ĐỐI SOÁT HÓA ĐƠN)
// ==========================================

export interface IposReceiptLine {
  id: string;
  receiptNumber: string;       // Mã phiếu nhập (PN...)
  receiptDate: string;         // Ngày nhập kho (YYYY-MM-DD)
  supplierCode?: string;       // Mã NCC
  supplierName: string;        // Tên NCC
  warehouseCode?: string;      // Mã kho nhập
  warehouseName?: string;      // Tên kho nhập
  itemId?: string;             // Mã hàng iPOS
  itemName: string;            // Tên hàng iPOS
  unitName: string;            // Đơn vị tính
  quantity: number;            // Số lượng thực nhập
  unitPrice: number;           // Đơn giá trước thuế
  amount: number;              // Tiền hàng trước thuế
  vatRate?: number;            // % Thuế VAT
  vatAmount?: number;          // Tiền thuế VAT
  totalAmount: number;         // Tổng tiền thanh toán
  invoiceNoRef?: string;       // Số HĐ gõ tay trên phiếu
  note?: string;               // Ghi chú
  sourceFile?: string;
}

export interface VendorInvoiceLine {
  id: string;
  invoiceNumber: string;       // Số HĐ VAT
  invoiceSymbol?: string;      // Ký hiệu (1C24T...)
  invoiceDate: string;         // Ngày lập hóa đơn
  sellerTaxCode?: string;      // MST người bán
  sellerName: string;          // Tên NCC / Người bán
  buyerTaxCode?: string;       // MST người mua / Nhà hàng
  itemName: string;            // Tên hàng trên HĐ
  unitName: string;            // ĐVT trên HĐ
  quantity: number;            // Số lượng
  unitPrice: number;           // Đơn giá
  amount: number;              // Tiền hàng
  vatRate?: number;            // % Thuế
  vatAmount?: number;          // Tiền thuế
  totalAmount: number;         // Tổng tiền
  discountAmount?: number;     // Tiền chiết khấu
  sourceFile?: string;
  sourceType: 'XML_E_INVOICE' | 'EXCEL_VENDOR' | 'OCR_RECEIPT';
}

export type ReconciliationStatus =
  | 'PERFECT_MATCH'        // Khớp hoàn hảo
  | 'PRICE_DIFF'           // Lệch đơn giá
  | 'QUANTITY_DIFF'        // Lệch số lượng
  | 'PRICE_AND_QTY_DIFF'   // Lệch cả giá và lượng
  | 'TAX_DIFF'             // Lệch thuế suất VAT
  | 'UNMATCHED_IPOS'       // Có phiếu nhập iPOS nhưng HĐ chưa xuất
  | 'UNMATCHED_INVOICE'    // Có HĐ nhưng iPOS chưa nhập kho
  | 'DUPLICATE_ALERT';     // Cảnh báo trùng lặp

export interface ReconciliationMatchPair {
  id: string;
  status: ReconciliationStatus;
  supplierName: string;
  matchedItemName: string;
  
  // Dữ liệu đối chiếu
  iposLines: IposReceiptLine[];
  invoiceLine?: VendorInvoiceLine;

  // Tổng hợp số liệu
  iposQty: number;
  invoiceQty: number;
  iposPrice: number;
  invoicePrice: number;
  iposAmount: number;
  invoiceAmount: number;
  
  // Độ chênh lệch (Delta: HĐ - iPOS. Nếu > 0 tức là HĐ tính nhiều hơn thực nhập)
  qtyDelta: number;
  priceDelta: number;
  amountDelta: number;

  unitMatch: boolean;
  severity: 'OK' | 'WARNING' | 'CRITICAL';
  suggestedAction: 'APPROVE' | 'DEBIT_VENDOR' | 'UPDATE_IPOS' | 'CHECK_DELIVERY_NOTE';
  resolutionStatus: 'PENDING' | 'ACCEPTED_TOLERANCE' | 'DEBIT_APPROVED' | 'RESOLVED';
  resolutionNote?: string;
}

export interface ReconciliationSummary {
  totalPairs: number;
  perfectMatchCount: number;
  priceDiffCount: number;
  qtyDiffCount: number;
  unmatchedIposCount: number;
  unmatchedInvoiceCount: number;
  totalIposAmount: number;
  totalInvoiceAmount: number;
  totalOverchargedAmount: number; // Tổng số tiền NCC tính dư cần trừ công nợ
  matchRatePercent: number;
}

export interface ReconciliationSession {
  id: string;
  title: string;
  supplierName: string;
  createdAt: number;
  updatedAt: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'COMPLETED';
  summary: ReconciliationSummary;
  pairs: ReconciliationMatchPair[];
  iposFileNames?: string[];
  invoiceFileNames?: string[];
}

