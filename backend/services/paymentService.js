const { runAsync, getAsync } = require('../database');
const { logAudit } = require('../utils/auditLogger');
const { v4: uuidv4 } = require('uuid');

/**
 * Mock Payment Service (Stripe simulation)
 * Handles deposit authorization, charging, and refunds
 */

/**
 * Authorize deposit (hold on card, not charged yet)
 * In production: Stripe PaymentIntent with capture_method='manual'
 */
async function authorizeDeposit({ appointmentId, amount, cardToken }) {
    try {
        // Mock Stripe authorization
        const mockStripeId = `pi_mock_${uuidv4()}`;

        const result = await runAsync(`
      INSERT INTO payments (appointment_id, amount, status, mock_stripe_id)
      VALUES (?, ?, 'authorized', ?)
    `, [appointmentId, amount, mockStripeId]);

        console.log(`💳 [MOCK PAYMENT] Authorized $${amount} for appointment ${appointmentId}`);
        console.log(`   Stripe ID: ${mockStripeId}`);

        await logAudit({
            action: 'CREATE',
            tableName: 'payments',
            recordId: result.id,
            newValue: { appointmentId, amount, status: 'authorized' }
        });

        return {
            success: true,
            paymentId: result.id,
            stripeId: mockStripeId,
            amount,
            status: 'authorized'
        };
    } catch (error) {
        console.error('Error authorizing deposit:', error);
        throw error;
    }
}

/**
 * Charge deposit (on no-show or at T-24h)
 */
async function chargeDeposit({ appointmentId, reason = 'no-show' }) {
    try {
        // Find existing authorization
        const payment = await getAsync(`
      SELECT * FROM payments
      WHERE appointment_id = ? AND status = 'authorized'
      ORDER BY created_at DESC
      LIMIT 1
    `, [appointmentId]);

        if (!payment) {
            return { success: false, error: 'No authorized payment found' };
        }

        // Charge it
        await runAsync(`
      UPDATE payments
      SET status = 'charged', charged_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [payment.id]);

        console.log(`💳 [MOCK PAYMENT] Charged $${payment.amount} for appointment ${appointmentId}`);
        console.log(`   Reason: ${reason}`);

        await logAudit({
            action: 'UPDATE',
            tableName: 'payments',
            recordId: payment.id,
            oldValue: { status: 'authorized' },
            newValue: { status: 'charged', reason }
        });

        // Calculate platform fee (currently 0% for MVP)
        const clinicAmount = payment.amount; // 100% to clinic
        const platformFee = 0;

        return {
            success: true,
            paymentId: payment.id,
            amount: payment.amount,
            clinicAmount,
            platformFee,
            status: 'charged'
        };
    } catch (error) {
        console.error('Error charging deposit:', error);
        throw error;
    }
}

/**
 * Refund deposit (clinic cancellation or patient cancels >48h)
 */
async function refundDeposit({ appointmentId, reason }) {
    try {
        // Find charged payment
        const payment = await getAsync(`
      SELECT * FROM payments
      WHERE appointment_id = ? AND status IN ('authorized', 'charged')
      ORDER BY created_at DESC
      LIMIT 1
    `, [appointmentId]);

        if (!payment) {
            return { success: false, error: 'No payment found to refund' };
        }

        // Refund it
        await runAsync(`
      UPDATE payments
      SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP, refund_reason = ?
      WHERE id = ?
    `, [reason, payment.id]);

        console.log(`💳 [MOCK PAYMENT] Refunded $${payment.amount} for appointment ${appointmentId}`);
        console.log(`   Reason: ${reason}`);

        await logAudit({
            action: 'UPDATE',
            tableName: 'payments',
            recordId: payment.id,
            oldValue: { status: payment.status },
            newValue: { status: 'refunded', reason }
        });

        return {
            success: true,
            paymentId: payment.id,
            amount: payment.amount,
            status: 'refunded'
        };
    } catch (error) {
        console.error('Error refunding deposit:', error);
        throw error;
    }
}

/**
 * Get payment status for an appointment
 */
async function getPaymentStatus({ appointmentId }) {
    try {
        const payment = await getAsync(`
      SELECT * FROM payments
      WHERE appointment_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [appointmentId]);

        return payment || null;
    } catch (error) {
        console.error('Error getting payment status:', error);
        throw error;
    }
}

/**
 * Calculate refund amount based on cancellation timing
 */
function calculateRefund({ depositAmount, hoursUntilAppointment }) {
    if (hoursUntilAppointment > 48) {
        return depositAmount; // Full refund
    } else if (hoursUntilAppointment >= 24) {
        return depositAmount * 0.5; // 50% refund
    } else {
        return 0; // No refund
    }
}

module.exports = {
    authorizeDeposit,
    chargeDeposit,
    refundDeposit,
    getPaymentStatus,
    calculateRefund
};
