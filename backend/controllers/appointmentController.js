const { runAsync, getAsync, allAsync } = require('../database');
const { authorizeDeposit } = require('../services/paymentService');
const { sendInitialConfirmation } = require('../services/confirmationService');
const { addToWaitlist } = require('../services/waitlistService');
const { logAudit } = require('../utils/auditLogger');

/**
 * Appointment Controller
 * Handles appointment CRUD and state management
 */

/**
 * Get available time slots for a specific date and appointment type
 */
async function getAvailableSlots({ clinicId, appointmentTypeId, date }) {
    try {
        // Get appointment type to know duration
        const appointmentType = await getAsync(`
      SELECT * FROM appointment_types WHERE id = ?
    `, [appointmentTypeId]);

        if (!appointmentType) {
            return { success: false, error: 'Appointment type not found' };
        }

        // Get clinic settings
        const clinic = await getAsync(`
      SELECT * FROM clinics WHERE id = ?
    `, [clinicId]);

        const settings = JSON.parse(clinic.settings);
        const businessHours = settings.businessHours;

        // Get day of week
        const dateObj = new Date(date);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const dayHours = businessHours[dayName];

        if (!dayHours) {
            return { success: true, slots: [] }; // Clinic closed
        }

        // Get providers available for this appointment type
        const providers = await allAsync(`
      SELECT * FROM providers
      WHERE clinic_id = ? AND is_active = 1
    `, [clinicId]);

        if (providers.length === 0) {
            return { success: false, error: 'No providers available' };
        }

        // Generate potential slots based on business hours
        const slots = [];
        const [startHour, startMin] = dayHours.start.split(':').map(Number);
        const [endHour, endMin] = dayHours.end.split(':').map(Number);

        let currentTime = new Date(date);
        currentTime.setHours(startHour, startMin, 0, 0);

        const endTime = new Date(date);
        endTime.setHours(endHour, endMin, 0, 0);

        while (currentTime < endTime) {
            slots.push(new Date(currentTime));
            currentTime.setMinutes(currentTime.getMinutes() + appointmentType.duration_mins);
        }

        // Check which slots are already booked
        const bookedSlots = await allAsync(`
      SELECT appointment_datetime, duration_mins
      FROM appointments
      WHERE clinic_id = ?
        AND DATE(appointment_datetime) = DATE(?)
        AND status IN ('pending', 'confirmed')
    `, [clinicId, date]);

        // Filter out booked slots
        const availableSlots = slots.filter(slot => {
            return !bookedSlots.some(booked => {
                const bookedStart = new Date(booked.appointment_datetime);
                const bookedEnd = new Date(bookedStart.getTime() + booked.duration_mins * 60000);
                const slotEnd = new Date(slot.getTime() + appointmentType.duration_mins * 60000);

                // Check for overlap
                return (slot >= bookedStart && slot < bookedEnd) ||
                    (slotEnd > bookedStart && slotEnd <= bookedEnd);
            });
        });

        return {
            success: true,
            slots: availableSlots.map(slot => ({
                datetime: slot.toISOString(),
                display: slot.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            }))
        };
    } catch (error) {
        console.error('Error getting available slots:', error);
        throw error;
    }
}

/**
 * Create a new appointment
 */
