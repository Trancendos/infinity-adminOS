# ══════════════════════════════════════════════════════════════
# TRANCENDOS ECOSYSTEM — Production Makefile
# ══════════════════════════════════════════════════════════════
# Usage:
#   make help          — Show all commands
#   make up            — Start full ecosystem
#   make down          — Stop full ecosystem
#   make build         — Build all services
#   make health        — Check all service health
#   make logs          — Tail all service logs
#   make deploy-prod   — Full production deployment
# ══════════════════════════════════════════════════════════════

SHELL := /bin/bash
.DEFAULT_GOAL := help
COMPOSE_FILE := docker-compose.ecosystem.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

# ── Colors ──────────────────────────────────────────────────
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
CYAN   := \033[0;36m
NC     := \033[0m

# ── Service Groups ──────────────────────────────────────────
WAVE1 := infinity-portal
WAVE2 := guardian-ai cornelius-ai dorris-ai norman-ai the-dr-ai
WAVE3 := the-agora the-citadel the-hive the-library the-nexus the-observatory the-treasury the-workshop arcadia
WAVE4 := serenity-ai oracle-ai porter-family-ai prometheus-ai queen-ai renik-ai sentinel-ai solarscene-ai
WAVE5 := api-marketplace artifactory
WAVE6 := section7 style-and-shoot fabulousa tranceflow tateking the-digitalgrid
ALL_SERVICES := $(WAVE1) $(WAVE2) $(WAVE3) $(WAVE4) $(WAVE5) $(WAVE6)

# ── Port Map ────────────────────────────────────────────────
# Wave 1: 3000
# Wave 2: 3010-3014
# Wave 3: 3020-3028
# Wave 4: 3030-3037
# Wave 5: 3040-3041
# Wave 6: 3050-3055

# ══════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════

.PHONY: build
build: ## Build all 31 services
	@echo -e "$(CYAN)Building all 31 ecosystem services...$(NC)"
	$(COMPOSE) build --parallel
	@echo -e "$(GREEN)✓ All services built$(NC)"

.PHONY: build-wave1
build-wave1: ## Build Wave 1 (Core Platform)
	$(COMPOSE) build $(WAVE1)

.PHONY: build-wave2
build-wave2: ## Build Wave 2 (AI Agents)
	$(COMPOSE) build $(WAVE2)

.PHONY: build-wave3
build-wave3: ## Build Wave 3 (Infrastructure)
	$(COMPOSE) build $(WAVE3)

.PHONY: build-wave4
build-wave4: ## Build Wave 4 (Intelligence)
	$(COMPOSE) build $(WAVE4)

.PHONY: build-wave5
build-wave5: ## Build Wave 5 (Marketplace)
	$(COMPOSE) build $(WAVE5)

.PHONY: build-wave6
build-wave6: ## Build Wave 6 (Studios)
	$(COMPOSE) build $(WAVE6)

.PHONY: build-no-cache
build-no-cache: ## Build all services without cache
	$(COMPOSE) build --no-cache --parallel

# ══════════════════════════════════════════════════════════════
# RUN
# ══════════════════════════════════════════════════════════════

.PHONY: up
up: ## Start full ecosystem (all 31 services)
	@echo -e "$(CYAN)Starting Trancendos Ecosystem (31 services)...$(NC)"
	$(COMPOSE) up -d
	@echo -e "$(GREEN)✓ Ecosystem started$(NC)"
	@$(MAKE) --no-print-directory status

.PHONY: up-core
up-core: ## Start core services only (Wave 1-2)
	$(COMPOSE) up -d $(WAVE1) $(WAVE2)

.PHONY: up-infra
up-infra: ## Start infrastructure services (Wave 1-3)
	$(COMPOSE) up -d $(WAVE1) $(WAVE2) $(WAVE3)

.PHONY: up-studios
up-studios: ## Start Wave 6 Studios only
	$(COMPOSE) up -d $(WAVE6)

.PHONY: down
down: ## Stop full ecosystem
	@echo -e "$(YELLOW)Stopping Trancendos Ecosystem...$(NC)"
	$(COMPOSE) down
	@echo -e "$(GREEN)✓ Ecosystem stopped$(NC)"

.PHONY: down-volumes
down-volumes: ## Stop ecosystem and remove volumes
	$(COMPOSE) down -v

.PHONY: restart
restart: down up ## Restart full ecosystem

# ══════════════════════════════════════════════════════════════
# MONITORING & HEALTH
# ══════════════════════════════════════════════════════════════

.PHONY: status
status: ## Show status of all services
	@echo -e "$(CYAN)Trancendos Ecosystem Status:$(NC)"
	@$(COMPOSE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

.PHONY: health
health: ## Run health checks on all services
	@echo -e "$(CYAN)Running health checks on all 31 services...$(NC)"
	@bash scripts/health-check.sh

.PHONY: logs
logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=50

.PHONY: logs-errors
logs-errors: ## Show only error logs
	$(COMPOSE) logs -f --tail=100 2>&1 | grep -iE "error|fatal|panic|exception"

.PHONY: logs-service
logs-service: ## Tail logs for specific service (usage: make logs-service SVC=guardian-ai)
	$(COMPOSE) logs -f --tail=100 $(SVC)

# ══════════════════════════════════════════════════════════════
# TESTING
# ══════════════════════════════════════════════════════════════

.PHONY: test
test: ## Run tests across all services
	@echo -e "$(CYAN)Running ecosystem-wide tests...$(NC)"
	@bash scripts/run-tests.sh

.PHONY: test-integration
test-integration: ## Run integration tests
	@echo -e "$(CYAN)Running integration tests...$(NC)"
	@bash scripts/integration-tests.sh

.PHONY: test-health
test-health: health ## Alias for health check

# ══════════════════════════════════════════════════════════════
# DEPLOYMENT
# ══════════════════════════════════════════════════════════════

.PHONY: deploy-prod
deploy-prod: ## Full production deployment
	@echo -e "$(CYAN)═══════════════════════════════════════════$(NC)"
	@echo -e "$(CYAN)  TRANCENDOS PRODUCTION DEPLOYMENT$(NC)"
	@echo -e "$(CYAN)═══════════════════════════════════════════$(NC)"
	@bash scripts/deploy-ecosystem.sh production

.PHONY: deploy-staging
deploy-staging: ## Deploy to staging environment
	@bash scripts/deploy-ecosystem.sh staging

.PHONY: rollback
rollback: ## Rollback to previous deployment
	@bash scripts/rollback.sh

# ══════════════════════════════════════════════════════════════
# SECURITY & AUDIT
# ══════════════════════════════════════════════════════════════

.PHONY: security-audit
security-audit: ## Run security audit across ecosystem
	@echo -e "$(CYAN)Running ecosystem security audit...$(NC)"
	@bash scripts/security-audit.sh

.PHONY: env-validate
env-validate: ## Validate all environment configurations
	@bash scripts/validate-env.sh

# ══════════════════════════════════════════════════════════════
# CLEANUP
# ══════════════════════════════════════════════════════════════

.PHONY: clean
clean: ## Remove all containers, images, and volumes
	@echo -e "$(RED)Cleaning entire ecosystem...$(NC)"
	$(COMPOSE) down -v --rmi all --remove-orphans
	@echo -e "$(GREEN)✓ Ecosystem cleaned$(NC)"

.PHONY: prune
prune: ## Docker system prune (reclaim disk space)
	docker system prune -af --volumes

# ══════════════════════════════════════════════════════════════
# UTILITIES
# ══════════════════════════════════════════════════════════════

.PHONY: port-map
port-map: ## Display full port map
	@echo -e "$(CYAN)Trancendos Ecosystem Port Map:$(NC)"
	@echo "─────────────────────────────────────────────────"
	@echo "Wave 1 — Core Platform"
	@echo "  3000  infinity-portal"
	@echo "Wave 2 — AI Agents"
	@echo "  3010  guardian-ai        3011  cornelius-ai"
	@echo "  3012  dorris-ai          3013  norman-ai"
	@echo "  3014  the-dr-ai"
	@echo "Wave 3 — Infrastructure"
	@echo "  3020  the-agora          3021  the-citadel"
	@echo "  3022  the-hive           3023  the-library"
	@echo "  3024  the-nexus          3025  the-observatory"
	@echo "  3026  the-treasury       3027  the-workshop"
	@echo "  3028  arcadia"
	@echo "Wave 4 — Intelligence"
	@echo "  3030  serenity-ai        3031  oracle-ai"
	@echo "  3032  porter-family-ai   3033  prometheus-ai"
	@echo "  3034  queen-ai           3035  renik-ai"
	@echo "  3036  sentinel-ai        3037  solarscene-ai"
	@echo "Wave 5 — Marketplace"
	@echo "  3040  api-marketplace    3041  artifactory"
	@echo "Wave 6 — Studios"
	@echo "  3050  section7           3051  style-and-shoot"
	@echo "  3052  fabulousa          3053  tranceflow"
	@echo "  3054  tateking           3055  the-digitalgrid"
	@echo "─────────────────────────────────────────────────"

.PHONY: shell
shell: ## Open shell in a service (usage: make shell SVC=guardian-ai)
	$(COMPOSE) exec $(SVC) /bin/sh

.PHONY: help
help: ## Show this help
	@echo -e "$(CYAN)Trancendos Ecosystem — Production Commands$(NC)"
	@echo "════════════════════════════════════════════════════"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'