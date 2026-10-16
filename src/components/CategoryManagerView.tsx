import React, { useState } from 'react';
import { Tag, Plus, Edit2, Trash2, Check, AlertCircle, ArrowRight, Search, Sparkles } from 'lucide-react';
import { Transaction, Rule } from '../types/finance';

interface CategoryManagerViewProps {
  categories: string[];
  transactions: Transaction[];
  rules: Rule[];
  onAddCategory: (newCategory: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
}

export const CategoryManagerView: React.FC<CategoryManagerViewProps> = ({
  categories,
  transactions,
  rules,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const [newCatInput, setNewCatInput] = useState('');
  const [newCatError, setNewCatError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Compute stats per category
  const categoryStats = categories.map(cat => {
    let txCount = 0;
    let spendCents = 0;
    for (const tx of transactions) {
      if (tx.category === cat) {
        txCount++;
        if (tx.amountCents < 0 && tx.category !== 'Transfer:CreditCardPayment') {
          spendCents += Math.abs(tx.amountCents);
        }
      }
    }
    const ruleCount = rules.filter(r => r.category === cat).length;
    return {
      name: cat,
      txCount,
      spendCents,
      ruleCount,
    };
  });

  const filteredStats = categoryStats.filter(c => {
    if (!search.trim()) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatInput.trim();
    if (!clean) {
      setNewCatError('Category name cannot be empty');
      return;
    }
    if (categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      setNewCatError('Category already exists');
      return;
    }
    onAddCategory(clean);
    setNewCatInput('');
    setNewCatError(null);
  };

  const handleStartRename = (oldName: string) => {
    setEditingCategory(oldName);
    setRenameInput(oldName);
    setRenameError(null);
  };

  const handleConfirmRename = (oldName: string) => {
    const clean = renameInput.trim();
    if (!clean) {
      setRenameError('Name cannot be empty');
      return;
    }
    if (clean !== oldName && categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      setRenameError('Another category already has this name');
      return;
    }
    onRenameCategory(oldName, clean);
    setEditingCategory(null);
  };

  const handleDelete = (name: string, txCount: number) => {
    if (txCount > 0) {
      const ok = window.confirm(
        `Category "${name}" is assigned to ${txCount} transaction(s). Deleting it will reassign those transactions to "Uncategorized". Proceed?`
      );
      if (!ok) return;
    }
    onDeleteCategory(name);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              <Tag className="w-5 h-5" />
            </span>
            <h2 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              Category Architecture & Classification Hierarchy
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
              {categories.length} Categories Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl font-mono">
            Manage spending categories, assign subcategories (e.g. Housing:Mortgage), and track transaction frequencies.
          </p>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search category..."
            className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52 font-mono"
          />
        </div>
      </div>

      {/* Add New Category Box */}
      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
        <h4 className="text-xs uppercase tracking-wider font-mono text-slate-300 mb-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          <span>Add Custom Category</span>
        </h4>
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newCatInput}
            onChange={e => {
              setNewCatInput(e.target.value);
              setNewCatError(null);
            }}
            placeholder="e.g. Health:Gym, Pet Care, Freelance Income..."
            className="flex-1 min-w-[260px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Category</span>
          </button>
        </form>
        {newCatError && (
          <div className="mt-2 text-xs text-rose-400 font-mono flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{newCatError}</span>
          </div>
        )}
      </div>

      {/* Categories Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="py-2.5 px-3">Category Name</th>
              <th className="py-2.5 px-3">Historical Spend</th>
              <th className="py-2.5 px-3">Transactions</th>
              <th className="py-2.5 px-3">Associated Rules</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {filteredStats.map(stat => {
              const isEditing = editingCategory === stat.name;
              return (
                <tr key={stat.name} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-medium">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameInput}
                          onChange={e => {
                            setRenameInput(e.target.value);
                            setRenameError(null);
                          }}
                          className="bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-slate-100 font-mono focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleConfirmRename(stat.name)}
                          className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950"
                          title="Save Rename"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
                          title="Cancel"
                        >
                          Cancel
                        </button>
                        {renameError && (
                          <span className="text-[11px] text-rose-400 font-mono">{renameError}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-200 font-mono font-semibold bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        {stat.name}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 font-mono text-slate-300">
                    ${(stat.spendCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>

                  <td className="py-3 px-3 font-mono text-slate-400">
                    {stat.txCount} record{stat.txCount !== 1 ? 's' : ''}
                  </td>

                  <td className="py-3 px-3 font-mono text-slate-400">
                    {stat.ruleCount} RE2 rule{stat.ruleCount !== 1 ? 's' : ''}
                  </td>

                  <td className="py-3 px-3 text-right">
                    {!isEditing && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleStartRename(stat.name)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                          title="Rename category across all records"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(stat.name, stat.txCount)}
                          disabled={stat.name === 'Uncategorized'}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                          title={stat.name === 'Uncategorized' ? 'Cannot delete default category' : 'Delete category'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
