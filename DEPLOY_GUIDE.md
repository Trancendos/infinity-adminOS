# 🚀 Infinity Portal — Live Deployment Guide

> **Goal:** Get the full platform live with a working frontend, backend API, and database in under 30 minutes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USERS / BROWSER                       │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌───────▼────────────────┐
    │  Cloudflare Pages   │  │  API Gateway Worker    │
    │  (Static Frontend)  │  │  (Edge Proxy, optional)│
    │  infinity-portal    │  │  Rate limit + Cache    │
    │  .pages.dev         │  │  via KV                │
    └─────────────────────┘  └───────┬────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  Fly.io             │
                          │  FastAPI Backend    │
                          │  infinity-portal-   │
                          │  api.fly.dev        │
                          ├─────────────────────┤
                          │  PostgreSQL (Fly)   │
                          │  Auto-attached      │
                          └─────────────────────┘
```

---

## Quick Start (One Command)

If you have Fly.io and Cloudflare CLIs authenticated:

```bash
./scripts/deploy-live.sh
```

This will:
1. Create/deploy the backend on Fly.io with Postgres
2. Build and deploy the frontend to Cloudflare Pages
3. Deploy the API Gateway worker (if KV namespaces configured)
4. Print all live URLs

---

## Step-by-Step Guide

### Step 1: Install CLIs (2 minutes)

```bash
# Fly.io CLI
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"

# Cloudflare Wrangler CLI
npm install -g wrangler
```

### Step 2: Authenticate (2 minutes)

```bash
# Fly.io — opens browser for login
fly auth login

# Cloudflare — opens browser for login
wrangler login
```

### Step 3: Deploy Backend to Fly.io (10 minutes)

```bash
cd backend

# Create the app (first time only)
fly launch --config fly.toml --no-deploy --copy-config --yes

# Create and attach Postgres database
fly postgres create --name infinity-portal-db \
  --region lhr \
  --vm-size shared-cpu-1x \
  --initial-cluster-size 1 \
  --volume-size 1 \
  --yes

fly postgres attach infinity-portal-db --yes

# Set production secrets
fly secrets set \
  SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')" \
  JWT_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')" \
  CORS_ORIGINS="https://infinity-portal.pages.dev" \
  ENVIRONMENT="production" \
  --config fly.toml

# Deploy!
fly deploy --config fly.toml

# Verify
curl https://infinity-portal-api.fly.dev/health
```

**Expected output:**
```json
{
  "status": "healthy",
  "environment": "production",
  "total_routes": 946
}
```

### Step 4: Deploy Frontend to Cloudflare Pages (5 minutes)

```bash
cd apps/shell

# Build with production API URL
VITE_BACKEND_API_URL="https://infinity-portal-api.fly.dev" \
VITE_WS_URL="wss://infinity-portal-api.fly.dev/ws" \
VITE_APP_NAME="Infinity Portal" \
VITE_APP_VERSION="2.5.0" \
npx vite build

# Deploy to Cloudflare Pages
wrangler pages deploy dist --project-name=infinity-portal --branch=main
```

**Your frontend is now live at:** `https://infinity-portal.pages.dev`

### Step 5: Enable Auto-Deploy via GitHub Actions (3 minutes)

Add these secrets to your GitHub repository:

1. Go to **GitHub → Trancendos/infinity-portal → Settings → Secrets and variables → Actions**
2. Click **New repository secret** and add:

