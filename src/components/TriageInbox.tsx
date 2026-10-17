import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, Account, DEFAULT_CATEGORIES } from '../types/finance';
import { Check, ShieldAlert, Plus, Search, CheckCheck, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Trash2, ChevronDown, X } from 'lucide-react';

interface SearchableCategorySelectProps {
  value: string;
  categories: string[];
  onChange: (category: string) => void;
}

const SearchableCategorySelect: React.FC<SearchableCategorySelectProps> = ({
  value,
  categories,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(c => c.toLowerCase().includes(q));
  }, [sortedCategories, filterText]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFilterText('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setFilterText('');
    const idx = sortedCategories.indexOf(value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSelect = (cat: string) => {
    onChange(cat);
    setIsOpen(false);
    setFilterText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        filteredCategories.length > 0 ? (prev + 1) % filteredCategories.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        filteredCategories.length > 0
          ? (prev - 1 + filteredCategories.length) % filteredCategories.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCategories[highlightedIndex]) {
        handleSelect(filteredCategories[highlightedIndex]);
      } else if (filteredCategories.length > 0) {
        handleSelect(filteredCategories[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setFilterText('');
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {!isOpen ? (
        <button
          type="button"
          onClick={handleOpen}
          className="w-full flex items-center justify-between gap-1.5 bg-slate-950 border border-slate-700 hover:border-indigo-500 text-slate-200 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer text-left transition-colors"
          title="Click to select or type to filter categories"
        >
          <span className="truncate">{value}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={filterText}
            onChange={e => {
              setFilterText(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={value || 'Type to filter...'}
            className="w-full bg-slate-950 border border-indigo-500 text-slate-100 rounded px-2 py-1 pr-6 text-xs font-mono placeholder-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setFilterText('');
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="absolute z-50 right-0 sm:left-0 mt-1 w-60 max-h-56 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 text-xs">
          {filteredCategories.length === 0 ? (
            <div className="px-3 py-2 text-slate-500 font-mono text-[11px]">
              No matching category for "{filterText}"
            </div>
          ) : (
            filteredCategories.map((cat, idx) => {
              const isSelected = cat === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleSelect(cat)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors ${
                    isHighlighted
                      ? 'bg-indigo-600/30 text-indigo-200'
                      : isSelected
                      ? 'bg-slate-800/80 text-emerald-300 font-semibold'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

interface TriageInboxProps {
  transactions: Transaction[];
  accounts?: Record<string, Account>;
  categories?: string[];
  onApprove: (id: string, category: string, cleanPayee: string) => void;
  onOpenRuleModal: (rawPayee: string, cleanPayee: string, currentCategory: string) => void;
  onBatchApproveAll: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
}

type TriageSortColumn = 'date' | 'payee' | 'amount' | 'confidence' | 'category';

export const TriageInbox: React.FC<TriageInboxProps> = ({
  transactions,
  accounts = {},
  categories = DEFAULT_CATEGORIES,
  onApprove,
  onOpenRuleModal,
  onBatchApproveAll,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  const [search, setSearch] = useState('');
  const [editingPayees, setEditingPayees] = useState<Record<string, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<TriageSortColumn>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const getAccountName = (tx: Transaction): string => {
    const acc = accounts[tx.accountId];
    if (!acc) return tx.accountMasked;
    if (acc.description && acc.institution && acc.institution !== 'Statement Account') {
      return `${acc.institution} (${acc.description})`;
    }
    if (acc.description) {
      return acc.description;
    }
    if (acc.institution) {
      return acc.institution;
    }
    return acc.maskedDisplay || tx.accountMasked;
  };

  const filtered = transactions.filter(tx => {
    if (!tx.needsReview && tx.category !== 'Uncategorized') return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const accName = getAccountName(tx).toLowerCase();
    return (
      tx.rawPayee.toLowerCase().includes(q) ||
      tx.cleanPayee.toLowerCase().includes(q) ||
      tx.category.toLowerCase().includes(q) ||
      accName.includes(q)
    );
  });

  const handleSort = (col: TriageSortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'date' || col === 'amount' || col === 'confidence' ? 'desc' : 'asc');
    }
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === 'date') {
        cmp = a.transactionDate.localeCompare(b.transactionDate);
      } else if (sortColumn === 'payee') {
        cmp = a.cleanPayee.localeCompare(b.cleanPayee);
      } else if (sortColumn === 'amount') {
        cmp = a.amountCents - b.amountCents;
      } else if (sortColumn === 'confidence') {
        cmp = a.confidenceScore - b.confidenceScore;
      } else if (sortColumn === 'category') {
        cmp = a.category.localeCompare(b.category);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection]);

  const handleCategoryChange = (id: string, cat: string) => {
    setSelectedCategories(prev => ({ ...prev, [id]: cat }));
  };

  const handleCleanPayeeChange = (id: string, name: string) => {
    setEditingPayees(prev => ({ ...prev, [id]: name }));
  };

  const handleQuickApprove = (tx: Transaction) => {
    const finalCat = selectedCategories[tx.id] || tx.category;
    const finalPayee = editingPayees[tx.id] !== undefined ? editingPayees[tx.id] : tx.cleanPayee;
    onApprove(tx.id, finalCat, finalPayee);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <h2 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              View 1: Flagged Transaction Review Queue ("Triage Inbox")
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-950 text-amber-300 border border-amber-700">
              {filtered.length} Awaiting Confirmation
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Low confidence (&lt;85%), ambiguous merchant strings, or uncategorized items. Approving
            stores the merchant into Tier 2 Historical Memory.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter payee, account, category..."
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56 font-mono"
            />
          </div>

          {filtered.length > 0 && (
            <button
              onClick={onBatchApproveAll}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Confirm all current suggestions and store into historical memory"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Approve All ({filtered.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-fitting Viewport Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 mb-3">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">Triage Queue Clean</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            All ingested statements have been verified or matched by deterministic Tier 1 RE2 rules.
            Drop a new .ofx statement above to test new payees.
          </p>
        </div>
      ) : (
        <div className="w-full max-h-[calc(100vh-225px)] overflow-y-auto overflow-x-auto pb-16">
          <table className="w-full table-fixed text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-900 shadow-xs">
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
                <th
                  onClick={() => handleSort('date')}
                  className="w-[130px] py-2.5 px-2.5 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">Date / Account</span>
                    {sortColumn === 'date' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('payee')}
                  className="w-auto py-2.5 px-2.5 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">Raw Bank Payee & Display</span>
                    {sortColumn === 'payee' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('amount')}
                  className="w-[95px] py-2.5 px-2.5 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Amount</span>
                    {sortColumn === 'amount' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('confidence')}
                  className="w-[115px] py-2.5 px-2.5 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">Tier / Conf</span>
                    {sortColumn === 'confidence' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('category')}
                  className="w-[185px] xl:w-[220px] py-2.5 px-2.5 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate">Category Override</span>
                    {sortColumn === 'category' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
                </th>

                <th className="w-[180px] py-2.5 px-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {sorted.map(tx => {
                const currentCat = selectedCategories[tx.id] || tx.category;
                const currentPayee =
                  editingPayees[tx.id] !== undefined ? editingPayees[tx.id] : tx.cleanPayee;
                const confPct = Math.round(tx.confidenceScore * 100);
                const accountName = getAccountName(tx);

                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Date & Account Name */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap overflow-hidden">
                      <div className="font-mono text-slate-200">{tx.transactionDate}</div>
                      <div
                        className="text-[11px] font-medium text-indigo-300 mt-0.5 truncate"
                        title={`${accountName} (${tx.accountMasked})`}
                      >
                        {accountName}
                      </div>
                    </td>

                    {/* Payee */}
                    <td className="py-2.5 px-2.5 min-w-0 overflow-hidden">
                      <input
                        type="text"
                        value={currentPayee}
                        onChange={e => handleCleanPayeeChange(tx.id, e.target.value)}
                        className="w-full font-semibold text-slate-100 bg-transparent hover:bg-slate-950 focus:bg-slate-950 px-2 py-0.5 rounded border border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition-colors truncate"
                        title="Click to rename display merchant"
                      />
                      <div className="font-mono text-[11px] text-slate-400 px-2 truncate mt-0.5" title={tx.rawPayee}>
                        {tx.rawPayee}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap font-mono font-medium">
                      <span className={tx.amountCents < 0 ? 'text-slate-200' : 'text-emerald-400'}>
                        {tx.amountCents < 0 ? '-' : '+'}
                        ${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                      </span>
                    </td>

                    {/* Confidence & Tier */}
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="truncate">{tx.categorizationTier} ({confPct}%)</span>
                      </div>
                    </td>

                    {/* Searchable & Sorted Category Selector */}
                    <td className="py-2.5 px-2.5">
                      <SearchableCategorySelect
                        value={currentCat}
                        categories={categories}
                        onChange={cat => handleCategoryChange(tx.id, cat)}
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleQuickApprove(tx)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold transition-colors flex items-center gap-1 shadow-sm"
                          title="Confirm category & add to Tier 2 memory"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Approve</span>
                        </button>

                        {onEditTransaction && (
                          <button
                            onClick={() => onEditTransaction(tx)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-300 border border-slate-700 transition-colors"
                            title="Edit transaction details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onDeleteTransaction && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete transaction "${currentPayee}"?`)) {
                                onDeleteTransaction(tx.id);
                              }
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                            title="Delete transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => onOpenRuleModal(tx.rawPayee, currentPayee, currentCat)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-900/60 transition-colors flex items-center gap-1"
                          title="Generate a permanent RE2 regex rule from this payee string"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Rule</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
