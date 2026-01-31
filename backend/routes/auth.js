const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const config = require('../config');

// Hardcoded for MVP - In production, use database hash
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'password123'
};

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_123';

/**
 * @route POST /api/auth/login
 * @desc Authenticate admin and get token
 */
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        // Create token
        const token = jwt.sign(
            { id: 1, role: 'admin', username: username }, // Payload
            JWT_SECRET,
            { expiresIn: '24h' } // Options
        );

        return res.json({
            success: true,
            token,
            user: { username }
        });
    }

    return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
    });
});

/**
 * Middleware to verify JWT token
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

module.exports = { router, authenticateToken };
