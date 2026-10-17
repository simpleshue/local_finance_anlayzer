import React, { useState, useMemo } from 'react';
import { Rule } from '../types/finance';
import { Cpu, Plus, Trash2, Edit2, Search, Sparkles, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface RulesListProps {
  rules: Rule[];
  onOpenCreateRule: () => void;
  onEditRule: (rule: Rule) => void;
  onDeleteRule: (id: string) => void;
}

type RuleSortColumn = 'pattern' | 'category' | 'cleanPayee' | 'created';

export const RulesList: React.FC<RulesListProps> = ({
  rules = [],
  onOpenCreateRule,
  onEditRule,
  onDeleteRule,
}) => {
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<RuleSortColumn>('category');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const safeRules = Array.isArray(rules) ? rules : [];

  const formatRuleDate = (rule: Rule): string => {
    const raw = rule.createdAt || (rule as any).created_at;
    if (!raw) return 'Built-in Rule';
    if (typeof raw === 'string') {
      if (raw.startsWith('0001-')) return 'Built-in Rule';
      return raw.includes('T') ? raw.split('T')[0] : raw;
    }
    return 'Built-in Rule';
  };

  const handleSort = (col: RuleSortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'created' ? 'desc' : 'asc');
    }
  };

  const filtered = safeRules.filter(r => {
    if (!r) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const pattern = (r.pattern || '').toLowerCase();
    const category = (r.category || '').toLowerCase();
    const cleanPayee = (r.cleanPayee || (r as any).clean_payee || '').toLowerCase();
    return pattern.includes(q) || category.includes(q) || cleanPayee.includes(q);
  });

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      const cleanA = (a.cleanPayee || (a as any).clean_payee || '').toString();
      const cleanB = (b.cleanPayee || (b as any).clean_payee || '').toString();
      if (sortColumn === 'pattern') {
        cmp = (a.pattern || '').localeCompare(b.pattern || '', undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'category') {
        cmp = (a.category || '').localeCompare(b.category || '', undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'cleanPayee') {
        cmp = cleanA.localeCompare(cleanB, undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'created') {
        cmp = formatRuleDate(a).localeCompare(formatRuleDate(b));
      }
      if (cmp === 0) {
        cmp = (a.pattern || '').localeCompare(b.pattern || '', undefined, { sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Cpu className="w-4 h-4" />
            </span>
            <h2 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              Compiled Go RE2 Regular Expression Rules (Tier 1)
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">
              {safeRules.length} Rules Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            RE2 guarantees linear-time <span className="font-mono text-emerald-400">O(N)</span> execution
            with strictly bounded memory, rendering the engine completely immune to catastrophic
            backtracking (ReDoS) from user-supplied regular expressions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search regex pattern..."
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52 font-mono"
            />
          </div>

          <button
            onClick={onOpenCreateRule}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Regex Rule</span>
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-300 font-medium">No regex rules found</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {search.trim()
              ? `No rules match "${search}". Try adjusting your query.`
              : 'Add your first deterministic classification pattern to automate merchant categorization.'}
          </p>
          {!search.trim() && (
            <button
              onClick={onOpenCreateRule}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors inline-flex items-center gap-1.5 mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Initial Rule</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
                <th
                  onClick={() => handleSort('pattern')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Go RE2 Pattern</span>
                    {sortColumn === 'pattern' ? (
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
                    <span>Target Category</span>
                    {sortColumn === 'category' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cleanPayee')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Normalized Clean Payee</span>
                    {sortColumn === 'cleanPayee' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('created')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Created</span>
                    {sortColumn === 'created' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
              {sorted.map(rule => {
                const cleanPayee = rule.cleanPayee || (rule as any).clean_payee;
                return (
                  <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <span className="text-emerald-400 font-bold bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        {rule.pattern}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                        {rule.category}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-sans text-slate-300">
                      {cleanPayee || <span className="text-slate-600 italic">Auto Clean</span>}
                    </td>

                    <td className="py-3 px-3 text-slate-500 text-[11px]">
                      {formatRuleDate(rule)}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEditRule(rule)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                          title="Edit rule"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteRule(rule.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
