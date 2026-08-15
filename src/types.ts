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
  costPrice?: number;
  barcode?: string;
  status?: string;
  description?: string;
  sourceSheet?: string;
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
  unitConversions: IposUnitConversion[];
  recipes?: IposRecipe[];
  warehouses: IposWarehouse[];
  customers?: IposCustomer[];
  suppliers: IposSupplier[];
  supplierGroups?: IposSupplierGroup[];
  priceLists?: IposPriceList[];
  reasons?: IposReason[];
  stockNorms?: IposStockNorm[];
  templateWorkbookBase64?: string; // FILE_NHAP_MAU_NHAP_MUA_HANG.xlsx
  templateFileName?: string;
  importedAt?: number;
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

export interface ExportValidationResult {
  canExport: boolean;
  redCount: number;
  unconfirmedYellowCount: number;
  totalRows: number;
  errors: string[];
  warnings: string[];
}

