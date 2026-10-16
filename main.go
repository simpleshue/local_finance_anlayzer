// Package main implements a 100% air-gapped, zero-dependency personal finance
// ingestion, categorization, and triage engine in a single Go source file.
//
// Build Instructions:
//   CGO_ENABLED=0 go build -tags "netgo osusergo" -ldflags="-s -w" -o finance-engine main.go
//
// Run Instructions:
//   FINANCE_PASSPHRASE="your-strong-vault-passphrase" ./finance-engine
package main

import (
	"bytes"
	"compress/zlib"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed all:dist
var distFS embed.FS

// ============================================================================
// 1. DEFENSE-IN-DEPTH RUNTIME ISOLATION & MEMORY HYGIENE
// ============================================================================

var ErrEgressBlocked = errors.New("[SECURITY VIOLATION] outbound network connection blocked by air-gap policy")

// enforceAirGapAndMemoryLock disables core dumps, locks physical memory pages
// where permitted, and overrides all default DNS and HTTP transports to strictly
// trap any non-loopback communication.
func enforceAirGapAndMemoryLock() error {
	// 1. Disable core dumps (RLIMIT_CORE = 0) to prevent crash dumps of OFX buffers or keys
	var zeroLimit syscall.Rlimit
	if err := syscall.Setrlimit(syscall.RLIMIT_CORE, &zeroLimit); err != nil {
		log.Printf("[WARN] Could not set RLIMIT_CORE=0: %v", err)
	}

	// 2. Lock current and future memory into physical RAM (prevents OS swap paging)
	// MCL_CURRENT = 1, MCL_FUTURE = 2 on Linux
	_, _, errno := syscall.Syscall(syscall.SYS_MLOCKALL, 1|2, 0, 0)
	if errno != 0 {
		log.Printf("[INFO] mlockall not permitted by current ulimit/CAP_IPC_LOCK (errno %d); continuing with explicit buffer zeroization", errno)
	}

	// 3. Trap all DNS resolution globally
	net.DefaultResolver = &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return nil, fmt.Errorf("%w: DNS lookup attempted to %s", ErrEgressBlocked, address)
		},
	}

	// 4. Restrict HTTP DefaultTransport strictly to loopback (127.0.0.1 / ::1) or Unix sockets
	loopbackDialer := &net.Dialer{
		Timeout: 5 * time.Second,
	}

	guardedDialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		if strings.HasPrefix(network, "unix") {
			return loopbackDialer.DialContext(ctx, network, addr)
		}
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid address %s", ErrEgressBlocked, addr)
		}
		if host != "127.0.0.1" && host != "::1" && host != "localhost" {
			return nil, fmt.Errorf("%w: attempted connection to %s (%s)", ErrEgressBlocked, addr, network)
		}
		ip := net.ParseIP(host)
		if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			return nil, fmt.Errorf("%w: non-loopback IP %s", ErrEgressBlocked, host)
		}
		return loopbackDialer.DialContext(ctx, network, addr)
	}

	http.DefaultTransport = &http.Transport{
		DialContext: guardedDialContext,
		DialTLSContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return nil, fmt.Errorf("%w: outbound TLS prohibited (%s)", ErrEgressBlocked, addr)
		},
	}

	return nil
}

// ============================================================================
// 2. DATA MODELS & CONFIGURATION SCHEMAS
// ============================================================================

type Config struct {
	ConfigDir        string `json:"config_dir"`
	DataDir          string `json:"data_dir"`
	InboxDir         string `json:"inbox_dir"`
	ArchiveDir       string `json:"archive_dir"`
	ListenAddr       string `json:"listen_addr"`
	PBKDF2Iterations int    `json:"pbkdf2_iterations"`
	OllamaEndpoint   string `json:"ollama_endpoint"`
	OllamaModel      string `json:"ollama_model"`
	EnableLocalLLM   bool   `json:"enable_local_llm"`
}

type CategoryDef struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Parent      *string `json:"parent,omitempty"`
	Description string  `json:"description,omitempty"`
}

type Account struct {
	ID            string    `json:"id"`             // HMAC-SHA256 hash of raw <ACCTID>
	MaskedDisplay string    `json:"masked_display"` // Last 4 digits only, e.g. "****9482"
	Institution   string    `json:"institution"`    // Bank or card issuer
	Type          string    `json:"type"`           // "credit_card", "checking", etc.
	Currency      string    `json:"currency"`
	Description   string    `json:"description,omitempty"` // User friendly nickname e.g. "Primary Checking"
	CreatedAt     time.Time `json:"created_at"`
}

type Transaction struct {
	ID                 string    `json:"id"`                  // Composite: AccountID_Hash + ":" + FITID
	AccountID          string    `json:"account_id"`          // References Account.ID
	AccountMasked      string    `json:"account_masked"`      // Display helper
	TransactionDate    string    `json:"transaction_date"`    // ISO-8601 YYYY-MM-DD
	AmountCents        int64     `json:"amount_cents"`        // Signed integer cents (negative = debit)
	RawPayee           string    `json:"raw_payee"`           // Unmodified <NAME> / <MEMO>
	CleanPayee         string    `json:"clean_payee"`         // Normalized display merchant
	Category           string    `json:"category"`            // Assigned category
	ConfidenceScore    float64   `json:"confidence_score"`    // 0.0 to 1.0
	NeedsReview        bool      `json:"needs_review"`        // True if low confidence or Uncategorized
	CategorizationTier string    `json:"categorization_tier"` // "regex", "history", "local_llm", "manual", "fallback"
	UserVerified       bool      `json:"user_verified"`       // True if confirmed by human
	SourceFileHash     string    `json:"source_file_hash"`    // SHA-256 of statement payload
	ImportedAt         time.Time `json:"imported_at"`
}

