import React from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { IposMasterData } from '../../../types';
import { readFileAsArrayBuffer, arrayBufferToBase64 } from '../../../utils/excel';
import {
  saveTemplateFile,
  exportAllDataAsJson,
  importAllDataFromJson,
  clearEntireDatabase,
} from '../../../utils/db';

export const TemplateTab: React.FC<{
  masterData: IposMasterData | null;
  onMasterDataUpdated: (data: IposMasterData) => void;
  setNotification: (notif: { type: 'success' | 'error' | 'info'; message: string }) => void;
}> = ({ masterData, onMasterDataUpdated, setNotification }) => {
  const templateInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="p-6 max-w-2xl mx-auto text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
        <FileSpreadsheet className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-slate-800">File Mẫu Nhập Mua Hàng iPOS Inventory</h3>
      <p className="text-xs text-slate-500 leading-relaxed">
        Tải lên file mẫu Excel (.xlsx) chuẩn của doanh nghiệp bạn (chứa cấu trúc cột, logo, header thông tin).
        Khi quét hóa đơn xong, hệ thống sẽ điền dữ liệu trực tiếp vào mẫu này để xuất khẩu.
      </p>

      <input
        type="file"
        ref={templateInputRef}
        accept=".xlsx,.xls"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const buffer = await readFileAsArrayBuffer(file);
          const b64 = arrayBufferToBase64(buffer);
          const updated = await saveTemplateFile(b64, file.name);
          onMasterDataUpdated(updated);
          setNotification({
            type: 'success',
            message: `Đã lưu file mẫu Excel iPOS: "${file.name}"`,
          });
        }}
        className="hidden"
      />

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-800">
            {masterData?.templateFileName ? masterData.templateFileName : 'Chưa tải file mẫu tùy chỉnh'}
          </p>
          <p className="text-[11px] text-slate-500">
            {masterData?.templateFileName
              ? 'Đang sử dụng file mẫu tùy chỉnh này khi xuất file'
              : 'Đang dùng mẫu chuẩn mặc định của iPOS'}
          </p>
        </div>
        <button
          onClick={() => templateInputRef.current?.click()}
          className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl shadow-sm"
        >
          {masterData?.templateFileName ? 'Thay đổi file mẫu' : 'Tải lên file mẫu'}
        </button>
      </div>
    </div>
  );
};

export const BackupTab: React.FC<{
  onMasterDataUpdated: (data: IposMasterData) => void;
  onAliasesUpdated: () => void;
  setNotification: (notif: { type: 'success' | 'error' | 'info'; message: string }) => void;
  setConfirmDialog: (dialog: any) => void;
}> = ({ onMasterDataUpdated, onAliasesUpdated, setNotification, setConfirmDialog }) => {
  const backupInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
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
              const updated = await importAllDataFromJson(text);
              if (updated) {
                onMasterDataUpdated(updated);
                onAliasesUpdated();
                setNotification({
                  type: 'success',
                  message: 'Đã phục hồi dữ liệu thành công từ file sao lưu!',
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
          Thao tác này sẽ dọn sạch toàn bộ 12 danh mục iPOS hoặc xóa toàn bộ từ điển học máy trong IndexedDB của trình duyệt.
        </p>
        <button
          onClick={() => {
            setConfirmDialog({
              isOpen: true,
              title: 'Xóa toàn bộ CSDL Master Data',
              message:
                'Bạn có chắc chắn muốn xóa sạch toàn bộ 12 danh mục và từ điển học máy? Hành động này không thể hoàn tác.',
              confirmText: 'Xóa sạch toàn bộ CSDL',
              type: 'danger',
              onConfirm: async () => {
                await clearEntireDatabase();
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
                  message: 'Đã thiết lập lại toàn bộ CSDL.',
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
