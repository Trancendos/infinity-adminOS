#!/bin/bash

# ============================================================
# Trancendos Production Deployment Script
# Domain: transcendos.com
# ============================================================
# This script automates the deployment of the Trancendos
# platform to Cloudflare production environment.
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="transcendos.com"
ENVIRONMENT="production"
LOG_FILE="deployment-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# ============================================================
# Phase 1: Prerequisites Check
# ============================================================

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI not found. Installing..."
        npm install -g wrangler
    fi
    
    # Check if authenticated
    if ! wrangler whoami &> /dev/null; then
        log_error "Not authenticated with Cloudflare. Please run 'wrangler login'"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# ============================================================
# Phase 2: Create Cloudflare Resources
# ============================================================

create_d1_databases() {
    log "Creating D1 databases..."
    
    # Primary database
    log "Creating primary database (infinity-os-db)..."
    wrangler d1 create infinity-os-db 2>/dev/null || log_warning "Database may already exist"
    
    # Analytics database
    log "Creating analytics database (infinity-analytics-db)..."
    wrangler d1 create infinity-analytics-db 2>/dev/null || log_warning "Database may already exist"
    
    # Audit database
    log "Creating audit database (infinity-audit-db)..."
    wrangler d1 create infinity-audit-db 2>/dev/null || log_warning "Database may already exist"
    
    log_success "D1 databases created"
}

create_kv_namespaces() {
    log "Creating KV namespaces..."
    
    # Session storage
    wrangler kv:namespace create KV_SESSIONS 2>/dev/null || log_warning "KV_SESSIONS may already exist"
    
    # Rate limiting
    wrangler kv:namespace create KV_RATE_LIMIT 2>/dev/null || log_warning "KV_RATE_LIMIT may already exist"
    
    # Token cache
    wrangler kv:namespace create KV_TOKEN_CACHE 2>/dev/null || log_warning "KV_TOKEN_CACHE may already exist"
    
    # Configuration
    wrangler kv:namespace create KV_CONFIG 2>/dev/null || log_warning "KV_CONFIG may already exist"
    
    # Cache
    wrangler kv:namespace create KV_CACHE 2>/dev/null || log_warning "KV_CACHE may already exist"
    
    # Secrets
    wrangler kv:namespace create KV_SECRETS 2>/dev/null || log_warning "KV_SECRETS may already exist"
    
    log_success "KV namespaces created"
}

create_r2_buckets() {
    log "Creating R2 buckets..."
    
    # Static assets
    wrangler r2 bucket create transcendos-assets 2>/dev/null || log_warning "Bucket may already exist"
    
    # User data
    wrangler r2 bucket create transcendos-user-data 2>/dev/null || log_warning "Bucket may already exist"
    
    # Backups
    wrangler r2 bucket create transcendos-backups 2>/dev/null || log_warning "Bucket may already exist"
    
    log_success "R2 buckets created"
}

create_queues() {
    log "Creating Cloudflare Queues..."
    
    wrangler queues create dispatch-queue 2>/dev/null || log_warning "Queue may already exist"
    wrangler queues create event-bus 2>/dev/null || log_warning "Queue may already exist"
    
    log_success "Queues created"
}

# ============================================================
# Phase 3: Deploy Workers
# ============================================================

deploy_platform_core() {
    log "Deploying Platform Core workers..."
    
    # Platform Core workers (critical)
    CORE_WORKERS=(
        "infinity-one"
        "lighthouse"
        "hive"
        "void"
    )
    
    for worker in "${CORE_WORKERS[@]}"; do
        if [ -d "workers/$worker" ]; then
            log "Deploying $worker..."
            cd "workers/$worker"
            wrangler deploy --env production 2>&1 | tee -a "../../$LOG_FILE"
            cd ../..
            log_success "$worker deployed"
        else
            log_warning "Worker directory not found: $worker"
        fi
    done
}

deploy_service_layer() {
    log "Deploying Service Layer workers..."
    
    SERVICE_WORKERS=(
        "api-gateway"
        "ai-api"
        "pqc-service"
        "registry"
        "dispatch"
        "dpid-registry"
    )
    
    for worker in "${SERVICE_WORKERS[@]}"; do
        if [ -d "workers/$worker" ]; then
            log "Deploying $worker..."
            cd "workers/$worker"
            wrangler deploy --env production 2>&1 | tee -a "../../$LOG_FILE"
            cd ../..
            log_success "$worker deployed"
        else
            log_warning "Worker directory not found: $worker"
        fi
    done
}

deploy_specialized_workers() {
    log "Deploying Specialized workers..."
    
    SPECIALIZED_WORKERS=(
        "oracle-foresight"
        "cornelius-strategy-oracle"
        "dimensional-fabric"
        "universal-upif"
        "l402-gateway"
        "depin-broker"
        "the-grid-api"
        "carbon-router"
        "monitoring-dashboard"
        "arcadian-exchange"
        "ber-engine"
        "chrono-intelligence"
        "covert-synthesis"
        "cyber-physical-api"
        "filesystem"
        "identity"
        "knowledge-graph-service"
        "orchestrator"
        "royal-bank"
        "sentinel-station"
        "ws-api"
        "files-api"
        "auth-api"
        "ai"
        "app-factory"
    )
    
    for worker in "${SPECIALIZED_WORKERS[@]}"; do
        if [ -d "workers/$worker" ]; then
            log "Deploying $worker..."
            cd "workers/$worker"
            wrangler deploy --env production 2>&1 | tee -a "../../$LOG_FILE" || log_warning "Failed to deploy $worker"
            cd ../..
        else
            log_warning "Worker directory not found: $worker"
        fi
    done
    
    log_success "Specialized workers deployment complete"
}

