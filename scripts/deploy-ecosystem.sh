#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Production Deployment Script
# ══════════════════════════════════════════════════════════════
# Usage: bash scripts/deploy-ecosystem.sh [production|staging]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

ENV="${1:-staging}"
COMPOSE_FILE="docker-compose.ecosystem.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/${TIMESTAMP}"
LOG_FILE="logs/deploy_${TIMESTAMP}.log"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "[$(date +%H:%M:%S)] $1" | tee -a "$LOG_FILE"; }
success() { log "${GREEN}✓ $1${NC}"; }
warn() { log "${YELLOW}⚠ $1${NC}"; }
fail() { log "${RED}✗ $1${NC}"; exit 1; }

echo -e "${CYAN}"
echo "══════════════════════════════════════════════════════"
echo "  TRANCENDOS ECOSYSTEM — ${ENV^^} DEPLOYMENT"
echo "  Timestamp: ${TIMESTAMP}"
echo "══════════════════════════════════════════════════════"
echo -e "${NC}"

mkdir -p "$(dirname $LOG_FILE)" "$BACKUP_DIR"

# ── Step 1: Pre-flight Checks ──────────────────────────────
log "Step 1/8: Pre-flight checks..."

if ! command -v docker &> /dev/null; then
  fail "Docker not found. Install Docker first."
fi

if ! docker compose version &> /dev/null; then
  fail "Docker Compose V2 not found."
fi

if [[ "$ENV" == "production" ]]; then
  if [[ ! -f ".env" ]]; then
    fail ".env file not found. Copy .env.production to .env and fill in secrets."
  fi

  # Check critical env vars
  REQUIRED_VARS=(IAM_JWT_SECRET NEON_DATABASE_URL)
  for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "${var}=CHANGE_ME" .env 2>/dev/null; then
      fail "${var} still has default value. Update .env before production deploy."
    fi
  done
fi

success "Pre-flight checks passed"

# ── Step 2: Backup Current State ───────────────────────────
log "Step 2/8: Backing up current state..."

if docker compose -f "$COMPOSE_FILE" ps -q 2>/dev/null | head -1 | grep -q .; then
  docker compose -f "$COMPOSE_FILE" ps --format json > "${BACKUP_DIR}/services_state.json" 2>/dev/null || true
  success "Service state backed up to ${BACKUP_DIR}/"
else
  warn "No running services to backup"
fi

# Save current image tags for rollback
docker compose -f "$COMPOSE_FILE" config --images > "${BACKUP_DIR}/image_tags.txt" 2>/dev/null || true

# ── Step 3: Pull Latest Images / Build ─────────────────────
log "Step 3/8: Building all services..."

docker compose -f "$COMPOSE_FILE" build --parallel 2>&1 | tee -a "$LOG_FILE"
success "All 31 services built"

# ── Step 4: Database Migrations ────────────────────────────
log "Step 4/8: Running database migrations..."

if [[ -f "migrate-db.mjs" ]]; then
  warn "Database migrations available — run manually: node migrate-db.mjs"
else
  warn "No migration scripts found — skipping"
fi

# ── Step 5: Rolling Deployment ─────────────────────────────
log "Step 5/8: Deploying services (rolling update)..."

# Deploy in wave order to respect dependencies
WAVES=(
  "infinity-portal"
  "guardian-ai cornelius-ai dorris-ai norman-ai the-dr-ai"
  "the-agora the-citadel the-hive the-library the-nexus the-observatory the-treasury the-workshop arcadia"
  "serenity-ai oracle-ai porter-family-ai prometheus-ai queen-ai renik-ai sentinel-ai solarscene-ai"
  "api-marketplace artifactory"
  "section7 style-and-shoot fabulousa tranceflow tateking the-digitalgrid"
)

WAVE_NAMES=("Core Platform" "AI Agents" "Infrastructure" "Intelligence" "Marketplace" "Studios")

for i in "${!WAVES[@]}"; do
  WAVE_NUM=$((i + 1))
  log "  Wave ${WAVE_NUM} (${WAVE_NAMES[$i]}): ${WAVES[$i]}"
  docker compose -f "$COMPOSE_FILE" up -d --no-deps --remove-orphans ${WAVES[$i]} 2>&1 | tee -a "$LOG_FILE"

  # Wait for health checks
  sleep 5
  success "  Wave ${WAVE_NUM} deployed"
done

success "All waves deployed"

# ── Step 6: Health Verification ────────────────────────────
log "Step 6/8: Running health verification..."

sleep 10  # Allow services to fully start

if bash scripts/health-check.sh 2>&1 | tee -a "$LOG_FILE"; then
  success "All services healthy"
else
  warn "Some services unhealthy — check logs"
fi

# ── Step 7: Smoke Tests ────────────────────────────────────
log "Step 7/8: Running smoke tests..."

SMOKE_PASS=0
SMOKE_FAIL=0

smoke_test() {
  local name=$1
  local url=$2
  local expected=$3

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "$expected" ]]; then
    SMOKE_PASS=$((SMOKE_PASS + 1))
  else
    SMOKE_FAIL=$((SMOKE_FAIL + 1))
    warn "  Smoke test failed: $name (expected $expected, got $HTTP_CODE)"
  fi
}

smoke_test "infinity-portal" "http://localhost:3000/health" "200"
smoke_test "guardian-ai" "http://localhost:3010/health" "200"
smoke_test "sentinel-ai" "http://localhost:3036/health" "200"
smoke_test "section7" "http://localhost:3050/health" "200"
smoke_test "artifactory" "http://localhost:3041/health" "200"

log "  Smoke tests: ${SMOKE_PASS} passed, ${SMOKE_FAIL} failed"

# ── Step 8: Deployment Summary ─────────────────────────────
log "Step 8/8: Deployment summary..."

echo -e "${CYAN}"
echo "══════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "══════════════════════════════════════════════════════"
echo -e "${NC}"
echo "  Environment:  ${ENV}"
echo "  Timestamp:    ${TIMESTAMP}"
echo "  Services:     31"
echo "  Backup:       ${BACKUP_DIR}/"
echo "  Log:          ${LOG_FILE}"
echo ""
echo "  Rollback:     bash scripts/rollback.sh ${TIMESTAMP}"
echo ""

if [[ $SMOKE_FAIL -gt 0 ]]; then
  warn "Deployment completed with warnings. Check failed smoke tests."
  exit 1
else
  success "Deployment successful — all systems operational"
fi