# Dockerfile for Invest254 frontend (Next.js)
# This is for local development or standalone deployment
# For Cloudflare Pages, use: npm -w @invest254/web run pages:build

FROM node:20-alpine

WORKDIR /app

# Copy monorepo files
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./

# Copy workspace packages
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Install dependencies
RUN npm ci

# Build Next.js app
RUN npm -w @invest254/web run build

# Expose port
EXPOSE 3000

# Start Next.js
CMD ["npm", "-w", "@invest254/web", "start"]
