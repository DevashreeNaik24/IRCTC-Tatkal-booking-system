-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id),
  train_id INTEGER NOT NULL REFERENCES trains(id),
  journey_date DATE NOT NULL,
  travel_class VARCHAR(5) NOT NULL,
  passenger_name VARCHAR(255) NOT NULL,
  passenger_age INTEGER NOT NULL CHECK (passenger_age > 0 AND passenger_age < 150),
  passenger_gender VARCHAR(1) NOT NULL CHECK (passenger_gender IN ('M', 'F', 'O')),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
  seat_number VARCHAR(10),
  pnr VARCHAR(15) UNIQUE NOT NULL,
  payment_id UUID,
  hold_expires_at TIMESTAMP WITH TIME ZONE,
  idempotency_key VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_train_date ON bookings(train_id, journey_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_pnr ON bookings(pnr);
CREATE INDEX IF NOT EXISTS idx_bookings_idempotency ON bookings(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires ON bookings(hold_expires_at)
  WHERE status = 'PENDING_PAYMENT';
