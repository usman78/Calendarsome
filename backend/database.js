const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const path = require('path');

// Check if we are in Postgres mode (Vercel)
const isPostgres = !!process.env.POSTGRES_URL;
const isVercel = !!process.env.VERCEL;

let dbModule;

if (isPostgres) {
  console.log('🔌 Using PostgreSQL database');
  dbModule = require('./db-postgres');
} else {
  // If we are on Vercel but don't have Postgres, we must fail fast
  // because SQLite won't work on the read-only filesystem
  if (isVercel) {
    throw new Error('❌ Vercel Deployment Error: POSTGRES_URL is missing. Please connect a Vercel Postgres store to your project in the Vercel Dashboard.');
  }

  console.log('🔌 Using SQLite database');

  // SQLite Implementation
  const db = new sqlite3.Database(config.database.filename, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to SQLite database');
    }
  });

  // Helper function to run queries with promises
  function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  // Helper function to get single row
  function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Helper function to get all rows
  function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  dbModule = {
    db,
    runAsync,
    getAsync,
    allAsync
  };

  // Only initialize schema automatically for SQLite
  // For Postgres, we use a separate init script
  initializeDatabase(dbModule);
}

// Initialize database schema (SQLite only)
function initializeDatabase(module) {
  if (isPostgres) return; // Skip for Postgres

  const { db } = module;
  db.serialize(() => {

    // Clinics table - Multi-clinic support
    db.run(`
      CREATE TABLE IF NOT EXISTS clinics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        timezone TEXT DEFAULT 'America/New_York',
        settings TEXT, -- JSON string with clinic-specific settings
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Providers table - Doctors/staff who perform appointments
    db.run(`
      CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        specialty TEXT, -- e.g., 'General Dermatology', 'Cosmetic', 'Surgical'
        email TEXT,
        schedule TEXT, -- JSON string with weekly schedule
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clinic_id) REFERENCES clinics(id)
      )
    `);

    // Appointment Types table - Configurable appointment types per clinic
    db.run(`
      CREATE TABLE IF NOT EXISTS appointment_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER NOT NULL,
        name TEXT NOT NULL, -- e.g., 'Mole Check', 'Botox', 'Acne Follow-up'
        category TEXT CHECK(category IN ('medical', 'cosmetic')) NOT NULL,
        duration_mins INTEGER NOT NULL DEFAULT 30,
        requires_deposit INTEGER DEFAULT 0,
        deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clinic_id) REFERENCES clinics(id)
      )
    `);

    // Time Slots table - Available and blocked time slots per provider
    db.run(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        is_blocked INTEGER DEFAULT 0, -- 1 if slot is blocked (lunch, meeting, etc.)
        block_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers(id)
      )
    `);

    // Patients table
    db.run(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        date_of_birth DATE,
        insurance_verified INTEGER DEFAULT 0,
        insurance_photo_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Appointments table - Now with proper foreign keys
    db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        clinic_id INTEGER NOT NULL,
        provider_id INTEGER,
        appointment_type_id INTEGER NOT NULL,
        patient_status TEXT CHECK(patient_status IN ('new', 'existing')) DEFAULT 'new',
        appointment_datetime DATETIME NOT NULL,
        duration_mins INTEGER NOT NULL DEFAULT 30,
        status TEXT CHECK(status IN ('pending', 'confirmed', 'completed', 'no-show', 'cancelled', 'waitlist-released')) DEFAULT 'pending',
        deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
        photo_url TEXT,
        triage_data TEXT, -- JSON string with triage responses
        notes TEXT,
        emergency_flag INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id),
        FOREIGN KEY (clinic_id) REFERENCES clinics(id),
        FOREIGN KEY (provider_id) REFERENCES providers(id),
        FOREIGN KEY (appointment_type_id) REFERENCES appointment_types(id)
      )
    `);

    // Waitlist table - with race condition prevention
    db.run(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id INTEGER NOT NULL,
        appointment_slot_datetime DATETIME NOT NULL,
        patient_id INTEGER NOT NULL,
        priority INTEGER DEFAULT 0, -- Higher number = higher priority
        notification_sent INTEGER DEFAULT 0,
        notified_at DATETIME,
        claimed_at DATETIME, -- Timestamp when patient claimed the slot
        claim_expires_at DATETIME, -- Expiration time for claim
        response_status TEXT CHECK(response_status IN ('pending', 'accepted', 'declined', 'expired', 'claimed')) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id),
        FOREIGN KEY (clinic_id) REFERENCES clinics(id)
      )
    `);

    // Confirmations table (tracking SMS confirmation flow)
    db.run(`
      CREATE TABLE IF NOT EXISTS confirmations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER NOT NULL,
        sent_at_72h DATETIME,
        sent_at_48h DATETIME,
        confirmed_at DATETIME,
        reminder_count INTEGER DEFAULT 0,
        response TEXT CHECK(response IN ('pending', 'confirmed', 'declined')) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
      )
    `);

    // Payments table (mock Stripe transactions)
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id INTEGER NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status TEXT CHECK(status IN ('authorized', 'charged', 'refunded', 'failed')) DEFAULT 'authorized',
        mock_stripe_id TEXT, -- Simulated Stripe payment ID
        charged_at DATETIME,
        refunded_at DATETIME,
        refund_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
      )
    `);

    // SMS Log table (for mock SMS service) - Enhanced with status tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS sms_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_phone TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT CHECK(type IN ('confirmation', 'reminder', 'waitlist', 'emergency', 'cancellation')) NOT NULL,
        appointment_id INTEGER,
        status TEXT CHECK(status IN ('pending', 'sent', 'delivered', 'failed')) DEFAULT 'sent',
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME,
        response TEXT,
        responded_at DATETIME,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
      )
    `);

    // Audit Log table - CRITICAL for HIPAA compliance
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, -- Admin/staff user who performed action (NULL for MVP, required for production)
        user_email TEXT, -- Email of user for identification
        action TEXT NOT NULL, -- 'CREATE', 'READ', 'UPDATE', 'DELETE', 'ACCESS'
        table_name TEXT NOT NULL, -- Which table was affected
        record_id INTEGER, -- ID of the record that was affected
        old_value TEXT, -- JSON string of old values (for UPDATE)
        new_value TEXT, -- JSON string of new values (for CREATE/UPDATE)
        ip_address TEXT, -- IP address of request
        user_agent TEXT, -- Browser/client info
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Clinic Settings table - Key/Value store for customization
    db.run(`
      CREATE TABLE IF NOT EXISTS clinic_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL, -- JSON string or simple value
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    db.run('CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(appointment_datetime)');
    db.run('CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments(clinic_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_waitlist_datetime ON waitlist(appointment_slot_datetime)');
    db.run('CREATE INDEX IF NOT EXISTS idx_waitlist_priority ON waitlist(priority DESC)');
    db.run('CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(response_status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_providers_clinic ON providers(clinic_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_appointment_types_clinic ON appointment_types(clinic_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_time_slots_provider ON time_slots(provider_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, record_id)');

    console.log('Database schema initialized successfully');
  });
}

module.exports = dbModule;
