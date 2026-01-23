const { runAsync, getAsync } = require('../database');

/**
 * Seed database with demo data for MVP testing
 */

async function seedDatabase() {
    try {
        console.log('Starting database seed...');

        // Check if already seeded
        const existingClinic = await getAsync('SELECT id FROM clinics LIMIT 1');
        if (existingClinic) {
            console.log('Database already seeded. Skipping...');
            return;
        }

        // 1. Create demo clinic
        const clinicResult = await runAsync(`
      INSERT INTO clinics (name, address, phone, email, timezone, settings)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
            'Demo Dermatology Clinic',
            '123 Medical Plaza, New York, NY 10001',
            '555-123-4567',
            'contact@demoderm.com',
            'America/New_York',
            JSON.stringify({
                businessHours: {
                    monday: { start: '09:00', end: '17:00' },
                    tuesday: { start: '09:00', end: '17:00' },
                    wednesday: { start: '09:00', end: '17:00' },
                    thursday: { start: '09:00', end: '17:00' },
                    friday: { start: '09:00', end: '17:00' },
                    saturday: { start: '10:00', end: '14:00' },
                    sunday: null
                },
                appointmentDuration: 30
            })
        ]);
        const clinicId = clinicResult.id;
        console.log(`✓ Created clinic (ID: ${clinicId})`);

        // 2. Create providers
        const provider1 = await runAsync(`
      INSERT INTO providers (clinic_id, name, specialty, email, schedule)
      VALUES (?, ?, ?, ?, ?)
    `, [
            clinicId,
            'Dr. Sarah Johnson',
            'General Dermatology',
            'dr.johnson@demoderm.com',
            JSON.stringify({
                monday: { start: '09:00', end: '17:00', slots: [] },
                tuesday: { start: '09:00', end: '17:00', slots: [] },
                wednesday: { start: '09:00', end: '17:00', slots: [] },
                thursday: { start: '09:00', end: '17:00', slots: [] },
                friday: { start: '09:00', end: '17:00', slots: [] }
            })
        ]);

        const provider2 = await runAsync(`
      INSERT INTO providers (clinic_id, name, specialty, email, schedule)
      VALUES (?, ?, ?, ?, ?)
    `, [
            clinicId,
            'Dr. Michael Chen',
            'Cosmetic Dermatology',
            'dr.chen@demoderm.com',
            JSON.stringify({
                tuesday: { start: '10:00', end: '18:00', slots: [] },
                wednesday: { start: '10:00', end: '18:00', slots: [] },
                thursday: { start: '10:00', end: '18:00', slots: [] },
                saturday: { start: '10:00', end: '14:00', slots: [] }
            })
        ]);
        console.log(`✓ Created providers (IDs: ${provider1.id}, ${provider2.id})`);

        // 3. Create appointment types
        const medicalTypes = [
            { name: 'Rash/Irritation', duration: 30, deposit: 0 },
            { name: 'Mole Check', duration: 45, deposit: 0 },
            { name: 'Acne Follow-up', duration: 20, deposit: 0 },
            { name: 'Eczema/Psoriasis', duration: 30, deposit: 0 },
            { name: 'Skin Infection', duration: 30, deposit: 0 }
        ];

        const cosmeticTypes = [
            { name: 'Botox/Fillers', duration: 45, deposit: 50 },
            { name: 'Chemical Peel', duration: 60, deposit: 50 },
            { name: 'Laser Treatment', duration: 60, deposit: 100 },
            { name: 'Scar Removal', duration: 45, deposit: 75 },
            { name: 'Microneedling', duration: 60, deposit: 50 }
        ];

        for (const type of medicalTypes) {
            await runAsync(`
        INSERT INTO appointment_types (clinic_id, name, category, duration_mins, requires_deposit, deposit_amount)
        VALUES (?, ?, 'medical', ?, 0, 0.00)
      `, [clinicId, type.name, type.duration]);
        }

        for (const type of cosmeticTypes) {
            await runAsync(`
        INSERT INTO appointment_types (clinic_id, name, category, duration_mins, requires_deposit, deposit_amount)
        VALUES (?, ?, 'cosmetic', ?, 1, ?)
      `, [clinicId, type.name, type.duration, type.deposit]);
        }
        console.log(`✓ Created ${medicalTypes.length + cosmeticTypes.length} appointment types`);

        // 4. Create some demo patients
        const patients = [
            { name: 'John Doe', email: 'john@example.com', phone: '555-0101' },
            { name: 'Jane Smith', email: 'jane@example.com', phone: '555-0102' },
            { name: 'Bob Wilson', email: 'bob@example.com', phone: '555-0103' }
        ];

        for (const patient of patients) {
            await runAsync(`
        INSERT INTO patients (name, email, phone)
        VALUES (?, ?, ?)
      `, [patient.name, patient.email, patient.phone]);
        }
        console.log(`✓ Created ${patients.length} demo patients`);

        console.log('Database seeded successfully! 🌱');

    } catch (error) {
        console.error('Error seeding database:', error);
        throw error;
    }
}

// Run seed if called directly
if (require.main === module) {
    seedDatabase()
        .then(() => {
            console.log('Seed complete');
            process.exit(0);
        })
        .catch(err => {
            console.error('Seed failed:', err);
            process.exit(1);
        });
}

module.exports = { seedDatabase };
