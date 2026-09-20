import { pool } from '../config/db';
import { logger } from '../config/logger';

/**
 * Seed data: 10 popular Indian train routes with per-class seat counts and
 * base/Tatkal fares. Idempotent — `ON CONFLICT DO NOTHING` lets this be
 * re-run safely.
 *
 * Run with: npm run seed
 */

interface SeedTrain {
  trainNumber: string;
  trainName: string;
  sourceStation: string;
  sourceCode: string;
  destinationStation: string;
  destinationCode: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  classes: { travelClass: string; totalSeats: number; baseFare: number; tatkalFare: number }[];
}

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const trains: SeedTrain[] = [
  {
    trainNumber: '12002',
    trainName: 'New Delhi - Bhopal Shatabdi Express',
    sourceStation: 'New Delhi',
    sourceCode: 'NDLS',
    destinationStation: 'Bhopal',
    destinationCode: 'BPL',
    departureTime: '06:30',
    arrivalTime: '11:15',
    durationMinutes: 285,
    classes: [
      { travelClass: 'CC', totalSeats: 72, baseFare: 1055, tatkalFare: 1355 },
      { travelClass: '2S', totalSeats: 96, baseFare: 420, tatkalFare: 590 },
    ],
  },
  {
    trainNumber: '12951',
    trainName: 'Mumbai Central - New Delhi Rajdhani Express',
    sourceStation: 'Mumbai Central',
    sourceCode: 'MMCT',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '17:00',
    arrivalTime: '08:25',
    durationMinutes: 925,
    classes: [
      { travelClass: 'AC1', totalSeats: 24, baseFare: 5220, tatkalFare: 5720 },
      { travelClass: 'AC2', totalSeats: 46, baseFare: 2980, tatkalFare: 3280 },
      { travelClass: 'AC3', totalSeats: 64, baseFare: 1965, tatkalFare: 2165 },
    ],
  },
  {
    trainNumber: '12301',
    trainName: 'Howrah - New Delhi Rajdhani Express',
    sourceStation: 'Howrah',
    sourceCode: 'HWH',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '16:55',
    arrivalTime: '09:45',
    durationMinutes: 1010,
    classes: [
      { travelClass: 'AC1', totalSeats: 24, baseFare: 4920, tatkalFare: 5420 },
      { travelClass: 'AC2', totalSeats: 46, baseFare: 2810, tatkalFare: 3110 },
      { travelClass: 'AC3', totalSeats: 64, baseFare: 1855, tatkalFare: 2055 },
    ],
  },
  {
    trainNumber: '12627',
    trainName: 'Karnataka Express',
    sourceStation: 'Bengaluru',
    sourceCode: 'SBC',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '20:00',
    arrivalTime: '06:50',
    durationMinutes: 1090,
    classes: [
      { travelClass: 'AC2', totalSeats: 50, baseFare: 3235, tatkalFare: 3535 },
      { travelClass: 'AC3', totalSeats: 72, baseFare: 2215, tatkalFare: 2415 },
      { travelClass: 'SL', totalSeats: 240, baseFare: 895, tatkalFare: 1165 },
      { travelClass: '2S', totalSeats: 120, baseFare: 365, tatkalFare: 515 },
    ],
  },
  {
    trainNumber: '12801',
    trainName: 'Purushottam Express',
    sourceStation: 'Puri',
    sourceCode: 'PURI',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '20:30',
    arrivalTime: '09:45',
    durationMinutes: 795,
    classes: [
      { travelClass: 'AC3', totalSeats: 64, baseFare: 1875, tatkalFare: 2075 },
      { travelClass: 'SL', totalSeats: 240, baseFare: 770, tatkalFare: 1040 },
      { travelClass: '2S', totalSeats: 120, baseFare: 315, tatkalFare: 465 },
    ],
  },
  {
    trainNumber: '12622',
    trainName: 'Tamil Nadu Express',
    sourceStation: 'Chennai Central',
    sourceCode: 'MAS',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '22:10',
    arrivalTime: '07:05',
    durationMinutes: 1075,
    classes: [
      { travelClass: 'AC2', totalSeats: 50, baseFare: 3265, tatkalFare: 3565 },
      { travelClass: 'AC3', totalSeats: 72, baseFare: 2240, tatkalFare: 2440 },
      { travelClass: 'SL', totalSeats: 240, baseFare: 915, tatkalFare: 1185 },
    ],
  },
  {
    trainNumber: '12903',
    trainName: 'Golden Temple Mail',
    sourceStation: 'Mumbai Central',
    sourceCode: 'MMCT',
    destinationStation: 'Amritsar',
    destinationCode: 'ASR',
    departureTime: '21:15',
    arrivalTime: '04:10',
    durationMinutes: 535,
    classes: [
      { travelClass: 'AC3', totalSeats: 64, baseFare: 1645, tatkalFare: 1845 },
      { travelClass: 'SL', totalSeats: 240, baseFare: 675, tatkalFare: 945 },
      { travelClass: '2S', totalSeats: 120, baseFare: 285, tatkalFare: 435 },
    ],
  },
  {
    trainNumber: '12303',
    trainName: 'Poorva Express',
    sourceStation: 'Howrah',
    sourceCode: 'HWH',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '08:05',
    arrivalTime: '05:35',
    durationMinutes: 650,
    classes: [
      { travelClass: 'AC3', totalSeats: 64, baseFare: 1725, tatkalFare: 1925 },
      { travelClass: 'SL', totalSeats: 240, baseFare: 715, tatkalFare: 985 },
    ],
  },
  {
    trainNumber: '12213',
    trainName: 'Yashwantpur - Delhi Duronto Express',
    sourceStation: 'Bengaluru',
    sourceCode: 'YPR',
    destinationStation: 'New Delhi',
    destinationCode: 'NDLS',
    departureTime: '20:15',
    arrivalTime: '10:30',
    durationMinutes: 855,
    classes: [
      { travelClass: 'AC1', totalSeats: 20, baseFare: 4520, tatkalFare: 5020 },
      { travelClass: 'AC2', totalSeats: 44, baseFare: 2610, tatkalFare: 2910 },
      { travelClass: 'AC3', totalSeats: 64, baseFare: 1745, tatkalFare: 1945 },
      { travelClass: 'SL', totalSeats: 200, baseFare: 725, tatkalFare: 995 },
    ],
  },
  {
    trainNumber: '12009',
    trainName: 'Mumbai Central - Ahmedabad Shatabdi Express',
    sourceStation: 'Mumbai Central',
    sourceCode: 'MMCT',
    destinationStation: 'Ahmedabad',
    destinationCode: 'ADI',
    departureTime: '06:10',
    arrivalTime: '10:45',
    durationMinutes: 275,
    classes: [
      { travelClass: 'CC', totalSeats: 72, baseFare: 785, tatkalFare: 1085 },
      { travelClass: '2S', totalSeats: 96, baseFare: 315, tatkalFare: 485 },
    ],
  },
];

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let trainCount = 0;
    let classCount = 0;

    for (const train of trains) {
      const result = await client.query(
        `INSERT INTO trains
           (train_number, train_name, source_station, source_code,
            destination_station, destination_code, departure_time, arrival_time,
            duration_minutes, run_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (train_number) DO NOTHING
         RETURNING id`,
        [
          train.trainNumber,
          train.trainName,
          train.sourceStation,
          train.sourceCode,
          train.destinationStation,
          train.destinationCode,
          train.departureTime,
          train.arrivalTime,
          train.durationMinutes,
          ALL_DAYS,
        ]
      );

      if (result.rows.length === 0) {
        logger.debug({ trainNumber: train.trainNumber }, 'Train already seeded — skipping');
        continue;
      }

      trainCount += 1;
      const trainId = result.rows[0].id;

      for (const cls of train.classes) {
        await client.query(
          `INSERT INTO train_classes
             (train_id, travel_class, total_seats, base_fare, tatkal_fare)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (train_id, travel_class) DO NOTHING`,
          [trainId, cls.travelClass, cls.totalSeats, cls.baseFare, cls.tatkalFare]
        );
        classCount += 1;
      }
    }

    await client.query('COMMIT');
    logger.info(`Seeded ${trainCount} trains with ${classCount} class configurations`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Train seeding failed');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().then(
  () => process.exit(0),
  (err) => {
    logger.error({ err }, 'Seed script failed');
    process.exit(1);
  }
);