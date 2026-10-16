/**
 * Dependency-free native OFX/QFX Streaming Lexer
 * Handles both OFX 1.x (unclosed SGML tags like <TRNAMT>-42.50) and OFX 2.x (strict XML)
 * Ports the Go parser from main.go directly.
 */

export interface ParsedOFXTransaction {
  fitid: string;
  datePosted: string; // ISO YYYY-MM-DD
  amountCents: number; // Signed integer cents (-4250)
  rawPayee: string;
}

export interface ParsedOFXStatement {
  rawAcctId: string;
  institution: string;
  acctType: 'credit_card' | 'checking' | 'brokerage' | 'savings';
  currency: string;
  transactions: ParsedOFXTransaction[];
}

export function parseOFX(rawText: string): ParsedOFXStatement {
  let institution = 'Unknown Institution';
  let acctType: 'credit_card' | 'checking' | 'brokerage' | 'savings' = 'checking';
  let currency = 'USD';

  if (rawText.includes('<CREDITCARDMSGSRSV1>') || rawText.includes('<CCSTMTRS>')) {
    acctType = 'credit_card';
  }

  const org = extractTag(rawText, 'ORG');
  if (org) institution = org;

  const cur = extractTag(rawText, 'CURDEF');
  if (cur) currency = cur;

  const typeTag = extractTag(rawText, 'ACCTTYPE');
  if (typeTag && acctType !== 'credit_card') {
    const l = typeTag.toLowerCase();
    if (l.includes('save') || l.includes('savings')) acctType = 'savings';
    else if (l.includes('invest') || l.includes('broker')) acctType = 'brokerage';
    else acctType = 'checking';
  }

  const rawAcctId = extractTag(rawText, 'ACCTID') || 'DEFAULT_ACCOUNT';

  const transactions: ParsedOFXTransaction[] = [];
  const openTag = '<STMTTRN>';
  const closeTag = '</STMTTRN>';

  let searchIdx = 0;
  while (searchIdx < rawText.length) {
    const startIdx = rawText.indexOf(openTag, searchIdx);
    if (startIdx === -1) break;

    const blockStart = startIdx + openTag.length;
    let endIdx = rawText.indexOf(closeTag, blockStart);

    let trnBlock = '';
    if (endIdx !== -1) {
      trnBlock = rawText.substring(blockStart, endIdx);
      searchIdx = endIdx + closeTag.length;
    } else {
      // Fallback for SGML without closing tag
      const nextStart = rawText.indexOf(openTag, blockStart);
      const endList = rawText.indexOf('</BANKTRANLIST>', blockStart);
      if (nextStart !== -1) {
        trnBlock = rawText.substring(blockStart, nextStart);
        searchIdx = nextStart;
      } else if (endList !== -1) {
        trnBlock = rawText.substring(blockStart, endList);
        searchIdx = endList;
      } else {
        trnBlock = rawText.substring(blockStart);
        searchIdx = rawText.length;
      }
    }

    const fitid = extractTag(trnBlock, 'FITID');
    const dtPosted = extractTag(trnBlock, 'DTPOSTED');
    const trnAmtStr = extractTag(trnBlock, 'TRNAMT');
    const nameStr = extractTag(trnBlock, 'NAME');
    const memoStr = extractTag(trnBlock, 'MEMO');

    if (!fitid || !trnAmtStr) continue;

    const cents = parseAmountToCents(trnAmtStr);
    const isoDate = normalizeOFXDate(dtPosted);

    let rawPayee = (nameStr || '').trim();
    if (memoStr && memoStr.trim().toLowerCase() !== rawPayee.toLowerCase()) {
      if (rawPayee) {
        rawPayee = `${rawPayee} ${memoStr.trim()}`;
      } else {
        rawPayee = memoStr.trim();
      }
    }
    // Collapse excess spaces
    rawPayee = rawPayee.replace(/\s+/g, ' ').trim() || 'UNKNOWN PAYEE';

    transactions.push({
      fitid,
      datePosted: isoDate,
      amountCents: cents,
      rawPayee,
    });
  }

  if (transactions.length === 0) {
    throw new Error('No valid <STMTTRN> transaction records found in statement payload.');
  }

  return {
    rawAcctId,
    institution,
    acctType,
    currency,
    transactions,
  };
}

function extractTag(text: string, tag: string): string | null {
  const openTag = `<${tag}>`;
  const idx = text.indexOf(openTag);
  if (idx === -1) return null;

  const valStart = idx + openTag.length;
  let end = text.length;

  for (let i = valStart; i < text.length; i++) {
    const c = text[i];
    if (c === '<' || c === '\r' || c === '\n') {
      end = i;
      break;
    }
  }

  return text.substring(valStart, end).trim();
}

export function parseAmountToCents(amtStr: string): number {
  const clean = amtStr.replace(/,/g, '').trim();
  if (!clean) return 0;

  let negative = false;
  let s = clean;
  if (s.startsWith('-')) {
    negative = true;
    s = s.substring(1);
  } else if (s.startsWith('+')) {
    s = s.substring(1);
  }

  const parts = s.split('.');
  const dollars = parseInt(parts[0] || '0', 10);
  let cents = 0;
  if (parts.length > 1) {
    let frac = parts[1];
    if (frac.length === 1) frac += '0';
    else if (frac.length > 2) frac = frac.substring(0, 2);
    cents = parseInt(frac, 10);
  }

  const total = dollars * 100 + cents;
  return negative ? -total : total;
}

export function normalizeOFXDate(raw: string | null): string {
  if (!raw) return new Date().toISOString().split('T')[0];
  const s = raw.trim();
  if (s.length >= 8) {
    const y = s.substring(0, 4);
    const m = s.substring(4, 6);
    const d = s.substring(6, 8);
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().split('T')[0];
}