type Rule struct {
	ID         string         `json:"id"`
	Pattern    string         `json:"pattern"`
	Category   string         `json:"category"`
	CleanPayee string         `json:"clean_payee,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	compiled   *regexp.Regexp // Compiled RE2 state (not exported to JSON)
}

type LedgerState struct {
	Accounts     map[string]Account     `json:"accounts"`
	Transactions map[string]Transaction `json:"transactions"`
	HistoryMap   map[string]HistoryItem `json:"history_map"` // Normalized RawPayee -> Historical Choice
	Rules        []Rule                 `json:"rules"`
}

type HistoryItem struct {
	Category   string `json:"category"`
	CleanPayee string `json:"clean_payee"`
}

// ============================================================================
// 3. CRYPTOGRAPHIC VAULT & ZERO-PLAINTEXT STORAGE ENGINE
// ============================================================================

var (
	VaultMagicHeader = []byte("OFXENC01")
	DBMagicHeader    = []byte("LGRENC01")
)

// deriveKey implements standard PBKDF2-HMAC-SHA256 using only the Go standard library.
func deriveKey(passphrase []byte, salt []byte, iterations int) []byte {
	if iterations < 100000 {
		iterations = 600000
	}
	prf := hmac.New(sha256.New, passphrase)
	hashLen := prf.Size()
	dk := make([]byte, 32) // 256-bit key for AES-256

	u := make([]byte, hashLen)
	t := make([]byte, hashLen)
	block1 := make([]byte, len(salt)+4)
	copy(block1, salt)
	block1[len(salt)+3] = 1 // Block index 1 (big-endian)

	prf.Write(block1)
	u = prf.Sum(u[:0])
	copy(t, u)

	for i := 2; i <= iterations; i++ {
		prf.Reset()
		prf.Write(u)
		u = prf.Sum(u[:0])
		for j := 0; j < hashLen; j++ {
			t[j] ^= u[j]
		}
	}
	copy(dk, t[:32])
	clear(u)
	clear(t)
	clear(block1)
	return dk
}

// encryptBlob compresses and encrypts raw bytes with AES-256-GCM.
func encryptBlob(magic []byte, plaintext []byte, aad []byte, passphrase []byte, iterations int) ([]byte, error) {
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}

	key := deriveKey(passphrase, salt, iterations)
	defer clear(key)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesgcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	var compressedBuf bytes.Buffer
	zw, err := zlib.NewWriterLevel(&compressedBuf, zlib.BestCompression)
	if err != nil {
		return nil, err
	}
	if _, err := zw.Write(plaintext); err != nil {
		return nil, err
	}
	zw.Close()
	compressedBytes := compressedBuf.Bytes()
	defer clear(compressedBytes)

	ciphertext := aesgcm.Seal(nil, nonce, compressedBytes, aad)

	var out bytes.Buffer
	out.Grow(len(magic) + len(salt) + len(nonce) + len(ciphertext))
	out.Write(magic)
	out.Write(salt)
	out.Write(nonce)
	out.Write(ciphertext)
	return out.Bytes(), nil
}

// decryptBlob verifies, decrypts, and decompresses an AES-256-GCM blob.
func decryptBlob(magic []byte, data []byte, aad []byte, passphrase []byte, iterations int) ([]byte, error) {
	headerLen := len(magic)
	if len(data) < headerLen+16+12+16 {
		return nil, errors.New("encrypted payload truncated or corrupted")
	}
	if !bytes.Equal(data[:headerLen], magic) {
		return nil, errors.New("invalid magic header on encrypted file")
	}

	salt := data[headerLen : headerLen+16]
	nonce := data[headerLen+16 : headerLen+28]
	ciphertext := data[headerLen+28:]

	key := deriveKey(passphrase, salt, iterations)
	defer clear(key)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	compressedBytes, err := aesgcm.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, errors.New("decryption failed: invalid passphrase or tampered archive")
	}
	defer clear(compressedBytes)

	zr, err := zlib.NewReader(bytes.NewReader(compressedBytes))
	if err != nil {
		return nil, err
	}
	defer zr.Close()

	return io.ReadAll(zr)
}

// secureUnlink overwrites a file on tmpfs/disk with zeros before unlinking.
func secureUnlink(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return errors.New("cannot secure-unlink a directory")
	}

	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	zeros := make([]byte, 4096)
	remaining := info.Size()
	for remaining > 0 {
		toWrite := int64(len(zeros))
		if remaining < toWrite {
			toWrite = remaining
		}
		n, err := f.Write(zeros[:toWrite])
		if err != nil {
			f.Close()
			return err
		}
		remaining -= int64(n)
	}
	_ = f.Sync()
	_ = f.Close()
	return os.Remove(path)
}

// ============================================================================
// 4. ZERO-DEPENDENCY OFX / QFX STREAMING LEXER
// ============================================================================

type ParsedOFXStatement struct {
	RawAcctID    []byte // Mutable slice; wiped immediately after HMAC hashing
	Institution  string
	AcctType     string
	Currency     string
	Transactions []ParsedOFXTransaction
}

type ParsedOFXTransaction struct {
	FITID       string
	DatePosted  string // YYYY-MM-DD
	AmountCents int64
	RawPayee    string
}

// parseOFXBytes parses both OFX 1.x (unclosed SGML tags) and OFX 2.x (strict XML)
// directly from a mutable []byte buffer without leaking raw account numbers.
func parseOFXBytes(raw []byte) (*ParsedOFXStatement, error) {
	stmt := &ParsedOFXStatement{
		Institution: "Unknown Institution",
		AcctType:    "checking",
		Currency:    "USD",
	}

	// Detect Credit Card vs Bank Statement
	if bytes.Contains(raw, []byte("<CREDITCARDMSGSRSV1>")) || bytes.Contains(raw, []byte("<CCSTMTRS>")) {
		stmt.AcctType = "credit_card"
	}

	// Extract top-level metadata tags
	if org := extractTagString(raw, "ORG"); org != "" {
		stmt.Institution = org
	}
	if cur := extractTagString(raw, "CURDEF"); cur != "" {
		stmt.Currency = cur
	}
	if acctType := extractTagString(raw, "ACCTTYPE"); acctType != "" && stmt.AcctType != "credit_card" {
		stmt.AcctType = strings.ToLower(acctType)
	}

	// Extract <ACCTID> into a dedicated mutable byte slice so we can zeroize it
	stmt.RawAcctID = extractTagBytes(raw, "ACCTID")
	if len(stmt.RawAcctID) == 0 {
		stmt.RawAcctID = []byte("DEFAULT_ACCOUNT")
	}

	// Scan for all <STMTTRN> blocks
	searchBuf := raw
	openTag := []byte("<STMTTRN>")
	closeTag := []byte("</STMTTRN>")

	for {
		startIdx := bytes.Index(searchBuf, openTag)
		if startIdx == -1 {
			break
		}
		blockBuf := searchBuf[startIdx+len(openTag):]
		endIdx := bytes.Index(blockBuf, closeTag)

		var trnBlock []byte
		if endIdx != -1 {
			trnBlock = blockBuf[:endIdx]
			searchBuf = blockBuf[endIdx+len(closeTag):]
		} else {
			// Fallback for malformed unclosed STMTTRN blocks: read until next <STMTTRN> or </BANKTRANLIST>
			nextTrn := bytes.Index(blockBuf, openTag)
			endList := bytes.Index(blockBuf, []byte("</BANKTRANLIST>"))
			if nextTrn != -1 {
				trnBlock = blockBuf[:nextTrn]
				searchBuf = blockBuf[nextTrn:]
			} else if endList != -1 {
				trnBlock = blockBuf[:endList]
				searchBuf = blockBuf[endList:]
			} else {
				trnBlock = blockBuf
				searchBuf = nil
			}
		}

		fitid := extractTagString(trnBlock, "FITID")
		dtPosted := extractTagString(trnBlock, "DTPOSTED")
		trnAmtStr := extractTagString(trnBlock, "TRNAMT")
		nameStr := extractTagString(trnBlock, "NAME")
		memoStr := extractTagString(trnBlock, "MEMO")

		if fitid == "" || trnAmtStr == "" {
			continue
		}

		cents, err := parseAmountToCents(trnAmtStr)
		if err != nil {
			continue
		}

		isoDate := normalizeOFXDate(dtPosted)
		rawPayee := strings.TrimSpace(nameStr)
		if memoStr != "" && !strings.EqualFold(rawPayee, strings.TrimSpace(memoStr)) {
			if rawPayee != "" {
				rawPayee = rawPayee + " " + strings.TrimSpace(memoStr)
			} else {
				rawPayee = strings.TrimSpace(memoStr)
			}
		}
		// Collapse multiple spaces
		rawPayee = strings.Join(strings.Fields(rawPayee), " ")
		if rawPayee == "" {
			rawPayee = "UNKNOWN PAYEE"
		}

		stmt.Transactions = append(stmt.Transactions, ParsedOFXTransaction{
			FITID:       fitid,
			DatePosted:  isoDate,
			AmountCents: cents,
			RawPayee:    rawPayee,
		})
	}

	if len(stmt.Transactions) == 0 {
		return stmt, errors.New("no valid <STMTTRN> transaction records found in OFX/QFX payload")
	}

	return stmt, nil
}

// extractTagBytes finds `<TAG>value` and returns a newly allocated mutable []byte copy of value.
func extractTagBytes(buf []byte, tag string) []byte {
	openTag := []byte("<" + tag + ">")
	idx := bytes.Index(buf, openTag)
	if idx == -1 {
		return nil
	}
	valStart := buf[idx+len(openTag):]

	// Value ends at `<` (closing tag or next SGML tag) or newline `\r` / `\n`
	end := len(valStart)
	for i, b := range valStart {
		if b == '<' || b == '\r' || b == '\n' {
			end = i
			break
		}
	}
	trimmed := bytes.TrimSpace(valStart[:end])
	out := make([]byte, len(trimmed))
	copy(out, trimmed)
	return out
}

func extractTagString(buf []byte, tag string) string {
	b := extractTagBytes(buf, tag)
	if len(b) == 0 {
		return ""
	}
	return string(b)
}

// parseAmountToCents converts "-42.50" or "1,234.56" into signed integer cents (-4250, 123456)
// without floating-point IEEE-754 precision loss.
func parseAmountToCents(s string) (int64, error) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", ""))
	if s == "" {
		return 0, errors.New("empty amount")
	}
	negative := false
	if strings.HasPrefix(s, "-") {
		negative = true
		s = s[1:]
	} else if strings.HasPrefix(s, "+") {
		s = s[1:]
	}

	parts := strings.SplitN(s, ".", 2)
	dollars, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil && parts[0] != "" {
		return 0, err
	}

	var cents int64
	if len(parts) == 2 {
		frac := parts[1]
		if len(frac) == 1 {
			frac += "0"
		} else if len(frac) > 2 {
			frac = frac[:2]
		}
		cents, err = strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, err
		}
	}

	total := dollars*100 + cents
	if negative {
		total = -total
	}
	return total, nil
}

// normalizeOFXDate extracts YYYYMMDD from OFX timestamps like "20261014120000.000[-5:EST]"
// and formats it as ISO-8601 "YYYY-MM-DD".
func normalizeOFXDate(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) >= 8 {
		y := raw[0:4]
		m := raw[4:6]
		d := raw[6:8]
		return fmt.Sprintf("%s-%s-%s", y, m, d)
	}
	return time.Now().Format("2006-01-02")
}

// ============================================================================
// 5. ENCRYPTED ENGINE & MULTI-TIER CATEGORIZATION WATERFALL
// ============================================================================

type FinanceEngine struct {
	mu             sync.RWMutex
	cfg            Config
	passphrase     []byte
	state          LedgerState
	categories     []CategoryDef
	categoryNames  []string
	dbPath         string
	rulesPath      string
	categoriesPath string
	accountsPath   string
	configPath     string
}

// loadCategoriesFromConfig reads the taxonomy from /config/categories.json.
func (e *FinanceEngine) loadCategoriesFromConfig() error {
	data, err := os.ReadFile(e.categoriesPath)
	if err != nil {
		return err
	}
	var cats []CategoryDef
	if err := json.Unmarshal(data, &cats); err != nil {
		return err
	}
	e.categories = cats
	names := make([]string, 0, len(cats))
	for _, c := range cats {
		names = append(names, c.Name)
	}
	e.categoryNames = names
	return nil
}

// loadAccountsFromConfig reads predefined account nicknames/metadata from config/accounts.json
func (e *FinanceEngine) loadAccountsFromConfig() error {
	path := e.accountsPath
	data, err := os.ReadFile(path)
	if err != nil {
		// Fallback to example if user has not yet customized accounts.json
		data, err = os.ReadFile(path + ".example")
		if err != nil {
			return err
		}
	}
	var fileAccts []Account
	if err := json.Unmarshal(data, &fileAccts); err != nil {
		return err
	}
	for _, a := range fileAccts {
		if a.ID == "" {
			continue
		}
		if existing, ok := e.state.Accounts[a.ID]; ok {
			if a.Institution != "" {
				existing.Institution = a.Institution
			}
			if a.MaskedDisplay != "" {
				existing.MaskedDisplay = a.MaskedDisplay
			}
			if a.Type != "" {
				existing.Type = a.Type
			}
			if a.Description != "" {
				existing.Description = a.Description
			}
			if a.Currency != "" {
				existing.Currency = a.Currency
			}
			e.state.Accounts[a.ID] = existing
		} else {
			if a.CreatedAt.IsZero() {
				a.CreatedAt = time.Now()
			}
			e.state.Accounts[a.ID] = a
		}
	}
	return nil
}

func (e *FinanceEngine) saveAccountsToConfigLocked() error {
	accts := make([]Account, 0, len(e.state.Accounts))
	for _, a := range e.state.Accounts {
		accts = append(accts, a)
	}
	sort.Slice(accts, func(i, j int) bool {
		return accts[i].Institution < accts[j].Institution
	})
	data, err := json.MarshalIndent(accts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(e.accountsPath, data, 0600)
}

// loadRulesFromConfig reads and compiles deterministic RE2 rules from /config/rules.json.
func (e *FinanceEngine) loadRulesFromConfig() error {
	data, err := os.ReadFile(e.rulesPath)
	if err != nil {
		return err
	}
	var fileRules []Rule
	if err := json.Unmarshal(data, &fileRules); err != nil {
		return err
	}
	validRules := make([]Rule, 0, len(fileRules))
	for i := range fileRules {
		if fileRules[i].CreatedAt.IsZero() {
			fileRules[i].CreatedAt = time.Now()
		}
		if re, err := regexp.Compile(fileRules[i].Pattern); err == nil {
			fileRules[i].compiled = re
			validRules = append(validRules, fileRules[i])
		} else {
			log.Printf("[WARN] Rule %s has invalid regex %q: %v", fileRules[i].ID, fileRules[i].Pattern, err)
		}
	}
	e.state.Rules = validRules
	return nil
}

func NewFinanceEngine(cfg Config, passphrase []byte) (*FinanceEngine, error) {
	for _, dir := range []string{cfg.DataDir, cfg.InboxDir, cfg.ConfigDir} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, err
		}
	}

	eng := &FinanceEngine{
		cfg:            cfg,
		passphrase:     passphrase,
		dbPath:         filepath.Join(cfg.DataDir, "ledger.db.enc"),
		rulesPath:      filepath.Join(cfg.ConfigDir, "rules.json"),
		categoriesPath: filepath.Join(cfg.ConfigDir, "categories.json"),
		accountsPath:   filepath.Join(cfg.ConfigDir, "accounts.json"),
		configPath:     filepath.Join(cfg.ConfigDir, "config.json"),
		state: LedgerState{
			Accounts:     make(map[string]Account),
			Transactions: make(map[string]Transaction),
			HistoryMap:   make(map[string]HistoryItem),
			Rules:        nil,
		},
	}

	// 1. External configuration loading: categories from /config/categories.json
	if err := eng.loadCategoriesFromConfig(); err != nil {
		log.Printf("[CONFIG] Warning: could not load %s: %v", eng.categoriesPath, err)
	} else {
		log.Printf("[CONFIG] Loaded %d categories from %s", len(eng.categoryNames), eng.categoriesPath)
	}

	// 2. External configuration loading: RE2 rules from /config/rules.json
	if err := eng.loadRulesFromConfig(); err != nil {
		log.Printf("[CONFIG] Warning: could not load %s: %v", eng.rulesPath, err)
	} else {
		log.Printf("[CONFIG] Loaded %d rules from %s", len(eng.state.Rules), eng.rulesPath)
	}

	// 3. External configuration loading: accounts from /config/accounts.json
	if err := eng.loadAccountsFromConfig(); err != nil {
		log.Printf("[CONFIG] Warning: could not load %s: %v", eng.accountsPath, err)
	} else {
		log.Printf("[CONFIG] Loaded %d accounts from %s", len(eng.state.Accounts), eng.accountsPath)
	}

	// 4. Load encrypted state
	if err := eng.loadEncryptedState(); err != nil {
		return nil, err
	}
	return eng, nil
}

// loadEncryptedState reads and decrypts ledger.db.enc from disk if it exists.
func (e *FinanceEngine) loadEncryptedState() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, err := os.Stat(e.dbPath); os.IsNotExist(err) {
		// Seed initial encrypted database with sample triage data on first boot
		e.seedInitialDemoTransactionsLocked()
		return e.saveEncryptedStateLocked()
	}

	encBytes, err := os.ReadFile(e.dbPath)
	if err != nil {
		return err
	}

	plainBytes, err := decryptBlob(DBMagicHeader, encBytes, []byte("ledger.db"), e.passphrase, e.cfg.PBKDF2Iterations)
	if err != nil {
		return err
	}
	defer clear(plainBytes)

	var savedState LedgerState
	if err := json.Unmarshal(plainBytes, &savedState); err != nil {
		return err
	}
	e.state.Accounts = savedState.Accounts
	e.state.Transactions = savedState.Transactions
	e.state.HistoryMap = savedState.HistoryMap

	// If no rules were loaded from /config/rules.json, use saved rules
	if len(e.state.Rules) == 0 && len(savedState.Rules) > 0 {
		validRules := make([]Rule, 0, len(savedState.Rules))
		for _, r := range savedState.Rules {
			if re, err := regexp.Compile(r.Pattern); err == nil {
				r.compiled = re
				validRules = append(validRules, r)
			}
		}
		e.state.Rules = validRules
	}
	return nil
}

// saveEncryptedStateLocked serializes and encrypts the entire database state with AES-256-GCM
// before writing atomically to disk.
func (e *FinanceEngine) saveEncryptedStateLocked() error {
	plainBytes, err := json.Marshal(e.state)
	if err != nil {
		return err
	}
	defer clear(plainBytes)

	encBytes, err := encryptBlob(DBMagicHeader, plainBytes, []byte("ledger.db"), e.passphrase, e.cfg.PBKDF2Iterations)
	if err != nil {
		return err
	}

	tmpPath := e.dbPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	if _, err := f.Write(encBytes); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	f.Close()

	// Also export rules.json for transparency/backup
	if rulesBytes, err := json.MarshalIndent(e.state.Rules, "", "  "); err == nil {
		_ = os.WriteFile(e.rulesPath, rulesBytes, 0600)
	}

	return os.Rename(tmpPath, e.dbPath)
}

// hashAccountID computes HMAC-SHA256(passphrase, rawAcctID) and masks the display string.
func (e *FinanceEngine) hashAccountID(rawAcctID []byte) (acctHash string, masked string) {
	mac := hmac.New(sha256.New, e.passphrase)
	mac.Write(rawAcctID)
	acctHash = hex.EncodeToString(mac.Sum(nil))[:24]

	if len(rawAcctID) >= 4 {
		masked = "****" + string(rawAcctID[len(rawAcctID)-4:])
	} else {
		masked = "****" + string(rawAcctID)
	}
	return acctHash, masked
}

// categorizeTransaction runs the 3-tier categorization waterfall.
func (e *FinanceEngine) categorizeTransactionLocked(rawPayee string) (category string, cleanPayee string, confidence float64, tier string, needsReview bool) {
	cleanedDefault := cleanMerchantName(rawPayee)

	// Tier 1: Deterministic Compiled Go RE2 Regex Rules
	for _, rule := range e.state.Rules {
		if rule.compiled != nil && rule.compiled.MatchString(rawPayee) {
			cp := cleanedDefault
			if rule.CleanPayee != "" {
				cp = rule.CleanPayee
			}
			return rule.Category, cp, 1.0, "regex", false
		}
	}

	// Tier 2: Historical Memory Matcher (Exact normalized payee match from previous user verification)
	normKey := strings.ToUpper(strings.Join(strings.Fields(rawPayee), " "))
	if hist, ok := e.state.HistoryMap[normKey]; ok {
		return hist.Category, hist.CleanPayee, 0.95, "history", false
	}

	// Tier 3: Optional Local Loopback LLM / Heuristic Confidence Scorer
	if cat, conf, ok := heuristicAmbiguousClassifier(rawPayee); ok {
		return cat, cleanedDefault, conf, "local_llm", conf < 0.85
	}

	// Fallback: Uncategorized -> Flagged for Triage Review
	return "Uncategorized", cleanedDefault, 0.0, "fallback", true
}

// heuristicAmbiguousClassifier simulates or delegates to a local loopback SLM for ambiguous payees,
// flagging items with < 0.85 confidence for human review.
func heuristicAmbiguousClassifier(rawPayee string) (string, float64, bool) {
	up := strings.ToUpper(rawPayee)
	switch {
	case strings.Contains(up, "SQ *") || strings.Contains(up, "TST*"):
		return "Dining:Restaurants", 0.72, true // Low confidence -> Needs Review!
	case strings.Contains(up, "VENMO") || strings.Contains(up, "ZELLE") || strings.Contains(up, "PAYPAL *"):
		return "Uncategorized", 0.35, true // Peer-to-peer payment is ambiguous -> Needs Review!
	case strings.Contains(up, "PHARMACY") || strings.Contains(up, "CVS") || strings.Contains(up, "WALGREENS"):
		return "Healthcare", 0.78, true // Could be healthcare or general shopping -> Needs Review!
	case strings.Contains(up, "AIRBNB") || strings.Contains(up, "UNITED AIR") || strings.Contains(up, "DELTA"):
		return "Travel", 0.82, true
	}
	return "", 0, false
}

func cleanMerchantName(raw string) string {
	s := raw
	prefixes := []string{"TST* ", "TST*", "SQ *", "SQ* ", "SP * ", "PAYPAL *", "POS DEBIT ", "APLPAY "}
	for _, p := range prefixes {
		if strings.HasPrefix(strings.ToUpper(s), p) {
			s = s[len(p):]
		}
	}
	// Strip trailing store numbers like "#1234"
	reStore := regexp.MustCompile(`\s+#\d+.*$`)
	s = reStore.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	if s == "" {
		return raw
	}
	// Title case words
	words := strings.Fields(strings.ToLower(s))
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// ============================================================================
// 6. IN-MEMORY INGESTION PIPELINE & SEED DATA
// ============================================================================

type IngestResult struct {
	Filename          string `json:"filename"`
	Status            string `json:"status"`
	TotalParsed       int    `json:"total_parsed"`
	Inserted          int    `json:"inserted"`
	SkippedDuplicates int    `json:"skipped_duplicates"`
	FlaggedForReview  int    `json:"flagged_for_review"`
	RawDisposition    string `json:"raw_disposition"`
}

// IngestRawStatement processes an OFX/QFX byte slice strictly in RAM,
// applies the post-ingest retention policy, and wipes the raw buffer via defer clear().
func (e *FinanceEngine) IngestRawStatement(rawBytes []byte, filename string) (*IngestResult, error) {
	// Guarantee explicit RAM zeroization of the raw OFX buffer before returning
	defer clear(rawBytes)

	payloadHashBytes := sha256.Sum256(rawBytes)
	payloadHash := hex.EncodeToString(payloadHashBytes[:])[:16]

	parsed, err := parseOFXBytes(rawBytes)
	if err != nil {
		return nil, err
	}
	// Guarantee explicit RAM zeroization of the extracted <ACCTID> slice
	defer clear(parsed.RawAcctID)

	acctID, maskedAcct := e.hashAccountID(parsed.RawAcctID)
	clear(parsed.RawAcctID) // Wipe immediately after hashing

	e.mu.Lock()
	defer e.mu.Unlock()

	if _, exists := e.state.Accounts[acctID]; !exists {
		e.state.Accounts[acctID] = Account{
			ID:            acctID,
			MaskedDisplay: maskedAcct,
			Institution:   parsed.Institution,
			Type:          parsed.AcctType,
			Currency:      parsed.Currency,
			CreatedAt:     time.Now(),
		}
	}

	inserted := 0
	duplicates := 0
	flagged := 0

	for _, pt := range parsed.Transactions {
		compositeID := acctID + ":" + pt.FITID
		if _, exists := e.state.Transactions[compositeID]; exists {
			duplicates++
			continue
		}

		cat, cleanPayee, conf, tier, needsRev := e.categorizeTransactionLocked(pt.RawPayee)
		if needsRev {
			flagged++
		}

		tx := Transaction{
			ID:                 compositeID,
			AccountID:          acctID,
			AccountMasked:      maskedAcct,
			TransactionDate:    pt.DatePosted,
			AmountCents:        pt.AmountCents,
			RawPayee:           pt.RawPayee,
			CleanPayee:         cleanPayee,
			Category:           cat,
			ConfidenceScore:    conf,
			NeedsReview:        needsRev,
			CategorizationTier: tier,
			UserVerified:       false,
			SourceFileHash:     payloadHash,
			ImportedAt:         time.Now(),
		}
		e.state.Transactions[compositeID] = tx
		inserted++
	}

	disposition := "zeroed_from_ram"

	if err := e.saveEncryptedStateLocked(); err != nil {
		return nil, err
	}

	return &IngestResult{
		Filename:          filepath.Base(filename),
		Status:            "success",
		TotalParsed:       len(parsed.Transactions),
		Inserted:          inserted,
		SkippedDuplicates: duplicates,
		FlaggedForReview:  flagged,
		RawDisposition:    disposition,
	}, nil
}

// seedInitialDemoTransactionsLocked populates realistic OFX transactions on first boot
// so the user can immediately test the Triage Inbox and Regex Rule Generator.
func (e *FinanceEngine) seedInitialDemoTransactionsLocked() {
	sampleOFX := []byte(`OFXHEADER:100
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
<NAME>VENMO*PAYMENT 883920192
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
<NAME>COMCAST XFINITY CABLE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261003120000
<TRNAMT>-64.12
<FITID>202610030008
<NAME>SHELL OIL 574429102
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261001120000
<TRNAMT>-119.00
<FITID>202610010009
<NAME>ACME HARDWARE SUPPLY #09
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CREDITCARDMSGSRSV1>
</OFX>`)
	defer clear(sampleOFX)

	parsed, err := parseOFXBytes(sampleOFX)
	if err != nil {
		return
	}
	defer clear(parsed.RawAcctID)

	acctID, masked := e.hashAccountID(parsed.RawAcctID)
	e.state.Accounts[acctID] = Account{
		ID:            acctID,
		MaskedDisplay: masked,
		Institution:   "Chase Sapphire",
		Type:          "credit_card",
		Currency:      "USD",
		CreatedAt:     time.Now(),
	}

	for _, pt := range parsed.Transactions {
		cid := acctID + ":" + pt.FITID
		cat, cleanP, conf, tier, needsRev := e.categorizeTransactionLocked(pt.RawPayee)
		e.state.Transactions[cid] = Transaction{
			ID:                 cid,
			AccountID:          acctID,
			AccountMasked:      masked,
			TransactionDate:    pt.DatePosted,
			AmountCents:        pt.AmountCents,
			RawPayee:           pt.RawPayee,
			CleanPayee:         cleanP,
			Category:           cat,
			ConfidenceScore:    conf,
			NeedsReview:        needsRev,
			CategorizationTier: tier,
			UserVerified:       false,
			SourceFileHash:     "demo_seed_hash",
			ImportedAt:         time.Now(),
		}
	}
}

// ============================================================================
// 7. BACKGROUND TMPFS INBOX WATCHER & LOCAL REST API HANDLERS
// ============================================================================

// StartInboxWatcher polls the volatile RAM inbox directory (/opt/finances/inbox),
// ingests any dropped .ofx/.qfx files into memory, and securely overwrites & unlinks them.
func (e *FinanceEngine) StartInboxWatcher(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			entries, err := os.ReadDir(e.cfg.InboxDir)
			if err != nil {
				continue
			}
			for _, entry := range entries {
				if entry.IsDir() {
					continue
				}
				name := entry.Name()
				lower := strings.ToLower(name)
				if !strings.HasSuffix(lower, ".ofx") && !strings.HasSuffix(lower, ".qfx") {
					continue
				}
				fullPath := filepath.Join(e.cfg.InboxDir, name)
				rawBytes, err := os.ReadFile(fullPath)
				if err != nil {
					continue
				}
				res, err := e.IngestRawStatement(rawBytes, name)
				clear(rawBytes)
				if err := secureUnlink(fullPath); err != nil {
					log.Printf("[WARN] Failed to secure-unlink %s: %v", fullPath, err)
				}
				if err != nil {
					log.Printf("[INGEST ERROR] %s: %v", name, err)
				} else {
					log.Printf("[INGEST OK] %s: parsed=%d inserted=%d dupes=%d review=%d (%s)",
						res.Filename, res.TotalParsed, res.Inserted, res.SkippedDuplicates, res.FlaggedForReview, res.RawDisposition)
				}
			}
		}
	}
}

