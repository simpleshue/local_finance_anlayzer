# Air-Gapped Zero-Dependency Personal Finance Engine

A 100% local, single-tenant financial ingestion, classification, review, and analytics engine compiled into a single, standalone Go static binary.

## Security Invariants
- **Zero External Egress**: No telemetry, third-party APIs, remote model inference, external CDNs, or cloud dependencies. Outbound DNS & TLS dialers are trapped and prohibited in runtime.
- **Zero External Module Dependencies**: Built strictly with the Go Standard Library (`net/http`, `crypto/aes`, `crypto/cipher`, `crypto/sha256`, `crypto/hmac`, `regexp`, `compress/zlib`).
- **Explicit RAM Zeroization**: Financial buffers (`[]byte`) are wiped via Go's built-in `clear(buf)` immediately after parsing. Raw account numbers (`<ACCTID>`) are hashed with HMAC-SHA256 and zeroized.
- **Air-Gap Enforceability**: Binds strictly to `127.0.0.1:8000` or Unix domain sockets.
- **Deterministic Deduplication**: Primary key is `HMAC-SHA256(account_id) || FITID`. Idempotent against overlapping statement exports.

## Build Static Binary
```bash
CGO_ENABLED=0 go build -tags "netgo osusergo" -ldflags="-s -w" -o finance-engine main.go
```

## Run Local Engine
```bash
FINANCE_PASSPHRASE="your-strong-vault-passphrase" \
FINANCE_LISTEN="127.0.0.1:8811" \
FINANCE_HOME="./finances_runtime" \
./finance-engine
```

## Docker Deployment (--network none)
```bash
docker build -t airgapped-finance:latest .
docker run -d \
  --name airgapped-finance \
  --network none \
  --cap-add IPC_LOCK \
  --memory 512m --memory-swap 512m \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -v $(pwd)/data:/finances_runtime/data \
  -p 127.0.0.1:8811:8811 \
  airgapped-finance:latest
```

Or use docker compose:
```bash
docker compose up -d --build
```

## Setup FINANCE_PASSPHRASE

Create a .env file in your project directory:
```bash
cat << 'EOF' > .env
FINANCE_PASSPHRASE=your-strong-vault-passphrase
FINANCE_PORT=8811
EOF
```
Restrict file permissions so other Linux users cannot read it:

```bash
chmod 600 .env
```

In `docker-compose.yml`, the ports and environment are configured for port 8811 and LAN access:
```yaml
ports:
  # Maps host port 8811 to container port 8811; enables access from your LAN
  - "${FINANCE_PORT:-8811}:8811"
environment:
  - FINANCE_PASSPHRASE=${FINANCE_PASSPHRASE}
  - FINANCE_LISTEN=0.0.0.0:8811
```

Access from any device on your local network:
`http://<SERVER_LAN_IP>:8811` (e.g. `http://192.168.1.50:8811`)

## Account Configuration & Privacy

### 1. How Accounts Are Configured & Edited
Accounts can be managed in two ways:
* **Interactive Web UI**: Click the **"Accounts"** button in the top navigation bar to open the Account Manager modal. You can add new accounts, customize bank/institution names, edit friendly nicknames (e.g., "Household Bills Checking"), and change account types. All changes sync immediately to your encrypted ledger and `config/accounts.json`.
* **Config File**: Edit `config/accounts.json` on your host machine before starting or restarting the engine.
* **Automatic Discovery**: When statements are ingested (OFX/QFX/CSV), new account numbers are automatically masked (last 4 digits), hashed with HMAC-SHA256, and registered into the engine.

### 2. Skipping Accounts When Pushing to GitHub
Your actual `config/accounts.json` is **automatically excluded** by `.gitignore`:
```gitignore
# Sensitive user configs & personal account mappings
config/accounts.json
accounts.json
!config/accounts.json.example
```
To share the project or upload it to GitHub safely:
1. `config/accounts.json.example` is committed as an anonymized template with placeholder accounts.
2. Your real `config/accounts.json` remains strictly on your local machine / Docker volume and is never committed or pushed to remote repositories.