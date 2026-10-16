import React, { useState, useMemo } from 'react';
import { Transaction, Account } from '../types/finance';
import { Search, Filter, Download, CheckCircle2, AlertTriangle, ArrowDownRight, ArrowUpRight, Database, Tag, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface LedgerViewProps {
  transactions: Transaction[];
  accounts: Record<string, Account>;
  categories: string[];
  onOpenRuleModal: (rawPayee: string, cleanPayee: string, currentCategory: string) => void;
  onOpenCategoryManager: () => void;
  onUpdateTransactionCategory: (id: string, newCategory: string) => void;
}

type LedgerSortColumn = 'date' | 'account' | 'payee' | 'amount' | 'category' | 'tier' | 'status';

export const LedgerView: React.FC<LedgerViewProps> = ({
  transactions,
  accounts,
  categories,
  onOpenRuleModal,
  onOpenCategoryManager,
  onUpdateTransactionCategory,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<'ALL' | 'VERIFIED' | 'REVIEW'>('ALL');
  const [sortColumn, setSortColumn] = useState<LedgerSortColumn>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Compute category totals
  const { categoryTotals, totalOutflow, totalInflow } = useMemo(() => {
    let outflow = 0;
    let inflow = 0;
    const totals: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.amountCents < 0 && tx.category !== 'Transfer:CreditCardPayment') {
        const absVal = Math.abs(tx.amountCents);
        outflow += absVal;
        totals[tx.category] = (totals[tx.category] || 0) + absVal;
      } else if (tx.amountCents > 0 && tx.category !== 'Transfer:CreditCardPayment') {
        inflow += tx.amountCents;
      }
    }

    return { categoryTotals: totals, totalOutflow: outflow, totalInflow: inflow };
  }, [transactions]);

  // Sort categories by highest spend
  const sortedCategories = useMemo(() => {
    return Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  }, [categoryTotals]);

  // Filter transactions
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (selectedCategory !== 'ALL' && tx.category !== selectedCategory) return false;
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) return false;
      if (verificationFilter === 'VERIFIED' && !tx.userVerified) return false;
      if (verificationFilter === 'REVIEW' && !tx.needsReview) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          tx.rawPayee.toLowerCase().includes(q) ||
          tx.cleanPayee.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q) ||
          tx.transactionDate.includes(q)
        );
      }
      return true;
    });
  }, [transactions, selectedCategory, selectedAccount, verificationFilter, search]);

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
        cmp = a.accountMasked.localeCompare(b.accountMasked);
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
  }, [filtered, sortColumn, sortDirection]);

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'Account', 'Merchant', 'Raw Payee', 'Amount', 'Category', 'Confidence', 'Tier', 'Verified', 'Payload Hash'];
    const rows = filtered.map(t => [
      t.id,
      t.transactionDate,
      t.accountMasked,
      `"${t.cleanPayee.replace(/"/g, '""')}"`,
      `"${t.rawPayee.replace(/"/g, '""')}"`,
      (t.amountCents / 100).toFixed(2),
      t.category,
      t.confidenceScore,
      t.categorizationTier,
      t.userVerified ? 'YES' : 'NO',
      t.sourceFileHash,
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
      {/* Category Spend Breakdown (Client-Side Computed) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm uppercase tracking-wider font-bold text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Category Spend Breakdown (Client-Side In-Memory)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregated directly from deduplicated SQLite records without server roundtrips.
            </p>
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

        {/* Spend Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-3">
          {sortedCategories.slice(0, 8).map(([cat, cents]) => {
            const pct = totalOutflow > 0 ? Math.min(100, Math.round((cents / totalOutflow) * 100)) : 0;
            return (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium truncate">{cat}</span>
                  <span className="font-mono text-slate-400">
                    ${(cents / 100).toFixed(2)}{' '}
                    <span className="text-slate-500 text-[11px]">({pct}%)</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
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
              {Object.keys(categoryTotals).map(c => (
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
                  {a.institution} ({a.maskedDisplay})
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
            <button
              onClick={onOpenCategoryManager}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 transition-colors flex items-center gap-1.5 shadow-sm"
              title="View all categories, add custom categories, or rename"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span>Manage Categories</span>
            </button>

            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
              title="Export filtered records to local CSV file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV ({filtered.length})</span>
            </button>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
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

                <th className="py-2 px-3 text-right">Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {sorted.map(tx => {
                const confPct = Math.round(tx.confidenceScore * 100);
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-300">
                      {tx.transactionDate}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-400">
                      {tx.accountMasked}
                    </td>

                    <td className="py-2.5 px-3 min-w-[220px]">
                      <div className="font-semibold text-slate-200">{tx.cleanPayee}</div>
                      <div className="font-mono text-[11px] text-slate-500 truncate" title={tx.rawPayee}>
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
                        {categories.map(c => (
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
                      <button
                        onClick={() => onOpenRuleModal(tx.rawPayee, tx.cleanPayee, tx.category)}
                        className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline"
                      >
                        +Rule
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
