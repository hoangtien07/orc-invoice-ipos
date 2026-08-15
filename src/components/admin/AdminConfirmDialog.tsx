import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => Promise<void> | void;
}

interface AdminConfirmDialogProps {
  dialog: ConfirmDialogState | null;
  onClose: () => void;
}

export const AdminConfirmDialog: React.FC<AdminConfirmDialogProps> = ({ dialog, onClose }) => {
  if (!dialog || !dialog.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center space-x-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              dialog.type === 'danger'
                ? 'bg-rose-100 text-rose-600'
                : 'bg-amber-100 text-amber-600'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-800">{dialog.title}</h3>
        </div>

        <div className="text-xs text-slate-600 leading-relaxed">{dialog.message}</div>

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {dialog.cancelText || 'Hủy bỏ'}
          </button>
          <button
            onClick={async () => {
              const fn = dialog.onConfirm;
              onClose();
              await fn();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-sm transition-colors ${
              dialog.type === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {dialog.confirmText || 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
};
