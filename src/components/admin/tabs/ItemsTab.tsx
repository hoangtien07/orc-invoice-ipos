import React from 'react';
import {
  CheckSquare,
  Square,
  Edit2,
  Trash2,
} from 'lucide-react';
import { IposItem } from '../../../types';
import { formatVND } from '../../../utils/vietnamese';

interface ItemsTabProps {
  items: IposItem[];
  selectedItemIds: string[];
  onToggleSelectItem: (id: string) => void;
  onSelectAllPage: () => void;
  onDeleteSelected: () => void;
  onEditItem: (item: IposItem) => void;
  onDeleteItem: (item: IposItem) => void;
}

export const ItemsTab: React.FC<ItemsTabProps> = ({
  items = [],
  selectedItemIds = [],
  onToggleSelectItem,
  onSelectAllPage,
  onDeleteSelected,
  onEditItem,
  onDeleteItem,
}) => {
  return (
    <div>
      {/* Multi-item actions bar */}
      {selectedItemIds.length > 0 && (
        <div className="p-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
          <span className="text-xs font-medium text-rose-800">
            Đã chọn <strong>{selectedItemIds.length}</strong> mặt hàng
          </span>
          <button
            onClick={onDeleteSelected}
            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm"
          >
            <Trash2 className="w-3 h-3" />
            <span>Xóa các mục đã chọn</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold select-none">
            <tr>
              <th className="p-3 w-10 text-center">
                <button onClick={onSelectAllPage} className="text-slate-500 hover:text-slate-800">
                  {items.length > 0 && items.every((i) => selectedItemIds.includes(i.itemId)) ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="p-3">Mã hàng</th>
              <th className="p-3">Tên hàng hóa</th>
              <th className="p-3">Mã ĐVT</th>
              <th className="p-3">Tên ĐVT</th>
              <th className="p-3">Nhóm hàng</th>
              <th className="p-3 text-right">Giá vốn</th>
              <th className="p-3">Mã vạch</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-400">
                  Không tìm thấy mặt hàng nào trong danh mục.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const isSelected = selectedItemIds.includes(it.itemId);
                return (
                  <tr
                    key={it.itemId}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onToggleSelectItem(it.itemId)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-800">{it.itemId}</td>
                    <td className="p-3 font-medium text-slate-800 max-w-xs">{it.itemName}</td>
                    <td className="p-3 text-slate-600 font-mono">{it.unitId || '-'}</td>
                    <td className="p-3 text-slate-700">{it.unitName || '-'}</td>
                    <td className="p-3 text-slate-600">
                      {it.category ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                          {it.category}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-800">
                      {it.costPrice ? formatVND(it.costPrice) : '-'}
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{it.barcode || '-'}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          it.status === 'Ngưng dùng'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {it.status || 'Đang dùng'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => onEditItem(it)}
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg"
                          title="Sửa"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteItem(it)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="Xóa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
