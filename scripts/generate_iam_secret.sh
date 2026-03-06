#!/usr/bin/env bash
# ============================================================
# Trancendos IAM JWT Secret Generator
# ============================================================
# Generates a cryptographically secure HS512 signing key
# and outputs configuration for all ecosystem services.
#
# Usage:
#   ./scripts/generate_iam_secret.sh
#   ./scripts/generate_iam_secret.sh --github   # Output as GitHub Secret command
#   ./scripts/generate_iam_secret.sh --env      # Output as .env format
#   ./scripts/generate_iam_secret.sh --verify   # Verify existing secret strength
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

REQUIRED_LENGTH=128  # 64 bytes = 128 hex chars (HS512 minimum)

print_header() {
  echo ""
  echo -e "${CYAN}============================================================${NC}"
  echo -e "${CYAN}  Trancendos IAM JWT Secret Generator${NC}"
  echo -e "${CYAN}  Algorithm: HS512 | Quantum-Resistant Key Length${NC}"
  echo -e "${CYAN}============================================================${NC}"
  echo ""
}

generate_secret() {
  # Try Python first (most reliable)
  if command -v python3 &>/dev/null; then
    python3 -c "import secrets; print(secrets.token_hex(64))"
    return
  fi

  # Fallback to OpenSSL
  if command -v openssl &>/dev/null; then
    openssl rand -hex 64
    return
  fi

  # Fallback to /dev/urandom
  if [ -r /dev/urandom ]; then
    head -c 64 /dev/urandom | xxd -p | tr -d '\n'
    echo ""
    return
  fi

  echo -e "${RED}ERROR: No secure random source available${NC}" >&2
  exit 1
}

verify_secret() {
  local secret="$1"
  local length=${#secret}
  local errors=0

  echo -e "${CYAN}Verifying secret strength...${NC}"
  echo ""

  # Length check
  if [ "$length" -ge "$REQUIRED_LENGTH" ]; then
    echo -e "  ${GREEN}✅ Length: $length chars (minimum: $REQUIRED_LENGTH)${NC}"
  else
    echo -e "  ${RED}❌ Length: $length chars (minimum: $REQUIRED_LENGTH)${NC}"
    ((errors++))
  fi

  # Hex-only check
  if echo "$secret" | grep -qE '^[0-9a-fA-F]+$'; then
    echo -e "  ${GREEN}✅ Format: Valid hexadecimal${NC}"
  else
    echo -e "  ${YELLOW}⚠️  Format: Not pure hex (still usable but not recommended)${NC}"
  fi

  # Entropy check (unique character ratio)
  local unique_chars=$(echo "$secret" | fold -w1 | sort -u | wc -l)
  if [ "$unique_chars" -ge 10 ]; then
    echo -e "  ${GREEN}✅ Entropy: $unique_chars unique characters${NC}"
  else
    echo -e "  ${RED}❌ Entropy: Only $unique_chars unique characters (too low)${NC}"
    ((errors++))
  fi

  # Common pattern check
  if echo "$secret" | grep -qiE '(password|secret|admin|test|demo|12345)'; then
    echo -e "  ${RED}❌ Pattern: Contains common weak patterns${NC}"
    ((errors++))
  else
    echo -e "  ${GREEN}✅ Pattern: No common weak patterns detected${NC}"
  fi

  echo ""
  if [ "$errors" -eq 0 ]; then
    echo -e "  ${GREEN}🔐 Secret is PRODUCTION READY${NC}"
  else
    echo -e "  ${RED}🚫 Secret has $errors issue(s) — DO NOT use in production${NC}"
  fi

  return $errors
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

MODE="${1:-default}"

case "$MODE" in
  --verify)
    print_header
    if [ -z "${IAM_JWT_SECRET:-}" ]; then
      echo -e "${YELLOW}No IAM_JWT_SECRET environment variable found.${NC}"
      echo "Set it first: export IAM_JWT_SECRET=your_secret_here"
      exit 1
    fi
    verify_secret "$IAM_JWT_SECRET"
    ;;

  --github)
    print_header
    SECRET=$(generate_secret)
    echo -e "${GREEN}Generated HS512 secret (128 hex chars):${NC}"
    echo ""
    echo -e "${YELLOW}Add to GitHub Organization Secrets:${NC}"
    echo ""
    echo "  gh secret set IAM_JWT_SECRET --org Trancendos --body &quot;$SECRET&quot;"
    echo ""
    echo -e "${YELLOW}Or add to each repo individually:${NC}"
    echo ""
    for repo in infinity-portal guardian-ai cornelius-ai dorris-ai norman-ai the-dr-ai \
                the-agora the-citadel the-hive the-library the-nexus the-observatory \
                the-treasury the-workshop arcadia serenity-ai oracle-ai porter-family-ai \
                prometheus-ai queen-ai renik-ai sentinel-ai solarscene-ai; do
      echo "  gh secret set IAM_JWT_SECRET --repo Trancendos/$repo --body &quot;$SECRET&quot;"
    done
    echo ""
    verify_secret "$SECRET"
    ;;

  --env)
    print_header
    SECRET=$(generate_secret)
    echo -e "${GREEN}Generated HS512 secret (128 hex chars):${NC}"
    echo ""
    echo "# Add this to your .env file (ALL services must use the same secret)"
    echo "IAM_JWT_SECRET=$SECRET"
    echo "IAM_JWT_ALGORITHM=HS512"
    echo ""
    verify_secret "$SECRET"
    ;;

  *)
    print_header
    SECRET=$(generate_secret)
    echo -e "${GREEN}Generated HS512 secret:${NC}"
    echo ""
    echo "  $SECRET"
    echo ""
    verify_secret "$SECRET"
    echo ""
    echo -e "${CYAN}Usage modes:${NC}"
    echo "  ./generate_iam_secret.sh           # Generate and display"
    echo "  ./generate_iam_secret.sh --env     # Output as .env format"
    echo "  ./generate_iam_secret.sh --github  # Output as GitHub Secret commands"
    echo "  ./generate_iam_secret.sh --verify  # Verify existing IAM_JWT_SECRET"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: This secret must be identical across ALL 23 services.${NC}"
    echo -e "${YELLOW}   Store it in GitHub Organization Secrets or a secrets manager.${NC}"
    ;;
esac