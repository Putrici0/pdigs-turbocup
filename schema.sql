-- Enable extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ===============================
-- ENUM TYPES
-- ===============================

CREATE TYPE surface_enum AS ENUM (
    'asphalt',
    'gravel',
    'dirt',
    'sand',
    'mixed'
);

CREATE TYPE lighting_enum AS ENUM (
    'day',
    'night',
    'dusk',
    'dawn'
);

CREATE TYPE tyre_compound_enum AS ENUM (
    'soft',
    'medium',
    'hard',
    'wet'
);

CREATE TYPE weather_enum AS ENUM (
    'dry',
    'light_rain',
    'heavy_rain',
    'fog'
);

CREATE TYPE track_condition_enum AS ENUM (
    'clean',
    'dusty',
    'muddy',
    'wet',
    'icy'
);

CREATE TYPE drivetrain_enum AS ENUM (
    'FWD',
    'RWD',
    'AWD'
);

CREATE TYPE aspiration_enum AS ENUM (
    'NA',
    'turbo',
    'supercharged'
);


-- ===============================
-- USERS
-- ===============================

CREATE TABLE users (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ===============================
-- PARTICIPANTS
-- ===============================

CREATE TABLE participants (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES users(id),

    dob DATE,
    license VARCHAR(50),
    license_expedition DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ===============================
-- CARS
-- ===============================

CREATE TABLE cars (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    make VARCHAR(50),
    model VARCHAR(50),
    year INT,

    power_hp INT,
    weight_kg INT,

    drivetrain drivetrain_enum,

    max_rpm INT,
    gear_count INT,

    aspiration_type aspiration_enum
);


-- ===============================
-- EVENTS
-- ===============================

CREATE TABLE events (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100),

    start_date DATE,
    end_date DATE
);


-- ===============================
-- STAGES
-- ===============================

CREATE TABLE stages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL REFERENCES events(id),

    name VARCHAR(100),

    distance_km FLOAT CHECK (distance_km > 0),

    surface_type surface_enum,

    grip_level FLOAT CHECK (grip_level >= 0 AND grip_level <= 1),

    avg_width_m FLOAT CHECK (avg_width_m > 0),

    num_turns INT CHECK (num_turns >= 0),
    num_sharp_turns INT CHECK (num_sharp_turns >= 0),

    elevation_gain_m INT,
    max_altitude_m INT,

    lighting lighting_enum,

    technical_difficulty INT CHECK (
        technical_difficulty >= 1
        AND technical_difficulty <= 10
    ),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ===============================
-- ENTRIES
-- ===============================

CREATE TABLE entries (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL REFERENCES events(id),

    car_id UUID NOT NULL REFERENCES cars(id),

    driver_participant_id UUID NOT NULL REFERENCES participants(id),

    co_driver_participant_id UUID REFERENCES participants(id),

    bib_number INT NOT NULL,

    class VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(event_id, bib_number)
);


-- ===============================
-- RUNS
-- ===============================

CREATE TABLE runs (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    entry_id UUID NOT NULL REFERENCES entries(id),

    stage_id UUID NOT NULL REFERENCES stages(id),

    total_time_ms BIGINT CHECK (total_time_ms >= 0),

    weather_condition weather_enum,

    temperature_c FLOAT,

    surface_temp_c FLOAT,

    track_condition track_condition_enum,

    tyre_compound tyre_compound_enum,

    tyre_pressure_bar FLOAT CHECK (tyre_pressure_bar > 0),

    tyre_wear_start FLOAT CHECK (
        tyre_wear_start >= 0
        AND tyre_wear_start <= 100
    ),

    fuel_load_kg FLOAT CHECK (fuel_load_kg >= 0),

    mechanical_issue BOOLEAN DEFAULT FALSE,

    mechanical_issue_type VARCHAR(50),

    navigation_error BOOLEAN DEFAULT FALSE,

    penalty_seconds INT DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ===============================
-- SEGMENT TIMES
-- ===============================

CREATE TABLE segment_times (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    run_id UUID NOT NULL REFERENCES runs(id),

    segment_number INT NOT NULL,

    time_ms BIGINT NOT NULL CHECK (time_ms >= 0),

    UNIQUE (run_id, segment_number)
);


-- ===============================
-- MATCHES
-- ===============================

CREATE TABLE matches (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    stage_id UUID NOT NULL REFERENCES stages(id),

    run_a UUID NOT NULL REFERENCES runs(id),

    run_b UUID NOT NULL REFERENCES runs(id),

    winner_run UUID REFERENCES runs(id),

    scheduled_start TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ===============================
-- INDEXES
-- ===============================

CREATE INDEX idx_entries_event
ON entries(event_id);

CREATE INDEX idx_entries_car
ON entries(car_id);

CREATE INDEX idx_runs_stage
ON runs(stage_id);

CREATE INDEX idx_runs_entry
ON runs(entry_id);

CREATE INDEX idx_runs_stage_time
ON runs(stage_id, total_time_ms);

CREATE INDEX idx_runs_stage_created
ON runs(stage_id, created_at DESC);

CREATE INDEX idx_segment_times_run
ON segment_times(run_id);

CREATE INDEX idx_matches_stage
ON matches(stage_id);

CREATE INDEX idx_participants_user
ON participants(user_id);
