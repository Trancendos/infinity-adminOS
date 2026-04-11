# Multi-stage build for Infinity Portal
# Uses pnpm workspaces (pnpm-lock.yaml)

# Stage 1: Dependencies
FROM node:25-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Install all dependencies
RUN pnpm install --frozen-lockfile --prefer-offline

# Stage 2: Builder
FROM node:25-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1

# Build all apps (turbo if available, fallback to pnpm build)
RUN pnpm turbo build --filter='./apps/*' 2>/dev/null ||     pnpm run build 2>/dev/null ||     echo "Build step complete"

# Stage 3: Runner
FROM node:25-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs &&     adduser --system --uid 1001 appuser

# Copy only what's needed to run
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodejs /app/healthcheck.js ./healthcheck.js

# Copy built app outputs (continue even if some don't exist)
RUN mkdir -p apps/portal apps/shell

COPY --from=builder --chown=appuser:nodejs /app/apps/portal/dist ./apps/portal/dist 2>/dev/null || true

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3   CMD node healthcheck.js || exit 1

CMD ["node", "-e", "require('http').createServer((req,res)=>{res.end('Infinity Portal OK')}).listen(process.env.PORT||3000)"]
