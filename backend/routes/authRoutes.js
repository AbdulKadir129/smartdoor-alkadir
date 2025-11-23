const express = require('express');
const router = express.Router();
const AuthLog = require('../models/AuthLog');


// GET semua auth logs
router.get('/logs', async (req, res) => {
    try {
        const logs = await AuthLog.find().sort({ timestamp: -1 }).limit(100);
        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// GET auth logs by device
router.get('/logs/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const logs = await AuthLog.find({ device }).sort({ timestamp: -1 }).limit(100);
        res.json({ success: true, device, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// POST auth log baru (dari ESP32 via MQTT)
router.post('/log', async (req, res) => {
    try {
        // --- PERBAIKAN TANGGAL (Logika yang sama dengan paramRoutes) ---
        const logData = { ...req.body };
        delete logData.timestamp; // Hapus waktu 1970 dari ESP32
        // ---------------------------------------------------------------


        const authLog = new AuthLog(logData); // Gunakan logData, BUKAN req.body
        await authLog.save();
        res.json({ success: true, data: authLog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// GET statistik auth
router.get('/stats/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const total = await AuthLog.countDocuments({ device });
        const success = await AuthLog.countDocuments({ device, status: 'success' });
        const failed = await AuthLog.countDocuments({ device, status: 'failed' });
        
        res.json({
            success: true,
            device,
            stats: { total, success, failed }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// 🆕 TAMBAHAN BARU: DELETE auth logs by device
router.delete('/logs/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const result = await AuthLog.deleteMany({ device });
        res.json({ 
            success: true, 
            message: `Deleted ${result.deletedCount} auth logs for ${device}`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// 🆕 TAMBAHAN BARU: DELETE all auth logs (semua device)
router.delete('/logs', async (req, res) => {
    try {
        const result = await AuthLog.deleteMany({});
        res.json({ 
            success: true, 
            message: `Deleted all ${result.deletedCount} auth logs`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = router;
