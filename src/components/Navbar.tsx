import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Database,
  FileSpreadsheet,
  ScanLine,
  CheckSquare,
  FileCheck2,
  BookOpen,
  Play,
  RotateCcw,
  Settings,
  ArrowRight,
  Shield,
  Layers,
  Cloud,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { IposMasterData } from '../types';
import { SyncInfo } from '../utils/syncService';

interface NavbarProps {
  currentView: 'enduser' | 'admin';
  setCurrentView: (view: 'enduser' | 'admin') => void;
  currentStep: 'scan' | 'review' | 'reconcile';
  setCurrentStep: (step: 'scan' | 'review' | 'reconcile') => void;
  masterData: IposMasterData | null;
  syncInfo?: SyncInfo;
  onOpenCloudSync?: () => void;
  onOpenAliasManager: () => void;
  onOpenTestRunner: () => void;
  onResetAll: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  currentStep,
  setCurrentStep,
  masterData,
  syncInfo,
  onOpenCloudSync,
  onOpenAliasManager,
  onOpenTestRunner,
  onResetAll,
}) => {
  const itemCount = masterData?.items?.length || 0;
  const supplierCount = masterData?.suppliers?.length || 0;
  const warehouseCount = masterData?.warehouses?.length || 0;
  const hasMasterData = itemCount > 0;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentView('enduser')}>
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold text-lg tracking-wider">
              iPOS
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base text-slate-100 tracking-tight">Invoice AI</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Gemini 3.7 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400">Trợ lý nhập mua hàng iPOS Inventory</p>
            </div>
          </div>

          {/* End User Workflow Steps Navigation (Visible when in End User View) */}
          {currentView === 'enduser' ? (
            <nav className="hidden md:flex items-center space-x-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
              <button
                id="nav-step-scan"
                onClick={() => setCurrentStep('scan')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  currentStep === 'scan'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>1. Đọc hóa đơn AI</span>
              </button>

              <span className="text-slate-600 text-xs">→</span>

              <button
                id="nav-step-review"
                onClick={() => setCurrentStep('review')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  currentStep === 'review'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>2. Duyệt & Xuất Excel iPOS</span>
              </button>

              <span className="text-slate-600 text-xs">→</span>

              <button
                id="nav-step-reconcile"
                onClick={() => setCurrentStep('reconcile')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  currentStep === 'reconcile'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5 text-indigo-300" />
                <span>3. Đối soát Hóa đơn tự động</span>
              </button>
            </nav>
          ) : (
            /* Admin Mode Banner */
            <div className="flex items-center space-x-2 px-4 py-1.5 bg-slate-950 rounded-xl border border-emerald-500/40 text-emerald-400 text-xs font-semibold">
              <Shield className="w-4 h-4" />
              <span>Chế độ Quản trị Cơ sở Dữ liệu (Admin View)</span>
            </div>
          )}

          {/* Role Switcher & Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* Toggle View Button */}
            {currentView === 'enduser' ? (
              <button
                id="btn-nav-to-admin"
                onClick={() => setCurrentView('admin')}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-xl transition-colors shadow-sm"
                title="Mở trang Quản trị Database để xem, thêm, sửa, xóa hàng hóa và NCC"
              >
                <Settings className="w-3.5 h-3.5 text-emerald-400" />
                <span>Quản lý DB (Admin)</span>
              </button>
            ) : (
              <button
                id="btn-nav-to-enduser"
                onClick={() => setCurrentView('enduser')}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors shadow-sm"
                title="Quay lại giao diện Nhập mua hàng"
              >
                <span>Giao diện Nhập hàng</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              id="btn-open-cloud-sync"
              onClick={onOpenCloudSync}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                syncInfo?.state === 'syncing'
                  ? 'bg-amber-950/60 text-amber-300 border-amber-700/60 hover:bg-amber-900/60'
                  : syncInfo?.state === 'synced'
                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/60'
                  : syncInfo?.state === 'offline'
                  ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-800 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white'
              }`}
              title="Xem và quản lý đồng bộ đám mây (Cloud Sync)"
            >
              {syncInfo?.state === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              ) : syncInfo?.state === 'offline' ? (
                <WifiOff className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="hidden sm:inline">
                {syncInfo?.state === 'syncing'
                  ? 'Đang đồng bộ...'
                  : syncInfo?.state === 'synced'
                  ? 'Cloud: Đã đồng bộ'
                  : syncInfo?.state === 'offline'
                  ? 'Ngoại tuyến'
                  : 'Cloud Sync'}
              </span>
            </button>

            <button
              id="btn-open-aliases"
              onClick={onOpenAliasManager}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
              title="Xem từ điển học máy tên hàng"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Từ điển Alias</span>
            </button>

            <button
              id="btn-run-tests"
              onClick={onOpenTestRunner}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/50 rounded-lg transition-colors"
              title="Kiểm định thuật toán bóc tách & đối chiếu"
            >
              <Play className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Test (6/6)</span>
            </button>

            <button
              id="btn-reset-app"
              onClick={onResetAll}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Làm mới toàn bộ phiên làm việc"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Master Data Snapshot Subheader */}
        <div className="py-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <span className="text-slate-500">Hàng hóa trong DB:</span>
              <strong className={hasMasterData ? 'text-emerald-400 font-mono' : 'text-slate-400'}>
                {itemCount} món
              </strong>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <span className="text-slate-500">Nhà cung cấp:</span>
              <strong className="text-slate-300 font-mono">{supplierCount}</strong>
            </span>
            <span className="text-slate-700">•</span>
            <span className="flex items-center space-x-1">
              <span className="text-slate-500">Kho hàng:</span>
              <strong className="text-slate-300 font-mono">{warehouseCount}</strong>
            </span>
            {masterData?.templateFileName && (
              <>
                <span className="text-slate-700">•</span>
                <span className="flex items-center space-x-1 text-slate-400">
                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                  <span className="truncate max-w-[200px]">{masterData.templateFileName}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            {syncInfo?.state === 'synced' ? (
              <button
                onClick={onOpenCloudSync}
                className="inline-flex items-center text-emerald-400 hover:underline cursor-pointer"
              >
                <Cloud className="w-3 h-3 mr-1 text-emerald-400" /> Cloud Firestore: Đã đồng bộ (Shared Store)
              </button>
            ) : syncInfo?.state === 'syncing' ? (
              <span className="inline-flex items-center text-amber-400">
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Đang đồng bộ Cloud...
              </span>
            ) : hasMasterData ? (
              <span className="inline-flex items-center text-emerald-400">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Dữ liệu đã lưu cục bộ (IndexedDB)
              </span>
            ) : (
              <span className="inline-flex items-center text-amber-400">
                <AlertTriangle className="w-3 h-3 mr-1" /> DB trống (Tải file Excel để nạp hoặc kéo từ Cloud)
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

