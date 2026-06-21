#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC}  $*"; }
warn() { echo -e "  ${YELLOW}!${NC}  $*"; }
err()  { echo -e "  ${RED}✗${NC}  $*" >&2; }
ask()  { echo -e -n "  ${BOLD}$*${NC} "; }

ENV="backend/.env"

# ── 先決條件 ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Agora-AI 安裝${NC}\n"
echo -e "${BOLD}── 檢查環境 ──${NC}"

if ! command -v docker &>/dev/null; then
  err "Docker 未安裝 → https://docs.docker.com/desktop/mac/install/"; exit 1
fi
docker compose version &>/dev/null || { err "docker compose plugin 未安裝"; exit 1; }
ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+')"

if ! command -v cloudflared &>/dev/null; then
  if command -v brew &>/dev/null; then
    warn "cloudflared 未安裝，正在安裝..."
    brew install cloudflared
    ok "cloudflared 已安裝"
  else
    err "cloudflared 未安裝，且找不到 brew"; exit 1
  fi
else
  ok "cloudflared $(cloudflared --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
fi

# ── 檢查配置狀態 ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── 檢查配置 ──${NC}"

HAS_LLM=false; HAS_KEY=false; HAS_CF=false

if [ -f "$ENV" ] && grep -qE '^LLM_API_KEY=.+' "$ENV" && ! grep -q 'LLM_API_KEY=sk-\.\.\.' "$ENV"; then
  ok "LLM API Key 已配置"; HAS_LLM=true
else
  warn "LLM API Key 未設定"
fi

if [ -f "$ENV" ] && grep -qE '^SETTINGS_ENCRYPT_KEY=.+' "$ENV"; then
  ok "Encrypt Key 已配置"; HAS_KEY=true
else
  warn "Encrypt Key 未設定"
fi

if [ -f "$ENV" ] && grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$ENV"; then
  ok "CF Tunnel Token 已配置"; HAS_CF=true
else
  warn "CF Tunnel Token 未設定"
fi

# ── 如果全部都好了 ─────────────────────────────────────────────────────────────
if $HAS_LLM && $HAS_KEY && $HAS_CF; then
  echo ""
  ok "配置完整，直接啟動..."
  docker compose up -d --build
  echo ""
  ok "完成！→ https://agora.alaner652.com"
  exit 0
fi

# ── 補齊缺少的配置 ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── 補齊配置 ──${NC}"

[ -f "$ENV" ] || cp backend/.env.example "$ENV"

# LLM API Key
if ! $HAS_LLM; then
  ask "LLM API Key（sk-...）:"
  read -r LLM_KEY
  if [ -n "$LLM_KEY" ]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^LLM_API_KEY=.*|LLM_API_KEY=${LLM_KEY}|" "$ENV"
    else
      sed -i "s|^LLM_API_KEY=.*|LLM_API_KEY=${LLM_KEY}|" "$ENV"
    fi
    ok "LLM API Key 已寫入"
  else
    warn "跳過（純 BYOK 模式，使用者須自帶 API Key）"
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^LLM_API_KEY=.*|LLM_API_KEY=|" "$ENV"
    else
      sed -i "s|^LLM_API_KEY=.*|LLM_API_KEY=|" "$ENV"
    fi
  fi
fi

# Encrypt Key（自動產生）
if ! $HAS_KEY; then
  ENCRYPT_KEY=$(python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^SETTINGS_ENCRYPT_KEY=.*|SETTINGS_ENCRYPT_KEY=${ENCRYPT_KEY}|" "$ENV"
  else
    sed -i "s|^SETTINGS_ENCRYPT_KEY=.*|SETTINGS_ENCRYPT_KEY=${ENCRYPT_KEY}|" "$ENV"
  fi
  ok "Encrypt Key 已自動產生"
fi

# Cloudflare Tunnel Token
if ! $HAS_CF; then
  CERT="${HOME}/.cloudflared/cert.pem"
  if [ ! -f "$CERT" ]; then
    warn "開啟瀏覽器進行 Cloudflare 登入..."
    cloudflared tunnel login
  fi

  if cloudflared tunnel list 2>/dev/null | grep -q "agora-ai"; then
    ok "Tunnel 'agora-ai' 已存在"
  else
    warn "建立 Tunnel 'agora-ai'..."
    cloudflared tunnel create agora-ai
    ok "Tunnel 建立完成"
  fi

  CF_TOKEN=$(cloudflared tunnel token agora-ai)
  if [ -n "$CF_TOKEN" ]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${CF_TOKEN}|" "$ENV"
    else
      sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${CF_TOKEN}|" "$ENV"
    fi
    cloudflared tunnel route dns agora-ai agora.alaner652.com 2>/dev/null \
      && ok "DNS 已路由 → agora.alaner652.com" \
      || warn "DNS 路由可能已存在，略過"
    ok "CF Tunnel Token 已寫入"
  else
    err "無法取得 Tunnel Token"; exit 1
  fi
fi

# ── 啟動 ──────────────────────────────────────────────────────────────────────
echo ""
warn "啟動服務..."
docker compose up -d --build
echo ""
ok "完成！→ https://agora.alaner652.com"
ok "查看日誌：docker compose logs -f"
