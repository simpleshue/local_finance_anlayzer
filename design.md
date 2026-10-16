# Local-Only Financial Ingestion & Categorization Engine (Go Architecture)
## System Architecture, Threat Model, and Implementation Specification

---

## 1. Executive Summary & Security Objectives

This document specifies the architecture for a completely local, single-tenant personal financial ingestion, classification, review, and analytics pipeline compiled into a single, standalone Go static binary.

### Core Security Invariants

- **Zero External Egress**: The system operates without outbound network access. No telemetry, third-party APIs, external analytics, remote model inference endpoints, external CDNs/fonts, or cloud dependencies are permitted.
- **Minimal Dependency Supply Chain**: The backend relies almost exclusively on the Go Standard Library (`net/http`, `crypto/aes`, `crypto/cipher`, `crypto/sha256`, `crypto/hmac`, `embed`, `regexp`). The entire application—including the HTML/CSS/JS frontend—compiles into a single auditable static binary deployed inside a `FROM scratch` container or minimal Proxmox VE LXC.
- **Deterministic Deduplication**: Ingesting overlapping statement exports (e.g., consecutive 30-day OFX/QFX dumps) is idempotent without mutating historical records or user-confirmed labels, relying on standard `<FITID>` identifiers.
- **Data Encryption at Rest & Explicit RAM Zeroization**: All financial records, parsed metadata, and rule databases are protected using authenticated encryption (AES-256-GCM / SQLCipher). Raw uploaded statements are processed strictly in mutable `[]byte` slices in volatile memory (`bytes.Buffer` / `tmpfs`), explicitly zeroed out via Go's built-in `clear()` builtin before garbage collection, and either purged or encrypted with AES-256-GCM prior to disk archival.
- **Air-Gap Enforceability**: Network isolation is provable and enforceable at the hypervisor/host level (PVE LXC / Docker), the operating system kernel level, and inside the Go runtime (`net.DefaultResolver` & custom `http.RoundTripper` traps).
- **Completely Air-Gapped Frontend**: The user interface is compiled directly into the Go binary via `//go:embed` (zero external files or CDN links) and communicates strictly over a loopback address (`127.0.0.1`) or local Unix domain socket.

---

## 2. Threat Model & Privacy Analysis

### 2.1 Threat Vectors & Mitigations

| Threat Vector | Source | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Supply-Chain / Transitive Telemetry** | Bloated third-party package trees phoning home or executing install scripts. | High | Go standard library handles HTTP, crypto, regex, and UI embedding; vendor directory locked (`go build -mod=vendor`); runtime dialer trap blocks non-loopback sockets. |
| **Frontend Assets / CDN Leaks** | Web UI loading external webfonts, tracking pixels, or JS bundles (Tailwind CDN, Google Fonts, cdnjs). | High | Strict Local Content Security Policy (`default-src 'self'`); all UI assets compiled directly into the binary via `//go:embed`. |
| **DNS Leaks** | Embedded resolvers or heuristic lookups. | Medium | Go built with `-tags netgo`, `net.DefaultResolver.PreferGo = true` overridden to panic/reject all non-loopback lookups, empty `/etc/resolv.conf`. |
| **Model Inversion / Training Exfiltration** | Using remote cloud AI/LLM APIs (OpenAI, Anthropic, etc.). | Critical | 100% offline inference using local weights (Ollama/llama.cpp bound strictly to loopback `127.0.0.1` or Unix domain sockets). |
| **Disk Inspection / Cold Boot** | Stolen laptop, compromised host, or unauthorized storage access. | High | Application-level SQLite encryption (SQLCipher) with a user-supplied key, layered on top of ZFS/LUKS storage pools. |
| **Plaintext Statement Remanence (Disk & RAM)** | Unencrypted raw `.ofx`/`.qfx` files remaining on disk or lingering in heap memory exposing `<ACCTID>` and `<BANKID>`. | High | Mutable `[]byte` ingestion buffers zeroed immediately via `clear(buf)` inside defer, `tmpfs` (RAM-only) mount for `/opt/finances/inbox/`, and optional AES-256-GCM `.enc` encryption for archived payloads. |
| **Temporary / Swap File Remanence** | OS memory swap, temporary file dumps, core dumps. | Medium | Process-level memory locking (`unix.Mlockall`), disabling core dumps (`RLIMIT_CORE = 0`), disabling swap inside container, and zero-fill unlinking of drop-folder files. |
| **Malicious Upload Payload** | Manipulated or oversized upload payload via frontend form. | Medium | Strict extension gating (`.ofx`, `.qfx`), `http.MaxBytesReader` enforcing a strict 10 MB RAM cap (never spilling to disk temp files). |

