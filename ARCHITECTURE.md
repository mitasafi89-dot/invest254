# Invest254 Deployment Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PLAYERS (Browser)                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Cloudflare Pages (FREE)                                        │  │
│  │  ├─ Next.js Frontend (Static Build)                            │  │
│  │  ├─ Global CDN (Fast everywhere)                               │  │
│  │  ├─ Zero bandwidth charges                                     │  │
│  │  └─ Auto-deploy from GitHub                                   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
         HTTPS (REST)          WSS (WebSocket)
                │                     │
                ▼                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    FLY.IO BACKEND ($5-15/month)                          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Game Engine (Node.js + ws)                                       │ │
│  │  ├─ Port: 8080 (WebSocket)                                        │ │
│  │  ├─ Generates live price curve                                    │ │
│  │  ├─ Broadcasts ticks to all players                               │ │
│  │  ├─ Settles positions atomically                                  │ │
│  │  └─ Enforces house edge & fairness                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  REST API (Node.js + Fastify)                                     │ │
│  │  ├─ Port: 8081 (HTTP)                                             │ │
│  │  ├─ Auth endpoints (register, login)                              │ │
│  │  ├─ Wallet operations (deposit, withdraw)                         │ │
│  │  ├─ Payment callbacks (M-Pesa)                                    │ │
│  │  ├─ Admin endpoints                                               │ │
│  │  └─ Affiliate endpoints                                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Infrastructure                                                   │ │
│  │  ├─ Health checks (every 30s)                                     │ │
│  │  ├─ Auto-scaling (min 1, max 3 machines)                          │ │
│  │  ├─ Shared CPU (512MB RAM, 1 vCPU)                                │ │
│  │  └─ Automatic restarts on failure                                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  SUPABASE        │ │  UPSTASH         │ │  M-PESA DARAJA   │
│  (FREE tier)     │ │  (FREE tier)     │ │  (Paid)          │
│                  │ │                  │ │                  │
│  PostgreSQL      │ │  Redis Cache     │ │  STK Push        │
│  ├─ 500MB        │ │  ├─ 10K cmds/day │ │  (Deposits)      │
│  ├─ 2 conns      │ │  ├─ Round state  │ │                  │
│  ├─ RLS enabled  │ │  ├─ Locks        │ │  B2C             │
│  ├─ Backups      │ │  └─ Rate limits  │ │  (Withdrawals)   │
│  └─ Auth         │ │                  │ │                  │
│                  │ │                  │ │                  │
│  Tables:         │ │                  │ │                  │
│  ├─ identity     │ │                  │ │                  │
│  ├─ wallet       │ │                  │ │                  │
│  ├─ ledger       │ │                  │ │                  │
│  ├─ game         │ │                  │ │                  │
│  ├─ payments     │ │                  │ │                  │
│  ├─ affiliate    │ │                  │ │                  │
│  └─ engagement   │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## Data Flow

### 1. Player Registration

```
Browser (Cloudflare Pages)
    │
    ├─ POST /auth/register
    │
    ▼
Fly.io API (8081)
    │
    ├─ Validate input
    ├─ Hash password
    ├─ Create user in Supabase
    │
    ▼
Supabase (PostgreSQL)
    │
    ├─ INSERT INTO identity
    ├─ INSERT INTO wallet
    │
    ▼
Response: JWT token
    │
    ▼
Browser stores token
```

### 2. Player Places Bet

```
Browser (Cloudflare Pages)
    │
    ├─ Connect WebSocket
    │
    ▼
Fly.io Engine (8080)
    │
    ├─ Authenticate with JWT
    ├─ Subscribe to ticks
    │
    ▼
Browser receives ticks
    │
    ├─ Render curve
    ├─ Show live P&L
    │
    ▼
Player clicks BUY/SELL
    │
    ├─ Send open_position message
    │
    ▼
Fly.io Engine
    │
    ├─ Validate stake
    ├─ Check balance (Supabase)
    ├─ Store round state (Upstash Redis)
    ├─ Broadcast position_opened
    │
    ▼
Browser receives position_opened
    │
    ├─ Update UI
    ├─ Show live P&L
    │
    ▼
Engine broadcasts ticks
    │
    ├─ Player sees curve move
    ├─ P&L updates in real-time
    │
    ▼
Position auto-sells or player clicks sell
    │
    ├─ Send sell message
    │
    ▼
Fly.io Engine
    │
    ├─ Calculate multiplier
    ├─ Compute payout
    ├─ Update wallet (Supabase)
    ├─ Record in ledger
    ├─ Broadcast position_settled
    │
    ▼
Browser receives position_settled
    │
    ├─ Show result (WIN/LOSS)
    ├─ Update balance
    ├─ Show in activity feed
```

### 3. Player Deposits

```
Browser
    │
    ├─ Click Deposit
    ├─ Enter amount
    │
    ▼
Fly.io API (8081)
    │
    ├─ POST /deposits
    ├─ Validate amount
    ├─ Create M-Pesa STK push
    │
    ▼
M-Pesa Daraja
    │
    ├─ Send STK prompt to player's phone
    │
    ▼
Player enters M-Pesa PIN
    │
    ├─ M-Pesa processes payment
    │
    ▼
M-Pesa Daraja
    │
    ├─ Webhook callback to Fly.io API
    │
    ▼
Fly.io API
    │
    ├─ Verify callback
    ├─ Update wallet (Supabase)
    ├─ Record transaction
    │
    ▼
Browser receives balance update
    │
    ├─ Show success
    ├─ Update balance
```

