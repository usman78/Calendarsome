const cron = require('node-cron');
const { allAsync } = require('../database');
const { sendInitialConfirmation, sendReminder, autoCancelUnconfirmed, processNoShows } = require('../services/confirmationService');
const { expireUnclaimedSlots } = require('../services/waitlistService');

/**
 * Scheduler Service
 * Background jobs for automated appointment management
 * 
 * Jobs:
 * 1. Send T-72h confirmations
 * 2. Send T-48h reminders  
 * 3. Auto-cancel at T-24h
 * 4. Process no-shows
 * 5. Expire waitlist claims
 */

let isSchedulerRunning = false;

/**
 * Start the scheduler
 */
function startScheduler() {
    if (isSchedulerRunning) {
        console.log('[SCHEDULER] Already running');
        return;
    }

    console.log('[SCHEDULER] Starting background jobs...');

    // Job 1: Send T-72h confirmations
    // Runs every hour
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('[SCHEDULER] Checking for appointments needing 72h confirmation...');

            // Find appointments 72-73 hours away that haven't been sent confirmation
            const appointments = await allAsync(`
        SELECT a.id
        FROM appointments a
        LEFT JOIN confirmations c ON a.id = c.appointment_id
        WHERE a.status = 'pending'
          AND a.appointment_datetime >= datetime('now', '+72 hours')
          AND a.appointment_datetime <= datetime('now', '+73 hours')
          AND (c.id IS NULL OR c.sent_at_72h IS NULL)
      `);

            console.log(`[SCHEDULER] Found ${appointments.length} appointments for 72h confirmation`);

            for (const appointment of appointments) {
                await sendInitialConfirmation({ appointmentId: appointment.id });
            }
        } catch (error) {
            console.error('[SCHEDULER] Error in 72h confirmation job:', error);
        }
    });

    // Job 2: Send T-48h reminders
    // Runs every hour
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('[SCHEDULER] Checking for appointments needing 48h reminder...');

            const appointments = await allAsync(`
        SELECT a.id
        FROM appointments a
        JOIN confirmations c ON a.id = c.appointment_id
        WHERE a.status = 'pending'
          AND a.appointment_datetime >= datetime('now', '+48 hours')
          AND a.appointment_datetime <= datetime('now', '+49 hours')
          AND c.sent_at_72h IS NOT NULL
          AND c.sent_at_48h IS NULL
          AND c.response = 'pending'
      `);

            console.log(`[SCHEDULER] Found ${appointments.length} appointments for 48h reminder`);

            for (const appointment of appointments) {
                await sendReminder({ appointmentId: appointment.id });
            }
        } catch (error) {
            console.error('[SCHEDULER] Error in 48h reminder job:', error);
        }
    });

    // Job 3: Auto-cancel unconfirmed at T-24h
    // Runs every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        try {
            console.log('[SCHEDULER] Checking for appointments to auto-cancel...');
            await autoCancelUnconfirmed();
        } catch (error) {
            console.error('[SCHEDULER] Error in auto-cancel job:', error);
        }
    });

    // Job 4: Process no-shows
    // Runs every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try {
            console.log('[SCHEDULER] Checking for no-shows...');
            await processNoShows();
        } catch (error) {
            console.error('[SCHEDULER] Error in no-show job:', error);
        }
    });

    // Job 5: Expire waitlist claims
    // Runs every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            await expireUnclaimedSlots();
        } catch (error) {
            console.error('[SCHEDULER] Error expiring waitlist slots:', error);
        }
    });

    isSchedulerRunning = true;
    console.log('[SCHEDULER] All jobs scheduled successfully');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    // node-cron doesn't provide a global stop, but we can track running state
    isSchedulerRunning = false;
    console.log('[SCHEDULER] Scheduler stopped');
}

/**
 * Manually trigger a specific job (for testing)
 */
async function triggerJob(jobName) {
    console.log(`[SCHEDULER] Manually triggering job: ${jobName}`);

    switch (jobName) {
        case 'confirmations-72h':
            return await sendInitialConfirmation();
        case 'reminders-48h':
            return await sendReminder();
        case 'auto-cancel':
            return await autoCancelUnconfirmed();
        case 'no-shows':
            return await processNoShows();
        case 'expire-waitlist':
            return await expireUnclaimedSlots();
        default:
            throw new Error(`Unknown job: ${jobName}`);
    }
}

module.exports = {
    startScheduler,
    stopScheduler,
    triggerJob
};
