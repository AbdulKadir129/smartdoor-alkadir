const express = require('express');
const router = express.Router();
const AuthLog = require('../models/AuthLog');


// GET semua auth logs (Terbaru - max 100)
router.get('/logs', async (req, res) => {
    try {
        const logs = await AuthLog.find().sort({ timestamp: -1 }).limit(100);
        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// GET auth logs berdasarkan device (Terbaru - max 100)
router.get('/logs/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const logs = await AuthLog.find({ device }).sort({ timestamp: -1 }).limit(100);
        res.json({ success: true, device, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// POST auth log baru (Digunakan oleh server.js untuk sinkronisasi dari MQTT)
router.post('/log', async (req, res) => {
    try {
        // --- PERBAIKAN TANGGAL (Logika yang sama dengan paramRoutes) ---
        const logData = { ...req.body };
        delete logData.timestamp; // Hapus waktu 1970 dari ESP32
        
        // Cek device
        if (!logData.device) {
            return res.status(400).json({ success: false, message: 'Device is required' });
        }

        // Tentukan status default jika tidak ada
        if (!logData.status) {
            logData.status = 'unknown'; 
        }

        // Simpan metadata di field yang benar (authDelay, confidence, rssi)
        const metadata = {
            authDelay: logData.authDelay || 0,
            confidence: logData.confidence || 0,
            rssi: logData.rssi || 0,
        };
        delete logData.authDelay;
        delete logData.confidence;
        delete logData.rssi;

        const newAuth = new AuthLog({
            ...logData,
            metadata: metadata,
            timestamp: new Date() // Gunakan waktu server saat ini
        });

        await newAuth.save();
        res.json({ success: true, data: newAuth });
    } catch (error) {
        console.error('❌ Error saving auth log:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});


// GET auth stats (total, success, failed) berdasarkan device
router.get('/stats/:device', async (req, res) => {
    try {
        const { device } = req.params;
        
        // Pastikan device valid
        if (!['esp32cam', 'rfid', 'fingerprint'].includes(device)) {
             return res.status(400).json({ success: false, message: 'Invalid device type' });
        }

        // Hitung total, sukses, dan gagal
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