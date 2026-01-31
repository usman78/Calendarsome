-- PostgreSQL Initialization Script for Vercel
-- Run this in the Vercel Postgres Query Console

-- Clinics
CREATE TABLE IF NOT EXISTS clinics (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    timezone TEXT DEFAULT 'America/New_York',
    settings TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Providers
CREATE TABLE IF NOT EXISTS providers (
    id SERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    specialty TEXT,
    email TEXT,
    schedule TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointment Types
CREATE TABLE IF NOT EXISTS appointment_types (
    id SERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    category TEXT CHECK(category IN ('medical', 'cosmetic')) NOT NULL,
    duration_mins INTEGER NOT NULL DEFAULT 30,
    requires_deposit INTEGER DEFAULT 0,
    deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Time Slots
CREATE TABLE IF NOT EXISTS time_slots (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    is_blocked INTEGER DEFAULT 0,
    block_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    date_of_birth DATE,
    insurance_verified INTEGER DEFAULT 0,
    insurance_photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    provider_id INTEGER REFERENCES providers(id),
    appointment_type_id INTEGER NOT NULL REFERENCES appointment_types(id),
    patient_status TEXT CHECK(patient_status IN ('new', 'existing')) DEFAULT 'new',
    appointment_datetime TIMESTAMP NOT NULL,
    duration_mins INTEGER NOT NULL DEFAULT 30,
    status TEXT CHECK(status IN ('pending', 'confirmed', 'completed', 'no-show', 'cancelled', 'waitlist-released')) DEFAULT 'pending',
    deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
    photo_url TEXT,
    triage_data TEXT,
    notes TEXT,
    emergency_flag INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Waitlist
CREATE TABLE IF NOT EXISTS waitlist (
    id SERIAL PRIMARY KEY,
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    appointment_slot_datetime TIMESTAMP NOT NULL,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    priority INTEGER DEFAULT 0,
    notification_sent INTEGER DEFAULT 0,
    notified_at TIMESTAMP,
    claimed_at TIMESTAMP,
    claim_expires_at TIMESTAMP,
    response_status TEXT CHECK(response_status IN ('pending', 'accepted', 'declined', 'expired', 'claimed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Confirmations
CREATE TABLE IF NOT EXISTS confirmations (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    sent_at_72h TIMESTAMP,
    sent_at_48h TIMESTAMP,
    confirmed_at TIMESTAMP,
    reminder_count INTEGER DEFAULT 0,
    response TEXT CHECK(response IN ('pending', 'confirmed', 'declined')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT CHECK(status IN ('authorized', 'charged', 'refunded', 'failed')) DEFAULT 'authorized',
    mock_stripe_id TEXT,
    charged_at TIMESTAMP,
    refunded_at TIMESTAMP,
    refund_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SMS Log
CREATE TABLE IF NOT EXISTS sms_log (
    id SERIAL PRIMARY KEY,
    recipient_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('confirmation', 'reminder', 'waitlist', 'emergency', 'cancellation')) NOT NULL,
    appointment_id INTEGER REFERENCES appointments(id),
    status TEXT CHECK(status IN ('pending', 'sent', 'delivered', 'failed')) DEFAULT 'sent',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    response TEXT,
    responded_at TIMESTAMP
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    user_email TEXT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clinic Settings
CREATE TABLE IF NOT EXISTS clinic_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data (Demo Clinic)
INSERT INTO clinics (name, email) VALUES ('Demo Dermatology', 'admin@demoderm.com');

-- Seed Providers
INSERT INTO providers (clinic_id, name, specialty) VALUES (1, 'Dr. Sarah Johnson', 'General Dermatology');
INSERT INTO providers (clinic_id, name, specialty) VALUES (1, 'Dr. Michael Chen', 'Cosmetic Dermatology');

-- Seed Appointment Types
INSERT INTO appointment_types (clinic_id, name, category, duration_mins, requires_deposit, deposit_amount) 
VALUES (1, 'Mole Check', 'medical', 15, 0, 0.00);
INSERT INTO appointment_types (clinic_id, name, category, duration_mins, requires_deposit, deposit_amount) 
VALUES (1, 'Acne Consultation', 'medical', 30, 0, 0.00);
INSERT INTO appointment_types (clinic_id, name, category, duration_mins, requires_deposit, deposit_amount) 
VALUES (1, 'Botox', 'cosmetic', 30, 1, 50.00);
