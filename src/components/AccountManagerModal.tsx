import React, { useState } from 'react';
import { X, CreditCard, Building2, Check, Edit2, Trash2, Plus, ShieldCheck, AlertCircle, FileText, Info } from 'lucide-react';
import { Account } from '../types/finance';
import { generateRandomHex } from '../engine/crypto';

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Record<string, Account>;
  onUpdateAccount: (updatedAccount: Account) => void;
  onAddAccount: (newAccount: Account) => void;
  onDeleteAccount?: (accountId: string) => void;
}

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onUpdateAccount,
  onAddAccount,
  onDeleteAccount,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInstitution, setEditInstitution] = useState('');
  const [editMasked, setEditMasked] = useState('');
  const [editType, setEditType] = useState<Account['type']>('credit_card');
  const [editDescription, setEditDescription] = useState('');
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // New account form state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newInstitution, setNewInstitution] = useState('');
  const [newMasked, setNewMasked] = useState('****');
  const [newType, setNewType] = useState<Account['type']>('checking');
  const [newDescription, setNewDescription] = useState('');

  if (!isOpen) return null;

  const accountList = Object.values(accounts);

  const startEditing = (acc: Account) => {
    setEditingId(acc.id);
    setEditInstitution(acc.institution);
    setEditMasked(acc.maskedDisplay);
    setEditType(acc.type);
    setEditDescription(acc.description || '');
    setIsAddingNew(false);
  };

  const handleSaveEdit = (acc: Account) => {
    const updated: Account = {
      ...acc,
      institution: editInstitution.trim() || acc.institution,
      maskedDisplay: editMasked.trim() || acc.maskedDisplay,
      type: editType,
      description: editDescription.trim(),
    };
    onUpdateAccount(updated);
    setEditingId(null);
    setSaveSuccess(`Updated account "${updated.institution} (${updated.maskedDisplay})"`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstitution.trim()) return;

    // Generate pseudo-deterministic 16-hex HMAC ID
    const randomHex = generateRandomHex(8);

    const newAcc: Account = {
      id: randomHex,
      institution: newInstitution.trim(),
      maskedDisplay: newMasked.trim() || '****0000',
      type: newType,
      currency: 'USD',
      description: newDescription.trim(),
      createdAt: new Date().toISOString(),
    };

    onAddAccount(newAcc);
    setIsAddingNew(false);
    setNewInstitution('');
    setNewMasked('****');
    setNewDescription('');
    setSaveSuccess(`Added account "${newAcc.institution} (${newAcc.maskedDisplay})"`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Account Configuration & Privacy
              </h2>
              <p className="text-xs text-slate-400">
                Manage bank & card nicknames, institution labels, and git exclusion
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="px-6 py-3 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-300/90 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-emerald-300">GitHub Protection Active: </span>
            <code className="text-emerald-200 font-mono bg-emerald-950 px-1 py-0.5 rounded border border-emerald-800/60">
              config/accounts.json
            </code>{' '}
            is ignored in <code className="text-emerald-200 font-mono">.gitignore</code> so your personal accounts are
            never uploaded to GitHub. An anonymized{' '}
            <code className="text-emerald-200 font-mono">config/accounts.json.example</code> template is kept for clean repository cloning.
          </div>
        </div>

        {saveSuccess && (
          <div className="mx-6 mt-3 px-3 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4" />
            <span>{saveSuccess}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Configured Accounts ({accountList.length})
            </span>
            {!isAddingNew && (
              <button
                onClick={() => setIsAddingNew(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </button>
            )}
          </div>

          {/* New Account Form */}
          {isAddingNew && (
            <form onSubmit={handleCreateNew} className="p-4 bg-slate-800/80 border border-indigo-500/40 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-indigo-300 border-b border-slate-700 pb-2">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  Add New Account Mapping
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Institution Name</label>
                  <input
                    type="text"
                    value={newInstitution}
                    onChange={e => setNewInstitution(e.target.value)}
                    placeholder="e.g. Chase Sapphire Reserve"
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Masked Number (Last 4)</label>
                  <input
                    type="text"
                    value={newMasked}
                    onChange={e => setNewMasked(e.target.value)}
                    placeholder="****9482"
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Account Type</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as Account['type'])}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="credit_card">Credit Card</option>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="brokerage">Brokerage</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Friendly Nickname / Description</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    placeholder="e.g. Primary Travel & Dining Card"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Save Account
                </button>
              </div>
            </form>
          )}

          {/* Account Cards List */}
          <div className="space-y-2.5">
            {accountList.map(acc => {
              const isEditing = editingId === acc.id;

              if (isEditing) {
                return (
                  <div key={acc.id} className="p-4 bg-slate-800/90 border border-indigo-500/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs text-indigo-300 font-medium">
                      <span>Editing {acc.institution}</span>
                      <span className="font-mono text-[11px] text-slate-400">ID: {acc.id.substring(0, 8)}...</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Institution Name</label>
                        <input
                          type="text"
                          value={editInstitution}
                          onChange={e => setEditInstitution(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Masked Number</label>
                        <input
                          type="text"
                          value={editMasked}
                          onChange={e => setEditMasked(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Account Type</label>
                        <select
                          value={editType}
                          onChange={e => setEditType(e.target.value as Account['type'])}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="credit_card">Credit Card</option>
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                          <option value="brokerage">Brokerage</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Friendly Nickname / Description</label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          placeholder="e.g. Household Bills Checking"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(acc)}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-slate-950"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={acc.id}
                  className="p-3.5 bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 rounded-xl flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                      <CreditCard className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-200 text-sm truncate">
                          {acc.institution}
                        </span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                          {acc.maskedDisplay}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-700/50 text-indigo-300">
                          {acc.type.replace('_', ' ')}
                        </span>
                      </div>
                      {acc.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{acc.description}</p>
                      )}
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                        Anonymized HMAC Hash: {acc.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => startEditing(acc)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
                      title="Edit account nickname and details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    {onDeleteAccount && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete account "${acc.institution} (${acc.maskedDisplay})"? Associated ledger transactions will remain in database with their stored mask.`)) {
                            onDeleteAccount(acc.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700/60 transition-colors"
                        title="Delete account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Guide Accordion */}
          <div className="mt-6 p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-medium">
              <Info className="w-4 h-4 text-indigo-400" />
              <span>How are account configs updated and stored?</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>
                <strong className="text-slate-300">Via Web UI:</strong> Click &quot;Edit&quot; on any account above or &quot;Add Account&quot;. Edits are saved directly to the encrypted database and written to <code className="text-indigo-300 font-mono">config/accounts.json</code>.
              </li>
              <li>
                <strong className="text-slate-300">Via File:</strong> You can edit <code className="text-indigo-300 font-mono">config/accounts.json</code> directly on your host before or while running the container.
              </li>
              <li>
                <strong className="text-slate-300">Auto-Discovery:</strong> When ingesting a statement, any new bank account number is hashed with HMAC-SHA256 and automatically registered if not yet known.
              </li>
              <li>
                <strong className="text-slate-300">GitHub Protection:</strong> <code className="text-emerald-400 font-mono">config/accounts.json</code> is listed in <code className="text-emerald-400 font-mono">.gitignore</code> so your personal account mappings never get pushed to git.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
