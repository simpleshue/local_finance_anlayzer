import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, Account } from '../types/finance';
import {
  BarChart3,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  CheckSquare,
  Square,
  Layers,
  X,
} from 'lucide-react';

interface AnalyticsViewProps {
  transactions: Transaction[];
  accounts: Record<string, Account>;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  transactions,
  accounts,
}) => {
  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<'year' | 'quarter' | 'month'>('year');
  const [categoryLevel, setCategoryLevel] = useState<'full' | 'top'>('full');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');

  // Multi-select category filter state (empty set = All Categories included)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [catDropdownSearch, setCatDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Table sorting state ('category', 'total', or any period string like '2026', '2026-Q1', etc.)
  const [sortColumn, setSortColumn] = useState<string>('category');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCatDropdownOpen(false);
      }
    };
    if (isCatDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCatDropdownOpen]);

  // Reset selectedCategories when switching between Subcategories and Top-Level
  const handleCategoryLevelChange = (level: 'full' | 'top') => {
    setCategoryLevel(level);
    setSelectedCategories(new Set());
  };

  // Compute all available categories (at the current aggregation level) and pivot matrix
  const {
    allAvailableCategories,
    categoryTotals,
    totalOutflow,
    totalInflow,
    analyticsPeriods,
    analyticsCategories,
    periodCategoryMatrix,
    periodOutflowTotals,
    categoryIsIncome,
  } = useMemo(() => {
    // Canonicalize category name based on categoryLevel ('full' vs 'top')
    const canonicalMap = new Map<string, string>();
    const resolveCategoryKey = (rawCat: string): string => {
      const trimmed = (rawCat || 'Uncategorized').trim() || 'Uncategorized';
      let target = trimmed;
      if (categoryLevel === 'top') {
        const colonIdx = trimmed.indexOf(':');
        const topPart = (colonIdx >= 0 ? trimmed.slice(0, colonIdx) : trimmed).trim();
        target = topPart
          ? topPart.charAt(0).toUpperCase() + topPart.slice(1)
          : 'Uncategorized';
      }
      const lower = target.toLowerCase();
      const existing = canonicalMap.get(lower);
      if (existing) {
        // Prefer version with uppercase first letter
        if (target[0] >= 'A' && target[0] <= 'Z' && !(existing[0] >= 'A' && existing[0] <= 'Z')) {
          canonicalMap.set(lower, target);
          return target;
        }
        return existing;
      }
      canonicalMap.set(lower, target);
      return target;
    };

    // First pass: collect all canonical names across transactions so casing is consistent
    const allCatSet = new Set<string>();
    for (const tx of transactions) {
      if (tx.category === 'Transfer:CreditCardPayment') continue;
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) continue;
      resolveCategoryKey(tx.category);
    }
    for (const tx of transactions) {
      if (tx.category === 'Transfer:CreditCardPayment') continue;
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) continue;
      allCatSet.add(resolveCategoryKey(tx.category));
    }

    const sortedAllAvailable = Array.from(allCatSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

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

      const catKey = resolveCategoryKey(tx.category);
      if (selectedCategories.size > 0 && !selectedCategories.has(catKey)) {
        continue;
      }

      const period = getPeriodKey(tx.transactionDate);
      periodSet.add(period);

      if (tx.amountCents < 0) {
        const absVal = Math.abs(tx.amountCents);
        outflow += absVal;
        totals[catKey] = (totals[catKey] || 0) + absVal;
        catTotalOutflow[catKey] = (catTotalOutflow[catKey] || 0) + absVal;
        if (!catOutflowByPeriod[catKey]) catOutflowByPeriod[catKey] = {};
        catOutflowByPeriod[catKey][period] =
          (catOutflowByPeriod[catKey][period] || 0) + absVal;
        pOutflowTotals[period] = (pOutflowTotals[period] || 0) + absVal;
      } else if (tx.amountCents > 0) {
        inflow += tx.amountCents;
        catTotalInflow[catKey] = (catTotalInflow[catKey] || 0) + tx.amountCents;
        if (!catInflowByPeriod[catKey]) catInflowByPeriod[catKey] = {};
        catInflowByPeriod[catKey][period] =
          (catInflowByPeriod[catKey][period] || 0) + tx.amountCents;
      }
    }

    const sortedPeriods = Array.from(periodSet).sort((a, b) => a.localeCompare(b));
    const activeCats = Array.from(
      new Set([...Object.keys(catTotalOutflow), ...Object.keys(catTotalInflow)])
    );

    const matrix: Record<string, Record<string, number>> = {};
    const isIncomeMap: Record<string, boolean> = {};

    for (const cat of activeCats) {
      const isInc =
        (catTotalInflow[cat] || 0) > (catTotalOutflow[cat] || 0) &&
        (catTotalOutflow[cat] || 0) === 0;
      isIncomeMap[cat] = isInc;
      matrix[cat] = isInc ? catInflowByPeriod[cat] || {} : catOutflowByPeriod[cat] || {};
      if (isInc && !totals[cat]) {
        totals[cat] = catTotalInflow[cat] || 0;
      }
    }

    // Sort activeCategories by sortColumn & sortDirection
    const sortedActiveCats = [...activeCats].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === 'category') {
        cmp = a.localeCompare(b, undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'total') {
        cmp = (totals[a] || 0) - (totals[b] || 0);
      } else {
        const valA = matrix[a]?.[sortColumn] || 0;
        const valB = matrix[b]?.[sortColumn] || 0;
        cmp = valA - valB;
      }
      if (cmp === 0) {
        cmp = a.localeCompare(b, undefined, { sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return {
      allAvailableCategories: sortedAllAvailable,
      categoryTotals: totals,
      totalOutflow: outflow,
      totalInflow: inflow,
      analyticsPeriods: sortedPeriods,
      analyticsCategories: sortedActiveCats,
      periodCategoryMatrix: matrix,
      periodOutflowTotals: pOutflowTotals,
      categoryIsIncome: isIncomeMap,
    };
  }, [
    transactions,
    analyticsGroupBy,
    categoryLevel,
    selectedAccount,
    selectedCategories,
    sortColumn,
    sortDirection,
  ]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'category' ? 'asc' : 'desc');
    }
  };

  const toggleCategorySelection = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const filteredDropdownCategories = useMemo(() => {
    const q = catDropdownSearch.trim().toLowerCase();
    if (!q) return allAvailableCategories;
    return allAvailableCategories.filter(c => c.toLowerCase().includes(q));
  }, [allAvailableCategories, catDropdownSearch]);

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
            Category spending matrix grouped by {analyticsGroupBy} (
            {categoryLevel === 'top' ? 'aggregated to top-level categories' : 'full subcategories'}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Level Toggle: Subcategories vs Top-Level */}
          <div
            className="inline-flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800"
            title="Toggle between full subcategories (e.g. Housing:Mortgage) and top-level category rollup (e.g. Housing)"
          >
            <span className="px-2 text-[11px] font-mono text-slate-500 flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-400" />
              <span className="hidden sm:inline">Level:</span>
            </span>
            <button
              type="button"
              onClick={() => handleCategoryLevelChange('full')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                categoryLevel === 'full'
                  ? 'bg-indigo-600 text-slate-100 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Subcategory
            </button>
            <button
              type="button"
              onClick={() => handleCategoryLevelChange('top')}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                categoryLevel === 'top'
                  ? 'bg-indigo-600 text-slate-100 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Top-Level
            </button>
          </div>

          {/* Multi-Select Category Filter Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsCatDropdownOpen(prev => !prev)}
              className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 hover:border-indigo-500 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 min-w-[175px] font-mono transition-colors"
            >
              <span className="truncate">
                {selectedCategories.size === 0
                  ? 'All Categories'
                  : `${selectedCategories.size} Categor${selectedCategories.size === 1 ? 'y' : 'ies'}`}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {selectedCategories.size > 0 && (
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedCategories(new Set());
                    }}
                    className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400"
                    title="Clear category filter"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </button>

            {isCatDropdownOpen && (
              <div className="absolute right-0 z-50 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 text-xs">
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={catDropdownSearch}
                    onChange={e => setCatDropdownSearch(e.target.value)}
                    placeholder="Search categories..."
                    className="w-full pl-8 pr-6 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    autoFocus
                  />
                  {catDropdownSearch && (
                    <button
                      type="button"
                      onClick={() => setCatDropdownSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-slate-800 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setSelectedCategories(new Set(allAvailableCategories))}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    Select All ({allAvailableCategories.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategories(new Set())}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    Show All / Clear
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/40">
                  {filteredDropdownCategories.length === 0 ? (
                    <div className="py-3 text-center text-slate-500 font-mono text-[11px]">
                      No categories match "{catDropdownSearch}"
                    </div>
                  ) : (
                    filteredDropdownCategories.map(cat => {
                      const isChecked = selectedCategories.has(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategorySelection(cat)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-800/60 rounded text-left transition-colors"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                          <span className={`truncate ${isChecked ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                            {cat}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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
          No categorized ledger transactions match the selected filters.
        </div>
      ) : (
        <div className="w-full max-h-[calc(100vh-225px)] overflow-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead className="sticky top-0 bg-slate-900 z-20 shadow-xs select-none">
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                <th
                  onClick={() => handleSort('category')}
                  className="py-2.5 px-3 sticky left-0 bg-slate-900 z-30 min-w-[200px] cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{categoryLevel === 'top' ? 'Top-Level Category' : 'Category'}</span>
                    {sortColumn === 'category' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
                </th>

                {analyticsPeriods.map(period => (
                  <th
                    key={period}
                    onClick={() => handleSort(period)}
                    className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:text-slate-200 transition-colors"
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      <span>{period}</span>
                      {sortColumn === period ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                      )}
                    </div>
                  </th>
                ))}

                <th
                  onClick={() => handleSort('total')}
                  className="py-2.5 px-3 text-right whitespace-nowrap text-indigo-300 border-l border-slate-800 cursor-pointer hover:text-indigo-200 transition-colors"
                >
                  <div className="inline-flex items-center justify-end gap-1">
                    <span>Total</span>
                    {sortColumn === 'total' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-emerald-400 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
                    )}
                  </div>
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
