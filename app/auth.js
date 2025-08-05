const express = require('express');
const bcrypt = require('bcrypt');
const User = require('./models/user');
const router = express.Router();

// Registration
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        req.session.user = username;
        res.json({ success: true, message: "Registration successful" });
    } catch (err) {
        res.status(400).json({ error: "Username already exists" });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid credentials" });
    req.session.user = username;
    res.json({ success: true, message: "Login successful" });
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "Logout failed" });
        res.json({ success: true, message: "Logged out" });
    });
});

module.exports = router;
