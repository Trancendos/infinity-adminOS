# Trancendos Platform Documentation Index
## Comprehensive Documentation Guide

---

## 1. Architecture & Planning Documents

### Core Documentation

| Document | Description | Status |
|----------|-------------|--------|
| [DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md) | Domain structure, DNS configuration, and Cloudflare deployment strategy | Complete |
| [MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md) | Step-by-step migration checklist for repository consolidation | Complete |
| [MICROSERVICE_ARCHITECTURE.md](MICROSERVICE_ARCHITECTURE.md) | API contracts, data models, and integration patterns | Complete |
| [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) | Security analysis, improvements, and future horizon | Complete |

### Configuration Files

| File | Description | Location |
|------|-------------|----------|
| wrangler.production.toml | Production Cloudflare Worker configurations | infinity-adminOS/ |
| deploy-production.sh | Automated deployment script | infinity-adminOS/scripts/ |
| renovate.json | Dependency automation configuration | Root |

---

## 2. Platform Core Services

### Infinity-One (Authentication)
- **Purpose**: Central authentication and identity hub
- **URL**: https://auth.transcendos.com (production)
- **Documentation**: See MICROSERVICE_ARCHITECTURE.md Section 2.1

**Key Features**:
- IAM (Identity & Access Management)
- OAuth 2.1 / OIDC
- WebAuthn / Passkeys
- MFA (TOTP, WebAuthn, SMS, Email)
- SCIM 2.0
- W3C DID Support

### Lighthouse (Token Management)
- **Purpose**: Cryptographic token issuance and management
- **URL**: https://tokens.transcendos.com (production)
- **Documentation**: See MICROSERVICE_ARCHITECTURE.md Section 2.2

**Key Features**:
- Universal Entity Tokens (UET)
- JWT/JWKS management
- Token templates
- Post-quantum signing algorithms

### HIVE (Data Router)
- **Purpose**: Intelligent data routing and orchestration
- **URL**: https://router.transcendos.com (production)
- **Documentation**: See MICROSERVICE_ARCHITECTURE.md Section 2.3

**Key Features**:
- Bio-inspired swarm intelligence
- Pipeline orchestration
- Flow control
- Event-driven routing

### Void (Secret Storage)
- **Purpose**: Zero-knowledge secret management
- **URL**: https://secrets.transcendos.com (production)
- **Documentation**: See MICROSERVICE_ARCHITECTURE.md Section 2.4

**Key Features**:
- Zero-knowledge encryption
- Shamir's Secret Sharing
- Access policies
- Audit logging

---

## 3. Service Layer

| Service | URL | Purpose |
|---------|-----|---------|
| API Gateway | api.transcendos.com | Central API routing |
| AI API | ai.transcendos.com | AI orchestration |
| PQC Service | pqc.transcendos.com | Post-quantum cryptography |
| Registry | registry.transcendos.com | Service registry |
| Dispatch | dispatch.transcendos.com | Event dispatch |

---

## 4. Specialized Services

| Service | URL | Purpose |
|---------|-----|---------|
| Oracle Foresight | oracle.transcendos.com | Predictive analytics |
| Dimensional Fabric | fabric.transcendos.com | Multi-dimensional data |
| Universal UPIF | upif.transcendos.com | Universal protocol interface |
| L402 Gateway | l402.transcendos.com | Lightning Network gateway |
| DePIN Broker | depin.transcendos.com | DePIN integration |
| Arcadian Exchange | market.transcendos.com | Digital asset exchange |
| Knowledge Graph | graph.transcendos.com | Knowledge management |
| Sentinel Station | sentinel.transcendos.com | Security monitoring |

---

## 5. Deployment Guide

### Prerequisites
1. Cloudflare account with Workers enabled
2. Domain configured in Cloudflare (transcendos.com)
3. Wrangler CLI installed (`npm install -g wrangler`)
4. Authenticated with `wrangler login`

### Quick Deploy

```bash
# Clone the repository
git clone https://github.com/Trancendos/infinity-adminOS.git
cd infinity-adminOS

# Make the deployment script executable
chmod +x scripts/deploy-production.sh

# Deploy everything
./scripts/deploy-production.sh all

# Or deploy in phases
./scripts/deploy-production.sh resources  # Create D1, KV, R2
./scripts/deploy-production.sh core       # Deploy Platform Core
./scripts/deploy-production.sh services   # Deploy Service Layer
./scripts/deploy-production.sh domains    # Configure domains
```

### Manual Deployment

```bash
# Create D1 database
wrangler d1 create infinity-os-db

# Create KV namespace
wrangler kv:namespace create KV_SESSIONS

# Deploy individual worker
cd workers/infinity-one
wrangler deploy --env production

# Add custom domain
wrangler domains add infinity-one auth.transcendos.com
```

---

## 6. Security Configuration

### WAF Rules
See [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) Section 3 for complete WAF rule configurations.

### Rate Limiting
- Anonymous: 60 requests/minute
- Authenticated: 300 requests/minute
- Service: 1000 requests/minute

### Post-Quantum Cryptography
- Primary KEM: ML-KEM-768
- Primary Signature: ML-DSA-65
- Hybrid mode enabled

---

## 7. Monitoring & Observability

### Health Check Endpoints
All services expose `/health` endpoint returning:
```json
{
  "status": "healthy",
  "timestamp": "2025-03-24T12:00:00.000Z",
  "uptime": 12345,
  "version": "1.0.0"
}
```

### Logging
- Format: JSON structured logging
- Levels: DEBUG, INFO, WARN, ERROR, CRITICAL
- Destination: Cloudflare Logs + R2 Archive

### Metrics
- Request latency (p50, p95, p99)
- Error rate
- Throughput
- Active connections

---

## 8. Development

### Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run specific worker locally
cd workers/infinity-one
wrangler dev
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "infinity-one"

# Run e2e tests
npm run test:e2e
```

---

## 9. Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

## 10. Support

- **Documentation Issues**: Open a GitHub issue
- **Security Issues**: security@transcendos.com
- **General Questions**: support@transcendos.com

---

## 11. Document Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 2025 | Initial documentation set |

---

**Trancendos Platform Team**  
*Building the future of decentralized computing*