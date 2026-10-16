# Air-Gapped Zero-Dependency Personal Finance Engine

A 100% local, single-tenant financial ingestion, classification, review, and analytics engine compiled into a single, standalone Go static binary with an embedded high-performance React dashboard.

---

## Security Invariants

- **Zero External Egress**: No telemetry, third-party analytics, remote LLM APIs, external CDNs, or cloud dependencies. Outbound DNS & TLS dialers are prohibited at runtime.
- **Zero External Module Dependencies**: Built strictly with the Go Standard Library (`net/http`, `crypto/aes`, `crypto/cipher`, `crypto/sha256`, `crypto/hmac`, `regexp`, `compress/zlib`).
- **Explicit RAM Zeroization & Zero Raw Statement Retention**: Financial buffers (`[]byte`) are wiped via Go's built-in `clear(buf)` immediately after parsing. Raw statement uploads (`.ofx`, `.qfx`) are strictly ephemeral in volatile memory—never persisted to disk in any format (no raw disk archives). Raw account numbers (`<ACCTID>`) are hashed with HMAC-SHA256 and zeroized.
- **Air-Gap Enforceability**: Binds strictly to `127.0.0.1:8811` or Unix domain sockets, and runs seamlessly with Docker's `--network none` mode.
- **Deterministic Deduplication**: Primary key is `HMAC-SHA256(account_id) || FITID`. Idempotent against overlapping statement exports.
- **Encrypted Ledger at Rest**: Persisted ledger state (`data/ledger.db`) is protected using authenticated AES-256-GCM encryption derived from your master passphrase via PBKDF2 (600,000 iterations).

---

## Quick Start

### 1. Configure Vault Passphrase
Create a `.env` file in the project root:
```bash
cat << 'EOF' > .env
FINANCE_PASSPHRASE=your-strong-vault-passphrase
FINANCE_PORT=8811
EOF
chmod 600 .env
```

### 2. Run with Docker Compose (Recommended)
```bash
docker compose up -d --build
```
Access the web dashboard in your browser:
* Local machine: `http://localhost:8811`
* LAN access: `http://<SERVER_LAN_IP>:8811` (e.g., `http://192.168.1.50:8811`)

### 3. Or Build & Run as a Native Go Binary
```bash
# 1. Build frontend distribution bundle
npm install
npm run build

# 2. Compile 100% static Go binary
CGO_ENABLED=0 go build -tags "netgo osusergo" -ldflags="-s -w" -o finance-engine main.go

# 3. Start the engine
FINANCE_PASSPHRASE="your-strong-vault-passphrase" \
FINANCE_LISTEN="127.0.0.1:8811" \
FINANCE_HOME="./finances_runtime" \
./finance-engine
```

---

## How to Use the App: Step-by-Step Guide

### 1. Ingesting Statements (OFX & QFX)
The engine ingests standard financial SGML/XML statement files exported from any bank, credit card issuer, or credit union.

1. Click the **"Ingest Statement"** button in the header, or drag & drop files directly onto the dropzone.
2. **Supported file types**:
   * `.ofx` (Open Financial Exchange standard)
   * `.qfx` (Quicken standard exported by financial institutions)
   * *(Note: Plaintext `.csv` is intentionally unsupported to prevent unstandardized payee leaks and unverified account formats).*
3. **One-Click Demo Test**:
   * Click **"Chase Sapphire (9 txns)"** or **"Test Overlapping Statement"** inside the modal to test ingestion and deterministic deduplication instantly without real personal files.
4. **Zero Raw Statement Retention (Pure Ephemeral RAM Purge)**:
   * Support for raw file archiving on disk (even encrypted `.enc` archives) was dropped to guarantee complete non-remanence.
   * Uploaded `.ofx`/`.qfx` bytes are read strictly into a volatile memory slice (capped at 10 MB).
   * Once parsed and committed into the encrypted ledger, the raw statement memory buffer is immediately wiped using Go's `clear(buf)`.
   * **Zero plaintext or encrypted raw statement files ever touch the disk.**
5. **Deduplication Protection**:
   * Ingesting overlapping date ranges or repeating uploads is completely safe. The engine computes a deterministic hash of the masked account ID and bank FITID (`fitid`), ignoring transactions that already exist.

---

### 2. Reviewing & Categorizing Transactions
Transactions are automatically run through a 3-tier classification engine:
1. **Tier 1 — Deterministic Regex Rules**: Highest confidence (100%). Matches against your custom RE2 rules.
2. **Tier 2 — Historical Payee Memory**: Matches past classifications you've previously approved for the same merchant.
3. **Tier 3 — Fallback / Review Flag**: Transactions with `< 85%` confidence or no match are flagged as **"Needs Review"**.

