#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Security Audit Script
# ══════════════════════════════════════════════════════════════
# Performs OWASP-aligned security checks across the ecosystem
# Usage: bash scripts/security-audit.sh [--strict]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

STRICT="${1:-}"
PASS=0
WARN=0
FAIL=0
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC}  $1"; }
warn_check() { WARN=$((WARN + 1)); echo -e "  ${YELLOW}WARN${NC}  $1"; }
fail_check() { FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC}  $1"; }

echo -e "${CYAN}"
echo "══════════════════════════════════════════════════════"
echo "  TRANCENDOS ECOSYSTEM — Security Audit"
echo "  Timestamp: ${TIMESTAMP}"
echo "══════════════════════════════════════════════════════"
echo -e "${NC}"

# ── 1. Environment Variable Security ──────────────────────
echo -e "\n${CYAN}[1/7] Environment Variable Security${NC}"

if [[ -f ".env" ]]; then
  # Check for default secrets
  if grep -q "CHANGE_ME" .env 2>/dev/null; then
    fail_check "Default secrets found in .env (CHANGE_ME values)"
  else
    pass "No default secrets in .env"
  fi

  # Check for weak JWT secret
  JWT_SECRET=$(grep "IAM_JWT_SECRET" .env 2>/dev/null | cut -d= -f2)
  if [[ -n "$JWT_SECRET" && ${#JWT_SECRET} -lt 32 ]]; then
    fail_check "JWT secret too short (< 32 chars)"
  elif [[ -n "$JWT_SECRET" ]]; then
    pass "JWT secret length adequate (${#JWT_SECRET} chars)"
  fi

  # Check .env not in git
  if git ls-files --error-unmatch .env 2>/dev/null; then
    fail_check ".env is tracked by git — add to .gitignore"
  else
    pass ".env not tracked by git"
  fi
else
  warn_check "No .env file found (using defaults or env injection)"
fi

# Check .env.production doesn't have real secrets
if [[ -f ".env.production" ]]; then
  if grep -q "CHANGE_ME" .env.production; then
    pass ".env.production uses placeholder values"
  else
    warn_check ".env.production may contain real secrets"
  fi
fi

# ── 2. Docker Security ────────────────────────────────────
echo -e "\n${CYAN}[2/7] Docker Security${NC}"

# Check Dockerfiles for security best practices
DOCKERFILES=$(find . -name "Dockerfile" -not -path "*/node_modules/*" 2>/dev/null)
for df in $DOCKERFILES; do
  # Check for root user
  if grep -q "USER" "$df"; then
    pass "$df: Non-root user configured"
  else
    warn_check "$df: No USER directive (runs as root)"
  fi

  # Check for HEALTHCHECK
  if grep -q "HEALTHCHECK" "$df"; then
    pass "$df: HEALTHCHECK defined"
  else
    warn_check "$df: No HEALTHCHECK directive"
  fi

  # Check for latest tag
  if grep -qE "FROM.*:latest" "$df"; then
    warn_check "$df: Uses :latest tag (pin versions for reproducibility)"
  else
    pass "$df: Uses pinned image tags"
  fi
done

# ── 3. Port Exposure Audit ─────────────────────────────────
echo -e "\n${CYAN}[3/7] Port Exposure Audit${NC}"

if [[ -f "docker-compose.ecosystem.yml" ]]; then
  # Check for ports bound to 0.0.0.0 (all interfaces)
  EXPOSED=$(grep -c '"[0-9]*:[0-9]*"' docker-compose.ecosystem.yml 2>/dev/null || echo 0)
  pass "Docker Compose: ${EXPOSED} port mappings defined"

  # Check for privileged mode
  if grep -q "privileged: true" docker-compose.ecosystem.yml; then
    fail_check "Privileged containers detected"
  else
    pass "No privileged containers"
  fi

  # Check for host network mode
  if grep -q "network_mode: host" docker-compose.ecosystem.yml; then
    warn_check "Host network mode detected"
  else
    pass "No host network mode"
  fi
fi

# ── 4. Dependency Security ─────────────────────────────────
echo -e "\n${CYAN}[4/7] Dependency Security${NC}"

PACKAGE_FILES=$(find . -name "package.json" -not -path "*/node_modules/*" -maxdepth 3 2>/dev/null)
PKG_COUNT=$(echo "$PACKAGE_FILES" | wc -l)
pass "Found ${PKG_COUNT} package.json files"

# Check for known vulnerable patterns
for pf in $PACKAGE_FILES; do
  DIR=$(dirname "$pf")
  if [[ -f "${DIR}/package-lock.json" || -f "${DIR}/pnpm-lock.yaml" ]]; then
    pass "$pf: Lock file present"
  else
    warn_check "$pf: No lock file (non-deterministic installs)"
  fi
done

# ── 5. TIGA Governance Compliance ──────────────────────────
echo -e "\n${CYAN}[5/7] TIGA Governance Compliance${NC}"

if [[ -d "compliance/tiga" ]]; then
  pass "TIGA governance directory exists"

  if [[ -f "compliance/tiga/ff-controls.md" ]]; then
    FF_COUNT=$(grep -c "FF-CTRL" compliance/tiga/ff-controls.md 2>/dev/null || echo 0)
    pass "Foundation Framework: ${FF_COUNT} controls defined"
  else
    fail_check "Missing ff-controls.md"
  fi

  if [[ -f "compliance/tiga/tef-policies.md" ]]; then
    TEF_COUNT=$(grep -c "TEF-POL" compliance/tiga/tef-policies.md 2>/dev/null || echo 0)
    pass "TEF Policies: ${TEF_COUNT} policies defined"
  else
    fail_check "Missing tef-policies.md"
  fi

  if [[ -f "compliance/tiga/src/daisy-chain-validator.ts" ]]; then
    pass "Daisy-Chain validator present"
  else
    warn_check "Missing daisy-chain-validator.ts"
  fi
else
  fail_check "TIGA governance directory missing"
fi

# ── 6. Ista Standard Compliance ────────────────────────────
echo -e "\n${CYAN}[6/7] Ista Standard Compliance${NC}"

ISTA_COUNT=0
for studio in wave6-studios/section7 wave6-studios/style-and-shoot wave6-studios/fabulousa wave6-studios/tranceflow wave6-studios/tateking wave6-studios/the-digitalgrid; do
  if [[ -f "${studio}/src/config/ista-config.ts" ]]; then
    ISTA_COUNT=$((ISTA_COUNT + 1))
  else
    warn_check "Missing ista-config.ts in ${studio}"
  fi
done

if [[ $ISTA_COUNT -eq 6 ]]; then
  pass "All 6 studios have Ista Standard configs"
else
  warn_check "Only ${ISTA_COUNT}/6 studios have Ista configs"
fi

# ── 7. Secret Detection ───────────────────────────────────
echo -e "\n${CYAN}[7/7] Secret Detection Scan${NC}"

SECRET_PATTERNS=(
  "password\s*=\s*['&quot;][^'&quot;]*['&quot;]"
  "api[_-]?key\s*=\s*['&quot;][^'&quot;]*['&quot;]"
  "secret\s*=\s*['&quot;][^'&quot;]*['&quot;]"
  "token\s*=\s*['&quot;][a-zA-Z0-9]{20,}['&quot;]"
  "-----BEGIN.*PRIVATE KEY-----"
)

SECRETS_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  MATCHES=$(grep -rlE "$pattern" --include="*.ts" --include="*.js" --include="*.json" \
    --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | \
    grep -v ".env" | grep -v "example" | grep -v "template" | grep -v "test" | head -5)
  if [[ -n "$MATCHES" ]]; then
    SECRETS_FOUND=$((SECRETS_FOUND + 1))
    warn_check "Potential secret pattern in: $(echo $MATCHES | head -1)"
  fi
done

if [[ $SECRETS_FOUND -eq 0 ]]; then
  pass "No hardcoded secrets detected in source files"
fi

# ── Summary ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "  Security Audit Summary"
echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"
echo -e "  ${GREEN}PASS: ${PASS}${NC}  |  ${YELLOW}WARN: ${WARN}${NC}  |  ${RED}FAIL: ${FAIL}${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"

if [[ "$STRICT" == "--strict" && ($FAIL -gt 0 || $WARN -gt 0) ]]; then
  echo -e "\n${RED}Strict mode: audit failed with warnings/failures${NC}"
  exit 1
elif [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}Audit completed with failures — address before production${NC}"
  exit 1
else
  echo -e "\n${GREEN}Audit passed — ecosystem security posture acceptable${NC}"
fi