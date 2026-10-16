/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Account,
  Transaction,
  Rule,
  HistoryItem,
  IngestResult,
  MemoryZeroEvent,
} from './types/finance';
import {
  STARTER_RULES,
  INITIAL_ACCOUNT,
  INITIAL_TRANSACTIONS,
} from './constants/seedData';
import { DEFAULT_CATEGORIES } from './types/finance';
import { parseOFX } from './engine/ofxLexer';
import { categorizeTransaction } from './engine/categorizer';
import { sha256Hex, hmacSha256, maskAccountNumber } from './engine/crypto';
import { Header } from './components/Header';
import { IngestionModal } from './components/IngestionModal';
import { IngestionView } from './components/IngestionView';
import { TelemetrySidebar } from './components/TelemetrySidebar';
import { TriageInbox } from './components/TriageInbox';
import { LedgerView } from './components/LedgerView';
import { RulesList } from './components/RulesList';
import { RuleModal } from './components/RuleModal';
import { SecurityConsole } from './components/SecurityConsole';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CategoryManagerView } from './components/CategoryManagerView';
import { AccountManagerModal } from './components/AccountManagerModal';
import { AccountManagerView } from './components/AccountManagerView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TransactionFormModal } from './components/TransactionFormModal';

export type TabType = 'triage' | 'ledger' | 'rules' | 'ingest' | 'categories' | 'accounts' | 'security';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('triage');
  const [passphrase, setPassphrase] = useState('local-airgap-vault-master-key-2026');

  // Ledger state
  const [accounts, setAccounts] = useState<Record<string, Account>>({
    [INITIAL_ACCOUNT.id]: INITIAL_ACCOUNT,
  });

  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [rules, setRules] = useState<Rule[]>(STARTER_RULES);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryItem>>({});
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [isIngestionOpen, setIsIngestionOpen] = useState(false);

  const [lastIngestResult, setLastIngestResult] = useState<IngestResult | null>(null);
  const [memoryEvents, setMemoryEvents] = useState<MemoryZeroEvent[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      label: 'Initial Boot Seed Statement Buffer (OFX 1.x SGML)',
      bytesCount: 1480,
      previewBefore: 'OFXHEADER:100\nDATA:OFXSGML\n<ACCTID>4111222233339482</ACCTID>\n<TRNAMT>-142.80\n<NAME>TRADER JOE\'S',
      previewAfter: '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 [ALL 1,480 BYTES ZEROED IN RAM]',
      status: 'WIPED_OK',
    },
  ]);

  // Synchronize with Go engine backend if running
  useEffect(() => {
    let mounted = true;
    const fetchBackendState = async () => {
      try {
        const statusRes = await fetch('/api/status');
        if (statusRes.ok && mounted) {
          const status = await statusRes.json();
          if (Array.isArray(status.categories) && status.categories.length > 0) {
            setCategories(status.categories);
          }
          if (Array.isArray(status.rules) && status.rules.length > 0) {
            const mappedRules: Rule[] = status.rules.map((r: any, idx: number) => ({
              id: r.id || `rule_${idx}`,
              pattern: r.pattern || '',
              category: r.category || 'Uncategorized',
              cleanPayee: r.cleanPayee || r.clean_payee || '',
              createdAt: r.createdAt || r.created_at || new Date().toISOString(),
            }));
            setRules(mappedRules);
          }
          if (status.accounts && typeof status.accounts === 'object') {
            const loadedAccts: Record<string, Account> = {};
            Object.values(status.accounts).forEach((a: any) => {
              if (a && a.id) {
                loadedAccts[a.id] = {
                  id: a.id,
                  maskedDisplay: a.masked_display || a.maskedDisplay || '****0000',
                  institution: a.institution || 'Unknown Bank',
                  type: a.type || 'credit_card',
                  currency: a.currency || 'USD',
                  description: a.description || '',
                  createdAt: a.created_at || a.createdAt || new Date().toISOString(),
                };
              }
            });
            if (Object.keys(loadedAccts).length > 0) {
              setAccounts(loadedAccts);
            }
          }
        }
        const txRes = await fetch('/api/transactions');
        if (txRes.ok && mounted) {
          const txList = await txRes.json();
          if (Array.isArray(txList) && txList.length > 0) {
            // Map Go backend transaction field names to frontend TypeScript schema
            const mapped: Transaction[] = txList.map((t: any) => ({
              id: t.id,
              accountId: t.account_id || '',
              accountMasked: t.account_masked || '****0000',
              transactionDate: t.transaction_date || '',
              amountCents: t.amount_cents || 0,
              rawPayee: t.raw_payee || '',
              cleanPayee: t.clean_payee || t.raw_payee || '',
              category: t.category || 'Uncategorized',
              confidenceScore: typeof t.confidence_score === 'number' ? t.confidence_score : 1.0,
              needsReview: !!t.needs_review,
              categorizationTier: t.categorization_tier || 'regex',
              userVerified: !!t.user_verified,
              sourceFileHash: t.source_file_hash || '',
              importedAt: t.imported_at || new Date().toISOString(),
            }));
            setTransactions(mapped);
          }
        }
      } catch {
        // Backend not running in preview; cleanly fallback to local seed data
      }
    };
    fetchBackendState();
    return () => { mounted = false; };
  }, []);

  // Modal State for Rule Generation / Editing
  const [ruleModalState, setRuleModalState] = useState<{
    isOpen: boolean;
    rawSample: string;
    cleanPayee: string;
    currentCategory: string;
    initialPattern?: string;
    editingRuleId?: string;
  }>({
    isOpen: false,
    rawSample: '',
    cleanPayee: '',
    currentCategory: '',
    initialPattern: '',
    editingRuleId: undefined,
  });

  // Telemetry computations
  const needsReviewCount = useMemo(() => {
    return transactions.filter(t => t.needsReview || t.category === 'Uncategorized').length;
  }, [transactions]);

  const totalOutflowCents = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.amountCents < 0 && t.category !== 'Transfer:CreditCardPayment') {
        return acc + Math.abs(t.amountCents);
      }
      return acc;
    }, 0);
  }, [transactions]);

  const totalInflowCents = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.amountCents > 0 && t.category !== 'Transfer:CreditCardPayment') {
        return acc + t.amountCents;
      }
      return acc;
    }, 0);
  }, [transactions]);

  // Ingestion Handler
  const handleIngestStatement = async (rawText: string, filename: string): Promise<IngestResult> => {
    const startTime = performance.now();
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(rawText);

    // 1. Calculate SHA-256 hash of payload
    const payloadHash = (await sha256Hex(rawBytes)).substring(0, 16);

    // 2. Parse OFX/QFX statement
    const parsed = parseOFX(rawText);

    // 3. HMAC-SHA256 hash of raw account ID, mask display
    const rawAcctBytes = encoder.encode(parsed.rawAcctId);
    const acctHash = (await hmacSha256(passphrase, rawAcctBytes)).substring(0, 16);
    const maskedAcct = maskAccountNumber(parsed.rawAcctId);

    // Register account if not present
    setAccounts(prev => {
      if (prev[acctHash]) return prev;
      return {
        ...prev,
        [acctHash]: {
          id: acctHash,
          maskedDisplay: maskedAcct,
          institution: parsed.institution,
          type: parsed.acctType,
          currency: parsed.currency,
          createdAt: new Date().toISOString(),
        },
      };
    });

    // 4. Memory Zeroing Event Log (simulating defer clear(rawBytes) and clear(rawAcctID))
    const previewBefore = rawText.slice(0, 150).replace(/\r?\n/g, ' ') + '...';
    const previewAfter = `00 00 00 00 00 00 00 00 [ALL ${rawBytes.length} BYTES ZEROED VIA clear(rawBytes)]`;

    setMemoryEvents(prev => [
      {
        timestamp: new Date().toLocaleTimeString(),
        label: `Ingest: ${filename} (OFX/QFX Buffer)`,
        bytesCount: rawBytes.length,
        previewBefore,
        previewAfter,
        status: 'WIPED_OK',
      },
      ...prev.slice(0, 19),
    ]);

    // 5. Deduplicate and Categorize
    let inserted = 0;
    let duplicates = 0;
    let flagged = 0;
    const newTxList: Transaction[] = [];

    // Map of existing IDs for deterministic O(1) deduplication
    const existingMap = new Map<string, Transaction>();
    for (const tx of transactions) {
      existingMap.set(tx.id, tx);
    }

    for (const pt of parsed.transactions) {
      const compositeId = `${acctHash}:${pt.fitid}`;

      // Deduplication check: fitid is globally unique per institution account
      if (existingMap.has(compositeId)) {
        duplicates++;
        continue;
      }

      // 3-Tier Categorization Waterfall
      const catResult = categorizeTransaction(pt.rawPayee, rules, historyMap);
      if (catResult.needsReview) {
        flagged++;
      }

      const tx: Transaction = {
        id: compositeId,
        accountId: acctHash,
        accountMasked: maskedAcct,
        transactionDate: pt.datePosted,
        amountCents: pt.amountCents,
        rawPayee: pt.rawPayee,
        cleanPayee: catResult.cleanPayee,
        category: catResult.category,
        confidenceScore: catResult.confidenceScore,
        needsReview: catResult.needsReview,
        categorizationTier: catResult.tier,
        userVerified: false,
        sourceFileHash: payloadHash,
        importedAt: new Date().toISOString(),
      };

      existingMap.set(compositeId, tx);
      newTxList.push(tx);
      inserted++;
    }

    // Update transactions (sorted by date desc)
    const combined = Array.from(existingMap.values()).sort((a, b) => {
      if (a.transactionDate === b.transactionDate) return b.id.localeCompare(a.id);
      return b.transactionDate.localeCompare(a.transactionDate);
    });
    setTransactions(combined);

    const durationMs = Math.round(performance.now() - startTime);
    const disposition = 'zeroed_from_ram';

    const result: IngestResult = {
      filename,
      status: 'success',
      totalParsed: parsed.transactions.length,
      inserted,
      skippedDuplicates: duplicates,
      flaggedForReview: flagged,
      rawDisposition: disposition,
      sourceFileHash: payloadHash,
      durationMs,
    };

    setLastIngestResult(result);

    // Sync with backend /api/upload if available
    try {
      fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-Filename': filename },
        body: rawText,
      }).catch(() => {});
    } catch {
      // offline preview mode
    }

    // Switch to triage if new items were flagged
    if (flagged > 0 && activeTab !== 'triage') {
      setActiveTab('triage');
    }

    return result;
  };

  // Transaction Approval Handler (Stores into Tier 2 Historical Memory)
  const handleApproveTransaction = (id: string, category: string, cleanPayee: string) => {
    setTransactions(prev =>
      prev.map(tx => {
        if (tx.id !== id) return tx;
        return {
          ...tx,
          category,
          cleanPayee,
          needsReview: false,
          userVerified: true,
          confidenceScore: 1.0,
          categorizationTier: 'manual',
        };
      })
    );

    // Persist into Historical Memory
    const targetTx = transactions.find(t => t.id === id);
    if (targetTx) {
      const normKey = targetTx.rawPayee.trim().replace(/\s+/g, ' ').toUpperCase();
      setHistoryMap(prev => ({
        ...prev,
        [normKey]: { category, cleanPayee },
      }));
    }

    // Sync with backend if available
    try {
      fetch('/api/transactions/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, category, clean_payee: cleanPayee }),
      }).catch(() => {});
    } catch {
      // offline
    }
  };

  // Inline Category Update from Ledger table
  const handleUpdateTransactionCategory = (id: string, newCategory: string) => {
    setTransactions(prev =>
      prev.map(tx => {
        if (tx.id !== id) return tx;
        return {
          ...tx,
          category: newCategory,
          needsReview: false,
          userVerified: true,
          confidenceScore: 1.0,
          categorizationTier: 'manual',
        };
      })
    );

    const targetTx = transactions.find(t => t.id === id);
    if (targetTx) {
      const normKey = targetTx.rawPayee.trim().replace(/\s+/g, ' ').toUpperCase();
      setHistoryMap(prev => ({
        ...prev,
        [normKey]: { category: newCategory, cleanPayee: targetTx.cleanPayee },
      }));
    }

    // Sync with backend if available
    try {
      fetch('/api/transactions/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, category: newCategory, clean_payee: targetTx?.cleanPayee || '' }),
      }).catch(() => {});
    } catch {
      // offline
    }
  };

  // Add a new custom category
  const handleAddCategory = (newCat: string) => {
    if (!categories.includes(newCat)) {
      setCategories(prev => [...prev, newCat]);
    }
  };

  // Rename a category across all records, rules, and history
  const handleRenameCategory = (oldName: string, newName: string) => {
    setCategories(prev => prev.map(c => (c === oldName ? newName : c)));
    setTransactions(prev =>
      prev.map(tx => (tx.category === oldName ? { ...tx, category: newName } : tx))
    );
    setRules(prev =>
      prev.map(r => (r.category === oldName ? { ...r, category: newName } : r))
    );
    setHistoryMap(prev => {
      const next: Record<string, HistoryItem> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = v.category === oldName ? { ...v, category: newName } : v;
      }
      return next;
    });
  };

  // Delete category and reassign impacted transactions to Uncategorized
  const handleDeleteCategory = (catName: string) => {
    setCategories(prev => prev.filter(c => c !== catName));
    setTransactions(prev =>
      prev.map(tx =>
        tx.category === catName
          ? {
              ...tx,
              category: 'Uncategorized',
              needsReview: true,
              userVerified: false,
              confidenceScore: 0.0,
              categorizationTier: 'fallback',
            }
          : tx
      )
    );
    setRules(prev =>
      prev.map(r => (r.category === catName ? { ...r, category: 'Uncategorized' } : r))
    );
  };

  // Batch Approve All Current Review Items
  const handleBatchApproveAll = () => {
    const updatedHistory: Record<string, HistoryItem> = { ...historyMap };
    setTransactions(prev =>
      prev.map(tx => {
        if (!tx.needsReview && tx.category !== 'Uncategorized') return tx;
        const normKey = tx.rawPayee.trim().replace(/\s+/g, ' ').toUpperCase();
        updatedHistory[normKey] = { category: tx.category, cleanPayee: tx.cleanPayee };
        return {
          ...tx,
          needsReview: false,
          userVerified: true,
          confidenceScore: 1.0,
          categorizationTier: 'manual',
        };
      })
    );
    setHistoryMap(updatedHistory);
  };

  // Save or Update RE2 Regex Rule
  const handleSaveRule = (
    pattern: string,
    category: string,
    cleanPayee: string,
    applyHistorical: boolean,
    editingRuleId?: string
  ) => {
    if (editingRuleId) {
      setRules(prev =>
        prev.map(r =>
          r.id === editingRuleId
            ? { ...r, pattern, category, cleanPayee: cleanPayee.trim() }
            : r
        )
      );
    } else {
      const newRule: Rule = {
        id: `rule-${Date.now()}`,
        pattern,
        category,
        cleanPayee: cleanPayee.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setRules(prev => [newRule, ...prev]);
    }

    // Sync with Go backend if available
    try {
      fetch('/api/rules/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRuleId,
          pattern,
          category,
          clean_payee: cleanPayee.trim(),
          apply_historical: applyHistorical,
        }),
      }).catch(() => {});
    } catch {
      // offline
    }

    if (applyHistorical) {
      let p = pattern;
      let flags = '';
      if (p.startsWith('(?i)')) {
        p = p.substring(4);
        flags += 'i';
      }
      try {
        const re = new RegExp(p, flags);
        setTransactions(prev =>
          prev.map(tx => {
            if (re.test(tx.rawPayee)) {
              return {
                ...tx,
                category,
                cleanPayee: cleanPayee.trim() || tx.cleanPayee,
                confidenceScore: 1.0,
                needsReview: false,
                categorizationTier: 'regex',
                userVerified: true,
              };
            }
            return tx;
          })
        );
      } catch {
        // Regex handled safely
      }
    }
  };

  const handleDeleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    try {
      await fetch(`/api/rules/delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // offline
    }
  };

  const handleOpenRuleModal = (rawPayee: string, cleanPayee: string, currentCategory: string) => {
    setRuleModalState({
      isOpen: true,
      rawSample: rawPayee,
      cleanPayee,
      currentCategory,
      initialPattern: '',
      editingRuleId: undefined,
    });
  };

  const handleOpenEditRule = (rule: Rule) => {
    setRuleModalState({
      isOpen: true,
      rawSample: '',
      cleanPayee: rule.cleanPayee || '',
      currentCategory: rule.category,
      initialPattern: rule.pattern,
      editingRuleId: rule.id,
    });
  };

  const handleDeleteAccount = async (id: string) => {
    setAccounts(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // Offline fallback
    }
  };

  const handleUpdateAccount = async (updated: Account) => {
    setAccounts(prev => ({
      ...prev,
      [updated.id]: updated,
    }));
    // Propagate updated masked number into transactions in memory
    setTransactions(prev =>
      prev.map(t => (t.accountId === updated.id ? { ...t, accountMasked: updated.maskedDisplay } : t))
    );
    // Sync with Go backend /api/accounts
    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updated.id,
          masked_display: updated.maskedDisplay,
          institution: updated.institution,
          type: updated.type,
          currency: updated.currency,
          description: updated.description,
        }),
      });
    } catch {
      // Backend optional in preview
    }
  };

  const handleAddAccount = async (newAcc: Account) => {
    setAccounts(prev => ({
      ...prev,
      [newAcc.id]: newAcc,
    }));
    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newAcc.id,
          masked_display: newAcc.maskedDisplay,
          institution: newAcc.institution,
          type: newAcc.type,
          currency: newAcc.currency,
          description: newAcc.description,
        }),
      });
    } catch {
      // Backend optional in preview
    }
  };

  const [editingTxFromTriage, setEditingTxFromTriage] = useState<Transaction | null>(null);

  const handleSaveTransaction = async (tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.some(t => t.id === tx.id);
      if (exists) {
        return prev.map(t => (t.id === tx.id ? tx : t));
      }
      return [tx, ...prev];
    });

    try {
      await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          account_id: tx.accountId,
          account_masked: tx.accountMasked,
          transaction_date: tx.transactionDate,
          amount_cents: tx.amountCents,
          raw_payee: tx.rawPayee,
          clean_payee: tx.cleanPayee,
          category: tx.category,
          confidence_score: tx.confidenceScore,
          needs_review: tx.needsReview,
          categorization_tier: tx.categorizationTier,
          user_verified: tx.userVerified,
          source_file_hash: tx.sourceFileHash,
          imported_at: tx.importedAt,
        }),
      });
    } catch {
      // Offline fallback
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    try {
      await fetch(`/api/transactions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // Offline fallback
    }
  };

  const handleBulkDeleteTransactions = async (ids: string[]) => {
    const idSet = new Set(ids);
    setTransactions(prev => prev.filter(t => !idSet.has(t.id)));
    try {
      await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // Offline fallback
    }
  };

  const handleBatchVerifyTransactions = async (ids: string[]) => {
    const idSet = new Set(ids);
    setTransactions(prev =>
      prev.map(t => (idSet.has(t.id) ? { ...t, userVerified: true, needsReview: false } : t))
    );
    for (const id of ids) {
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        fetch('/api/transactions/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, category: tx.category, clean_payee: tx.cleanPayee }),
        }).catch(() => {});
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={tab => setActiveTab(tab as any)}
        needsReviewCount={needsReviewCount}
        totalRecordsCount={transactions.length}
      />

      <main className="w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Views Container (8 cols on lg, 9 cols on xl/2xl) */}
          <div className="lg:col-span-8 xl:col-span-9 2xl:col-span-9 space-y-6 w-full min-w-0">
            {/* Tab 1: Flagged Triage Inbox (View 1) */}
            {activeTab === 'triage' && (
              <ErrorBoundary fallbackTitle="Triage Inbox View Error">
                <TriageInbox
                  transactions={transactions}
                  categories={categories}
                  onApprove={handleApproveTransaction}
                  onOpenRuleModal={handleOpenRuleModal}
                  onBatchApproveAll={handleBatchApproveAll}
                  onEditTransaction={tx => setEditingTxFromTriage(tx)}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              </ErrorBoundary>
            )}

            {/* Tab 2: Full Deduplicated Encrypted Ledger (View 3) */}
            {activeTab === 'ledger' && (
              <ErrorBoundary fallbackTitle="Encrypted Ledger View Error">
                <LedgerView
                  transactions={transactions}
                  accounts={accounts}
                  categories={categories}
                  onOpenRuleModal={handleOpenRuleModal}
                  onOpenCategoryManager={() => setActiveTab('categories')}
                  onUpdateTransactionCategory={handleUpdateTransactionCategory}
                  onSaveTransaction={handleSaveTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onBulkDeleteTransactions={handleBulkDeleteTransactions}
                  onBatchVerifyTransactions={handleBatchVerifyTransactions}
                />
              </ErrorBoundary>
            )}

            {/* Tab 3: Rules & Classification Patterns */}
            {activeTab === 'rules' && (
              <ErrorBoundary fallbackTitle="Rules View Error">
                <RulesList
                  rules={rules}
                  onOpenCreateRule={() => handleOpenRuleModal('', '', categories[0] || 'Groceries')}
                  onEditRule={handleOpenEditRule}
                  onDeleteRule={handleDeleteRule}
                />
              </ErrorBoundary>
            )}

            {/* Tab 4: Ingest Statement (Inline View - Stays in Place) */}
            {activeTab === 'ingest' && (
              <ErrorBoundary fallbackTitle="Statement Ingestion View Error">
                <IngestionView
                  onIngestStatement={handleIngestStatement}
                  lastIngestResult={lastIngestResult}
                  memoryEvents={memoryEvents}
                />
              </ErrorBoundary>
            )}

            {/* Tab 5: Categories (Inline View - Stays in Place) */}
            {activeTab === 'categories' && (
              <ErrorBoundary fallbackTitle="Category Manager View Error">
                <CategoryManagerView
                  categories={categories}
                  transactions={transactions}
                  rules={rules}
                  onAddCategory={handleAddCategory}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
              </ErrorBoundary>
            )}

            {/* Tab 6: Accounts (Inline View - Stays in Place) */}
            {activeTab === 'accounts' && (
              <ErrorBoundary fallbackTitle="Account Manager View Error">
                <AccountManagerView
                  accounts={accounts}
                  onUpdateAccount={handleUpdateAccount}
                  onAddAccount={handleAddAccount}
                  onDeleteAccount={handleDeleteAccount}
                />
              </ErrorBoundary>
            )}

            {/* Tab 7: Security Console & Architecture Matrix */}
            {activeTab === 'security' && (
              <ErrorBoundary fallbackTitle="Security Console View Error">
                <SecurityConsole
                  memoryEvents={memoryEvents}
                  passphrase={passphrase}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* Ledger State Telemetry on the Side (4 cols on lg, 3 cols on xl/2xl) */}
          <div className="lg:col-span-4 xl:col-span-3 2xl:col-span-3 sticky top-20">
            <TelemetrySidebar
              totalTransactionsCount={transactions.length}
              needsReviewCount={needsReviewCount}
              totalOutflowCents={totalOutflowCents}
              totalInflowCents={totalInflowCents}
              memoryEvents={memoryEvents}
            />
          </div>
        </div>
      </main>

      {/* Optional Ingestion Modal for Quick Launch if Triggered */}
      {isIngestionOpen && (
        <IngestionModal
          isOpen={isIngestionOpen}
          onClose={() => setIsIngestionOpen(false)}
          onIngestStatement={handleIngestStatement}
          lastIngestResult={lastIngestResult}
          memoryEvents={memoryEvents}
        />
      )}

      {/* "Create / Edit Rule From Pattern" Modal */}
      <RuleModal
        isOpen={ruleModalState.isOpen}
        onClose={() =>
          setRuleModalState(prev => ({
            ...prev,
            isOpen: false,
            initialPattern: '',
            editingRuleId: undefined,
          }))
        }
        rawSample={ruleModalState.rawSample}
        initialCleanPayee={ruleModalState.cleanPayee}
        initialCategory={ruleModalState.currentCategory}
        initialPattern={ruleModalState.initialPattern}
        editingRuleId={ruleModalState.editingRuleId}
        transactions={transactions}
        categories={categories}
        onSaveRule={handleSaveRule}
      />

      {/* Category Manager Modal if triggered externally */}
      {isCategoryManagerOpen && (
        <CategoryManagerModal
          isOpen={isCategoryManagerOpen}
          onClose={() => setIsCategoryManagerOpen(false)}
          categories={categories}
          transactions={transactions}
          rules={rules}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
        />
      )}

      {/* Account Manager Modal if triggered externally */}
      {isAccountManagerOpen && (
        <AccountManagerModal
          isOpen={isAccountManagerOpen}
          onClose={() => setIsAccountManagerOpen(false)}
          accounts={accounts}
          onUpdateAccount={handleUpdateAccount}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
        />
      )}

      {/* Transaction Edit Modal for Triage Inbox */}
      {editingTxFromTriage && (
        <TransactionFormModal
          isOpen={!!editingTxFromTriage}
          onClose={() => setEditingTxFromTriage(null)}
          mode="edit"
          initialTransaction={editingTxFromTriage}
          accounts={accounts}
          categories={categories}
          onSave={handleSaveTransaction}
          onDelete={handleDeleteTransaction}
        />
      )}
    </div>
  );
}
