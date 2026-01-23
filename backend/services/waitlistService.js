const { runAsync, getAsync, allAsync, db } = require('../database');
const { sendSMS } = require('./smsService');
const { logAudit } = require('../utils/auditLogger');
const config = require('../config');

/**
 * Waitlist Service with Race Condition Prevention
 * 
 * Race Condition Solution:
 * When a slot opens, we notify top 5 waitlist patients.
 * First person to claim gets it via a database transaction with optimistic locking.
 * 
 * Flow:
 * 1. Slot opens → Blast SMS to top 5 (priority-ordered)
 * 2. Patient clicks link → Attempts to claim
 * 3. Database UPDATE with WHERE clause checks:
 *    - Slot is still available (not claimed)
 *    - Claim hasn't expired
 * 4. Only ONE update succeeds due to transaction isolation
 * 5. Others get "slot already claimed" response
 */

/**
 * Add patient to waitlist for a specific datetime
 */
async function addToWaitlist({ clinicId, appointmentDatetime, patientId, priority = 0 }) {
    try {
        // Check if patient already on waitlist for this slot
        const existing = await getAsync(`
      SELECT id FROM waitlist
      WHERE clinic_id = ? AND appointment_slot_datetime = ? AND patient_id = ?
      AND response_status = 'pending'
    `, [clinicId, appointmentDatetime, patientId]);

        if (existing) {
            return { success: false, message: 'Patient already on waitlist for this slot' };
        }

        const result = await runAsync(`
      INSERT INTO waitlist (clinic_id, appointment_slot_datetime, patient_id, priority)
      VALUES (?, ?, ?, ?)
    `, [clinicId, appointmentDatetime, patientId, priority]);

        await logAudit({
            action: 'CREATE',
            tableName: 'waitlist',
            recordId: result.id,
            newValue: { clinicId, appointmentDatetime, patientId, priority }
        });

        return { success: true, waitlistId: result.id };
    } catch (error) {
        console.error('Error adding to waitlist:', error);
        throw error;
    }
}

/**
 * Release appointment to waitlist when slot becomes available
 * This is the critical function that prevents race conditions
 */
async function releaseSlotToWaitlist({ clinicId, appointmentDatetime, originalAppointmentId }) {
    try {
        console.log(`[WAITLIST] Releasing slot: ${appointmentDatetime}`);

        // Get top N patients from waitlist (ordered by priority DESC, then created_at ASC)
        const topWaitlist = await allAsync(`
      SELECT w.*, p.name, p.phone, p.email
      FROM waitlist w
      JOIN patients p ON w.patient_id = p.id
      WHERE w.clinic_id = ? 
        AND w.appointment_slot_datetime = ?
        AND w.response_status = 'pending'
      ORDER BY w.priority DESC, w.created_at ASC
      LIMIT ?
    `, [clinicId, appointmentDatetime, config.waitlist.maxNotifications]);

        if (topWaitlist.length === 0) {
            console.log('[WAITLIST] No patients on waitlist for this slot');
            return { success: true, notified: 0 };
        }

        console.log(`[WAITLIST] Notifying ${topWaitlist.length} patients`);

        // Set claim expiration (30 minutes from now)
        const claimExpiresAt = new Date(Date.now() + config.waitlist.responseWindow);

        // Send SMS to all top waitlist patients simultaneously
        const notifications = topWaitlist.map(async (waitlistEntry) => {
            const claimUrl = `http://localhost:3000/claim-waitlist.html?token=${waitlistEntry.id}&datetime=${encodeURIComponent(appointmentDatetime)}`;
            const message = `🎯 A slot opened at ${new Date(appointmentDatetime).toLocaleString()}! Claim it now: ${claimUrl} (Link expires in 30 min)`;

            await sendSMS({
                phone: waitlistEntry.phone,
                message,
                type: 'waitlist',
                appointmentId: originalAppointmentId
            });

            // Update waitlist entry with notification timestamp and expiration
            await runAsync(`
        UPDATE waitlist
        SET notification_sent = 1, notified_at = CURRENT_TIMESTAMP, claim_expires_at = ?
        WHERE id = ?
      `, [claimExpiresAt.toISOString(), waitlistEntry.id]);

            return waitlistEntry;
        });

        await Promise.all(notifications);

        await logAudit({
            action: 'UPDATE',
            tableName: 'waitlist',
            newValue: { action: 'notification_sent', count: topWaitlist.length, datetime: appointmentDatetime }
        });

        return { success: true, notified: topWaitlist.length };

    } catch (error) {
        console.error('Error releasing slot to waitlist:', error);
        throw error;
    }
}

