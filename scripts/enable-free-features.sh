#!/bin/bash
# ============================================================
# Cloudflare Free-Tier Features Enablement Script
# ============================================================
# This script helps enable free Cloudflare features for the
# Trancendos ecosystem. Run after setting up Cloudflare API
# credentials in your environment.
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN environment variable
#   - CLOUDFLARE_ACCOUNT_ID environment variable
#   - wrangler CLI installed
#
# Usage:
#   ./scripts/enable-free-features.sh [phase]
#   Phases: all, waf, cache, analytics, zero-trust
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLOUDFLARE_DIR="$PROJECT_ROOT/.cloudflare"
LOG_FILE="$PROJECT_ROOT/cloudflare-setup.log"

# API endpoints
CF_API="https://api.cloudflare.com/client/v4"

# ============================================================
# Logging Functions
# ============================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# ============================================================
# Prerequisites Check
# ============================================================

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check for API token
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        log_error "CLOUDFLARE_API_TOKEN not set"
        log "Get your API token from: https://dash.cloudflare.com/profile/api-tokens"
        exit 1
    fi
    
    # Check for Account ID
    if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
        log_error "CLOUDFLARE_ACCOUNT_ID not set"
        log "Find your Account ID in the Cloudflare dashboard"
        exit 1
    fi
    
    # Check for wrangler
    if ! command -v wrangler &> /dev/null; then
        log_warn "wrangler not found, installing..."
        npm install -g wrangler
    fi
    
    # Check for jq
    if ! command -v jq &> /dev/null; then
        log_warn "jq not found, installing..."
        apt-get update && apt-get install -y jq || brew install jq
    fi
    
    log_success "Prerequisites check passed"
}

# ============================================================
# API Helper Functions
# ============================================================

cf_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local url="${CF_API}${endpoint}"
    local args=(-s -X "$method" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json")
    
    if [ -n "$data" ]; then
        args+=(-d "$data")
    fi
    
    curl "${args[@]}" "$url"
}

# ============================================================
# Phase 1: Enable WAF Rules (Free)
# ============================================================

enable_waf() {
    log "Enabling WAF rules..."
    
    local zone_id="$1"
    if [ -z "$zone_id" ]; then
        log_error "Zone ID required for WAF configuration"
        return 1
    fi
    
    # Enable Cloudflare Managed Ruleset
    log "Enabling Cloudflare Managed Ruleset..."
    cf_api "POST" "/zones/${zone_id}/managed_rulesets/deployments" '{
        "managed_ruleset_id": "efb7b8c949ac4650a09736fc075e2eed",
        "configuration": {
            "enabled": true,
            "action": "block"
        }
    }' | jq -r '.success // .errors // .'
    
    # Enable OWASP Core Ruleset
    log "Enabling OWASP Core Ruleset..."
    cf_api "POST" "/zones/${zone_id}/managed_rulesets/deployments" '{
        "managed_ruleset_id": "4814384a9e5d4991b9815dcfc25d2ddf",
        "configuration": {
            "enabled": true,
            "action": "challenge"
        }
    }' | jq -r '.success // .errors // .'
    
    # Enable Bot Fight Mode (Free)
    log "Enabling Bot Fight Mode..."
    cf_api "PATCH" "/zones/${zone_id}/settings/bot_fight_mode" '{"value":"on"}' | jq -r '.success // .errors // .'
    
    # Enable Browser Integrity Check
    log "Enabling Browser Integrity Check..."
    cf_api "PATCH" "/zones/${zone_id}/settings/browser_check" '{"value":"on"}' | jq -r '.success // .errors // .'
    
    # Set Security Level to Medium
    log "Setting Security Level to Medium..."
    cf_api "PATCH" "/zones/${zone_id}/settings/security_level" '{"value":"medium"}' | jq -r '.success // .errors // .'
    
    # Enable Challenge Passage
    log "Configuring Challenge Passage..."
    cf_api "PATCH" "/zones/${zone_id}/settings/challenge_ttl" '{"value":1800}' | jq -r '.success // .errors // .'
    
    log_success "WAF rules enabled"
}

