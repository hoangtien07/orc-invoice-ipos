import React, { useState, useMemo } from 'react';
import {
  X,
  BookOpen,
  Trash2,
  Plus,
  Search,
  CheckCircle2,
  Building2,
  Scale,
  Sparkles,
} from 'lucide-react';
import { IposMasterData, LearnedItemAlias, LearnedUnitAlias } from '../types';
import { deleteLearnedAlias, saveLearnedItemAlias, saveLearnedUnitAlias } from '../utils/db';
import { normalizeText, getAvailableSystemUnits } from '../utils/vietnamese';

interface AliasModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterData: IposMasterData | null;
  aliases: LearnedItemAlias[];
  unitAliases: LearnedUnitAlias[];
  onRefresh: () => void;
}

export const AliasModal: React.FC<AliasModalProps> = ({
  isOpen,
  onClose,
  masterData,
  aliases = [],
  unitAliases = [],
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'item' | 'unit'>('item');
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');

  // Form for adding new item alias rule
  const [newSupplierId, setNewSupplierId] = useState<string>('*');
  const [newRawName, setNewRawName] = useState<string>('');
  const [newSelectedItemId, setNewSelectedItemId] = useState<string>('');

  // Form for adding new unit alias
  const [newRawUnit, setNewRawUnit] = useState<string>('');
  const [newTargetUnit, setNewTargetUnit] = useState<string>('kg');

  const availableUnits = useMemo(() => {
    return getAvailableSystemUnits(masterData);
  }, [masterData]);


  if (!isOpen) return null;

  const handleAddItemAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRawName.trim() || !newSelectedItemId) return;

    const selectedItem = masterData?.items?.find((i) => i.itemId === newSelectedItemId);
    const supplierObj = masterData?.suppliers?.find((s) => s.supplierId === newSupplierId);

    await saveLearnedItemAlias({
      supplier_id: newSupplierId,
      supplier_name: supplierObj?.supplierName || (newSupplierId === '*' ? 'Tất cả nhà cung cấp' : ''),
      normalized_raw_item_name: normalizeText(newRawName),
      raw_item_sample: newRawName.trim(),
      selected_item_id: newSelectedItemId,
      selected_item_name: selectedItem?.itemName || newSelectedItemId,
      selected_unit: selectedItem?.unitName,
    });

    setNewRawName('');
    setNewSelectedItemId('');
    onRefresh();
  };

  const handleAddUnitAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRawUnit.trim() || !newTargetUnit.trim()) return;

    await saveLearnedUnitAlias(normalizeText(newRawUnit), newTargetUnit.trim());
    setNewRawUnit('');
    setNewTargetUnit('');
    onRefresh();
  };

  const handleDeleteItemAlias = async (id: string) => {
    await deleteLearnedAlias(id);
    onRefresh();
  };

  const filteredItemAliases = aliases.filter((a) => {
    if (supplierFilter !== 'ALL' && a.supplier_id !== supplierFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.raw_item_sample.toLowerCase().includes(q) ||
      a.selected_item_name.toLowerCase().includes(q) ||
      a.selected_item_id.toLowerCase().includes(q)
    );
  });

  const filteredUnitAliases = unitAliases.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.normalized_raw_unit.toLowerCase().includes(q) ||
      u.target_unit_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <BookOpen className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Từ điển Alias học được (Learning Aliases)
              </h3>
              <p className="text-xs text-slate-500">
                Ghi nhớ cách viết tắt hoặc tên hàng viết tay riêng của từng nhà cung cấp
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center justify-between">
          <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setActiveTab('item')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'item' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Alias Mặt hàng ({aliases.length})
            </button>
            <button
              onClick={() => setActiveTab('unit')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'unit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Alias Đơn vị tính ({unitAliases.length})
            </button>
          </div>

          {activeTab === 'item' && (
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="text-xs px-3 py-1.5 border border-slate-300 rounded-xl bg-white focus:outline-none"
            >
              <option value="ALL">Tất cả nhà cung cấp</option>
              <option value="*">Quy tắc chung (*)</option>
              {masterData?.suppliers?.map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.supplierName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Add New Rule Form */}
        {activeTab === 'item' ? (
          <form
            onSubmit={handleAddItemAlias}
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs items-end"
          >
            <div className="sm:col-span-3 space-y-1">
              <label className="font-semibold text-slate-600">Áp dụng cho NCC</label>
              <select
                value={newSupplierId}
                onChange={(e) => setNewSupplierId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="*">Tất cả NCC (*)</option>
                {masterData?.suppliers?.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.supplierName}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4 space-y-1">
              <label className="font-semibold text-slate-600">Chữ viết tay / Viết tắt trên phiếu</label>
              <input
                type="text"
                placeholder="VD: Bò Úc nướng"
                value={newRawName}
                onChange={(e) => setNewRawName(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div className="sm:col-span-4 space-y-1">
              <label className="font-semibold text-slate-600">Mã hàng iPOS chuẩn</label>
              <select
                value={newSelectedItemId}
                onChange={(e) => setNewSelectedItemId(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Chọn mặt hàng iPOS --</option>
                {masterData?.items?.map((it) => (
                  <option key={it.itemId} value={it.itemId}>
                    [{it.itemId}] {it.itemName} ({it.unitName || '—'})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-1">
              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center"
                title="Thêm quy tắc"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleAddUnitAlias}
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs items-end"
          >
            <div className="sm:col-span-5 space-y-1">
              <label className="font-semibold text-slate-600">ĐVT viết trên phiếu</label>
              <input
                type="text"
                placeholder="VD: ky, ki, bich, th"
                value={newRawUnit}
                onChange={(e) => setNewRawUnit(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div className="sm:col-span-5 space-y-1">
              <label className="font-semibold text-slate-600">ĐVT chuẩn trong iPOS</label>
              <select
                value={newTargetUnit}
                onChange={(e) => setNewTargetUnit(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {availableUnits.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm</span>
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm quy tắc..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs"
          />
        </div>

        {/* Rules Table */}
        <div className="overflow-y-auto flex-1 max-h-72 border border-slate-200 rounded-xl">
          {activeTab === 'item' ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Nhà cung cấp</th>
                  <th className="px-3 py-2">Chữ viết tay / Raw</th>
                  <th className="px-3 py-2">Mặt hàng iPOS gán</th>
                  <th className="px-3 py-2 text-center w-20">Đã dùng</th>
                  <th className="px-3 py-2 w-12 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItemAliases.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600 font-medium truncate max-w-[150px]">
                      {a.supplier_id === '*' ? (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                          Tất cả NCC
                        </span>
                      ) : (
                        a.supplier_name || a.supplier_id
                      )}
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-800">
                      "{a.raw_item_sample}"
                    </td>
                    <td className="px-3 py-2 text-emerald-800">
                      <span className="font-mono font-bold mr-1">[{a.selected_item_id}]</span>
                      {a.selected_item_name}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-500">
                      {a.timesUsed || 1}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => a.id && handleDeleteItemAlias(a.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Xóa quy tắc"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredItemAliases.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Chưa có quy tắc alias nào. Bạn có thể thêm thủ công hoặc bấm "Lưu Alias" khi sửa hàng trên phiếu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">ĐVT viết trên phiếu</th>
                  <th className="px-3 py-2">ĐVT chuẩn iPOS</th>
                  <th className="px-3 py-2 w-12 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUnitAliases.map((u) => (
                  <tr key={u.normalized_raw_unit} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-bold text-purple-700">
                      {u.normalized_raw_unit}
                    </td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">
                      {u.target_unit_name}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleDeleteItemAlias(u.normalized_raw_unit)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUnitAliases.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      Chưa có quy tắc quy đổi ĐVT viết tắt
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