# ============================================================
# Phase 4: Configure Custom Domains
# ============================================================

configure_domains() {
    log "Configuring custom domains..."
    
    # Map of workers to their custom domains
    declare -A DOMAIN_MAP=(
        ["infinity-one"]="auth.transcendos.com"
        ["infinity-lighthouse"]="tokens.transcendos.com"
        ["infinity-hive"]="router.transcendos.com"
        ["infinity-void"]="secrets.transcendos.com"
        ["infinity-api-gateway"]="api.transcendos.com"
        ["ai-api"]="ai.transcendos.com"
        ["pqc-service"]="pqc.transcendos.com"
        ["registry"]="registry.transcendos.com"
        ["dispatch"]="dispatch.transcendos.com"
    )
    
    for worker in "${!DOMAIN_MAP[@]}"; do
        domain="${DOMAIN_MAP[$worker]}"
        log "Configuring $domain for $worker..."
        wrangler domains add "$worker" "$domain" 2>/dev/null || log_warning "Domain may already be configured"
    done
    
    log_success "Custom domains configured"
}

# ============================================================
# Phase 5: Database Migrations
# ============================================================

run_migrations() {
    log "Running database migrations..."
    
    # Check if migrations directory exists
    if [ -d "migrations" ]; then
        for migration in migrations/*.sql; do
            if [ -f "$migration" ]; then
                log "Applying migration: $migration"
                wrangler d1 execute infinity-os-db --file "$migration" --env production
            fi
        done
        log_success "Migrations applied"
    else
        log_warning "No migrations directory found"
    fi
}

# ============================================================
# Phase 6: Health Checks
# ============================================================

run_health_checks() {
    log "Running health checks..."
    
    # Core service health checks
    CORE_ENDPOINTS=(
        "https://auth.transcendos.com/health"
        "https://tokens.transcendos.com/health"
        "https://router.transcendos.com/health"
        "https://secrets.transcendos.com/health"
        "https://api.transcendos.com/health"
    )
    
    for endpoint in "${CORE_ENDPOINTS[@]}"; do
        log "Checking $endpoint..."
        if curl -sf "$endpoint" > /dev/null 2>&1; then
            log_success "$endpoint is healthy"
        else
            log_warning "$endpoint is not responding (may not be deployed yet)"
        fi
    done
}

# ============================================================
# Phase 7: Deployment Summary
# ============================================================

print_summary() {
    echo ""
    echo "========================================"
    echo "       DEPLOYMENT SUMMARY"
    echo "========================================"
    echo ""
    echo "Domain: $DOMAIN"
    echo "Environment: $ENVIRONMENT"
    echo "Log File: $LOG_FILE"
    echo ""
    echo "Next Steps:"
    echo "1. Update DNS records in Cloudflare"
    echo "2. Configure WAF rules"
    echo "3. Enable Cloudflare Analytics"
    echo "4. Set up monitoring and alerts"
    echo "5. Run end-to-end tests"
    echo ""
    echo "Documentation:"
    echo "- DOMAIN_ARCHITECTURE.md"
    echo "- MIGRATION_CHECKLIST.md"
    echo "- SECURITY_IMPROVEMENTS.md"
    echo ""
    echo "========================================"
}

# ============================================================
# Main Execution
# ============================================================

main() {
    echo ""
    echo "========================================"
    echo "  TRANSCENDOS PRODUCTION DEPLOYMENT"
    echo "========================================"
    echo ""
    
    # Parse arguments
    PHASE="${1:-all}"
    
    case "$PHASE" in
        "prerequisites")
            check_prerequisites
            ;;
        "resources")
            check_prerequisites
            create_d1_databases
            create_kv_namespaces
            create_r2_buckets
            create_queues
            ;;
        "core")
            check_prerequisites
            deploy_platform_core
            ;;
        "services")
            check_prerequisites
            deploy_service_layer
            ;;
        "specialized")
            check_prerequisites
            deploy_specialized_workers
            ;;
        "domains")
            configure_domains
            ;;
        "migrations")
            run_migrations
            ;;
        "health")
            run_health_checks
            ;;
        "all")
            check_prerequisites
            create_d1_databases
            create_kv_namespaces
            create_r2_buckets
            create_queues
            deploy_platform_core
            deploy_service_layer
            deploy_specialized_workers
            configure_domains
            run_migrations
            run_health_checks
            ;;
        *)
            echo "Usage: $0 [prerequisites|resources|core|services|specialized|domains|migrations|health|all]"
            exit 1
            ;;
    esac
    
    print_summary
}

# Run main function
main "$@"