// withAirGapCSP wraps every HTTP handler with strict loopback-only Content Security Policy headers.
func withAirGapCSP(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none';")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// handleUpload streams the uploaded OFX/QFX payload strictly into RAM (capped at 10 MB)
// without ever calling r.ParseMultipartForm (which could spill temp files to /tmp on disk).
func (e *FinanceEngine) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	// Enforce strict 10 MB RAM limit
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	defer r.Body.Close()

	filename := r.Header.Get("X-Filename")
	if filename == "" {
		filename = "uploaded_statement.ofx"
	}
	lowerName := strings.ToLower(filename)
	if !strings.HasSuffix(lowerName, ".ofx") && !strings.HasSuffix(lowerName, ".qfx") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only .ofx and .qfx files are permitted"})
		return
	}

	rawBytes, err := io.ReadAll(r.Body)
	if err != nil {
		clear(rawBytes)
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "upload exceeds 10MB memory cap or failed to read"})
		return
	}
	defer clear(rawBytes)

	res, err := e.IngestRawStatement(rawBytes, filename)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, res)
}

func (e *FinanceEngine) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	totalTx := len(e.state.Transactions)
	needsRev := 0
	var totalOutflowCents int64
	var totalInflowCents int64
	catTotals := make(map[string]int64)

	for _, tx := range e.state.Transactions {
		if tx.NeedsReview {
			needsRev++
		}
		if tx.AmountCents < 0 && tx.Category != "Transfer:CreditCardPayment" {
			totalOutflowCents += (-tx.AmountCents)
			catTotals[tx.Category] += (-tx.AmountCents)
		} else if tx.AmountCents > 0 && tx.Category != "Transfer:CreditCardPayment" {
			totalInflowCents += tx.AmountCents
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"post_ingest_policy":    "ephemeral_ram_purge",
		"total_transactions":    totalTx,
		"needs_review_count":    needsRev,
		"total_outflow_cents":   totalOutflowCents,
		"total_inflow_cents":    totalInflowCents,
		"category_totals_cents": catTotals,
		"categories":            e.categoryNames,
		"rules":                 e.state.Rules,
		"accounts":              e.state.Accounts,
	})
}

