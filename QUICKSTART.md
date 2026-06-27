# Quick Start: Deploy Invest254 to Fly.io

## What I Fixed

Your deployment failed because there was **no Dockerfile**. I've created:

1. ✅ **Dockerfile** — Multi-stage build for backend (engine + API)
2. ✅ **fly.toml** — Fly.io configuration
3. ✅ **docker-compose.yml** — Local development
4. ✅ **DEPLOYMENT.md** — Full deployment guide

---

## Deploy in 5 Minutes

### Step 1: Install Fly CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
iwr https://fly.io/install.ps1 -useb | iex
```

### Step 2: Login to Fly.io

```bash
fly auth login
```

### Step 3: Create App (if not already created)

```bash
fly apps create invest254-backend
```

### Step 4: Set Environment Variables

```bash
# These are REQUIRED for the app to run
fly secrets set \
  DATABASE_URL="postgresql://user:pass@host/db" \
  REDIS_URL="redis://default:pass@host:port" \
  SUPABASE_JWT_SECRET="your-jwt-secret" \
  MASTER_SEED="your-daily-seed"

# Optional (for M-Pesa integration)
fly secrets set \
  MPESA_CONSUMER_KEY="your-key" \
  MPESA_CONSUMER_SECRET="your-secret"
```

### Step 5: Deploy

```bash
# From repo root
fly deploy
```

### Step 6: Monitor

```bash
# Watch logs in real-time
fly logs

# Check status
fly status

# Get app URL
fly info
```

---

## Test Deployment

```bash
# Test API health
curl https://invest254-backend.fly.dev/health

# Test WebSocket (install wscat first: npm install -g wscat)
wscat -c wss://invest254-backend.fly.dev
```

---

## Local Development (Docker Compose)

```bash
# Start all services locally
docker-compose up

# Services available at:
# - Frontend: http://localhost:3000
# - API: http://localhost:8081
# - Engine: ws://localhost:8080
# - Postgres: localhost:5432
# - Redis: localhost:6379

# Stop services
docker-compose down
```

---

## Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host/db` |
| `REDIS_URL` | Redis cache connection | `redis://default:pass@host:6379` |
| `SUPABASE_JWT_SECRET` | JWT signing key | `your-secret-key` |
| `MASTER_SEED` | Daily seed for curve generation | `seed-2024-06-25` |
| `MPESA_CONSUMER_KEY` | M-Pesa API key | From Daraja |
| `MPESA_CONSUMER_SECRET` | M-Pesa API secret | From Daraja |
| `NODE_ENV` | Environment | `production` or `development` |
| `PORT` | API port | `8081` |

---

## Troubleshooting

### Build Fails

```bash
# Check build logs
fly logs

# Rebuild without cache
fly deploy --no-cache

# Test locally first
docker build -t invest254 .
```

### App Won't Start

```bash
# Check logs
fly logs --lines 100

# Check machine status
fly machines list

# SSH into machine for debugging
fly ssh console
```

### WebSocket Connection Issues

1. Check firewall: `fly open` and verify ports 8080/8081 are accessible
2. Test connection: `wscat -c wss://invest254-backend.fly.dev`
3. Check logs for errors: `fly logs`

### High Memory Usage

```bash
# Reduce machine size
fly scale vm shared-cpu-1x

# Or increase memory
fly scale vm shared-cpu-2x
```

---

## Next: Deploy Frontend to Cloudflare Pages

Once backend is running, deploy frontend:

```bash
# Build for Cloudflare Pages
npm -w @invest254/web run pages:build

# Deploy via Wrangler
wrangler pages deploy .vercel/output/static --project-name invest254-web

# Or via Cloudflare Dashboard (easier)
# 1. Go to https://dash.cloudflare.com
# 2. Pages → Create project
# 3. Connect GitHub repo
# 4. Build command: npm -w @invest254/web run pages:build
# 5. Output directory: .vercel/output/static
# 6. Deploy
```

---

## Cost Estimate

| Service | Free Tier | Cost |
|---------|-----------|------|
| Fly.io | Shared CPU, 3 machines | $0 or $5-15/month |
| Cloudflare Pages | Unlimited | FREE |
| Supabase | 500MB storage | FREE |
| Upstash | 10K commands/day | FREE |
| **Total** | | **$0-15/month** |

---

## What's Running

**Backend (Fly.io):**
- ✅ WebSocket Game Engine (port 8080)
- ✅ REST API (port 8081)
- ✅ Health checks enabled
- ✅ Auto-scaling configured

**Frontend (Cloudflare Pages):**
- ✅ Next.js static build
- ✅ Global CDN
- ✅ Zero bandwidth charges

**Database (Supabase):**
- ✅ PostgreSQL with RLS
- ✅ Automatic backups
- ✅ Free tier: 500MB storage

**Cache (Upstash):**
- ✅ Redis-compatible
- ✅ Free tier: 10K commands/day

---

## Support

- **Fly.io Docs:** https://fly.io/docs
- **Cloudflare Pages:** https://developers.cloudflare.com/pages
- **Supabase:** https://supabase.com/docs
- **Upstash:** https://upstash.com/docs

---

## Next Steps

1. ✅ Install Fly CLI
2. ✅ Login to Fly.io
3. ✅ Set environment variables
4. ✅ Run `fly deploy`
5. ✅ Monitor with `fly logs`
6. ✅ Deploy frontend to Cloudflare Pages
7. ✅ Test end-to-end
8. ✅ Set up monitoring

**You're ready to deploy! 🚀**
