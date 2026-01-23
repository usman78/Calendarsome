const { runAsync, allAsync } = require('../database');
const { logAudit } = require('../utils/auditLogger');

/**
 * Mock SMS Service
 * Simulates Twilio/SMS provider for MVP
 * Stores all messages in sms_log table for review
 */

/**
 * Send SMS message (mock implementation)
 */
async function sendSMS({ phone, message, type, appointmentId = null }) {
    try {
        // In production, this would call Twilio API:
        // const twilio = require('twilio')(accountSid, authToken);
        // await twilio.messages.create({ body: message, to: phone, from: twilioPhone });

        // For MVP: Log to database and console
        const result = await runAsync(`
      INSERT INTO sms_log (recipient_phone, message, type, appointment_id, status)
      VALUES (?, ?, ?, ?, 'sent')
    `, [phone, message, type, appointmentId]);

        console.log(`📱 [MOCK SMS] To: ${phone} | Type: ${type}`);
        console.log(`   Message: ${message}`);

        await logAudit({
            action: 'CREATE',
            tableName: 'sms_log',
            recordId: result.id,
            newValue: { phone, type, appointmentId }
        });

        return {
            success: true,
            smsId: result.id,
            mockSid: `SMS_MOCK_${Date.now()}_${result.id}`
        };
    } catch (error) {
        console.error('Error sending SMS:', error);
        throw error;
    }
}

/**
 * Log SMS response (when patient replies)
 */
async function logSMSResponse({ smsId, response }) {
    try {
        await runAsync(`
      UPDATE sms_log
      SET response = ?, responded_at = CURRENT_TIMESTAMP, status = 'delivered'
      WHERE id = ?
    `, [response, smsId]);

        console.log(`📱 [SMS RESPONSE] ID: ${smsId} | Response: ${response}`);

        return { success: true };
    } catch (error) {
        console.error('Error logging SMS response:', error);
        throw error;
    }
}

/**
 * Get all SMS logs (for admin dashboard)
 */
async function getSMSLogs({ limit = 50, type = null }) {
    try {
        let sql = `
      SELECT s.*, a.appointment_datetime
      FROM sms_log s
      LEFT JOIN appointments a ON s.appointment_id = a.id
    `;

        const params = [];
        if (type) {
            sql += ' WHERE s.type = ?';
            params.push(type);
        }

        sql += ' ORDER BY s.sent_at DESC LIMIT ?';
        params.push(limit);

        const logs = await allAsync(sql, params);
        return logs;
    } catch (error) {
        console.error('Error getting SMS logs:', error);
        throw error;
    }
}

/**
 * Get pending SMS responses (confirmations waiting for reply)
 */
async function getPendingSMSResponses() {
    try {
        const logs = await allAsync(`
      SELECT s.*, a.appointment_datetime, p.name as patient_name
      FROM sms_log s
      JOIN appointments a ON s.appointment_id = a.id
      JOIN patients p ON a.patient_id = p.id
      WHERE s.type IN ('confirmation', 'reminder')
        AND s.response IS NULL
        AND s.sent_at > datetime('now', '-72 hours')
      ORDER BY s.sent_at DESC
    `);

        return logs;
    } catch (error) {
        console.error('Error getting pending SMS:', error);
        throw error;
    }
}

module.exports = {
    sendSMS,
    logSMSResponse,
    getSMSLogs,
    getPendingSMSResponses
};
