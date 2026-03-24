# ==============================================================================
# Dockerfile — LexFlow Trust Service (Fastify 4)
#
# Multi-stage build:
#   1. deps    — install node_modules
#   2. builder — compile TypeScript
#   3. runner  — production image (minimal)
#
# OWNER: Architect Agent (GOV-008 §3.4)
# REF: SPR-002-ARCH D-002
# ==============================================================================

# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx tsc

# --- Stage 3: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user and install curl for health checks
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify && \
    apk add --no-cache curl

# Copy production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

USER fastify

EXPOSE 4000

ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:4000/health || exit 1

CMD ["node", "dist/index.js"]
