# Phase 27 — Full Cloudflare Stack (Backend + D1 Database)

## A. Cloudflare Worker Backend (Auth API)
- [ ] A1. Create workers/auth-api/ directory structure
- [ ] A2. Build auth endpoints: /register, /login, /logout, /refresh, /me
- [ ] A3. Build user management + RBAC endpoints
- [ ] A4. JWT token generation + validation (Web Crypto API)
- [ ] A5. Password hashing (PBKDF2 via Web Crypto)
- [ ] A6. Middleware: auth guard, CORS, rate limit, security headers

## B. Cloudflare D1 Database
- [ ] B1. Create D1 schema (users, sessions, organisations, audit_logs, rbac)
- [ ] B2. Create migration SQL files
- [ ] B3. Wire D1 binding into auth worker wrangler.toml

## C. Worker Configuration & Deployment
- [ ] C1. Create workers/auth-api/wrangler.toml with D1 + KV bindings
- [ ] C2. Create workers/auth-api/package.json + tsconfig
- [ ] C3. Update deploy-cloudflare.yml to deploy auth-api + create D1
- [ ] C4. Update frontend VITE_BACKEND_API_URL to point to auth worker

## D. Additional Workers
- [ ] D1. AI/inference worker (workers/ai-api/)
- [ ] D2. File storage worker (workers/files-api/) using R2
- [ ] D3. WebSocket/realtime worker (workers/ws-api/) using Durable Objects

## E. Ship & Verify
- [ ] E1. Commit + push all workers
- [ ] E2. Trigger full Cloudflare deploy
- [ ] E3. Verify register/login works end-to-end
- [ ] E4. PROJECT_PULSE_SESSION18.md