---

## Deployment Flow

### Local Development

```
docker-compose up
    │
    ├─ Start PostgreSQL (localhost:5432)
    ├─ Start Redis (localhost:6379)
    ├─ Start Engine (localhost:8080)
    ├─ Start API (localhost:8081)
    ├─ Start Frontend (localhost:3000)
    │
    ▼
All services running locally
    │
    ├─ Test end-to-end
    ├─ Debug issues
    ├─ Verify functionality
```

### Production Deployment

```
git push to GitHub
    │
    ├─ GitHub Actions (optional CI/CD)
    │
    ▼
Fly.io
    │
    ├─ fly deploy
    ├─ Build Docker image
    ├─ Push to Fly.io registry
    ├─ Start new machine
    ├─ Health check
    ├─ Route traffic
    │
    ▼
Backend live at: https://invest254-backend.fly.dev
    │
    ├─ API: https://invest254-backend.fly.dev/api/v1
    ├─ WebSocket: wss://invest254-backend.fly.dev
    │
    ▼
Cloudflare Pages
    │
    ├─ npm -w @invest254/web run pages:build
    ├─ Deploy to Cloudflare
    │
    ▼
Frontend live at: https://invest254.pages.dev
    │
    ├─ Configured to call Fly.io backend
    ├─ WebSocket connects to Fly.io
```

---

## Environment Variables

### Backend (Fly.io)

```
DATABASE_URL=postgresql://...        # Supabase
REDIS_URL=redis://...                # Upstash
SUPABASE_JWT_SECRET=...              # JWT signing key
MASTER_SEED=...                      # Daily seed
MPESA_CONSUMER_KEY=...               # M-Pesa
MPESA_CONSUMER_SECRET=...            # M-Pesa
NODE_ENV=production
PORT=8081
```

### Frontend (Cloudflare Pages)

```
NEXT_PUBLIC_API_BASE_URL=https://invest254-backend.fly.dev/api/v1
NEXT_PUBLIC_WS_URL=wss://invest254-backend.fly.dev
```

---

## Scaling Strategy

### MVP (Current)

```
Fly.io: 1 shared-cpu machine (512MB RAM)
Supabase: Free tier (500MB)
Upstash: Free tier (10K commands/day)
Cost: $5-15/month
```

### Growth (100-1000 players)

```
Fly.io: 2-3 shared-cpu machines (auto-scaling)
Supabase: Upgrade to $25/month (8GB storage)
Upstash: Upgrade to $50/month (higher throughput)
Cost: $50-100/month
```

### Scale (1000+ players)

```
Fly.io: 5-10 dedicated-cpu machines (multi-region)
Supabase: Dedicated database ($500+/month)
Upstash: Dedicated Redis cluster ($200+/month)
Cost: $500+/month
```

---

## Monitoring

### Fly.io

```
fly logs                    # Real-time logs
fly status                  # Machine status
fly metrics                 # CPU, memory, network
fly ssh console             # SSH into machine
```

### Supabase

```
Dashboard → Logs            # Query logs
Dashboard → Monitoring      # Performance metrics
Dashboard → Backups         # Backup status
```

### Upstash

```
Console → Metrics           # Command stats
Console → Logs              # Operation logs
```

---

## Cost Breakdown

| Component | Free Tier | Paid Tier | MVP Cost |
|-----------|-----------|-----------|----------|
| Fly.io | $0 (limited) | $5-15/mo | $5-15 |
| Cloudflare Pages | FREE | FREE | FREE |
| Supabase | FREE (500MB) | $25/mo | FREE |
| Upstash | FREE (10K/day) | $50/mo | FREE |
| M-Pesa | — | Per transaction | Variable |
| **Total** | | | **$5-15/mo** |

---

## Security

```
┌─────────────────────────────────────────────────────────┐
│  HTTPS/WSS (TLS Encryption)                             │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  JWT Authentication                                     │
│  ├─ Signed with SUPABASE_JWT_SECRET                    │
│  ├─ Verified on every request                          │
│  └─ 7-day expiration                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Row-Level Security (RLS)                               │
│  ├─ Players see only their own data                    │
│  ├─ Admins see scoped data                             │
│  └─ Database enforces policies                         │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Rate Limiting                                          │
│  ├─ 100 requests/minute per IP                         │
│  ├─ Stored in Redis                                    │
│  └─ Prevents abuse                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Disaster Recovery

```
Backup Strategy:
├─ Supabase: Automatic daily backups (30-day retention)
├─ Upstash: Automatic snapshots
├─ Code: GitHub (version control)
└─ Secrets: Fly.io secret manager

Recovery:
├─ Database: Restore from Supabase backup
├─ Cache: Rebuild from database
├─ Code: Redeploy from GitHub
└─ Secrets: Restore from Fly.io
```

---

**Ready to deploy? Start with: `fly deploy`**