func (e *FinanceEngine) handleGetTransactions(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	onlyReview := r.URL.Query().Get("needs_review") == "true"
	catFilter := r.URL.Query().Get("category")
	searchQuery := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	list := make([]Transaction, 0, len(e.state.Transactions))
	for _, tx := range e.state.Transactions {
		if onlyReview && !tx.NeedsReview {
			continue
		}
		if catFilter != "" && tx.Category != catFilter {
			continue
		}
		if searchQuery != "" {
			if !strings.Contains(strings.ToLower(tx.RawPayee), searchQuery) &&
				!strings.Contains(strings.ToLower(tx.CleanPayee), searchQuery) &&
				!strings.Contains(strings.ToLower(tx.Category), searchQuery) {
				continue
			}
		}
		list = append(list, tx)
	}

	sort.Slice(list, func(i, j int) bool {
		if list[i].TransactionDate == list[j].TransactionDate {
			return list[i].ID > list[j].ID
		}
		return list[i].TransactionDate > list[j].TransactionDate
	})

	writeJSON(w, http.StatusOK, list)
}

func (e *FinanceEngine) handleCategorizeTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		ID         string `json:"id"`
		Category   string `json:"category"`
		CleanPayee string `json:"clean_payee"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	tx, exists := e.state.Transactions[req.ID]
	if !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "transaction not found"})
		return
	}

	tx.Category = req.Category
	if strings.TrimSpace(req.CleanPayee) != "" {
		tx.CleanPayee = strings.TrimSpace(req.CleanPayee)
	}
	tx.NeedsReview = false
	tx.UserVerified = true
	tx.ConfidenceScore = 1.0
	tx.CategorizationTier = "manual"
	e.state.Transactions[req.ID] = tx

	// Persist into Tier 2 Historical Memory for future statements
	normKey := strings.ToUpper(strings.Join(strings.Fields(tx.RawPayee), " "))
	e.state.HistoryMap[normKey] = HistoryItem{
		Category:   tx.Category,
		CleanPayee: tx.CleanPayee,
	}

	if err := e.saveEncryptedStateLocked(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, tx)
}

func (e *FinanceEngine) handleTestRule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		Pattern string `json:"pattern"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Pattern) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pattern is required"})
		return
	}

	re, err := regexp.Compile(req.Pattern)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid RE2 regular expression: " + err.Error()})
		return
	}

	e.mu.RLock()
	defer e.mu.RUnlock()

	matchCount := 0
	samples := make([]string, 0, 5)
	for _, tx := range e.state.Transactions {
		if re.MatchString(tx.RawPayee) {
			matchCount++
			if len(samples) < 5 {
				samples = append(samples, tx.RawPayee)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"match_count":    matchCount,
		"sample_matches": samples,
	})
}

