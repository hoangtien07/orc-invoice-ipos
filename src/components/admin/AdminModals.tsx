import React from 'react';
import { X } from 'lucide-react';
import {
  IposItem,
  IposItemCategory,
  IposUnit,
  IposUnitConversion,
  IposWarehouse,
  IposSupplier,
} from '../../types';

interface EditItemModalProps {
  data: { isNew: boolean; item: IposItem } | null;
  onClose: () => void;
  onSave: (item: IposItem) => void;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({ data, onClose, onSave }) => {
  if (!data) return null;
  const [form, setForm] = React.useState<IposItem>({ ...data.item });

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-800">
            {data.isNew ? 'Thêm mới Hàng hoá iPOS' : 'Chỉnh sửa Hàng hoá'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Mã hàng (*)</label>
            <input
              type="text"
              disabled={!data.isNew}
              value={form.itemId}
              onChange={(e) => setForm({ ...form, itemId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-100 font-mono"
              placeholder="Ví dụ: NVL_DUONG, SP001"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Tên hàng hóa (*)</label>
            <input
              type="text"
              value={form.itemName}
              onChange={(e) => setForm({ ...form, itemName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              placeholder="Ví dụ: Đường cát trắng Biên Hòa"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Mã ĐVT</label>
              <input
                type="text"
                value={form.unitId || ''}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                placeholder="KG, GOI, HOP"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Tên ĐVT</label>
              <input
                type="text"
                value={form.unitName || ''}
                onChange={(e) => setForm({ ...form, unitName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                placeholder="Kg, Gói, Hộp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Nhóm hàng</label>
              <input
                type="text"
                value={form.category || ''}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                placeholder="Gia vị, Trà, Cà phê"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Giá vốn chuẩn (VNĐ)</label>
              <input
                type="number"
                value={form.costPrice || ''}
                onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) || undefined })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                placeholder="25000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Mã vạch (Barcode)</label>
              <input
                type="text"
                value={form.barcode || ''}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                placeholder="893..."
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Trạng thái</label>
              <select
                value={form.status || 'Đang dùng'}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="Đang dùng">Đang dùng</option>
                <option value="Ngưng dùng">Ngưng dùng</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              if (!form.itemId.trim() || !form.itemName.trim()) {
                alert('Vui lòng nhập đầy đủ Mã hàng và Tên hàng hóa');
                return;
              }
              onSave(form);
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
          >
            Lưu mặt hàng
          </button>
        </div>
      </div>
    </div>
  );
};
