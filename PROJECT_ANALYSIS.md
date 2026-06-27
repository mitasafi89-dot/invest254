# Invest254 — Comprehensive Project Analysis

## 📋 Executive Summary

**Invest254** is a professional, real-money, crypto-themed **binary trade-prediction game** designed for the Kenyan market. It's a fully managed gaming platform combining a player web app, an authoritative real-time game engine, wallet & M-Pesa payments, an affiliate program, and an administrative back office.

**Key Tagline:** "One shared live price curve, everyone bets BUY/SELL, win up to ×5.0"

---

## 🎮 Product Overview

### Vision
A fast, social, real-money prediction game where:
- A single live price curve (styled as `BTC/KES`) streams to all players simultaneously
- Players stake KES and predict whether the rate will go **UP (BUY)** or **DOWN (SELL)**
- Payouts range from 1.0× to **5.0× multiplier**
- Experience blends a trading terminal look with casino crash game pace

### Core Value Loop
1. **Sign up** (phone + password)
2. **Deposit** (M-Pesa STK push)
3. **Play rounds** (BUY/SELL predictions)
4. **Win/lose** against the live curve
5. **Withdraw** (M-Pesa B2C)
6. **Invite friends** (affiliate program)

### Key Parameters (MVP)
| Parameter | Value | Notes |
|-----------|-------|-------|
| Currency | KES | Kenyan Shilling |
| Minimum stake | 50 | Quick chips: 50/100/200/500 |
| Maximum multiplier | ×5.0 | Win cap |
| House edge | 75% (RTP 25%) | Business-set, tunable per-game |
| Round duration | 10s | Auto-sell timer |
| Chart timeframes | 30s, 1m, 2m, 5m | Visualization only |
| Affiliate commission | 20% | Revenue-share on referred net losses |
| Auth | Phone + password | Self-managed (no OTP in MVP) |
| KYC | None | Age verification removed (migration 0018) |

---

## 👥 User Roles

| Role | Description | Primary Surface |
|------|-------------|-----------------|
| **Player** | Deposits via M-Pesa, places BUY/SELL positions, withdraws winnings | Player web app |
| **Marketer (Affiliate)** | Player who refers others, earns 20% revenue-share | Player app + Affiliate dashboard |
| **Support Agent** | Handles tickets, views finances, assists KYC | Admin (scoped) |
| **Finance Admin** | Approves withdrawals, reconciles M-Pesa, manages affiliate payouts | Admin |
| **Super Admin** | Full control: users, game config, bonuses, roles | Admin |

---

## 🏗️ System Architecture

### High-Level Components

```
                    ┌─────────────────────────────────┐
                    │         Players                 │
                    │  (browser web app — Next.js)    │
                    └──────────┬──────────┬────────────┘
                   HTTPS (REST)│          │ WSS (realtime)
                               ▼          ▼
        ┌──────────────────┐  ┌──────────────────────┐
        │  API Gateway     │  │  Game Engine (WS)    │
        │  (REST)          │  │  Node.js             │
        │  Node.js/Fastify │  │  Authoritative curve │
        └────────┬─────────┘  └──────────┬───────────┘
                 │                       │
                 └───────────┬───────────┘
                             ▼
        ┌──────────────────────────────────────────┐
        │   Supabase (managed Postgres)            │
        │   Auth · Postgres (RLS) · Storage        │
        └──────────────────────────────────────────┘
                 │              │              │
                 ▼              ▼              ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ M-Pesa       │  │ SMS OTP      │  │ Redis        │
        │ Daraja       │  │ provider     │  │ (cache/state)│
        │ STK + B2C    │  │              │  │              │
        └──────────────┘  └──────────────┘  └──────────────┘
```

### Core Services

#### 1. **Player Web App** (Next.js / React)
- Renders live curve (canvas/WebGL via lightweight-charts or custom renderer)
- Connects to Game Engine over WebSocket for ticks & round state
- Calls REST API for auth, wallet, deposits, withdrawals, history, affiliate

#### 2. **Game Engine** (Authoritative Node.js WebSocket)
- **Single source of truth** for shared curve and round outcomes
- Generates smooth price wave, broadcasts ticks to all clients
- Opens/closes positions, computes P&L and multipliers
- Settles atomically against wallet
- Enforces house edge (RTP) and ×5 cap
- Stateless-friendly: round state in Redis; durable records in Postgres

