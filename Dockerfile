# Multi-stage Dockerfile for Invest254 backend (engine + API)
# This runs on Fly.io and serves both the WebSocket game engine and REST API

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo files
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./

# Copy workspace packages
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/engine ./apps/engine
COPY apps/api ./apps/api

# Install dependencies
RUN npm ci

# Build TypeScript
RUN npm run typecheck

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy source code (needed for tsx to run)
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/engine ./apps/engine
COPY apps/api ./apps/api

# Expose ports
EXPOSE 8080 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8081/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start both services (engine on 8080, API on 8081)
# In production, you'd typically run these in separate containers
# For MVP, running both in one container is acceptable
CMD ["sh", "-c", "npm -w @invest254/engine start & npm -w @invest254/api start & wait"]