---

## 3. High-Level System Architecture

```
[User Downloads OFX/QFX on Host Machine]
        │                           │
        │ (Method A: tmpfs Drop)    │ (Method B: Browser Drag & Drop)
        ▼                           ▼
[ Volatile RAM Inbox ]      [ Local Web UI / API Endpoint ]
        │                           │
        └─────────────┬─────────────┘
                      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │    PROXMOX LXC / FROM SCRATCH DOCKER (AIR-GAPPED)           │
 │    [NO VIRTUAL NIC / --network none / SINGLE GO BINARY]     │
 │                                                             │
 │   0. Defense-in-Depth Go Runtime Isolation Layer            │
 │      ├── Custom net.Dialer & Resolver Trap (Loopback Only)  │
 │      └── unix.Mlockall & Core Dump Lock (RLIMIT_CORE = 0)   │
 │                                                             │
 │   1. In-Memory Ingestion Engine (Zero-Disk Spill)           │
 │      ├── Method A: tmpfs Watcher (/inbox/ -> Zero & Unlink) │
 │      ├── Method B: http.MaxBytesReader -> Mutable []byte    │
 │      ├── Zero-Allocation OFX / QFX Streaming Lexer          │
 │      ├── Deferred RAM Wipe: defer clear(rawBytes)           │
 │      └── Strict Ephemeral RAM Purge (No Disk Archiving)     │
 │               │                                             │
 │               ▼                                             │
 │   2. Normalization & Deduplication                          │
 │      └── Deterministic Conflict Resolution (FITID Keyed)    │
 │               │                                             │
 │               ▼                                             │
 │   3. Multi-Tier Categorization & Confidence Scoring         │
 │      ├── Tier 1: Go regexp Deterministic Pattern Matcher    │
 │      ├── Tier 2: Historical Memory Matcher                  │
 │      ├── Tier 3: Local Offline SLM / LLM (Ollama / GGUF)    │
 │      └── Confidence Tagging (`needs_review` flag)           │
 │               │                                             │
 │               ▼                                             │
 │   4. Persistence Layer                                      │
 │      ├── Encrypted State Database (AES-256-GCM Ledger)      │
 │      └── Zero Raw Statement Remanence (0 Raw Files on Disk) │
 │               │                                             │
 │               ▲                                             │
 │               ▼                                             │
 │   5. Embedded Web UI & REST Server (net/http + //go:embed)  │
 │      ├── Drag-and-Drop OFX/QFX Direct Statement Importer    │
 │      ├── Flagged / Ambiguous Transaction Inbox              │
 │      ├── Single-Click Inline Category Override              │
 │      └── "Create Rule From Payee" Generator                 │
 └─────────────────────────────────────────────────────────────┘
                       │
                       ▼
      [ Bound to 127.0.0.1:8000 or Unix Domain Socket ]
```

---

## 4. Pipeline Component Specifications

### 4.1 Ingestion, Normalization & Zero-Plaintext Storage Engine

The Go ingestion subsystem supports two ingestion paths, both strictly enforcing zero unencrypted disk persistence and explicit RAM zeroization:

1. **Volatile Drop Folder Ingestion (`tmpfs`)**: Background goroutine scans `/opt/finances/inbox/` (mounted in RAM via `tmpfs`). Once read into a pre-allocated `[]byte` slice, the source file is overwritten with zeros, fsynced, and unlinked immediately, and the memory buffer is wiped via `defer clear(buf)` after parsing.
2. **Direct Browser Upload**: Drag-and-drop or file picker in the local web interface that sends an OFX or QFX file over `POST /api/upload`. Unlike standard multipart handlers that spill files $> 10\text{ MB}$ to `/tmp` on disk, the Go handler wraps `r.Body` in `http.MaxBytesReader` and streams directly into a memory buffer (`io.ReadAll`), guaranteeing zero temporary disk files.

#### Directory Layout

Because the frontend UI is embedded directly into the Go binary via `//go:embed`, no static web asset folders exist on disk at runtime:

