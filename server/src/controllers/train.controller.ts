import { Request, Response } from 'express';
import { searchTrains, getSeatAvailability, getTrainById } from '../services/train.service';
import { getWindowStatus } from '../services/tatkal.service';
import { logger } from '../config/logger';

export async function searchTrainsHandler(req: Request, res: Response): Promise<void> {
  const { source, destination, date } = req.query;

  try {
    const trains = await searchTrains({
      source: source as string | undefined,
      destination: destination as string | undefined,
      date: date as string | undefined,
    });
    res.json({
      success: true,
      message: `${trains.length} train(s) found`,
      data: { trains },
    });
  } catch (err) {
    logger.error({ err }, 'Train search failed');
    res.status(500).json({ success: false, message: 'Train search failed.' });
  }
}

export async function getTrainHandler(req: Request, res: Response): Promise<void> {
  const trainId = Number(req.params.id);
  if (!Number.isInteger(trainId)) {
    res.status(400).json({ success: false, message: 'Invalid train ID.' });
    return;
  }

  try {
    const train = await getTrainById(trainId);
    if (!train) {
      res.status(404).json({ success: false, message: 'Train not found.' });
      return;
    }
    res.json({ success: true, message: 'Train found', data: { train } });
  } catch (err) {
    logger.error({ err, trainId }, 'Get train failed');
    res.status(500).json({ success: false, message: 'Failed to load train.' });
  }
}

export async function availabilityHandler(req: Request, res: Response): Promise<void> {
  const trainId = Number(req.params.id);
  const { date, class: travelClass } = req.query;

  if (!Number.isInteger(trainId) || !date) {
    res.status(400).json({ success: false, message: 'trainId and date are required.' });
    return;
  }

  try {
    const availability = await getSeatAvailability(
      trainId,
      date as string,
      travelClass as 'SL' | 'AC3' | 'AC2' | 'AC1' | '2S' | 'CC' | undefined
    );
    res.json({
      success: true,
      message: 'Seat availability fetched',
      data: { availability },
    });
  } catch (err) {
    logger.error({ err, trainId }, 'Availability check failed');
    res.status(500).json({ success: false, message: 'Failed to fetch availability.' });
  }
}

export async function windowStatusHandler(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    message: 'Tatkal window status',
    data: getWindowStatus(),
  });
}