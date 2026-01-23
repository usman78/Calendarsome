const { runAsync, getAsync, allAsync } = require('../database');
const { sendSMS } = require('./smsService');
const { chargeDeposit } = require('./paymentService');
const { releaseSlotToWaitlist } = require('./waitlistService');
const { logAudit } = require('../utils/auditLogger');
const config = require('../config');

/**
 * Confirmation Service - Graduated Commitment Escalation
 * 
 * Timeline:
 * T-72h: First SMS confirmation request
 * T-48h: Second reminder if no response
 * T-24h: Auto-cancel + waitlist release if still no response
 */

/**
 * Send initial confirmation request (T-72h before appointment)
 */
async function sendInitialConfirmation({ appointmentId }) {
    try {
        const appointment = await getAsync(`
      SELECT a.*, p.name, p.phone, at.name as type_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN appointment_types at ON a.appointment_type_id = at.id
      WHERE a.id = ?
    `, [appointmentId]);

        if (!appointment) {
            return { success: false, error: 'Appointment not found' };
        }

        // Create or get confirmation record
        let confirmation = await getAsync(`
      SELECT * FROM confirmations WHERE appointment_id = ?
    `, [appointmentId]);

        if (!confirmation) {
            const result = await runAsync(`
        INSERT INTO confirmations (appointment_id, sent_at_72h, reminder_count)
        VALUES (?, CURRENT_TIMESTAMP, 1)
      `, [appointmentId]);
            confirmation = { id: result.id };
        } else {
            await runAsync(`
        UPDATE confirmations
        SET sent_at_72h = CURRENT_TIMESTAMP, reminder_count = reminder_count + 1
        WHERE id = ?
      `, [confirmation.id]);
        }

        // Send SMS
        const appointmentDate = new Date(appointment.appointment_datetime).toLocaleString();
        const confirmUrl = `http://localhost:3000/confirm.html?id=${appointmentId}&token=${confirmation.id}`;
        const message = `Hi ${appointment.name}! Confirming your ${appointment.type_name} appointment on ${appointmentDate}. Reply YES to confirm or click: ${confirmUrl}`;

        await sendSMS({
            phone: appointment.phone,
            message,
            type: 'confirmation',
            appointmentId
        });

        await logAudit({
            action: 'UPDATE',
            tableName: 'confirmations',
            recordId: confirmation.id,
            newValue: { stage: '72h_confirmation_sent' }
        });

        return { success: true, confirmationId: confirmation.id };
    } catch (error) {
        console.error('Error sending confirmation:', error);
        throw error;
    }
}

/**
 * Send reminder (T-48h before appointment)
 */
async function sendReminder({ appointmentId }) {
    try {
        const appointment = await getAsync(`
      SELECT a.*, p.name, p.phone, at.name as type_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN appointment_types at ON a.appointment_type_id = at.id
      WHERE a.id = ?
    `, [appointmentId]);

        if (!appointment || appointment.status !== 'pending') {
            return { success: false, error: 'Appointment not pending' };
        }

        // Update confirmation record
        await runAsync(`
      UPDATE confirmations
      SET sent_at_48h = CURRENT_TIMESTAMP, reminder_count = reminder_count + 1
      WHERE appointment_id = ?
    `, [appointmentId]);

        // Send reminder SMS
        const appointmentDate = new Date(appointment.appointment_datetime).toLocaleString();
        const message = `⏰ REMINDER: Your appointment is in 2 days (${appointmentDate}). Please confirm or cancel. Reply YES to confirm, NO to cancel.`;

        await sendSMS({
            phone: appointment.phone,
            message,
            type: 'reminder',
            appointmentId
        });

        return { success: true };
    } catch (error) {
        console.error('Error sending reminder:', error);
        throw error;
    }
}

/**
 * Process confirmation response (YES/NO)
 */
