#!/usr/bin/env bash
set -euo pipefail

TUNNEL_NAME="agora-ai"
HOSTNAME="agora.alaner652.com"

# ── helpers ───────────────────────────────────────────────────────────────────

info() { echo "[+] $*"; }
warn() { echo "[!] $*"; }
die()  { echo "[✗] $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || die "$1 not found — $2"
}

# ── 1. 先決條件 ───────────────────────────────────────────────────────────────

info "Checking prerequisites..."
require docker "install Docker Desktop: https://docs.docker.com/desktop/mac/install/"
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

  KEY=$(python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^SETTINGS_ENCRYPT_KEY=.*|SETTINGS_ENCRYPT_KEY=${KEY}|" backend/.env
  else
    sed -i "s|^SETTINGS_ENCRYPT_KEY=.*|SETTINGS_ENCRYPT_KEY=${KEY}|" backend/.env
  fi
  info "SETTINGS_ENCRYPT_KEY generated."
  warn "backend/.env created — fill in LLM_API_KEY then re-run."
  exit 0
fi

if grep -qE '^LLM_API_KEY=(sk-\.\.\.)?$' backend/.env; then
  die "LLM_API_KEY not set in backend/.env — fill it in first."
fi

# ── 3. Cloudflare Tunnel ──────────────────────────────────────────────────────

info "Setting up Cloudflare Tunnel..."

CERT="${HOME}/.cloudflared/cert.pem"
if [[ ! -f "$CERT" ]]; then
  info "Opening browser for Cloudflare login..."
  cloudflared tunnel login
fi

# 建立 tunnel（已存在則跳過）
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  info "Tunnel '$TUNNEL_NAME' already exists."
else
  info "Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

# 取得 token
info "Fetching tunnel token..."
TOKEN=$(cloudflared tunnel token "$TUNNEL_NAME")
[[ -z "$TOKEN" ]] && die "Could not get tunnel token."

# 寫入 backend/.env
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${TOKEN}|" backend/.env
else
  sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${TOKEN}|" backend/.env
fi
info "Token saved to backend/.env"

# 設定 DNS（冪等）
info "Routing DNS: $HOSTNAME → tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" || warn "DNS route may already exist."

# ── 4. 啟動 ──────────────────────────────────────────────────────────────────

info "Building and starting services..."
docker compose up --build -d

echo ""
echo "✓ Done. Agora-AI is live at https://${HOSTNAME}"
echo "  Logs: docker compose logs -f cloudflared"
