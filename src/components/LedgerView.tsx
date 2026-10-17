import React, { useState, useMemo } from 'react';
import { Transaction, Account } from '../types/finance';
import {
  Search,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Tag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  Square,
  MinusSquare,
  Shield,
  Layers,
} from 'lucide-react';
import { TransactionFormModal } from './TransactionFormModal';

interface LedgerViewProps {
  transactions: Transaction[];
  accounts: Record<string, Account>;
  categories: string[];
  onOpenRuleModal: (rawPayee: string, cleanPayee: string, currentCategory: string) => void;
  onOpenCategoryManager: () => void;
  onUpdateTransactionCategory: (id: string, newCategory: string) => void;
  onSaveTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onBulkDeleteTransactions: (ids: string[]) => void;
  onBatchVerifyTransactions?: (ids: string[]) => void;
}

type LedgerSortColumn = 'date' | 'account' | 'payee' | 'amount' | 'category' | 'tier' | 'status';

export const LedgerView: React.FC<LedgerViewProps> = ({
  transactions,
  accounts,
  categories,
  onOpenRuleModal,
  onOpenCategoryManager,
  onUpdateTransactionCategory,
  onSaveTransaction,
  onDeleteTransaction,
  onBulkDeleteTransactions,
  onBatchVerifyTransactions,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<'ALL' | 'VERIFIED' | 'REVIEW'>('ALL');
  const [sortColumn, setSortColumn] = useState<LedgerSortColumn>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Multi-selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Modal State for Manual Add / Edit
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    transaction: Transaction | null;
  }>({
    isOpen: false,
    mode: 'create',
    transaction: null,
  });

  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<'year' | 'quarter' | 'month'>('year');

  const sortedCategoryOptions = useMemo(() => {
    return [...categories].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [categories]);

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

  // Compute category totals and period pivot matrix (columns = periods, rows = categories)
  const {
    categoryTotals,
    totalOutflow,
    totalInflow,
    analyticsPeriods,
    analyticsCategories,
    periodCategoryMatrix,
    periodOutflowTotals,
    categoryIsIncome,
  } = useMemo(() => {
    let outflow = 0;
    let inflow = 0;
    const totals: Record<string, number> = {};
    const periodSet = new Set<string>();
    const catOutflowByPeriod: Record<string, Record<string, number>> = {};
    const catInflowByPeriod: Record<string, Record<string, number>> = {};
    const catTotalOutflow: Record<string, number> = {};
    const catTotalInflow: Record<string, number> = {};
    const pOutflowTotals: Record<string, number> = {};

    const getPeriodKey = (dateStr: string): string => {
      if (!dateStr || dateStr.length < 7) return 'Unknown';
      const year = dateStr.slice(0, 4);
      if (analyticsGroupBy === 'year') {
        return year;
      }
      if (analyticsGroupBy === 'quarter') {
        const month = parseInt(dateStr.slice(5, 7), 10) || 1;
        const q = Math.ceil(month / 3);
        return `${year}-Q${q}`;
      }
      return dateStr.slice(0, 7);
    };

    for (const tx of transactions) {
      if (tx.category === 'Transfer:CreditCardPayment') continue;
      const period = getPeriodKey(tx.transactionDate);
      periodSet.add(period);

      if (tx.amountCents < 0) {
        const absVal = Math.abs(tx.amountCents);
        outflow += absVal;
        totals[tx.category] = (totals[tx.category] || 0) + absVal;
        catTotalOutflow[tx.category] = (catTotalOutflow[tx.category] || 0) + absVal;
        if (!catOutflowByPeriod[tx.category]) catOutflowByPeriod[tx.category] = {};
        catOutflowByPeriod[tx.category][period] =
          (catOutflowByPeriod[tx.category][period] || 0) + absVal;
        pOutflowTotals[period] = (pOutflowTotals[period] || 0) + absVal;
      } else if (tx.amountCents > 0) {
        inflow += tx.amountCents;
        catTotalInflow[tx.category] = (catTotalInflow[tx.category] || 0) + tx.amountCents;
        if (!catInflowByPeriod[tx.category]) catInflowByPeriod[tx.category] = {};
        catInflowByPeriod[tx.category][period] =
          (catInflowByPeriod[tx.category][period] || 0) + tx.amountCents;
      }
    }

    const sortedPeriods = Array.from(periodSet).sort((a, b) => a.localeCompare(b));
    const allActiveCats = Array.from(
      new Set([...Object.keys(catTotalOutflow), ...Object.keys(catTotalInflow)])
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const matrix: Record<string, Record<string, number>> = {};
    const isIncomeMap: Record<string, boolean> = {};

    for (const cat of allActiveCats) {
      const isInc = (catTotalInflow[cat] || 0) > (catTotalOutflow[cat] || 0) && (catTotalOutflow[cat] || 0) === 0;
      isIncomeMap[cat] = isInc;
      matrix[cat] = isInc ? catInflowByPeriod[cat] || {} : catOutflowByPeriod[cat] || {};
      if (isInc && !totals[cat]) {
        totals[cat] = catTotalInflow[cat] || 0;
      }
    }

    return {
      categoryTotals: totals,
      totalOutflow: outflow,
      totalInflow: inflow,
      analyticsPeriods: sortedPeriods,
      analyticsCategories: allActiveCats,
      periodCategoryMatrix: matrix,
      periodOutflowTotals: pOutflowTotals,
      categoryIsIncome: isIncomeMap,
    };
  }, [transactions, analyticsGroupBy]);

  // Filter transactions
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (selectedCategory !== 'ALL' && tx.category !== selectedCategory) return false;
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) return false;
      if (verificationFilter === 'VERIFIED' && !tx.userVerified) return false;
      if (verificationFilter === 'REVIEW' && !tx.needsReview) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const accName = getAccountName(tx).toLowerCase();
        return (
          tx.rawPayee.toLowerCase().includes(q) ||
          tx.cleanPayee.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q) ||
          tx.transactionDate.includes(q) ||
          accName.includes(q)
        );
      }
      return true;
    });
  }, [transactions, selectedCategory, selectedAccount, verificationFilter, search, accounts]);

  const handleSort = (col: LedgerSortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'date' || col === 'amount' || col === 'tier' ? 'desc' : 'asc');
    }
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === 'date') {
        cmp = a.transactionDate.localeCompare(b.transactionDate);
      } else if (sortColumn === 'account') {
        cmp = getAccountName(a).localeCompare(getAccountName(b));
      } else if (sortColumn === 'payee') {
        cmp = a.cleanPayee.localeCompare(b.cleanPayee);
      } else if (sortColumn === 'amount') {
        cmp = a.amountCents - b.amountCents;
      } else if (sortColumn === 'category') {
        cmp = a.category.localeCompare(b.category);
      } else if (sortColumn === 'tier') {
        cmp = a.confidenceScore - b.confidenceScore;
      } else if (sortColumn === 'status') {
        const statusA = a.userVerified ? 2 : a.needsReview ? 0 : 1;
        const statusB = b.userVerified ? 2 : b.needsReview ? 0 : 1;
        cmp = statusA - statusB;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection, accounts]);

  // Bulk Selection Handlers
  const isAllFilteredSelected = sorted.length > 0 && sorted.every(tx => selectedIds.has(tx.id));
  const isSomeFilteredSelected = sorted.some(tx => selectedIds.has(tx.id)) && !isAllFilteredSelected;

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const next = new Set(selectedIds);
      sorted.forEach(tx => next.delete(tx.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      sorted.forEach(tx => next.add(tx.id));
      setSelectedIds(next);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleExecuteBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onBulkDeleteTransactions(ids);
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const handleExecuteBulkVerify = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (onBatchVerifyTransactions) {
      onBatchVerifyTransactions(ids);
    }
    setSelectedIds(new Set());
  };

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'Account', 'Merchant', 'Raw Payee', 'Amount', 'Category', 'Confidence', 'Tier', 'Verified'];
    const rows = filtered.map(t => [
      t.id,
      t.transactionDate,
      `"${getAccountName(t).replace(/"/g, '""')}"`,
      `"${t.cleanPayee.replace(/"/g, '""')}"`,
      `"${t.rawPayee.replace(/"/g, '""')}"`,
      (t.amountCents / 100).toFixed(2),
      t.category,
      t.confidenceScore,
      t.categorizationTier,
      t.userVerified ? 'YES' : 'NO',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ledger_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Encrypted Ledger Analytics Pivot Matrix Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm uppercase tracking-wider font-bold text-slate-100 flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                <Tag className="w-3.5 h-3.5" />
              </span>
              <span>Encrypted Ledger Analytics</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Category spending matrix grouped by {analyticsGroupBy} (rows = categories, columns = {analyticsGroupBy}s).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Group By Toggle: Year | Quarter | Month */}
            <div className="inline-flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800">
              {(['year', 'quarter', 'month'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAnalyticsGroupBy(mode)}
                  className={`px-3 py-1 rounded-md text-xs font-mono uppercase tracking-wider transition-colors ${
                    analyticsGroupBy === mode
                      ? 'bg-indigo-600 text-slate-100 font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-slate-300">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                <span>Total Outflow:</span>
                <strong className="text-slate-100">
                  ${(totalOutflow / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="flex items-center gap-1.5 text-slate-300">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                <span>Total Inflow:</span>
                <strong className="text-emerald-400">
                  +${(totalInflow / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Pivot Matrix Table: Rows = Categories, Columns = Time Periods (Year / Quarter / Month) */}
        {analyticsCategories.length === 0 || analyticsPeriods.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 font-mono">
            No categorized ledger transactions available for analytics.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-900 z-20 min-w-[180px]">
                    Category
                  </th>
                  {analyticsPeriods.map(period => (
                    <th key={period} className="py-2.5 px-3 text-right whitespace-nowrap">
                      {period}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right whitespace-nowrap text-indigo-300 border-l border-slate-800">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {analyticsCategories.map(cat => {
                  const rowMap = periodCategoryMatrix[cat] || {};
                  const rowTotal = categoryTotals[cat] || 0;
                  const isInc = categoryIsIncome[cat];
                  const isFilterSelected = selectedCategory === cat;

                  return (
                    <tr
                      key={cat}
                      onClick={() =>
                        setSelectedCategory(prev => (prev === cat ? 'ALL' : cat))
                      }
                      className={`cursor-pointer transition-colors ${
                        isFilterSelected
                          ? 'bg-indigo-950/50 hover:bg-indigo-950/70'
                          : 'hover:bg-slate-800/40'
                      }`}
                      title="Click row to filter ledger table below by this category"
                    >
                      <td className="py-2 px-3 font-sans font-medium text-slate-200 sticky left-0 bg-slate-900/95 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{cat}</span>
                          {isInc && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                              Inflow
                            </span>
                          )}
                        </div>
                      </td>
                      {analyticsPeriods.map(period => {
                        const val = rowMap[period] || 0;
                        return (
                          <td
                            key={period}
                            className={`py-2 px-3 text-right whitespace-nowrap ${
                              val === 0
                                ? 'text-slate-600'
                                : isInc
                                ? 'text-emerald-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {val === 0
                              ? '—'
                              : `${isInc ? '+' : ''}$${(val / 100).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`}
                          </td>
                        );
                      })}
                      <td
                        className={`py-2 px-3 text-right whitespace-nowrap font-semibold border-l border-slate-800/80 ${
                          isInc ? 'text-emerald-400' : 'text-indigo-300'
                        }`}
                      >
                        {isInc ? '+' : ''}$
                        {(rowTotal / 100).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-950 border-t-2 border-slate-800 font-semibold text-slate-100">
                <tr>
                  <td className="py-2.5 px-3 sticky left-0 bg-slate-950 uppercase text-[11px] tracking-wider text-slate-400">
                    Total Outflow
                  </td>
                  {analyticsPeriods.map(period => {
                    const pTotal = periodOutflowTotals[period] || 0;
                    return (
                      <td key={period} className="py-2.5 px-3 text-right whitespace-nowrap text-slate-100">
                        ${(pTotal / 100).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap text-emerald-400 border-l border-slate-800">
                    ${(totalOutflow / 100).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Filter, Search, and Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search merchant, raw text..."
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52 font-mono"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Categories</option>
              {Object.keys(categoryTotals)
                .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                .map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>

            {/* Account Filter */}
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Accounts</option>
              {Object.values(accounts).map(a => (
                <option key={a.id} value={a.id}>
                  {a.institution} ({a.maskedDisplay}){a.description ? ` — ${a.description}` : ''}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={verificationFilter}
              onChange={e => setVerificationFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Verification Statuses</option>
              <option value="VERIFIED">Human Verified</option>
              <option value="REVIEW">Awaiting Review</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Manual Add Transaction Button */}
            <button
              onClick={() => setModalState({ isOpen: true, mode: 'create', transaction: null })}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 shadow-sm"
              title="Add a manual transaction"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Transaction</span>
            </button>

            <button
              onClick={onOpenCategoryManager}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 transition-colors flex items-center gap-1.5 shadow-sm"
              title="View all categories, add custom categories, or rename"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span>Categories</span>
            </button>

            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
              title="Export filtered records to local CSV file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Bulk Actions Sticky Bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 bg-indigo-950/60 border border-indigo-700/60 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs font-mono text-indigo-200">
              <CheckSquare className="w-4 h-4 text-indigo-400" />
              <span>
                <strong>{selectedIds.size}</strong> transaction{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {showBulkDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-300 font-medium">Delete {selectedIds.size} records?</span>
                  <button
                    onClick={handleExecuteBulkDelete}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow-xs"
                  >
                    Yes, Delete All
                  </button>
                  <button
                    onClick={() => setShowBulkDeleteConfirm(false)}
                    className="px-2 py-1 text-xs text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900/80 text-rose-200 border border-rose-800/80 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete Selected ({selectedIds.size})</span>
                </button>
              )}

              {onBatchVerifyTransactions && (
                <button
                  onClick={handleExecuteBulkVerify}
                  className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-800/80 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark Verified ({selectedIds.size})</span>
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setShowBulkDeleteConfirm(false);
                }}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
                {/* Select All Checkbox */}
                <th className="py-2 px-3 w-8">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
                    title={isAllFilteredSelected ? 'Deselect all' : 'Select all'}
                  >
                    {isAllFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : isSomeFilteredSelected ? (
                      <MinusSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 opacity-40 hover:opacity-100" />
                    )}
                  </button>
                </th>

                <th
                  onClick={() => handleSort('date')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date</span>
                    {sortColumn === 'date' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('account')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Account</span>
                    {sortColumn === 'account' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('payee')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Merchant / Raw Payee</span>
                    {sortColumn === 'payee' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('amount')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
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
                  onClick={() => handleSort('category')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Category</span>
                    {sortColumn === 'category' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('tier')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Tier / Conf</span>
                    {sortColumn === 'tier' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSort('status')}
                  className="py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    {sortColumn === 'status' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>

                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {sorted.map(tx => {
                const confPct = Math.round(tx.confidenceScore * 100);
                const isSelected = selectedIds.has(tx.id);

                return (
                  <tr
                    key={tx.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-indigo-950/40 hover:bg-indigo-950/60' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Row Select Checkbox */}
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => handleToggleSelectOne(tx.id)}
                        className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 opacity-30 hover:opacity-100" />
                        )}
                      </button>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-300">
                      {tx.transactionDate}
                    </td>

                    <td
                      className="py-2.5 px-3 whitespace-nowrap font-medium text-indigo-300"
                      title={`${getAccountName(tx)} (${tx.accountMasked})`}
                    >
                      {getAccountName(tx)}
                    </td>

                    <td className="py-2.5 px-3 min-w-[200px]">
                      <div className="font-semibold text-slate-200">{tx.cleanPayee}</div>
                      <div className="font-mono text-[11px] text-slate-500 truncate max-w-xs" title={tx.rawPayee}>
                        {tx.rawPayee}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono font-medium">
                      <span className={tx.amountCents < 0 ? 'text-slate-100' : 'text-emerald-400'}>
                        {tx.amountCents < 0 ? '-' : '+'}
                        ${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <select
                        value={tx.category}
                        onChange={e => onUpdateTransactionCategory(tx.id, e.target.value)}
                        className="bg-slate-950 border border-slate-700/80 hover:border-indigo-500 text-slate-200 rounded px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors"
                        title="Click to edit category"
                      >
                        {sortedCategoryOptions.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {tx.categorizationTier} ({confPct}%)
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {tx.userVerified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verified</span>
                        </span>
                      ) : tx.needsReview ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Needs Review</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">Auto (Tier 1)</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => setModalState({ isOpen: true, mode: 'edit', transaction: tx })}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                          title="Edit transaction"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Single Delete Button */}
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete transaction "${tx.cleanPayee}" ($${(Math.abs(tx.amountCents)/100).toFixed(2)})?`)) {
                              onDeleteTransaction(tx.id);
                            }
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Create Rule Shortcut */}
                        <button
                          onClick={() => onOpenRuleModal(tx.rawPayee, tx.cleanPayee, tx.category)}
                          className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline ml-1"
                          title="Create RE2 rule from merchant"
                        >
                          +Rule
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Transaction Add / Edit Modal */}
      <TransactionFormModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        mode={modalState.mode}
        initialTransaction={modalState.transaction}
        accounts={accounts}
        categories={categories}
        onSave={onSaveTransaction}
        onDelete={onDeleteTransaction}
      />
    </div>
  );
};
