<div align="center">

# 🚆 IRCTC Tatkal Booking System

**A production-grade, high-concurrency train ticket booking engine built to handle the extreme surge of India's Tatkal window.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## 📖 Overview

IRCTC's Tatkal booking window processes **millions of concurrent requests** within a 2-hour window every day. This project is a **backend-first engineering simulation** of that system, designed to demonstrate how to build fault-tolerant, high-throughput booking infrastructure using modern Node.js patterns.

It tackles the hardest problems in ticket booking at scale: **race conditions, double-booking, payment timeouts, inventory oversell, and thundering-herd surges**.

---

## ✨ Key Features

### 🏗️ Architecture
- **Monorepo** managed with npm workspaces (`server/` + `client/`)
- **Event-driven architecture** using BullMQ job queues with dedicated workers
- **Real-time updates** via Socket.io with Redis pub/sub adapter
- **Structured logging** with Pino and **Prometheus metrics** via `prom-client`
- **Graceful shutdown** handling `SIGTERM`/`SIGINT` with orderly teardown

### 🔒 Concurrency & Integrity
- **Atomic seat reservation** using Redis Lua scripts — eliminates race conditions
- **Idempotency middleware** prevents duplicate submissions on retry
- **Optimistic locking** with PostgreSQL row-level versioning
- **Circuit breaker** (via Opossum) to isolate cascading failures

### 🚦 Traffic Control
- **Virtual Waiting Room** — users are queued and admitted in controlled batches during peak load
- **Admission Control** — token-gated access limits concurrent booking sessions
- **Rate Limiting** — per-IP and per-user rate limits with Redis-backed sliding windows
- **Back-Pressure** — monitors queue depth and sheds load before the system saturates
- **Bot Protection** — behavioral heuristics to detect and block automated booking bots

### 💳 Payment Pipeline
- **Hold-based reservation** — seats are held in Redis with configurable TTL while payment completes
- **Automatic expiry** — unreserved holds are released back to inventory
- **Payment checker** background service polls for timeout/failure and cleans up stale holds
- **Event-driven settlement** — `paymentSucceeded` / `paymentFailed` handlers update booking state

### 📊 Observability
- `/health` + `/ready` endpoints for orchestrator probes
- `/metrics` endpoint exporting Prometheus-format HTTP latency histograms and counters
- Structured JSON logging with request tracing (method, path, status, duration, IP)

---

## 🏛️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client (Vite)                              │
└─────────────┬──────────────────────────────────────┬────────────────┘
              │ REST API                             │ WebSocket
              ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Express Server                              │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │  Helmet   │ │Rate Limit │ │Bot Guard │ │ Admission Control    │  │
│  │  CORS     │ │Idempotent │ │Back-Pres.│ │ (Waiting Room)       │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Route Handlers                          │    │
│  │  Auth · Trains · Reservations · Payments · Bookings · Admin │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
└─────────────────────────────┼──────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
  ┌──────────────────┐ ┌───────────┐ ┌──────────────────┐
  │   PostgreSQL 16  │ │  Redis 7  │ │   BullMQ Workers  │
  │                  │ │           │ │                    │
  │  Users           │ │ Inventory │ │ Booking Worker     │
  │  Trains/Seats    │ │ Holds     │ │ Payment Worker     │
  │  Bookings        │ │ Sessions  │ │ Notification Wkr   │
  │  Payments        │ │ Rate Lim. │ └──────────────────┘
  │  Audit Log       │ │ Lua Scrpt │
  └──────────────────┘ └───────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js ≥ 18 |
| **Language** | TypeScript 5.8 |
| **API Framework** | Express 4 |
| **Database** | PostgreSQL 16 (via `pg`) |
| **Cache / Queue Broker** | Redis 7 (via `ioredis`) |
| **Job Queue** | BullMQ |
| **Realtime** | Socket.io + Redis Adapter |
| **Auth** | JWT (jsonwebtoken) + bcryptjs |
| **Validation** | Zod |
| **Resilience** | Opossum (Circuit Breaker) |
| **Observability** | Pino (logging) + prom-client (metrics) |
| **Security** | Helmet, CORS, rate limiting, bot protection |
| **Containerization** | Docker Compose |
| **Testing** | Vitest |
| **Linting** | ESLint + @typescript-eslint |

---

## 📁 Project Structure

