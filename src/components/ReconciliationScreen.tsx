import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileCheck2,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Download,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  Layers,
  Save,
  Clock,
  Trash2,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Sliders,
  Camera,
  FileImage,
  RefreshCw,
} from 'lucide-react';
import {
  IposReceiptLine,
  VendorInvoiceLine,
  ReconciliationMatchPair,
  ReconciliationSession,
  ReconciliationSummary,
  LearnedItemAlias,
  IposMasterData,
} from '../types';
import { parseEinvoiceXml } from '../utils/einvoiceXmlParser';
import {
  parseIposReceiptExcel,
  generateSampleReconciliationData,
} from '../utils/iposReportParser';
import { runReconciliation } from '../utils/reconciliationEngine';
import { exportReconciliationToExcel } from '../utils/reconciliationExport';
import { normalizeWithoutAccents } from '../utils/vietnamese';
import {
  getReconciliationSessions,
  saveReconciliationSession,
  deleteReconciliationSession,
} from '../utils/db';
import {
  ToleranceConfigModal,
  ToleranceConfig,
  DEFAULT_TOLERANCE_CONFIG,
} from './ToleranceConfigModal';
import { ReconciliationAiModal } from './ReconciliationAiModal';
import { parseDeliveryNoteImage } from '../utils/deliveryNoteOcr';

interface ReconciliationScreenProps {
  learnedAliases?: LearnedItemAlias[];
  masterData?: IposMasterData | null;
}

