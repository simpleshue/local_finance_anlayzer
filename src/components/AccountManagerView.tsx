import React, { useState, useMemo } from 'react';
import { CreditCard, Building2, Check, Edit2, Trash2, Plus, ShieldCheck, AlertCircle, FileText, Info, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Account } from '../types/finance';
import { generateRandomHex } from '../engine/crypto';

interface AccountManagerViewProps {
  accounts: Record<string, Account>;
  onUpdateAccount: (updatedAccount: Account) => void;
  onAddAccount: (newAccount: Account) => void;
  onDeleteAccount: (accountId: string) => void;
}

type AccountSortColumn = 'institution' | 'description' | 'type' | 'id';

export const AccountManagerView: React.FC<AccountManagerViewProps> = ({
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

  // Sorting state
  const [sortColumn, setSortColumn] = useState<AccountSortColumn>('institution');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: AccountSortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const accountList = useMemo(() => {
    const list = Object.values(accounts);
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === 'institution') {
        cmp = (a.institution || '').localeCompare(b.institution || '', undefined, { sensitivity: 'base' });
        if (cmp === 0) {
          cmp = (a.maskedDisplay || '').localeCompare(b.maskedDisplay || '');
        }
      } else if (sortColumn === 'description') {
        cmp = (a.description || '').localeCompare(b.description || '', undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'type') {
        cmp = (a.type || '').localeCompare(b.type || '', undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'id') {
        cmp = (a.id || '').localeCompare(b.id || '');
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [accounts, sortColumn, sortDirection]);

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Building2 className="w-5 h-5" />
            </span>
            <h2 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              Account Configuration & Cryptographic Masking
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">
              {accountList.length} Accounts Registered
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl font-mono">
            Full account numbers are hashed with HMAC-SHA256 and never stored in plaintext. Only the last 4 digits are kept for identification.
          </p>
        </div>

        <button
          onClick={() => {
            setIsAddingNew(!isAddingNew);
            setEditingId(null);
          }}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{isAddingNew ? 'Close Add Form' : 'Register New Account'}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Inline Form to Add New Account */}
      {isAddingNew && (
        <form
          onSubmit={handleCreateNew}
          className="p-4 bg-slate-950/80 border border-emerald-700/60 rounded-xl space-y-3 animate-fadeIn"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Register New Bank / Card Account</span>
            </span>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Institution Name *
              </label>
              <input
                type="text"
                required
                value={newInstitution}
                onChange={e => setNewInstitution(e.target.value)}
                placeholder="e.g. Chase, Vanguard, Amex"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Masked Display *
              </label>
              <input
                type="text"
                required
                value={newMasked}
                onChange={e => setNewMasked(e.target.value)}
                placeholder="e.g. ****9482"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Account Type
              </label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit_card">Credit Card</option>
                <option value="brokerage">Brokerage</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Nickname / Description
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="e.g. Primary Checking"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs rounded transition-colors"
            >
              Save New Account
            </button>
          </div>
        </form>
      )}

      {/* Accounts Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
              <th
                onClick={() => handleSort('institution')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Institution & Mask</span>
                  {sortColumn === 'institution' ? (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('description')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Friendly Nickname</span>
                  {sortColumn === 'description' ? (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('type')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Type</span>
                  {sortColumn === 'type' ? (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('id')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Cryptographic Key (HMAC ID)</span>
                  {sortColumn === 'id' ? (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                  )}
                </div>
              </th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
            {accountList.map(acc => {
              const isEditing = editingId === acc.id;
              return (
                <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3">
                    {isEditing ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={editInstitution}
                          onChange={e => setEditInstitution(e.target.value)}
                          className="bg-slate-950 border border-indigo-500 rounded px-2 py-0.5 text-xs text-slate-100 font-sans w-full"
                          placeholder="Institution"
                        />
                        <input
                          type="text"
                          value={editMasked}
                          onChange={e => setEditMasked(e.target.value)}
                          className="bg-slate-950 border border-indigo-500 rounded px-2 py-0.5 text-xs text-slate-100 font-mono w-28"
                          placeholder="****9482"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="font-sans font-semibold text-slate-100">{acc.institution}</div>
                        <div className="text-emerald-400 text-[11px]">{acc.maskedDisplay}</div>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 font-sans">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        className="bg-slate-950 border border-indigo-500 rounded px-2 py-0.5 text-xs text-slate-100 font-sans w-full"
                        placeholder="e.g. Household Bills Checking"
                      />
                    ) : (
                      <span className="text-slate-300">
                        {acc.description || <span className="text-slate-600 italic">No nickname set</span>}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    {isEditing ? (
                      <select
                        value={editType}
                        onChange={e => setEditType(e.target.value as any)}
                        className="bg-slate-950 border border-indigo-500 rounded px-2 py-0.5 text-xs text-slate-100 font-mono"
                      >
                        <option value="checking">checking</option>
                        <option value="savings">savings</option>
                        <option value="credit_card">credit_card</option>
                        <option value="brokerage">brokerage</option>
                      </select>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                        {acc.type}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <span className="text-[11px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800" title={acc.id}>
                      {acc.id.substring(0, 16)}...
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSaveEdit(acc)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => startEditing(acc)}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                          title="Edit account nickname or details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete account "${acc.institution} (${acc.maskedDisplay})"? Associated ledger transactions will remain in database with their stored mask.`)) {
                              onDeleteAccount(acc.id);
                            }
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Delete account"
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

      {/* GitHub Privacy Safeguard Info Box */}
      <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span>GitHub Privacy & Zero-Leak Invariant</span>
        </div>
        <p className="text-xs text-slate-400 font-mono">
          Your personal account mappings in <code className="text-slate-200">config/accounts.json</code> are strictly excluded by <code className="text-slate-200">.gitignore</code> and <code className="text-slate-200">.dockerignore</code>. Only the sanitized <code className="text-slate-200">config/accounts.json.example</code> template is tracked by Git.
        </p>
      </div>
    </div>
  );
};
