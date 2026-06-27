# Invest254 Deployment Guide

## Overview

Invest254 is deployed across multiple platforms:
- **Frontend:** Cloudflare Pages (static + edge functions)
- **Backend:** Fly.io (WebSocket engine + REST API)
- **Database:** Supabase (managed Postgres)
- **Cache:** Upstash (managed Redis)

---

## Prerequisites

1. **Fly.io account** — https://fly.io (free tier available)
2. **Cloudflare account** — https://cloudflare.com (free tier available)
3. **Supabase account** — https://supabase.com (free tier available)
4. **Upstash account** — https://upstash.com (free tier available)
5. **CLI tools:**
   ```bash
   npm install -g @flyio/cli
   npm install -g wrangler  # Cloudflare CLI
   ```

---

## Step 1: Deploy Backend to Fly.io

### 1.1 Create Fly.io App

```bash
# Login to Fly.io
fly auth login

# Create a new app
fly apps create invest254-backend

# Or if app already exists, set it in fly.toml
```

### 1.2 Set Environment Variables

```bash
# Set secrets (these won't be logged)
fly secrets set \
  DATABASE_URL="postgresql://user:pass@host/db" \
  REDIS_URL="redis://default:pass@host:6379" \
  SUPABASE_JWT_SECRET="your-jwt-secret" \
  MPESA_CONSUMER_KEY="your-key" \
  MPESA_CONSUMER_SECRET="your-secret" \
  MASTER_SEED="your-daily-seed"
```

### 1.3 Deploy

```bash
# From repo root
fly deploy

# Monitor deployment
fly logs

# Check status
fly status
```

### 1.4 Verify Deployment

```bash
# Test API health
curl https://invest254-backend.fly.dev/health

# Test WebSocket (requires wscat or similar)
wscat -c wss://invest254-backend.fly.dev
```

---

## Step 2: Deploy Frontend to Cloudflare Pages

### 2.1 Build for Cloudflare Pages

```bash
# From repo root
npm -w @invest254/web run pages:build

# This generates .vercel/output/static
```

### 2.2 Deploy to Cloudflare Pages

**Option A: Via Wrangler CLI**

```bash
# Install wrangler
npm install -g wrangler

# Deploy
wrangler pages deploy .vercel/output/static --project-name invest254-web
```

**Option B: Via Cloudflare Dashboard**

1. Go to https://dash.cloudflare.com
2. Select "Pages"
3. Create new project
4. Connect GitHub repo
5. Set build command: `npm -w @invest254/web run pages:build`
6. Set output directory: `.vercel/output/static`
7. Deploy

### 2.3 Set Environment Variables

In Cloudflare Pages dashboard:
- `NEXT_PUBLIC_API_BASE_URL` = `https://invest254-backend.fly.dev/api/v1`
- `NEXT_PUBLIC_WS_URL` = `wss://invest254-backend.fly.dev`

---

## Step 3: Configure Database (Supabase)

### 3.1 Create Supabase Project

1. Go to https://supabase.com
2. Create new project
3. Get connection string from Settings → Database

### 3.2 Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://..."

# Run migrations (from packages/db/migrations)
# You'll need to run these manually or via a migration tool
# For now, use Supabase SQL editor to run migration files
```

### 3.3 Update Fly.io Secrets

```bash
fly secrets set DATABASE_URL="your-supabase-connection-string"
```

---

## Step 4: Configure Cache (Upstash)

### 4.1 Create Upstash Redis

1. Go to https://console.upstash.com
2. Create new Redis database
3. Get connection string

### 4.2 Update Fly.io Secrets

```bash
fly secrets set REDIS_URL="redis://default:password@host:port"
```

---

## Local Development

### Option 1: Docker Compose (Recommended)

```bash
# Start all services
docker-compose up

# Services will be available at:
# - Frontend: http://localhost:3000
# - API: http://localhost:8081
# - Engine: ws://localhost:8080
# - Postgres: localhost:5432
# - Redis: localhost:6379
```

### Option 2: Manual Setup

```bash
# Terminal 1: Start engine
npm -w @invest254/engine start

# Terminal 2: Start API
npm -w @invest254/api start

# Terminal 3: Start frontend
npm -w @invest254/web dev
```

---

## Monitoring & Logs

### Fly.io Logs

```bash
# Real-time logs
fly logs

# Logs for specific machine
fly logs --instance <machine-id>

# Historical logs
fly logs --lines 100
```

### Cloudflare Pages Logs

1. Go to Cloudflare Dashboard → Pages → invest254-web
2. Click "Deployments"
3. View build logs and runtime logs

---

## Scaling

### Fly.io Scaling

```bash
# Scale to multiple machines
fly scale count 2

# Adjust machine size
fly scale vm shared-cpu-1x  # or shared-cpu-2x, dedicated-cpu-1x, etc.

# Set auto-scaling
fly autoscale set min=1 max=3
```

### Database Scaling

- **Supabase:** Upgrade plan in dashboard
- **Upstash:** Upgrade plan in console

---

## Troubleshooting

### Deployment Fails

```bash
# Check build logs
fly logs --lines 50

# Rebuild without cache
fly deploy --no-cache

# Check Dockerfile
docker build -t invest254 .
```

### WebSocket Connection Issues

1. Check Fly.io firewall rules
2. Verify `WS_PORT` environment variable
3. Test with: `wscat -c wss://invest254-backend.fly.dev`

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check Supabase connection limits
# (free tier: 2 concurrent connections)
```

### High Costs

1. Check bandwidth usage in Fly.io dashboard
2. Monitor Redis commands in Upstash
3. Review database queries in Supabase
4. Consider caching strategies

---

## Cost Breakdown (MVP)

| Service | Free Tier | Cost |
|---------|-----------|------|
| Fly.io | Shared CPU, 3 shared-cpu-1x machines | $0 (free tier) or $5-15/month |
| Cloudflare Pages | Unlimited deployments, 100GB bandwidth | FREE |
| Supabase | 500MB storage, 2 concurrent connections | FREE |
| Upstash | 10,000 commands/day | FREE |
| **Total** | | **$0-15/month** |

---

## Next Steps

1. ✅ Create accounts on all platforms
2. ✅ Deploy backend to Fly.io
3. ✅ Deploy frontend to Cloudflare Pages
4. ✅ Configure database and cache
5. ✅ Test end-to-end
6. ✅ Set up monitoring and alerts
7. ✅ Document secrets management
8. ✅ Plan scaling strategy

---

## Security Checklist

- [ ] All secrets stored in platform secret managers (not in code)
- [ ] Database connection uses SSL/TLS
- [ ] API endpoints protected with JWT validation
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] DDoS protection enabled (Cloudflare)
- [ ] Backups configured (Supabase)
- [ ] Monitoring and alerts set up
- [ ] Incident response plan documented

---

## Support

- **Fly.io Docs:** https://fly.io/docs
- **Cloudflare Pages Docs:** https://developers.cloudflare.com/pages
- **Supabase Docs:** https://supabase.com/docs
- **Upstash Docs:** https://upstash.com/docs
