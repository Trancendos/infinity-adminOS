# Cloudflare Free-Tier Enablement Guide
## Trancendos Ecosystem - $0 Cost Infrastructure

**Last Updated:** March 2026  
**Status:** Ready for Implementation  
**Total Annual Cost:** $0

---

## Executive Summary

This guide documents all Cloudflare free-tier services that can be enabled for the Trancendos ecosystem at zero cost. The existing deployment workflow already provisions most resources, but additional free features can be activated for enhanced security, performance, and observability.

---

## 1. Core Platform Services (Workers & Pages)

### 1.1 Cloudflare Workers ✅ ENABLED

| Feature | Free Limit | Current Usage | Status |
|---------|------------|---------------|--------|
| Requests | 100,000/day | ~37 workers | ✅ Active |
| CPU Time | 10ms per request | Within limits | ✅ Active |
| Scripts | Unlimited | 37 configured | ✅ Active |

**Workers Already Configured:**
- Platform Core: `infinity-one`, `lighthouse`, `hive`, `void`
- API Layer: `auth-api`, `ai-api`, `files-api`, `ws-api`
- Specialized: `monitoring-dashboard`, `pqc-service`, `orchestrator`

### 1.2 Cloudflare Pages ✅ ENABLED

| Feature | Free Limit | Current Usage | Status |
|---------|------------|---------------|--------|
| Deployments | Unlimited | Auto-deploy | ✅ Active |
| Bandwidth | Unlimited | Static assets | ✅ Active |
| Concurrent builds | 1 at a time | Acceptable | ✅ Active |

**Pages Project:** `infinity-portal`

---

## 2. Data Services

### 2.1 Cloudflare D1 (SQL Database) ✅ ENABLED

| Feature | Free Limit | Notes |
|---------|------------|-------|
| Storage | 5 GB | Per account |
| Rows Read | 5 million/month | Per account |
| Rows Written | 100,000/month | Per account |
| Databases | 10 | Per account |

**Database Name:** `infinity-os-db`  
**Binding:** `DB` (shared across workers)

**Configuration in wrangler.toml:**
```toml
[[d1_databases]]
binding = "DB"
database_name = "infinity-os-db"
database_id = "PLACEHOLDER_D1_DATABASE_ID"
```

### 2.2 Cloudflare KV (Key-Value Storage) ✅ ENABLED

| Feature | Free Limit | Notes |
|---------|------------|-------|
| Storage | 1 GB | Per namespace |
| Reads | 100,000/day | Per namespace |
| Writes | 1,000/day | Per namespace |
| Namespaces | Unlimited | Per account |

**KV Namespaces Already Configured:**
- `KV_SESSIONS` - User sessions (infinity-one)
- `KV_TOKEN_CACHE` - Token caching (lighthouse)
- `KV_SECRETS_CACHE` - Secrets vault (void)
- `KV_CACHE` - General cache (hive)
- `KV_RATE_LIMIT` - Rate limiting (multiple)
- `KV_METRICS` - Monitoring metrics
- `KV_ALERTS` - Alert storage

### 2.3 Cloudflare R2 (Object Storage) ✅ ENABLED

| Feature | Free Limit | Notes |
|---------|------------|-------|
| Storage | 10 GB | Per account |
| Class A Operations | 1 million/month | Writes, lists |
| Class B Operations | 10 million/month | Reads |

**R2 Buckets Already Configured:**
- `infinity-void-secrets` - Encrypted secrets storage
- Additional buckets can be created for file uploads

### 2.4 Cloudflare Queues ⚡ TO BE ENABLED

| Feature | Free Limit | Notes |
|---------|------------|-------|
| Messages | 10,000/month | Per account |
| Operations | 400,000/month | Per account |

**Recommended Queues:**
- `task-queue` - Background task processing
- `event-queue` - Event-driven messaging
- `notification-queue` - User notifications

---

## 3. Zero Trust Security (FREE for 50 Users)

### 3.1 Cloudflare Access ✅ CAN BE ENABLED

**Free Tier Includes:**
- Up to 50 users at no cost
- Application protection (inbound access control)
- Identity provider integration (GitHub, Google, etc.)
- One-time PIN authentication
- Session management

**Implementation:**
1. Navigate to Cloudflare Zero Trust dashboard
2. Create Access Application for each worker
3. Configure identity providers
4. Set up access policies

