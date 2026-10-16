import { HistoryItem, Rule } from '../types/finance';

export interface CategorizationResult {
  category: string;
  cleanPayee: string;
  confidenceScore: number;
  tier: 'regex' | 'history' | 'local_llm' | 'manual' | 'fallback';
  needsReview: boolean;
}

export function cleanMerchantName(raw: string): string {
  let s = raw;
  const prefixes = [
    /^TST\*\s*/i,
    /^SQ\s*\*\s*/i,
    /^SP\s*\*\s*/i,
    /^PAYPAL\s*\*\s*/i,
    /^POS\s+DEBIT\s*/i,
    /^APLPAY\s*/i,
    /^CHECKCARD\s*/i,
  ];

  for (const prefix of prefixes) {
    s = s.replace(prefix, '');
  }

  // Strip trailing store or sequence numbers like "#104" or "STORE 592"
  s = s.replace(/\s+#\d+.*$/, '');
  s = s.replace(/\s+STORE\s+\d+.*$/i, '');
  s = s.replace(/\s+\d{4,}.*$/, ''); // trailing long ids

  s = s.trim();
  if (!s) return raw;

  // Title-case words nicely
  return s
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function categorizeTransaction(
  rawPayee: string,
  rules: Rule[],
  historyMap: Record<string, HistoryItem>
): CategorizationResult {
  const cleaned = cleanMerchantName(rawPayee);

  // Tier 1: Compiled Go RE2 Regex Rules
  for (const rule of rules) {
    try {
      // Go's (?i) flag maps to 'i' in JavaScript RegExp
      let pattern = rule.pattern;
      let flags = '';
      if (pattern.startsWith('(?i)')) {
        pattern = pattern.substring(4);
        flags += 'i';
      }
      const re = new RegExp(pattern, flags);
      if (re.test(rawPayee)) {
        return {
          category: rule.category,
          cleanPayee: rule.cleanPayee || cleaned,
          confidenceScore: 1.0,
          tier: 'regex',
          needsReview: false,
        };
      }
    } catch {
      // Ignore invalid regex in user-defined rules safely
    }
  }

  // Tier 2: Historical Memory Matcher
  const normKey = rawPayee.trim().replace(/\s+/g, ' ').toUpperCase();
  if (historyMap[normKey]) {
    const hist = historyMap[normKey];
    return {
      category: hist.category,
      cleanPayee: hist.cleanPayee || cleaned,
      confidenceScore: 0.95,
      tier: 'history',
      needsReview: false,
    };
  }

  // Tier 3: Ambiguous or Heuristic Local Classifier (<0.85 confidence -> Needs Review!)
  const up = rawPayee.toUpperCase();
  if (up.includes('SQ *') || up.includes('TST*')) {
    return {
      category: 'Dining',
      cleanPayee: cleaned,
      confidenceScore: 0.72,
      tier: 'local_llm',
      needsReview: true, // Low confidence -> Flagged for Triage!
    };
  }

  if (up.includes('VENMO') || up.includes('ZELLE') || up.includes('PAYPAL')) {
    return {
      category: 'Uncategorized',
      cleanPayee: cleaned,
      confidenceScore: 0.35,
      tier: 'local_llm',
      needsReview: true, // Ambiguous peer-to-peer transfer
    };
  }

  if (up.includes('CVS') || up.includes('WALGREENS') || up.includes('PHARMACY')) {
    return {
      category: 'Healthcare',
      cleanPayee: cleaned,
      confidenceScore: 0.78,
      tier: 'local_llm',
      needsReview: true, // Could be healthcare or general shopping
    };
  }

  if (up.includes('AIRBNB') || up.includes('UNITED AIR') || up.includes('DELTA')) {
    return {
      category: 'Travel',
      cleanPayee: cleaned,
      confidenceScore: 0.82,
      tier: 'local_llm',
      needsReview: true,
    };
  }

  // Fallback: Completely Uncategorized
  return {
    category: 'Uncategorized',
    cleanPayee: cleaned,
    confidenceScore: 0.0,
    tier: 'fallback',
    needsReview: true,
  };
}

export function generateSuggestedRegex(rawPayee: string): string {
  let s = rawPayee
    .replace(/^(TST\*|SQ \*|PAYPAL \*|POS DEBIT |APLPAY )/i, '')
    .trim();
  s = s.replace(/\s+#?\d+.*$/, '').trim();
  const tokens = s.split(/\s+/).slice(0, 2);
  if (tokens.length === 0 || !tokens[0]) {
    return '(?i)' + escapeRegex(rawPayee.slice(0, 12));
  }
  return '(?i)' + tokens.map(t => escapeRegex(t)).join('\\s+');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