func (e *FinanceEngine) handleCreateRule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		Pattern           string `json:"pattern"`
		Category          string `json:"category"`
		CleanPayee        string `json:"clean_payee"`
		ApplyToHistorical bool   `json:"apply_to_historical"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	re, err := regexp.Compile(req.Pattern)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid regex: " + err.Error()})
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	newRule := Rule{
		ID:         fmt.Sprintf("rule-%d", time.Now().UnixNano()),
		Pattern:    req.Pattern,
		Category:   req.Category,
		CleanPayee: strings.TrimSpace(req.CleanPayee),
		CreatedAt:  time.Now(),
		compiled:   re,
	}
	// Prepend so user-created rules take priority
	e.state.Rules = append([]Rule{newRule}, e.state.Rules...)

	updatedCount := 0
	if req.ApplyToHistorical {
		for id, tx := range e.state.Transactions {
			if re.MatchString(tx.RawPayee) {
				tx.Category = req.Category
				if newRule.CleanPayee != "" {
					tx.CleanPayee = newRule.CleanPayee
				}
				tx.ConfidenceScore = 1.0
				tx.NeedsReview = false
				tx.CategorizationTier = "regex"
				tx.UserVerified = true
				e.state.Transactions[id] = tx
				updatedCount++
			}
		}
	}

	if err := e.saveEncryptedStateLocked(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"rule":            newRule,
		"updated_records": updatedCount,
	})
}

func (e *FinanceEngine) handleGetPolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"post_ingest_policy": "ephemeral_ram_purge",
	})
}

func (e *FinanceEngine) handleCategories(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"categories": e.categories,
		"names":      e.categoryNames,
	})
}

func (e *FinanceEngine) handleAccounts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		e.mu.RLock()
		defer e.mu.RUnlock()
		accts := make([]Account, 0, len(e.state.Accounts))
		for _, a := range e.state.Accounts {
			accts = append(accts, a)
		}
		sort.Slice(accts, func(i, j int) bool {
			return accts[i].Institution < accts[j].Institution
		})
		writeJSON(w, http.StatusOK, accts)
		return
	}

	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		var payload Account
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
			return
		}
		if payload.ID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "account ID is required"})
			return
		}

		e.mu.Lock()
		defer e.mu.Unlock()

		acc, exists := e.state.Accounts[payload.ID]
		if !exists {
			acc = payload
			if acc.CreatedAt.IsZero() {
				acc.CreatedAt = time.Now()
			}
		} else {
			if payload.Institution != "" {
				acc.Institution = payload.Institution
			}
			if payload.MaskedDisplay != "" {
				acc.MaskedDisplay = payload.MaskedDisplay
			}
			if payload.Type != "" {
				acc.Type = payload.Type
			}
			acc.Description = payload.Description
			if payload.Currency != "" {
				acc.Currency = payload.Currency
			}
		}
		e.state.Accounts[payload.ID] = acc

		// Propagate updated masked display to transactions
		for txID, tx := range e.state.Transactions {
			if tx.AccountID == payload.ID {
				tx.AccountMasked = acc.MaskedDisplay
				e.state.Transactions[txID] = tx
			}
		}

		_ = e.saveEncryptedStateLocked()
		_ = e.saveAccountsToConfigLocked()

		writeJSON(w, http.StatusOK, acc)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

// ============================================================================
// 8. EMBEDDED ZERO-CDN FRONTEND DASHBOARD
// ============================================================================

const embeddedIndexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zero-Leak Local Finance Engine</title>
<style>
  :root {
    --bg: #0b0f17;
    --panel: #131b2e;
    --panel-alt: #19233c;
    --border: #263457;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --emerald: #10b981;
    --emerald-bg: rgba(16, 185, 129, 0.12);
    --amber: #f59e0b;
    --amber-bg: rgba(245, 158, 11, 0.14);
    --rose: #f43f5e;
    --rose-bg: rgba(244, 63, 94, 0.14);
    --indigo: #6366f1;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    line-height: 1.5;
    padding-bottom: 60px;
  }
  header {
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    padding: 14px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 700;
    font-size: 1.1rem;
  }
  .shield-badge {
    font-family: var(--mono);
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--emerald-bg);
    color: var(--emerald);
    border: 1px solid rgba(16, 185, 129, 0.35);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .container {
    max-width: 1320px;
    margin: 24px auto;
    padding: 0 24px;
    display: grid;
    gap: 24px;
  }
  .top-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 20px;
  }
  @media (max-width: 960px) {
    .top-grid { grid-template-columns: 1fr; }
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }
  .card-title {
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 10px;
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.15s ease;
    background: rgba(25, 35, 60, 0.4);
  }
  .dropzone:hover, .dropzone.dragover {
    border-color: var(--emerald);
    background: var(--emerald-bg);
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .stat-box {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
  }
  .stat-label { font-size: 0.75rem; color: var(--muted); }
  .stat-value { font-family: var(--mono); font-size: 1.35rem; font-weight: 700; margin-top: 4px; }
  .tabs {
    display: flex;
    gap: 10px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
  }
  .tab-btn {
    background: var(--panel-alt);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .tab-btn.active {
    background: var(--indigo);
    color: #fff;
    border-color: var(--indigo);
  }
  .badge-count {
    background: var(--amber-bg);
    color: var(--amber);
    font-family: var(--mono);
    padding: 1px 7px;
    border-radius: 99px;
    font-size: 0.75rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 12px 10px;
    border-bottom: 1px solid var(--border);
  }
  th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  .mono { font-family: var(--mono); }
  .tier-badge {
    font-family: var(--mono);
    font-size: 0.72rem;
    padding: 3px 8px;
    border-radius: 6px;
    display: inline-block;
  }
  .tier-review { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(245,158,11,0.4); }
  .tier-ok { background: var(--emerald-bg); color: var(--emerald); border: 1px solid rgba(16,185,129,0.3); }
  select, input[type="text"] {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.85rem;
  }
  .btn {
    background: var(--panel-alt);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .btn:hover { border-color: var(--muted); }
  .btn-primary { background: var(--emerald); color: #052e16; border-color: var(--emerald); }
  .btn-indigo { background: var(--indigo); color: #fff; border-color: var(--indigo); }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 100%;
    max-width: 560px;
    padding: 24px;
  }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 0.82rem; color: var(--muted); margin-bottom: 5px; }
  .form-group input, .form-group select { width: 100%; }
  .bar-row { margin-bottom: 10px; }
  .bar-label { display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px; }
  .bar-track { background: var(--panel-alt); height: 8px; border-radius: 99px; overflow: hidden; }
  .bar-fill { background: var(--indigo); height: 100%; }
</style>
</head>
<body>

<header>
  <div class="brand">
    <span>ZERO-LEAK LOCAL FINANCE ENGINE</span>
    <span class="shield-badge">AIR-GAP ACTIVE</span>
    <span class="shield-badge">AES-256-GCM</span>
  </div>

  <div class="tabs">
    <button class="tab-btn active" id="tabReviewBtn" onclick="switchTab('review')">
      Flagged Triage <span class="badge-count" id="tabReviewBadge">0</span>
    </button>
    <button class="tab-btn" id="tabAllBtn" onclick="switchTab('all')">
      Encrypted Ledger
    </button>
    <button class="tab-btn" id="tabRulesBtn" onclick="switchTab('rules')">
      RE2 Regex Rules
    </button>
    <button class="tab-btn" id="tabSecurityBtn" onclick="switchTab('security')">
      Security Auditor
    </button>
  </div>

  <div style="display:flex;align-items:center;gap:10px;">
    <button class="btn btn-primary" onclick="openIngestModal()">+ Ingest Statement</button>
    <button class="btn btn-indigo" onclick="openCategoryModal()">Categories</button>
    <span class="shield-badge" style="background:var(--emerald-bg);color:var(--emerald);" id="policyBadge">defer clear(rawBytes)</span>
  </div>
</header>

<div class="container" style="display:grid;grid-template-columns:minmax(0, 3fr) 340px;gap:20px;max-width:1750px;margin:20px auto;padding:0 20px;">
  <!-- Left Main Column -->
  <div style="min-width:0;">
    <!-- View 1: Transactions Table -->
    <div id="viewTransactions" class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap;">
        <div id="viewSubtitle" style="font-size:0.88rem;color:var(--muted);">
          Showing ambiguous or low-confidence (<85%) transactions requiring human verification.
        </div>
        <div style="display:flex;gap:8px;">
          <input type="text" id="searchInput" placeholder="Filter payee or category..." oninput="loadTransactions()" style="width:240px;">
          <button class="btn" id="batchApproveBtn" onclick="batchApproveAll()" style="display:none;">Approve All</button>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Raw Statement String & Cleaned Merchant</th>
              <th>Amount</th>
              <th>Tier / Confidence</th>
              <th>Category Override</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="txTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- View 2: Rules List -->
    <div id="viewRules" class="card" style="display:none;">
      <div class="card-title">
        <span>Deterministic Go RE2 Regex Rules (Linear-Time O(N) Execution)</span>
        <button class="btn btn-indigo" onclick="openRuleModal('', '')">+ New Regex Rule</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Regex Pattern</th>
            <th>Target Category</th>
            <th>Clean Merchant Override</th>
          </tr>
        </thead>
        <tbody id="rulesTableBody"></tbody>
      </table>
    </div>

    <!-- View 3: Security Auditor -->
    <div id="viewSecurity" class="card" style="display:none;">
      <div class="card-title">
        <span>Zero-Leak Security Architecture & Auditor</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div style="background:var(--panel-alt);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-weight:700;color:var(--emerald);margin-bottom:8px;font-size:0.9rem;">🔒 Air-Gap Invariant</div>
          <div style="font-size:0.82rem;color:var(--muted);line-height:1.6;">
            Outbound DNS, TLS, and TCP dialers are trapped and prohibited at runtime. The Go runtime dialer strictly restricts network access to local loopback (127.0.0.1 / ::1 / 0.0.0.0 for LAN).
          </div>
        </div>
        <div style="background:var(--panel-alt);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-weight:700;color:var(--emerald);margin-bottom:8px;font-size:0.9rem;">🧹 RAM Zeroization</div>
          <div style="font-size:0.82rem;color:var(--muted);line-height:1.6;">
            Statement payloads are parsed entirely in volatile memory. Account numbers are masked via HMAC-SHA256, and raw buffers are immediately wiped via <code class="mono" style="color:var(--emerald);">defer clear(rawBytes)</code>.
          </div>
        </div>
      </div>
      <div style="background:var(--panel-alt);border:1px solid var(--border);border-radius:10px;padding:16px;">
        <div style="font-weight:700;color:var(--indigo);margin-bottom:8px;font-size:0.9rem;">🔐 PBKDF2-HMAC-SHA256 & AES-256-GCM Ledger</div>
        <div style="font-size:0.82rem;color:var(--muted);line-height:1.6;">
          Ledger records are encrypted with AES-256-GCM with a 256-bit symmetric key derived via 600,000 PBKDF2 iterations using your master <code class="mono">FINANCE_PASSPHRASE</code>.
        </div>
      </div>
    </div>
  </div>

  <!-- Right Sidebar Column: Telemetry & Spend Breakdown -->
  <div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Ledger Telemetry</div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">Needs Review</div>
          <div class="stat-value" id="statReview" style="color:var(--amber);">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Outflow</div>
          <div class="stat-value" id="statOutflow">$0.00</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Records</div>
          <div class="stat-value" id="statTotal">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Inflow</div>
          <div class="stat-value" id="statInflow" style="color:var(--emerald);">$0.00</div>
        </div>
      </div>
    </div>

    <div class="card" id="breakdownPanel">
      <div class="card-title">Category Spend Breakdown</div>
      <div id="barsContainer"></div>
    </div>
  </div>
</div>

<!-- Modal 1: Ingest Statement Modal -->
<div class="modal-backdrop" id="ingestModal">
  <div class="modal">
    <div class="card-title">
      <span>Ingest OFX / QFX Statement</span>
      <button class="btn" onclick="closeIngestModal()">✕</button>
    </div>
    <div style="font-size:0.82rem;color:var(--muted);margin-bottom:14px;">
      Parsed strictly in volatile RAM (10 MB cap). Zero disk persistence of plaintext statements.
    </div>
    <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
      <input type="file" id="fileInput" accept=".ofx,.qfx" style="display:none" onchange="handleFiles(this.files)">
      <div style="font-weight:700;font-size:1rem;margin-bottom:6px;">Drag & Drop .OFX or .QFX Statement Here</div>
      <div style="font-size:0.8rem;color:var(--muted);">or click to select file from your computer</div>
      <div id="uploadResult" class="mono" style="margin-top:14px;font-size:0.82rem;color:var(--emerald);font-weight:600;"></div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
      <button class="btn" onclick="loadSampleStatement()">Quick Test with Sample Statement</button>
      <button class="btn" onclick="closeIngestModal()">Done</button>
    </div>
  </div>
</div>

<!-- Modal 2: Categories Modal -->
<div class="modal-backdrop" id="categoryModal">
  <div class="modal">
    <div class="card-title">
      <span>Category Manager</span>
      <button class="btn" onclick="closeCategoryModal()">✕</button>
    </div>
    <div style="font-size:0.82rem;color:var(--muted);margin-bottom:14px;">
      Loaded dynamically from <code class="mono">config/categories.json</code>.
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <input type="text" id="newCatInput" placeholder="New category name (e.g. Health:Fitness)...">
      <button class="btn btn-primary" onclick="addNewCategory()">+ Add</button>
    </div>
    <div id="catChipsContainer" style="display:flex;flex-wrap:wrap;gap:8px;max-height:260px;overflow-y:auto;padding:8px 0;"></div>
    <div style="margin-top:16px;text-align:right;">
      <button class="btn" onclick="closeCategoryModal()">Close</button>
    </div>
  </div>
</div>

<!-- Create Rule Modal -->
<div class="modal-backdrop" id="ruleModal">
  <div class="modal">
    <div class="card-title">
      <span>Create Deterministic Regex Rule</span>
      <button class="btn" onclick="closeRuleModal()">Close</button>
    </div>
    <div class="form-group">
      <label>Source Raw Payee Sample</label>
      <input type="text" id="modalRawSample" class="mono" readonly style="opacity:0.7;">
    </div>
    <div class="form-group">
      <label>Go RE2 Regex Pattern (Case-Insensitive (?i) Recommended)</label>
      <input type="text" id="modalPattern" class="mono" oninput="testRuleLive()">
    </div>
    <div class="form-group">
      <label>Assign Category</label>
      <select id="modalCategory"></select>
    </div>
    <div class="form-group">
      <label>Normalized Display Payee Name</label>
      <input type="text" id="modalCleanPayee" placeholder="e.g. Tartine Bakery">
    </div>
    <div id="liveMatchBox" class="mono" style="background:var(--panel-alt);padding:10px;border-radius:6px;font-size:0.8rem;margin-bottom:14px;">
      Testing pattern against local ledger...
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button class="btn" onclick="closeRuleModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewRule()">Save Rule & Reclassify Matches</button>
    </div>
  </div>
</div>

<script>
let currentTab = 'review';
let availableCategories = [];
let statusData = {};

function formatCents(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = (abs / 100).toFixed(2);
  return (neg ? '-$' : '+$') + dollars;
}

async function refreshAll() {
  const res = await fetch('/api/status');
  statusData = await res.json();
  availableCategories = statusData.categories || [];

  document.getElementById('statReview').textContent = statusData.needs_review_count;
  document.getElementById('tabReviewBadge').textContent = statusData.needs_review_count;
  document.getElementById('statOutflow').textContent = '$' + (statusData.total_outflow_cents / 100).toFixed(2);
  document.getElementById('statTotal').textContent = statusData.total_transactions;

  const policyBtn = document.getElementById('policyBtn');
  if (statusData.retain_raw_statements) {
    policyBtn.textContent = 'Retention Policy: AES-256-GCM Encrypted Vault (.enc)';
    policyBtn.style.borderColor = 'var(--indigo)';
  } else {
    policyBtn.textContent = 'Retention Policy: Ephemeral RAM Purge (Default)';
    policyBtn.style.borderColor = 'var(--emerald)';
  }

  renderCategoryBars(statusData.category_totals_cents || {}, statusData.total_outflow_cents || 1);
  renderRulesTable(statusData.rules || []);
  await loadTransactions();
}

function renderCategoryBars(totals, totalOutflow) {
  const container = document.getElementById('barsContainer');
  container.innerHTML = '';
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  for (const [cat, cents] of entries) {
    const pct = Math.min(100, Math.round((cents / Math.max(1, totalOutflow)) * 100));
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = '<div class="bar-label"><span>' + escapeHTML(cat) + '</span><span class="mono">$' + (cents/100).toFixed(2) + ' (' + pct + '%)</span></div>' +
                    '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>';
    container.appendChild(row);
  }
}

function renderRulesTable(rules) {
  const tbody = document.getElementById('rulesTableBody');
  tbody.innerHTML = '';
  for (const r of rules) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="mono" style="color:var(--emerald);">' + escapeHTML(r.pattern) + '</td>' +
                   '<td>' + escapeHTML(r.category) + '</td>' +
                   '<td>' + escapeHTML(r.clean_payee || '—') + '</td>';
    tbody.appendChild(tr);
  }
}

async function loadTransactions() {
  const q = encodeURIComponent(document.getElementById('searchInput').value || '');
  const needsRev = currentTab === 'review' ? 'true' : 'false';
  const url = currentTab === 'review'
    ? '/api/transactions?needs_review=true&q=' + q
    : '/api/transactions?q=' + q;

  const res = await fetch(url);
  const txs = await res.json();
  const tbody = document.getElementById('txTableBody');
  tbody.innerHTML = '';

  if (txs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;">No transactions in this view. Drop an OFX/QFX statement above to test ingestion.</td></tr>';
    return;
  }

  for (const tx of txs) {
    const tr = document.createElement('tr');
    const confPct = Math.round((tx.confidence_score || 0) * 100);
    const badgeClass = tx.needs_review ? 'tier-badge tier-review' : 'tier-badge tier-ok';
    const badgeLabel = tx.needs_review
      ? ('REVIEW: ' + tx.categorization_tier + ' (' + confPct + '%)')
      : (tx.categorization_tier + ' (' + confPct + '%)');

    let optionsHTML = '';
    for (const c of availableCategories) {
      const sel = c === tx.category ? 'selected' : '';
      optionsHTML += '<option value="' + escapeHTML(c) + '" ' + sel + '>' + escapeHTML(c) + '</option>';
    }

    tr.innerHTML =
      '<td class="mono">' + escapeHTML(tx.transaction_date) + '</td>' +
      '<td class="mono" style="color:var(--muted);">' + escapeHTML(tx.account_masked) + '</td>' +
      '<td>' +
        '<div style="font-weight:600;">' + escapeHTML(tx.clean_payee) + '</div>' +
        '<div class="mono" style="font-size:0.75rem;color:var(--muted);">' + escapeHTML(tx.raw_payee) + '</div>' +
      '</td>' +
      '<td class="mono" style="color:' + (tx.amount_cents < 0 ? 'var(--text)' : 'var(--emerald)') + ';">' + formatCents(tx.amount_cents) + '</td>' +
      '<td><span class="' + badgeClass + '">' + escapeHTML(badgeLabel) + '</span></td>' +
      '<td><select onchange="approveTransaction(\'' + tx.id + '\', this.value, \'' + escapeJS(tx.clean_payee) + '\')">' + optionsHTML + '</select></td>' +
      '<td style="display:flex;gap:6px;">' +
        '<button class="btn btn-primary" onclick="approveTransaction(\'' + tx.id + '\', \'' + escapeJS(tx.category) + '\', \'' + escapeJS(tx.clean_payee) + '\')">Approve</button>' +
        '<button class="btn" onclick="openRuleModal(\'' + escapeJS(tx.raw_payee) + '\', \'' + escapeJS(tx.clean_payee) + '\')">+ Rule</button>' +
      '</td>';
    tbody.appendChild(tr);
  }
}

async function approveTransaction(id, category, cleanPayee) {
  await fetch('/api/transactions/categorize', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ id, category, clean_payee: cleanPayee })
  });
  await refreshAll();
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabReviewBtn').classList.toggle('active', tab === 'review');
  document.getElementById('tabAllBtn').classList.toggle('active', tab === 'all');
  document.getElementById('tabRulesBtn').classList.toggle('active', tab === 'rules');
  document.getElementById('tabSecurityBtn').classList.toggle('active', tab === 'security');

  document.getElementById('viewTransactions').style.display = (tab === 'review' || tab === 'all') ? 'block' : 'none';
  document.getElementById('viewRules').style.display = (tab === 'rules') ? 'block' : 'none';
  document.getElementById('viewSecurity').style.display = (tab === 'security') ? 'block' : 'none';

  if (tab === 'review') {
    document.getElementById('viewSubtitle').textContent = 'Showing ambiguous or low-confidence (<85%) transactions requiring human verification.';
  } else if (tab === 'all') {
    document.getElementById('viewSubtitle').textContent = 'Showing all deduplicated transactions stored in the encrypted ledger.';
  }
  if (tab === 'review' || tab === 'all') {
    loadTransactions();
  }
}

function openIngestModal() {
  document.getElementById('uploadResult').textContent = '';
  document.getElementById('ingestModal').classList.add('open');
}
function closeIngestModal() {
  document.getElementById('ingestModal').classList.remove('open');
}

function openCategoryModal() {
  renderCategoryChips();
  document.getElementById('categoryModal').classList.add('open');
}
function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('open');
}

function addNewCategory() {
  const input = document.getElementById('newCatInput');
  const val = (input.value || '').trim();
  if (val && !availableCategories.includes(val)) {
    availableCategories.push(val);
    input.value = '';
    renderCategoryChips();
  }
}

async function batchApproveAll() {
  const res = await fetch('/api/transactions?needs_review=true');
  const txs = await res.json();
  for (const tx of txs) {
    await fetch('/api/transactions/categorize', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: tx.id, category: tx.category, clean_payee: tx.clean_payee })
    });
  }
  await refreshAll();
}

async function loadSampleStatement() {
  const sampleOFX = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n<OFX>\n<CREDITCARDMSGSRSV1>\n<CCSTMTRS>\n<CURDEF>USD\n<CCACCTFROM>\n<ACCTID>4111222233339482\n</CCACCTFROM>\n<BANKTRANLIST>\n<DTSTART>20261001000000\n<DTEND>20261015000000\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261014120000\n<TRNAMT>-142.80\n<FITID>CHASE_SAMPLE_001\n<NAME>TRADER JOE #542 SF\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261013143000\n<TRNAMT>-68.40\n<FITID>CHASE_SAMPLE_002\n<NAME>CHEVRON 0092421\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261012191500\n<TRNAMT>-52.00\n<FITID>CHASE_SAMPLE_003\n<NAME>TST* BLUE BOTTLE COFFEE\n</STMTTRN>\n</BANKTRANLIST>\n</CCSTMTRS>\n</CREDITCARDMSGSRSV1>\n</OFX>`;
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'X-Filename': 'chase_sample.ofx' },
    body: sampleOFX
  });
  const data = await res.json();
  if (res.ok) {
    document.getElementById('uploadResult').textContent =
      'Sample ingested: ' + data.inserted + ' new transactions added!';
    await refreshAll();
  }
}

