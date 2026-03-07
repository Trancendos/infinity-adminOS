#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Environment Validation
# ══════════════════════════════════════════════════════════════
# Validates .env configuration before deployment
# Usage: bash scripts/validate-env.sh [.env.file]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

ENV_FILE="${1:-.env}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}✓${NC} $1"; }
warn_v() { WARN=$((WARN + 1)); echo -e "  ${YELLOW}⚠${NC} $1"; }
fail_v() { FAIL=$((FAIL + 1)); echo -e "  ${RED}✗${NC} $1"; }

echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Environment Validation: ${ENV_FILE}${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"

if [[ ! -f "$ENV_FILE" ]]; then
  fail_v "File not found: ${ENV_FILE}"
  echo -e "\n${RED}Create .env from .env.production template first.${NC}"
  exit 1
fi

# Load env file
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

# ── Required Variables ─────────────────────────────────────
echo -e "\n${CYAN}[Required Variables]${NC}"

REQUIRED=(
  "NODE_ENV"
  "IAM_ENABLED"
  "IAM_JWT_SECRET"
  "IAM_JWT_ALGORITHM"
  "NEON_DATABASE_URL"
  "MESH_ROUTING_PROTOCOL"
)

for var in "${REQUIRED[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    fail_v "${var} is not set"
  elif [[ "$val" == "CHANGE_ME" ]]; then
    fail_v "${var} still has placeholder value"
  else
    pass "${var} is set"
  fi
done

# ── Security Checks ───────────────────────────────────────
echo -e "\n${CYAN}[Security Checks]${NC}"

# JWT Secret strength
JWT="${IAM_JWT_SECRET:-}"
if [[ ${#JWT} -lt 32 ]]; then
  fail_v "IAM_JWT_SECRET too short (${#JWT} chars, need 32+)"
elif [[ ${#JWT} -lt 64 ]]; then
  warn_v "IAM_JWT_SECRET could be stronger (${#JWT} chars, recommend 64+)"
else
  pass "IAM_JWT_SECRET strong (${#JWT} chars)"
fi

# Algorithm check
ALG="${IAM_JWT_ALGORITHM:-}"
if [[ "$ALG" == "HS256" ]]; then
  warn_v "IAM_JWT_ALGORITHM is HS256 — recommend HS512 for production"
elif [[ "$ALG" == "HS512" || "$ALG" == "RS256" || "$ALG" == "ES256" ]]; then
  pass "IAM_JWT_ALGORITHM: ${ALG}"
else
  warn_v "IAM_JWT_ALGORITHM: ${ALG} (verify this is intentional)"
fi

# Database SSL
if [[ "${DATABASE_SSL:-}" == "true" ]]; then
  pass "Database SSL enabled"
elif [[ "${NODE_ENV:-}" == "production" ]]; then
  fail_v "Database SSL not enabled for production"
else
  warn_v "Database SSL not enabled"
fi

# HTTPS enforcement
if [[ "${FORCE_HTTPS:-}" == "true" ]]; then
  pass "HTTPS enforcement enabled"
elif [[ "${NODE_ENV:-}" == "production" ]]; then
  fail_v "HTTPS not enforced for production"
else
  warn_v "HTTPS not enforced"
fi

# ── Service Configuration ─────────────────────────────────
echo -e "\n${CYAN}[Service Configuration]${NC}"

# Node environment
if [[ "${NODE_ENV:-}" == "production" ]]; then
  pass "NODE_ENV=production"
elif [[ "${NODE_ENV:-}" == "staging" ]]; then
  warn_v "NODE_ENV=staging (not production)"
else
  warn_v "NODE_ENV=${NODE_ENV:-unset}"
fi

# Log level
if [[ "${LOG_LEVEL:-}" == "debug" && "${NODE_ENV:-}" == "production" ]]; then
  warn_v "LOG_LEVEL=debug in production (recommend: info)"
else
  pass "LOG_LEVEL=${LOG_LEVEL:-info}"
fi

# TIGA
if [[ "${TIGA_ENFORCEMENT_MODE:-}" == "enforce" ]]; then
  pass "TIGA enforcement mode: enforce"
elif [[ "${TIGA_ENFORCEMENT_MODE:-}" == "audit" ]]; then
  warn_v "TIGA in audit mode (switch to enforce for production)"
else
  warn_v "TIGA enforcement mode not set"
fi

# Resilience
if [[ "${RESILIENCE_CIRCUIT_BREAKER_ENABLED:-}" == "true" ]]; then
  pass "Circuit breaker enabled"
else
  warn_v "Circuit breaker not enabled"
fi

if [[ "${RESILIENCE_TELEMETRY_ENABLED:-}" == "true" ]]; then
  pass "Telemetry enabled"
else
  warn_v "Telemetry not enabled"
fi

# ── Summary ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"
echo -e "  ${GREEN}PASS: ${PASS}${NC}  |  ${YELLOW}WARN: ${WARN}${NC}  |  ${RED}FAIL: ${FAIL}${NC}"
echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}Environment validation failed. Fix issues before deploying.${NC}"
  exit 1
else
  echo -e "\n${GREEN}Environment validation passed.${NC}"
fi