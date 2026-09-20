import { redis } from '../config/redis';
import { RedisKeys } from './inventory.service';

/**
 * Add a booking to the waitlist sorted set (FIFO by timestamp score).
 * Returns the 1-based position.
 */
export async function addToWaitlist(
  trainId: number,
  journeyDate: string,
  travelClass: string,
  bookingId: string
): Promise<number> {
  const key = RedisKeys.waitlist(trainId, journeyDate, travelClass);
  const score = Date.now();
  await redis.zadd(key, score, bookingId);
  const rank = await redis.zrank(key, bookingId);
  return (rank ?? 0) + 1;
}

/**
 * Get the current 1-based waitlist position for a booking (null if not listed).
 */
export async function getWaitlistPosition(
  trainId: number,
  journeyDate: string,
  travelClass: string,
  bookingId: string
): Promise<number | null> {
  const key = RedisKeys.waitlist(trainId, journeyDate, travelClass);
  const rank = await redis.zrank(key, bookingId);
  return rank === null ? null : rank + 1;
}

/**
 * Get the total number of waitlisted bookings.
 */
export async function getWaitlistCount(
  trainId: number,
  journeyDate: string,
  travelClass: string
): Promise<number> {
  const key = RedisKeys.waitlist(trainId, journeyDate, travelClass);
  return redis.zcard(key);
}

/**
 * Remove a booking from the waitlist (e.g. user cancels a waitlisted booking).
 */
export async function removeFromWaitlist(
  trainId: number,
  journeyDate: string,
  travelClass: string,
  bookingId: string
): Promise<number> {
  const key = RedisKeys.waitlist(trainId, journeyDate, travelClass);
  return redis.zrem(key, bookingId);
}