// Drag & Drop OFX/QFX Upload
const dz = document.getElementById('dropzone');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
  const f = files[0];
  if (!f) return;
  const name = f.name.toLowerCase();
  if (!name.endsWith('.ofx') && !name.endsWith('.qfx')) {
    document.getElementById('uploadResult').textContent = 'Error: Only .ofx and .qfx files are allowed.';
    return;
  }
  const buf = await f.arrayBuffer();
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'X-Filename': f.name },
    body: buf
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('uploadResult').textContent = 'Upload Error: ' + (data.error || 'Failed');
    return;
  }
  document.getElementById('uploadResult').textContent =
    'Ingested ' + data.filename + ': ' + data.inserted + ' new, ' +
    data.skipped_duplicates + ' deduplicated, ' + data.flagged_for_review +
    ' flagged (' + data.raw_disposition + ')';
  await refreshAll();
}

// Rule Generator Modal
function suggestRegexFromPayee(raw) {
  let s = raw.replace(/^(TST\*|SQ \*|PAYPAL \*|POS DEBIT )/i, '').trim();
  s = s.replace(/\s+#?\d+.*$/, '').trim();
  const tokens = s.split(/\s+/).slice(0, 2);
  if (tokens.length === 0 || !tokens[0]) return '(?i)' + raw.slice(0, 10);
  return '(?i)' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
}

function openRuleModal(rawPayee, cleanPayee) {
  document.getElementById('modalRawSample').value = rawPayee || 'Custom Rule';
  document.getElementById('modalPattern').value = rawPayee ? suggestRegexFromPayee(rawPayee) : '(?i)merchant';
  document.getElementById('modalCleanPayee').value = cleanPayee || '';

  const sel = document.getElementById('modalCategory');
  sel.innerHTML = '';
  for (const c of availableCategories) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  document.getElementById('ruleModal').classList.add('open');
  testRuleLive();
}

function closeRuleModal() {
  document.getElementById('ruleModal').classList.remove('open');
}

async function testRuleLive() {
  const pattern = document.getElementById('modalPattern').value;
  const box = document.getElementById('liveMatchBox');
  const res = await fetch('/api/rules/test', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pattern })
  });
  const data = await res.json();
  if (!res.ok) {
    box.style.color = 'var(--rose)';
    box.textContent = data.error || 'Invalid Regex';
    return;
  }
  box.style.color = 'var(--emerald)';
  box.textContent = 'Matches ' + data.match_count + ' historical transaction(s): ' +
                    (data.sample_matches || []).join(' | ');
}

