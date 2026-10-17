import React, { useState } from 'react';
import { Tag, Plus, Edit2, Trash2, X, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { Transaction, Rule } from '../types/finance';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  transactions: Transaction[];
  rules: Rule[];
  onAddCategory: (newCategory: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
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

  if (!isOpen) return null;

  // Compute stats per category (sorted alphabetically by category name by default)
  const categoryStats = [...categories]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(cat => {
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

  const startRename = (cat: string) => {
    setEditingCategory(cat);
    setRenameInput(cat);
    setRenameError(null);
  };

  const handleSaveRename = (oldName: string) => {
    const clean = renameInput.trim();
    if (!clean) {
      setRenameError('Name cannot be empty');
      return;
    }
    if (clean.toLowerCase() !== oldName.toLowerCase() && categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      setRenameError('A category with this name already exists');
      return;
    }
    onRenameCategory(oldName, clean);
    setEditingCategory(null);
    setRenameInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              <Tag className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Category Manager (View & Edit Categories)
              </h3>
              <p className="text-[11px] text-slate-400">
                Create new categories, rename existing categories, and view spend attribution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add New Category Form */}
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
          <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Add New Custom Category</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCatInput}
              onChange={e => {
                setNewCatInput(e.target.value);
                setNewCatError(null);
              }}
              placeholder="e.g. Fitness:Gym, Pets:Veterinary, Education:Books..."
              className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center gap-1 shadow-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>
          {newCatError && (
            <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{newCatError}</span>
            </p>
          )}
        </form>

        {/* Categories List */}
        <div className="overflow-y-auto pr-1 space-y-2 flex-1">
          {categoryStats.map(cat => {
            const isEditing = editingCategory === cat.name;

            return (
              <div
                key={cat.name}
                className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 transition-colors flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={renameInput}
                      onChange={e => {
                        setRenameInput(e.target.value);
                        setRenameError(null);
                      }}
                      className="flex-1 px-2.5 py-1 text-xs bg-slate-900 border border-indigo-500 rounded text-slate-100 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveRename(cat.name)}
                      className="p-1.5 rounded bg-emerald-600 text-slate-950 hover:bg-emerald-500 transition-colors"
                      title="Save Rename"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {renameError && (
                      <span className="text-[11px] text-rose-400">{renameError}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-[200px]">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                        {cat.name}
                      </span>
                      {cat.name === 'Uncategorized' && (
                        <span className="text-[10px] text-amber-400 font-mono">(System Default)</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono">
                      <span>
                        <strong className="text-slate-200">{cat.txCount}</strong> txn{cat.txCount === 1 ? '' : 's'}
                      </span>
                      <span>
                        <strong className="text-slate-200">${(cat.spendCents / 100).toFixed(2)}</strong> spend
                      </span>
                      <span>
                        <strong className="text-slate-300">{cat.ruleCount}</strong> rule{cat.ruleCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startRename(cat.name)}
                        className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
                        title={`Rename "${cat.name}" and update matching transactions/rules`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      {cat.name !== 'Uncategorized' && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Are you sure you want to delete category "${cat.name}"? Any of the ${cat.txCount} transactions in it will be set to "Uncategorized" for review.`
                              )
                            ) {
                              onDeleteCategory(cat.name);
                            }
                          }}
                          className="p-1.5 rounded bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete category"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Renaming updates existing transactions & regex rules automatically.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