```
/opt/finances/
├── bin/
│   └── finance-engine  # Single static Go binary (includes embedded UI)
├── inbox/              # Mounted as tmpfs (RAM-only); files zeroed & unlinked after read
├── archive/            # Encrypted statements (*.ofx.enc) ONLY if retain_raw_statements=true
├── data/
│   └── ledger.db       # Encrypted SQLite / SQLCipher database
└── config/
    ├── config.json     # System & retention security policies (parsed via standard encoding/json)
    └── rules.json      # Deterministic categorization rules
```

*(Note: Using `.json` instead of `.yaml` for configuration eliminates the need for any third-party YAML parser dependency, relying solely on Go's standard `encoding/json` package).*

#### Statement Format Parser: Native Go OFX / QFX Lexer

Because older bank OFX 1.x files use unclosed SGML tags (e.g., `<TRNAMT>-42.50` without a closing `</TRNAMT>`) while OFX 2.x uses strict XML, the engine includes a compact (~120 line), dependency-free state-machine lexer written in pure Go operating directly over `[]byte`:

- `<DTPOSTED>` $\rightarrow$ `TransactionDate` (Parsed from `YYYYMMDDHHMMSS` to ISO `YYYY-MM-DD`)
- `<TRNAMT>` $\rightarrow$ `Amount` (Parsed to `int64` cents or `float64` signed value: negative = debit, positive = credit)
- `<NAME>` / `<MEMO>` $\rightarrow$ `RawPayee`
- `<FITID>` $\rightarrow$ `ID` (Primary key component: Financial Institution Transaction ID)
- `<ACCTID>` $\rightarrow$ `AccountID` (Hashed via `crypto/hmac` + `crypto/sha256` before database persistence; raw account numbers are wiped from the buffer immediately after hashing)

---

### 4.2 Raw Statement Retention & Memory Hygiene Specification

Because raw `.ofx` and `.qfx` files are plaintext SGML/XML containing sensitive metadata (full `<ACCTID>`, `<BANKID>`, and balance snapshots), persisting raw statement files to disk in any format (even encrypted) is prohibited.

#### Architectural Decision: Dropped Raw Statement Vault Archive
Earlier drafts considered an AES-256-GCM encrypted vault mode (`*.ofx.enc`) for statement payloads. **This mode was explicitly dropped** to adhere to the core zero-remanence security invariant:
1. **Zero Raw Statement Disk Footprint**: Raw financial statement payloads never touch non-volatile storage. They exist exclusively in volatile memory slices during ingestion.
2. **Explicit RAM Zeroization**: Once parsed and committed into the authenticated AES-256-GCM ledger state, the byte buffer is overwritten with zeroes in place via `defer clear(rawBytes)`.
3. **No Plaintext CSV Support**: Ingestion is strictly restricted to authenticated `.ofx` and `.qfx` formats. Unstandardized `.csv` file ingestion is unsupported to prevent unverified account mappings and metadata leakage.

#### Post-Ingest Retention Policy: Pure Ephemeral Purge Mode
- The uploaded or dropped `.ofx`/`.qfx` payload is read into a mutable `[]byte` slice capped strictly at 10 MB in volatile RAM.
- Transactions are extracted and deduplicated into the encrypted ledger (`data/ledger.db`).
- `clear(rawBytes)` overwrites every byte of the slice in RAM with `0x00` immediately before returning.
- If parsing fails, the error summary (line number and syntax exception, stripped of financial values) is returned to the UI, and the buffer is zeroed immediately.
- The `archive/` directory is not used for statement storage.

```go
// Package vault provides zero-plaintext statement handling, explicit RAM zeroization,
// and authenticated AES-256-GCM encryption using only the Go standard library.
package vault

import (
	"bytes"
	"compress/zlib"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
	"os"
	"path/filepath"
)

var MagicHeader = []byte("OFXENC01")

// DeriveKey implements PBKDF2-HMAC-SHA256 using strictly the Go standard library.
func DeriveKey(passphrase []byte, salt []byte, iterations int) []byte {
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
	return dk
}

// ArchiveEncryptedStatement compresses and encrypts raw OFX bytes in RAM before writing .enc to disk.
func ArchiveEncryptedStatement(rawBytes []byte, filename string, archiveDir string, passphrase []byte) (string, error) {
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", err
	}

	key := DeriveKey(passphrase, salt, 600000)
	defer clear(key) // Wipe derived key from RAM immediately upon exit

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, aesgcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Compress in memory
	var compressedBuf bytes.Buffer
	zw, err := zlib.NewWriterLevel(&compressedBuf, zlib.BestCompression)
	if err != nil {
		return "", err
	}
	if _, err := zw.Write(rawBytes); err != nil {
		return "", err
	}
	zw.Close()
	compressedBytes := compressedBuf.Bytes()
	defer clear(compressedBytes) // Wipe compressed plaintext from RAM

	safeName := filepath.Base(filename)
	ciphertext := aesgcm.Seal(nil, nonce, compressedBytes, []byte(safeName))

	targetPath := filepath.Join(archiveDir, safeName+".enc")
	f, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := f.Write(MagicHeader); err != nil {
		return "", err
	}
	if _, err := f.Write(salt); err != nil {
		return "", err
	}
	if _, err := f.Write(nonce); err != nil {
		return "", err
	}
	if _, err := f.Write(ciphertext); err != nil {
		return "", err
	}
	if err := f.Sync(); err != nil {
		return "", err
	}

	return targetPath, nil
}

// SecureUnlink overwrites a file on tmpfs/disk with zeros before unlinking.
func SecureUnlink(path string) error {
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
	f.Sync()
	f.Close()
	return os.Remove(path)
}
```

---

### 4.3 Deduplication Architecture

Because OFX/QFX statements provide a unique institution-assigned transaction identifier (`<FITID>`), deduplication is deterministic and immune to false collisions across overlapping download windows:

$$\text{PrimaryKey} = \text{HMAC-SHA256}(\text{account\_id}) \mathbin{\Vert} \text{fit\_id}$$

Incoming records are evaluated against the database using SQLite's `INSERT OR IGNORE` strategy inside a single atomic transaction (`tx, _ := db.Begin()`). Existing historical records, manually assigned categories, and user verification flags remain immutable if a transaction is re-encountered in subsequent statement uploads or folder drops.

---

### 4.4 Multi-Tier Categorization & Confidence Assessment

Every parsed OFX transaction passes through a tiered waterfall and is assigned a `ConfidenceScore` $\in [0.0, 1.0]$. Any transaction with a score below $0.85$ or matching ambiguous fallback categories is flagged with `NeedsReview = true`.

```
[Raw Transaction String from <NAME> / <MEMO>]
                      │
                      ▼
[Tier 1: Compiled Go regexp]  ── (Match?) ──► Assign Category, Confidence = 1.0, NeedsReview = false
                      │ (No)
                      ▼
[Tier 2: Historical Memory]   ── (Match?) ──► Assign Category, Confidence = 0.95, NeedsReview = false
                      │ (No)
                      ▼
[Tier 3: Local Offline LLM]   ── (Match?) ──► Assign Category, Confidence = [Model Confidence],
                                              NeedsReview = (Confidence < 0.85)
                      │ (No / Parse Error)
                      ▼
[Fallback: "Uncategorized"]   ──────────────► Assign Category = "Uncategorized", NeedsReview = true
```

*(Note: Because Go's standard `regexp` package uses the RE2 engine, it guarantees linear-time $O(N)$ execution and is completely immune to Regular Expression Denial of Service [ReDoS] attacks when testing user-supplied regex patterns).*

---

## 5. Frontend & Review Interface Architecture

To preserve security, the user interface is compiled directly into the Go binary and introduces zero external scripts.

### 5.1 Technology Choices

- **Backend API & Asset Server**: Standard library `net/http` (utilizing Go 1.22+ enhanced routing mux `http.NewServeMux()`) strictly bound to `127.0.0.1:8000` or a Unix domain socket.
- **Static Asset Embedding**: Go's native `//go:embed ui/*` bundles `index.html`, `app.js`, and `style.css` inside the read-only data segment of the compiled binary.
- **Frontend Runtime**: Pure vanilla HTML5, CSS, and modern JavaScript (ES6 Modules). Zero build steps and zero external CDN links.
- **Air-Gap Content Security Policy (CSP) Middleware**:

```go
w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none';")
w.Header().Set("X-Content-Type-Options", "nosniff")
```

---

### 5.2 UI Functional Views

#### View 0: Statement Upload & Ingestion Zone
- **Purpose**: Allows uploading downloaded `.ofx` or `.qfx` files directly from the browser window without requiring terminal access or directory copying.
- **Visual Presentation**: A persistent drag-and-drop zone at the top of the dashboard with an explicit security status indicator (*RAM-Only Zeroization Active* or *AES-256-GCM Vault Active*).
- **Functionality**:
  - Drag and drop one or more `.ofx`/`.qfx` files or browse local disk.
  - Direct client-side validation rejecting non-OFX/QFX extensions before transfer.
  - Uploads to `POST /api/upload`, reads directly into a non-spooled Go `[]byte` slice, processes transactions, executes the configured retention policy, and calls `clear(rawBytes)`.
  - Returns real-time ingest stats:
    - Total transactions parsed
    - New transactions added
    - Duplicates skipped (deduplicated)
    - Items requiring review
    - Raw file disposition (`zeroed_from_ram` or `encrypted_to_vault`)
  - Instantly updates the review queue without requiring a full page reload.

#### View 1: Flagged Transaction Review Queue ("Triage Inbox")
- **Purpose**: Surfaces all transactions where `needs_review = 1` or `category = 'Uncategorized'`.
- **Visual Presentation**:
  - High-visibility color badge (amber/red) denoting Ambiguous or Low Confidence.
  - Display of raw bank string vs. cleaned merchant name.
  - Displays the tier that suggested the category (e.g., `Local-LLM (72%)` or `Uncategorized`).
- **Interactive Controls**:
  - **Quick-Select Category Dropdown**: Change category in place (keyboard-accessible: hotkeys 1-9 for top categories).
  - **"Rule Generator" Button**: Opens a modal to persist a permanent regex rule based on this payee string.
  - **"Approve" Checkmark**: Sets `user_verified = 1`, `needs_review = 0`, and records the pair into Tier 2 historical memory.

#### View 2: "Create Rule From Pattern" Modal
When the user clicks "Create Rule" on any transaction:
1. The UI extracts candidate substrings from the raw payee (e.g., raw text `TST* BLUE BOTTLE COFFEE #12 SAN FRANCISCO CA` auto-suggests pattern `(?i)blue\s+bottle`).
2. The user selects or edits the pattern and assigns the target category (e.g., `Dining:Coffee`).
3. The UI runs a test query against the local SQLite database via Go's RE2 engine and live-previews how many historical unreviewed transactions this new rule would match and reclassify.
4. On user confirmation:
   - The rule is written atomically to `config/rules.json` and hot-reloaded in memory.
   - A batch update reclassifies all matching unverified transactions in the database.

#### View 3: Ledger & Expense Breakdown
- Filterable table by Account, Category, Date range, and Verification status.
- Simple client-side SVG bar charts / monthly spend totals computed directly in browser JavaScript.

---

### 5.3 Frontend REST Endpoints (Local-Only)

All endpoints accept and return JSON over `http://127.0.0.1:8000`:

#### `POST /api/upload`
Direct statement file upload endpoint. Enforces `http.MaxBytesReader(w, r.Body, 10<<20)` (10 MB strict RAM limit) and reads file parts directly into memory without calling `r.ParseMultipartForm` (which otherwise writes temp files to disk).

**Response:**
```json
{
  "filename": "Chase9482_20261015.ofx",
  "status": "success",
  "total_parsed": 48,
  "inserted": 12,
  "skipped_duplicates": 36,
  "flagged_for_review": 3,
  "raw_disposition": "zeroed_from_ram"
}
```

#### `GET /api/transactions?needs_review=true`
Lists transactions awaiting confirmation.

#### `POST /api/transactions/{id}/categorize`
Manually overrides a single transaction's category:
```json
{
  "category": "Dining:Restaurants",
  "clean_payee": "Blue Bottle Coffee",
  "verified": true
}
```

#### `POST /api/rules/test`
Tests a candidate regex pattern against the database using Go's linear-time `regexp.Compile` before saving:
```json
{
  "pattern": "(?i)blue\\s+bottle"
}
```

**Response:**
```json
{
  "match_count": 14,
  "sample_matches": [
    "TST* BLUE BOTTLE COFFEE #12",
    "BLUE BOTTLE COFFEE OAKLAND"
  ]
}
```

#### `POST /api/rules/create`
Appends the rule to `config/rules.json`, recompiles the in-memory regex slice, and executes an in-place database batch update:
```json
{
  "category": "Dining:Coffee",
  "pattern": "(?i)blue\\s+bottle",
  "apply_to_historical": true
}
```

---

## 6. Multi-Layer Zero-Leak Enforcement Specifications

Defense-in-depth requires that network isolation and memory hygiene do not rely on a single failure point. The system combines Go runtime dialer locks, operating system controls, and hypervisor/container isolation.

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3: HYPERVISOR / RUNTIME ISOLATION                         │
│ • Proxmox VE LXC: Zero virtual network interfaces (no net0)      │
│ • Docker: `FROM scratch` container run with `--network none`     │
│ • Volatile Mounts: `/opt/finances/inbox` mounted on RAM (tmpfs)  │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────┐
│ LAYER 2: CONTAINER OS LEVEL ISOLATION                           │
│ • Host file: /etc/resolv.conf is empty (immutable: chattr +i)   │
│ • Linux iptables / nftables default DROP rule on OUTPUT          │
│ • Swap disabled (`swapoff -a`) to prevent plaintext RAM paging   │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────┐
│ LAYER 1: IN-PROCESS GO RUNTIME SAFETY                           │
│ • Lock process pages in RAM (`unix.Mlockall`) & disable core dump│
│ • Override `http.DefaultTransport` & `net.DefaultResolver`       │
│ • Hard-block any IP/socket other than 127.0.0.1 / ::1 / AF_UNIX  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.1 Layer 1: In-Process Go Runtime Guardrails (`internal/security/guard.go`)

During program initialization (`init()`), before `main()` starts the HTTP server or initializes the database, the Go binary locks its memory pages from being swapped to disk, disables core dumps, and replaces the global `net.DefaultResolver` and `http.DefaultTransport` with a strict loopback-only air-gap guard:

```go
// Package security enforces process-level network isolation, memory locking,
// and core-dump prevention inside the Go runtime.
package security

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

var ErrEgressBlocked = errors.New("[SECURITY VIOLATION] outbound network connection blocked by air-gap policy")

// EnforceAirGapAndMemoryLock runs at startup to lock process memory and trap all outbound sockets.
func EnforceAirGapAndMemoryLock() error {
	// 1. Disable core dumps (RLIMIT_CORE = 0) so crashes never dump OFX buffers or keys to disk
	var zeroLimit syscall.Rlimit
	if err := syscall.Setrlimit(syscall.RLIMIT_CORE, &zeroLimit); err != nil {
		return fmt.Errorf("failed to disable core dumps: %w", err)
	}

	// 2. Lock current and future memory allocations into physical RAM (prevent OS swap paging)
	// Note: Requires CAP_IPC_LOCK or running inside container with appropriate ulimit -l
	_ = syscall.Mlockall(syscall.MCL_CURRENT | syscall.MCL_FUTURE)

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
		if network == "unix" || network == "unixgram" || network == "unixpacket" {
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
		if ip == nil || !ip.IsLoopback() {
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
```

---

### 6.2 Layer 2: Operating System Isolation & RAM-Only Staging

#### Disable Resolvers & Swap
Ensure no DNS servers are reachable and prevent the OS kernel from paging in-memory OFX buffers to physical swap space:
```bash
swapoff -a
echo "" > /etc/resolv.conf
chattr +i /etc/resolv.conf
```

#### Mount `inbox/` and `/tmp` as Volatile RAM (`tmpfs`)
Ensure any file dropped into `inbox/` resides strictly in volatile RAM:
```bash
mount -t tmpfs -o size=64M,mode=0700 tmpfs /opt/finances/inbox
mount -t tmpfs -o size=64M,mode=1777 tmpfs /tmp
```

#### Loopback-Only IPTables Rules
```bash
# Drop all outbound and inbound packets by default
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Allow loopback interface communication only (for local UI & local Ollama socket)
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
```

---

### 6.3 Layer 3: Single-Binary Container & Hypervisor Isolation

Because Go compiles into a standalone static executable (including the embedded UI), the container does not require a shell (`/bin/sh`), package manager, or C runtime if built statically:

#### Multi-Stage `FROM scratch` Dockerfile
```dockerfile
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /src
COPY . .
# Compile static binary with netgo, SQLCipher support, and stripped symbols
RUN CGO_ENABLED=1 GOOS=linux go build \
    -tags "netgo osusergo sqlite_omit_load_extension" \
    -ldflags="-s -w -extldflags '-static'" \
    -o /finance-engine ./cmd/server

FROM scratch
COPY --from=builder /finance-engine /finance-engine
ENTRYPOINT ["/finance-engine"]
```

#### Docker Execution (`--network none` + `--tmpfs`)
```bash
docker run -d \
  --name airgapped-finance \
  --network none \
  --cap-add IPC_LOCK \
  --memory 512m --memory-swap 512m \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --tmpfs /opt/finances/inbox:rw,noexec,nosuid,size=64m \
  -v /host/encrypted_zfs/finances/data:/opt/finances/data \
  -v /host/encrypted_zfs/finances/archive:/opt/finances/archive \
  -v /host/encrypted_zfs/finances/config:/opt/finances/config \
  airgapped-finance:latest
```

#### Proxmox LXC Scenario (Zero NICs + RAM Mount)
In `/etc/pve/lxc/105.conf`, omit `net0` and allocate zero swap (`swap: 0`). Copy the single `/opt/finances/bin/finance-engine` binary into the container. Access the web dashboard from the Proxmox host via a Unix domain socket proxy or host-to-LXC port forward using `socat`:
```bash
# Run on the PVE host: forward host's localhost:8080 to the LXC loopback via container namespace
socat TCP-LISTEN:8080,fork,bind=127.0.0.1 EXEC:"pct enter 105 -- socat STDIO TCP:127.0.0.1:8000"
```

---

## 7. Database Schema Specification

```sql
-- Core Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,               -- HMAC-SHA256 hash of <ACCTID> (never raw account number)
    masked_display TEXT NOT NULL,      -- Last 4 digits only, e.g., "****9482"
    institution TEXT NOT NULL,         -- e.g., "Chase", "Vanguard"
    type TEXT NOT NULL,                -- "credit_card", "checking", "brokerage"
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Normalized Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,               -- Unique composite: account_id_hash || FITID
    account_id TEXT NOT NULL,
    transaction_date TEXT NOT NULL,    -- ISO-8601 YYYY-MM-DD
    amount_cents INTEGER NOT NULL,     -- Signed integer cents (avoids IEEE-754 float drift)
    raw_payee TEXT NOT NULL,           -- Direct string from <NAME> or <MEMO>
    clean_payee TEXT NOT NULL,         -- Normalized display merchant name
    category TEXT NOT NULL,            -- Assigned category
    confidence_score REAL DEFAULT 1.0, -- Confidence score between 0.0 and 1.0
    needs_review INTEGER DEFAULT 0,    -- 1 if low confidence or unparsed
    categorization_tier TEXT NOT NULL, -- 'regex', 'history', 'local_llm', 'manual'
    user_verified INTEGER DEFAULT 0,   -- 1 if confirmed by human, 0 if automatic
    source_file_hash TEXT NOT NULL,    -- SHA-256 hash of statement payload (avoids leaking filenames)
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id)
);

-- Indexing for analytical and triage queries
CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_trans_review ON transactions(needs_review);
CREATE INDEX IF NOT EXISTS idx_trans_account ON transactions(account_id);
```

---

## 8. Verification & Auditing Checklist

### Binary Dependency & Symbol Audit
Verify that the compiled Go binary has zero dynamic external library links and contains only expected standard packages:
```bash
ldd /opt/finances/bin/finance-engine
go version -m /opt/finances/bin/finance-engine
```
*Acceptance Criteria*: `ldd` outputs `not a dynamic executable` (statically linked), and `go version -m` lists only the SQLite/SQLCipher driver alongside the standard library.

### Host-Level Packet Capture Inspection (`tcpdump`)
Run the pipeline, perform file uploads via the UI, and triage transactions while monitoring the host:
```bash
sudo tcpdump -i any -n "not port 53 and host not 127.0.0.1"
```
*Acceptance Criteria*: Zero packets generated by the container PID during file ingest, upload, and web dashboard triage.

### Frontend Asset Air-Gap Verification
Open the browser Developer Tools $\rightarrow$ Network tab while loading the dashboard.  
*Acceptance Criteria*: All loaded assets (HTML, CSS, JS) are served directly from `127.0.0.1:8000` out of the Go binary's `//go:embed` filesystem. Zero requests to external CDNs, fonts, or tracking scripts.

### Plaintext & Storage Remanence Audit
Upload a statement containing a known merchant ("TRADER JOES") and an account number ("9988776655"), then inspect the entire `/opt/finances/` directory tree on disk:
```bash
grep -rnI "9988776655" /opt/finances/
strings /opt/finances/data/ledger.db | grep -i "trader"
```
*Acceptance Criteria*: Zero matches across `inbox/`, `archive/`, and `data/ledger.db`. Any files in `archive/` (if enabled) are binary `.enc` blobs verifiable only with the AES-256-GCM key.