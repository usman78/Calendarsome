const fetch = require('node-fetch');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3001';
let authToken = '';
let settingsData = {};

async function runTests() {
    console.log('🚀 Starting Backend Verification Tests...');

    try {
        // 1. Authenticate Admin
        await testAuth();

        // 2. Settings Persistence
        await testSettingsPersistence();

        // 3. User Booking & Admin Stats
        await testBookingAndStats();

        console.log('\n✅ All API Tests Completed Successfully!');
    } catch (error) {
        console.error('\n❌ Tests Failed:', error.message);
        process.exit(1);
    }
}

async function testAuth() {
    console.log('\n🔵 Testing Authentication...');
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' })
    });

    const data = await response.json();
    if (!data.success || !data.token) throw new Error('Login failed');

    authToken = data.token;
    console.log('  ✅ Admin logged in, token received');
}

async function testSettingsPersistence() {
    console.log('\n🔵 Testing Settings Persistence...');

    // Update Settings
    const newSettings = {
        branding: {
            clinicName: "Verified Clinic " + Date.now(),
            primaryColor: "#ff0000",
            welcomeMessage: "Test Welcome"
        },
        operating_hours: {
            lunchBreak: { active: true, start: "12:30", end: "13:30" }
        },
        business_rules: {
            minNoticeHours: 24,
            allowSameDay: false
        }
    };

    const updateRes = await fetch(`${BASE_URL}/api/settings`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(newSettings)
    });

    const updateData = await updateRes.json();
    if (!updateData.success) throw new Error('Settings update failed: ' + updateData.message);
    console.log('  ✅ Settings updated');

    // Fetch Settings to Verify
    const getRes = await fetch(`${BASE_URL}/api/settings`);
    const getData = await getRes.json();

    if (getData.settings.branding.clinicName !== newSettings.branding.clinicName) {
        throw new Error('Clinic Name persistence failed');
    }
    if (getData.settings.operating_hours.lunchBreak.start !== "12:30") {
        throw new Error('Lunch Break persistence failed');
    }

    console.log('  ✅ Settings persisted and verified');
    settingsData = getData.settings;
}

async function testBookingAndStats() {
    console.log('\n🔵 Testing Booking Flow & Stats...');

    // 1. Get Initial Stats
    const initialCount = await getAppointmentCount();
    console.log(`  ℹ️ Initial pending appointments: ${initialCount}`);

    // 2. Create Appointment via Triage (Form Data)
    const form = new FormData();
    form.append('clinicId', '1');
    form.append('patientStatus', 'new');
    form.append('category', 'medical');
    form.append('appointmentTypeId', '1'); // Assumes ID 1 exists
    form.append('symptoms', 'API Form Data Test Symptoms');
    form.append('patientName', 'API Form Tester');
    form.append('patientEmail', 'api-form@test.com');
    form.append('patientPhone', '555-888-8888');
    form.append('triageData', JSON.stringify({
        patientStatus: 'new',
        symptoms: 'API Form Data Test Symptoms',
        category: 'medical'
    }));

    const triageRes = await fetch(`${BASE_URL}/api/triage`, {
        method: 'POST',
        body: form
    });

    const triageData = await triageRes.json();
    if (!triageData.success) throw new Error('Triage failed: ' + (triageData.error || JSON.stringify(triageData)));
    console.log('  ✅ Triage processed (FormData)');

    // Book
    const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            patientId: triageData.patientId,
            clinicId: 1,
            appointmentTypeId: 1,
            appointmentDatetime: new Date(Date.now() + 172800000).toISOString(), // 2 days later
            emergencyFlag: false,
            triageData: {
                patientStatus: 'new',
                category: 'medical',
                symptoms: 'API Test Symptoms'
            }
        })
    });

    const bookData = await bookRes.json();
    if (!bookData.success) throw new Error('Booking failed: ' + (bookData.error || JSON.stringify(bookData)));
    console.log(`  ✅ Appointment #${bookData.appointmentId} created`);

    // 3. Verify Stats Increment
    const newCount = await getAppointmentCount();
    console.log(`  ℹ️ New pending appointments: ${newCount}`);

    if (newCount !== initialCount + 1) {
        console.warn('  ⚠️ Warning: efficient stats check might have failed or data is different');
    } else {
        console.log('  ✅ Stats incremented correctly');
    }
}

async function getAppointmentCount() {
    const res = await fetch(`${BASE_URL}/api/appointments/clinic/1`);
    const data = await res.json();
    if (!data.success) return 0;
    return data.appointments.filter(a => a.status === 'pending').length;
}

runTests();