### 3.2 Cloudflare Gateway ✅ CAN BE ENABLED

**Free Tier Includes:**
- DNS filtering for multiple locations
- Security categories (malware, phishing)
- 24-hour log retention
- Basic analytics

### 3.3 Cloudflare Tunnel ✅ CAN BE ENABLED

**Free Tier Includes:**
- Unlimited tunnels
- No ingress infrastructure needed
- Outbound-only connections
- Support for HTTP, SSH, RDP

**Use Case:** Secure backend connections without public IPs

---

## 4. Security Features

### 4.1 WAF (Web Application Firewall) ⚡ TO BE CONFIGURED

**Free Managed Rules:**
- Cloudflare Specials ruleset
- Basic OWASP protection
- Automatic rule updates

**Recommended WAF Rules:**
```yaml
# Enable free managed rules
- Rule: Cloudflare Specials
  Action: Block
  Status: Enable

# SQL Injection protection
- Rule: SQLi
  Action: Challenge
  Status: Enable

# XSS protection
- Rule: XSS
  Action: Challenge
  Status: Enable
```

### 4.2 DDoS Protection ✅ AUTOMATIC

**Free Tier Includes:**
- Unmetered DDoS protection
- Layer 3/4 protection
- Layer 7 protection
- Automatic mitigation

### 4.3 SSL/TLS ✅ AUTOMATIC

**Free Tier Includes:**
- Universal SSL certificates
- Automatic certificate renewal
- TLS 1.3 support
- HTTP/3 (QUIC) support

---

## 5. Performance Features

### 5.1 CDN ✅ AUTOMATIC

**Free Tier Includes:**
- Global anycast network
- Automatic caching
- Image optimization (Polish)
- Auto Minify (HTML, CSS, JS)
- Rocket Loader (async JS)

### 5.2 Argo (PAID - NOT INCLUDED)

> ⚠️ Argo Smart Routing is a paid feature. Not included in free tier.

### 5.3 DNS ✅ AUTOMATIC

**Free Tier Includes:**
- Fast DNS resolution
- DNSSEC support
- CNAME flattening
- Proxy records (orange cloud)

---

## 6. Analytics & Observability

### 6.1 Web Analytics ✅ CAN BE ENABLED

**Free Tier Includes:**
- Core Web Vitals
- Real user monitoring
- No server-side tracking
- Privacy-friendly analytics

### 6.2 Workers Analytics ✅ AUTOMATIC

**Free Tier Includes:**
- Request counts
- Error rates
- CPU time metrics
- Duration percentiles

### 6.3 Logs ⚡ CAN BE ENABLED (Limited)

**Free Tier Options:**
- Workers Logs: Available via `wrangler tail`
- Access Logs: 24-hour retention (Zero Trust Free)
- Gateway Logs: 24-hour retention (Zero Trust Free)

---

## 7. Workers AI ⚡ CAN BE ENABLED

| Feature | Free Limit | Notes |
|---------|------------|-------|
| Inferences | 10,000/day | Select models only |
| Models | Limited | Llama 2, etc. |

**Available Free Models:**
- Text generation (limited)
- Image classification
- Translation
- Speech recognition

---

## 8. Implementation Checklist

### Phase 1: Already Configured ✅
- [x] Workers deployment workflow
- [x] Pages deployment workflow
- [x] D1 database provisioning
- [x] KV namespace provisioning
- [x] R2 bucket creation
- [x] CI/CD pipeline

### Phase 2: Zero Trust Setup (Free)
- [ ] Enable Zero Trust in Cloudflare dashboard
- [ ] Configure identity providers (GitHub, Google)
- [ ] Create Access applications for workers
- [ ] Set up Gateway DNS filtering
- [ ] Configure Tunnel for backend services

### Phase 3: Security Hardening (Free)
- [ ] Enable WAF managed rules
- [ ] Configure custom WAF rules
- [ ] Enable Bot Fight Mode
- [ ] Enable Browser Integrity Check
- [ ] Configure Security Level

### Phase 4: Performance (Free)
- [ ] Enable Polish (image optimization)
- [ ] Enable Auto Minify
- [ ] Enable Rocket Loader
- [ ] Configure Cache Rules
- [ ] Enable Early Hints

