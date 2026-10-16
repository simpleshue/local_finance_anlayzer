import { Account, Rule, Transaction } from '../types/finance';

import rulesData from '../../config/rules.json';

export const STARTER_RULES: Rule[] = (rulesData as any[]).map(r => ({
  id: r.id,
  pattern: r.pattern,
  category: r.category,
  cleanPayee: r.clean_payee || r.cleanPayee,
  createdAt: r.created_at || '2026-10-01T00:00:00Z',
}));


export const INITIAL_ACCOUNT: Account = {
  id: 'a89f92e9482b6c11',
  maskedDisplay: '****9482',
  institution: 'Chase Sapphire Preferred',
  type: 'credit_card',
  currency: 'USD',
  createdAt: '2026-10-01T00:00:00Z',
};

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'a89f92e9482b6c11:202610140001',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-14',
    amountCents: -675,
    rawPayee: 'TST* BLUE BOTTLE COFFEE #12 SAN FRANCISCO CA',
    cleanPayee: 'Blue Bottle Coffee',
    category: 'Dining',
    confidenceScore: 1.0,
    needsReview: false,
    categorizationTier: 'regex',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-14T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610120002',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-12',
    amountCents: -14280,
    rawPayee: "TRADER JOE'S #104 SAN FRANCISCO CA",
    cleanPayee: "Trader Joe's",
    category: 'Groceries',
    confidenceScore: 1.0,
    needsReview: false,
    categorizationTier: 'regex',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-12T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610110003',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-11',
    amountCents: -3850,
    rawPayee: 'SQ *TARTINE BAKERY SAN FRANCISCO CA',
    cleanPayee: 'Tartine Bakery',
    category: 'Dining',
    confidenceScore: 0.72,
    needsReview: true, // Flagged for triage!
    categorizationTier: 'local_llm',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-11T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610100004',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-10',
    amountCents: -8500,
    rawPayee: 'VENMO*PAYMENT 883920192 TO JOHN',
    cleanPayee: 'Venmo Payment',
    category: 'Uncategorized',
    confidenceScore: 0.35,
    needsReview: true, // Flagged for triage!
    categorizationTier: 'local_llm',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-10T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610090005',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-09',
    amountCents: -2499,
    rawPayee: 'CVS/PHARMACY #04921 SAN FRANCISCO',
    cleanPayee: 'Cvs Pharmacy',
    category: 'Healthcare',
    confidenceScore: 0.78,
    needsReview: true, // Flagged for triage!
    categorizationTier: 'local_llm',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-09T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610070006',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-07',
    amountCents: -1420,
    rawPayee: 'SQ *TARTINE BAKERY OAKLAND CA',
    cleanPayee: 'Tartine Bakery',
    category: 'Dining',
    confidenceScore: 0.72,
    needsReview: true, // Flagged for triage!
    categorizationTier: 'local_llm',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-07T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610060010',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-06',
    amountCents: -12500,
    rawPayee: 'LITTLE LEAGUE BASEBALL REGISTRATION',
    cleanPayee: 'Youth Sports League',
    category: 'Childcare:Sports',
    confidenceScore: 1.0,
    needsReview: false,
    categorizationTier: 'regex',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610050007',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-05',
    amountCents: -7999,
    rawPayee: 'COMCAST XFINITY CABLE 849204910',
    cleanPayee: 'Comcast Xfinity',
    category: 'Utilities',
    confidenceScore: 1.0,
    needsReview: false,
    categorizationTier: 'regex',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-05T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610030008',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-03',
    amountCents: -6412,
    rawPayee: 'SHELL OIL 574429102 SAN JOSE CA',
    cleanPayee: 'Shell Oil',
    category: 'Transportation:Fuel',
    confidenceScore: 1.0,
    needsReview: false,
    categorizationTier: 'regex',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-03T10:00:00Z',
  },
  {
    id: 'a89f92e9482b6c11:202610010009',
    accountId: 'a89f92e9482b6c11',
    accountMasked: '****9482',
    transactionDate: '2026-10-01',
    amountCents: -11900,
    rawPayee: 'ACME HARDWARE SUPPLY #09',
    cleanPayee: 'Acme Hardware Supply',
    category: 'Housing:Maintenance',
    confidenceScore: 1.0,
    needsReview: false,
    categorizationTier: 'regex',
    userVerified: false,
    sourceFileHash: 'c7f991e204b',
    importedAt: '2026-10-01T10:00:00Z',
  },
];

