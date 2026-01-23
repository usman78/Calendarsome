/**
 * Validation utilities
 */

/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone number (US format)
 */
function isValidPhone(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if it's 10 or 11 digits (with or without country code)
    return cleaned.length === 10 || cleaned.length === 11;
}

/**
 * Format phone number for storage
 */
function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    } else if (cleaned.length === 11) {
        return cleaned.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '+$1-$2-$3-$4');
    }

    return phone;
}

/**
 * Validate appointment datetime
 */
function isValidAppointmentTime(datetime) {
    const appointmentDate = new Date(datetime);
    const now = new Date();

    // Can't be in the past
    if (appointmentDate <= now) {
        return { valid: false, error: 'Appointment cannot be in the past' };
    }

    // Can't be more than 6 months in the future
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    if (appointmentDate > sixMonthsFromNow) {
        return { valid: false, error: 'Appointment cannot be more than 6 months in the future' };
    }

    return { valid: true };
}

/**
 * Validate upload file
 */
function isValidPhotoFile(file, maxSize = 5 * 1024 * 1024) {
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];

    if (!allowedTypes.includes(file.mimetype)) {
        return { valid: false, error: 'Invalid file type. Only JPEG and PNG allowed' };
    }

    if (file.size > maxSize) {
        return { valid: false, error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB` };
    }

    return { valid: true };
}

/**
 * Sanitize input string
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    // Remove potentially dangerous characters
    return input
        .trim()
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Validate triage data completeness
 */
function validateTriageData(triageData) {
    const required = ['patientStatus', 'category', 'appointmentTypeId', 'patientName', 'patientEmail', 'patientPhone'];

    for (const field of required) {
        if (!triageData[field]) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }

    // Validate email
    if (!isValidEmail(triageData.patientEmail)) {
        return { valid: false, error: 'Invalid email address' };
    }

    // Validate phone
    if (!isValidPhone(triageData.patientPhone)) {
        return { valid: false, error: 'Invalid phone number' };
    }

    // Category-specific validation
    if (triageData.category === 'medical' && !triageData.symptoms) {
        return { valid: false, error: 'Symptoms required for medical appointments' };
    }

    return { valid: true };
}

module.exports = {
    isValidEmail,
    isValidPhone,
    formatPhone,
    isValidAppointmentTime,
    isValidPhotoFile,
    sanitizeInput,
    validateTriageData
};
