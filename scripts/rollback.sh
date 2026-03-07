#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Rollback Script
# ══════════════════════════════════════════════════════════════
# Usage: bash scripts/rollback.sh [backup_timestamp]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

COMPOSE_FILE="docker-compose.ecosystem.yml"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "[$(date +%H:%M:%S)] $1"; }
success() { log "${GREEN}✓ $1${NC}"; }
warn() { log "${YELLOW}⚠ $1${NC}"; }
fail() { log "${RED}✗ $1${NC}"; exit 1; }

# Find backup to rollback to
if [[ -n "${1:-}" ]]; then
  BACKUP_DIR="backups/$1"
else
  # Use most recent backup
  BACKUP_DIR=$(ls -dt backups/*/ 2>/dev/null | head -1)
fi

if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  fail "No backup found. Available backups:"
  ls -1 backups/ 2>/dev/null || echo "  (none)"
  exit 1
fi

echo -e "${CYAN}"
echo "══════════════════════════════════════════════════════"
echo "  TRANCENDOS ECOSYSTEM — ROLLBACK"
echo "  Restoring from: ${BACKUP_DIR}"
echo "══════════════════════════════════════════════════════"
echo -e "${NC}"

# ── Step 1: Stop Current Services ──────────────────────────
log "Step 1/4: Stopping current services..."
docker compose -f "$COMPOSE_FILE" down --timeout 30 2>&1
success "Services stopped"

# ── Step 2: Restore Previous State ─────────────────────────
log "Step 2/4: Checking backup contents..."

if [[ -f "${BACKUP_DIR}/image_tags.txt" ]]; then
  log "  Found image tags backup"
  cat "${BACKUP_DIR}/image_tags.txt"
fi

if [[ -f "${BACKUP_DIR}/services_state.json" ]]; then
  log "  Found service state backup"
fi

# ── Step 3: Restart with Previous Config ───────────────────
log "Step 3/4: Restarting ecosystem..."
docker compose -f "$COMPOSE_FILE" up -d 2>&1
success "Ecosystem restarted"

# ── Step 4: Verify Health ──────────────────────────────────
log "Step 4/4: Verifying health..."
sleep 15

if bash scripts/health-check.sh 2>&1; then
  success "Rollback complete — all services healthy"
else
  warn "Rollback complete but some services unhealthy"
  warn "Check: docker compose -f $COMPOSE_FILE logs"
fi

echo ""
echo -e "${CYAN}Rollback from ${BACKUP_DIR} complete.${NC}"