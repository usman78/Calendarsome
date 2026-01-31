const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');
const { startScheduler } = require('./services/schedulerService');
const { seedDatabase } = require('./utils/seedDatabase');
const { auditMiddleware } = require('./utils/auditLogger');

// Import controllers
const triageController = require('./controllers/triageController');
const appointmentController = require('./controllers/appointmentController');
const authRoutes = require('./routes/auth').router;
const settingsRoutes = require('./routes/settings');

// Import services
const { sendSMS, logSMSResponse, getSMSLogs, getPendingSMSResponses } = require('./services/smsService');
const { authorizeDeposit, chargeDeposit, refundDeposit, getPaymentStatus } = require('./services/paymentService');
const { sendInitialConfirmation, processConfirmationResponse } = require('./services/confirmationService');
const { addToWaitlist, claimWaitlistSlot, getWaitlistPosition } = require('./services/waitlistService');

// Import utils
const { uploadSinglePhoto, uploadInsuranceCard, getPhotoUrl } = require('./utils/photoUpload');
const { validateTriageData, isValidAppointmentTime } = require('./utils/validators');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(auditMiddleware); // Log all PHI access

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Routes
app.use('/api/auth', authRoutes);

// Settings Routes
app.use('/api/settings', settingsRoutes);

// ----- Triage Routes -----
app.get('/api/appointment-types/:clinicId/:category', async (req, res) => {
    try {
        const { clinicId, category } = req.params;
        const result = await triageController.getAppointmentTypes({ clinicId, category });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/triage', uploadSinglePhoto, async (req, res) => {
    try {
        const triageData = {
            ...req.body,
            photoUrl: getPhotoUrl(req)
        };

        // Validate
        const validation = validateTriageData(triageData);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const result = await triageController.processTriage({
            clinicId: req.body.clinicId || 1, // Default clinic for MVP
            triageData
        });

        // If emergency, send alert
        if (result.emergencyFlag) {
            await triageController.sendEmergencyAlert({
                patientName: triageData.patientName,
                symptoms: triageData.symptoms,
                photoUrl: triageData.photoUrl
            });
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- Appointment Routes -----
app.get('/api/available-slots', async (req, res) => {
    try {
        const { clinicId, appointmentTypeId, date } = req.query;
        const result = await appointmentController.getAvailableSlots({
            clinicId: parseInt(clinicId),
            appointmentTypeId: parseInt(appointmentTypeId),
            date
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/appointments', async (req, res) => {
    try {
        const { appointmentDatetime } = req.body;

        // Validate appointment time
        const timeValidation = isValidAppointmentTime(appointmentDatetime);
        if (!timeValidation.valid) {
            return res.status(400).json({ error: timeValidation.error });
        }

        const result = await appointmentController.createAppointment(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/appointments/:id', async (req, res) => {
    try {
        const result = await appointmentController.getAppointment({
            appointmentId: parseInt(req.params.id)
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/appointments/clinic/:clinicId', async (req, res) => {
    try {
        const result = await appointmentController.getUpcomingAppointments({
            clinicId: parseInt(req.params.clinicId),
            limit: parseInt(req.query.limit) || 50
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/appointments/:id/status', async (req, res) => {
    try {
        const result = await appointmentController.updateAppointmentStatus({
            appointmentId: parseInt(req.params.id),
            status: req.body.status
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- Confirmation Routes -----
app.post('/api/confirmations/:id/respond', async (req, res) => {
    try {
        const result = await processConfirmationResponse({
            appointmentId: parseInt(req.params.id),
            response: req.body.response
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- Waitlist Routes -----
app.post('/api/waitlist', async (req, res) => {
    try {
        const result = await addToWaitlist(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/waitlist/:id/claim', async (req, res) => {
    try {
        const result = await claimWaitlistSlot({
            waitlistId: parseInt(req.params.id),
            patientId: parseInt(req.body.patientId)
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/waitlist/position', async (req, res) => {
    try {
        const { clinicId, appointmentDatetime, patientId } = req.query;
        const result = await getWaitlistPosition({
            clinicId: parseInt(clinicId),
            appointmentDatetime,
            patientId: parseInt(patientId)
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- Payment Routes -----
app.post('/api/payments/authorize', async (req, res) => {
    try {
        const result = await authorizeDeposit(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/payments/:appointmentId/charge', async (req, res) => {
    try {
        const result = await chargeDeposit({
            appointmentId: parseInt(req.params.appointmentId),
            reason: req.body.reason
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/payments/:appointmentId/refund', async (req, res) => {
    try {
        const result = await refundDeposit({
            appointmentId: parseInt(req.params.appointmentId),
            reason: req.body.reason
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- SMS Routes (Admin) -----
app.get('/api/sms/logs', async (req, res) => {
    try {
        const logs = await getSMSLogs({
            limit: parseInt(req.query.limit) || 50,
            type: req.query.type
        });
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sms/pending', async (req, res) => {
    try {
        const logs = await getPendingSMSResponses();
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sms/:id/respond', async (req, res) => {
    try {
        const result = await logSMSResponse({
            smsId: parseInt(req.params.id),
            response: req.body.response
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- Insurance Upload Route -----
app.post('/api/insurance-upload', uploadInsuranceCard, (req, res) => {
    try {
        const insuranceUrl = getPhotoUrl(req);
        res.json({ success: true, insuranceUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Initialize and Start Server
// ============================================

async function startServer() {
    try {
        console.log('🏥 Starting Dermatology Booking System...\n');

        // Seed database with demo data
        await seedDatabase();

        // Start background scheduler
        startScheduler();

        // Start Express server
        app.listen(config.port, config.host, () => {
            console.log(`\n✅ Server running on http://${config.host}:${config.port}`);
            console.log(`📊 Admin Dashboard: http://${config.host}:${config.port}/admin.html`);
            console.log(`📝 Book Appointment: http://${config.host}:${config.port}/booking.html`);
            console.log(`\n💡 Press Ctrl+C to stop\n`);
        });
    } catch (error) {
        console.error('❌ Error starting server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    process.exit(0);
});

// Start the server
// Start the server if run directly
if (require.main === module) {
    startServer();
}

module.exports = app;
