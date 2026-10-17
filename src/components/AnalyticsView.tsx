import React, { useState, useMemo } from 'react';
import { Transaction, Account } from '../types/finance';
import { BarChart3, ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';

interface AnalyticsViewProps {
  transactions: Transaction[];
  accounts: Record<string, Account>;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  transactions,
  accounts,
}) => {
  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<'year' | 'quarter' | 'month'>('year');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [categorySearch, setCategorySearch] = useState<string>('');

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
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) continue;

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
    const q = categorySearch.trim().toLowerCase();
    const allActiveCats = Array.from(
      new Set([...Object.keys(catTotalOutflow), ...Object.keys(catTotalInflow)])
    )
      .filter(cat => !q || cat.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const matrix: Record<string, Record<string, number>> = {};
    const isIncomeMap: Record<string, boolean> = {};

    for (const cat of allActiveCats) {
      const isInc =
        (catTotalInflow[cat] || 0) > (catTotalOutflow[cat] || 0) &&
        (catTotalOutflow[cat] || 0) === 0;
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
  }, [transactions, analyticsGroupBy, selectedAccount, categorySearch]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-sm uppercase tracking-wider font-bold text-slate-100 flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              <BarChart3 className="w-4 h-4" />
            </span>
            <span>Encrypted Ledger Analytics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Category spending matrix grouped by {analyticsGroupBy} (rows = categories, columns = {analyticsGroupBy}s).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={categorySearch}
              onChange={e => setCategorySearch(e.target.value)}
              placeholder="Filter category..."
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44 font-mono"
            />
          </div>

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

          {/* Summary Totals */}
          <div className="flex items-center gap-4 text-xs font-mono pl-2 border-l border-slate-800">
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
        <div className="text-center py-12 text-xs text-slate-500 font-mono">
          No categorized ledger transactions available for analytics.
        </div>
      ) : (
        <div className="w-full max-h-[calc(100vh-225px)] overflow-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead className="sticky top-0 bg-slate-900 z-20 shadow-xs">
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3 sticky left-0 bg-slate-900 z-30 min-w-[200px]">
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

                return (
                  <tr key={cat} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-200 sticky left-0 bg-slate-900/95 whitespace-nowrap">
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
                          className={`py-2.5 px-3 text-right whitespace-nowrap ${
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
                      className={`py-2.5 px-3 text-right whitespace-nowrap font-semibold border-l border-slate-800/80 ${
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
            <tfoot className="sticky bottom-0 bg-slate-950 border-t-2 border-slate-800 font-semibold text-slate-100 z-20">
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
  );
};
