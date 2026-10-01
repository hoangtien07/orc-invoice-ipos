import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Filter,
  CheckCheck,
  Search,
  BookOpen,
  ChevronDown,
  Sparkles,
  Info,
  Maximize2,
  AlertCircle,
  Eye,
  Building,
  Warehouse,
  Calendar,
  Hash,
  Trash2,
  Layers,
  Split,
  Plus,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import {
  InvoiceDocumentSession,
  IposItem,
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
  MatchedInvoiceRow,
  RowStatus,
} from '../types';
import { generateIposExportWorkbook, validateForExport, writeXlsxFile } from '../utils/excel';
import { saveLearnedItemAlias } from '../utils/db';
import {
  formatQuantity,
  formatVND,
  normalizeText,
  normalizeWithoutAccents,
  getAvailableSystemUnits,
} from '../utils/vietnamese';
import { CatalogResolver } from '../utils/resolver';
import { ItemComboboxCell } from './ItemComboboxCell';

interface InvoiceCardProps {
  invoice: InvoiceDocumentSession;
  orderIndex: number;
  totalInvoices: number;
  onUpdateInvoice: (updated: InvoiceDocumentSession) => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onMergeWithAbove?: (invoiceId: string) => void;
  onSplitImage?: (invoiceId: string, imageId: string) => void;
  masterData: IposMasterData | null;
  learnedAliases: LearnedItemAlias[];
  learnedUnitAliases: LearnedUnitAlias[];
  onAliasesUpdated: () => void;
  onViewImage: (imageUrl: string, title?: string) => void;
  onOpenAliasManager?: () => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({
  invoice,
  orderIndex,
  totalInvoices,
  onUpdateInvoice,
  onDeleteInvoice,
  onMergeWithAbove,
  onSplitImage,
  masterData,
  learnedAliases,
  learnedUnitAliases,
  onAliasesUpdated,
  onViewImage,
  onOpenAliasManager,
}) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'YELLOW' | 'RED' | 'GREEN'>('ALL');
  const [tableSearch, setTableSearch] = useState('');
  const [comboboxSearch, setComboboxSearch] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [exportWarningModal, setExportWarningModal] = useState<string[] | null>(null);
  const [autoLearnAlias, setAutoLearnAlias] = useState<boolean>(true);
  const [saveAliasSuccessRowId, setSaveAliasSuccessRowId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const resolver = useMemo(() => {
    return new CatalogResolver(
      masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] },
      learnedAliases,
      learnedUnitAliases
    );
  }, [masterData, learnedAliases, learnedUnitAliases]);

  const rows = invoice.matchedRows || [];

  // Available system units for dropdown
  const availableUnits = useMemo(() => {
    const rawUnitsInRows = rows.map((r) => r.raw.raw_unit).filter(Boolean);
    const selectedUnitsInRows = rows.map((r) => r.unit).filter(Boolean);
    return getAvailableSystemUnits(masterData, [...rawUnitsInRows, ...selectedUnitsInRows]);
  }, [masterData, rows]);

  // Counters
  const totalRows = rows.length;
  const greenCount = rows.filter((r) => r.status === 'GREEN').length;
  const yellowCount = rows.filter((r) => r.status === 'YELLOW').length;
  const redCount = rows.filter((r) => r.status === 'RED').length;

  const totalSubTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const sub =
        r.sub_total !== null && r.sub_total !== undefined
          ? r.sub_total
          : (r.quantity || 0) * (r.price || 0);
      return sum + sub;
    }, 0);
  }, [rows]);

  const totalVat = useMemo(() => {
    return rows.reduce((sum, r) => {
      const sub =
        r.sub_total !== null && r.sub_total !== undefined
          ? r.sub_total
          : (r.quantity || 0) * (r.price || 0);
      return sum + (r.amount_vat ?? (sub * (r.vat || 0)) / 100);
    }, 0);
  }, [rows]);

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => {
      if (r.total_amount !== null && r.total_amount !== undefined) {
        return sum + r.total_amount;
      }
      const sub =
        r.sub_total !== null && r.sub_total !== undefined
          ? r.sub_total
          : (r.quantity || 0) * (r.price || 0);
      const vat = r.amount_vat ?? (sub * (r.vat || 0)) / 100;
      return sum + sub + vat;
    }, 0);
  }, [rows]);

  // Row updates
  const handleUpdateRow = (rowId: string, updates: Partial<MatchedInvoiceRow>) => {
    const newRows = rows.map((r) => {
      if (r.id !== rowId) return r;
      const updatedRow = { ...r, ...updates };

      const qty = updates.quantity !== undefined ? updates.quantity : updatedRow.quantity;
      const pr = updates.price !== undefined ? updates.price : updatedRow.price;
      const vat = updates.vat !== undefined ? updates.vat : updatedRow.vat;
      const discount = updates.discount !== undefined ? updates.discount : (updatedRow.discount || 0);

      if (qty !== null && pr !== null && qty !== undefined && pr !== undefined) {
        const baseSub = qty * pr;
        const discAmt = (baseSub * discount) / 100;
        const subTot = baseSub - discAmt;
        const vatPct = vat || 0;
        const vatAmt = (subTot * vatPct) / 100;
        const totAmt = subTot + vatAmt;

        updatedRow.quantity = qty;
        updatedRow.price = pr;
        updatedRow.discount = discount;
        updatedRow.discount_amount = discAmt;
        updatedRow.vat = vatPct;
        updatedRow.sub_total = subTot;
        updatedRow.amount_vat = vatAmt;
        updatedRow.total_amount = totAmt;
      } else if (qty === null || pr === null) {
        updatedRow.sub_total = null;
        updatedRow.amount_vat = null;
        updatedRow.total_amount = null;
      }

      const currentItem = masterData?.items?.find((i) => i.itemId === updatedRow.item_id) || null;
      const classification = resolver.classifyRow(
        {
          ...updatedRow.raw,
          raw_item_name: updatedRow.raw_item_name,
          raw_unit: updatedRow.unit,
          quantity: updatedRow.quantity,
          price: updatedRow.price,
        },
        updatedRow.candidates,
        currentItem,
        updatedRow.isManuallyConfirmed
      );

      updatedRow.status = classification.status;
      updatedRow.warnings = classification.warnings;

      return updatedRow;
    });

    const hasRed = newRows.some((r) => r.status === 'RED');
    const hasUnconfirmedYellow = newRows.some((r) => r.status === 'YELLOW' && !r.isManuallyConfirmed);

    onUpdateInvoice({
      ...invoice,
      matchedRows: newRows,
      status: hasRed || hasUnconfirmedYellow ? 'NEEDS_REVIEW' : 'READY',
    });
  };

  // Candidate selection
  const handleSelectCandidate = (rowId: string, item: IposItem) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    const unitComp = resolver.checkUnitCompatibility(row.raw.raw_unit, item.unitName, item.itemId, item.unitId);

    handleUpdateRow(rowId, {
      selectedCandidate: item,
      item_id: item.itemId,
      item_name: item.itemName,
      unit: unitComp.matchedUnit || item.unitName || item.unitId || row.unit,
      price: row.price || item.costPrice || null,
      isManuallyConfirmed: true,
      learnedAliasApplied: true,
      status: row.quantity && row.quantity > 0 ? 'GREEN' : 'RED',
    });

    setOpenDropdownId(null);

    // Save learned alias
    if (autoLearnAlias && row.raw.raw_item_name) {
      const supplierIdToSave = invoice.supplierId || '*';
      const supplierNameToSave =
        invoice.supplierName || (supplierIdToSave === '*' ? 'Tất cả nhà cung cấp' : 'Nhà cung cấp hiện tại');

      saveLearnedItemAlias({
        supplier_id: supplierIdToSave,
        supplier_name: supplierNameToSave,
        normalized_raw_item_name: normalizeText(row.raw.raw_item_name),
        raw_item_sample: row.raw.raw_item_name,
        selected_item_id: item.itemId,
        selected_item_name: item.itemName,
        selected_unit: item.unitName || item.unitId || '',
      }).then(() => {
        onAliasesUpdated();
        setSaveAliasSuccessRowId(rowId);
        setTimeout(() => setSaveAliasSuccessRowId(null), 3000);
      });
    }
  };

  // Approve all yellow rows for this invoice
  const handleConfirmAllYellow = () => {
    const newRows = rows.map((r) => {
      if (r.status === 'YELLOW') {
        return {
          ...r,
          isManuallyConfirmed: true,
          status: 'GREEN' as RowStatus,
          warnings: [],
        };
      }
      return r;
    });

    const hasRed = newRows.some((r) => r.status === 'RED');

    onUpdateInvoice({
      ...invoice,
      matchedRows: newRows,
      status: hasRed ? 'NEEDS_REVIEW' : 'READY',
    });
  };

  // Add blank row
  const handleAddNewRow = () => {
    const newId = `row_manual_${Date.now()}`;
    const newRow: MatchedInvoiceRow = {
      id: newId,
      line_no: rows.length + 1,
      raw: {
        line_no: rows.length + 1,
        raw_item_name: '',
        raw_unit: null,
        quantity: 1,
        price: null,
        amount: null,
        visual_certainty: 'high',
        needs_review: false,
        review_reason: null,
      },
      selectedCandidate: null,
      candidates: [],
      status: 'RED',
      warnings: ['Hàng hóa mới chưa chọn mã iPOS'],
      raw_item_name: '',
      item_id: '',
      item_name: '',
      unit: 'KG',
      quantity: 1,
      price: null,
      discount: 0,
      discount_amount: 0,
      vat: 0,
      amount_vat: 0,
      sub_total: null,
      total_amount: null,
      note: '',
      isManuallyConfirmed: false,
    };

    onUpdateInvoice({
      ...invoice,
      matchedRows: [...rows, newRow],
      status: 'NEEDS_REVIEW',
    });
  };

  // Delete single row
  const handleDeleteRow = (rowId: string) => {
    const newRows = rows
      .filter((r) => r.id !== rowId)
      .map((r, idx) => ({
        ...r,
        line_no: idx + 1,
      }));

    const hasRed = newRows.some((r) => r.status === 'RED');
    const hasUnconfirmedYellow = newRows.some((r) => r.status === 'YELLOW' && !r.isManuallyConfirmed);

    onUpdateInvoice({
      ...invoice,
      matchedRows: newRows,
      status: hasRed || hasUnconfirmedYellow ? 'NEEDS_REVIEW' : 'READY',
    });
  };

  // Export single invoice
  const executeSingleExport = () => {
    if (!masterData) return;
    try {
      const { workbook, fileName } = generateIposExportWorkbook(masterData, rows, {
        supplierName: invoice.supplierName,
        supplierId: invoice.supplierId,
        warehouseId: invoice.warehouseId,
        warehouseName: invoice.warehouseName,
        invoiceNumber: invoice.invoiceNumber,
        documentDate: invoice.documentDate,
        note: invoice.note || '',
      });

      writeXlsxFile(workbook, fileName);
      setExportWarningModal(null);
    } catch (err: any) {
      console.error('Export Excel failed:', err);
      setExportWarningModal([`Lỗi xuất file Excel: ${err.message}`]);
    }
  };

  const handleExportSingleInvoice = () => {
    if (!masterData) return;
    const validation = validateForExport(rows);
    if (!validation.canExport) {
      setExportWarningModal(validation.errors.length > 0 ? validation.errors : validation.warnings);
      return;
    }
    executeSingleExport();
  };

  // Filtered rows
  const visibleRows = rows.filter((r) => {
    if (activeFilter === 'YELLOW' && r.status !== 'YELLOW') return false;
    if (activeFilter === 'RED' && r.status !== 'RED') return false;
    if (activeFilter === 'GREEN' && r.status !== 'GREEN') return false;

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      return (
        r.raw_item_name.toLowerCase().includes(q) ||
        r.item_id.toLowerCase().includes(q) ||
        r.item_name.toLowerCase().includes(q) ||
        r.warnings.some((w) => w.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div
      id={`invoice-card-${invoice.id}`}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all scroll-mt-20"
    >
      {/* Card Header & Metadata */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/70 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Invoice Order and Supplier Badge */}
          <div className="flex items-center space-x-3">
            <span className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              #{orderIndex}
            </span>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">
                  {invoice.supplierName || 'Hóa đơn chưa đặt tên NCC'}
                </h3>
                {redCount === 0 && yellowCount === 0 ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-full flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Hợp lệ hoàn toàn</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[11px] font-semibold rounded-full flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    <span>Cần kiểm duyệt ({redCount + yellowCount} dòng)</span>
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-0.5 flex items-center space-x-2">
                <span>{invoice.images.length} trang ảnh</span>
                <span>•</span>
                <span>{rows.length} mặt hàng</span>
                <span>•</span>
                <span className="font-semibold text-slate-700">{formatVND(totalAmount)}</span>
              </p>
            </div>
          </div>

          {/* Action Buttons for this specific invoice */}
          <div className="flex flex-wrap items-center gap-2">
            {orderIndex > 1 && onMergeWithAbove && (
              <button
                type="button"
                onClick={() => onMergeWithAbove(invoice.id)}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors shadow-2xs"
                title="Gộp dữ liệu hóa đơn này vào hóa đơn phía trên nếu là cùng một phiếu nhiều trang"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Gộp với HĐ trên</span>
              </button>
            )}

            {yellowCount > 0 && (
              <button
                type="button"
                onClick={handleConfirmAllYellow}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors shadow-2xs"
                title="Duyệt tất cả dòng vàng của riêng hóa đơn này"
              >
                <CheckCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Duyệt dòng vàng ({yellowCount})</span>
              </button>
            )}

            {/* Individual Excel Download Button */}
            <button
              id={`btn-export-invoice-${invoice.id}`}
              type="button"
              onClick={handleExportSingleInvoice}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition-all ${
                redCount > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : yellowCount > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow'
              }`}
              title="Tải file Excel chuẩn mẫu iPOS cho riêng hóa đơn này"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Tải Excel HĐ này</span>
            </button>

            {totalInvoices > 1 && (
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition-colors"
                title="Xóa hóa đơn này"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Invoice Metadata Form (Supplier, Warehouse, Date, Invoice No) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-200/80">
          {/* Supplier */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
              <Building className="w-3 h-3 text-blue-600" />
              <span>Nhà cung cấp</span>
            </label>
            <select
              value={invoice.supplierId}
              onChange={(e) => {
                const sId = e.target.value;
                const found = masterData?.suppliers?.find((s) => s.supplierId === sId);
                const sName = found ? found.supplierName : invoice.supplierName;
                onUpdateInvoice({
                  ...invoice,
                  supplierId: sId,
                  supplierName: sName,
                });
              }}
              className="w-full px-2.5 py-1.5 bg-white text-xs font-medium text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">-- Chọn NCC trong CSDL iPOS --</option>
              {masterData?.suppliers?.map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  [{s.supplierId}] {s.supplierName}
                </option>
              ))}
              {!masterData?.suppliers?.some((s) => s.supplierId === invoice.supplierId) && invoice.supplierName && (
                <option value={invoice.supplierId}>{invoice.supplierName}</option>
              )}
            </select>
          </div>

          {/* Warehouse */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
              <Warehouse className="w-3 h-3 text-indigo-600" />
              <span>Kho nhập hàng</span>
            </label>
            <select
              value={invoice.warehouseId}
              onChange={(e) => {
                const wId = e.target.value;
                const found = masterData?.warehouses?.find((w) => w.warehouseId === wId);
                onUpdateInvoice({
                  ...invoice,
                  warehouseId: wId,
                  warehouseName: found ? found.warehouseName : invoice.warehouseName,
                });
              }}
              className="w-full px-2.5 py-1.5 bg-white text-xs font-medium text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {masterData?.warehouses && masterData.warehouses.length > 0 ? (
                masterData.warehouses.map((wh) => (
                  <option key={wh.warehouseId} value={wh.warehouseId}>
                    [{wh.warehouseId}] {wh.warehouseName}
                  </option>
                ))
              ) : (
                <option value="KHO_TONG">Kho Tổng Trung Tâm</option>
              )}
            </select>
          </div>

          {/* Document Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Ngày chứng từ</span>
            </label>
            <input
              type="date"
              value={invoice.documentDate}
              onChange={(e) =>
                onUpdateInvoice({
                  ...invoice,
                  documentDate: e.target.value,
                })
              }
              className="w-full px-2.5 py-1.5 bg-white text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Invoice Number */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
              <Hash className="w-3 h-3 text-slate-500" />
              <span>Số hóa đơn / Phiếu</span>
            </label>
            <input
              type="text"
              placeholder="VD: GH-2025/01"
              value={invoice.invoiceNumber}
              onChange={(e) =>
                onUpdateInvoice({
                  ...invoice,
                  invoiceNumber: e.target.value,
                })
              }
              className="w-full px-2.5 py-1.5 bg-white text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Associated Images Thumbnails Bar */}
        {invoice.images && invoice.images.length > 0 && (
          <div className="pt-2 flex items-center space-x-3 overflow-x-auto pb-1">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center space-x-1 shrink-0">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Ảnh gốc đối chiếu:</span>
            </span>

            <div className="flex items-center space-x-2">
              {invoice.images.map((img, imgIdx) => (
                <div
                  key={img.id}
                  className="relative group flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs hover:border-emerald-500 transition-all shrink-0"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.fileName}
                    onClick={() => onViewImage(img.previewUrl, `Hóa đơn #${orderIndex} - Trang ${imgIdx + 1}`)}
                    className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    title="Click để phóng to ảnh đối chiếu"
                  />

                  <div className="pr-1 text-[11px]">
                    <div className="font-medium text-slate-700 truncate max-w-[120px]">{img.fileName}</div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <button
                        type="button"
                        onClick={() => onViewImage(img.previewUrl, `Hóa đơn #${orderIndex} - Trang ${imgIdx + 1}`)}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold text-[10px] flex items-center space-x-0.5"
                      >
                        <Maximize2 className="w-2.5 h-2.5" />
                        <span>Xem to</span>
                      </button>

                      {invoice.images.length > 1 && onSplitImage && (
                        <button
                          type="button"
                          onClick={() => onSplitImage(invoice.id, img.id)}
                          className="text-indigo-600 hover:text-indigo-700 font-semibold text-[10px] flex items-center space-x-0.5"
                          title="Tách ảnh này thành hóa đơn độc lập riêng"
                        >
                          <Split className="w-2.5 h-2.5" />
                          <span>Tách ra HĐ riêng</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Table Filter & Search Controls */}
      <div className="p-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              activeFilter === 'ALL'
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tất cả ({totalRows})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('GREEN')}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition-all ${
              activeFilter === 'GREEN'
                ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Xanh ({greenCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('YELLOW')}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition-all ${
              activeFilter === 'YELLOW'
                ? 'bg-amber-500 text-white font-bold shadow-2xs'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/60'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Cần xem ({yellowCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('RED')}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition-all ${
              activeFilter === 'RED'
                ? 'bg-rose-600 text-white font-bold shadow-2xs'
                : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200/60'
            }`}
          >
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Lỗi chặn ({redCount})</span>
          </button>

          {/* Auto Learn Toggle */}
          <label className="flex items-center space-x-1 cursor-pointer select-none bg-amber-50/70 text-amber-900 px-2 py-1 rounded-lg border border-amber-200 text-[11px] ml-2">
            <input
              type="checkbox"
              checked={autoLearnAlias}
              onChange={(e) => setAutoLearnAlias(e.target.checked)}
              className="rounded text-amber-600 focus:ring-amber-500 w-3 h-3"
            />
            <Sparkles className="w-3 h-3 text-amber-600" />
            <span>Lưu từ điển Alias</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Lọc hàng trong HĐ này..."
              className="w-full pl-8 pr-2.5 py-1 bg-white text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={handleAddNewRow}
            className="flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors shrink-0 shadow-2xs"
            title="Thêm một dòng mặt hàng mới vào hóa đơn này"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm dòng</span>
          </button>
        </div>
      </div>

      {/* Main Rows Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
              <th className="p-2.5 text-center w-10">STT</th>
              <th className="p-2.5 text-center w-14">Trạng thái</th>
              <th className="p-2.5 min-w-[160px]">Tên gốc hóa đơn (OCR)</th>
              <th className="p-2.5 min-w-[240px]">Mã & Tên hàng hóa iPOS (*)</th>
              <th className="p-2.5 w-24">ĐVT (*)</th>
              <th className="p-2.5 text-right w-20">Số lượng (*)</th>
              <th className="p-2.5 text-right w-24">Đơn giá</th>
              <th className="p-2.5 text-right w-28">Thành tiền</th>
              <th className="p-2.5 text-right w-16">VAT (%)</th>
              <th className="p-2.5 text-right w-28">Tổng tiền</th>
              <th className="p-2.5 text-center w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-slate-400 text-xs">
                  Không tìm thấy dòng hàng nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const currentSubTotal =
                  row.sub_total !== null && row.sub_total !== undefined
                    ? row.sub_total
                    : (row.quantity || 0) * (row.price || 0);

                const currentTotal =
                  row.total_amount !== null && row.total_amount !== undefined
                    ? row.total_amount
                    : currentSubTotal + (row.amount_vat ?? (currentSubTotal * (row.vat || 0)) / 100);

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      row.status === 'RED'
                        ? 'bg-rose-50/20'
                        : row.status === 'YELLOW'
                        ? 'bg-amber-50/20'
                        : ''
                    }`}
                  >
                    {/* STT */}
                    <td className="p-2.5 text-center font-mono text-slate-500 font-medium">
                      {row.line_no}
                    </td>

                    {/* Status Badge */}
                    <td className="p-2.5 text-center">
                      {row.status === 'GREEN' && (
                        <span title="Khớp chuẩn danh mục iPOS">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 inline-block" />
                        </span>
                      )}
                      {row.status === 'YELLOW' && (
                        <span title={row.warnings.join('; ') || 'Cần kiểm tra lại đơn vị tính hoặc đơn giá'}>
                          <AlertTriangle className="w-4 h-4 text-amber-500 inline-block" />
                        </span>
                      )}
                      {row.status === 'RED' && (
                        <span title={row.warnings.join('; ') || 'Chưa chọn mã iPOS hoặc số lượng thiếu'}>
                          <XCircle className="w-4 h-4 text-rose-500 inline-block" />
                        </span>
                      )}
                    </td>

                    {/* OCR Name */}
                    <td className="p-2.5">
                      <div className="font-medium text-slate-900 leading-tight">
                        {row.raw_item_name || <span className="text-slate-400 italic">(Dòng trống)</span>}
                      </div>
                      {row.raw.raw_unit && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          ĐVT gốc: <span className="font-mono">{row.raw.raw_unit}</span>
                        </div>
                      )}
                    </td>

                    {/* iPOS Item Combobox */}
                    <td className="p-2.5 relative">
                      <ItemComboboxCell
                        rowId={row.id}
                        status={row.status}
                        itemId={row.item_id}
                        itemName={row.item_name}
                        candidates={row.candidates}
                        masterItems={masterData?.items || []}
                        onSelect={(cand) => handleSelectCandidate(row.id, cand)}
                        warnings={row.warnings}
                      />
                    </td>

                    {/* Unit */}
                    <td className="p-2.5">
                      <select
                        value={row.unit}
                        onChange={(e) => handleUpdateRow(row.id, { unit: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      >
                        {availableUnits.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                        {!availableUnits.includes(row.unit) && <option value={row.unit}>{row.unit}</option>}
                      </select>
                    </td>

                    {/* Quantity */}
                    <td className="p-2.5 text-right">
                      <input
                        type="number"
                        step="any"
                        value={row.quantity ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                          handleUpdateRow(row.id, { quantity: val });
                        }}
                        className={`w-18 px-2 py-1 text-right font-mono text-xs rounded-lg border focus:ring-1 focus:ring-emerald-500 focus:outline-none ${
                          row.quantity === null || row.quantity <= 0
                            ? 'border-rose-300 bg-rose-50 text-rose-900 font-bold'
                            : 'border-slate-300 bg-white text-slate-900'
                        }`}
                      />
                    </td>

                    {/* Price */}
                    <td className="p-2.5 text-right">
                      <input
                        type="number"
                        step="any"
                        value={row.price ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                          handleUpdateRow(row.id, { price: val });
                        }}
                        className="w-22 px-2 py-1 text-right font-mono text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </td>

                    {/* SubTotal */}
                    <td className="p-2.5 text-right font-mono font-medium text-slate-700">
                      {formatVND(currentSubTotal)}
                    </td>

                    {/* VAT */}
                    <td className="p-2.5 text-right">
                      <input
                        type="number"
                        step="any"
                        value={row.vat ?? 0}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          handleUpdateRow(row.id, { vat: val });
                        }}
                        className="w-14 px-1.5 py-1 text-right font-mono text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </td>

                    {/* Total Amount */}
                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                      {formatVND(currentTotal)}
                    </td>

                    {/* Row Action */}
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-1 text-slate-300 hover:text-rose-600 transition-colors rounded"
                        title="Xóa dòng này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Table Footer */}
          {visibleRows.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold border-t-2 border-slate-200 text-slate-800 text-xs">
              <tr>
                <td colSpan={5} className="p-2.5 text-right uppercase tracking-wider text-slate-600">
                  Tổng hóa đơn #{orderIndex} ({visibleRows.length} dòng):
                </td>
                <td className="p-2.5 text-right font-mono">
                  {formatQuantity(visibleRows.reduce((s, r) => s + (r.quantity || 0), 0))}
                </td>
                <td></td>
                <td className="p-2.5 text-right font-mono text-slate-700">{formatVND(totalSubTotal)}</td>
                <td className="p-2.5 text-right font-mono text-amber-700">{formatVND(totalVat)}</td>
                <td className="p-2.5 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {formatVND(totalAmount)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Xác nhận xóa Hóa đơn #{orderIndex}?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Thao tác này sẽ xóa toàn bộ {rows.length} dòng hàng của hóa đơn "{invoice.supplierName}" khỏi phiên làm việc.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  onDeleteInvoice(invoice.id);
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Đồng ý xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Warning Dialog before Export */}
      {exportWarningModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cảnh báo xuất file Excel Hóa đơn #{orderIndex}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phát hiện một số dòng chưa khớp mã hàng hoặc thiếu số lượng.
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5 text-xs text-amber-900 font-medium">
              {exportWarningModal.map((err, i) => (
                <div key={i} className="flex items-start space-x-2">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setExportWarningModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Xem lại & Chỉnh sửa
              </button>
              <button
                type="button"
                onClick={executeSingleExport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Vẫn xuất file Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
