import client, { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry
export const metricsRegistry = new Registry();

// Add default metrics (event loop lag, heap, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

// ─── Reservation Metrics ──────────────────────────────────

export const reservationTotal = new Counter({
  name: 'irctc_reservations_total',
  help: 'Total number of reservation attempts',
  labelNames: ['status', 'train_id'] as const,
  registers: [metricsRegistry],
});

export const reservationDuration = new Histogram({
  name: 'irctc_reservation_duration_seconds',
  help: 'Duration of reservation requests in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

// ─── Queue & Inventory Metrics ────────────────────────────

export const queueDepth = new Gauge({
  name: 'irctc_queue_depth',
  help: 'Current depth of BullMQ queues',
  labelNames: ['queue_name'] as const,
  registers: [metricsRegistry],
});

export const activeHolds = new Gauge({
  name: 'irctc_active_holds',
  help: 'Number of currently active seat holds',
  registers: [metricsRegistry],
});

export const waitlistSize = new Gauge({
  name: 'irctc_waitlist_size',
  help: 'Current waitlist size per train',
  labelNames: ['train_id', 'journey_date', 'travel_class'] as const,
  registers: [metricsRegistry],
});

// ─── Admission Control Metrics ────────────────────────────

export const admissionQueueSize = new Gauge({
  name: 'irctc_admission_queue_size',
  help: 'Number of users currently in the waiting room queue',
  registers: [metricsRegistry],
});

export const admittedUsers = new Counter({
  name: 'irctc_admitted_users_total',
  help: 'Total number of users admitted from the waiting room',
  registers: [metricsRegistry],
});

// ─── Payment Metrics ──────────────────────────────────────

export const paymentExpiryTotal = new Counter({
  name: 'irctc_payment_expiry_total',
  help: 'Total number of payment expirations',
  registers: [metricsRegistry],
});

export const paymentSuccessTotal = new Counter({
  name: 'irctc_payment_success_total',
  help: 'Total number of successful payments',
  registers: [metricsRegistry],
});

// ─── HTTP Metrics ─────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name: 'irctc_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestTotal = new Counter({
  name: 'irctc_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});
