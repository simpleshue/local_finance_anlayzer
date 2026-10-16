import React, { useState, useMemo } from 'react';
import { Transaction, DEFAULT_CATEGORIES } from '../types/finance';
import { Check, ShieldAlert, Sparkles, Plus, Search, CheckCheck, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Trash2 } from 'lucide-react';

interface TriageInboxProps {
  transactions: Transaction[];
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

  const filtered = transactions.filter(tx => {
    if (!tx.needsReview && tx.category !== 'Uncategorized') return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      tx.rawPayee.toLowerCase().includes(q) ||
      tx.cleanPayee.toLowerCase().includes(q) ||
      tx.category.toLowerCase().includes(q)
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
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
              placeholder="Filter payee or category..."
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

      {/* Table */}
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
                <th
                  onClick={() => handleSort('date')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date / Account</span>
                    {sortColumn === 'date' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('payee')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Raw Bank Payee & Normalized Display</span>
                    {sortColumn === 'payee' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('amount')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Amount</span>
                    {sortColumn === 'amount' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('confidence')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Confidence & Tier</span>
                    {sortColumn === 'confidence' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('category')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Category Override</span>
                    {sortColumn === 'category' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {sorted.map(tx => {
                const currentCat = selectedCategories[tx.id] || tx.category;
                const currentPayee =
                  editingPayees[tx.id] !== undefined ? editingPayees[tx.id] : tx.cleanPayee;
                const confPct = Math.round(tx.confidenceScore * 100);

                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Date & Account */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono text-slate-200">{tx.transactionDate}</div>
                      <div className="font-mono text-[10px] text-slate-500">{tx.accountMasked}</div>
                    </td>

                    {/* Payee */}
                    <td className="py-3 px-3 min-w-[220px]">
                      <input
                        type="text"
                        value={currentPayee}
                        onChange={e => handleCleanPayeeChange(tx.id, e.target.value)}
                        className="w-full font-semibold text-slate-100 bg-transparent hover:bg-slate-950 focus:bg-slate-950 px-2 py-0.5 rounded border border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition-colors"
                        title="Click to rename display merchant"
                      />
                      <div className="font-mono text-[11px] text-slate-400 px-2 truncate mt-0.5" title={tx.rawPayee}>
                        {tx.rawPayee}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono font-medium">
                      <span className={tx.amountCents < 0 ? 'text-slate-200' : 'text-emerald-400'}>
                        {tx.amountCents < 0 ? '-' : '+'}
                        ${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                      </span>
                    </td>

                    {/* Confidence & Tier */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>{tx.categorizationTier} ({confPct}%)</span>
                      </div>
                    </td>

                    {/* Category Selector */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <select
                        value={currentCat}
                        onChange={e => handleCategoryChange(tx.id, e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {categories.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
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
