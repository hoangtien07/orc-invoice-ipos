import React, { useState, useEffect } from 'react';
import { Sliders, X, Check, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface ToleranceConfig {
  freshFoodTolerancePercent: number; // Dung sai thịt tươi, hải sản (%)
  vegetableTolerancePercent: number; // Dung sai rau củ quả (%)
  dryGoodsTolerancePercent: number;  // Dung sai hàng khô, đồ hộp (thường 0%)
  roundingToleranceVnd: number;      // Làm tròn tiền lẻ (VND)
}

export const DEFAULT_TOLERANCE_CONFIG: ToleranceConfig = {
  freshFoodTolerancePercent: 3.0,
  vegetableTolerancePercent: 2.0,
  dryGoodsTolerancePercent: 0.0,
  roundingToleranceVnd: 2000,
};

interface ToleranceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ToleranceConfig;
  onSave: (newConfig: ToleranceConfig) => void;
}

export const ToleranceConfigModal: React.FC<ToleranceConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [formConfig, setFormConfig] = useState<ToleranceConfig>(config);

  useEffect(() => {
    setFormConfig(config);
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleResetToDefault = () => {
    setFormConfig(DEFAULT_TOLERANCE_CONFIG);
  };

  const handleSaveAndApply = () => {
    onSave(formConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Cấu hình Dung sai Thông minh F&B
              </h3>
              <p className="text-xs text-slate-400">
                Thiết lập ngưỡng sai lệch chấp nhận theo từng nhóm ngành hàng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Field 1: Meat & Seafood */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                1. Thực phẩm tươi sống (Thịt, Gia cầm, Thủy hải sản)
              </label>
              <span className="font-mono font-bold text-emerald-400">
                ±{formConfig.freshFoodTolerancePercent}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Bù trừ mất nước tự nhiên, rã đông trong quá trình vận chuyển. Nếu chênh lệch nằm trong ngưỡng này, hệ thống sẽ cảnh báo nhẹ (WARNING) thay vì báo động đỏ.
            </p>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={formConfig.freshFoodTolerancePercent}
              onChange={(e) =>
                setFormConfig({ ...formConfig, freshFoodTolerancePercent: parseFloat(e.target.value) })
              }
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Field 2: Vegetables & Fruits */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                2. Rau củ quả & Nấm tươi
              </label>
              <span className="font-mono font-bold text-emerald-400">
                ±{formConfig.vegetableTolerancePercent}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Hao hụt rụng lá, bùn đất hoặc cắt gốc sơ chế khi giao hàng tại cửa hàng.
            </p>
            <input
              type="range"
              min="0"
              max="8"
              step="0.5"
              value={formConfig.vegetableTolerancePercent}
              onChange={(e) =>
                setFormConfig({ ...formConfig, vegetableTolerancePercent: parseFloat(e.target.value) })
              }
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Field 3: Dry goods / Packaged */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                3. Hàng khô, Đồ hộp, Gia vị, Đồ uống đóng chai
              </label>
              <span className="font-mono font-bold text-indigo-400">
                {formConfig.dryGoodsTolerancePercent}% (Nghiêm ngặt)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Quy cách đóng thùng/hộp chuẩn tiêu chuẩn. Khuyến nghị giữ 0% để kiểm soát chính xác 100%.
            </p>
            <input
              type="range"
              min="0"
              max="2"
              step="0.5"
              value={formConfig.dryGoodsTolerancePercent}
              onChange={(e) =>
                setFormConfig({ ...formConfig, dryGoodsTolerancePercent: parseFloat(e.target.value) })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Field 4: Currency rounding tolerance */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                4. Ngưỡng làm tròn tiền lẻ trước/sau thuế
              </label>
              <span className="font-mono font-bold text-amber-400">
                ±{formConfig.roundingToleranceVnd.toLocaleString('vi-VN')} đ
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Dung sai làm tròn toán học giữa phần mềm kế toán iPOS và hệ thống hóa đơn điện tử NCC.
            </p>
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[500, 1000, 2000, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFormConfig({ ...formConfig, roundingToleranceVnd: val })}
                  className={`py-1.5 px-2 rounded-lg border text-center font-mono cursor-pointer transition-colors ${
                    formConfig.roundingToleranceVnd === val
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {val.toLocaleString('vi-VN')} đ
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleResetToDefault}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định chuẩn F&B</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleSaveAndApply}
              className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors shadow-md cursor-pointer active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Áp dụng dung sai</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
