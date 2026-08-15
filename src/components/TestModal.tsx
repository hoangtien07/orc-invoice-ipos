import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Sparkles,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import { runAllUnitTests, TestSuiteResult } from '../utils/tests';

interface TestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestModal: React.FC<TestModalProps> = ({ isOpen, onClose }) => {
  const [testResult, setTestResult] = useState<TestSuiteResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const executeTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const results = runAllUnitTests();
      setTestResult(results);
      setIsRunning(false);
    }, 150);
  };

  useEffect(() => {
    if (isOpen) {
      executeTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Group by category
  const categories = testResult
    ? Array.from(new Set(testResult.items.map((i) => i.category)))
    : [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Kiểm định chất lượng & Thuật toán (Unit Tests)
              </h3>
              <p className="text-xs text-slate-500">
                Kiểm thử tự động 6 bộ quy tắc theo yêu cầu sản phẩm
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={executeTests}
              disabled={isRunning}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>Chạy lại</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Results Overview KPI */}
        {testResult && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">Tổng số Test Cases</div>
              <div className="text-xl font-bold text-slate-800 mt-0.5">{testResult.total}</div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-[11px] text-emerald-700 font-semibold uppercase flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Thành công (Passed)</span>
              </div>
              <div className="text-xl font-bold text-emerald-800 mt-0.5">{testResult.passed}</div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500 font-semibold uppercase flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Thời gian thực thi</span>
              </div>
              <div className="text-xl font-mono font-bold text-slate-800 mt-0.5">
                {testResult.durationMs} ms
              </div>
            </div>
          </div>
        )}

        {/* Test List Grouped by Category */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {categories.map((cat) => {
            const items = testResult?.items.filter((i) => i.category === cat) || [];
            const catPassed = items.every((i) => i.passed);

            return (
              <div key={cat} className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="p-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800">
                  <div className="flex items-center space-x-2">
                    {catPassed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span>{cat}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 font-normal">
                    {items.filter((i) => i.passed).length}/{items.length} passed
                  </span>
                </div>

                <div className="divide-y divide-slate-100 bg-white">
                  {items.map((item) => (
                    <div key={item.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                          <span>{item.name}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.passed ? 'PASSED' : 'FAILED'}
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px]">{item.description}</div>
                      <div className="flex items-center space-x-3 text-[10px] font-mono text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100">
                        <span>
                          <strong>Kết quả:</strong> {item.actual}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Kỳ vọng:</strong> {item.expected}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
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