```
├── docker-compose.yml          # PostgreSQL + Redis + Redis Commander
├── package.json                # Workspace root (npm workspaces)
│
├── server/
│   ├── src/
│   │   ├── server.ts           # Express app entry point
│   │   ├── config/             # DB, Redis, Socket.io, env, logger, metrics
│   │   ├── controllers/        # Route handlers (thin layer)
│   │   ├── services/           # Core business logic
│   │   │   ├── reservation.service.ts
│   │   │   ├── payment.service.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── waitingRoom.service.ts
│   │   │   ├── tatkal.service.ts
│   │   │   ├── circuitBreaker.ts
│   │   │   └── ...
│   │   ├── middleware/          # Auth, rate limiting, admission, idempotency
│   │   ├── events/             # Event bus, handlers, BullMQ workers
│   │   ├── routes/             # Express route definitions
│   │   ├── migrations/         # SQL schema migrations (001–005)
│   │   ├── seeds/              # Train seed data
│   │   ├── scripts/            # Redis Lua scripts (atomic ops)
│   │   ├── types/              # TypeScript type definitions
│   │   └── utils/              # Helpers (async handler, Lua loader, etc.)
│   └── package.json
│
└── client/
    └── package.json            # Frontend placeholder (Vite)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Docker** & **Docker Compose** (for PostgreSQL and Redis)
- **npm** ≥ 9

### 1. Clone the Repository

```bash
git clone https://github.com/DevashreeNaik24/IRCTC-Tatkal-booking-system.git
cd IRCTC-Tatkal-booking-system
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL 16, Redis 7, and Redis Commander
npm run docker:up
```

This spins up:
| Service | Port |
|---|---|
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| Redis Commander (GUI) | `localhost:8081` |

### 3. Configure Environment

```bash
cp .env.example .env
```

The defaults in `.env.example` are pre-configured to work with the Docker Compose services. Adjust as needed.

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Migrations & Seed Data

```bash
npm run db:setup
```

This runs all SQL migrations (users, trains, bookings, payments, audit_log) and seeds sample train data.

### 6. Start the Development Server

```bash
# Start both server and client in watch mode
npm run dev

# Or start only the server
npm run dev:server
```

The API will be available at **http://localhost:3000**.

---

## ⚙️ Environment Variables

All configuration is managed via environment variables. See [`.env.example`](.env.example) for the full list:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://irctc:irctc_secret@localhost:5432/irctc_tatkal` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | Secret for JWT signing | *(must be changed in production)* |
| `TATKAL_OPEN_TIME` | Tatkal window start (HH:mm) | `10:00` |
| `TATKAL_CLOSE_TIME` | Tatkal window end (HH:mm) | `12:00` |
| `PAYMENT_HOLD_TTL_SECONDS` | Seat hold duration during payment | `120` |
| `ADMISSION_BATCH_SIZE` | Users admitted per batch from waiting room | `50` |
| `MAX_CONCURRENT_BOOKINGS` | Max simultaneous active bookings | `200` |
| `RATE_LIMIT_PER_IP` | Requests per IP per window | `60` |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT |

### Trains
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/trains` | List available trains |
| `GET` | `/api/trains/:id` | Get train details with seat availability |

### Booking Flow
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/waiting-room/join` | Join the virtual waiting room |
| `GET` | `/api/waiting-room/status` | Check waiting room position |
| `POST` | `/api/reservations` | Reserve a seat (requires admission token) |
| `POST` | `/api/payments` | Initiate payment for a reservation |
| `GET` | `/api/bookings` | View booking history |
| `GET` | `/api/bookings/:id` | Get booking details |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/dashboard` | System metrics and stats |

### Health & Monitoring
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Readiness check (DB + Redis) |
| `GET` | `/metrics` | Prometheus metrics |

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch -w server

# Integration tests
npm run test:integration -w server
```

---

## 🐳 Docker Commands

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down

# View logs
npm run docker:logs
```

---

## 🔑 How the Tatkal Flow Works

```
1. User joins the WAITING ROOM
   └─→ Queued in Redis sorted set by arrival time

2. ADMISSION CONTROL admits users in batches
   └─→ User receives a time-limited admission token

3. User RESERVES a seat (with admission token)
   └─→ Lua script atomically: check inventory → decrement → create hold
   └─→ Seat is held for PAYMENT_HOLD_TTL_SECONDS

4. User initiates PAYMENT
   └─→ Payment job queued in BullMQ
   └─→ On success: booking confirmed, seat permanently allocated
   └─→ On failure/timeout: hold expires, seat released back to inventory

5. Real-time UPDATES pushed via Socket.io
   └─→ Booking confirmation, seat availability changes, queue position
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

Please make sure your code passes linting and tests before submitting:

```bash
npm run lint
npm test
```

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [Devashree Naik](https://github.com/DevashreeNaik24)**

If this project helped you, consider giving it a ⭐

</div>