export const ReconciliationScreen: React.FC<ReconciliationScreenProps> = ({
  learnedAliases = [],
  masterData = null,
}) => {
  // Input Data States
  const [iposLines, setIposLines] = useState<IposReceiptLine[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<VendorInvoiceLine[]>([]);
  const [iposFileName, setIposFileName] = useState<string>('');
  const [invoiceFileNames, setInvoiceFileNames] = useState<string[]>([]);

  // Processing & Results
  const [pairs, setPairs] = useState<ReconciliationMatchPair[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [expandedPairId, setExpandedPairId] = useState<string | null>(null);

  // Preserve user approval actions across recalculations
  const [resolutionsMap, setResolutionsMap] = useState<
    Record<string, { status: 'PENDING' | 'ACCEPTED_TOLERANCE' | 'DEBIT_APPROVED' | 'RESOLVED'; note?: string }>
  >({});

  // Phase 2: AI & Tolerance configuration states
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isToleranceModalOpen, setIsToleranceModalOpen] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [toleranceConfig, setToleranceConfig] = useState<ToleranceConfig>(() => {
    try {
      const saved = localStorage.getItem('ipos_reconciliation_tolerance_config');
      return saved ? JSON.parse(saved) : DEFAULT_TOLERANCE_CONFIG;
    } catch {
      return DEFAULT_TOLERANCE_CONFIG;
    }
  });

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'MATCH' | 'PRICE' | 'QTY' | 'UNMATCHED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // History & Persistence
  const [savedSessions, setSavedSessions] = useState<ReconciliationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // File Inputs
  const iposFileInputRef = useRef<HTMLInputElement>(null);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const deliveryNoteFileInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const list = await getReconciliationSessions();
    setSavedSessions(list);
  };

  const handleSaveToleranceConfig = (newConfig: ToleranceConfig) => {
    setToleranceConfig(newConfig);
    try {
      localStorage.setItem('ipos_reconciliation_tolerance_config', JSON.stringify(newConfig));
    } catch {}
  };

  // Re-run matching whenever lines or tolerances change, preserving user manual resolutions
  useEffect(() => {
    if (iposLines.length > 0 || invoiceLines.length > 0) {
      const result = runReconciliation(iposLines, invoiceLines, learnedAliases, {
        freshFoodQtyTolerancePercent: toleranceConfig.freshFoodTolerancePercent,
        vegetableQtyTolerancePercent: toleranceConfig.vegetableTolerancePercent,
        dryGoodsQtyTolerancePercent: toleranceConfig.dryGoodsTolerancePercent,
        currencyRoundingTolerance: toleranceConfig.roundingToleranceVnd,
        unitConversions: masterData?.unitConversions || [],
      });

      // Merge and preserve any user resolutions already taken
      const preservedPairs = result.pairs.map((p) => {
        const userRes = resolutionsMap[p.id];
        if (userRes) {
          return {
            ...p,
            resolutionStatus: userRes.status,
            resolutionNote: userRes.note || p.resolutionNote,
          };
        }
        return p;
      });

      setPairs(preservedPairs);
      setSummary(result.summary);
    } else {
      setPairs([]);
      setSummary(null);
    }
  }, [iposLines, invoiceLines, learnedAliases, masterData, resolutionsMap, toleranceConfig]);

  // Handle IVT iPOS Excel Upload
  const handleIposFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const lines = parseIposReceiptExcel(wb, file.name);
      setIposLines(lines);
      setIposFileName(file.name);
      if (iposFileInputRef.current) iposFileInputRef.current.value = '';
    } catch (err: any) {
      alert('Lỗi đọc file iPOS: ' + (err?.message || 'Định dạng file không hỗ trợ'));
    }
  };

  // Handle e-Invoice XML or Excel Upload
  const handleInvoiceFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      let allInvoiceLines: VendorInvoiceLine[] = [];
      const names: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        names.push(file.name);

        if (file.name.toLowerCase().endsWith('.xml')) {
          const text = await file.text();
          const parsed = parseEinvoiceXml(text, file.name);
          allInvoiceLines = [...allInvoiceLines, ...parsed];
        } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          // If vendor provides an Excel statement, parse it as lines
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet);
          
          const converted: VendorInvoiceLine[] = jsonRows.map((r, idx) => ({
            id: `excel_inv_${idx}_${Date.now()}`,
            invoiceNumber: String(r['Số HĐ'] || r['Số hóa đơn'] || r['Invoice'] || 'HD-EXCEL'),
            invoiceDate: String(r['Ngày'] || r['Ngày HĐ'] || new Date().toISOString().split('T')[0]),
            sellerName: String(r['Nhà cung cấp'] || r['NCC'] || file.name.replace(/\.[^/.]+$/, '')),
            itemName: String(r['Tên hàng'] || r['Tên mặt hàng'] || r['Mô tả'] || `Món ${idx + 1}`),
            unitName: String(r['ĐVT'] || r['Đơn vị'] || 'kg'),
            quantity: Number(r['Số lượng'] || r['SL'] || 0),
            unitPrice: Number(r['Đơn giá'] || r['Giá'] || 0),
            amount: Number(r['Thành tiền'] || r['Tiền hàng'] || 0),
            totalAmount: Number(r['Tổng tiền'] || r['Thành tiền'] || 0),
            sourceFile: file.name,
            sourceType: 'EXCEL_VENDOR',
          }));
          allInvoiceLines = [...allInvoiceLines, ...converted];
        }
      }

      setInvoiceLines(allInvoiceLines);
      setInvoiceFileNames(names);
      if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
    } catch (err: any) {
      alert('Lỗi đọc hóa đơn: ' + (err?.message || 'Có lỗi xảy ra khi bóc tách file'));
    }
  };

  // Handle 3-Way Matching: Scan paper delivery note image (OCR) with anti-double-counting
  const handleDeliveryNoteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    try {
      const ocrLines = await parseDeliveryNoteImage(file);

      setIposLines((prev) => {
        if (prev.length === 0) {
          return ocrLines;
        }

        // Anti-Double-Counting check:
        // If an item in iPOS has the same name and quantity, don't duplicate; tag it as 3-way verified!
        const updated = [...prev];
        for (const ocrItem of ocrLines) {
          const normOcr = normalizeWithoutAccents(ocrItem.itemName);
          const existingIdx = updated.findIndex((existing) => {
            const normExisting = normalizeWithoutAccents(existing.itemName);
            const isNameMatched = normExisting === normOcr || normExisting.includes(normOcr) || normOcr.includes(normExisting);
            const isQtyMatched = Math.abs((existing.quantity || 0) - (ocrItem.quantity || 0)) <= 0.1;
            return isNameMatched && isQtyMatched;
          });

          if (existingIdx >= 0) {
            // Found existing shipment recorded in iPOS -> Enrich with physical delivery slip verification
            updated[existingIdx] = {
              ...updated[existingIdx],
              note: `${updated[existingIdx].note || ''} • [Khớp phiếu giao hàng giấy OCR: ${ocrItem.quantity} ${ocrItem.unitName}]`,
            };
          } else {
            // New physical shipment not yet in iPOS
            updated.push(ocrItem);
          }
        }
        return updated;
      });

      setIposFileName((prev) =>
        prev ? `${prev} + ${file.name} (Ảnh OCR)` : `${file.name} (Phiếu giấy OCR)`
      );
      if (deliveryNoteFileInputRef.current) deliveryNoteFileInputRef.current.value = '';
    } catch (err: any) {
      alert('Lỗi nhận diện phiếu giao hàng: ' + (err?.message || 'Có lỗi xảy ra'));
    } finally {
      setIsOcrLoading(false);
    }
  };

  // 1-Click Load Realistic F&B Demo
  const handleLoadSampleDemo = () => {
    const demo = generateSampleReconciliationData();
    setIposLines(demo.iposLines);
    setInvoiceLines(demo.invoiceLines);
    setIposFileName('BC_MuaHangChiTiet_Thang09_MinhPhat.xlsx (Demo IVT iPOS)');
    setInvoiceFileNames(['HoaDonDienTu_0004521_MinhPhat.xml (Demo XML TT78)']);
    setCurrentSessionId('');
  };

  // Reset
  const handleReset = () => {
    setIposLines([]);
    setInvoiceLines([]);
    setIposFileName('');
    setInvoiceFileNames([]);
    setPairs([]);
    setSummary(null);
    setCurrentSessionId('');
    setResolutionsMap({});
  };

  // Save session to DB (IndexedDB + Cloud)
  const handleSaveSession = async () => {
    if (!summary || pairs.length === 0) return;
    setIsSaving(true);
    try {
      const sessionId = currentSessionId || `recon_${Date.now()}`;
      const sessionTitle = `Đối soát ${pairs[0]?.supplierName || 'NCC'} - ${new Date().toLocaleDateString('vi-VN')}`;

      const session: ReconciliationSession = {
        id: sessionId,
        title: sessionTitle,
        supplierName: pairs[0]?.supplierName || 'Nhà cung cấp',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'IN_REVIEW',
        summary,
        pairs,
        iposFileNames: [iposFileName].filter(Boolean),
        invoiceFileNames,
      };

      await saveReconciliationSession(session, true);
      setCurrentSessionId(sessionId);
      await loadSessions();

      setSaveSuccessMsg('Đã lưu phiên đối soát an toàn vào DB!');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (e: any) {
      alert('Lỗi lưu phiên: ' + e?.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Restore past session
  const handleRestoreSession = (s: ReconciliationSession) => {
    setCurrentSessionId(s.id);
    setPairs(s.pairs || []);
    setSummary(s.summary);
    setIposFileName(s.iposFileNames?.[0] || 'Phiên đã lưu');
    setInvoiceFileNames(s.invoiceFileNames || []);

    // Restore resolutionsMap from session
    const map: Record<string, { status: any; note?: string }> = {};
    s.pairs?.forEach((p) => {
      if (p.resolutionStatus && p.resolutionStatus !== 'PENDING') {
        map[p.id] = { status: p.resolutionStatus, note: p.resolutionNote };
      }
    });
    setResolutionsMap(map);

    // Reconstruct lines from pairs
    const allIpos: IposReceiptLine[] = [];
    const allInvs: VendorInvoiceLine[] = [];
    s.pairs?.forEach((p) => {
      if (p.iposLines) allIpos.push(...p.iposLines);
      if (p.invoiceLine) allInvs.push(p.invoiceLine);
    });
    setIposLines(allIpos);
    setInvoiceLines(allInvs);
  };

  // Delete past session
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc chắn muốn xóa phiên đối soát này khỏi cơ sở dữ liệu?')) return;
    await deleteReconciliationSession(id, true);
    await loadSessions();
    if (currentSessionId === id) {
      handleReset();
    }
  };

  // Update line action
  const handleResolvePair = (pairId: string, action: 'ACCEPTED_TOLERANCE' | 'DEBIT_APPROVED' | 'RESOLVED') => {
    const note =
      action === 'ACCEPTED_TOLERANCE'
        ? 'Đã duyệt: Chấp nhận hao hụt tự nhiên tươi sống'
        : action === 'DEBIT_APPROVED'
        ? 'Đã duyệt: Lập biên bản cấn trừ công nợ NCC'
        : 'Đã xử lý xong';

    setResolutionsMap((prev) => ({
      ...prev,
      [pairId]: { status: action, note },
    }));

    setPairs((prev) =>
      prev.map((p) => {
        if (p.id === pairId) {
          return {
            ...p,
            resolutionStatus: action,
            resolutionNote: note,
          };
        }
        return p;
      })
    );
  };

  // Export Excel
  const handleExportExcel = () => {
    if (!summary || pairs.length === 0) return;
    exportReconciliationToExcel(pairs[0]?.supplierName || 'NCC', pairs, summary);
  };

  // Filter pairs
  const filteredPairs = pairs.filter((p) => {
    // Tab filter
    if (activeFilter === 'MATCH' && p.status !== 'PERFECT_MATCH') return false;
    if (activeFilter === 'PRICE' && p.status !== 'PRICE_DIFF' && p.status !== 'PRICE_AND_QTY_DIFF') return false;
    if (activeFilter === 'QTY' && p.status !== 'QUANTITY_DIFF' && p.status !== 'PRICE_AND_QTY_DIFF') return false;
    if (activeFilter === 'UNMATCHED' && p.status !== 'UNMATCHED_IPOS' && p.status !== 'UNMATCHED_INVOICE') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.matchedItemName.toLowerCase().includes(q);
      const matchSupplier = p.supplierName.toLowerCase().includes(q);
      const matchReceipt = p.iposLines.some((l) => l.receiptNumber.toLowerCase().includes(q));
      const matchInvoice = p.invoiceLine?.invoiceNumber.toLowerCase().includes(q);
      if (!matchName && !matchSupplier && !matchReceipt && !matchInvoice) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl border border-slate-700/60 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Đối soát Hóa đơn Tự động
                </h1>
                <span className="text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  3-Way / N-1 Smart AI F&B
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                So khớp 3 chiều: Phiếu giao hàng giấy (ảnh) ↔ Báo cáo IVT iPOS (Excel) ↔ Hóa đơn điện tử VAT (XML)
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tolerance Config Button */}
          <button
            onClick={() => setIsToleranceModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Cấu hình ngưỡng dung sai tự nhiên (thịt tươi, rau củ, làm tròn tiền)"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dung sai: ±{toleranceConfig.freshFoodTolerancePercent}%</span>
          </button>

          {/* AI Diagnosis Button (active when summary has discrepancies) */}
          {summary && (summary.priceDiffCount > 0 || summary.qtyDiffCount > 0 || summary.unmatchedInvoiceCount > 0) && (
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer animate-pulse"
              title="Phân tích nguyên nhân chênh lệch & tự động soạn thảo công văn trừ tiền gửi NCC"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Chẩn đoán & Soạn văn bản NCC</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full font-mono font-bold">
                {summary.priceDiffCount + summary.qtyDiffCount + summary.unmatchedInvoiceCount}
              </span>
            </button>
          )}

          <button
            onClick={handleLoadSampleDemo}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            title="Tải ngay bộ dữ liệu mẫu gồm thịt tươi, rau củ quả, sữa có đầy đủ các ca lệch giá và lệch lượng thực tế"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Thử dữ liệu mẫu F&B</span>
          </button>

          {summary && (
            <>
              <button
                onClick={handleSaveSession}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu vào DB'}</span>
              </button>

              <button
                onClick={handleExportExcel}
                className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất Biên bản (.xlsx)</span>
              </button>
            </>
          )}

          {(iposLines.length > 0 || invoiceLines.length > 0) && (
            <button
              onClick={handleReset}
              className="p-2 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors cursor-pointer"
              title="Làm mới bảng đối soát"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between shadow-md animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
        </div>
      )}

      {/* 3-Way Matching Upload Hub */}
      {(!summary || iposLines.length === 0 || invoiceLines.length === 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Box 1: IVT iPOS Excel Import */}
          <div className="bg-slate-900/90 border-2 border-dashed border-slate-700 hover:border-emerald-500/60 p-5 rounded-2xl transition-all flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl mb-3">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-white">1. Báo cáo kho IVT iPOS</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Xuất "Báo cáo chi tiết mua hàng" hoặc "Bảng kê phiếu nhập" (.xlsx)
            </p>

            {iposFileName ? (
              <div className="mt-4 px-3 py-1.5 bg-emerald-950/60 border border-emerald-700/60 rounded-xl text-emerald-300 text-[11px] font-mono truncate max-w-full">
                ✓ {iposFileName}
              </div>
            ) : null}

            <input
              ref={iposFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleIposFileUpload}
              className="hidden"
            />
            <button
              onClick={() => iposFileInputRef.current?.click()}
              className="mt-4 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium cursor-pointer transition-colors"
            >
              {iposFileName ? 'Thay file iPOS' : 'Chọn file Excel iPOS'}
            </button>
          </div>

          {/* Box 2: Vendor Invoices (XML / Excel) Import */}
          <div className="bg-slate-900/90 border-2 border-dashed border-slate-700 hover:border-indigo-500/60 p-5 rounded-2xl transition-all flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl mb-3">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-white">2. Hóa đơn điện tử VAT NCC</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              File XML Hóa đơn điện tử TT78 (Viettel, VNPT, MISA...) hoặc file Excel NCC
            </p>

            {invoiceFileNames.length > 0 ? (
              <div className="mt-4 px-3 py-1.5 bg-indigo-950/60 border border-indigo-700/60 rounded-xl text-indigo-300 text-[11px] font-mono truncate max-w-full">
                ✓ Đã tải {invoiceFileNames.length} file ({invoiceLines.length} dòng hàng)
              </div>
            ) : null}

            <input
              ref={invoiceFileInputRef}
              type="file"
              accept=".xml,.xlsx,.xls"
              multiple
              onChange={handleInvoiceFilesUpload}
              className="hidden"
            />
            <button
              onClick={() => invoiceFileInputRef.current?.click()}
              className="mt-4 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-medium cursor-pointer transition-colors"
            >
              {invoiceFileNames.length > 0 ? 'Thêm file HĐ' : 'Chọn file XML / Excel HĐ'}
            </button>
          </div>

          {/* Box 3: Paper Delivery Note / Thermal Slip OCR (3-Way Matching) */}
          <div className="bg-slate-900/90 border-2 border-dashed border-slate-700 hover:border-purple-500/60 p-5 rounded-2xl transition-all flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl mb-3">
              <Camera className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-white">3. Phiếu giao hàng giấy (OCR 3-Way)</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Chụp ảnh phiếu giao hàng viết tay/in nhiệt lúc nhận hàng buổi sáng
            </p>

            {isOcrLoading ? (
              <div className="mt-4 px-3 py-1.5 bg-purple-950/60 text-purple-300 text-xs font-medium flex items-center space-x-1.5 rounded-xl border border-purple-700/60">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>AI đang đọc phiếu ảnh...</span>
              </div>
            ) : null}

            <input
              ref={deliveryNoteFileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleDeliveryNoteUpload}
              className="hidden"
            />
            <button
              onClick={() => deliveryNoteFileInputRef.current?.click()}
              disabled={isOcrLoading}
              className="mt-4 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-medium cursor-pointer transition-colors"
            >
              {isOcrLoading ? 'Đang trích xuất...' : 'Chụp/Tải ảnh phiếu giấy'}
            </button>
          </div>
        </div>
      )}

      {/* Analytics Dashboard Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card 1: Match Rate */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Tỷ lệ khớp 100%</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {summary.matchRatePercent}%
              </span>
              <span className="text-xs text-slate-500">
                ({summary.perfectMatchCount}/{summary.totalPairs} mục)
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${summary.matchRatePercent}%` }}
              />
            </div>
          </div>

          {/* Card 2: iPOS Total Amount */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Tiền thực nhập (iPOS)</span>
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-200">
              {summary.totalIposAmount.toLocaleString('vi-VN')} đ
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Căn cứ theo số lượng cân tại kho</p>
          </div>

          {/* Card 3: Vendor Invoice Total Amount */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Tiền Hóa đơn NCC</span>
              <FileText className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-200">
              {summary.totalInvoiceAmount.toLocaleString('vi-VN')} đ
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Theo hóa đơn điện tử NCC xuất</p>
          </div>

          {/* Card 4: Discrepancy Amount to Debit */}
          <div className="bg-gradient-to-br from-rose-950/60 to-slate-900 border border-rose-800/60 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between text-xs text-rose-300 font-semibold mb-1">
              <span>Tiền tính thừa (Cần trừ NCC)</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-bold font-mono text-rose-400">
              {summary.totalOverchargedAmount > 0 ? `+${summary.totalOverchargedAmount.toLocaleString('vi-VN')} đ` : '0 đ'}
            </div>
            <p className="text-[11px] text-rose-300/70 mt-1">
              {summary.priceDiffCount} mục lệch giá, {summary.qtyDiffCount} mục lệch lượng
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar & Search */}
      {summary && (
        <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter === 'ALL'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Tất cả ({summary.totalPairs})
            </button>

            <button
              onClick={() => setActiveFilter('MATCH')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter === 'MATCH'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-emerald-400 hover:bg-emerald-950/40'
              }`}
            >
              <span>Khớp 100% 🟢</span>
              <span>({summary.perfectMatchCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('PRICE')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter === 'PRICE'
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'text-rose-400 hover:bg-rose-950/40'
              }`}
            >
              <span>Lệch đơn giá 🔴</span>
              <span>({summary.priceDiffCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('QTY')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter === 'QTY'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-amber-400 hover:bg-amber-950/40'
              }`}
            >
              <span>Lệch số lượng 🟠</span>
              <span>({summary.qtyDiffCount})</span>
            </button>

            <button
              onClick={() => setActiveFilter('UNMATCHED')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter === 'UNMATCHED'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'text-purple-400 hover:bg-purple-950/40'
              }`}
            >
              <span>Chưa đủ chứng từ 🟡</span>
              <span>({summary.unmatchedIposCount + summary.unmatchedInvoiceCount})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm tên hàng, số HĐ, mã phiếu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Main Reconciliation Table */}
      {summary && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <th className="py-3 px-4 w-10"></th>
                  <th className="py-3 px-4">Tên mặt hàng & Nhà cung cấp</th>
                  <th className="py-3 px-4">ĐVT</th>
                  <th className="py-3 px-4 text-right">SL iPOS (Thực nhập)</th>
                  <th className="py-3 px-4 text-right">SL Hóa đơn NCC</th>
                  <th className="py-3 px-4 text-right">Đơn giá iPOS</th>
                  <th className="py-3 px-4 text-right">Đơn giá HĐ</th>
                  <th className="py-3 px-4 text-right">Tiền iPOS</th>
                  <th className="py-3 px-4 text-right">Tiền HĐ NCC</th>
                  <th className="py-3 px-4 text-right font-bold">Chênh lệch (Delta)</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center">Thao tác xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPairs.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-500">
                      Không có dòng nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredPairs.map((p) => {
                    const isExpanded = expandedPairId === p.id;
                    const hasDiscrepancy = p.status !== 'PERFECT_MATCH';

                    return (
                      <React.Fragment key={p.id}>
                        <tr
                          className={`hover:bg-slate-800/40 transition-colors ${
                            p.severity === 'CRITICAL'
                              ? 'bg-rose-950/10'
                              : p.severity === 'WARNING'
                              ? 'bg-amber-950/10'
                              : ''
                          }`}
                        >
                          {/* Expand Toggle */}
                          <td className="py-3 px-4 text-center">
                            {p.iposLines.length > 0 && (
                              <button
                                onClick={() => setExpandedPairId(isExpanded ? null : p.id)}
                                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                                title="Xem chi tiết các phiếu nhập iPOS gom nhóm"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </td>

                          {/* Item Name & Details */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-100 flex items-center space-x-2">
                              <span>{p.matchedItemName}</span>
                              {p.iposLines.length > 1 && (
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-mono font-normal">
                                  Gom {p.iposLines.length} phiếu
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {p.supplierName} • {p.invoiceLine ? `HĐ: ${p.invoiceLine.invoiceNumber}` : 'Chưa có HĐ'}
                            </div>
                          </td>

                          {/* Unit */}
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {p.iposLines[0]?.unitName || p.invoiceLine?.unitName || 'kg'}
                          </td>

                          {/* iPOS Qty */}
                          <td className="py-3 px-4 text-right font-mono font-medium text-slate-200">
                            {p.iposQty > 0 ? p.iposQty : '-'}
                          </td>

                          {/* Invoice Qty */}
                          <td
                            className={`py-3 px-4 text-right font-mono font-medium ${
                              p.qtyDelta > 0 ? 'text-amber-400 font-bold' : 'text-slate-200'
                            }`}
                          >
                            {p.invoiceQty > 0 ? p.invoiceQty : '-'}
                            {p.qtyDelta > 0 && (
                              <div className="text-[10px] text-amber-500">
                                (+{p.qtyDelta})
                              </div>
                            )}
                          </td>

                          {/* iPOS Price */}
                          <td className="py-3 px-4 text-right font-mono text-slate-300">
                            {p.iposPrice > 0 ? p.iposPrice.toLocaleString('vi-VN') : '-'}
                          </td>

                          {/* Invoice Price */}
                          <td
                            className={`py-3 px-4 text-right font-mono font-medium ${
                              p.priceDelta > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'
                            }`}
                          >
                            {p.invoicePrice > 0 ? p.invoicePrice.toLocaleString('vi-VN') : '-'}
                            {p.priceDelta > 0 && (
                              <div className="text-[10px] text-rose-500">
                                (+{p.priceDelta.toLocaleString('vi-VN')})
                              </div>
                            )}
                          </td>

                          {/* iPOS Total */}
                          <td className="py-3 px-4 text-right font-mono text-slate-300">
                            {p.iposAmount > 0 ? `${p.iposAmount.toLocaleString('vi-VN')} đ` : '-'}
                          </td>

                          {/* Invoice Total */}
                          <td className="py-3 px-4 text-right font-mono text-slate-200">
                            {p.invoiceAmount > 0 ? `${p.invoiceAmount.toLocaleString('vi-VN')} đ` : '-'}
                          </td>

                          {/* Discrepancy Amount */}
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {p.amountDelta > 0 ? (
                              <span className="text-rose-400 bg-rose-950/60 border border-rose-800/60 px-2 py-0.5 rounded">
                                +{p.amountDelta.toLocaleString('vi-VN')} đ
                              </span>
                            ) : p.amountDelta < 0 ? (
                              <span className="text-emerald-400">
                                {p.amountDelta.toLocaleString('vi-VN')} đ
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-normal">0 đ</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-4 text-center">
                            {p.status === 'PERFECT_MATCH' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Khớp 100% 🟢
                              </span>
                            ) : p.status === 'PRICE_DIFF' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                Lệch giá 🔴
                              </span>
                            ) : p.status === 'QUANTITY_DIFF' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Lệch lượng 🟠
                              </span>
                            ) : p.status === 'UNMATCHED_IPOS' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                Thiếu HĐ 🟡
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-300 border border-slate-500/20">
                                Chưa nhập kho 🟣
                              </span>
                            )}

                            {p.resolutionStatus !== 'PENDING' && (
                              <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                                ✓ {p.resolutionStatus === 'DEBIT_APPROVED' ? 'Đã duyệt trừ tiền' : 'Đã duyệt'}
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center">
                            {p.status === 'PERFECT_MATCH' ? (
                              <span className="text-[11px] text-slate-500">Đủ điều kiện chi</span>
                            ) : p.resolutionStatus === 'PENDING' ? (
                              <div className="flex items-center justify-center space-x-1">
                                {p.status === 'QUANTITY_DIFF' && (
                                  <button
                                    onClick={() => handleResolvePair(p.id, 'ACCEPTED_TOLERANCE')}
                                    className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-700/60 rounded text-[10px] cursor-pointer"
                                    title="Chấp nhận hao hụt độ ẩm / rã đông tươi sống"
                                  >
                                    Chấp nhận hao hụt
                                  </button>
                                )}
                                {p.amountDelta > 0 && (
                                  <button
                                    onClick={() => handleResolvePair(p.id, 'DEBIT_APPROVED')}
                                    className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-700/60 rounded text-[10px] font-semibold cursor-pointer"
                                    title="Lập khoản trừ công nợ gửi NCC"
                                  >
                                    Trừ tiền NCC
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">{p.resolutionNote}</span>
                            )}
                          </td>
                        </tr>

                        {/* Expandable Row for N-to-1 Details */}
                        {isExpanded && p.iposLines.length > 0 && (
                          <tr className="bg-slate-950/70 border-b border-slate-800">
                            <td colSpan={12} className="p-4 pl-12">
                              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                                  <span>
                                    Danh sách {p.iposLines.length} phiếu nhập kho IVT gom vào đợt đối soát này:
                                  </span>
                                  <span className="text-slate-500 font-normal">
                                    Tổng cộng: {p.iposQty} {p.iposLines[0]?.unitName} = {p.iposAmount.toLocaleString('vi-VN')} đ
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {p.iposLines.map((rec) => (
                                    <div
                                      key={rec.id}
                                      className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-xs space-y-1"
                                    >
                                      <div className="flex items-center justify-between text-emerald-400 font-mono font-medium">
                                        <span>{rec.receiptNumber}</span>
                                        <span>{rec.receiptDate}</span>
                                      </div>
                                      <div className="text-slate-300">
                                        SL: <strong>{rec.quantity}</strong> {rec.unitName} @ {rec.unitPrice.toLocaleString('vi-VN')} đ
                                      </div>
                                      <div className="text-slate-400 text-[11px] flex justify-between">
                                        <span>Tiền: {rec.amount.toLocaleString('vi-VN')} đ</span>
                                        <span className="text-slate-500">{rec.warehouseCode}</span>
                                      </div>
                                      {rec.note && (
                                        <div className="text-[10px] text-amber-400/80 italic">
                                          Ghi chú: {rec.note}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved Sessions Drawer / History Section */}
      {savedSessions.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Lịch sử các phiên đối soát đã lưu trong Database
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {savedSessions.length} phiên đã lưu
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {savedSessions.map((s) => (
              <div
                key={s.id}
                onClick={() => handleRestoreSession(s)}
                className={`p-3.5 bg-slate-950 border rounded-xl cursor-pointer transition-all hover:border-indigo-500/60 ${
                  currentSessionId === s.id
                    ? 'border-indigo-500 bg-indigo-950/20'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                  <span className="truncate max-w-[180px]">{s.title}</span>
                  <button
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Xóa phiên này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                  <div>NCC: {s.supplierName}</div>
                  <div>
                    Khớp: <strong className="text-emerald-400">{s.summary?.matchRatePercent}%</strong> • Lệch:{' '}
                    <strong className="text-rose-400">{s.summary?.totalOverchargedAmount?.toLocaleString('vi-VN')} đ</strong>
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    Lưu lúc: {new Date(s.updatedAt || s.createdAt).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tolerance Configuration Modal */}
      <ToleranceConfigModal
        isOpen={isToleranceModalOpen}
        onClose={() => setIsToleranceModalOpen(false)}
        config={toleranceConfig}
        onSave={handleSaveToleranceConfig}
      />

      {/* AI Discrepancy Diagnostics & Formal Notice Modal */}
      <ReconciliationAiModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        supplierName={pairs[0]?.supplierName || 'Nhà cung cấp'}
        summary={summary}
        pairs={pairs}
      />
    </div>
  );
};