#### 3. **REST API Gateway** (Node.js / Fastify)
- Auth & sessions, KYC, wallet ops
- M-Pesa callbacks, affiliate endpoints
- Admin endpoints
- Validates JWTs from Supabase Auth; enforces role-based access

#### 4. **Supabase**
- **Auth:** phone+password identities, JWT issuance
- **Postgres:** all durable data, protected by Row-Level Security (RLS)
- **Storage:** KYC docs, marketing assets
- **Realtime:** optional pub/sub for non-game events

#### 5. **Supporting Services**
- **Redis:** live round state, rate limiting, idempotency keys, distributed locks
- **M-Pesa Daraja:** STK push (deposit) + B2C (withdrawal)
- **SMS provider:** OTP delivery (Africa's Talking / Twilio)

---

## 📦 Monorepo Structure

**Technology:** npm workspaces (Node ≥ 20, TypeScript, ESM)

### Workspaces

| Workspace | Package | Responsibility |
|-----------|---------|-----------------|
| `packages/shared` | `@invest254/shared` | Pure, deterministic core: PRNG, curve, settlement, daily seed, money/payment helpers, chat filter, config/types |
| `packages/db` | — | SQL migrations (0001–0026): schema, RLS, atomic money/seed/fairness/payment RPCs |
| `apps/engine` | `@invest254/engine` | Authoritative WebSocket game server + reusable services (game, daily-seed rotation, crash recovery, engagement, payments) |
| `apps/api` | `@invest254/api` | REST transport (Node `http`) binding engine services: public game/fairness/activity, player wallet/chat/payments + history, Daraja callbacks, finance-admin withdrawal moderation |
| `apps/web` | — | Next.js frontend (player app + admin dashboard) |

### Key Commands

```bash
npm install                      # install workspaces
npx tsc -b packages/shared apps/engine apps/api   # typecheck
node --import tsx --test packages/**/*.test.ts apps/**/*.test.ts   # run all tests

npm -w @invest254/engine start   # WS engine   (PORT, MASTER_SEED, DATABASE_URL, SUPABASE_JWT_*)
npm -w @invest254/api start      # REST API     (PORT=8081, DATABASE_URL, SUPABASE_JWT_*, MPESA_*)
```

---

## 📁 Directory Structure

```
invest254/
├── README.md                          # Main documentation index
├── package.json                       # Monorepo root
├── tsconfig.base.json                 # Shared TypeScript config
│
├── apps/
│   ├── api/                           # REST API Gateway
│   │   ├── src/
│   │   │   ├── app.admin.ts           # Admin endpoints
│   │   │   ├── app.affiliate.ts       # Affiliate endpoints
│   │   │   ├── app.auth.ts            # Auth endpoints
│   │   │   ├── app.history.ts         # History/ledger endpoints
│   │   │   ├── app.payments.ts        # Payment endpoints
│   │   │   ├── app.ts                 # Main app setup
│   │   │   ├── server.ts              # HTTP server
│   │   │   └── *.test.ts              # Tests
│   │
│   ├── engine/                        # WebSocket Game Engine
│   │   ├── src/
│   │   │   ├── server.ts              # WS server
│   │   │   ├── game.ts                # Game logic
│   │   │   ├── wallet.ts              # Wallet operations
│   │   │   ├── payments.ts            # Payment processing
│   │   │   ├── auth.ts                # Authentication
│   │   │   ├── admin.ts               # Admin operations
│   │   │   ├── affiliate.ts           # Affiliate logic
│   │   │   ├── engagement.ts          # Engagement tracking
│   │   │   ├── activity.ts            # Activity feed
│   │   │   ├── daycontext.ts          # Daily context
│   │   │   ├── identity.ts            # Identity management
│   │   │   ├── recovery.ts            # Crash recovery
│   │   │   ├── daraja.ts              # M-Pesa integration
│   │   │   ├── chatservice.ts         # Chat service
│   │   │   └── *.test.ts              # Tests
│   │
│   └── web/                           # Next.js Frontend
│       ├── src/
│       │   ├── app/                   # App Router pages
│       │   ├── components/            # React components
│       │   └── lib/                   # Utilities
│       ├── public/                    # Static assets
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       └── wrangler.toml              # Cloudflare Workers config
│
├── packages/
│   ├── shared/                        # Shared utilities
│   │   ├── src/
│   │   │   ├── types.ts               # Shared types
│   │   │   ├── config.ts              # Configuration
│   │   │   ├── prng.ts                # Pseudo-random number generator
│   │   │   ├── curve.ts               # Price curve generation
│   │   │   ├── settle.ts              # Settlement logic
│   │   │   ├── money.ts               # Money utilities
│   │   │   ├── payments.ts            # Payment helpers
│   │   │   ├── credentials.ts         # Credential handling
│   │   │   ├── activity.ts            # Activity types
│   │   │   ├── chatfilter.ts          # Chat moderation
│   │   │   ├── seed.ts                # Seed management
│   │   │   └── *.test.ts              # Tests
│   │
│   └── db/                            # Database migrations
│       └── migrations/
│           ├── 0001_helpers.sql       # Helper functions
│           ├── 0002_identity_roles.sql
│           ├── 0003_wallet_ledger.sql
│           ├── 0004_game.sql
│           ├── 0005_payments.sql
│           ├── 0006_affiliate.sql
│           ├── 0007_engagement.sql
│           ├── 0008_rls_policies.sql
│           ├── 0009_seed.sql
│           ├── 0010_money_rpcs.sql
│           ├── 0011_fairness.sql
│           ├── 0012_open_with_opened_at.sql
│           ├── 0013_seed_engagement.sql
│           ├── 0014_payment_rpcs.sql
│           ├── 0015_self_managed_auth.sql
│           ├── 0016_age_verification.sql
│           ├── 0017_affiliate_enroll_attribution.sql
│           ├── 0018_affiliate_commission_accrual.sql
│           ├── 0018_remove_age_kyc.sql
│           ├── 0019_affiliate_payouts.sql
│           ├── 0020_role_consolidation.sql
│           ├── 0021_admin_actions.sql
│           ├── 0022_admin_balance_adjust.sql
│           ├── 0023_admin_config_rtp_seed.sql
│           ├── 0024_admin_mpesa_config.sql
│           ├── 0025_admin_set_user_role.sql
│           └── 0026_superadmin_singleton.sql
│
└── docs/                              # Comprehensive documentation
    ├── 00-product-overview.md         # Vision, players, glossary, MVP scope
    ├── 01-architecture.md             # Components, data flow, tech stack
    ├── 02-game-engine.md              # Round lifecycle, curve, RTP, fairness
    ├── 03-realtime-protocol.md        # WebSocket events, tick stream
    ├── 04-database-schema.md          # Tables, columns, relationships, RLS
    ├── 05-api-reference.md            # REST endpoints
    ├── 06-auth-kyc.md                 # Phone+password, sessions, age-gate
    ├── 07-wallet-transactions.md      # Balances, ledger, atomic settlement
    ├── 08-payments-mpesa.md           # STK push, B2C, Daraja
    ├── 09-affiliate-system.md         # Referrals, 20% rev-share, payouts
    ├── 10-admin-panel.md              # User mgmt, finance, config, reports
    ├── 11-activity-feed-chat.md       # Live wins feed, chat moderation
    ├── 12-bonuses-promotions.md       # Welcome bonus, promo codes, wagering
    ├── 13-frontend-spec.md            # Screens, components, UX states
    ├── 14-security-compliance.md      # Threat model, responsible gaming
    ├── 15-deployment-devops.md        # Environments, CI/CD, monitoring
    ├── 16-roadmap.md                  # Milestones, acceptance criteria
    ├── 17-frontend-build-plan.md      # Frontend implementation details
    ├── 18-implementation-status-and-roadmap.md
    └── 19-affiliate-program-decisions.md
```

---

## 🔧 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 14 (App Router) + TypeScript + Tailwind | SSR, fast, professional |
| **Charting** | Custom canvas smooth-wave renderer (Catmull-Rom spline) | Matches "very smooth waves" requirement |
| **Realtime** | Node.js + `ws` / `uWebSockets.js` | Low-latency authoritative engine |
| **REST API** | Node.js + Fastify + TypeScript | Performant, schema-validated |
| **Database** | Supabase (Postgres 15 + Auth) | Already connected, RLS support |
| **Cache/State** | Redis | Round state, locks, rate limits |
| **Payments** | M-Pesa Daraja | STK push + B2C |
| **Hosting** | Vercel (web) + Fly.io/Render/Railway (engine+API) + Supabase cloud | Scalable, managed |
| **Infrastructure** | Docker + GitHub Actions | Reproducible deploys |

### Dependencies (Root)
```json
{
  "dependencies": {
    "jose": "^6.2.3",      // JWT handling
    "pg": "^8.21.0",       // PostgreSQL client
    "ws": "^8.21.0"        // WebSocket library
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/pg": "^8.20.0",
    "@types/ws": "^8.18.1",
    "tsx": "^4.16.0",       // TypeScript executor
    "typescript": "^5.5.0"
  }
}
```

---

## 🎮 Game Engine Details

### Round Lifecycle
1. **Curve Generation:** Deterministic smooth price wave generated from daily seed
2. **Position Opening:** Player stakes KES, predicts BUY/SELL, gets entry rate
3. **Tick Broadcasting:** Engine broadcasts price ticks to all connected clients
4. **Position Closing:** Manual sell or auto-sell at 10s timer
5. **Settlement:** Multiplier computed, P&L calculated, wallet updated atomically
6. **Fairness:** Server-seed provably fair system ensures transparency

### Key Mechanics
- **House Edge:** 75% (RTP 25%) — tunable per-game
- **Multiplier Cap:** ×5.0 maximum payout
- **Auto-sell Timer:** 10 seconds default
- **Curve Smoothness:** Catmull-Rom spline interpolation
- **Fairness:** Deterministic PRNG seeded daily

---

## 💳 Payment Integration

### M-Pesa Daraja
- **Deposits:** STK push (player initiates, M-Pesa prompt appears)
- **Withdrawals:** B2C (admin-approved, funds sent to player's phone)
- **Callbacks:** Webhook handling for transaction status

### Wallet System
- **Real Balance:** Actual KES funds
- **Bonus Balance:** Promotional credits (separate ledger)
- **Atomic Settlement:** Database RPCs ensure consistency
- **Full Ledger:** All transactions tracked for audit

---

## 👥 Affiliate Program

### Structure
- **Commission:** 20% revenue-share on referred player's net losses
- **Referral Links:** Unique tracking per marketer
- **Dashboard:** Affiliate can view earnings, referrals, payout requests
- **Payouts:** Finance admin approves, M-Pesa B2C sent to affiliate

### Enrollment
- Player can become affiliate (opt-in)
- Attribution tracked at signup
- Commission accrual on each round settlement

---

## 🔐 Security & Compliance

### Authentication
- **Phone + Password:** Self-managed (no OTP in MVP)
- **JWT Validation:** Supabase Auth issues JWTs
- **Session Management:** Token-based, expiring
- **Dev Mode:** Header-trusted auth (dev only, never production)

### Data Protection
- **Row-Level Security (RLS):** Postgres policies enforce user isolation
- **Encryption:** TLS for all transport
- **Secrets Management:** Environment variables for sensitive config

### Responsible Gaming
- **Age Gate:** 18+ verification (removed from MVP but framework in place)
- **Limits:** Configurable stake/loss limits (future)
- **Self-Exclusion:** Support for player account suspension

### Compliance
- **Licensing:** Requires valid gaming licence per jurisdiction
- **KYC/AML:** Basic identity verification (enhanced KYC future)
- **Tax:** Excise/withholding tax handling
- **Advertising:** Jurisdiction-specific rules

---

## 📊 Database Schema Highlights

### Core Tables (from migrations)
- **identity:** Users, roles, auth credentials
- **wallet:** Player balances (real + bonus)
- **ledger:** All wallet transactions (audit trail)
- **game:** Round records, positions, outcomes
- **payments:** M-Pesa transactions, deposits, withdrawals
- **affiliate:** Referral links, commission tracking, payouts
- **engagement:** Activity feed, chat messages
- **admin_actions:** Audit log of admin operations

### RLS Policies
- Players see only their own data
- Admins see scoped data per role
- Finance admins see payment/withdrawal data
- Super admins see everything

---

## 📚 Documentation Index

| # | Document | Contents |
|---|----------|----------|
| 00 | Product Overview | Vision, players, glossary, MVP scope |
| 01 | System Architecture | Components, data flow, tech stack |
| 02 | Game Engine & Math | Round lifecycle, curve, RTP, fairness |
| 03 | Realtime Protocol | WebSocket events, tick stream |
| 04 | Database Schema | Tables, columns, relationships, RLS |
| 05 | API Reference | REST endpoints |
| 06 | Authentication & KYC | Phone+password, sessions, age-gate |
| 07 | Wallet & Transactions | Balances, ledger, atomic settlement |
| 08 | M-Pesa Payments | STK push, B2C, Daraja |
| 09 | Affiliate System | Referrals, 20% rev-share, payouts |
| 10 | Admin Back Office | User mgmt, finance, config, reports |
| 11 | Activity Feed & Chat | Live wins feed, chat moderation |
| 12 | Bonuses & Promotions | Welcome bonus, promo codes, wagering |
| 13 | Frontend Spec | Screens, components, UX states |
| 14 | Security & Compliance | Threat model, responsible gaming |
| 15 | Deployment & DevOps | Environments, CI/CD, monitoring |
| 16 | MVP Roadmap | Milestones, acceptance criteria |

---

## 🚀 Development Setup

### Prerequisites
- Node.js ≥ 20
- npm (workspaces support)
- PostgreSQL (or Supabase)
- Redis (optional for local dev)

### Local Development
```bash
# Install dependencies
npm install

# Type check
npx tsc -b packages/shared apps/engine apps/api

# Run tests
node --import tsx --test packages/**/*.test.ts apps/**/*.test.ts

# Start Game Engine (in-memory mode if no DATABASE_URL)
npm -w @invest254/engine start

# Start REST API (requires DATABASE_URL)
npm -w @invest254/api start

# Start Frontend (Next.js)
npm -w @invest254/web dev
```

### Environment Variables
- `PORT` — Server port (default: 3000 for engine, 8081 for API)
- `DATABASE_URL` — PostgreSQL connection string
- `MASTER_SEED` — Daily seed for curve generation
- `SUPABASE_JWT_*` — JWT verification keys
- `MPESA_*` — M-Pesa Daraja credentials

---

## 📈 MVP Scope

### In Scope
✅ Phone+password signup/login  
✅ Wallet with real KES + bonus balance  
✅ M-Pesa deposits (STK push) & withdrawals (B2C)  
✅ Single shared game: live curve, BUY/SELL, 10s auto-sell, ×5 cap, 75% house edge  
✅ Provably-fair round records  
✅ Affiliate program: referral links, 20% rev-share, dashboard, payouts  
✅ Admin back office: user mgmt, finance, config, reports, bonuses  
✅ Live Activity feed & basic chat  
✅ Welcome bonus + promo codes  

### Out of Scope (Future)
❌ Multiple concurrent game rooms / assets  
❌ Full document-upload KYC  
❌ Native mobile apps  
❌ Advanced anti-fraud ML  
❌ Tournaments/leaderboards  

---

## 🎯 Key Insights

1. **Authoritative Engine:** The game engine is the single source of truth — clients only render, never compute outcomes. This prevents manipulation and guarantees fairness.

2. **Deterministic Fairness:** Uses server-seed + daily seed for provably fair rounds. Players can verify outcomes.

3. **Atomic Settlement:** Database RPCs ensure wallet updates are atomic — no race conditions or inconsistencies.

4. **Monorepo Architecture:** Shared code (`@invest254/shared`) ensures consistency across engine, API, and frontend.

5. **Real-Money Compliance:** Requires gaming licence, KYC/AML, tax handling, and responsible gaming controls.

6. **M-Pesa Integration:** Daraja API handles deposits (STK push) and withdrawals (B2C) for Kenyan market.

7. **Affiliate Revenue Model:** 20% revenue-share on referred player net losses — incentivizes marketers to drive quality players.

8. **Scalability:** Stateless engine + Redis for round state + Postgres for durability = horizontally scalable.

---

## ⚠️ Disclaimer

> **Invest254 is a real-money gambling product.** Operation requires a valid gaming licence and adherence to KYC/AML, responsible-gaming, tax (excise/withholding) and advertising rules in every jurisdiction served. See [Security & Compliance](docs/14-security-compliance.md).

---

**Generated:** 2026-06-25  
**Repository:** https://github.com/mitasafi89-dot/invest254