#### Working with the Review Queue:
* Click the **"Triage Inbox"** tab in the navigation bar to see only unverified or low-confidence transactions.
* **Approve Single Transaction**: Click **"Approve"** to accept the proposed category and normalized clean payee.
* **Change Category**: Use the inline dropdown on any transaction row to pick a different category.
* **Batch Approve**: Click the **"Batch Approve All"** button at the top to approve all pending transactions at once.
* **Switch to "Encrypted Ledger"**: View your complete historical ledger, sort by date, filter by category, or search payees in real-time.

---

### 3. Creating & Managing RE2 Regex Rules
Teach the engine how to normalize messy bank payee names and automatically assign categories with linear-time $O(N)$ Go RE2 regular expressions (immune to ReDoS attacks).

1. Click the **"RE2 Regex Rules"** tab in the navigation bar to view, search, and manage all active classification rules.
2. **Create from an Existing Transaction**:
   * Click the **"+ Rule"** button on any transaction row in the Triage Inbox or Encrypted Ledger.
   * The modal pre-populates a case-insensitive regex pattern derived from the raw bank string (e.g., `(?i)trader\s*joe`).
3. **Configure the Rule**:
   * **Regex Pattern**: Case-insensitive Go RE2 regex (e.g., `(?i)shell|chevron|exxon`).
   * **Category**: Choose the target spending category (e.g., `Transportation:Fuel`).
   * **Normalized Clean Payee**: Enter a clean display name (e.g., `Shell Oil`).
4. **Live Match Tester**:
   * The modal tests your pattern in real time against your existing ledger and shows how many transactions match.
5. **Retroactive Application**:
   * Saving a rule automatically reclassifies all past matching transactions in your ledger.

---

### 4. Managing Accounts & Privacy
1. Click the **"Accounts"** button in the top navigation bar.
2. **Automatic Account Registration**: When you ingest an OFX/QFX file, the engine automatically registers the account.
3. **Privacy Protection**:
   * Raw account numbers are **never saved or displayed in plaintext**.
   * Only the last 4 digits are kept for display (e.g., `****9482`).
   * The internal identifier is a one-way `HMAC-SHA256` hash salted with your vault key.
4. **Customizing Accounts**:
   * Change the friendly display name (e.g., "Joint Household Checking").
   * Specify the institution (e.g., "Chase", "Vanguard", "Fidelity").
   * Select account type: `checking`, `savings`, `credit_card`, or `investment`.

---

### 5. Managing Categories
1. Click the **"Categories"** button in the header.
2. Add custom spending or income categories (e.g., `Pet Care`, `Software Subscriptions`).
3. Categories update instantly in all transaction dropdowns and the spending breakdown analytics cards.

---

### 6. Security Console & RAM Zeroization Audit
Click the **"Security & Code Auditor"** tab to view the live air-gap defense console:
* **RAM Zeroization Stream**: Verifies the exact millisecond when file buffers and sensitive strings were overwritten with zeros in memory.
* **Outbound Egress Status**: Displays `0 bytes sent` to verify zero cloud or internet callouts.
* **Multi-Layer Isolation Matrix**: Explains the 3 defense tiers (Go Runtime In-Process, Container OS Kernel, and Hypervisor Host isolation).

---

## Account Configuration & GitHub Privacy

### How Accounts Config Is Updated
Accounts are stored in `config/accounts.json`. Updates happen automatically in two ways:
1. **Via the Web UI**: Edits in the "Accounts" modal are persisted immediately to `config/accounts.json` and the encrypted ledger.
2. **Via Direct File Edit**: You can manually edit `config/accounts.json` before starting the server.

### Safe GitHub Uploads (`accounts.json` Excluded)
Your personal account details are excluded from Git and Docker contexts:
- `.gitignore` ignores `config/accounts.json` and `accounts.json`:
  ```gitignore
  # Sensitive user configs & personal account mappings
  config/accounts.json
  accounts.json
  !config/accounts.json.example
  ```
- `.dockerignore` also ignores `config/accounts.json` so personal details are never baked into Docker images.
- Only the generic template `config/accounts.json.example` is committed to GitHub.

---

## Directory Structure

```text
├── config/
│   ├── accounts.json.example   # Safe template committed to git
│   ├── categories.json         # Default expense & income categories
│   ├── config.json             # Engine runtime settings
│   └── rules.json              # Starter regex classification rules
├── data/                       # Local encrypted ledger database (ignored by git/docker)
├── inbox/                      # Drop folder for volatile RAM ingestion
├── src/                        # Modern React + Tailwind CSS dashboard source
├── Dockerfile                  # Multi-stage production container
├── docker-compose.yml          # Zero-network LAN deployment definition
└── main.go                     # Complete air-gapped Go backend & OFX parser
```