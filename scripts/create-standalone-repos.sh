#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Create Standalone GitHub Repos
# ══════════════════════════════════════════════════════════════
# Run this locally with your GitHub PAT to create the 7 repos
# that couldn't be created by the CI bot.
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth login)
#   - Member of Trancendos org with repo creation rights
#
# Usage: bash scripts/create-standalone-repos.sh
# ══════════════════════════════════════════════════════════════

set -euo pipefail

ORG="Trancendos"
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "══════════════════════════════════════════════════════"
echo "  Create Standalone Repos for Wave 6 + Artifactory"
echo "══════════════════════════════════════════════════════"
echo -e "${NC}"

# Check gh CLI
if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: gh CLI not found. Install: https://cli.github.com/${NC}"
  exit 1
fi

# Check auth
if ! gh auth status &> /dev/null; then
  echo -e "${RED}Error: Not authenticated. Run: gh auth login${NC}"
  exit 1
fi

echo -e "Authenticated as: $(gh api user --jq '.login')"
echo ""

# Repo definitions
declare -A REPOS=(
  ["section7"]="Intelligence, Narrative & Research Studio — Wave 6 | Port 3050 | Trancendos Ecosystem"
  ["style-and-shoot"]="UX/UI & Visual Engine Studio — Wave 6 | Port 3051 | Trancendos Ecosystem"
  ["fabulousa"]="Generative Fashion & Style Engine Studio — Wave 6 | Port 3052 | Trancendos Ecosystem"
  ["tranceflow"]="3D Spatial & Avatar Engine Studio — Wave 6 | Port 3053 | Trancendos Ecosystem"
  ["tateking"]="Serverless Cinematic Rendering Studio — Wave 6 | Port 3054 | Trancendos Ecosystem"
  ["the-digitalgrid"]="Infrastructure & CI/CD Automation Studio — Wave 6 | Port 3055 | Trancendos Ecosystem"
  ["artifactory"]="Trancendos Artifactory v2.0 — Multi-Protocol Package Registry | Port 3041"
)

CREATED=0
SKIPPED=0
FAILED=0

for repo in section7 style-and-shoot fabulousa tranceflow tateking the-digitalgrid artifactory; do
  DESC="${REPOS[$repo]}"
  echo -n "  Creating ${ORG}/${repo}... "

  # Check if exists
  if gh repo view "${ORG}/${repo}" &> /dev/null; then
    echo -e "${CYAN}already exists — skipping${NC}"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Create repo
  if gh repo create "${ORG}/${repo}" \
    --public \
    --description "$DESC" \
    --clone=false 2>/dev/null; then
    echo -e "${GREEN}✓ created${NC}"
    CREATED=$((CREATED + 1))
  else
    echo -e "${RED}✗ failed${NC}"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"
echo -e "  Created: ${GREEN}${CREATED}${NC} | Skipped: ${CYAN}${SKIPPED}${NC} | Failed: ${RED}${FAILED}${NC}"
echo -e "${CYAN}──────────────────────────────────────────────────────${NC}"

if [[ $CREATED -gt 0 || $SKIPPED -gt 0 ]]; then
  echo ""
  echo -e "${CYAN}Next: Push source code to the new repos:${NC}"
  echo ""

  for repo in section7 style-and-shoot fabulousa tranceflow tateking the-digitalgrid; do
    echo "  cd wave6-studios/${repo}"
    echo "  git init && git add -A && git commit -m 'feat: initial ${repo} studio'"
    echo "  git remote add origin https://github.com/${ORG}/${repo}.git"
    echo "  git branch -M main && git push -u origin main"
    echo ""
  done

  echo "  cd services/artifactory"
  echo "  git init && git add -A && git commit -m 'feat: artifactory v2.0'"
  echo "  git remote add origin https://github.com/${ORG}/artifactory.git"
  echo "  git branch -M main && git push -u origin main"
fi