# Invest254 Deployment Troubleshooting Guide

## Common Issues & Solutions

---

## 1. Deployment Fails: "Could not detect runtime or Dockerfile"

### Problem
```
Error: Could not detect runtime or Dockerfile
```

### Solution
✅ **FIXED** — I've created the Dockerfile for you.

Just run:
```bash
fly deploy
```

---

## 2. Build Fails: "npm: command not found"

### Problem
```
/bin/sh: npm: command not found
```

### Cause
Node.js not installed in Docker image.

### Solution
The Dockerfile already includes Node.js 20. If you're using a custom Dockerfile:

```dockerfile
FROM node:20-alpine  # ✅ Correct
# NOT: FROM alpine:latest  # ❌ Wrong
```

---

## 3. App Starts but Crashes: "Cannot find module @invest254/shared"

### Problem
```
Error: Cannot find module '@invest254/shared'
```

### Cause
Dependencies not installed or monorepo not set up correctly.

### Solution
```bash
# Verify package.json has workspaces
cat package.json | grep -A 5 "workspaces"

# Should output:
# "workspaces": [
#   "packages/*",
#   "apps/*"
# ]

# Rebuild locally first
npm install
npm run typecheck

# Then deploy
fly deploy --no-cache
```

---

## 4. WebSocket Connection Fails

### Problem
```
WebSocket connection failed
Error: 1006 Abnormal Closure
```

### Cause
- Port 8080 not exposed
- Firewall blocking WebSocket
- Wrong URL in frontend

### Solution

**Check Fly.io configuration:**
```bash
# Verify ports are exposed
cat fly.toml | grep -A 10 "services"

# Should include:
# [[services]]
#   protocol = "tcp"
#   internal_port = 8080
```

**Test WebSocket connection:**
```bash
# Install wscat
npm install -g wscat

# Test connection
wscat -c wss://invest254-backend.fly.dev

# Should connect successfully
```

**Check frontend URL:**
```bash
# Verify environment variables
fly secrets list

# Should include NEXT_PUBLIC_WS_URL
# pointing to: wss://invest254-backend.fly.dev
```

---

## 5. Database Connection Fails

### Problem
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

### Cause
- DATABASE_URL not set
- Supabase connection string incorrect
- Database not accessible

### Solution

**Set DATABASE_URL:**
```bash
# Get connection string from Supabase
# Dashboard → Settings → Database → Connection string

# Set in Fly.io
fly secrets set DATABASE_URL="postgresql://user:pass@host:5432/db"

# Verify it's set
fly secrets list

# Test connection
fly ssh console
# Inside console:
psql $DATABASE_URL -c "SELECT 1"
```

**Common issues:**
- ❌ Missing `?sslmode=require` at end of URL
- ❌ Wrong password
- ❌ IP not whitelisted in Supabase

---

## 6. Redis Connection Fails

### Problem
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

### Cause
- REDIS_URL not set
- Upstash connection string incorrect
- Redis not accessible

### Solution

**Set REDIS_URL:**
```bash
# Get connection string from Upstash
# Console → Database → Copy Redis URL

# Set in Fly.io
fly secrets set REDIS_URL="redis://default:password@host:port"

# Verify it's set
fly secrets list

# Test connection
fly ssh console
# Inside console:
redis-cli -u $REDIS_URL ping
# Should respond: PONG
```

---

## 7. High Memory Usage

### Problem
```
Machine running out of memory
OOM Killer triggered
```

### Cause
- Too many connections
- Memory leak in code
- Insufficient machine size

### Solution

**Check memory usage:**
```bash
fly metrics
```

**Increase machine size:**
```bash
# Current: shared-cpu-1x (512MB)
# Upgrade to: shared-cpu-2x (1GB)

fly scale vm shared-cpu-2x

# Or dedicated CPU
fly scale vm dedicated-cpu-1x
```

**Reduce connections:**
```bash
# In fly.toml, reduce concurrency:
[http_service.concurrency]
  hard_limit = 500  # Was 1000
  soft_limit = 400  # Was 800
```

---

## 8. High CPU Usage

### Problem
```
CPU constantly at 100%
App slow or unresponsive
```

### Cause
- Inefficient code
- Too many concurrent connections
- Database queries not optimized

### Solution

**Check logs for slow operations:**
```bash
fly logs | grep "duration"
```

**Optimize database queries:**
```bash
# In Supabase dashboard
Dashboard → Logs → Slow queries
```

**Add caching:**
```bash
# Use Redis for frequently accessed data
# Example: cache game config for 1 hour
```

**Scale horizontally:**
```bash
# Add more machines
fly scale count 2  # or 3, 4, etc.
```

---

## 9. Deployment Timeout

### Problem
```
Deployment timed out after 30 minutes
```

### Cause
- Build taking too long
- Docker image too large
- Network issues

### Solution

**Reduce build time:**
```bash
# Use .dockerignore to exclude unnecessary files
cat .dockerignore

# Should exclude: node_modules, .git, docs, etc.
```

**Reduce image size:**
```bash
# Use alpine images (smaller)
FROM node:20-alpine  # ✅ ~150MB
# NOT: FROM node:20  # ❌ ~900MB
```

**Rebuild without cache:**
```bash
fly deploy --no-cache
```

---

## 10. Secrets Not Available in App

### Problem
```
process.env.DATABASE_URL is undefined
```

### Cause
- Secrets not set
- Secrets not redeployed
- Wrong secret name

