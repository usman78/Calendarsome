const { runAsync, getAsync, allAsync } = require('../database');
const { logAudit } = require('../utils/auditLogger');
const config = require('../config');

/**
 * Triage Controller
 * Handles the multi-step intake process: Status → Category → Details
 */

/**
 * Check for emergency keywords in triage data
 */
function checkForEmergencyFlags(triageData) {
    const text = JSON.stringify(triageData).toLowerCase();
    const emergencyKeywords = config.emergencyKeywords;

    for (const keyword of emergencyKeywords) {
        if (text.includes(keyword.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Get appointment types for a specific category
 */
async function getAppointmentTypes({ clinicId, category }) {
    try {
        const types = await allAsync(`
      SELECT * FROM appointment_types
      WHERE clinic_id = ? AND category = ? AND is_active = 1
      ORDER BY name ASC
    `, [clinicId, category]);

        return { success: true, types };
    } catch (error) {
        console.error('Error getting appointment types:', error);
        throw error;
    }
}

/**
 * Process complete triage submission
 */
async function processTriage({ clinicId, triageData }) {
    try {
        const {
            patientStatus, // 'new' or 'existing'
            category, // 'medical' or 'cosmetic'
            appointmentTypeId,
            symptoms,
            photoUrl,
            patientName,
            patientEmail,
            patientPhone,
            insurancePhotoUrl
        } = triageData;

        // 1. Check for emergency flags
        const hasEmergencyFlag = checkForEmergencyFlags({ symptoms });

        // 2. Get appointment type details
        const appointmentType = await getAsync(`
      SELECT * FROM appointment_types WHERE id = ?
    `, [appointmentTypeId]);

        if (!appointmentType) {
            return { success: false, error: 'Invalid appointment type' };
        }

        // 3. Validate requirements
        if (category === 'cosmetic' && !appointmentType.requires_deposit) {
            console.warn(`Cosmetic appointment type ${appointmentType.name} doesn't require deposit - configuration issue`);
        }

        // 4. Create patient record if new
        let patientId;
        const existingPatient = await getAsync(`
      SELECT id FROM patients WHERE email = ? OR phone = ?
    `, [patientEmail, patientPhone]);

        if (existingPatient) {
            patientId = existingPatient.id;

            // Update insurance photo if provided
            if (insurancePhotoUrl) {
                await runAsync(`
          UPDATE patients
          SET insurance_photo_url = ?, insurance_verified = 0
          WHERE id = ?
        `, [insurancePhotoUrl, patientId]);
            }
        } else {
            const patientResult = await runAsync(`
        INSERT INTO patients (name, email, phone, insurance_photo_url)
        VALUES (?, ?, ?, ?)
      `, [patientName, patientEmail, patientPhone, insurancePhotoUrl || null]);

            patientId = patientResult.id;

            await logAudit({
                action: 'CREATE',
                tableName: 'patients',
                recordId: patientId,
                newValue: { name: patientName, email: patientEmail }
            });
        }

        // 5. Return triage result with requirements
        return {
            success: true,
            patientId,
            emergencyFlag: hasEmergencyFlag,
            appointmentType: {
                id: appointmentType.id,
                name: appointmentType.name,
                category: appointmentType.category,
                duration: appointmentType.duration_mins,
                requiresDeposit: appointmentType.requires_deposit === 1,
                depositAmount: appointmentType.deposit_amount
            },
            nextStep: hasEmergencyFlag ? 'emergency_alert' : 'select_time'
        };
    } catch (error) {
        console.error('Error processing triage:', error);
        throw error;
    }
}

/**
 * Send emergency alert to clinic staff
 */
async function sendEmergencyAlert({ patientName, symptoms, photoUrl }) {
    try {
        // In production: Send email/SMS to clinic staff
        console.log(`🚨 [EMERGENCY ALERT] Patient: ${patientName}`);
        console.log(`   Symptoms: ${symptoms}`);
        if (photoUrl) {
            console.log(`   Photo: ${photoUrl}`);
        }

        // Log the alert
        await logAudit({
            action: 'CREATE',
            tableName: 'emergency_alerts',
            newValue: { patientName, symptoms, photoUrl }
        });

        // For MVP: Just console log
        // For production: Integrate with clinic's notification system

        return { success: true };
    } catch (error) {
        console.error('Error sending emergency alert:', error);
        throw error;
    }
}

module.exports = {
    getAppointmentTypes,
    processTriage,
    checkForEmergencyFlags,
    sendEmergencyAlert
};
