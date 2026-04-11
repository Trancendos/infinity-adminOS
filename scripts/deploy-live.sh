#!/usr/bin/env bash
# ============================================================
# Infinity Portal — One-Command Live Deployment
# ============================================================
# Deploys the full stack:
#   1. Backend → Fly.io
#   2. Frontend → Cloudflare Pages
#
# Prerequisites:
#   - Fly.io CLI: curl -L https://fly.io/install.sh | sh
#   - Wrangler CLI: npm install -g wrangler
#   - Authenticated: fly auth login && wrangler login
#
# Usage:
#   ./scripts/deploy-live.sh              # Deploy everything
#   ./scripts/deploy-live.sh --backend    # Backend only
#   ./scripts/deploy-live.sh --frontend   # Frontend only
#   ./scripts/deploy-live.sh --status     # Check live status
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[∞]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║       ∞  INFINITY PORTAL  ∞              ║"
  echo "  ║       Live Deployment                    ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Preflight ──────────────────────────────────────────────
preflight() {
  local mode="${1:-all}"
  log "Running preflight checks..."

  if [[ "$mode" == "all" || "$mode" == "backend" ]]; then
    if ! command -v flyctl &>/dev/null && ! command -v fly &>/dev/null; then
      err "Fly CLI not found. Install: curl -L https://fly.io/install.sh | sh"
      exit 1
    fi
    if ! flyctl auth whoami &>/dev/null 2>&1; then
      err "Not authenticated with Fly.io. Run: fly auth login"
      exit 1
    fi
    ok "Fly.io CLI authenticated"
  fi

  if [[ "$mode" == "all" || "$mode" == "frontend" ]]; then
    if ! command -v wrangler &>/dev/null; then
      err "Wrangler CLI not found. Install: npm install -g wrangler"
      exit 1
    fi
    if ! wrangler whoami &>/dev/null 2>&1; then
      err "Not authenticated with Cloudflare. Run: wrangler login"
      exit 1
    fi
    ok "Cloudflare CLI authenticated"
  fi
}

# ── Deploy Backend (Fly.io) ───────────────────────────────
deploy_backend() {
  log "Deploying backend to Fly.io..."
  cd "$PROJECT_ROOT/backend"

  # Check if app exists, create if not
  if ! flyctl status --config fly.toml &>/dev/null 2>&1; then
    log "Creating Fly.io app..."
    flyctl launch --config fly.toml --no-deploy --copy-config --yes

    # Create Postgres database
    log "Provisioning Postgres database..."
    flyctl postgres create --name infinity-portal-db --region lhr --vm-size shared-cpu-1x --initial-cluster-size 1 --volume-size 1 --yes 2>/dev/null || warn "Postgres may already exist"

    # Attach database
    flyctl postgres attach infinity-portal-db --yes 2>/dev/null || warn "Database may already be attached"

    # Set secrets
    log "Setting secrets..."
    echo ""
    echo -e "  ${YELLOW}You need to set the following secrets:${NC}"
    echo ""
    echo "  flyctl secrets set \&quot;
    echo "    SECRET_KEY=&quot;$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))' 2>/dev/null || echo 'GENERATE_ME')&quot; \&quot;
    echo "    JWT_SECRET_KEY=&quot;$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))' 2>/dev/null || echo 'GENERATE_ME')&quot; \&quot;
    echo "    CORS_ORIGINS=&quot;https://infinity-portal.pages.dev&quot; \&quot;
    echo "    REDIS_URL=&quot;&quot; \&quot;
    echo "    --config fly.toml"
    echo ""

    read -rp "  Have you set the secrets? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      warn "Setting auto-generated secrets..."
      flyctl secrets set \
        SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')" \
        JWT_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')" \
        CORS_ORIGINS="https://infinity-portal.pages.dev,http://localhost:5173" \
        ENVIRONMENT="production" \
        --config fly.toml
    fi
  fi

  # Deploy
  log "Building and deploying..."
  flyctl deploy --config fly.toml --strategy rolling --wait-timeout 300

  # Get URL
  local backend_url
  backend_url=$(flyctl info --config fly.toml 2>/dev/null | grep "Hostname" | awk '{print $2}' || echo "infinity-portal-api.fly.dev")

  echo ""
  ok "Backend deployed!"
  echo -e "  ${CYAN}URL:${NC}     https://${backend_url}"
  echo -e "  ${CYAN}Health:${NC}  https://${backend_url}/health"
  echo -e "  ${CYAN}Docs:${NC}    https://${backend_url}/docs"
  echo ""

  export BACKEND_URL="https://${backend_url}"
  cd "$PROJECT_ROOT"
}