# ============================================================
# Phase 2: Configure Cache Rules (Free)
# ============================================================

configure_cache() {
    log "Configuring cache rules..."
    
    local zone_id="$1"
    if [ -z "$zone_id" ]; then
        log_error "Zone ID required for cache configuration"
        return 1
    fi
    
    # Enable Polish (Image Optimization)
    log "Enabling Polish (lossless)..."
    cf_api "PATCH" "/zones/${zone_id}/settings/polish" '{"value":"lossless"}' | jq -r '.success // .errors // .'
    
    # Enable Auto Minify for HTML, CSS, JS
    log "Enabling Auto Minify..."
    cf_api "PATCH" "/zones/${zone_id}/settings/minify" '{
        "value": {
            "html": "on",
            "css": "on",
            "js": "on"
        }
    }' | jq -r '.success // .errors // .'
    
    # Enable Rocket Loader
    log "Enabling Rocket Loader..."
    cf_api "PATCH" "/zones/${zone_id}/settings/rocket_loader" '{"value":"on"}' | jq -r '.success // .errors // .'
    
    # Enable Early Hints
    log "Enabling Early Hints..."
    cf_api "PATCH" "/zones/${zone_id}/settings/early_hints" '{"value":"on"}' | jq -r '.success // .errors // .'
    
    # Set Browser Cache TTL
    log "Setting Browser Cache TTL..."
    cf_api "PATCH" "/zones/${zone_id}/settings/browser_cache_ttl" '{"value":14400}' | jq -r '.success // .errors // .'
    
    # Enable Always Online
    log "Enabling Always Online..."
    cf_api "PATCH" "/zones/${zone_id}/settings/always_online" '{"value":"on"}' | jq -r '.success // .errors // .'
    
    log_success "Cache rules configured"
}

# ============================================================
# Phase 3: Enable Analytics (Free)
# ============================================================

enable_analytics() {
    log "Enabling Web Analytics..."
    
    # Create Web Analytics site
    log "Creating Web Analytics site..."
    local result=$(cf_api "POST" "/accounts/${CLOUDFLARE_ACCOUNT_ID}/web_analytics/sites" '{
        "auto_install": false
    }')
    
    local site_id=$(echo "$result" | jq -r '.result.site_id // empty')
    
    if [ -n "$site_id" ]; then
        log_success "Web Analytics site created: $site_id"
        log "Add this script to your HTML:"
        echo "<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{\"token\": \"${site_id}\"}'></script><!-- End Cloudflare Web Analytics -->"
    else
        log_warn "Web Analytics may already be enabled"
    fi
    
    # Enable Workers Analytics (automatic)
    log "Workers Analytics are enabled by default"
    
    log_success "Analytics configured"
}

# ============================================================
# Phase 4: Enable Zero Trust (Free - 50 Users)
# ============================================================

enable_zero_trust() {
    log "Enabling Zero Trust..."
    
    # Check if Zero Trust is already enabled
    log "Checking Zero Trust status..."
    local team_name=$(cf_api "GET" "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/identity_providers" | jq -r '.result[0].config.team_name // empty')
    
    if [ -n "$team_name" ]; then
        log_success "Zero Trust already configured: $team_name"
    else
        log "To enable Zero Trust, visit:"
        log "https://one.dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}"
        log ""
        log "Free tier includes:"
        log "  - Up to 50 users"
        log "  - Access (inbound protection)"
        log "  - Gateway (DNS filtering)"
        log "  - Tunnel (secure connections)"
        log ""
        log "Steps to enable:"
        log "1. Go to the URL above"
        log "2. Click 'Get Started' for Zero Trust"
        log "3. Create your team name"
        log "4. Add identity providers (GitHub, Google, etc.)"
        log "5. Create Access applications"
    fi
    
    log_success "Zero Trust instructions provided"
}

# ============================================================
# Phase 5: Create D1 Database (Free)
# ============================================================

create_d1_database() {
    log "Creating D1 database..."
    
    local db_name="${1:-infinity-os-db}"
    
    # Check if database exists
    local existing=$(wrangler d1 list 2>/dev/null | grep "$db_name" || true)
    
    if [ -n "$existing" ]; then
        log_success "D1 database '$db_name' already exists"
    else
        log "Creating D1 database: $db_name"
        wrangler d1 create "$db_name"
        log_success "D1 database created"
    fi
}