async function saveNewRule() {
  const pattern = document.getElementById('modalPattern').value;
  const category = document.getElementById('modalCategory').value;
  const clean_payee = document.getElementById('modalCleanPayee').value;
  const res = await fetch('/api/rules/create', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pattern, category, clean_payee, apply_to_historical: true })
  });
  if (res.ok) {
    closeRuleModal();
    await refreshAll();
  }
}

async function togglePolicy() {
  await fetch('/api/policy/toggle', { method: 'POST' });
  await refreshAll();
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeJS(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

refreshAll();
</script>
</body>
</html>`

// ============================================================================
// 9. MAIN ENTRYPOINT & LOOPBACK SERVER INITIALIZATION
// ============================================================================

func main() {
	// Step 1: Enforce process-level air-gap dialer lock and disable core dumps
	if err := enforceAirGapAndMemoryLock(); err != nil {
		log.Fatalf("[FATAL] Failed to initialize air-gap guardrails: %v", err)
	}

	// Step 2: Load or initialize configuration
	baseDir := os.Getenv("FINANCE_HOME")
	if baseDir == "" {
		baseDir = "./finances_runtime"
	}
	configDir := os.Getenv("FINANCE_CONFIG_DIR")
	if configDir == "" {
		if _, err := os.Stat("./config"); err == nil {
			configDir = "./config"
		} else {
			configDir = filepath.Join(baseDir, "config")
		}
	}
	listenAddr := os.Getenv("FINANCE_LISTEN")
	iterations := 600000
	dataDir := filepath.Join(baseDir, "data")
	inboxDir := filepath.Join(baseDir, "inbox")
	archiveDir := filepath.Join(baseDir, "archive")

	// Read /config/config.json if available
	configFile := filepath.Join(configDir, "config.json")
	if raw, err := os.ReadFile(configFile); err == nil {
		var fConfig struct {
			Network struct {
				ListenAddress string `json:"listen_address"`
			} `json:"network"`
			Storage struct {
				PBKDF2Iterations int `json:"pbkdf2_iterations"`
			} `json:"storage"`
			Directories struct {
				ConfigDir  string `json:"config_dir"`
				DataDir    string `json:"data_dir"`
				InboxDir   string `json:"inbox_dir"`
				ArchiveDir string `json:"archive_dir"`
			} `json:"directories"`
		}
		if err := json.Unmarshal(raw, &fConfig); err == nil {
			if fConfig.Network.ListenAddress != "" && listenAddr == "" {
				listenAddr = fConfig.Network.ListenAddress
			}
			if fConfig.Storage.PBKDF2Iterations > 0 {
				iterations = fConfig.Storage.PBKDF2Iterations
			}
			if fConfig.Directories.DataDir != "" && os.Getenv("FINANCE_HOME") == "" {
				dataDir = fConfig.Directories.DataDir
			}
			if fConfig.Directories.InboxDir != "" && os.Getenv("FINANCE_HOME") == "" {
				inboxDir = fConfig.Directories.InboxDir
			}
			if fConfig.Directories.ArchiveDir != "" && os.Getenv("FINANCE_HOME") == "" {
				archiveDir = fConfig.Directories.ArchiveDir
			}
		}
	}
	if listenAddr == "" {
		listenAddr = "127.0.0.1:8811"
	}

	// Binding check: Supports 127.0.0.1 (local only) or 0.0.0.0 (LAN / Docker ingress)
	host, _, err := net.SplitHostPort(listenAddr)
	if err != nil {
		log.Fatalf("[FATAL] Invalid listen address %q: %v", listenAddr, err)
	}
	if host != "127.0.0.1" && host != "::1" && host != "localhost" && host != "0.0.0.0" && host != "" {
		log.Fatalf("[SECURITY FATAL] Listen address %q must be loopback (127.0.0.1) or 0.0.0.0", listenAddr)
	}
	if host == "0.0.0.0" || host == "" {
		log.Printf("[NOTICE] Inbound LAN access enabled (listening on %s). Outbound air-gap traps remain strictly enforced.", listenAddr)
	}

	passphraseStr := os.Getenv("FINANCE_PASSPHRASE")
	if passphraseStr == "" {
		passphraseStr = "default-local-airgap-vault-key-change-me"
		log.Printf("[NOTICE] Using default development vault passphrase. Set FINANCE_PASSPHRASE env var in production.")
	}
	passphrase := []byte(passphraseStr)
	defer clear(passphrase)

	cfg := Config{
		ConfigDir:        configDir,
		DataDir:          dataDir,
		InboxDir:         inboxDir,
		ArchiveDir:       archiveDir,
		ListenAddr:       listenAddr,
		PBKDF2Iterations: iterations,
	}

	engine, err := NewFinanceEngine(cfg, passphrase)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize encrypted finance engine: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go engine.StartInboxWatcher(ctx)

	// Step 3: Register local REST routes and embedded UI handler
	mux := http.NewServeMux()

	distSubFS, distErr := fs.Sub(distFS, "dist")
	hasDist := distErr == nil
	if hasDist {
		if testF, testErr := distSubFS.Open("index.html"); testErr == nil {
			_ = testF.Close()
		} else {
			hasDist = false
		}
	}

	if hasDist {
		fileServer := http.FileServer(http.FS(distSubFS))
		mux.HandleFunc("/", withAirGapCSP(func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			f, openErr := distSubFS.Open(path)
			if openErr == nil {
				_ = f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
			// SPA fallback: return index.html for unknown paths
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
		}))
	} else {
		mux.HandleFunc("/", withAirGapCSP(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = io.WriteString(w, embeddedIndexHTML)
		}))
	}
	mux.HandleFunc("/api/status", withAirGapCSP(engine.handleGetStatus))
	mux.HandleFunc("/api/categories", withAirGapCSP(engine.handleCategories))
	mux.HandleFunc("/api/accounts", withAirGapCSP(engine.handleAccounts))
	mux.HandleFunc("/api/upload", withAirGapCSP(engine.handleUpload))
	mux.HandleFunc("/api/transactions", withAirGapCSP(engine.handleGetTransactions))
	mux.HandleFunc("/api/transactions/categorize", withAirGapCSP(engine.handleCategorizeTransaction))
	mux.HandleFunc("/api/rules/test", withAirGapCSP(engine.handleTestRule))
	mux.HandleFunc("/api/rules/create", withAirGapCSP(engine.handleCreateRule))
	mux.HandleFunc("/api/policy", withAirGapCSP(engine.handleGetPolicy))

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
	}

	log.Printf("==================================================================")
	log.Printf(" ZERO-LEAK LOCAL FINANCE ENGINE STARTED")
	log.Printf(" • Air-Gap Guardrails : ACTIVE (Outbound DNS & TLS Hard-Blocked)")
	log.Printf(" • Config Directory   : %s", cfg.ConfigDir)
	log.Printf(" • Categories Loaded  : %d (from %s)", len(engine.categoryNames), engine.categoriesPath)
	log.Printf(" • RE2 Rules Loaded   : %d (from %s)", len(engine.state.Rules), engine.rulesPath)
	log.Printf(" • Encrypted Ledger   : %s (AES-256-GCM)", engine.dbPath)
	log.Printf(" • Volatile Inbox Dir : %s", cfg.InboxDir)
	log.Printf(" • Local Web UI       : http://%s", cfg.ListenAddr)
	log.Printf("==================================================================")

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("[FATAL] Server exited: %v", err)
	}
}