### Phase 5: Analytics (Free)
- [ ] Enable Web Analytics
- [ ] Configure custom metrics
- [ ] Set up alerting
- [ ] Create dashboards

---

## 9. Configuration Files

### 9.1 WAF Rules Configuration

Create `.cloudflare/waf-rules.json`:
```json
{
  "rules": [
    {
      "id": "cloudflare-specials",
      "expression": "cf.client.bot",
      "action": "allow",
      "status": "enabled"
    },
    {
      "id": "block-sqli",
      "expression": "cf.waf.score.sqli < 20",
      "action": "block",
      "status": "enabled"
    },
    {
      "id": "challenge-xss",
      "expression": "cf.waf.score.xss < 20",
      "action": "challenge",
      "status": "enabled"
    }
  ]
}
```

### 9.2 Cache Rules Configuration

Create `.cloudflare/cache-rules.json`:
```json
{
  "rules": [
    {
      "name": "Cache Static Assets",
      "expression": "ends_with(http.request.uri.path, \".js\") or ends_with(http.request.uri.path, \".css\")",
      "action": "cache",
      "ttl": 31536000
    },
    {
      "name": "Cache Images",
      "expression": "ends_with(http.request.uri.path, \".png\") or ends_with(http.request.uri.path, \".jpg\") or ends_with(http.request.uri.path, \".webp\")",
      "action": "cache",
      "ttl": 2592000
    },
    {
      "name": "Bypass API Cache",
      "expression": "starts_with(http.request.uri.path, \"/api/\")",
      "action": "bypass"
    }
  ]
}
```

### 9.3 Zero Trust Access Policy

Create `.cloudflare/access-policies.json`:
```json
{
  "applications": [
    {
      "name": "infinity-portal-admin",
      "domain": "admin.transcendos.com",
      "policy": {
        "name": "Admin Access",
        "include": [
          {"email_domain": {"domain": "transcendos.com"}}
        ],
        "require": [
          {"mfa": {}}
        ]
      }
    },
    {
      "name": "infinity-portal-api",
      "domain": "api.transcendos.com",
      "policy": {
        "name": "API Access",
        "include": [
          {"group": {"name": "developers"}}
        ]
      }
    }
  ]
}
```

---

## 10. Estimated Monthly Usage vs Limits

| Service | Free Limit | Est. Usage | Headroom |
|---------|------------|------------|----------|
| Workers Requests | 100K/day | ~10K/day | 90% |
| D1 Storage | 5 GB | ~500 MB | 90% |
| D1 Reads | 5M/month | ~500K/month | 90% |
| D1 Writes | 100K/month | ~50K/month | 50% |
| KV Storage | 1 GB | ~200 MB | 80% |
| KV Reads | 100K/day | ~20K/day | 80% |
| KV Writes | 1K/day | ~200/day | 80% |
| R2 Storage | 10 GB | ~1 GB | 90% |
| R2 Operations | 1M/month | ~100K/month | 90% |
| Queue Messages | 10K/month | ~1K/month | 90% |
| Workers AI | 10K/day | ~100/day | 99% |
| Zero Trust Users | 50 | ~5 | 90% |

---

## 11. Next Steps

1. **Merge PR #2127** - Deploy current configuration
2. **Enable Zero Trust** - Configure Access and Gateway
3. **Enable WAF Rules** - Activate managed rulesets
4. **Configure Analytics** - Set up Web Analytics
5. **Test Deployment** - Verify all services working

---

## 12. Cost Summary

| Service | Monthly Cost | Annual Cost |
|---------|--------------|-------------|
| Workers | $0 | $0 |
| Pages | $0 | $0 |
| D1 Database | $0 | $0 |
| KV Namespaces | $0 | $0 |
| R2 Storage | $0 | $0 |
| Queues | $0 | $0 |
| Zero Trust (50 users) | $0 | $0 |
| WAF | $0 | $0 |
| DDoS Protection | $0 | $0 |
| SSL/TLS | $0 | $0 |
| CDN | $0 | $0 |
| DNS | $0 | $0 |
| Analytics | $0 | $0 |
| **TOTAL** | **$0** | **$0** |

---

**Document Maintainer:** Trancendos DevOps Team  
**Last Review:** March 2026  
**Next Review:** June 2026