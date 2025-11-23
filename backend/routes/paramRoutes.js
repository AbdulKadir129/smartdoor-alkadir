const express = require('express');
const router = express.Router();
const ParamLog = require('../models/ParamLog');

// GET param logs by device
router.get('/logs/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const logs = await ParamLog.find({ device }).sort({ timestamp: -1 }).limit(50);
        res.json({ success: true, device, count: logs.length, data: logs });
    } catch (error) {
        console.error('❌ Error loading param logs:', error);
        res.json({ success: true, device: req.params.device, count: 0, data: [] });
    }
});

// GET param stats by device
router.get('/stats/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const logs = await ParamLog.find({ device });
        
        if (!logs || logs.length === 0) {
            return res.json({
                success: true,
                device,
                stats: {
                    avgDelay: '0.00',
                    avgThroughput: '0.00',
                    avgMessageSize: '0.00',
                    totalMessages: 0
                }
            });
        }

        const avgDelay = logs.reduce((sum, log) => sum + (log.delay || 0), 0) / logs.length;
        const avgThroughput = logs.reduce((sum, log) => sum + (log.throughput || 0), 0) / logs.length;
        const avgMessageSize = logs.reduce((sum, log) => sum + (log.messageSize || 0), 0) / logs.length;

        res.json({
            success: true,
            device,
            stats: {
                avgDelay: avgDelay.toFixed(2),
                avgThroughput: avgThroughput.toFixed(2),
                avgMessageSize: avgMessageSize.toFixed(2),
                totalMessages: logs.length
            }
        });
    } catch (error) {
        console.error('❌ Error loading param stats:', error);
        res.json({
            success: true,
            device: req.params.device,
            stats: {
                avgDelay: '0.00',
                avgThroughput: '0.00',
                avgMessageSize: '0.00',
                totalMessages: 0
            }
        });
    }
});

// POST param log
router.post('/log', async (req, res) => {
    try {
        // Hapus timestamp bawaan ESP32 (millis) agar pakai waktu server
        const logData = { ...req.body };
        delete logData.timestamp; 

        const paramLog = new ParamLog(logData);
        await paramLog.save();
        res.json({ success: true, data: paramLog });
    } catch (error) {
        console.error('❌ Error saving param log:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
