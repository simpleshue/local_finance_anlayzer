import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, CheckCircle2, AlertTriangle, DollarSign, Calendar, Building2, Tag, FileText } from 'lucide-react';
import { Transaction, Account } from '../types/finance';

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialTransaction?: Transaction | null;
  accounts: Record<string, Account>;
  categories: string[];
  onSave: (tx: Transaction) => void;
  onDelete?: (id: string) => void;
}

export const TransactionFormModal: React.FC<TransactionFormModalProps> = ({
  isOpen,
  onClose,
  mode,
  initialTransaction,
  accounts,
  categories,
  onSave,
  onDelete,
}) => {
  const accountList = Object.values(accounts);
  const defaultAccountId = accountList[0]?.id || 'manual_account';

  const [accountId, setAccountId] = useState(defaultAccountId);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cleanPayee, setCleanPayee] = useState('');
  const [rawPayee, setRawPayee] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [isOutflow, setIsOutflow] = useState(true);
  const [category, setCategory] = useState(categories[0] || 'Uncategorized');
  const [userVerified, setUserVerified] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && initialTransaction) {
      setAccountId(initialTransaction.accountId || defaultAccountId);
      setDate(initialTransaction.transactionDate || new Date().toISOString().split('T')[0]);
      setCleanPayee(initialTransaction.cleanPayee || '');
      setRawPayee(initialTransaction.rawPayee || '');
      const absDollars = (Math.abs(initialTransaction.amountCents) / 100).toFixed(2);
      setAmountStr(absDollars);
      setIsOutflow(initialTransaction.amountCents < 0);
      setCategory(initialTransaction.category || categories[0] || 'Uncategorized');
      setUserVerified(initialTransaction.userVerified);
      setShowDeleteConfirm(false);
    } else if (mode === 'create') {
      setAccountId(defaultAccountId);
      setDate(new Date().toISOString().split('T')[0]);
      setCleanPayee('');
      setRawPayee('');
      setAmountStr('');
      setIsOutflow(true);
      setCategory(categories[0] || 'Groceries');
      setUserVerified(true);
      setShowDeleteConfirm(false);
    }
  }, [mode, initialTransaction, isOpen, defaultAccountId, categories]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedNum = parseFloat(amountStr);
    if (isNaN(parsedNum) || parsedNum <= 0) {
      alert('Please enter a valid positive dollar amount (e.g. 24.50)');
      return;
    }

    if (!cleanPayee.trim()) {
      alert('Please enter a merchant or payee name.');
      return;
    }

    const cents = Math.round(parsedNum * 100);
    const finalAmountCents = isOutflow ? -cents : cents;

    const matchedAccount = accounts[accountId];
    const accountMasked = matchedAccount?.maskedDisplay || '****0000';

    if (mode === 'create') {
      const timestamp = Date.now();
      const newTx: Transaction = {
        id: `${accountId}:MANUAL_${timestamp}`,
        accountId,
        accountMasked,
        transactionDate: date,
        amountCents: finalAmountCents,
        cleanPayee: cleanPayee.trim(),
        rawPayee: (rawPayee.trim() || cleanPayee.trim()).toUpperCase(),
        category,
        confidenceScore: 1.0,
        needsReview: !userVerified,
        categorizationTier: 'manual',
        userVerified,
        sourceFileHash: 'manual_entry',
        importedAt: new Date().toISOString(),
      };
      onSave(newTx);
    } else if (mode === 'edit' && initialTransaction) {
      const updatedTx: Transaction = {
        ...initialTransaction,
        accountId,
        accountMasked,
        transactionDate: date,
        amountCents: finalAmountCents,
        cleanPayee: cleanPayee.trim(),
        rawPayee: rawPayee.trim() || initialTransaction.rawPayee,
        category,
        userVerified,
        needsReview: !userVerified,
      };
      onSave(updatedTx);
    }

    onClose();
  };

  const handleDelete = () => {
    if (initialTransaction && onDelete) {
      onDelete(initialTransaction.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {mode === 'create' ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
            </span>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              {mode === 'create' ? 'Manual Transaction Entry' : 'Edit Transaction'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Selector */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Target Account</span>
            </label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {accountList.length > 0 ? (
                accountList.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.institution} ({a.maskedDisplay}) {a.description ? `— ${a.description}` : ''}
                  </option>
                ))
              ) : (
                <option value="manual_account">Primary Account (****0000)</option>
              )}
            </select>
          </div>

          {/* Date & Flow Direction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Date</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Flow Direction
              </label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700 bg-slate-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setIsOutflow(true)}
                  className={`flex-1 py-1.5 text-xs font-mono rounded font-medium transition-colors ${
                    isOutflow
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Expense (-)
                </button>
                <button
                  type="button"
                  onClick={() => setIsOutflow(false)}
                  className={`flex-1 py-1.5 text-xs font-mono rounded font-medium transition-colors ${
                    !isOutflow
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Income (+)
                </button>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Amount (USD)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Clean Payee & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Merchant / Clean Payee</span>
              </label>
              <input
                type="text"
                required
                value={cleanPayee}
                onChange={e => setCleanPayee(e.target.value)}
                placeholder="e.g. Trader Joe's, Local Cafe"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                <span>Category</span>
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {categories.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Raw Payee / Memo */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1">
              Raw Bank Payee / Memo <span className="text-slate-600">(Optional)</span>
            </label>
            <input
              type="text"
              value={rawPayee}
              onChange={e => setRawPayee(e.target.value)}
              placeholder="e.g. TST* BLUE BOTTLE COFFEE #104"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Verification Status Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={userVerified}
                onChange={e => setUserVerified(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
              />
              <span className="text-xs text-slate-300 font-mono">
                Mark as verified (skip Triage Review Queue)
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            {mode === 'edit' && onDelete ? (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold transition-colors"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 rounded transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold rounded text-xs transition-colors shadow-sm"
              >
                {mode === 'create' ? 'Add Transaction' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