### Solution

**Set secrets:**
```bash
fly secrets set DATABASE_URL="..."
fly secrets set REDIS_URL="..."
```

**Verify secrets are set:**
```bash
fly secrets list
```

**Redeploy to apply secrets:**
```bash
fly deploy
```

**Check in running app:**
```bash
fly ssh console
# Inside console:
echo $DATABASE_URL
```

---

## 11. Frontend Can't Connect to Backend

### Problem
```
CORS error
Failed to fetch
```

### Cause
- Wrong API URL
- CORS not configured
- Backend not running

### Solution

**Check frontend environment variables:**
```bash
# In Cloudflare Pages dashboard
Settings → Environment variables

# Should have:
NEXT_PUBLIC_API_BASE_URL=https://invest254-backend.fly.dev/api/v1
NEXT_PUBLIC_WS_URL=wss://invest254-backend.fly.dev
```

**Check backend CORS configuration:**
```bash
# In apps/api/src/app.ts
# Should allow frontend origin

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*'
}))
```

**Test backend is running:**
```bash
curl https://invest254-backend.fly.dev/health
# Should return 200 OK
```

---

## 12. M-Pesa Integration Not Working

### Problem
```
M-Pesa callback not received
STK push not showing
```

### Cause
- Credentials not set
- Callback URL not configured
- Using sandbox instead of production

### Solution

**Set M-Pesa credentials:**
```bash
fly secrets set \
  MPESA_CONSUMER_KEY="your-key" \
  MPESA_CONSUMER_SECRET="your-secret" \
  MPESA_ENV="sandbox"  # or "production"
```

**Configure callback URL in Daraja:**
1. Go to https://developer.safaricom.co.ke
2. Select your app
3. Set callback URL to: `https://invest254-backend.fly.dev/api/v1/payments/mpesa/callback`

**Test in sandbox first:**
```bash
# Use Daraja sandbox credentials
# Test with sandbox phone numbers
# Verify callback is received
```

---

## 13. Local Docker Compose Fails

### Problem
```
docker-compose up fails
Services won't start
```

### Cause
- Docker not installed
- Port already in use
- Volume permissions

### Solution

**Install Docker:**
```bash
# macOS
brew install docker

# Linux
sudo apt-get install docker.io docker-compose

# Windows
# Download Docker Desktop
```

**Check ports are available:**
```bash
# Kill process using port 3000
lsof -i :3000
kill -9 <PID>

# Or use different ports in docker-compose.yml
```

**Fix volume permissions:**
```bash
# macOS/Linux
sudo chown -R $USER:$USER .

# Or run with sudo
sudo docker-compose up
```

---

## 14. Database Migrations Not Applied

### Problem
```
Table not found
Schema mismatch
```

### Cause
- Migrations not run
- Wrong database
- Migrations failed silently

### Solution

**Run migrations manually:**
```bash
# Connect to Supabase
psql $DATABASE_URL

# Run migration files from packages/db/migrations
# In order: 0001, 0002, 0003, etc.

\i packages/db/migrations/0001_helpers.sql
\i packages/db/migrations/0002_identity_roles.sql
# ... etc
```

**Or use a migration tool:**
```bash
# Install Flyway or similar
# Configure to run migrations on deploy
```

---

## 15. Performance Issues

### Problem
```
App is slow
Ticks not streaming smoothly
Settlements taking too long
```

### Cause
- Database queries slow
- Redis not caching
- Network latency
- Too many concurrent connections

### Solution

**Profile performance:**
```bash
# Check slow queries
fly logs | grep "duration"

# Check Redis hit rate
fly ssh console
redis-cli -u $REDIS_URL INFO stats
```

**Optimize database:**
```bash
# Add indexes
CREATE INDEX idx_user_id ON positions(user_id);

# Use connection pooling
# Supabase already does this
```

**Optimize code:**
```bash
# Cache frequently accessed data
// Example: cache game config
const config = await redis.get('game:config');
if (!config) {
  config = await db.query('SELECT * FROM game_config');
  await redis.setex('game:config', 3600, JSON.stringify(config));
}
```

**Add more machines:**
```bash
fly scale count 3
```

---

## Getting Help

### Check Logs

```bash
# Real-time logs
fly logs

# Last 100 lines
fly logs --lines 100

# Specific time range
fly logs --since 1h
```

### SSH into Machine

```bash
# Connect to machine
fly ssh console

# Inside machine:
ps aux                    # See running processes
env | grep DATABASE       # Check environment variables
npm -w @invest254/api start  # Manually start service
```

### Check Status

```bash
# Machine status
fly status

# Detailed info
fly info

# Metrics
fly metrics
```

### Restart Machine

```bash
# Restart all machines
fly restart

# Restart specific machine
fly machines restart <machine-id>
```

### Redeploy

```bash
# Full redeploy
fly deploy

# Without cache
fly deploy --no-cache

# Force new build
fly deploy --build-only
```

---

## Still Stuck?

1. **Check logs:** `fly logs`
2. **SSH in:** `fly ssh console`
3. **Check status:** `fly status`
4. **Redeploy:** `fly deploy --no-cache`
5. **Ask for help:**
   - Fly.io Docs: https://fly.io/docs
   - Fly.io Community: https://community.fly.io
   - GitHub Issues: https://github.com/mitasafi89-dot/invest254/issues

---

**Most issues are fixed by: `fly deploy --no-cache`**
