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
                    avgJitter: '0.00',
                    avgPacketLoss: '0.00',
                    totalMessages: 0
                }
            });
        }

        const avgDelay = logs.reduce((sum, log) => sum + (log.delay || 0), 0) / logs.length;
        const avgThroughput = logs.reduce((sum, log) => sum + (log.throughput || 0), 0) / logs.length;
        const avgMessageSize = logs.reduce((sum, log) => sum + (log.messageSize || 0), 0) / logs.length;
        const avgJitter = logs.reduce((sum, log) => sum + (log.jitter || 0), 0) / logs.length;
        const avgPacketLoss = logs.reduce((sum, log) => sum + (log.packetLoss || 0), 0) / logs.length;

        res.json({
            success: true,
            device,
            stats: {
                avgDelay: avgDelay.toFixed(2),
                avgThroughput: avgThroughput.toFixed(2),
                avgMessageSize: avgMessageSize.toFixed(2),
                avgJitter: avgJitter.toFixed(2),
                avgPacketLoss: avgPacketLoss.toFixed(2),
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
                avgJitter: '0.00',
                avgPacketLoss: '0.00',
                totalMessages: 0
            }
        });
    }
});


// POST param log - DENGAN PERHITUNGAN OTOMATIS
router.post('/log', async (req, res) => {
    try {
        const logData = { ...req.body };
        
        // ========================================
        // HITUNG PARAMETER MQTT JARINGAN
        // ========================================
        
        // 1. DELAY (ms) - Waktu dari ESP32 kirim sampai Backend terima
        const serverReceiveTime = Date.now(); // Waktu server terima (epoch ms)
        const espSentTime = req.body.sentTime || serverReceiveTime; // Waktu ESP32 kirim
        const delay = serverReceiveTime - espSentTime; // Delay dalam ms
        
        // 2. THROUGHPUT (bps) - Bits per second
        const messageSize = req.body.messageSize || 0; // dalam bytes
        const throughput = delay > 0 ? (messageSize * 8 * 1000) / delay : 0; // bps
        
        // 3. JITTER (ms) - Variasi delay antar paket
        // Ambil delay terakhir dari device yang sama untuk menghitung jitter
        const lastLog = await ParamLog.findOne({ device: req.body.device })
            .sort({ timestamp: -1 })
            .limit(1);
        
        const jitter = lastLog && lastLog.delay ? Math.abs(delay - lastLog.delay) : 0;
        
        // 4. PACKET LOSS - Deteksi kehilangan paket (jika ada sequence number)
        // Untuk sekarang set 0, bisa dikembangkan dengan sequence number
        const packetLoss = 0;
        
        // Update data dengan hasil perhitungan
        logData.delay = Math.round(delay);
        logData.throughput = Math.round(throughput);
        logData.jitter = Math.round(jitter);
        logData.packetLoss = packetLoss;
        
        // Hapus sentTime dan timestamp bawaan ESP32, pakai server time
        delete logData.sentTime;
        delete logData.timestamp;

        // Simpan ke database
        const paramLog = new ParamLog(logData);
        await paramLog.save();
        
        console.log(`✅ Param saved: ${req.body.device} | Delay: ${delay}ms | Throughput: ${throughput}bps | Jitter: ${jitter}ms`);
        
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