import { pool } from '../config/db';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { TrainSearchParams, SeatAvailability } from '../types/train.types';
import { TravelClass } from '../types/booking.types';

/**
 * Search trains by source/destination station with Redis caching.
 */
export async function searchTrains(params: TrainSearchParams) {
  const { source, destination, date } = params;
  const cacheKey = `train_search:${source || ''}:${destination || ''}:${date || ''}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Train search cache HIT');
    return JSON.parse(cached);
  }

  let query = `
    SELECT t.*, json_agg(json_build_object(
      'travelClass', tc.travel_class,
      'totalSeats', tc.total_seats,
      'baseFare', tc.base_fare,
      'tatkalFare', tc.tatkal_fare
    )) as classes
    FROM trains t
    LEFT JOIN train_classes tc ON tc.train_id = t.id
  `;

  const conditions: string[] = [];
  const values: string[] = [];

  if (source) {
    values.push(`%${source}%`);
    conditions.push(`(LOWER(t.source_station) LIKE LOWER($${values.length}) OR LOWER(t.source_code) = LOWER($${values.length}))`);
  }

  if (destination) {
    values.push(`%${destination}%`);
    conditions.push(`(LOWER(t.destination_station) LIKE LOWER($${values.length}) OR LOWER(t.destination_code) = LOWER($${values.length}))`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY t.id ORDER BY t.departure_time';

  const result = await pool.query(query, values);

  // Cache for 30 seconds
  await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', 30);

  return result.rows;
}

/**
 * Get seat availability for a specific train/date/class from Redis.
 * The Redis inventory key is the source of truth during active booking.
 */
export async function getSeatAvailability(
  trainId: number,
  journeyDate: string,
  travelClass?: TravelClass
): Promise<SeatAvailability[]> {
  // Get all classes for this train
  const classResult = await pool.query(
    'SELECT travel_class, total_seats FROM train_classes WHERE train_id = $1',
    [trainId]
  );

  const results: SeatAvailability[] = [];

  for (const row of classResult.rows) {
    if (travelClass && row.travel_class !== travelClass) continue;

    const inventoryKey = `inventory:${trainId}:${journeyDate}:${row.travel_class}`;
    const waitlistKey = `waitlist:${trainId}:${journeyDate}:${row.travel_class}`;

    // Get available seats from Redis (or initialize from DB if not set)
    let available = await redis.get(inventoryKey);
    if (available === null) {
      // Initialize Redis inventory from database
      await redis.set(inventoryKey, row.total_seats.toString());
      available = row.total_seats.toString();
    }

    const waitlistCount = await redis.zcard(waitlistKey);

    results.push({
      trainId,
      journeyDate,
      travelClass: row.travel_class,
      totalSeats: row.total_seats,
      availableSeats: parseInt(available ?? '0', 10),
      waitlistCount: waitlistCount || 0,
    });
  }

  return results;
}

/**
 * Get a single train by ID.
 */
export async function getTrainById(trainId: number) {
  const result = await pool.query(
    `SELECT t.*, json_agg(json_build_object(
      'travelClass', tc.travel_class,
      'totalSeats', tc.total_seats,
      'baseFare', tc.base_fare,
      'tatkalFare', tc.tatkal_fare
    )) as classes
    FROM trains t
    LEFT JOIN train_classes tc ON tc.train_id = t.id
    WHERE t.id = $1
    GROUP BY t.id`,
    [trainId]
  );

  return result.rows[0] || null;
}
