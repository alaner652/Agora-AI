#!/usr/bin/env bash
set -euo pipefail

TUNNEL_NAME="agora-ai"
HOSTNAME="agora.alaner652.com"
CREDS_DST="cloudflared/credentials.json"
CFG="cloudflared/config.yml"

# ── helpers ───────────────────────────────────────────────────────────────────

info()  { echo "[+] $*"; }
warn()  { echo "[!] $*"; }
die()   { echo "[✗] $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || die "$1 not found — $2"
}

# ── 1. 先決條件 ───────────────────────────────────────────────────────────────

info "Checking prerequisites..."
require docker   "install Docker Desktop: https://docs.docker.com/desktop/mac/install/"
docker compose version &>/dev/null || die "docker compose plugin not found"

if ! command -v cloudflared &>/dev/null; then
  require brew "install Homebrew: https://brew.sh"
  info "Installing cloudflared..."
  brew install cloudflared
fi
info "cloudflared $(cloudflared --version 2>&1 | head -1)"

# ── 2. backend/.env ───────────────────────────────────────────────────────────

if [[ ! -f backend/.env ]]; then
  info "Creating backend/.env from .env.example..."
  cp backend/.env.example backend/.env

  # 自動產生 SETTINGS_ENCRYPT_KEY（Fernet 格式）
  KEY=$(python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^SETTINGS_ENCRYPT_KEY=.*|SETTINGS_ENCRYPT_KEY=${KEY}|" backend/.env
  else
    sed -i "s|^SETTINGS_ENCRYPT_KEY=.*|SETTINGS_ENCRYPT_KEY=${KEY}|" backend/.env
  fi
  info "SETTINGS_ENCRYPT_KEY generated."

  warn "backend/.env created — fill in LLM_API_KEY then re-run this script."
  exit 0
fi

# 確認 LLM_API_KEY 已填
if grep -qE '^LLM_API_KEY=sk-\.\.\.|^LLM_API_KEY=$' backend/.env; then
  die "LLM_API_KEY not set in backend/.env — fill it in first."
fi

# ── 3. Cloudflare Tunnel ──────────────────────────────────────────────────────

info "Setting up Cloudflare Tunnel..."

# 登入（若 cert.pem 已存在則跳過）
CERT="${HOME}/.cloudflared/cert.pem"
if [[ ! -f "$CERT" ]]; then
  info "Opening browser for Cloudflare login..."
  cloudflared tunnel login
fi

# 建立 tunnel（若已存在則取現有的 ID）
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  info "Tunnel '$TUNNEL_NAME' already exists."
  TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk "/$TUNNEL_NAME/ {print \$1}")
else
  info "Creating tunnel '$TUNNEL_NAME'..."
  TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1 | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
fi

[[ -z "$TUNNEL_ID" ]] && die "Could not determine tunnel ID."
info "Tunnel ID: $TUNNEL_ID"

# 複製憑證
CREDS_SRC="${HOME}/.cloudflared/${TUNNEL_ID}.json"
[[ ! -f "$CREDS_SRC" ]] && die "Credentials not found: $CREDS_SRC"
mkdir -p cloudflared
cp "$CREDS_SRC" "$CREDS_DST"
info "Credentials copied to $CREDS_DST"

# 寫入 config.yml
cat > "$CFG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /etc/cloudflared/credentials.json
no-autoupdate: true

ingress:
  - hostname: ${HOSTNAME}
    service: http://caddy:80
  - service: http_status:404
EOF
info "Written $CFG"

# 設定 DNS（冪等，重複執行不會出錯）
info "Routing DNS: $HOSTNAME → tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" || warn "DNS route may already exist, continuing."

# ── 4. 啟動 ──────────────────────────────────────────────────────────────────

info "Building and starting services..."
docker compose up --build -d

echo ""
echo "✓ Done. Agora-AI is live at https://${HOSTNAME}"
echo "  Logs: docker compose logs -f"
