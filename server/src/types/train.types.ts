import { TravelClass } from './booking.types';

export interface Train {
  id: number;
  trainNumber: string;
  trainName: string;
  sourceStation: string;
  sourceCode: string;
  destinationStation: string;
  destinationCode: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  runDays: string[]; // ['Mon', 'Tue', 'Wed', ...]
  classes: TrainClassInfo[];
  createdAt: Date;
}

export interface TrainClassInfo {
  travelClass: TravelClass;
  totalSeats: number;
  baseFare: number;
  tatkalFare: number;
}

export interface TrainSearchParams {
  source?: string;
  destination?: string;
  date?: string;
}

export interface SeatAvailability {
  trainId: number;
  journeyDate: string;
  travelClass: TravelClass;
  totalSeats: number;
  availableSeats: number;
  waitlistCount: number;
}
