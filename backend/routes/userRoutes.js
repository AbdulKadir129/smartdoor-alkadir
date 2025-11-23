const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Password salah' });
        }

        req.session.userId = user._id;
        res.json({ success: true, message: 'Login berhasil', user: { username: user.username, userType: user.userType } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logout berhasil' });
});

// GET users by device
router.get('/device/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const users = await User.find({ device }).select('-password');
        res.json({ success: true, count: users.length, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST tambah user baru
router.post('/add', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.json({ success: true, message: 'User berhasil ditambahkan', data: user });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Username sudah ada' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE user
router.delete('/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'User berhasil dihapus' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
