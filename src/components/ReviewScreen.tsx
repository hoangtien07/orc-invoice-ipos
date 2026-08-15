import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Filter,
  CheckCheck,
  Search,
  BookOpen,
  ArrowLeft,
  ChevronDown,
  Sparkles,
  Info,
  Maximize2,
  Save,
  AlertCircle,
  Eye,
  Layers,
  Building,
} from 'lucide-react';
import {
  IposItem,
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
  MatchedInvoiceRow,
  RawInvoiceData,
  RowStatus,
} from '../types';
import { generateIposExportWorkbook, validateForExport } from '../utils/excel';
import { saveLearnedItemAlias } from '../utils/db';
import { formatQuantity, formatVND, normalizeText, getAvailableSystemUnits } from '../utils/vietnamese';
import { CatalogResolver } from '../utils/resolver';

interface ReviewScreenProps {
  rows: MatchedInvoiceRow[];
  setRows: React.Dispatch<React.SetStateAction<MatchedInvoiceRow[]>>;
  masterData: IposMasterData | null;
  rawInvoice: RawInvoiceData | null;
  meta: {
    supplierId: string;
    supplierName: string;
    warehouseId: string;
    warehouseName: string;
    documentDate: string;
    invoiceNumber: string;
    imagePreviewUrl?: string;
    fileName?: string;
  };
  learnedAliases: LearnedItemAlias[];
  learnedUnitAliases: LearnedUnitAlias[];
  onAliasesUpdated: () => void;
  onBackToScan: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  rows = [],
  setRows,
  masterData,
  rawInvoice,
  meta,
  learnedAliases = [],
  learnedUnitAliases = [],
  onAliasesUpdated,
  onBackToScan,
}) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'YELLOW' | 'RED' | 'GREEN'>('ALL');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(rows[0]?.id || null);
  const [tableSearch, setTableSearch] = useState('');
  const [comboboxSearch, setComboboxSearch] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [exportWarningModal, setExportWarningModal] = useState<string[] | null>(null);
  const [saveAliasSuccessRowId, setSaveAliasSuccessRowId] = useState<string | null>(null);

  const resolver = useMemo(() => {
    return new CatalogResolver(
      masterData || { items: [], suppliers: [], warehouses: [], unitConversions: [] },
      learnedAliases,
      learnedUnitAliases
    );
  }, [masterData, learnedAliases, learnedUnitAliases]);

  // Master available system units
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

  const totalInvoiceAmount = useMemo(() => {
    return rows.reduce((sum, r) => {
      const rowAmt =
        r.sub_total !== null && r.sub_total !== undefined
          ? r.sub_total
          : (r.quantity || 0) * (r.price || 0);
      return sum + rowAmt;
    }, 0);
  }, [rows]);


  // Update a field in a specific row
  const handleUpdateRow = (rowId: string, updates: Partial<MatchedInvoiceRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updatedRow = { ...r, ...updates };

        // Recalculate subtotal if quantity or price changed
        if (updates.quantity !== undefined || updates.price !== undefined) {
          const qty = updates.quantity !== undefined ? updates.quantity : updatedRow.quantity;
          const pr = updates.price !== undefined ? updates.price : updatedRow.price;
          updatedRow.sub_total = qty !== null && pr !== null ? qty * pr : null;
        }

        // Re-classify row
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
      })
    );
  };

  // Select candidate for a row
  const handleSelectCandidate = (rowId: string, item: IposItem, shouldLearnAlias: boolean = false) => {
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
      status: row.quantity && row.quantity > 0 ? 'GREEN' : 'RED',
    });

    setOpenDropdownId(null);

    // Save learned alias if requested
    if (shouldLearnAlias && row.raw.raw_item_name) {
      saveLearnedItemAlias({
        supplier_id: meta.supplierId || '*',
        supplier_name: meta.supplierName,
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

  // Approve all valid YELLOW rows with user confirmation
  const handleConfirmAllYellow = () => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.status === 'YELLOW') {
          return {
            ...r,
            isManuallyConfirmed: true,
            status: 'GREEN',
            warnings: [],
          };
        }
        return r;
      })
    );
  };

  // Export to iPOS Excel Workbook
  const handleExportExcel = () => {
    if (!masterData) return;

    const validation = validateForExport(rows);

    if (!validation.canExport) {
      setExportWarningModal(validation.errors.length > 0 ? validation.errors : validation.warnings);
      return;
    }

    try {
      const { workbook, fileName } = generateIposExportWorkbook(masterData, rows, {
        supplierName: meta.supplierName,
        supplierId: meta.supplierId,
        warehouseId: meta.warehouseId,
        warehouseName: meta.warehouseName,
        invoiceNumber: meta.invoiceNumber,
        documentDate: meta.documentDate,
        note: rawInvoice?.note || '',
      });

      XLSX.writeFile(workbook, fileName);
    } catch (err: any) {
      console.error('Export Excel failed:', err);
      setExportWarningModal([`Lỗi xuất file Excel: ${err.message}`]);
    }
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

  const selectedRow = rows.find((r) => r.id === selectedRowId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header & Overview Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToScan}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            title="Quay lại bước quét hóa đơn"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900">
                Kiểm tra & Đối chiếu iPOS
              </h2>
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full border border-slate-200">
                {meta.supplierName || 'Chưa chọn NCC'}
              </span>
            </div>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <div className="flex items-center space-x-1.5">
                <span>Kho:</span>
                {masterData?.warehouses && masterData.warehouses.length > 0 ? (
                  <select
                    value={meta.warehouseId}
                    onChange={(e) => {
                      const wId = e.target.value;
                      const found = masterData.warehouses.find((w) => w.warehouseId === wId);
                      meta.warehouseId = wId;
                      if (found) meta.warehouseName = found.warehouseName;
                      setRows([...rows]);
                    }}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 cursor-pointer shadow-2xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    {masterData.warehouses.map((w) => (
                      <option key={w.warehouseId} value={w.warehouseId}>
                        {w.warehouseName}
                      </option>
                    ))}
                    {!masterData.warehouses.some((w) => w.warehouseId === meta.warehouseId) && (
                      <option value={meta.warehouseId}>{meta.warehouseName}</option>
                    )}
                  </select>
                ) : (
                  <strong>{meta.warehouseName}</strong>
                )}
              </div>
              <span>•</span>
              <span>Ngày: <strong>{meta.documentDate}</strong></span>
              {meta.invoiceNumber && (
                <>
                  <span>•</span>
                  <span>Số phiếu: <strong>{meta.invoiceNumber}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          {yellowCount > 0 && (
            <button
              onClick={handleConfirmAllYellow}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors shadow-2xs"
              title="Duyệt nhanh tất cả các dòng vàng hợp lệ"
            >
              <CheckCheck className="w-4 h-4 text-amber-600" />
              <span>Duyệt dòng vàng ({yellowCount})</span>
            </button>
          )}

          <button
            id="btn-export-excel"
            onClick={handleExportExcel}
            className={`flex items-center space-x-2 px-5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all ${
              redCount > 0
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : yellowCount > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel iPOS</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-800'
              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-semibold opacity-75 uppercase">Tổng dòng</div>
          <div className="text-xl font-bold mt-1">{totalRows}</div>
        </button>

        <button
          onClick={() => setActiveFilter('GREEN')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeFilter === 'GREEN'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500'
              : 'bg-emerald-50/60 text-emerald-900 border-emerald-200 hover:bg-emerald-100/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold opacity-85 uppercase">Tự nhận diện (Xanh)</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold mt-1">{greenCount}</div>
        </button>

        <button
          onClick={() => setActiveFilter('YELLOW')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeFilter === 'YELLOW'
              ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400'
              : 'bg-amber-50/60 text-amber-900 border-amber-200 hover:bg-amber-100/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold opacity-85 uppercase">Cần kiểm tra (Vàng)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold mt-1">{yellowCount}</div>
        </button>

        <button
          onClick={() => setActiveFilter('RED')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeFilter === 'RED'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500'
              : 'bg-rose-50/60 text-rose-900 border-rose-200 hover:bg-rose-100/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold opacity-85 uppercase">Lỗi chặn (Đỏ)</span>
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-bold mt-1">{redCount}</div>
        </button>

        <div className="p-3.5 rounded-2xl border border-slate-200 bg-white col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Tổng tiền phiếu</div>
          <div className="text-sm font-bold text-emerald-700 mt-1 truncate">
            {formatVND(totalInvoiceAmount)}
          </div>
        </div>
      </div>

      {/* Main Review Workplace (Split view if preview available) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Document Preview (Optional 4 cols on large screen) */}
        {meta.imagePreviewUrl && (
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-24">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center space-x-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Đối chiếu ảnh gốc</span>
              </span>
              <span className="text-[11px] font-normal text-slate-400">
                {selectedRow ? `Đang chọn dòng #${selectedRow.line_no}` : ''}
              </span>
            </div>
            <div className="p-2 h-[480px] overflow-auto bg-slate-100/60 flex items-center justify-center">
              <img
                src={meta.imagePreviewUrl}
                alt="Hóa đơn"
                className="max-w-full max-h-full object-contain rounded shadow-xs"
              />
            </div>
            {selectedRow && (
              <div className="p-3 bg-slate-50/90 border-t border-slate-200 text-xs space-y-1">
                <div className="text-[11px] text-slate-500 font-semibold uppercase">Chữ gốc dòng {selectedRow.line_no}:</div>
                <div className="font-bold text-slate-800 bg-white p-2 rounded border border-slate-200">
                  "{selectedRow.raw_item_name}"
                </div>
                {selectedRow.raw.review_reason && (
                  <div className="text-[11px] text-amber-700 italic">
                    Ghi chú OCR: {selectedRow.raw.review_reason}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right Side / Full Width: Large Editable Review Table */}
        <div className={meta.imagePreviewUrl ? 'lg:col-span-8 space-y-4' : 'lg:col-span-12 space-y-4'}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Search & Filter Bar */}
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
                <span>Danh sách {visibleRows.length}/{totalRows} dòng</span>
                {saveAliasSuccessRowId && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px] flex items-center space-x-1 animate-fade-in">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Đã lưu quy tắc Alias!</span>
                  </span>
                )}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Lọc tên hàng, mã hàng..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Scrollable Sticky Header Table */}
            <div className="overflow-x-auto max-h-[620px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                  <tr>
                    <th className="px-3 py-3 w-12 text-center">Trạng thái</th>
                    <th className="px-2 py-3 w-10 text-center">STT</th>
                    <th className="px-3 py-3 w-48">Hàng viết trên phiếu (Raw)</th>
                    <th className="px-3 py-3 min-w-[260px]">Mã & Tên hàng iPOS (*)</th>
                    <th className="px-2 py-3 w-28">ĐVT (*)</th>
                    <th className="px-2 py-3 w-24 text-right">Số lượng (*)</th>
                    <th className="px-2 py-3 w-28 text-right">Đơn giá</th>
                    <th className="px-2 py-3 w-20 text-center">VAT (%)</th>
                    <th className="px-2 py-3 w-28 text-right">Thành tiền</th>
                    <th className="px-3 py-3 min-w-[180px]">Cảnh báo & Quy tắc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map((row) => {
                    const isSelected = row.id === selectedRowId;
                    const isDropdownOpen = openDropdownId === row.id;

                    const currentItem =
                      masterData?.items?.find((i) => i.itemId === row.item_id) ||
                      row.selectedCandidate;
                    const itemPrimaryUnit = currentItem?.unitName?.trim();

                    // Collect convertible units for this specific item
                    const itemConversionUnits: string[] = [];
                    if (masterData?.unitConversions && row.item_id) {
                      for (const c of masterData.unitConversions) {
                        if (
                          !c.itemId ||
                          c.itemId === row.item_id ||
                          (currentItem && c.itemName === currentItem.itemName)
                        ) {
                          if (c.sourceUnitName && !itemConversionUnits.includes(c.sourceUnitName.trim())) {
                            itemConversionUnits.push(c.sourceUnitName.trim());
                          }
                          if (c.targetUnitName && !itemConversionUnits.includes(c.targetUnitName.trim())) {
                            itemConversionUnits.push(c.targetUnitName.trim());
                          }
                        }
                      }
                    }

                    // Row status color theme
                    const statusConfig = {
                      GREEN: {
                        badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                        dot: 'bg-emerald-500',
                        rowBg: isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/80',
                      },
                      YELLOW: {
                        badge: 'bg-amber-100 text-amber-800 border-amber-300',
                        dot: 'bg-amber-500',
                        rowBg: isSelected ? 'bg-amber-50/50' : 'bg-amber-50/20 hover:bg-amber-50/40',
                      },
                      RED: {
                        badge: 'bg-rose-100 text-rose-800 border-rose-300',
                        dot: 'bg-rose-500',
                        rowBg: isSelected ? 'bg-rose-50/50' : 'bg-rose-50/20 hover:bg-rose-50/40',
                      },
                    }[row.status];

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedRowId(row.id)}
                        className={`transition-colors cursor-pointer ${statusConfig.rowBg} ${
                          isSelected ? 'ring-1 ring-inset ring-slate-300 font-medium' : ''
                        }`}
                      >
                        {/* Status Icon */}
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-bold ${statusConfig.badge}`}
                            title={
                              row.status === 'GREEN'
                                ? 'Hợp lệ'
                                : row.status === 'YELLOW'
                                ? 'Cần kiểm tra'
                                : 'Lỗi cần xử lý'
                            }
                          >
                            {row.status === 'GREEN' && '✓'}
                            {row.status === 'YELLOW' && '!'}
                            {row.status === 'RED' && '✕'}
                          </span>
                        </td>

                        {/* STT */}
                        <td className="px-2 py-2.5 text-center text-slate-400 font-mono">
                          {row.line_no}
                        </td>

                        {/* Raw Item Name */}
                        <td className="px-3 py-2.5 text-slate-800">
                          <div className="font-medium">{row.raw_item_name}</div>
                          {row.raw.raw_unit && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              ĐVT phiếu: <span className="font-mono">{row.raw.raw_unit}</span>
                            </div>
                          )}
                        </td>

                        {/* iPOS Catalog Combobox */}
                        <td className="px-3 py-2.5 relative">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdownId(isDropdownOpen ? null : row.id);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                                row.item_id
                                  ? 'bg-white border-slate-300 text-slate-800 shadow-2xs hover:border-slate-400'
                                  : 'bg-rose-50 border-rose-300 text-rose-700 font-semibold'
                              }`}
                            >
                              <div className="truncate pr-2">
                                {row.item_id ? (
                                  <span>
                                    <strong className="font-mono text-emerald-700 mr-1.5">[{row.item_id}]</strong>
                                    {row.item_name}
                                  </span>
                                ) : (
                                  <span>-- Chưa gán mã hàng iPOS --</span>
                                )}
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-full mt-1 w-96 bg-white border border-slate-300 rounded-xl shadow-xl z-50 p-2 space-y-2 text-xs"
                              >
                                {/* Combobox Search */}
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Gõ tìm mã hoặc tên mặt hàng iPOS..."
                                  value={comboboxSearch[row.id] || ''}
                                  onChange={(e) =>
                                    setComboboxSearch((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />

                                {/* AI Candidates Section */}
                                {row.candidates.length > 0 && !(comboboxSearch[row.id]?.trim()) && (
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                                      Gợi ý đối chiếu AI (Top {row.candidates.length}):
                                    </div>
                                    {row.candidates.map((cand) => (
                                      <div
                                        key={cand.item.itemId}
                                        onClick={() => handleSelectCandidate(row.id, cand.item, false)}
                                        className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer flex items-center justify-between group"
                                      >
                                        <div>
                                          <div className="font-semibold text-slate-800">
                                            <span className="font-mono text-emerald-700 mr-1.5">
                                              [{cand.item.itemId}]
                                            </span>
                                            {cand.item.itemName}
                                          </div>
                                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center space-x-2">
                                            <span>
                                              ĐVT: {cand.item.unitName || cand.item.unitId || '—'}
                                              {cand.item.unitId && cand.item.unitName && cand.item.unitId !== cand.item.unitName
                                                ? ` (${cand.item.unitId})`
                                                : ''}
                                            </span>
                                            <span>•</span>
                                            <span>Độ khớp: {cand.confidencePercent}%</span>
                                            {cand.matchType === 'learned_alias' && (
                                              <span className="text-amber-700 font-medium bg-amber-50 px-1.5 py-0.2 rounded">
                                                ★ Alias NCC
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectCandidate(row.id, cand.item, true);
                                          }}
                                          className="text-[10px] px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-200 hidden group-hover:block"
                                          title="Lưu quy tắc alias này cho các hóa đơn sau"
                                        >
                                          Lưu Alias
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Full Catalog Search Results */}
                                <div className="border-t border-slate-100 pt-1">
                                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">
                                    Toàn bộ danh mục ({masterData?.items?.length || 0}):
                                  </div>
                                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                                    {(masterData?.items || [])
                                      .filter((it) => {
                                        const q = (comboboxSearch[row.id] || '').toLowerCase();
                                        if (!q) return true;
                                        return (
                                          it.itemId.toLowerCase().includes(q) ||
                                          it.itemName.toLowerCase().includes(q)
                                        );
                                      })
                                      .slice(0, 30)
                                      .map((it) => (
                                        <div
                                          key={it.itemId}
                                          onClick={() => handleSelectCandidate(row.id, it, false)}
                                          className="p-1.5 hover:bg-emerald-50 rounded cursor-pointer flex items-center justify-between"
                                        >
                                          <div className="truncate pr-2">
                                            <span className="font-mono text-slate-600 font-medium mr-1.5">
                                              [{it.itemId}]
                                            </span>
                                            <span className="text-slate-800">{it.itemName}</span>
                                          </div>
                                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 shrink-0">
                                            {it.unitName || it.unitId || '—'}
                                            {it.unitId && it.unitName && it.unitId !== it.unitName ? ` (${it.unitId})` : ''}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Unit (ĐVT) - Smart Option Select Box */}
                        <td className="px-2 py-2.5">
                          <div className="space-y-1">
                            <div className="relative">
                              <select
                                value={row.unit || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '__custom__') {
                                    const custom = prompt(
                                      'Nhập Đơn vị tính mới cho dòng này (VD: thùng, lon, khay, kg...):'
                                    );
                                    if (custom && custom.trim()) {
                                      handleUpdateRow(row.id, { unit: custom.trim() });
                                    }
                                  } else {
                                    handleUpdateRow(row.id, { unit: val });
                                  }
                                }}
                                className={`w-full min-w-[88px] px-2 py-1 text-xs font-semibold rounded-lg border appearance-none pr-5 cursor-pointer transition-all shadow-2xs focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                                  !row.unit
                                    ? 'bg-rose-50 border-rose-300 text-rose-700'
                                    : itemPrimaryUnit && normalizeText(row.unit) === normalizeText(itemPrimaryUnit)
                                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-800'
                                    : itemConversionUnits.some((u) => normalizeText(u) === normalizeText(row.unit))
                                    ? 'bg-blue-50/80 border-blue-300 text-blue-800'
                                    : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
                                }`}
                              >
                                <option value="" disabled>
                                  -- Chọn ĐVT --
                                </option>

                                {/* Item standard unit */}
                                {itemPrimaryUnit && (
                                  <optgroup label="⭐ ĐVT chuẩn của hàng">
                                    <option value={itemPrimaryUnit}>
                                      {itemPrimaryUnit} (Chuẩn iPOS)
                                    </option>
                                  </optgroup>
                                )}

                                {/* Convertible units */}
                                {itemConversionUnits.filter(
                                  (u) => normalizeText(u) !== normalizeText(itemPrimaryUnit)
                                ).length > 0 && (
                                  <optgroup label="🔄 ĐVT quy đổi iPOS">
                                    {itemConversionUnits
                                      .filter((u) => normalizeText(u) !== normalizeText(itemPrimaryUnit))
                                      .map((u) => (
                                        <option key={`conv-${u}`} value={u}>
                                          {u} (Quy đổi)
                                        </option>
                                      ))}
                                  </optgroup>
                                )}

                                {/* Current row unit if not in system list */}
                                {row.unit &&
                                  !availableUnits.includes(row.unit.trim()) &&
                                  normalizeText(row.unit) !== normalizeText(itemPrimaryUnit) && (
                                    <optgroup label="⚠️ ĐVT trên phiếu (Chưa chuẩn)">
                                      <option value={row.unit}>{row.unit} (Trên phiếu)</option>
                                    </optgroup>
                                  )}

                                {/* All system UOMs */}
                                <optgroup label="📋 Danh mục ĐVT hệ thống">
                                  {availableUnits
                                    .filter((u) => normalizeText(u) !== normalizeText(itemPrimaryUnit))
                                    .map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                </optgroup>

                                <optgroup label="⚙️ Tùy chọn khác">
                                  <option value="__custom__">+ Nhập ĐVT tùy chỉnh...</option>
                                </optgroup>
                              </select>
                              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2 pointer-events-none" />
                            </div>

                            {/* Quick Unit Switch Badge */}
                            {itemPrimaryUnit && normalizeText(row.unit) !== normalizeText(itemPrimaryUnit) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateRow(row.id, { unit: itemPrimaryUnit });
                                }}
                                className="text-[10px] text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200 px-1.5 py-0.5 rounded font-mono font-medium block truncate max-w-full text-left transition-colors"
                                title={`Chuyển ngay sang ĐVT chuẩn iPOS: ${itemPrimaryUnit}`}
                              >
                                ➜ Dùng "{itemPrimaryUnit}"
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="px-2 py-2.5 text-right">
                          <input
                            type="number"
                            step="any"
                            value={row.quantity !== null ? row.quantity : ''}
                            placeholder="Chưa nhập"
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseFloat(e.target.value);
                              handleUpdateRow(row.id, { quantity: val });
                            }}
                            className={`w-20 px-2 py-1 text-right border rounded font-mono font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none ${
                              row.quantity === null || row.quantity <= 0
                                ? 'bg-rose-50 border-rose-300 text-rose-700'
                                : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                        </td>

                        {/* Price */}
                        <td className="px-2 py-2.5 text-right">
                          <input
                            type="number"
                            step="100"
                            value={row.price !== null ? row.price : ''}
                            placeholder="0"
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseFloat(e.target.value);
                              handleUpdateRow(row.id, { price: val });
                            }}
                            className="w-24 px-2 py-1 text-right bg-white border border-slate-300 rounded font-mono text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>

                        {/* VAT (%) Option Select Box */}
                        <td className="px-2 py-2.5 text-center">
                          <div className="relative">
                            <select
                              value={row.vat !== null && row.vat !== undefined ? row.vat : 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                handleUpdateRow(row.id, { vat: isNaN(val) ? 0 : val });
                              }}
                              className="w-16 px-1.5 py-1 text-center bg-white border border-slate-300 rounded font-medium text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer pr-4 appearance-none shadow-2xs"
                            >
                              <option value={0}>0%</option>
                              <option value={5}>5%</option>
                              <option value={8}>8%</option>
                              <option value={10}>10%</option>
                            </select>
                            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 top-2 pointer-events-none" />
                          </div>
                        </td>

                        {/* Subtotal */}
                        <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-700">
                          {formatVND(row.sub_total)}
                        </td>

                        {/* Warnings & Action Badges */}
                        <td className="px-3 py-2.5">
                          <div className="space-y-1">
                            {row.warnings.map((w, wIdx) => (
                              <div
                                key={wIdx}
                                className="text-[11px] text-amber-800 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200/80"
                              >
                                {w}
                              </div>
                            ))}

                            {row.learnedAliasApplied && (
                              <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium inline-block">
                                ★ Đã áp dụng Alias học được
                              </div>
                            )}

                            {row.status === 'GREEN' && row.warnings.length === 0 && (
                              <span className="text-[11px] text-emerald-600 font-medium flex items-center space-x-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Khớp hoàn toàn</span>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        Không có dòng hàng nào trong bộ lọc này
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Warning Dialog before Export */}
      {exportWarningModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Không thể xuất Excel - Còn dòng chưa hợp lệ
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phần mềm iPOS Inventory yêu cầu tất cả các dòng phải có Mã hàng, ĐVT và Số lượng hợp lệ (&gt; 0).
                </p>
              </div>
            </div>

            <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5 text-xs text-rose-800 font-medium">
              {exportWarningModal.map((err, i) => (
                <div key={i} className="flex items-start space-x-2">
                  <span className="text-rose-500 font-bold">•</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setExportWarningModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Đóng và chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
