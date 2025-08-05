const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('./db');
const router = express.Router();

// Registration
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2)',
            [username, hashedPassword]
        );
        req.session.user = username;
        res.json({ success: true, message: "Registration successful" });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: "Username already exists" });
        } else {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        }
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: "Invalid credentials" });

        req.session.user = username;
        res.json({ success: true, message: "Login successful" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "Logout failed" });
        res.json({ success: true, message: "Logged out" });
    });
});

module.exports = router;
