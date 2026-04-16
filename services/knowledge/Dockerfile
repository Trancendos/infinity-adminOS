# ═══════════════════════════════════════════════════════════════════════════
# INFINITY ECOSYSTEM — Service Dockerfile Template
# This template enforces STRICT ISOLATION between services.
# Each service must be independently deployable with NO shared code.
# ═══════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc --project tsconfig.json

RUN npm prune --production

# ── Stage 2: Production Runtime ───────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN addgroup -g 1001 -S infinity && \
    adduser -S service -u 1001 -G infinity

RUN apk add --no-cache tini curl ca-certificates && rm -rf /var/cache/apk/*

WORKDIR /app

COPY --from=builder /build/dist/ ./dist/
COPY --from=builder /build/node_modules/ ./node_modules/
COPY --from=builder /build/package.json ./

RUN mkdir -p /app/data /app/logs && chown -R service:infinity /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

USER service

EXPOSE ${PORT:-3000}

ENV NODE_ENV=production \
    SERVICE_SEGMENT=${SERVICE_SEGMENT:-unknown} \
    ISOLATION=strict

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "--enable-source-maps", "dist/index.js"]

LABEL org.opencontainers.image.title="infinity-ecosystem-service" \
      org.opencontainers.image.description="Infinity Ecosystem Nanoservice - Strict Isolation" \
      org.opencontainers.image.vendor="Trancendos" \
      org.opencontainers.image.licenses="MIT"