// Sample OFX Files for testing
export const SAMPLE_CHASE_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE
<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20261015120000.000[-7:PDT]
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1>
<CCSTMTRS>
<CURDEF>USD
<CCACCTFROM>
<ACCTID>4111222233339482
</CCACCTFROM>
<BANKTRANLIST>
<DTSTART>20260915120000
<DTEND>20261015120000
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261014120000
<TRNAMT>-6.75
<FITID>202610140001
<NAME>TST* BLUE BOTTLE COFFEE #12 SAN FRANCISCO CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012120000
<TRNAMT>-142.80
<FITID>202610120002
<NAME>TRADER JOE'S #104 SAN FRANCISCO CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261011120000
<TRNAMT>-38.50
<FITID>202610110003
<NAME>SQ *TARTINE BAKERY SAN FRANCISCO CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261010120000
<TRNAMT>-85.00
<FITID>202610100004
<NAME>VENMO*PAYMENT 883920192 TO JOHN
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261009120000
<TRNAMT>-24.99
<FITID>202610090005
<NAME>CVS/PHARMACY #04921 SAN FRANCISCO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261007120000
<TRNAMT>-14.20
<FITID>202610070006
<NAME>SQ *TARTINE BAKERY OAKLAND CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261005120000
<TRNAMT>-79.99
<FITID>202610050007
<NAME>COMCAST XFINITY CABLE 849204910
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261003120000
<TRNAMT>-64.12
<FITID>202610030008
<NAME>SHELL OIL 574429102 SAN JOSE CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261001120000
<TRNAMT>-119.00
<FITID>202610010009
<NAME>ACME HARDWARE SUPPLY #09
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>-575.35
<DTASOF>20261015120000
</LEDGERBAL>
</CCSTMTRS>
</CREDITCARDMSGSRSV1>
</OFX>`;

// Overlapping statement: contains 6 duplicates + 3 new transactions
export const SAMPLE_OVERLAPPING_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<CREDITCARDMSGSRSV1>
<CCSTMTRS>
<CURDEF>USD
<CCACCTFROM>
<ACCTID>4111222233339482
</CCACCTFROM>
<BANKTRANLIST>
<!-- DUPLICATES: Already in database (should be skipped deterministically without mutating historical edits) -->
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261014120000
<TRNAMT>-6.75
<FITID>202610140001
<NAME>TST* BLUE BOTTLE COFFEE #12 SAN FRANCISCO CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012120000
<TRNAMT>-142.80
<FITID>202610120002
<NAME>TRADER JOE'S #104 SAN FRANCISCO CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261011120000
<TRNAMT>-38.50
<FITID>202610110003
<NAME>SQ *TARTINE BAKERY SAN FRANCISCO CA
</STMTTRN>
<!-- NEW TRANSACTIONS -->
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015143000
<TRNAMT>-18.50
<FITID>202610150010
<NAME>UBER *TRIP 98402 SAN FRANCISCO CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015160000
<TRNAMT>-15.99
<FITID>202610150011
<NAME>NETFLIX.COM 888-492-1029 CA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261015090000
<TRNAMT>575.35
<FITID>202610150012
<NAME>AUTOMATIC PAYMENT - THANK YOU
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CREDITCARDMSGSRSV1>
</OFX>`;

// Vanguard Checking / Investment statement
export const SAMPLE_CHECKING_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>121000358
<ACCTID>987654321098
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261001080000
<TRNAMT>3850.00
<FITID>CHK2026100101
<NAME>PAYROLL DIRECT DEP ACME CORP
<MEMO>BI-WEEKLY SALARY
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261002090000
<TRNAMT>-1850.00
<FITID>CHK2026100202
<NAME>PROPERTY MANAGEMENT RENT ACH
<MEMO>OCTOBER 2026 RENT
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261004113000
<TRNAMT>-112.40
<FITID>CHK2026100403
<NAME>PG&E UTILITY BILL WEB PYMT
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261008140000
<TRNAMT>-575.35
<FITID>CHK2026100804
<NAME>AUTOPAY CHASE CREDIT CARD
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
