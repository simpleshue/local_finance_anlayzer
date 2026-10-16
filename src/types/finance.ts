export interface Account {
  id: string; // HMAC-SHA256 hash
  maskedDisplay: string; // e.g. ****9482
  institution: string;
  type: 'credit_card' | 'checking' | 'brokerage' | 'savings';
  currency: string;
  description?: string;
  createdAt: string;
}

export interface Transaction {
  id: string; // Composite: account_id:fitid
  accountId: string;
  accountMasked: string;
  transactionDate: string; // ISO YYYY-MM-DD
  amountCents: number; // Signed integer (negative = debit)
  rawPayee: string;
  cleanPayee: string;
  category: string;
  confidenceScore: number; // 0.0 to 1.0
  needsReview: boolean;
  categorizationTier: 'regex' | 'history' | 'local_llm' | 'manual' | 'fallback';
  userVerified: boolean;
  sourceFileHash: string;
  importedAt: string;
}

export interface Rule {
  id: string;
  pattern: string; // Go RE2 regex
  category: string;
  cleanPayee?: string;
  createdAt: string;
}

export interface HistoryItem {
  category: string;
  cleanPayee: string;
}

export interface IngestResult {
  filename: string;
  status: 'success' | 'error';
  totalParsed: number;
  inserted: number;
  skippedDuplicates: number;
  flaggedForReview: number;
  rawDisposition: 'zeroed_from_ram';
  sourceFileHash: string;
  durationMs: number;
  error?: string;
}

export interface MemoryZeroEvent {
  timestamp: string;
  label: string;
  bytesCount: number;
  previewBefore: string;
  previewAfter: string;
  status: 'WIPED_OK';
}

import categoriesData from '../../config/categories.json';

export interface CategoryItem {
  id: string;
  name: string;
  parent: string | null;
  description?: string;
}

export const CATEGORIES_CONFIG: CategoryItem[] = categoriesData as CategoryItem[];
export const DEFAULT_CATEGORIES: string[] = categoriesData.map(c => c.name);

