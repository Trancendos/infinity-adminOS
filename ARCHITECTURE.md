# Infinity Ecosystem — Nanoservice Architecture

## Overview

The Infinity Ecosystem follows a **strictly isolated nanoservice mesh** architecture where 48 independent services communicate exclusively through well-defined APIs (REST/WebSocket). No shared code exists between services—each is fully self-contained and independently deployable.

## Directory Structure

```
infinity-ecosystem/
├── packages/          # Core platform packages (35 services)
│   ├── nexus-gateway/    # API Gateway
│   ├── infinity-iam/    # Identity & Access Management
│   └── ... (33 more)
├── services/         # Business domain services (6 services)
│   ├── artifactory/
│   ├── creative/
│   ├── financial/
│   ├── knowledge/
│   ├── security/
│   └── wellbeing/
├── agents/           # AI Agents (4 services)
│   ├── cornelius-ai/
│   ├── guardian-ai/
│   ├── savania-wellbeing/
│   └── the-dr-ai/
├── workers/          # Cloudflare Workers (35 services)
├── apps/             # Frontend applications
├── services/contracts/  # Service registry and API contracts
└── infrastructure/  # Docker, K8s configs
```

## Isolation Principles

### 1. Strict Namespace Boundaries

- **packages/** — Only gateway, IAM, and core platform code
  - Namespace prefix: `@infinity-os/*`
- **services/** — Business domain services
  - Namespace prefix: `@infinity-ecosystem/*`
- **agents/** — AI agent services
  - Namespace prefix: `@infinity-ecosystem/agent-*`

### 2. No Shared Code

Each service has:

- Own `package.json` with isolated dependencies
- Own `tsconfig.json` with strict path mappings
- Own `Dockerfile` for containerization
- Own `src/` directory—no cross-imports

### 3. API-Only Communication

Services communicate ONLY via:

- **REST API** — HTTP/HTTPS endpoints
- **WebSocket** — Real-time bidirectional
- **Message Queues** — Async processing

No direct TypeScript imports between services.

## Service Configuration

### Package.json Structure

```json
{
  "name": "@infinity-ecosystem/creative",
  "segment": "services/creative",
  "isolation": "strict",
  "meshTopology": "isolated",
  "scripts": {
    "dev": "...",
    "build": "...",
    "docker:build": "...",
    "docker:run": "..."
  }
}
```

### TypeScript Configuration

Each service has isolated `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@infinity-ecosystem/creative": ["./src/index.ts"]
    }
  },
  "exclude": ["node_modules", "dist", "**/../**"]
}
```

### Dockerfile Template

All services follow the same Dockerfile pattern:

- Multi-stage build (builder + runtime)
- Non-root user execution
- Health checks
- Environment-based configuration
- Strict isolation labels

## Service Registry

All services are registered in `services/contracts/service-registry.json`:

```json
{
  "segments": {
    "services": {
      "services": [
        {
          "name": "creative",
          "namespace": "@infinity-ecosystem/creative",
          "port": 3051,
          "segment": "services/creative",
          "isolation": "strict"
        }
      ]
    }
  }
}
```

## Build System

Turbo is configured for **independent builds** (no `^build` dependencies):

```json
{
  "tasks": {
    "build": {
      "dependsOn": [],
      "inputs": ["$TURBO_ROOT/**", "services/$SERVICE_NAME/**"]
    }
  }
}
```

Each service builds independently—no cross-service dependencies.

## Docker Compose

Services run in isolated containers with no shared volumes:

```yaml
services:
  creative:
    build: services/creative
    ports:
      - "3051:3051"
    networks:
      - infinity-mesh
    isolation: strict

  financial:
    build: services/financial
    ports:
      - "3052:3052"
    networks:
      - infinity-mesh
    isolation: strict
```

## Nexus Gateway

The Nexus Gateway (`packages/nexus-gateway`) orchestrates all services:

- Routes requests to appropriate services
- Provides service discovery
- Handles authentication via Infinity IAM
- Enforces rate limiting and caching

## Port Allocation

| Segment            | Range     | Services      |
| ------------------ | --------- | ------------- |
| packages           | 3000-3999 | Platform core |
| services/creative  | 3051      | Creative      |
| services/financial | 3052      | Financial     |
| services/knowledge | 3053      | Knowledge     |
| services/security  | 3054      | Security      |
| services/wellbeing | 3055      | Wellbeing     |
| agents             | 3061-3999 | AI Agents     |

## Development Workflow

```bash
# Build single service
cd services/creative && pnpm build

# Run single service
cd services/creative && pnpm docker:run

# Build all services
pnpm build

# Run ecosystem
docker compose up
```

## Enforcement

1. **TypeScript** — Path mapping enforces isolation
2. **Turbo** — No cross-service build dependencies
3. **Docker** — Isolated containers, no shared volumes
4. **Registry** — Service registry validates boundaries