# ============================================================
# Phase 6: Create KV Namespaces (Free)
# ============================================================

create_kv_namespaces() {
    log "Creating KV namespaces..."
    
    local namespaces=(
        "infinity-sessions"
        "infinity-token-cache"
        "infinity-secrets-cache"
        "infinity-cache"
        "infinity-rate-limit"
        "infinity-metrics"
        "infinity-alerts"
    )
    
    for ns in "${namespaces[@]}"; do
        log "Checking KV namespace: $ns"
        local existing=$(wrangler kv:namespace list 2>/dev/null | jq -r ".[] | select(.title == \"$ns\") | .id" || true)
        
        if [ -n "$existing" ]; then
            log_success "KV namespace '$ns' exists: $existing"
        else
            log "Creating KV namespace: $ns"
            wrangler kv:namespace create "$ns"
            log_success "KV namespace created: $ns"
        fi
    done
}

# ============================================================
# Phase 7: Create R2 Buckets (Free)
# ============================================================

create_r2_buckets() {
    log "Creating R2 buckets..."
    
    local buckets=(
        "infinity-void-secrets"
        "infinity-uploads"
        "infinity-assets"
    )
    
    for bucket in "${buckets[@]}"; do
        log "Checking R2 bucket: $bucket"
        local existing=$(wrangler r2 bucket list 2>/dev/null | grep "$bucket" || true)
        
        if [ -n "$existing" ]; then
            log_success "R2 bucket '$bucket' already exists"
        else
            log "Creating R2 bucket: $bucket"
            wrangler r2 bucket create "$bucket" 2>/dev/null || log_warn "Bucket creation may have failed or already exists"
        fi
    done
}

# ============================================================
# Phase 8: Create Queues (Free - 10K messages/month)
# ============================================================

create_queues() {
    log "Creating queues..."
    
    local queues=(
        "infinity-task-queue"
        "infinity-event-queue"
        "infinity-notification-queue"
    )
    
    for queue in "${queues[@]}"; do
        log "Creating queue: $queue"
        wrangler queues create "$queue" 2>/dev/null || log_warn "Queue may already exist"
    done
    
    log_success "Queues created"
}

# ============================================================
# Main Script
# ============================================================

main() {
    local phase="${1:-all}"
    
    echo ""
    echo "============================================================"
    echo "  Cloudflare Free-Tier Features Enablement"
    echo "  Trancendos Ecosystem"
    echo "============================================================"
    echo ""
    
    check_prerequisites
    
    case "$phase" in
        "all")
            log "Running all phases..."
            log ""
            log "Note: Some features require Zone ID for domain-specific settings"
            log "Get your Zone ID from: https://dash.cloudflare.com"
            log ""
            
            # Resources that don't need Zone ID
            create_d1_database
            create_kv_namespaces
            create_r2_buckets
            create_queues
            enable_analytics
            enable_zero_trust
            ;;
        "waf")
            read -p "Enter your Zone ID: " zone_id
            enable_waf "$zone_id"
            ;;
        "cache")
            read -p "Enter your Zone ID: " zone_id
            configure_cache "$zone_id"
            ;;
        "analytics")
            enable_analytics
            ;;
        "zero-trust")
            enable_zero_trust
            ;;
        "resources")
            create_d1_database
            create_kv_namespaces
            create_r2_buckets
            create_queues
            ;;
        *)
            log_error "Unknown phase: $phase"
            echo "Usage: $0 [all|waf|cache|analytics|zero-trust|resources]"
            exit 1
            ;;
    esac
    
    echo ""
    echo "============================================================"
    log_success "Enablement complete!"
    echo "============================================================"
    echo ""
    echo "Next steps:"
    echo "1. Review the configuration in Cloudflare dashboard"
    echo "2. Update wrangler.toml with actual resource IDs"
    echo "3. Deploy workers with: wrangler deploy --env production"
    echo ""
}

# Run main
main "$@"