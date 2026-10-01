import React, { useState } from 'react';
import {
  Download,
  Upload,
  AlertTriangle,
  Cloud,
  RefreshCw,
  DownloadCloud,
  UploadCloud,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { IposMasterData } from '../../../types';
import {
  exportAllDataAsJson,
  importAllDataFromJson,
  clearEntireDatabase,
} from '../../../utils/db';
import { syncService } from '../../../utils/syncService';

export const BackupTab: React.FC<{
  onMasterDataUpdated: (data: IposMasterData) => void;
  onAliasesUpdated: () => void;
  setNotification: (notif: { type: 'success' | 'error' | 'info'; message: string }) => void;
  setConfirmDialog: (dialog: any) => void;
  masterData?: IposMasterData | null;
}> = ({ onMasterDataUpdated, onAliasesUpdated, setNotification, setConfirmDialog, masterData }) => {
  const backupInputRef = React.useRef<HTMLInputElement>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const handleCloudSync = async () => {
    setIsCloudSyncing(true);
    try {
      await syncService.syncBidirectional();
      const updated = await syncService.pullMasterDataFromCloud();
      if (updated) {
        onMasterDataUpdated(updated);
      }
      onAliasesUpdated();
      setNotification({
        type: 'success',
        message: 'Đã hoàn tất đồng bộ 2 chiều với Cloud Firestore!',
      });
    } catch (e: any) {
      setNotification({
        type: 'error',
        message: e?.message || 'Lỗi đồng bộ đám mây.',
      });
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    setIsCloudSyncing(true);
    try {
      const data = await syncService.pullMasterDataFromCloud();
      await syncService.syncAliasesBidirectional();
      if (data && data.items && data.items.length > 0) {
        onMasterDataUpdated(data);
        onAliasesUpdated();
        setNotification({
          type: 'success',
          message: `Đã kéo thành công danh mục ${data.items.length} món từ Cloud về máy này!`,
        });
      } else {
        setNotification({
          type: 'info',
          message: 'Chưa có dữ liệu danh mục trên Cloud Firestore.',
        });
      }
    } catch (e: any) {
      setNotification({
        type: 'error',
        message: e?.message || 'Không thể tải dữ liệu từ Cloud.',
      });
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handlePushToCloud = async () => {
    if (!masterData || (masterData.items?.length || 0) === 0) {
      setNotification({
        type: 'error',
        message: 'Hiện chưa có dữ liệu hàng hóa trên máy để đẩy lên Cloud.',
      });
      return;
    }
    setIsCloudSyncing(true);
    try {
      await syncService.pushMasterDataToCloud(masterData);
      await syncService.syncAliasesBidirectional();
      setNotification({
        type: 'success',
        message: `Đã đẩy thành công danh mục ${masterData.items.length} món lên Cloud DB!`,
      });
    } catch (e: any) {
      setNotification({
        type: 'error',
        message: e?.message || 'Không thể đẩy dữ liệu lên Cloud.',
      });
    } finally {
      setIsCloudSyncing(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Cloud Sync Card */}
      <div className="p-5 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <span>Đồng bộ Đám mây (Firebase Firestore)</span>
                <span className="text-[10px] bg-emerald-200/70 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                  Shared Store
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Tự động lưu trữ danh mục ~1000 món & từ điển học máy để dùng chung trên mọi thiết bị.
              </p>
            </div>
          </div>

          <button
            onClick={handleCloudSync}
            disabled={isCloudSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ ngay</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={handlePullFromCloud}
            disabled={isCloudSyncing}
            className="py-2 px-3 bg-white hover:bg-slate-50 border border-emerald-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm transition-colors"
          >
            <DownloadCloud className="w-4 h-4 text-indigo-600" />
            <span>Kéo từ Cloud về máy này</span>
          </button>

          <button
            onClick={handlePushToCloud}
            disabled={isCloudSyncing}
            className="py-2 px-3 bg-white hover:bg-slate-50 border border-emerald-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-emerald-600" />
            <span>Đẩy dữ liệu máy lên Cloud</span>
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-800">Sao lưu & Phục hồi CSDL IndexedDB</h3>
        <p className="text-xs text-slate-500 mt-1">
          Xuất toàn bộ 12 danh mục nghiệp vụ và từ điển học máy thành file JSON để lưu trữ hoặc chuyển sang máy khác.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center space-x-2 text-emerald-700 font-bold text-xs">
            <Download className="w-4 h-4" />
            <span>Sao lưu dữ liệu</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Tải file backup .json chứa toàn bộ 12 danh mục nghiệp vụ, từ điển alias và mẫu import.
          </p>
          <button
            onClick={async () => {
              const json = await exportAllDataAsJson();
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `BACKUP_IPOS_MASTER_DATA_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
            }}
            className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 shadow-sm"
          >
            Tải file sao lưu (.json)
          </button>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center space-x-2 text-indigo-700 font-bold text-xs">
            <Upload className="w-4 h-4" />
            <span>Phục hồi dữ liệu</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Nhập file backup .json để khôi phục toàn bộ danh mục và từ điển học máy.
          </p>
          <input
            type="file"
            ref={backupInputRef}
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const result = await importAllDataFromJson(text);
              if (result && result.masterData) {
                onMasterDataUpdated(result.masterData);
                onAliasesUpdated();
                setNotification({
                  type: 'success',
                  message: `Đã phục hồi dữ liệu thành công (${result.masterData.items.length} món, ${result.aliasesCount} alias)!`,
                });
              }
            }}
            className="hidden"
          />
          <button
            onClick={() => backupInputRef.current?.click()}
            className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 shadow-sm"
          >
            Chọn file phục hồi (.json)
          </button>
        </div>
      </div>

      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
        <div className="flex items-center space-x-2 text-rose-800 font-bold text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>Thiết lập lại CSDL (Reset Database)</span>
        </div>
        <p className="text-[11px] text-rose-700 leading-relaxed">
          Thao tác này sẽ dọn sạch toàn bộ 12 danh mục iPOS và từ điển học máy trên máy này đồng thời xóa dữ liệu trên Cloud Firestore.
        </p>
        <button
          onClick={() => {
            setConfirmDialog({
              isOpen: true,
              title: 'Xóa toàn bộ CSDL Master Data',
              message:
                'Bạn có chắc chắn muốn xóa sạch toàn bộ 12 danh mục và từ điển học máy? Hành động này sẽ xóa cả dữ liệu trên máy và Cloud Firestore.',
              confirmText: 'Xóa sạch toàn bộ CSDL',
              type: 'danger',
              onConfirm: async () => {
                await clearEntireDatabase(true);
                onMasterDataUpdated({
                  items: [],
                  categories: [],
                  units: [],
                  unitConversions: [],
                  recipes: [],
                  warehouses: [],
                  customers: [],
                  suppliers: [],
                  supplierGroups: [],
                  priceLists: [],
                  reasons: [],
                  stockNorms: [],
                });
                onAliasesUpdated();
                setNotification({
                  type: 'info',
                  message: 'Đã thiết lập lại toàn bộ CSDL trên máy và Cloud.',
                });
              },
            });
          }}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm"
        >
          Xóa sạch toàn bộ CSDL
        </button>
      </div>
    </div>
  );
};
