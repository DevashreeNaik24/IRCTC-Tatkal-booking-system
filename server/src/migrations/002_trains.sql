-- Trains table
CREATE TABLE IF NOT EXISTS trains (
  id SERIAL PRIMARY KEY,
  train_number VARCHAR(10) UNIQUE NOT NULL,
  train_name VARCHAR(255) NOT NULL,
  source_station VARCHAR(255) NOT NULL,
  source_code VARCHAR(10) NOT NULL,
  destination_station VARCHAR(255) NOT NULL,
  destination_code VARCHAR(10) NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  run_days TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Train classes (seat inventory per class)
CREATE TABLE IF NOT EXISTS train_classes (
  id SERIAL PRIMARY KEY,
  train_id INTEGER NOT NULL REFERENCES trains(id) ON DELETE CASCADE,
  travel_class VARCHAR(5) NOT NULL, -- SL, AC3, AC2, AC1, 2S, CC
  total_seats INTEGER NOT NULL,
  base_fare DECIMAL(10, 2) NOT NULL,
  tatkal_fare DECIMAL(10, 2) NOT NULL,
  UNIQUE(train_id, travel_class)
);

CREATE INDEX IF NOT EXISTS idx_trains_source ON trains(LOWER(source_station));
CREATE INDEX IF NOT EXISTS idx_trains_destination ON trains(LOWER(destination_station));
CREATE INDEX IF NOT EXISTS idx_trains_source_code ON trains(source_code);
CREATE INDEX IF NOT EXISTS idx_trains_dest_code ON trains(destination_code);
CREATE INDEX IF NOT EXISTS idx_train_classes_train ON train_classes(train_id);