async function createAppointment({
    patientId,
    clinicId,
    appointmentTypeId,
    appointmentDatetime,
    triageData,
    photoUrl,
    emergencyFlag,
    cardToken
}) {
    try {
        // Get appointment type
        const appointmentType = await getAsync(`
      SELECT * FROM appointment_types WHERE id = ?
    `, [appointmentTypeId]);

        if (!appointmentType) {
            return { success: false, error: 'Appointment type not found' };
        }

        // Create appointment
        const result = await runAsync(`
      INSERT INTO appointments (
        patient_id, clinic_id, appointment_type_id, appointment_datetime,
        duration_mins, deposit_amount, triage_data, photo_url, emergency_flag,
        status, patient_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [
            patientId,
            clinicId,
            appointmentTypeId,
            appointmentDatetime,
            appointmentType.duration_mins,
            appointmentType.deposit_amount,
            JSON.stringify(triageData),
            photoUrl || null,
            emergencyFlag ? 1 : 0,
            triageData.patientStatus || 'new'
        ]);

        const appointmentId = result.id;

        await logAudit({
            action: 'CREATE',
            tableName: 'appointments',
            recordId: appointmentId,
            newValue: { patientId, clinicId, appointmentTypeId, datetime: appointmentDatetime }
        });

        // Handle deposit if required
        if (appointmentType.requires_deposit && appointmentType.deposit_amount > 0) {
            if (!cardToken) {
                // Rollback appointment
                await runAsync('DELETE FROM appointments WHERE id = ?', [appointmentId]);
                return { success: false, error: 'Card required for cosmetic appointments' };
            }

            await authorizeDeposit({
                appointmentId,
                amount: appointmentType.deposit_amount,
                cardToken
            });
        }

        // Schedule confirmation SMS for T-72h
        // In production: Use a job queue (Bull, Agenda, etc.)
        // For MVP: The scheduler service will check periodically

        return {
            success: true,
            appointmentId,
            appointmentDatetime,
            requiresDeposit: appointmentType.requires_deposit === 1,
            depositAmount: appointmentType.deposit_amount
        };
    } catch (error) {
        console.error('Error creating appointment:', error);
        throw error;
    }
}

/**
 * Get appointment by ID
 */
async function getAppointment({ appointmentId }) {
    try {
        const appointment = await getAsync(`
      SELECT a.*, p.name as patient_name, p.email, p.phone,
             at.name as type_name, at.category,
             c.name as clinic_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN appointment_types at ON a.appointment_type_id = at.id
      JOIN clinics c ON a.clinic_id = c.id
      WHERE a.id = ?
    `, [appointmentId]);

        if (!appointment) {
            return { success: false, error: 'Appointment not found' };
        }

        // Parse triage data
        if (appointment.triage_data) {
            appointment.triage_data = JSON.parse(appointment.triage_data);
        }

        return { success: true, appointment };
    } catch (error) {
        console.error('Error getting appointment:', error);
        throw error;
    }
}

/**
 * Update appointment status
 */
async function updateAppointmentStatus({ appointmentId, status }) {
    try {
        const validStatuses = ['pending', 'confirmed', 'completed', 'no-show', 'cancelled', 'waitlist-released'];

        if (!validStatuses.includes(status)) {
            return { success: false, error: 'Invalid status' };
        }

        await runAsync(`
      UPDATE appointments
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, appointmentId]);

        await logAudit({
            action: 'UPDATE',
            tableName: 'appointments',
            recordId: appointmentId,
            newValue: { status }
        });

        return { success: true };
    } catch (error) {
        console.error('Error updating appointment status:', error);
        throw error;
    }
}

/**
 * Get upcoming appointments for a clinic
 */
async function getUpcomingAppointments({ clinicId, limit = 50 }) {
    try {
        const appointments = await allAsync(`
      SELECT a.*, p.name as patient_name, p.phone,
             at.name as type_name, at.category,
             c.response as confirmation_status
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN appointment_types at ON a.appointment_type_id = at.id
      LEFT JOIN confirmations c ON a.id = c.appointment_id
      WHERE a.clinic_id = ? 
        AND a.appointment_datetime >= datetime('now')
        AND a.status IN ('pending', 'confirmed')
      ORDER BY a.appointment_datetime ASC
      LIMIT ?
    `, [clinicId, limit]);

        return { success: true, appointments };
    } catch (error) {
        console.error('Error getting upcoming appointments:', error);
        throw error;
    }
}

module.exports = {
    getAvailableSlots,
    createAppointment,
    getAppointment,
    updateAppointmentStatus,
    getUpcomingAppointments
};
