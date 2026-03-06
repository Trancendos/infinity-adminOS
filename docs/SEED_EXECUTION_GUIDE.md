# 🌱 Trancendos IAM Seed Execution Guide
## TRN-IAM-003a — Production Database Seeding

> **Version:** 1.0.0 | **Last Updated:** 2025 | **Ticket:** TRN-IAM-003a
> **Author:** Trancendos CI | **Revert Commit:** 06afe6d

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Pre-Seed Checklist](#pre-seed-checklist)
4. [Dry Run (Preview)](#dry-run-preview)
5. [Production Seed Execution](#production-seed-execution)
6. [Post-Seed Verification](#post-seed-verification)
7. [Rollback Procedure](#rollback-procedure)
8. [Troubleshooting](#troubleshooting)
9. [What Gets Seeded](#what-gets-seeded)

---

## Prerequisites

### Required Software
```bash
# Python 3.11+
python3 --version  # Must be 3.11 or higher

# pip packages
pip install asyncpg python-dotenv
```

### Required Access
- **Neon Database URL** — PostgreSQL connection string with write access
- **IAM_JWT_SECRET** — The HS512 signing secret (minimum 64 characters)
- **Continuity Guardian credentials** — Email for the Level 0 bootstrap account

### Required Database State
The following tables MUST exist before seeding (created by TRN-IAM-001 migration):
- `iam_roles`
- `iam_permissions`
- `iam_role_permissions`
- `subscription_tiers`
- `platform_services`
- `app_namespaces`
- `platform_config`
- `users` (for Continuity Guardian bootstrap)

---

## Environment Setup

### Step 1: Create `.env` file
```bash
cd backend/
cp ../.env.example .env
```

### Step 2: Configure environment variables
```env
# === REQUIRED ===
NEON_DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/trancendos?sslmode=require
IAM_JWT_SECRET=your-64-char-minimum-hs512-secret-key-here-change-this-in-production

# === CONTINUITY GUARDIAN ===
CG_EMAIL=drew@trancendos.com
CG_DISPLAY_NAME=Drew Porter

# === OPTIONAL ===
LOG_LEVEL=INFO
SEED_BATCH_SIZE=50
```

### Step 3: Generate IAM_JWT_SECRET (if not already set)
```bash
# Generate a cryptographically secure 128-character secret
python3 -c "import secrets; print(secrets.token_hex(64))"

# Or using OpenSSL
openssl rand -hex 64
```

> ⚠️ **CRITICAL:** This secret MUST be identical across ALL 23 services. Store it securely in your secrets manager.

---

## Pre-Seed Checklist

Run through this checklist before executing the seed:

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | Python version | `python3 --version` | 3.11+ |
| 2 | asyncpg installed | `python3 -c "import asyncpg"` | No error |
| 3 | .env file exists | `ls -la backend/.env` | File exists |
| 4 | DB connection works | `python3 -c "import asyncpg, asyncio; asyncio.run(asyncpg.connect('YOUR_URL'))"` | No error |
| 5 | Tables exist | Check via psql or Neon console | All 8 tables present |
| 6 | No existing seed data | `SELECT COUNT(*) FROM iam_roles;` | 0 (first run) |
| 7 | Backup taken | See [Rollback Procedure](#rollback-procedure) | Backup file saved |

---

## Dry Run (Preview)

**Always run a dry run first** to verify what will be seeded:

```bash
cd backend/
python3 seed_iam.py --dry-run
```

### Expected Dry Run Output
```
[DRY RUN] Would seed 18 roles:
  - continuity_guardian (Level 0)
  - lead_architect (Level 1)
  - platform_admin (Level 1)
  - security_officer (Level 2)
  - agent_supervisor (Level 2)
  - ...

[DRY RUN] Would seed 200+ permissions across namespaces:
  - guardian: 17 permissions
  - cornelius: 12 permissions
  - infinity: 15 permissions
  - ...

[DRY RUN] Would seed 5 subscription tiers:
  - Free ($0/mo, 3 agents, 100 API calls/day)
  - Starter ($9.99/mo, 10 agents, 1000 API calls/day)
  - Professional ($29.99/mo, 50 agents, 10000 API calls/day)
  - Enterprise ($99.99/mo, unlimited agents, 100000 API calls/day)
  - Sovereign ($499.99/mo, unlimited everything)

[DRY RUN] Would seed 22+ platform services
[DRY RUN] Would seed 15+ platform config entries
[DRY RUN] Would bootstrap Continuity Guardian account

No changes written to database.
```

---

## Production Seed Execution

### Step 1: Take a database backup
```bash
# Using pg_dump (recommended)
pg_dump "$NEON_DATABASE_URL" > backup_pre_seed_$(date +%Y%m%d_%H%M%S).sql

# Or using Neon console: Dashboard → Branches → Create Branch (point-in-time backup)
```

### Step 2: Execute the seed
```bash
cd backend/
python3 seed_iam.py
```

### Expected Output
```
============================================================
Trancendos IAM Seed — Production Execution
============================================================
[1/8] Seeding roles...                    ✅ 18 roles created
[2/8] Seeding permissions...              ✅ 207 permissions created
[3/8] Seeding role-permission mappings...  ✅ 1,200+ mappings created
[4/8] Seeding subscription tiers...       ✅ 5 tiers created
[5/8] Seeding platform services...        ✅ 23 services registered
[6/8] Seeding app namespaces...           ✅ 12 namespaces created
[7/8] Seeding platform config...          ✅ 17 config entries created
[8/8] Bootstrapping Continuity Guardian... ✅ CG account created (Level 0)
============================================================
Seed completed successfully in 4.2s
============================================================
```

### Step 3: Verify (see next section)

---

## Post-Seed Verification

Run these queries to verify the seed was successful:

### Quick Verification
```sql
-- Role count (expect 18)
SELECT COUNT(*) as role_count FROM iam_roles;

-- Permission count (expect 200+)
SELECT COUNT(*) as perm_count FROM iam_permissions;

-- Role-permission mapping count (expect 1200+)
SELECT COUNT(*) as mapping_count FROM iam_role_permissions;

-- Subscription tier count (expect 5)
SELECT COUNT(*) as tier_count FROM subscription_tiers;

-- Platform service count (expect 22+)
SELECT COUNT(*) as service_count FROM platform_services;

-- Continuity Guardian exists
SELECT id, email, display_name FROM users WHERE email = 'drew@trancendos.com';
```

### Detailed Verification
```sql
-- Verify role hierarchy
SELECT name, level, description FROM iam_roles ORDER BY level ASC;

-- Verify all namespaces have permissions
SELECT 
  SPLIT_PART(code, ':', 1) as namespace,
  COUNT(*) as permission_count
FROM iam_permissions
GROUP BY namespace
ORDER BY permission_count DESC;

-- Verify CG has all permissions
SELECT COUNT(*) as cg_permissions
FROM iam_role_permissions rp
JOIN iam_roles r ON r.id = rp.role_id
WHERE r.name = 'continuity_guardian';

-- Verify subscription tiers
SELECT name, price_monthly, max_agents, api_calls_per_day
FROM subscription_tiers
ORDER BY price_monthly ASC;

-- Verify platform services with mesh routing
SELECT name, mesh_address, routing_protocol, health_endpoint
FROM platform_services
ORDER BY name;
```

---

## Rollback Procedure

### Option A: Restore from pg_dump backup
```bash
# Drop and recreate (DESTRUCTIVE — only for seed data)
psql "$NEON_DATABASE_URL" -c "
  TRUNCATE iam_role_permissions CASCADE;
  TRUNCATE iam_permissions CASCADE;
  TRUNCATE iam_roles CASCADE;
  TRUNCATE subscription_tiers CASCADE;
  TRUNCATE platform_services CASCADE;
  TRUNCATE app_namespaces CASCADE;
  TRUNCATE platform_config CASCADE;
"

# Restore from backup
psql "$NEON_DATABASE_URL" < backup_pre_seed_YYYYMMDD_HHMMSS.sql
```

### Option B: Neon Branch Restore
1. Go to Neon Dashboard → Your Project → Branches
2. Find the branch created before seeding
3. Click "Restore" to roll back to that point in time

### Option C: Re-run seed (idempotent)
The seed script uses `ON CONFLICT DO NOTHING` for most operations, making it safe to re-run:
```bash
python3 seed_iam.py  # Safe to run multiple times
```

---

## Troubleshooting

### Connection Refused
```
Error: connection refused to ep-xxx.region.aws.neon.tech
```
**Fix:** Check that your Neon database is active (not suspended). Visit the Neon console to wake it up.

### Table Does Not Exist
```
Error: relation "iam_roles" does not exist
```
**Fix:** Run the TRN-IAM-001 migration first:
```bash
cd backend/
alembic upgrade head
```

### Permission Denied
```
Error: permission denied for table iam_roles
```
**Fix:** Ensure your database URL uses a role with INSERT privileges. The Neon default role should have full access.

### Duplicate Key Violation
```
Error: duplicate key value violates unique constraint
```
**Fix:** This is expected on re-runs. The seed uses `ON CONFLICT DO NOTHING`. If you need a clean re-seed, truncate tables first (see Rollback Option A).

### asyncpg Not Found
```
ModuleNotFoundError: No module named 'asyncpg'
```
**Fix:**
```bash
pip install asyncpg
```

---

## What Gets Seeded

### 18 System Roles (7-Tier Hierarchy)

| Level | Role | Description |
|-------|------|-------------|
| 0 | `continuity_guardian` | Sovereign system owner — full access to everything |
| 1 | `lead_architect` | Technical architecture authority |
| 1 | `platform_admin` | Platform administration and configuration |
| 2 | `security_officer` | Security policy and audit management |
| 2 | `agent_supervisor` | AI agent oversight and management |
| 2 | `financial_controller` | Financial operations and treasury |
| 3 | `senior_developer` | Senior development and deployment |
| 3 | `data_analyst` | Data analysis and reporting |
| 3 | `content_manager` | Content creation and moderation |
| 3 | `community_manager` | Community engagement and moderation |
| 4 | `developer` | Standard development access |
| 4 | `support_agent` | User support and ticket management |
| 4 | `moderator` | Content and community moderation |
| 5 | `member` | Standard authenticated user |
| 5 | `subscriber` | Paid subscription user |
| 5 | `guest` | Limited guest access |
| 6 | `external_ai` | External AI agent (NHI) |
| 6 | `api_consumer` | External API consumer (NHI) |

### 200+ Permissions (Triple-Format)

Permissions follow the `namespace:resource:action` format:

| Namespace | Example Permissions | Count |
|-----------|-------------------|-------|
| `guardian` | `guardian:agents:create`, `guardian:tokens:revoke` | 17 |
| `cornelius` | `cornelius:routes:manage`, `cornelius:mesh:configure` | 12 |
| `infinity` | `infinity:users:manage`, `infinity:config:write` | 15 |
| `dorris` | `dorris:budgets:approve`, `dorris:transactions:audit` | 10 |
| `norman` | `norman:threats:investigate`, `norman:cve:manage` | 10 |
| `the-dr` | `the-dr:healing:execute`, `the-dr:diagnostics:run` | 8 |
| `agora` | `agora:threads:moderate`, `agora:proposals:vote` | 8 |
| `citadel` | `citadel:firewall:manage`, `citadel:incidents:respond` | 8 |
| `hive` | `hive:swarm:orchestrate`, `hive:drones:manage` | 8 |
| `library` | `library:knowledge:write`, `library:search:query` | 8 |
| `nexus` | `nexus:integrations:manage`, `nexus:events:route` | 8 |
| ... | _(all 23 services covered)_ | 200+ |

### 5 Subscription Tiers

| Tier | Price/mo | Max Agents | API Calls/Day | Features |
|------|----------|------------|---------------|----------|
| Free | $0 | 3 | 100 | Basic access |
| Starter | $9.99 | 10 | 1,000 | Priority support |
| Professional | $29.99 | 50 | 10,000 | Advanced analytics |
| Enterprise | $99.99 | Unlimited | 100,000 | Custom integrations |
| Sovereign | $499.99 | Unlimited | Unlimited | Full platform access |

### 22+ Platform Services

All services registered with mesh routing configuration:
- Mesh address (Docker DNS or static port)
- Routing protocol (static_port → sovereign_mesh migration path)
- Health endpoint URL
- Service authentication method

### Continuity Guardian Bootstrap

The seed creates the initial Continuity Guardian (Level 0) account:
- Assigned ALL permissions across ALL namespaces
- Sovereign subscription tier
- Cannot be deleted or demoted
- Serves as the system bootstrap account

---

## Security Notes

1. **Never commit `.env` files** — They contain database credentials and JWT secrets
2. **Rotate IAM_JWT_SECRET** periodically — All services must be updated simultaneously
3. **Audit the seed output** — Verify no unexpected data was created
4. **Use Neon branching** — Create a branch before seeding for instant rollback
5. **The CG account is sacred** — It's the only account that can manage Level 0/1 roles

---

*This guide is part of the Trancendos Ecosystem Production Readiness documentation.*
*For questions, contact the Lead Architect or Continuity Guardian.*