import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  DownloadCloud,
  UploadCloud,
  X,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  Database,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SyncInfo, syncService } from '../utils/syncService';
import { IposMasterData } from '../types';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncInfo: SyncInfo;
  masterData: IposMasterData | null;
  aliasesCount: number;
  onRefreshLocal: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  syncInfo,
  masterData,
  aliasesCount,
  onRefreshLocal,
}) => {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const localItemsCount = masterData?.items?.length || 0;

  const handleForceSync = async () => {
    setIsActionLoading(true);
    setActionMessage(null);
    try {
      await syncService.syncBidirectional();
      onRefreshLocal();
      setActionMessage({ type: 'success', text: 'Đã hoàn tất đồng bộ 2 chiều giữa thiết bị này và Cloud DB!' });
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Đồng bộ thất bại, vui lòng kiểm tra kết nối mạng.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePullFromCloud = async () => {
    setIsActionLoading(true);
    setActionMessage(null);
    try {
      const pulled = await syncService.pullMasterDataFromCloud();
      await syncService.syncAliasesBidirectional();
      onRefreshLocal();
      if (pulled) {
        setActionMessage({
          type: 'success',
          text: `Đã kéo thành công danh mục ${pulled.items?.length || 0} món từ Cloud về thiết bị này!`,
        });
      } else {
        setActionMessage({
          type: 'error',
          text: 'Trên Cloud chưa có danh mục hàng hóa nào. Hãy tải file Excel lên để đồng bộ.',
        });
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Không thể tải từ Cloud' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePushToCloud = async () => {
    if (!masterData || (masterData.items?.length || 0) === 0) {
      setActionMessage({ type: 'error', text: 'Thiết bị này hiện chưa có dữ liệu hàng hóa để đẩy lên Cloud.' });
      return;
    }
    setIsActionLoading(true);
    setActionMessage(null);
    try {
      await syncService.pushMasterDataToCloud(masterData);
      await syncService.syncAliasesBidirectional();
      setActionMessage({
        type: 'success',
        text: `Đã đẩy thành công danh mục ${masterData.items.length} món lên Cloud DB!`,
      });
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Không thể tải lên Cloud' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return 'Chưa đồng bộ phiên này';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 10) return 'Vừa xong';
    if (diffSec < 60) return `${diffSec} giây trước`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    return new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
                <span>Đồng bộ Cơ sở Dữ liệu Cloud</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Shared Store
                </span>
              </h3>
              <p className="text-xs text-slate-400">Tự động đồng bộ xuyên suốt máy tính & điện thoại</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs text-slate-600">
          {/* Status summary banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
                {syncInfo.isOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>Trạng thái kết nối:</span>
              </span>

              {syncInfo.state === 'syncing' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Đang đồng bộ...
                </span>
              ) : syncInfo.state === 'synced' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Đã kết nối & Đồng bộ
                </span>
              ) : syncInfo.state === 'offline' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200 text-slate-700">
                  <WifiOff className="w-3 h-3 mr-1" /> Ngoại tuyến (Local-First)
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800">
                  <AlertCircle className="w-3 h-3 mr-1" /> {syncInfo.lastError || 'Lỗi kết nối'}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Lần đồng bộ gần nhất:</span>
              </span>
              <strong className="font-medium text-slate-700">{formatLastSync(syncInfo.lastSyncedAt)}</strong>
            </div>
          </div>

          {/* Data Comparison: Local vs Cloud */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Database className="w-3 h-3 text-slate-400" />
                <span>Máy này (IndexedDB)</span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-800">
                {localItemsCount} <span className="text-xs font-normal text-slate-500">mặt hàng</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {aliasesCount} từ điển học alias
              </div>
            </div>

            <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/50 space-y-1">
              <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center space-x-1">
                <Cloud className="w-3 h-3 text-emerald-600" />
                <span>Cloud DB (Firebase)</span>
              </div>
              <div className="text-xl font-bold font-mono text-emerald-800">
                {syncInfo.cloudItemsCount || localItemsCount} <span className="text-xs font-normal text-emerald-600">mặt hàng</span>
              </div>
              <div className="text-[11px] text-emerald-600">
                {syncInfo.cloudAliasesCount || aliasesCount} từ điển học alias
              </div>
            </div>
          </div>

          {/* Action Feedback Message */}
          {actionMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start space-x-2 ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{actionMessage.text}</span>
            </div>
          )}

          {/* Sync Actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleForceSync}
              disabled={isActionLoading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
              <span>Đồng bộ 2 chiều ngay (Force Sync)</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePullFromCloud}
                disabled={isActionLoading}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors border border-slate-200"
                title="Tải toàn bộ danh mục từ Cloud về máy này (Dùng khi mở máy mới)"
              >
                <DownloadCloud className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kéo từ Cloud về máy</span>
              </button>

              <button
                onClick={handlePushToCloud}
                disabled={isActionLoading}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors border border-slate-200"
                title="Đẩy toàn bộ dữ liệu máy này lên Cloud DB"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đẩy máy này lên Cloud</span>
              </button>
            </div>
          </div>

          {/* Feature highlights tip */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-500 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Cơ chế hoạt động Local-First + Cloud Sync:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Mở web trên máy mới: Dữ liệu tự động kéo về từ Cloud, <strong>không cần tải lại file Excel</strong>.</li>
              <li>Hợp nhất dữ liệu (Merge): Tự động gộp mã hàng mới và cập nhật từ điển học máy mới nhất.</li>
              <li>Ảnh hóa đơn: Chỉ lưu cấu trúc bảng số liệu JSON đã bóc tách, tối ưu tốc độ và dung lượng.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
