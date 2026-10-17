import React, { useState, useEffect } from 'react';
import { Transaction, DEFAULT_CATEGORIES } from '../types/finance';
import { generateSuggestedRegex } from '../engine/categorizer';
import { X, Sparkles, Check, AlertCircle, Cpu } from 'lucide-react';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawSample: string;
  initialCleanPayee: string;
  initialCategory: string;
  initialPattern?: string;
  editingRuleId?: string;
  transactions: Transaction[];
  categories?: string[];
  onSaveRule: (pattern: string, category: string, cleanPayee: string, applyHistorical: boolean, editingRuleId?: string) => void;
}

export const RuleModal: React.FC<RuleModalProps> = ({
  isOpen,
  onClose,
  rawSample,
  initialCleanPayee,
  initialCategory,
  initialPattern = '',
  editingRuleId,
  transactions,
  categories = DEFAULT_CATEGORIES,
  onSaveRule,
}) => {
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState(initialCategory || 'Dining:Restaurants');
  const [cleanPayee, setCleanPayee] = useState(initialCleanPayee || '');
  const [applyHistorical, setApplyHistorical] = useState(true);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [matchingSamples, setMatchingSamples] = useState<string[]>([]);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      let chosenPattern = initialPattern;
      if (!chosenPattern) {
        chosenPattern = rawSample ? generateSuggestedRegex(rawSample) : '(?i)merchant';
      }
      setPattern(chosenPattern);
      setCleanPayee(initialCleanPayee);
      setCategory(initialCategory || 'Dining:Restaurants');
      testPattern(chosenPattern);
    }
  }, [isOpen, rawSample, initialCleanPayee, initialCategory, initialPattern]);

  const testPattern = (pat: string) => {
    if (!pat.trim()) {
      setRegexError('Regex pattern cannot be empty');
      setMatchingSamples([]);
      setMatchCount(0);
      return;
    }

    try {
      let p = pat;
      let flags = '';
      if (p.startsWith('(?i)')) {
        p = p.substring(4);
        flags += 'i';
      }
      const re = new RegExp(p, flags);
      setRegexError(null);

      const matches: string[] = [];
      let count = 0;
      for (const tx of transactions) {
        if (re.test(tx.rawPayee)) {
          count++;
          if (matches.length < 5) {
            matches.push(tx.rawPayee);
          }
        }
      }
      setMatchCount(count);
      setMatchingSamples(matches);
    } catch (err: any) {
      setRegexError(`Invalid RE2 regex: ${err.message}`);
      setMatchingSamples([]);
      setMatchCount(0);
    }
  };

  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPattern(val);
    testPattern(val);
  };

  const handleSave = () => {
    if (regexError || !pattern.trim()) return;
    onSaveRule(pattern, category, cleanPayee, applyHistorical, editingRuleId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Cpu className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                {editingRuleId ? 'Edit Deterministic Regex Rule' : 'Create Deterministic Regex Rule'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Go RE2 Linear-Time O(N) Pattern Matcher (ReDoS immune)
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

        {/* Form Body */}
        <div className="space-y-4">
          {rawSample && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Source Raw Bank Payee Sample
              </label>
              <div className="p-2 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 truncate">
                {rawSample}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Go RE2 Regex Pattern
              </label>
              <span className="text-[10px] text-emerald-400 font-mono">
                (?i) = Case-Insensitive Flag
              </span>
            </div>
            <input
              type="text"
              value={pattern}
              onChange={handlePatternChange}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-emerald-300 focus:outline-none focus:border-emerald-500"
              placeholder="e.g. (?i)tartine\s+bakery"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Assign Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {[...categories]
                  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                  .map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Normalized Display Merchant Name
              </label>
              <input
                type="text"
                value={cleanPayee}
                onChange={e => setCleanPayee(e.target.value)}
                placeholder="e.g. Tartine Bakery"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Live Match Engine Preview */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live Test Against Encrypted Ledger:</span>
              </span>
              {regexError ? (
                <span className="text-rose-400 text-[11px] flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Syntax Error</span>
                </span>
              ) : (
                <span className="text-emerald-400 font-bold">
                  {matchCount} match{matchCount === 1 ? '' : 'es'} found
                </span>
              )}
            </div>

            {regexError ? (
              <div className="text-rose-300 text-[11px]">{regexError}</div>
            ) : matchingSamples.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[10px] text-slate-500">Sample matched transactions:</div>
                <div className="flex flex-wrap gap-1.5">
                  {matchingSamples.map((sample, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px] truncate max-w-full"
                    >
                      {sample}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-[11px]">No transactions in current ledger match this pattern.</div>
            )}
          </div>

          {/* Apply Historical Checkbox */}
          <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyHistorical}
              onChange={e => setApplyHistorical(e.target.checked)}
              className="mt-0.5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <div>
              <span className="font-medium text-slate-200">
                Apply to historical transactions in database
              </span>
              <p className="text-[11px] text-slate-400">
                Instantly reclassifies all existing unverified matching records to{' '}
                <strong className="text-emerald-300">{category}</strong> with 100% confidence.
              </p>
            </div>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 mt-5 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!!regexError || !pattern.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{editingRuleId ? 'Update Rule' : 'Save Rule'} & Reclassify ({matchCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
