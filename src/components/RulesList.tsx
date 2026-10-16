import React, { useState } from 'react';
import { Rule } from '../types/finance';
import { Cpu, Plus, Trash2, Shield, Search } from 'lucide-react';

interface RulesListProps {
  rules: Rule[];
  onOpenCreateRule: () => void;
  onDeleteRule: (id: string) => void;
}

export const RulesList: React.FC<RulesListProps> = ({
  rules,
  onOpenCreateRule,
  onDeleteRule,
}) => {
  const [search, setSearch] = useState('');

  const filtered = rules.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.pattern.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.cleanPayee && r.cleanPayee.toLowerCase().includes(q))
    );
  });

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
              {rules.length} Rules Active
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

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="py-2.5 px-3">Go RE2 Pattern</th>
              <th className="py-2.5 px-3">Target Category</th>
              <th className="py-2.5 px-3">Normalized Clean Payee</th>
              <th className="py-2.5 px-3">Created</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
            {filtered.map(rule => (
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
                  {rule.cleanPayee || <span className="text-slate-600 italic">Auto Clean</span>}
                </td>

                <td className="py-3 px-3 text-slate-500 text-[11px]">
                  {rule.createdAt.split('T')[0]}
                </td>

                <td className="py-3 px-3 text-right">
                  <button
                    onClick={() => onDeleteRule(rule.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
