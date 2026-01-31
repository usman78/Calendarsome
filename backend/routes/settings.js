const express = require('express');
const router = express.Router();
const { runAsync, getAsync, allAsync } = require('../database');
const { logAudit } = require('../utils/auditLogger');
const { authenticateToken } = require('./auth');

/**
 * @route GET /api/settings
 * @desc Get all settings
 */
router.get('/', async (req, res) => {
    try {
        const rows = await allAsync('SELECT * FROM clinic_settings');
        const settings = {};

        rows.forEach(row => {
            try {
                settings[row.setting_key] = JSON.parse(row.setting_value);
            } catch (e) {
                settings[row.setting_key] = row.setting_value;
            }
        });

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * @route PUT /api/settings
 * @desc Update settings (Admin only)
 */
router.put('/', authenticateToken, async (req, res) => {
    const changes = req.body; // Expect object keys -> values

    if (!changes || Object.keys(changes).length === 0) {
        return res.status(400).json({ success: false, message: 'No settings provided' });
    }

    try {
        for (const [key, value] of Object.entries(changes)) {
            const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

            // Check if exists
            const existing = await getAsync('SELECT setting_value FROM clinic_settings WHERE setting_key = ?', [key]);

            if (existing) {
                const oldValue = existing.setting_value;
                await runAsync('UPDATE clinic_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?', [stringValue, key]);

                // Audit Log
                await logAudit({
                    action: 'UPDATE',
                    tableName: 'clinic_settings',
                    recordId: 0, // 0 for config
                    oldValue: { key, value: oldValue },
                    newValue: { key, value: stringValue },
                    userId: req.user.id
                });
            } else {
                await runAsync('INSERT INTO clinic_settings (setting_key, setting_value) VALUES (?, ?)', [key, stringValue]);

                await logAudit({
                    action: 'CREATE',
                    tableName: 'clinic_settings',
                    recordId: 0,
                    newValue: { key, value: stringValue },
                    userId: req.user.id
                });
            }
        }

        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
