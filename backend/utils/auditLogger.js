const { runAsync } = require('../database');

/**
 * Audit Logger for HIPAA compliance
 * Logs all access to PHI (Protected Health Information)
 */

async function logAudit({
    userEmail = 'system',
    action,
    tableName,
    recordId = null,
    oldValue = null,
    newValue = null,
    ipAddress = null,
    userAgent = null
}) {
    try {
        const sql = `
      INSERT INTO audit_log (
        user_email, action, table_name, record_id, 
        old_value, new_value, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const params = [
            userEmail,
            action,
            tableName,
            recordId,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            ipAddress,
            userAgent
        ];

        await runAsync(sql, params);

        // For production: Also log to external logging service (e.g., CloudWatch, Splunk)
        if (process.env.NODE_ENV === 'production') {
            console.log(`[AUDIT] ${action} on ${tableName}:${recordId} by ${userEmail}`);
        }
    } catch (error) {
        // CRITICAL: Audit logging failure should never break the application
        // but should be monitored closely
        console.error('AUDIT LOG FAILURE:', error);

        // In production, send alert to monitoring service
        // This is a critical security event
    }
}

/**
 * Middleware to automatically log PHI access in HTTP requests
 * Note: For MVP, we're not implementing full auth, but this shows the pattern
 */
function auditMiddleware(req, res, next) {
    // Capture original methods
    const originalSend = res.send;

    res.send = function (data) {
        // Log successful responses that contain PHI
        if (res.statusCode === 200 && req.method === 'GET') {
            // Determine if this endpoint accesses PHI
            const phiEndpoints = ['/api/appointments', '/api/patients', '/api/photos'];
            const isPHI = phiEndpoints.some(endpoint => req.path.includes(endpoint));

            if (isPHI) {
                logAudit({
                    userEmail: req.user?.email || 'anonymous',
                    action: 'READ',
                    tableName: extractTableFromPath(req.path),
                    recordId: req.params.id || null,
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent')
                }).catch(err => console.error('Audit log error:', err));
            }
        }

        originalSend.call(this, data);
    };

    next();
}

function extractTableFromPath(path) {
    if (path.includes('appointment')) return 'appointments';
    if (path.includes('patient')) return 'patients';
    if (path.includes('photo')) return 'photos';
    return 'unknown';
}

module.exports = {
    logAudit,
    auditMiddleware
};
