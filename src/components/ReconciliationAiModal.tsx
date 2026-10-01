import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Copy,
  Check,
  Download,
  AlertTriangle,
  ShieldAlert,
  FileText,
  TrendingDown,
  Layers,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { ReconciliationMatchPair, ReconciliationSummary } from '../types';

interface AiDiagnosisData {
  executiveSummary: string;
  rootCauses: Array<{
    cause: string;
    severity: string;
    affectedItems: string[];
    explanation: string;
  }>;
  actionRecommendations: Array<{
    itemName: string;
    financialImpact: string;
    suggestedAction: string;
    negotiationScript: string;
  }>;
  formalNoticeText: string;
}

interface ReconciliationAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierName: string;
  summary: ReconciliationSummary | null;
  pairs: ReconciliationMatchPair[];
}

export const ReconciliationAiModal: React.FC<ReconciliationAiModalProps> = ({
  isOpen,
  onClose,
  supplierName,
  summary,
  pairs,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<AiDiagnosisData | null>(null);
  const [activeTab, setActiveTab] = useState<'INSIGHTS' | 'FORMAL_NOTICE'>('INSIGHTS');
  const [copied, setCopied] = useState(false);

  const pairsSignature = pairs
    .map((p) => `${p.id}:${p.status}:${p.resolutionStatus}:${p.amountDelta}`)
    .join('|');

  useEffect(() => {
    if (isOpen && pairs.length > 0) {
      runDiagnosis();
    }
  }, [isOpen, pairsSignature]);

  const runDiagnosis = async () => {
    const discrepancies = pairs
      .filter((p) => p.status !== 'PERFECT_MATCH')
      .map((p) => ({
        itemName: p.matchedItemName,
        status: p.status,
        iposQty: p.iposQty,
        invoiceQty: p.invoiceQty,
        iposPrice: p.iposPrice,
        invoicePrice: p.invoicePrice,
        qtyDelta: p.qtyDelta,
        priceDelta: p.priceDelta,
        amountDelta: p.amountDelta,
        unit: p.iposLines[0]?.unitName || p.invoiceLine?.unitName || 'kg',
        resolutionStatus: p.resolutionStatus,
        notes: p.iposLines.map((l) => l.note).filter(Boolean).join('; '),
      }));

    if (discrepancies.length === 0) {
      setDiagnosis(null);
      setError('Tất cả các dòng đều khớp hoàn hảo 100%, không có sai lệch cần AI chẩn đoán.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/reconciliation-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: supplierName || 'Nhà cung cấp',
          summary,
          discrepancies,
        }),
      });

      const resJson = await response.json();
      if (!resJson.success) {
        throw new Error(resJson.error || 'Lỗi phân tích AI');
      }

      setDiagnosis(resJson.data);
    } catch (err: any) {
      setError(err?.message || 'Không thể kết nối đến máy chủ AI');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleCopyNotice = () => {
    if (!diagnosis?.formalNoticeText) return;
    navigator.clipboard.writeText(diagnosis.formalNoticeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadNotice = () => {
    if (!diagnosis?.formalNoticeText) return;
    const blob = new Blob([diagnosis.formalNoticeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Thong_bao_doi_soat_${(supplierName || 'NCC').replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Trợ lý AI Kiểm toán & Chẩn đoán Sai lệch
                </h3>
                <span className="text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                  Gemini 3.8 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Nhà cung cấp: <strong className="text-slate-200">{supplierName || 'Nhà cung cấp'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={runDiagnosis}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-medium cursor-pointer transition-colors"
              title="Chạy lại phân tích AI theo số liệu mới nhất"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Đang phân tích...' : 'Phân tích lại'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        {diagnosis && (
          <div className="px-6 pt-3 border-b border-slate-800 flex items-center space-x-3 bg-slate-900 text-xs">
            <button
              onClick={() => setActiveTab('INSIGHTS')}
              className={`pb-3 font-semibold transition-colors border-b-2 cursor-pointer ${
                activeTab === 'INSIGHTS'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              1. Chẩn đoán & Lý lẽ đàm phán
            </button>
            <button
              onClick={() => setActiveTab('FORMAL_NOTICE')}
              className={`pb-3 font-semibold transition-colors border-b-2 cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'FORMAL_NOTICE'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>2. Toàn văn Thông báo trừ tiền NCC</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
              <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  AI đang phân tích bảng sai lệch công nợ F&B...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Đang đối chiếu phụ lục đơn giá, hao hụt độ ẩm và quy chuẩn hóa đơn Nghị định 123
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 space-y-2">
              <div className="flex items-center space-x-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Không thể hoàn tất phân tích</span>
              </div>
              <p className="text-xs text-rose-300/80">{error}</p>
              <button
                onClick={runDiagnosis}
                className="mt-2 px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          )}

          {diagnosis && activeTab === 'INSIGHTS' && (
            <div className="space-y-6">
              {/* Executive Summary Card */}
              <div className="p-4 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/30 rounded-2xl shadow-sm space-y-2">
                <div className="flex items-center space-x-2 text-purple-300 font-bold">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Kết luận Giám đốc Tài chính (CFO Executive Summary)</span>
                </div>
                <p className="text-slate-200 text-xs leading-relaxed font-sans">
                  {diagnosis.executiveSummary}
                </p>
              </div>

              {/* Root Causes */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                  Nguyên nhân gốc rễ dẫn đến thất thoát & sai lệch:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {diagnosis.rootCauses.map((rc, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-100">{rc.cause}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rc.severity === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : rc.severity === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {rc.severity}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {rc.explanation}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {rc.affectedItems.map((item, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Recommendations & Negotiation Script */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                  Khuyến nghị hành động & Lý lẽ đàm phán với NCC:
                </h4>
                <div className="space-y-3">
                  {diagnosis.actionRecommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-100 text-sm">{rec.itemName}</span>
                        <span className="font-mono font-bold text-rose-400 text-xs">
                          {rec.financialImpact}
                        </span>
                      </div>
                      <div className="text-emerald-400 font-semibold text-xs flex items-center space-x-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Hành động đề xuất: {rec.suggestedAction}</span>
                      </div>
                      <div className="p-3 bg-slate-900 rounded-lg text-slate-300 text-[11px] leading-relaxed border-l-2 border-purple-500 italic">
                        <strong>Lý lẽ đối chất với NCC:</strong> "{rec.negotiationScript}"
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {diagnosis && activeTab === 'FORMAL_NOTICE' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Văn bản được tạo tự động theo mẫu chuẩn kế toán & pháp lý Việt Nam</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopyNotice}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 rounded-xl transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Đã sao chép!' : 'Sao chép văn bản'}</span>
                  </button>
                  <button
                    onClick={handleDownloadNotice}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors cursor-pointer shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải file văn bản (.txt)</span>
                  </button>
                </div>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[550px] overflow-y-auto">
                {diagnosis.formalNoticeText}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {pairs.filter((p) => p.status !== 'PERFECT_MATCH').length} mặt hàng phát hiện sai lệch cần giải quyết
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