/**
 * Claim a waitlist slot (with race condition prevention)
 * Uses database transaction to ensure only ONE patient can claim
 */
async function claimWaitlistSlot({ waitlistId, patientId }) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // Attempt to claim the slot with optimistic locking
            // This WHERE clause ensures only one update succeeds
            db.run(`
        UPDATE waitlist
        SET response_status = 'claimed', claimed_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND patient_id = ?
          AND response_status = 'pending'
          AND claim_expires_at > CURRENT_TIMESTAMP
      `, [waitlistId, patientId], function (err) {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }

                // Check if update was successful (this.changes will be 1 if successful, 0 if not)
                if (this.changes === 0) {
                    db.run('ROLLBACK');
                    resolve({
                        success: false,
                        reason: 'slot_already_claimed_or_expired',
                        message: 'This slot has already been claimed by another patient or the claim period has expired'
                    });
                    return;
                }

                // Mark all other pending waitlist entries for this slot as expired
                db.run(`
          UPDATE waitlist
          SET response_status = 'expired'
          WHERE appointment_slot_datetime = (
            SELECT appointment_slot_datetime FROM waitlist WHERE id = ?
          )
          AND id != ?
          AND response_status = 'pending'
        `, [waitlistId, waitlistId], function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    db.run('COMMIT', (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`[WAITLIST] Slot claimed successfully by patient ${patientId}`);

                            logAudit({
                                action: 'UPDATE',
                                tableName: 'waitlist',
                                recordId: waitlistId,
                                newValue: { status: 'claimed', patientId }
                            });

                            resolve({
                                success: true,
                                waitlistId,
                                message: 'Slot claimed successfully! Please complete your booking.'
                            });
                        }
                    });
                });
            });
        });
    });
}

/**
 * Expire unclaimed waitlist slots
 * Run this periodically via cron
 */
async function expireUnclaimedSlots() {
    try {
        const result = await runAsync(`
      UPDATE waitlist
      SET response_status = 'expired'
      WHERE response_status = 'pending'
        AND notification_sent = 1
        AND claim_expires_at < CURRENT_TIMESTAMP
    `);

        if (result.changes > 0) {
            console.log(`[WAITLIST] Expired ${result.changes} unclaimed slots`);
        }

        return { expired: result.changes };
    } catch (error) {
        console.error('Error expiring waitlist slots:', error);
        throw error;
    }
}

/**
 * Get waitlist position for a patient
 */
async function getWaitlistPosition({ clinicId, appointmentDatetime, patientId }) {
    try {
        const allWaitlist = await allAsync(`
      SELECT id, patient_id
      FROM waitlist
      WHERE clinic_id = ?
        AND appointment_slot_datetime = ?
        AND response_status = 'pending'
      ORDER BY priority DESC, created_at ASC
    `, [clinicId, appointmentDatetime]);

        const position = allWaitlist.findIndex(entry => entry.patient_id === patientId);

        return {
            position: position + 1, // 1-indexed
            total: allWaitlist.length,
            inNotificationRange: position < config.waitlist.maxNotifications
        };
    } catch (error) {
        console.error('Error getting waitlist position:', error);
        throw error;
    }
}

module.exports = {
    addToWaitlist,
    releaseSlotToWaitlist,
    claimWaitlistSlot,
    expireUnclaimedSlots,
    getWaitlistPosition
};
