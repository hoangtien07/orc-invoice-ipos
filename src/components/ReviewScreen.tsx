import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  CheckCheck,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  PackageCheck,
  FolderArchive,
} from 'lucide-react';
import {
  InvoiceDocumentSession,
  IposMasterData,
  LearnedItemAlias,
  LearnedUnitAlias,
} from '../types';
import { InvoiceCard } from './InvoiceCard';
import {
  exportAllInvoicesToZip,
  mergeInvoiceSessions,
  splitInvoiceSession,
} from '../utils/invoiceGrouper';
import { formatVND } from '../utils/vietnamese';
import { generateIposExportWorkbook, writeXlsxFile } from '../utils/excel';

interface ReviewScreenProps {
  invoices: InvoiceDocumentSession[];
  setInvoices: React.Dispatch<React.SetStateAction<InvoiceDocumentSession[]>>;
  masterData: IposMasterData | null;
  learnedAliases: LearnedItemAlias[];
  learnedUnitAliases: LearnedUnitAlias[];
  onAliasesUpdated: () => void;
  onBackToScan: () => void;
  onOpenAliasManager?: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  invoices = [],
  setInvoices,
  masterData,
  learnedAliases = [],
  learnedUnitAliases = [],
  onAliasesUpdated,
  onBackToScan,
  onOpenAliasManager,
}) => {
  // Lightbox Modal for zooming invoice images
  const [activeLightboxImage, setActiveLightboxImage] = useState<{
    url: string;
    title?: string;
  } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(100);

  // Export progress / status
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportWarningDialog, setExportWarningDialog] = useState<string[] | null>(null);

  // Calculate session-wide totals
  const totalInvoicesCount = invoices.length;
  const totalRowsCount = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (inv.matchedRows?.length || 0), 0);
  }, [invoices]);

  const totalAmountSession = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const invTotal = (inv.matchedRows || []).reduce((rowSum, r) => {
        if (r.total_amount !== null && r.total_amount !== undefined) {
          return rowSum + r.total_amount;
        }
        const sub =
          r.sub_total !== null && r.sub_total !== undefined
            ? r.sub_total
            : (r.quantity || 0) * (r.price || 0);
        const vat = r.amount_vat ?? (sub * (r.vat || 0)) / 100;
        return rowSum + sub + vat;
      }, 0);
      return sum + invTotal;
    }, 0);
  }, [invoices]);

  const totalRedCount = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      return sum + (inv.matchedRows || []).filter((r) => r.status === 'RED').length;
    }, 0);
  }, [invoices]);

  const totalYellowCount = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      return sum + (inv.matchedRows || []).filter((r) => r.status === 'YELLOW').length;
    }, 0);
  }, [invoices]);

  // Smooth scroll to an invoice card
  const handleScrollToInvoice = (invoiceId: string) => {
    const el = document.getElementById(`invoice-card-${invoiceId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Update a specific invoice
  const handleUpdateInvoice = (updated: InvoiceDocumentSession) => {
    setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
  };

  // Delete an invoice
  const handleDeleteInvoice = (invoiceId: string) => {
    setInvoices((prev) => {
      const remaining = prev.filter((inv) => inv.id !== invoiceId);
      // Re-index orderIndex
      return remaining.map((inv, idx) => ({ ...inv, orderIndex: idx + 1 }));
    });
  };

  // Merge invoice with the one above it
  const handleMergeWithAbove = (invoiceId: string) => {
    setInvoices((prev) => {
      const idx = prev.findIndex((inv) => inv.id === invoiceId);
      if (idx <= 0) return prev;

      const target = prev[idx - 1];
      const source = prev[idx];

      const merged = mergeInvoiceSessions(
        target,
        source,
        masterData,
        learnedAliases,
        learnedUnitAliases
      );

      const newInvoices = [...prev];
      newInvoices[idx - 1] = merged;
      newInvoices.splice(idx, 1);

      return newInvoices.map((inv, i) => ({ ...inv, orderIndex: i + 1 }));
    });
  };

  // Split an image from an invoice
  const handleSplitImage = (invoiceId: string, imageId: string) => {
    setInvoices((prev) => {
      const idx = prev.findIndex((inv) => inv.id === invoiceId);
      if (idx < 0) return prev;

      const target = prev[idx];
      const splitRes = splitInvoiceSession(
        target,
        imageId,
        masterData,
        learnedAliases,
        learnedUnitAliases
      );

      if (!splitRes) return prev;

      const [remaining, newInv] = splitRes;
      const newInvoices = [...prev];
      newInvoices.splice(idx, 1, remaining, newInv);

      return newInvoices.map((inv, i) => ({ ...inv, orderIndex: i + 1 }));
    });
  };

  // Confirm all yellow across all invoices
  const handleConfirmAllYellowGlobal = () => {
    setInvoices((prev) =>
      prev.map((inv) => ({
        ...inv,
        matchedRows: (inv.matchedRows || []).map((r) =>
          r.status === 'YELLOW' ? { ...r, isManuallyConfirmed: true, status: 'GREEN', warnings: [] } : r
        ),
        status: (inv.matchedRows || []).some((r) => r.status === 'RED') ? 'NEEDS_REVIEW' : 'READY',
      }))
    );
  };

  // Export all invoices
  const handleExportAll = async () => {
    if (!masterData || invoices.length === 0) return;

    if (totalRedCount > 0) {
      setExportWarningDialog([
        `Có ${totalRedCount} dòng hàng bị lỗi chặn (Đỏ) chưa được gán mã iPOS hoặc thiếu số lượng.`,
        'Bạn nên kiểm tra và chọn mã hàng cho các dòng đỏ trước khi xuất để iPOS không bị lỗi khi nạp file.',
      ]);
      return;
    }

    await executeExportAll();
  };

  const executeExportAll = async () => {
    if (!masterData) return;
    setIsExportingAll(true);
    try {
      if (invoices.length === 1) {
        // Single invoice export as direct .xlsx
        const single = invoices[0];
        const { workbook, fileName } = generateIposExportWorkbook(masterData, single.matchedRows, {
          supplierName: single.supplierName,
          supplierId: single.supplierId,
          warehouseId: single.warehouseId,
          warehouseName: single.warehouseName,
          invoiceNumber: single.invoiceNumber,
          documentDate: single.documentDate,
          note: single.note || '',
        });
        writeXlsxFile(workbook, fileName);
      } else {
        // Multiple invoices export as a ZIP file
        const zipName = `IPOS_HOA_DON_TONG_${new Date().toISOString().slice(0, 10)}.zip`;
        await exportAllInvoicesToZip(invoices, masterData, zipName);
      }
      setExportWarningDialog(null);
    } catch (err: any) {
      console.error('Export all failed:', err);
      alert(`Lỗi khi xuất file: ${err.message}`);
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Sticky Header / Overview & Quick Jump Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-slate-200 shadow-md space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onBackToScan}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
              title="Quay lại tải ảnh"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Duyệt hóa đơn nhập hàng
                </h2>
                <span className="px-2.5 py-0.5 bg-slate-900 text-white text-xs font-bold rounded-full">
                  {totalInvoicesCount} hóa đơn
                </span>
                {totalRedCount === 0 && totalYellowCount === 0 ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full hidden sm:inline-flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sẵn sàng xuất iPOS</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-xs font-semibold rounded-full hidden sm:inline-flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Cần duyệt {totalRedCount + totalYellowCount} dòng</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kéo xuống để xem từng hóa đơn. Mỗi hóa đơn có nút tải Excel riêng hoặc tải toàn bộ dạng file nén.
              </p>
            </div>
          </div>

          {/* Session Top Actions */}
          <div className="flex items-center space-x-2 shrink-0">
            {onOpenAliasManager && (
              <button
                type="button"
                onClick={onOpenAliasManager}
                className="hidden lg:flex items-center space-x-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-colors"
                title="Từ điển ghi nhớ mã hàng theo từng nhà cung cấp"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                <span>Từ điển ({learnedAliases.length})</span>
              </button>
            )}

            {totalYellowCount > 0 && (
              <button
                type="button"
                onClick={handleConfirmAllYellowGlobal}
                className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors shadow-2xs"
                title="Duyệt tất cả dòng vàng ở toàn bộ các hóa đơn"
              >
                <CheckCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Duyệt tất cả dòng vàng ({totalYellowCount})</span>
              </button>
            )}

            {/* Export All Invoices Button */}
            <button
              id="btn-export-all-invoices"
              type="button"
              disabled={isExportingAll}
              onClick={handleExportAll}
              className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl shadow-sm transition-all ${
                totalRedCount > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : totalYellowCount > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md'
              }`}
              title={
                invoices.length > 1
                  ? 'Tải xuống file ZIP chứa toàn bộ các file Excel iPOS tương ứng với từng hóa đơn'
                  : 'Tải file Excel iPOS'
              }
            >
              {invoices.length > 1 ? (
                <FolderArchive className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {isExportingAll
                  ? 'Đang nén file Excel...'
                  : invoices.length > 1
                  ? `Tải tất cả (${totalInvoicesCount} file ZIP)`
                  : 'Tải Excel iPOS'}
              </span>
            </button>
          </div>
        </div>

        {/* Sticky Jump Bar Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-t border-slate-100 pt-2.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
            Nhảy nhanh tới HĐ:
          </span>

          <div className="flex items-center space-x-2">
            {invoices.map((inv, idx) => {
              const rowsCount = inv.matchedRows?.length || 0;
              const hasRed = inv.matchedRows?.some((r) => r.status === 'RED');
              const hasYellow = inv.matchedRows?.some((r) => r.status === 'YELLOW' && !r.isManuallyConfirmed);

              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => handleScrollToInvoice(inv.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all shadow-2xs hover:scale-[1.02] active:scale-[0.98] ${
                    hasRed
                      ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
                      : hasYellow
                      ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800'
                  }`}
                >
                  <span className="font-bold">#{idx + 1}</span>
                  <span className="truncate max-w-[130px]">{inv.supplierName || 'NCC'}</span>
                  <span className="text-[11px] opacity-75">({rowsCount})</span>
                  {hasRed ? (
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  ) : hasYellow ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Session Overview Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Tổng số hóa đơn
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 flex items-baseline space-x-1">
            <span>{totalInvoicesCount}</span>
            <span className="text-xs font-medium text-slate-500">phiếu độc lập</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Tổng số dòng hàng
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 flex items-baseline space-x-1">
            <span>{totalRowsCount}</span>
            <span className="text-xs font-medium text-slate-500">mặt hàng</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Trạng thái kiểm duyệt
          </div>
          <div className="text-xl font-bold mt-1 flex items-center space-x-2">
            {totalRedCount > 0 ? (
              <span className="text-rose-600">{totalRedCount} dòng lỗi</span>
            ) : totalYellowCount > 0 ? (
              <span className="text-amber-600">{totalYellowCount} cần xem</span>
            ) : (
              <span className="text-emerald-600 flex items-center space-x-1">
                <CheckCircle2 className="w-5 h-5" />
                <span>100% hợp lệ</span>
              </span>
            )}
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Tổng tiền toàn bộ phiên
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1 truncate">
            {formatVND(totalAmountSession)}
          </div>
        </div>
      </div>

      {/* List of Invoices (Card-based layout) */}
      <div className="space-y-8">
        {invoices.map((inv, idx) => (
          <InvoiceCard
            key={inv.id}
            invoice={inv}
            orderIndex={idx + 1}
            totalInvoices={totalInvoicesCount}
            onUpdateInvoice={handleUpdateInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onMergeWithAbove={idx > 0 ? handleMergeWithAbove : undefined}
            onSplitImage={inv.images.length > 1 ? handleSplitImage : undefined}
            masterData={masterData}
            learnedAliases={learnedAliases}
            learnedUnitAliases={learnedUnitAliases}
            onAliasesUpdated={onAliasesUpdated}
            onViewImage={(url, title) => {
              setActiveLightboxImage({ url, title });
              setLightboxZoom(100);
            }}
            onOpenAliasManager={onOpenAliasManager}
          />
        ))}
      </div>

      {/* Image Lightbox Modal */}
      {activeLightboxImage && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Lightbox Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-800">
                  {activeLightboxImage.title || 'Ảnh gốc hóa đơn đối chiếu'}
                </h4>
              </div>

              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg p-1 text-xs">
                  <button
                    onClick={() => setLightboxZoom((z) => Math.max(50, z - 25))}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-mono text-slate-600">{lightboxZoom}%</span>
                  <button
                    onClick={() => setLightboxZoom((z) => Math.min(300, z + 25))}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setLightboxZoom(100)}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded"
                    title="100%"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => setActiveLightboxImage(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lightbox Body */}
            <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center">
              <img
                src={activeLightboxImage.url}
                alt="Phóng to hóa đơn"
                style={{
                  transform: `scale(${lightboxZoom / 100})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Validation Warning Dialog before Export */}
      {exportWarningDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cảnh báo xuất file Excel iPOS
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Một số hóa đơn trong phiên còn dòng hàng chưa được gán mã iPOS chuẩn.
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5 text-xs text-amber-900 font-medium">
              {exportWarningDialog.map((err, i) => (
                <div key={i} className="flex items-start space-x-2">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setExportWarningDialog(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Xem lại & Chỉnh sửa
              </button>
              <button
                type="button"
                onClick={executeExportAll}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Vẫn xuất toàn bộ ({totalInvoicesCount} HĐ)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
