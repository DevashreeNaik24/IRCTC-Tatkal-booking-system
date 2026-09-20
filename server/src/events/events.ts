// ─── Booking Event Definitions ────────────────────────────
export enum BookingEvent {
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

/**
 * Internal job names used on the BullMQ queues.
 * These map 1:1 to the worker switch statements.
 */
export const JobName = {
  // booking queue
  PERSIST_BOOKING: 'persist-booking',
  CONFIRM_BOOKING: 'confirm-booking',
  FAIL_BOOKING: 'fail-booking',
  CANCEL_BOOKING: 'cancel-booking',
  SEAT_RELEASED: 'seat-released',
  WAITLIST_PROMOTED: 'waitlist-promoted',
  BOOKING_CONFIRMED: 'booking-confirmed',
  // payment queue
  CHECK_PAYMENT_EXPIRY: 'check-payment-expiry',
  // notification queue
  NOTIFY: 'notify',
} as const;

export type JobNameType = (typeof JobName)[keyof typeof JobName];

// ─── Payload Types ────────────────────────────────────────

export interface PersistBookingPayload {
  bookingId: string;
  userId: number;
  trainId: number;
  journeyDate: string;
  travelClass: string;
  passengerName: string;
  passengerAge: number;
  passengerGender: 'M' | 'F' | 'O';
  pnr: string;
  status: string;
  holdExpiresAt: string | null;
  idempotencyKey: string;
}

export interface ConfirmBookingPayload {
  bookingId: string;
  paymentId: string;
  amount: number;
}

export interface FailBookingPayload {
  bookingId: string;
  paymentId?: string;
  reason: 'payment_timeout' | 'gateway_declined' | 'cancelled' | 'manual';
}

export interface SeatReleasedPayload {
  bookingId: string;
  trainId: number;
  journeyDate: string;
  travelClass: string;
  action: 'returned_to_pool' | 'waitlist_promoted';
  promotedBookingId?: string;
  remainingSeats: number;
}

export interface WaitlistPromotedPayload {
  bookingId: string;
  trainId: number;
  journeyDate: string;
  travelClass: string;
  holdExpiresAt: string;
}

export interface BookingConfirmedPayload {
  bookingId: string;
  userId: number;
  pnr: string;
  trainName: string;
  passengerName: string;
  paymentId: string;
  amount: number;
}

export interface NotificationPayload {
  userId: number;
  type: 'booking_confirmed' | 'waitlist_promoted' | 'payment_failed' | 'payment_expired' | 'seat_released' | 'cancelled';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}