| Secret Name | How to Get It |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Custom Token → Permissions: Pages Edit, Workers Edit |
| `CLOUDFLARE_ACCOUNT_ID` | [Cloudflare Dashboard](https://dash.cloudflare.com) → any domain → Overview → right sidebar → Account ID |

Once added, every push to `main` will automatically:
1. Run all tests (875 backend + frontend build)
2. Pass the deploy gate
3. Deploy to Cloudflare Pages

### Step 6: Deploy API Gateway Worker (Optional, 5 minutes)

The API Gateway adds edge-level rate limiting, caching, and security headers.

```bash
# Create KV namespaces
wrangler kv:namespace create "RATE_LIMIT"
wrangler kv:namespace create "CACHE"

# Update workers/api-gateway/wrangler.toml with the returned IDs
# Replace "placeholder-rate-limit-id" and "placeholder-cache-id"

# Also update BACKEND_ORIGIN to your Fly.io URL
# BACKEND_ORIGIN = "https://infinity-portal-api.fly.dev"

# Deploy
cd workers/api-gateway
wrangler deploy --env production
```

---

## Environment Variables Reference

### Backend (Fly.io Secrets)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Auto-set by `fly postgres attach` |
| `SECRET_KEY` | ✅ | App encryption key (64+ chars) |
| `JWT_SECRET_KEY` | ✅ | JWT signing key (64+ chars) |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins |
| `ENVIRONMENT` | ✅ | `production` |
| `REDIS_URL` | ❌ | Optional: for caching/sessions |
| `SENTRY_DSN` | ❌ | Optional: error tracking |

### Frontend (Vite Build Args)

| Variable | Required | Description |
|---|---|---|
| `VITE_BACKEND_API_URL` | ✅ | Backend URL (e.g., `https://infinity-portal-api.fly.dev`) |
| `VITE_WS_URL` | ✅ | WebSocket URL (e.g., `wss://infinity-portal-api.fly.dev/ws`) |
| `VITE_APP_NAME` | ❌ | Display name (default: `Infinity Portal`) |
| `VITE_APP_VERSION` | ❌ | Version string |

---

## Custom Domain Setup

### Frontend (Cloudflare Pages)
1. Go to Cloudflare Dashboard → Pages → infinity-portal → Custom domains
2. Add your domain (e.g., `app.infinity-portal.com`)
3. Cloudflare handles SSL automatically

### Backend (Fly.io)
```bash
fly certs create api.infinity-portal.com --config backend/fly.toml
```
Then add a CNAME record: `api.infinity-portal.com → infinity-portal-api.fly.dev`

---

## Monitoring & Operations

### Check Status
```bash
# Quick status check
./scripts/deploy-live.sh --status

# Backend health
curl https://infinity-portal-api.fly.dev/health

# Backend logs
fly logs --config backend/fly.toml

# Backend metrics
fly status --config backend/fly.toml
```

### Scaling
```bash
# Scale backend (more memory/CPU)
fly scale vm shared-cpu-2x --memory 1024 --config backend/fly.toml

# Scale to multiple instances
fly scale count 2 --config backend/fly.toml

# Scale Postgres
fly postgres config update --max-connections 100
```

### Rolling Restart
```bash
fly deploy --config backend/fly.toml --strategy rolling
```

### Rollback
```bash
# List recent deployments
fly releases --config backend/fly.toml

# Rollback to previous version
fly deploy --image <previous-image-ref> --config backend/fly.toml
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Backend returns 502 | Check `fly logs` — likely a startup crash. Verify `DATABASE_URL` is set. |
| Frontend shows blank page | Check browser console. Likely `VITE_BACKEND_API_URL` is wrong. Rebuild and redeploy. |
| CORS errors | Ensure `CORS_ORIGINS` in Fly.io secrets includes your frontend URL. |
| Database connection refused | Run `fly postgres list` to verify DB is running. Try `fly postgres attach` again. |
| CI deploy fails | Verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set in GitHub Secrets. |
| E2E tests fail in CI | These are advisory (`continue-on-error`). They need a full stack to pass. |

---

## Cost Estimate

| Service | Free Tier | Paid |
|---|---|---|
| **Fly.io** (Backend) | 3 shared VMs, 256MB each | ~$5/mo for 1GB VM |
| **Fly.io** (Postgres) | 1GB storage, 256MB RAM | ~$7/mo for more |
| **Cloudflare Pages** | Unlimited sites, 500 builds/mo | Free for most use cases |
| **Cloudflare Workers** | 100K requests/day | $5/mo for 10M requests |
| **Total** | **$0/mo** (within free tiers) | **~$12-17/mo** |

---

## File Reference

| File | Purpose |
|---|---|
| `backend/fly.toml` | Fly.io backend configuration |
| `backend/Dockerfile` | Multi-stage backend build (dev/prod) |
| `docker/Dockerfile.frontend` | Multi-stage frontend build (dev/prod) |
| `docker-compose.yml` | Local dev/prod Docker stack |
| `workers/api-gateway/` | Cloudflare edge proxy worker |
| `.github/workflows/ci.yml` | CI pipeline (test → build → deploy) |
| `.github/workflows/deploy-cloudflare.yml` | Cloudflare deploy workflow |
| `scripts/deploy-live.sh` | One-command live deployment |
| `scripts/start-dev.sh` | Local dev environment launcher |
| `scripts/start-prod.sh` | Local production launcher |
| `scripts/setup-cloudflare.sh` | Cloudflare setup guide |
| `.env.production.example` | All production env vars documented |