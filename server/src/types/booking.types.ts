// ─── Booking State Machine ────────────────────────────────
export enum BookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
  CANCELLED = 'CANCELLED',
  WAITLISTED = 'WAITLISTED',
  WAITLIST_PROMOTED = 'WAITLIST_PROMOTED',
}

// Valid state transitions
export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING_PAYMENT]: [BookingStatus.CONFIRMED, BookingStatus.PAYMENT_EXPIRED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [BookingStatus.CANCELLED],
  [BookingStatus.PAYMENT_EXPIRED]: [], // Terminal state
  [BookingStatus.CANCELLED]: [], // Terminal state
  [BookingStatus.WAITLISTED]: [BookingStatus.WAITLIST_PROMOTED, BookingStatus.CANCELLED],
  [BookingStatus.WAITLIST_PROMOTED]: [BookingStatus.PENDING_PAYMENT],
};

export interface Booking {
  id: string;
  userId: number;
  trainId: number;
  journeyDate: string;
  travelClass: TravelClass;
  passengerName: string;
  passengerAge: number;
  passengerGender: 'M' | 'F' | 'O';
  status: BookingStatus;
  seatNumber: string | null;
  pnr: string;
  paymentId: string | null;
  holdExpiresAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookingInput {
  trainId: number;
  journeyDate: string;
  travelClass: TravelClass;
  passengerName: string;
  passengerAge: number;
  passengerGender: 'M' | 'F' | 'O';
}

export type TravelClass = 'SL' | 'AC3' | 'AC2' | 'AC1' | '2S' | 'CC';

export interface ReservationResult {
  success: boolean;
  status: 'reserved' | 'waitlisted' | 'sold_out' | 'error';
  bookingId?: string;
  pnr?: string;
  remainingSeats?: number;
  waitlistPosition?: number;
  holdExpiresAt?: Date;
  message: string;
}