# ── Deploy Frontend (Cloudflare Pages) ────────────────────
deploy_frontend() {
  log "Deploying frontend to Cloudflare Pages..."
  cd "$PROJECT_ROOT/apps/shell"

  # Build with production env vars
  local api_url="${BACKEND_URL:-https://infinity-portal-api.fly.dev}"

  log "Building frontend (API: ${api_url})..."
  VITE_BACKEND_API_URL="$api_url" \
  VITE_WS_URL="$(echo "$api_url" | sed 's/https/wss/')/ws" \
  VITE_APP_NAME="Infinity Portal" \
  VITE_APP_VERSION="$(git rev-parse --short HEAD 2>/dev/null || echo '2.5.0')" \
  npx vite build

  # Deploy to Cloudflare Pages
  log "Pushing to Cloudflare Pages..."
  wrangler pages deploy dist --project-name=infinity-portal --branch=main

  echo ""
  ok "Frontend deployed!"
  echo -e "  ${CYAN}URL:${NC}  https://infinity-portal.pages.dev"
  echo ""

  cd "$PROJECT_ROOT"
}

# ── Deploy API Gateway Worker ─────────────────────────────
deploy_gateway() {
  log "Deploying API Gateway worker..."
  cd "$PROJECT_ROOT/workers/api-gateway"

  # Check if wrangler.toml has placeholder IDs
  if grep -q "placeholder" wrangler.toml; then
    warn "wrangler.toml has placeholder KV namespace IDs"
    warn "Run ./scripts/setup-cloudflare.sh first to create KV namespaces"
    warn "Skipping gateway deployment"
    cd "$PROJECT_ROOT"
    return
  fi

  wrangler deploy --env production
  ok "API Gateway deployed!"
  cd "$PROJECT_ROOT"
}

# ── Status Check ──────────────────────────────────────────
check_status() {
  log "Checking live status..."
  echo ""

  # Backend
  local backend_url="${BACKEND_URL:-https://infinity-portal-api.fly.dev}"
  echo -e "  ${BOLD}Backend:${NC} ${backend_url}"
  local health
  health=$(curl -sf "${backend_url}/health" 2>/dev/null || echo '{"status":"unreachable"}')
  if echo "$health" | grep -q '"healthy"'; then
    ok "  Backend is healthy"
    echo "  $health" | python3 -m json.tool 2>/dev/null || echo "  $health"
  else
    err "  Backend is not responding"
  fi

  echo ""

  # Frontend
  local frontend_url="https://infinity-portal.pages.dev"
  echo -e "  ${BOLD}Frontend:${NC} ${frontend_url}"
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" "${frontend_url}" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "  Frontend is live (HTTP $status)"
  else
    err "  Frontend returned HTTP $status"
  fi

  echo ""
}

# ── Post-Deploy Summary ───────────────────────────────────
summary() {
  echo ""
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ∞  Deployment Complete!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${CYAN}Frontend:${NC}  https://infinity-portal.pages.dev"
  echo -e "  ${CYAN}Backend:${NC}   https://infinity-portal-api.fly.dev"
  echo -e "  ${CYAN}API Docs:${NC}  https://infinity-portal-api.fly.dev/docs"
  echo -e "  ${CYAN}Health:${NC}    https://infinity-portal-api.fly.dev/health"
  echo ""
  echo -e "  ${YELLOW}Next steps:${NC}"
  echo "  1. Verify health: ./scripts/deploy-live.sh --status"
  echo "  2. Set custom domain in Cloudflare Pages dashboard"
  echo "  3. Add GitHub secrets for auto-deploy on push"
  echo ""
}

# ── Main ───────────────────────────────────────────────────
main() {
  cd "$PROJECT_ROOT"
  banner

  case "${1:-}" in
    --backend)
      preflight "backend"
      deploy_backend
      ;;
    --frontend)
      preflight "frontend"
      deploy_frontend
      ;;
    --gateway)
      preflight "frontend"
      deploy_gateway
      ;;
    --status)
      check_status
      ;;
    *)
      preflight "all"
      deploy_backend
      deploy_frontend
      deploy_gateway
      summary
      ;;
  esac
}

main "$@"