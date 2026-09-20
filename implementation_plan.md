# Production-Grade IRCTC Tatkal Booking System

Building an improved, production-oriented IRCTC Tatkal-style booking system inspired by [sagarkapure217-sketch/irctc-tatkal-system](https://github.com/sagarkapure217-sketch/irctc-tatkal-system). The system will handle flash-crowd/burst traffic (millions of users in a 1–2 minute window), highly contended inventory, fairness requirements, payment timeouts, and downstream protection.

## User Review Required

> [!IMPORTANT]
> **Scale of this project**: This is a ~60+ file, multi-service system. The implementation plan is broken into 9 phases. I recommend executing **Phases 1–4 first** (core backend + inventory + admission control + event-driven payment), then pausing for review before continuing with observability, caching, frontend, and testing phases.

> [!WARNING]
> **ZIP files note**: The `claude-god-mode-main.zip` and `crewAI-main.zip` files contain agent/workflow patterns for Claude Code and Python-based multi-agent orchestration respectively — they are **not directly integrable** into this Node.js/TypeScript project as dependencies. I've incorporated their *architectural patterns* (adversarial testing, multi-perspective review, constitutional review principles) into the **Testing & Verification** phase instead.

> [!IMPORTANT]
> **Docker Desktop** is required for PostgreSQL and Redis. Please confirm it's installed and running.

## Open Questions

> [!IMPORTANT]
> 1. **Payment Gateway**: Should I use **Razorpay test mode** (more realistic for Indian context) or **Stripe test mode** (better docs, easier setup)? Or start with a mock webhook service?
> 2. **TypeScript or JavaScript?**: The reference project uses JS. Your spec says TypeScript. I'll proceed with **TypeScript** unless you say otherwise.
> 3. **Monorepo structure**: Should the frontend and backend live in the same repo (as in the reference) or separate packages within a monorepo (using npm workspaces)?

---

## Proposed Changes

The project structure builds on the reference but significantly expands it:

```
IRCTC BOOKING SYSTEM/
├── docker-compose.yml              # PostgreSQL + Redis + Redis Commander
├── docker-compose.prod.yml         # Production multi-replica setup
├── .env.example
├── .gitignore
├── README.md
├── package.json                    # Root workspace config
│
├── server/                         # Node.js + Express + TypeScript backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── server.ts               # Express + Socket.io entry point
│   │   ├── config/
│   │   │   ├── db.ts               # PostgreSQL pool (pg)
│   │   │   ├── redis.ts            # ioredis client + cluster support
│   │   │   ├── socket.ts           # Socket.io init + Redis adapter
│   │   │   ├── env.ts              # Validated env (zod)
│   │   │   ├── logger.ts           # Pino structured JSON logger
│   │   │   └── metrics.ts          # Prometheus client setup
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT verification
│   │   │   ├── idempotency.ts      # Idempotency key middleware
│   │   │   ├── rateLimiter.ts      # Per-user/IP/global rate limiting
│   │   │   ├── admissionControl.ts # Virtual waiting room gate
│   │   │   ├── backPressure.ts     # Queue depth / load shedding
│   │   │   └── botProtection.ts    # Honeypot, timing checks
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── train.controller.ts
│   │   │   ├── reservation.controller.ts
│   │   │   ├── payment.controller.ts
│   │   │   ├── booking.controller.ts
│   │   │   ├── waitingRoom.controller.ts
│   │   │   └── admin.controller.ts
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── train.service.ts
│   │   │   ├── reservation.service.ts    # Lua execution + state machine
│   │   │   ├── inventory.service.ts      # Redis key builder + cache
│   │   │   ├── payment.service.ts        # Gateway integration + webhooks
│   │   │   ├── payment.checker.ts        # TTL expiry → keyspace notifications
│   │   │   ├── tatkal.service.ts         # Window gating logic
│   │   │   ├── booking.service.ts        # Query bookings
│   │   │   ├── waitingRoom.service.ts    # Token-bucket admission control
│   │   │   ├── waitlist.service.ts       # Sorted set + auto-promotion
│   │   │   ├── notification.service.ts   # Email/SMS stubs
│   │   │   └── circuitBreaker.ts         # Opossum wrapper
│   │   │
│   │   ├── events/
│   │   │   ├── eventBus.ts          # BullMQ-based event bus
│   │   │   ├── events.ts           # Event type definitions
│   │   │   ├── handlers/
│   │   │   │   ├── seatReserved.handler.ts
│   │   │   │   ├── paymentSucceeded.handler.ts
│   │   │   │   ├── paymentFailed.handler.ts
│   │   │   │   ├── bookingConfirmed.handler.ts
│   │   │   │   ├── seatReleased.handler.ts
│   │   │   │   └── waitlistPromoted.handler.ts
│   │   │   └── workers/
│   │   │       ├── booking.worker.ts       # Persist to PostgreSQL
│   │   │       ├── payment.worker.ts       # Payment processing
│   │   │       └── notification.worker.ts  # Send notifications
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── train.routes.ts
│   │   │   ├── reservation.routes.ts
│   │   │   ├── payment.routes.ts
│   │   │   ├── booking.routes.ts
│   │   │   ├── waitingRoom.routes.ts
│   │   │   ├── admin.routes.ts
│   │   │   └── health.routes.ts
│   │   │
│   │   ├── scripts/
│   │   │   ├── reserveSeat.lua          # Atomic check-and-decrement
│   │   │   ├── releaseSeat.lua          # Atomic release + waitlist promote
│   │   │   └── admitUser.lua            # Token bucket admission
│   │   │
│   │   ├── migrations/
│   │   │   ├── 001_users.sql
│   │   │   ├── 002_trains.sql
│   │   │   ├── 003_bookings.sql
│   │   │   ├── 004_payments.sql
│   │   │   └── 005_audit_log.sql
│   │   │
│   │   ├── seeds/
│   │   │   └── trains.seed.ts
│   │   │
│   │   └── types/
│   │       ├── booking.types.ts
│   │       ├── train.types.ts
│   │       └── common.types.ts
│   │
│   └── tests/
│       ├── unit/
│       │   ├── reservation.test.ts
│       │   ├── waitlist.test.ts
│       │   └── admissionControl.test.ts
│       └── integration/
│           ├── booking-flow.test.ts
│           └── payment-expiry.test.ts
│
├── client/                          # React + Vite + TypeScript frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css                # Design system tokens
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Navbar.tsx
│       │   │   ├── Footer.tsx
│       │   │   └── Layout.tsx
│       │   ├── booking/
│       │   │   ├── TrainSearch.tsx
│       │   │   ├── SeatAvailability.tsx
│       │   │   ├── BookingForm.tsx
│       │   │   ├── PaymentTimer.tsx
│       │   │   └── BookingCard.tsx
│       │   ├── waitingRoom/
│       │   │   ├── WaitingRoom.tsx
│       │   │   ├── QueuePosition.tsx
│       │   │   └── ProgressIndicator.tsx
│       │   ├── realtime/
│       │   │   ├── LiveSeatCounter.tsx
│       │   │   └── EventLog.tsx
│       │   └── ui/
│       │       ├── Button.tsx
│       │       ├── Input.tsx
│       │       ├── Card.tsx
│       │       ├── Badge.tsx
│       │       ├── Countdown.tsx
│       │       ├── Toast.tsx
│       │       └── Spinner.tsx
│       │
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── SignupPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── BookingPage.tsx
│       │   ├── MyBookingsPage.tsx
│       │   └── WaitingRoomPage.tsx
│       │
│       ├── hooks/
│       │   ├── useSocket.ts
│       │   ├── useAuth.ts
│       │   ├── useCountdown.ts
│       │   └── useWaitingRoom.ts
│       │
│       ├── services/
│       │   ├── api.ts               # Axios + JWT interceptor
│       │   └── socket.ts            # Socket.io client singleton
│       │
│       ├── stores/
│       │   └── authStore.ts         # Zustand auth state
│       │
│       └── types/
│           └── index.ts
│
├── loadtest/                        # k6 load testing scripts
│   ├── tatkal-stampede.js
│   ├── payment-timeout.js
│   └── config.js
│
└── monitoring/                      # Observability stack
    ├── prometheus.yml
    ├── grafana/
    │   └── dashboards/
    │       └── irctc-overview.json
    └── docker-compose.monitoring.yml
```

---

### Phase 1: Project Scaffolding & Core Infrastructure

#### [NEW] Root configs
- `package.json` — npm workspaces monorepo (`server/`, `client/`)
- `docker-compose.yml` — PostgreSQL 16 + Redis 7 + Redis Commander
- `.env.example` — All env vars documented
- `.gitignore` — node_modules, dist, .env, coverage
- `README.md` — Setup guide + architecture diagram

#### [NEW] `server/` — Backend foundation
- Express + TypeScript + Pino logger
- PostgreSQL pool via `pg` with connection pooling
- ioredis client with reconnect strategy
- Socket.io server with Redis adapter
- Zod-validated environment config
- JWT auth middleware (access + refresh tokens)
- Database migrations (users, trains, bookings, payments, audit_log)
- Seed data: 10 popular train routes with realistic data

---

### Phase 2: Hardened Inventory Layer (Highest Priority)

#### [NEW] `server/src/scripts/reserveSeat.lua`
Enhanced Lua script with state machine:
```
Available → Held (TTL) → Confirmed | Released | Waitlisted
```
- Atomic check-decrement-hold in one Lua call
- Returns structured response: `{status, remainingSeats, holdExpiry}`
- Validates against double-hold for same user+train

#### [NEW] `server/src/scripts/releaseSeat.lua`
Atomic release + waitlist promotion:
- `ZPOPMIN` oldest waitlisted entry
- Re-decrement inventory
- Create new hold key
- All in one atomic Lua script (no race window)

#### [NEW] `server/src/services/reservation.service.ts`
- Loads and caches Lua scripts via `SCRIPT LOAD`
- Clear state machine: `AVAILABLE → HELD → PENDING_PAYMENT → CONFIRMED | EXPIRED | CANCELLED`
- Metrics: reservation success/fail/waitlist rate counters

#### [NEW] `server/src/services/inventory.service.ts`
- Redis key schema: `inventory:{trainId}:{date}:{class}`
- Hold keys: `hold:{bookingId}` with configurable TTL
- Waitlist keys: `waitlist:{trainId}:{date}:{class}`

---

### Phase 3: Admission Control / Virtual Waiting Room

This is the **highest-impact production addition** — prevents the flash crowd from overwhelming the booking path.

#### [NEW] `server/src/scripts/admitUser.lua`
Redis token-bucket implementation:
- Maintains a counter of currently admitted users
- Admits in controlled batches (configurable: e.g., 100 at a time)
- Issues short-lived admission tokens (Redis key with TTL)
- Fair queue: FIFO ordering via sorted set with timestamp score

#### [NEW] `server/src/services/waitingRoom.service.ts`
- `enterQueue(userId, trainId)` — Place user in waiting queue
- `checkPosition(userId)` — Return queue position + estimated wait
- `admitBatch()` — Promote next N users from queue → admitted
- `validateToken(token)` — Check if user has valid admission token
- Periodic batch admission via `setInterval` or BullMQ repeatable job

#### [NEW] `server/src/middleware/admissionControl.ts`
- Intercepts reservation endpoint
- Validates admission token in request header
- Rejects users without valid tokens (HTTP 429 with queue position)
- Bypasses for admin endpoints

#### [NEW] `server/src/controllers/waitingRoom.controller.ts`
- `POST /waiting-room/enter` — Join the queue
- `GET /waiting-room/status` — Check position + ETA
- `GET /waiting-room/token` — Poll for admission token

---

### Phase 4: Event-Driven Payment & Release Path

#### [NEW] `server/src/events/events.ts`
Event type definitions:
```typescript
enum BookingEvent {
  BOOKING_ATTEMPTED = 'booking.attempted',
  SEAT_RESERVED = 'seat.reserved',
  PAYMENT_INITIATED = 'payment.initiated',
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_EXPIRED = 'payment.expired',
  BOOKING_CONFIRMED = 'booking.confirmed',
  SEAT_RELEASED = 'seat.released',
  WAITLIST_PROMOTED = 'waitlist.promoted',
}
```

#### [NEW] `server/src/events/eventBus.ts`
BullMQ-based event bus:
- Named queues per event type for isolation
- Retry policies with exponential backoff
- Dead letter queue for failed events
- Event replay capability

#### [NEW] Event handlers (`server/src/events/handlers/`)
Each handler is idempotent and replayable:
- `seatReserved` → Persist booking row + emit `payment.initiated`
- `paymentSucceeded` → Update status + delete hold + emit `booking.confirmed`
- `paymentFailed` → Release seat + emit `seat.released`
- `seatReleased` → Increment inventory + check waitlist + emit Socket update
- `waitlistPromoted` → Create new hold + notify user

#### [NEW] `server/src/services/payment.service.ts`
- Mock payment gateway with webhook simulation
- Idempotent confirmation via payment reference ID
- Circuit breaker around external payment calls (opossum)

#### [NEW] `server/src/services/payment.checker.ts`
Upgraded from polling to hybrid approach:
- Primary: Redis keyspace notifications (`__keyevent@0__:expired`)
- Fallback: 10-second polling loop for missed events
- On expiry: Atomic release + waitlist promotion via Lua

---

### Phase 5: Observability, Back-Pressure & Resilience

#### [NEW] `server/src/config/metrics.ts`
Prometheus metrics:
- `irctc_reservations_total` (counter, labels: status, trainId)
- `irctc_reservation_duration_seconds` (histogram)
- `irctc_queue_depth` (gauge, per queue)
- `irctc_active_holds` (gauge)
- `irctc_waitlist_size` (gauge, per train)
- `irctc_admission_queue_size` (gauge)
- `irctc_payment_expiry_total` (counter)

#### [NEW] `server/src/config/logger.ts`
Pino structured JSON logger with:
- Request ID correlation
- User ID context
- Booking ID context
- Log levels: trace, debug, info, warn, error, fatal

#### [NEW] `server/src/middleware/rateLimiter.ts`
Multi-tier rate limiting:
- Per-IP: 60 req/min (sliding window via Redis)
- Per-user: 5 reservation attempts/min
- Global: Back-pressure when queue depth > threshold

#### [NEW] `server/src/middleware/backPressure.ts`
Load shedding middleware:
- Monitors Redis queue depth, connection count, memory usage
- Returns HTTP 503 with `Retry-After` header when overloaded
- Graceful degradation (disable non-critical features first)

#### [NEW] `server/src/middleware/botProtection.ts`
Lightweight anti-bot measures:
- Honeypot hidden form fields
- Minimum time-to-submit check (reject <2s form submissions)
- Request fingerprinting (user-agent, accept-language patterns)
- Optional CAPTCHA trigger only on suspicious traffic patterns

#### [NEW] `server/src/services/circuitBreaker.ts`
Opossum circuit breaker wrapper:
- Around payment gateway calls
- Around PostgreSQL write path
- Configurable thresholds, timeout, reset interval
- Emits metrics on state transitions

#### [NEW] Monitoring stack (`monitoring/`)
- `prometheus.yml` — Scrape config for API server
- Grafana dashboard JSON — Pre-built IRCTC overview dashboard
- `docker-compose.monitoring.yml` — Prometheus + Grafana containers

---

### Phase 6: Caching & Read Path Optimization

#### Updates to `server/src/services/train.service.ts`
- Cache train schedules in Redis with 1-hour TTL
- Cache search results with 30-second TTL
- Soft availability snapshots (read from Redis counter, not DB)
- Cache invalidation on inventory changes via pub/sub

#### Updates to `server/src/services/inventory.service.ts`
- Serve availability reads entirely from Redis (no DB hit)
- Only final reservation mutates authoritative counter
- Background sync: periodic reconciliation with PostgreSQL

---

### Phase 7: Frontend & UX (React + Vite + TypeScript)

#### [NEW] Design System (`client/src/index.css`)
Premium dark-theme design inspired by modern fintech apps:
- Custom CSS properties for colors, spacing, typography
- Inter/Outfit font from Google Fonts
- Glassmorphism cards with backdrop-filter
- Smooth gradients and micro-animations
- Mobile-first responsive breakpoints

#### [NEW] Pages
- **LoginPage / SignupPage** — Animated forms with validation
- **DashboardPage** — Train search with live seat counts
- **WaitingRoomPage** — Queue position, progress bar, estimated wait time
- **BookingPage** — Seat selection, hold timer, payment flow
- **MyBookingsPage** — Booking history with status badges and live updates

#### [NEW] Key Components
- **WaitingRoom** — Animated queue visualization, position counter, progress indicator
- **PaymentTimer** — Circular countdown with urgency states (green → yellow → red)
- **LiveSeatCounter** — Socket.io powered, animates on change
- **EventLog** — Scrolling log of real-time seat events
- **TrainSearch** — Autocomplete station search, date picker, class selector

#### [NEW] Hooks
- `useSocket` — Socket.io connection management + auto-reconnect
- `useAuth` — JWT token management + refresh logic
- `useCountdown` — Payment timer with visual urgency states
- `useWaitingRoom` — Queue position polling + admission token check

---

### Phase 8: Load Testing

#### [NEW] `loadtest/tatkal-stampede.js` (k6)
Simulates the Tatkal 10 AM stampede:
- 1000+ virtual users arriving in a 30-second burst
- All targeting the same train/date/class
- Includes login → wait room → reserve → pay flow
- 20% abandon payment (test expiry + waitlist promotion)
- 10% retry with same idempotency key
- Measures: p50/p95/p99 latency, throughput, error rate, overselling (must be 0)

#### [NEW] `loadtest/payment-timeout.js` (k6)
- Tests payment expiry under load
- Verifies waitlist FIFO ordering under concurrent promotions
- Checks seat count consistency (no phantom seats)

---

### Phase 9: CI/CD & Production Readiness

#### [NEW] `.github/workflows/ci.yml`
- Lint + type-check
- Unit tests
- Integration tests (with Docker Compose services)
- Build verification

#### [NEW] Health & graceful shutdown
- `GET /health` — Liveness probe (HTTP 200)
- `GET /ready` — Readiness probe (checks Redis + PG connectivity)
- Graceful shutdown: drain connections, finish in-flight requests, close queues

---

## Verification Plan

### Automated Tests
```bash
# Unit tests
cd server && npm test

# Integration tests (requires Docker)
docker-compose up -d
cd server && npm run test:integration

# Type checking
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit

# Lint
npm run lint

# Load test (k6 must be installed)
k6 run loadtest/tatkal-stampede.js
```

### Manual Verification
1. **Boot the full stack** via `docker-compose up` and verify all services connect
2. **Register → Login → Search → Book** flow works end-to-end
3. **Waiting room** activates when concurrent users exceed threshold
4. **Let payment expire** and verify seat returns to pool + waitlisted user gets promoted
5. **Multiple browser tabs** show real-time seat updates via Socket.io
6. **Run k6 stampede test** and verify:
   - Zero overselling (seats never go negative)
   - Waitlist FIFO ordering is maintained
   - p99 latency < 500ms for reservation endpoint
   - All idempotency replays return identical responses
7. **Prometheus + Grafana** show live metrics during load test