async function processConfirmationResponse({ appointmentId, response }) {
    try {
        response = response.toUpperCase().trim();

        if (response === 'YES' || response === 'CONFIRM') {
            // Confirm appointment
            await runAsync(`
        UPDATE appointments
        SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [appointmentId]);

            await runAsync(`
        UPDATE confirmations
        SET response = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
        WHERE appointment_id = ?
      `, [appointmentId]);

            await logAudit({
                action: 'UPDATE',
                tableName: 'appointments',
                recordId: appointmentId,
                newValue: { status: 'confirmed' }
            });

            return { success: true, status: 'confirmed', message: 'Appointment confirmed!' };

        } else if (response === 'NO' || response === 'CANCEL') {
            // Cancel and release to waitlist
            const appointment = await getAsync('SELECT * FROM appointments WHERE id = ?', [appointmentId]);

            await runAsync(`
        UPDATE appointments
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [appointmentId]);

            await runAsync(`
        UPDATE confirmations
        SET response = 'declined'
        WHERE appointment_id = ?
      `, [appointmentId]);

            // Release to waitlist
            await releaseSlotToWaitlist({
                clinicId: appointment.clinic_id,
                appointmentDatetime: appointment.appointment_datetime,
                originalAppointmentId: appointmentId
            });

            return { success: true, status: 'cancelled', message: 'Appointment cancelled. Slot released to waitlist.' };

        } else {
            return { success: false, error: 'Invalid response. Reply YES to confirm or NO to cancel.' };
        }
    } catch (error) {
        console.error('Error processing confirmation:', error);
        throw error;
    }
}

/**
 * Auto-cancel unconfirmed appointments (T-24h)
 * Called by scheduler
 */
async function autoCancelUnconfirmed() {
    try {
        // Find appointments that are:
        // 1. Still pending (not confirmed)
        // 2. Within 24 hours
        // 3. Had confirmation sent >48h ago
        const unconfirmed = await allAsync(`
      SELECT a.*, c.sent_at_72h
      FROM appointments a
      JOIN confirmations c ON a.id = c.appointment_id
      WHERE a.status = 'pending'
        AND a.appointment_datetime <= datetime('now', '+24 hours')
        AND c.sent_at_72h <= datetime('now', '-48 hours')
        AND c.response = 'pending'
    `);

        console.log(`[AUTO-CANCEL] Found ${unconfirmed.length} unconfirmed appointments`);

        for (const appointment of unconfirmed) {
            // Cancel appointment
            await runAsync(`
        UPDATE appointments
        SET status = 'waitlist-released', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [appointment.id]);

            // Release to waitlist
            await releaseSlotToWaitlist({
                clinicId: appointment.clinic_id,
                appointmentDatetime: appointment.appointment_datetime,
                originalAppointmentId: appointment.id
            });

            console.log(`[AUTO-CANCEL] Cancelled appointment ${appointment.id} and released to waitlist`);
        }

        return { success: true, cancelled: unconfirmed.length };
    } catch (error) {
        console.error('Error auto-canceling:', error);
        throw error;
    }
}

/**
 * Charge no-show deposits
 * Called by scheduler after appointment time passes
 */
async function processNoShows() {
    try {
        // Find confirmed appointments that are past their time and not marked as completed
        const noShows = await allAsync(`
      SELECT a.*, at.category
      FROM appointments a
      JOIN appointment_types at ON a.appointment_type_id = at.id
      WHERE a.status = 'confirmed'
        AND a.appointment_datetime < datetime('now', '-15 minutes')
    `);

        console.log(`[NO-SHOW] Found ${noShows.length} potential no-shows`);

        for (const appointment of noShows) {
            // Mark as no-show
            await runAsync(`
        UPDATE appointments
        SET status = 'no-show', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [appointment.id]);

            // Charge deposit if cosmetic
            if (appointment.category === 'cosmetic' && appointment.deposit_amount > 0) {
                await chargeDeposit({
                    appointmentId: appointment.id,
                    reason: 'no-show'
                });

                console.log(`[NO-SHOW] Charged $${appointment.deposit_amount} for appointment ${appointment.id}`);
            }
        }

        return { success: true, processed: noShows.length };
    } catch (error) {
        console.error('Error processing no-shows:', error);
        throw error;
    }
}

module.exports = {
    sendInitialConfirmation,
    sendReminder,
    processConfirmationResponse,
    autoCancelUnconfirmed,
    processNoShows
};
