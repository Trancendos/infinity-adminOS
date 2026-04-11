#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Health Check Script
# ══════════════════════════════════════════════════════════════
# Checks /health endpoint on all 31 services
# Usage: bash scripts/health-check.sh [--json] [--wave N]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

JSON_OUTPUT=false
WAVE_FILTER=""
TIMEOUT=5
HEALTHY=0
UNHEALTHY=0
UNREACHABLE=0

for arg in "$@"; do
  case $arg in
    --json) JSON_OUTPUT=true ;;
    --wave) WAVE_FILTER="$2"; shift ;;
  esac
done

# Service definitions: name:port:wave
SERVICES=(
  "infinity-portal:3000:1"
  "guardian-ai:3010:2"
  "cornelius-ai:3011:2"
  "dorris-ai:3012:2"
  "norman-ai:3013:2"
  "the-dr-ai:3014:2"
  "the-agora:3020:3"
  "the-citadel:3021:3"
  "the-hive:3022:3"
  "the-library:3023:3"
  "the-nexus:3024:3"
  "the-observatory:3025:3"
  "the-treasury:3026:3"
  "the-workshop:3027:3"
  "arcadia:3028:3"
  "serenity-ai:3030:4"
  "oracle-ai:3031:4"
  "porter-family-ai:3032:4"
  "prometheus-ai:3033:4"
  "queen-ai:3034:4"
  "renik-ai:3035:4"
  "sentinel-ai:3036:4"
  "solarscene-ai:3037:4"
  "api-marketplace:3040:5"
  "artifactory:3041:5"
  "section7:3050:6"
  "style-and-shoot:3051:6"
  "fabulousa:3052:6"
  "tranceflow:3053:6"
  "tateking:3054:6"
  "the-digitalgrid:3055:6"
)

check_health() {
  local name=$1
  local port=$2
  local wave=$3

  if [[ -n "$WAVE_FILTER" && "$wave" != "$WAVE_FILTER" ]]; then
    return
  fi

  local url="http://localhost:${port}/health"
  local start_time=$(date +%s%N)

  HTTP_CODE=$(curl -s -o /tmp/health_response -w "%{http_code}" \
    --connect-timeout $TIMEOUT --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")

  local end_time=$(date +%s%N)
  local latency=$(( (end_time - start_time) / 1000000 ))

  if [[ "$HTTP_CODE" == "200" ]]; then
    HEALTHY=$((HEALTHY + 1))
    if [[ "$JSON_OUTPUT" == "false" ]]; then
      printf "  ${GREEN}✓${NC} %-22s Port %-5s Wave %s  ${GREEN}%sms${NC}\n" "$name" "$port" "$wave" "$latency"
    fi
  elif [[ "$HTTP_CODE" == "000" ]]; then
    UNREACHABLE=$((UNREACHABLE + 1))
    if [[ "$JSON_OUTPUT" == "false" ]]; then
      printf "  ${RED}✗${NC} %-22s Port %-5s Wave %s  ${RED}UNREACHABLE${NC}\n" "$name" "$port" "$wave"
    fi
  else
    UNHEALTHY=$((UNHEALTHY + 1))
    if [[ "$JSON_OUTPUT" == "false" ]]; then
      printf "  ${YELLOW}!${NC} %-22s Port %-5s Wave %s  ${YELLOW}HTTP %s${NC}\n" "$name" "$port" "$wave" "$HTTP_CODE"
    fi
  fi
}

if [[ "$JSON_OUTPUT" == "false" ]]; then
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  TRANCENDOS ECOSYSTEM — Health Check${NC}"
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
fi

CURRENT_WAVE=""
for svc in "${SERVICES[@]}"; do
  IFS=':' read -r name port wave <<< "$svc"

  if [[ -n "$WAVE_FILTER" && "$wave" != "$WAVE_FILTER" ]]; then
    continue
  fi

  if [[ "$JSON_OUTPUT" == "false" && "$wave" != "$CURRENT_WAVE" ]]; then
    CURRENT_WAVE=$wave
    case $wave in
      1) echo -e "\n  ${CYAN}Wave 1 — Core Platform${NC}" ;;
      2) echo -e "\n  ${CYAN}Wave 2 — AI Agents${NC}" ;;
      3) echo -e "\n  ${CYAN}Wave 3 — Infrastructure${NC}" ;;
      4) echo -e "\n  ${CYAN}Wave 4 — Intelligence${NC}" ;;
      5) echo -e "\n  ${CYAN}Wave 5 — Marketplace${NC}" ;;
      6) echo -e "\n  ${CYAN}Wave 6 — Studios${NC}" ;;
    esac
  fi

  check_health "$name" "$port" "$wave"
done

TOTAL=$((HEALTHY + UNHEALTHY + UNREACHABLE))

if [[ "$JSON_OUTPUT" == "true" ]]; then
  echo "{&quot;total&quot;:$TOTAL,&quot;healthy&quot;:$HEALTHY,&quot;unhealthy&quot;:$UNHEALTHY,&quot;unreachable&quot;:$UNREACHABLE,&quot;timestamp&quot;:&quot;$(date -u +%Y-%m-%dT%H:%M:%SZ)&quot;}"
else
  echo ""
  echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"
  echo -e "  Total: $TOTAL | ${GREEN}Healthy: $HEALTHY${NC} | ${YELLOW}Unhealthy: $UNHEALTHY${NC} | ${RED}Unreachable: $UNREACHABLE${NC}"
  echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"

  if [[ $UNHEALTHY -gt 0 || $UNREACHABLE -gt 0 ]]; then
    exit 1
  fi
fi