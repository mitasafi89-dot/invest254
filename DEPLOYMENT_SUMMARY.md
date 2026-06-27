# Invest254 Deployment — What Was Fixed

## The Problem

You tried to deploy to Fly.io 3 days ago and got this error:

```
Error: Could not detect runtime or Dockerfile
Could not find a Dockerfile, nor detect a runtime or framework from source code.
```

**Why it failed:** Invest254 is a monorepo with three separate services (frontend, engine, API). Fly.io couldn't auto-detect the runtime because there was no Dockerfile.

---

## The Solution

I've created a complete Docker + deployment setup for you:

### Files Created

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build for backend (engine + API) |
| `.dockerignore` | Optimizes Docker build (excludes unnecessary files) |
| `apps/web/Dockerfile` | Frontend Next.js build |
| `fly.toml` | Fly.io configuration (regions, scaling, health checks) |
| `docker-compose.yml` | Local development setup (all services in one command) |
| `DEPLOYMENT.md` | Complete deployment guide (step-by-step) |
| `QUICKSTART.md` | Quick 5-minute deployment guide |
| `.env.example` | Environment variables template |

---

## How to Deploy Now

### Option 1: Deploy to Fly.io (Recommended)

```bash
# 1. Install Fly CLI
brew install flyctl  # or your OS equivalent

# 2. Login
fly auth login

# 3. Create app (if not already created)
fly apps create invest254-backend

# 4. Set environment variables
fly secrets set \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="redis://..." \
  SUPABASE_JWT_SECRET="your-secret"

# 5. Deploy
fly deploy

# 6. Monitor
fly logs
```

**That's it! Your backend is live.**

### Option 2: Test Locally First

```bash
# Start all services locally
docker-compose up

# Services available at:
# - Frontend: http://localhost:3000
# - API: http://localhost:8081
# - Engine: ws://localhost:8080
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Players (Browser)                    │
│              (Cloudflare Pages - FREE)                  │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   HTTPS (REST)          WSS (WebSocket)
        │                     │
        ▼                     ▼
┌──────────────────────────────────────────────────────────┐
│              Fly.io Backend ($5-15/month)               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Game Engine (WebSocket) — Port 8080              │ │
│  │  REST API (Fastify) — Port 8081                   │ │
│  │  Health checks enabled                            │ │
│  │  Auto-scaling configured                          │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
   ┌─────────┐ ┌──────────┐ ┌──────────┐
   │Supabase │ │ Upstash  │ │ M-Pesa   │
   │(FREE)   │ │ (FREE)   │ │ Daraja   │
   │Postgres │ │ Redis    │ │ (Paid)   │
   └─────────┘ └──────────┘ └──────────┘
```

---

## Cost Breakdown

| Component | Service | Cost |
|-----------|---------|------|
| **Frontend** | Cloudflare Pages | **FREE** |
| **Backend** | Fly.io | **$5-15/month** |
| **Database** | Supabase (free tier) | **FREE** |
| **Cache** | Upstash (free tier) | **FREE** |
| **Payments** | M-Pesa Daraja | **Paid** (transaction fees) |
| **Total** | | **$5-15/month** |

---

## What Each Service Does

### Fly.io Backend ($5-15/month)

Runs two Node.js services:

1. **Game Engine (WebSocket)**
   - Generates live price curve
   - Broadcasts ticks to all players
   - Settles positions atomically
   - Runs on port 8080

2. **REST API (Fastify)**
   - Auth endpoints
   - Wallet operations
   - Payment callbacks
   - Admin endpoints
   - Runs on port 8081

### Cloudflare Pages Frontend (FREE)

- Serves Next.js static build
- Global CDN (fast everywhere)
- Zero bandwidth charges
- Automatic deployments from GitHub

### Supabase Database (FREE tier)

- PostgreSQL with Row-Level Security
- 500MB storage (enough for MVP)
- 2 concurrent connections
- Automatic backups

### Upstash Cache (FREE tier)

- Redis-compatible
- 10,000 commands/day
- Used for round state, locks, rate limiting

---

## Deployment Checklist

- [ ] Install Fly CLI: `brew install flyctl`
- [ ] Login to Fly.io: `fly auth login`
- [ ] Create Supabase project and get `DATABASE_URL`
- [ ] Create Upstash Redis and get `REDIS_URL`
- [ ] Generate JWT secret: `openssl rand -base64 32`
- [ ] Set Fly.io secrets: `fly secrets set ...`
- [ ] Deploy: `fly deploy`
- [ ] Monitor: `fly logs`
- [ ] Test API: `curl https://invest254-backend.fly.dev/health`
- [ ] Deploy frontend to Cloudflare Pages
- [ ] Test end-to-end

---

## Key Files to Review

1. **QUICKSTART.md** — 5-minute deployment guide
2. **DEPLOYMENT.md** — Complete step-by-step guide
3. **Dockerfile** — Backend build configuration
4. **fly.toml** — Fly.io configuration
5. **docker-compose.yml** — Local development setup
6. **.env.example** — Environment variables reference

---

## Next Steps

1. **Read QUICKSTART.md** — 5-minute guide to get started
2. **Deploy to Fly.io** — `fly deploy`
3. **Deploy frontend to Cloudflare Pages** — Via dashboard or Wrangler
4. **Test end-to-end** — Verify all services are working
5. **Set up monitoring** — Configure alerts for errors
6. **Plan scaling** — Monitor costs and scale as needed

---

## Support Resources

- **Fly.io Docs:** https://fly.io/docs
- **Cloudflare Pages:** https://developers.cloudflare.com/pages
- **Supabase:** https://supabase.com/docs
- **Upstash:** https://upstash.com/docs
- **Docker:** https://docs.docker.com

---

## Why This Setup Works

✅ **Cheap:** $5-15/month for MVP  
✅ **Scalable:** Easy to add more Fly.io machines  
✅ **Reliable:** Managed services (Supabase, Upstash)  
✅ **Fast:** Global CDN (Cloudflare), low-latency backend (Fly.io)  
✅ **Real-time:** WebSocket support on Fly.io  
✅ **Secure:** TLS/SSL, JWT auth, RLS on database  
✅ **Monitored:** Health checks, logs, alerts  

---

**You're ready to deploy! 🚀**

Start with: `fly deploy`
