const { runAsync, getAsync } = require('../database');

const defaultSettings = [
    {
        key: 'operating_hours',
        value: {
            monday: { start: '09:00', end: '17:00', active: true },
            tuesday: { start: '09:00', end: '17:00', active: true },
            wednesday: { start: '09:00', end: '17:00', active: true },
            thursday: { start: '09:00', end: '17:00', active: true },
            friday: { start: '09:00', end: '17:00', active: true },
            saturday: { start: '10:00', end: '14:00', active: false },
            sunday: { start: '10:00', end: '14:00', active: false },
            exceptions: ['2026-12-25', '2026-01-01']
        }
    },
    {
        key: 'business_rules',
        value: {
            minNoticeHours: 2,
            maxBookingDays: 90,
            allowSameDay: true,
            requireAccount: false,
            confirmationWindowHours: 72,
            reminderHours: 24,
            autoCancelHours: 48
        }
    },
    {
        key: 'branding',
        value: {
            clinicName: 'Demo Dermatology',
            primaryColor: '#0ea5e9',
            logoUrl: '/logo.png',
            welcomeMessage: 'Welcome to our clinic. Please select a service below.'
        }
    },
    {
        key: 'sms_templates',
        value: {
            confirmation: 'Hi {{patient_name}}, this is {{clinic_name}}. Please confirm your appointment on {{date}} at {{time}}. Reply YES to confirm.',
            reminder: 'Reminder: You have an appointment at {{clinic_name}} tomorrow at {{time}}.',
            waitlist: 'Good news! A slot just opened on {{date}} at {{time}}. Click here to claim: {{link}}'
        }
    }
];

async function seedSettings() {
    console.log('🌱 Seeding default settings...');

    try {
        for (const setting of defaultSettings) {
            const existing = await getAsync('SELECT setting_key FROM clinic_settings WHERE setting_key = ?', [setting.key]);

            if (!existing) {
                await runAsync('INSERT INTO clinic_settings (setting_key, setting_value) VALUES (?, ?)',
                    [setting.key, JSON.stringify(setting.value)]);
                console.log(`✅ Seeded ${setting.key}`);
            } else {
                console.log(`ℹ️ ${setting.key} already exists`);
            }
        }
        console.log('✨ Settings seeding complete');
    } catch (error) {
        console.error('❌ Error seeding settings:', error);
    }
}

// Run if called directly
if (require.main === module) {
    setTimeout(seedSettings, 1000); // Wait for DB connection
}

module.exports = { seedSettings };
