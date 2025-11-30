const express = require('express');
const router = express.Router();
const ParamLog = require('../models/ParamLog');


// GET param logs by device (Terbaru - max 50)
router.get('/logs/:device', async (req, res) => {
    try {
        const { device } = req.params;
        // Limit 50 log terbaru untuk tampilan grafik
        const logs = await ParamLog.find({ device }).sort({ timestamp: -1 }).limit(50); 
        res.json({ success: true, device, count: logs.length, data: logs });
    } catch (error) {
        console.error('❌ Error loading param logs:', error);
        // Mengembalikan array kosong jika ada error agar frontend tidak crash
        res.json({ success: true, device: req.params.device, count: 0, data: [] }); 
    }
});


// GET param stats by device (Rata-rata Delay, Jitter, Throughput, dll.)
router.get('/stats/:device', async (req, res) => {
    try {
        const { device } = req.params;
        // Ambil semua log untuk perhitungan statistik
        const logs = await ParamLog.find({ device }); 
        
        if (!logs || logs.length === 0) {
            // Mengembalikan 0 jika tidak ada data
            return res.json({
                success: true,
                device,
                stats: {
                    avgDelay: '0.00',
                    avgThroughput: '0.00',
                    avgMessageSize: '0.00',
                    avgJitter: '0.00',
                    avgPacketLoss: '0.00',
                    totalMessages: 0
                }
            });
        }

        // --- PERHITUNGAN RATA-RATA ---
        const totalMessages = logs.length;
        const sumDelay = logs.reduce((sum, log) => sum + (log.delay || 0), 0);
        const sumThroughput = logs.reduce((sum, log) => sum + (log.throughput || 0), 0);
        const sumMessageSize = logs.reduce((sum, log) => sum + (log.messageSize || 0), 0);
        const sumJitter = logs.reduce((sum, log) => sum + (log.jitter || 0), 0);
        const sumPacketLoss = logs.reduce((sum, log) => sum + (log.packetLoss || 0), 0);

        const avgDelay = (sumDelay / totalMessages).toFixed(2);
        const avgThroughput = (sumThroughput / totalMessages).toFixed(2);
        const avgMessageSize = (sumMessageSize / totalMessages).toFixed(2);
        const avgJitter = (sumJitter / totalMessages).toFixed(2);
        const avgPacketLoss = (sumPacketLoss / totalMessages).toFixed(2);


        res.json({
            success: true,
            device,
            stats: {
                avgDelay,
                avgThroughput,
                avgMessageSize,
                avgJitter,
                avgPacketLoss,
                totalMessages
            }
        });

    } catch (error) {
        console.error('❌ Error loading param stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// POST param log baru (Digunakan oleh server.js untuk sinkronisasi dari MQTT)
router.post('/log', async (req, res) => {
    try {
        const { device, delay, jitter, throughput, packetLoss, sequenceNumber } = req.body;
        
        if (!device) {
             return res.status(400).json({ success: false, message: 'Device is required' });
        }
        
        // Clone body dan hapus timestamp lama (untuk menghindari masalah 1970)
        const logData = { ...req.body };
        delete logData.timestamp; 

        // Pastikan nilai diubah menjadi Number
        logData.delay = parseFloat(delay) || 0;
        logData.jitter = parseFloat(jitter) || 0;
        logData.throughput = parseFloat(throughput) || 0;
        logData.packetLoss = parseFloat(packetLoss) || 0;
        logData.sequenceNumber = parseInt(sequenceNumber) || 0;

        // Gunakan waktu server
        logData.timestamp = new Date(); 

        const paramLog = new ParamLog(logData);
        await paramLog.save();
        
        // Log ke konsol server
        console.log(`✅ Param saved: ${req.body.device} | Seq: ${logData.sequenceNumber} | Delay: ${delay}ms | Throughput: ${throughput}bps | Jitter: ${jitter}ms | Loss: ${packetLoss.toFixed(2)}%`);
        
        res.json({ success: true, data: paramLog });
    } catch (error) {
        console.error('❌ Error saving param log:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// DELETE param logs by device
router.delete('/logs/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const result = await ParamLog.deleteMany({ device });
        res.json({ 
            success: true, 
            message: `Deleted ${result.deletedCount} param logs for ${device}`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// DELETE all param logs (semua device)
router.delete('/logs', async (req, res) => {
    try {
        const result = await ParamLog.deleteMany({});
        res.json({ 
            success: true, 
            message: `Deleted all ${result.deletedCount} param logs`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = router;