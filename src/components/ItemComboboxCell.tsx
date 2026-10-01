import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Sparkles, AlertTriangle, X } from 'lucide-react';
import { CandidateMatch, IposItem, RowStatus } from '../types';
import { normalizeWithoutAccents } from '../utils/vietnamese';

interface ItemComboboxCellProps {
  rowId: string;
  status: RowStatus;
  itemId: string;
  itemName: string;
  candidates: CandidateMatch[];
  masterItems: IposItem[];
  onSelect: (item: IposItem) => void;
  warnings: string[];
}

interface IndexedItem {
  item: IposItem;
  searchStr: string;
}

export const ItemComboboxCell: React.FC<ItemComboboxCellProps> = React.memo(
  ({
    status,
    itemId,
    itemName,
    candidates = [],
    masterItems = [],
    onSelect,
    warnings = [],
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close on click outside
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
      if (isOpen) {
        setSearchQuery('');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [isOpen]);

    // Pre-index master items search string once for fast O(1) or fast string checks
    const indexedMaster = useMemo(() => {
      return masterItems.map((it) => ({
        item: it,
        searchStr: `${it.itemId} ${it.itemName} ${normalizeWithoutAccents(it.itemName)}`.toLowerCase(),
      }));
    }, [masterItems]);

    // Filter master items ONLY when dropdown is open and query exists
    const filteredItems = useMemo(() => {
      if (!isOpen) return [];
      const q = searchQuery.trim().toLowerCase();
      const qNoAccent = normalizeWithoutAccents(q).toLowerCase();

      if (!q) {
        // Return first 15 items if no query
        return masterItems.slice(0, 15);
      }

      const results: IposItem[] = [];
      for (const entry of indexedMaster) {
        if (entry.searchStr.includes(q) || entry.searchStr.includes(qNoAccent)) {
          results.push(entry.item);
          if (results.length >= 20) break; // Limit to 20 for peak DOM performance
        }
      }
      return results;
    }, [isOpen, searchQuery, indexedMaster, masterItems]);

    const handleItemClick = (item: IposItem) => {
      onSelect(item);
      setIsOpen(false);
    };

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
            status === 'RED' && !itemId
              ? 'border-rose-300 bg-rose-50/60 hover:bg-rose-50 text-rose-900 font-medium ring-1 ring-rose-200'
              : status === 'YELLOW'
              ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50 text-slate-800'
              : 'border-slate-300 bg-white hover:border-slate-400 text-slate-800 shadow-2xs'
          }`}
        >
          <span className="truncate pr-1">
            {itemId ? (
              <>
                <span className="font-bold text-slate-900 font-mono">[{itemId}]</span>{' '}
                <span className="text-slate-800 font-medium">{itemName}</span>
              </>
            ) : (
              <span className="text-rose-600 font-semibold flex items-center space-x-1">
                <span>-- Chọn mã hàng iPOS (*) --</span>
              </span>
            )}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 w-96 max-h-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-2 space-y-2 flex flex-col">
            {/* Search Input */}
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Tìm mã hoặc tên hàng trong CSDL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="overflow-y-auto max-h-72 space-y-2 divide-y divide-slate-100 pr-1">
              {/* AI Suggested Candidates Section */}
              {!searchQuery && candidates.length > 0 && (
                <div className="space-y-1 pb-2">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center space-x-1 px-1 pt-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Gợi ý đối chiếu AI tốt nhất</span>
                  </div>
                  <div className="space-y-1">
                    {candidates.map((cand) => {
                      const isSelected = cand.item.itemId === itemId;
                      return (
                        <button
                          key={`cand_${cand.item.itemId}`}
                          type="button"
                          onClick={() => handleItemClick(cand.item)}
                          className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between text-xs border ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                              : 'bg-emerald-50/30 hover:bg-emerald-50 border-emerald-100 text-slate-800'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-slate-900 font-mono">
                                [{cand.item.itemId}]
                              </span>
                              <span className="truncate">{cand.item.itemName}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center space-x-2 mt-0.5">
                              <span>ĐVT: {cand.item.unitName || cand.item.unitId || '—'}</span>
                              <span>•</span>
                              <span className="font-medium text-emerald-700">
                                Độ khớp {cand.confidencePercent}%
                              </span>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Master Database Items */}
              <div className="space-y-1 pt-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">
                  {searchQuery ? `Kết quả tìm kiếm (${filteredItems.length})` : 'Danh mục hàng hóa iPOS'}
                </div>

                {filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">
                    Không tìm thấy hàng hóa nào phù hợp với từ khóa &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  filteredItems.map((it) => {
                    const isSelected = it.itemId === itemId;
                    return (
                      <button
                        key={`ipos_${it.itemId}`}
                        type="button"
                        onClick={() => handleItemClick(it)}
                        className={`w-full text-left p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-between text-xs ${
                          isSelected ? 'bg-slate-100 font-bold text-emerald-700' : 'text-slate-700'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-slate-900 font-mono">[{it.itemId}]</span>{' '}
                          <span>{it.itemName}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase shrink-0 font-mono">
                          {it.unitName || it.unitId || '—'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warning badge if any */}
        {warnings.length > 0 && (
          <div className="text-[10px] text-amber-700 mt-1 flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="truncate">{warnings[0]}</span>
          </div>
        )}
      </div>
    );
  }
);

ItemComboboxCell.displayName = 'ItemComboboxCell';
