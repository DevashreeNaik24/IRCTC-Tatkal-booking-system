/**
 * Redis key schema for inventory management.
 * Centralizes all key naming to prevent key drift.
 */
export const RedisKeys = {
  /** Available seat count for a train/date/class */
  inventory: (trainId: number, date: string, travelClass: string) =>
    `inventory:${trainId}:${date}:${travelClass}`,

  /** Seat hold with TTL for a booking */
  hold: (bookingId: string) =>
    `hold:${bookingId}`,

  /** Track user's active hold per inventory (prevent double-booking) */
  userHold: (userId: number, trainId: number, date: string, travelClass: string) =>
    `user_hold:${userId}:inventory:${trainId}:${date}:${travelClass}`,

  /** Waitlist sorted set for a train/date/class */
  waitlist: (trainId: number, date: string, travelClass: string) =>
    `waitlist:${trainId}:${date}:${travelClass}`,

  /** Idempotency cache key */
  idempotency: (key: string) =>
    `idempotency:${key}`,

  /** Admission token */
  admissionToken: (token: string) =>
    `admission:token:${token}`,

  /** Admission queue (sorted set) */
  admissionQueue: (trainId: number, date: string, travelClass: string) =>
    `admission:queue:${trainId}:${date}:${travelClass}`,

  /** Global admission counter */
  admissionCounter: () =>
    'admission:active_count',

  /** Rate limit key */
  rateLimit: (type: string, id: string) =>
    `ratelimit:${type}:${id}`,

  /** Train search cache */
  trainSearch: (source: string, dest: string, date: string) =>
    `train_search:${source}:${dest}:${date}`,
};
