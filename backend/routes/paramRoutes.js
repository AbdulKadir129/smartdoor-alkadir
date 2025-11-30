const express = require('express');
const router = express.Router();
const ParamLog = require('../models/ParamLog');
// ✅ TAMBAHAN: Kita butuh AuthLog untuk menghitung rata-rata RSSI dan Auth Delay
const AuthLog = require('../models/AuthLog'); 


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


// GET param stats by device (MODIFIED)
router.get('/stats/:device', async (req, res) => {
    try {
        const { device } = req.params;
        const paramLogs = await ParamLog.find({ device });
        const authLogs = await AuthLog.find({ device }); // ✅ Ambil juga Auth Logs
        
        if (!paramLogs || paramLogs.length === 0) {
            
            // Jika tidak ada data param, hitung rata-rata RSSI/AuthDelay hanya dari AuthLog
            const totalRssiAuth = authLogs.reduce((sum, log) => sum + (log.metadata?.rssi || 0), 0);
            const avgRssiAuth = authLogs.length > 0 ? totalRssiAuth / authLogs.length : 0;
            
            const totalAuthDelay = authLogs.reduce((sum, log) => sum + (log.metadata?.authDelay || 0), 0);
            const avgAuthDelay = authLogs.length > 0 ? totalAuthDelay / authLogs.length : 0;

            return res.json({
                success: true,
                device,
                stats: {
                    avgDelay: '0.00',
                    avgThroughput: '0.00',
                    avgMessageSize: '0.00',
                    avgJitter: '0.00',
                    avgPacketLoss: '0.00',
                    totalMessages: 0,
                    // ✅ Metrik Auth (diambil dari AuthLog)
                    avgRssi: avgRssiAuth.toFixed(0),
                    avgAuthDelay: avgAuthDelay.toFixed(0)
                }
            });
        }

        // 1. Hitung Statistik QoS (dari ParamLog)
        const avgDelay = paramLogs.reduce((sum, log) => sum + (log.delay || 0), 0) / paramLogs.length;
        const avgThroughput = paramLogs.reduce((sum, log) => sum + (log.throughput || 0), 0) / paramLogs.length;
        const avgMessageSize = paramLogs.reduce((sum, log) => sum + (log.messageSize || 0), 0) / paramLogs.length;
        const avgJitter = paramLogs.reduce((sum, log) => sum + (log.jitter || 0), 0) / paramLogs.length;
        const avgPacketLoss = paramLogs.reduce((sum, log) => sum + (log.packetLoss || 0), 0) / paramLogs.length;

        // 2. Hitung Statistik Auth (dari AuthLog)
        const totalRssi = authLogs.reduce((sum, log) => sum + (log.metadata?.rssi || 0), 0);
        const avgRssi = authLogs.length > 0 ? totalRssi / authLogs.length : 0;
        
        const totalAuthDelay = authLogs.reduce((sum, log) => sum + (log.metadata?.authDelay || 0), 0);
        const avgAuthDelay = authLogs.length > 0 ? totalAuthDelay / authLogs.length : 0;
        
        res.json({
            success: true,
            device,
            stats: {
                avgDelay: avgDelay.toFixed(2),
                avgThroughput: avgThroughput.toFixed(2),
                avgMessageSize: avgMessageSize.toFixed(2),
                avgJitter: avgJitter.toFixed(2),
                avgPacketLoss: avgPacketLoss.toFixed(2),
                totalMessages: paramLogs.length,
                // ✅ Metrik Auth
                avgRssi: avgRssi.toFixed(0),
                avgAuthDelay: avgAuthDelay.toFixed(0)
            }
        });
    } catch (error) {
        console.error('❌ Error loading param stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// POST param log - DENGAN PERHITUNGAN OTOMATIS + PACKET LOSS DETECTION (MODIFIED)
router.post('/log', async (req, res) => {
    try {
        const logData = { ...req.body };
        
        // ========================================
        // ✅ MODIFIKASI: AMBIL DELAY/JITTER DARI FRONTEND
        // (Solusi untuk masalah Clock Skew yang tinggi)
        // ========================================
        
        const delay = req.body.delay || 0;
        const jitter = req.body.jitter || 0;
        const throughput = req.body.throughput || 0;
        const messageSize = req.body.messageSize || 0;
        
        // ========================================
        // 4. PACKET LOSS - DETEKSI REAL DENGAN SEQUENCE NUMBER (Logika dipertahankan)
        // ========================================
        let packetLoss = 0;
        let lostPackets = 0;

        if (req.body.sequenceNumber !== undefined) {
            const currentSeq = parseInt(req.body.sequenceNumber);
            
            // Ambil log terakhir (ParamLog)
            const lastLog = await ParamLog.findOne({ device: req.body.device })
                .sort({ timestamp: -1 })
                .limit(1);
            
            if (lastLog && lastLog.sequenceNumber !== undefined) {
                const lastSeq = lastLog.sequenceNumber;
                const expectedSeq = lastSeq + 1;
                
                // Hitung packet loss
                if (currentSeq > expectedSeq) {
                    lostPackets = currentSeq - expectedSeq;
                    packetLoss = (lostPackets / currentSeq) * 100;
                    
                    console.log(`⚠️ PACKET LOSS DETECTED!`);
                    console.log(`   Device: ${req.body.device}`);
                    console.log(`   Expected Seq: ${expectedSeq}, Received Seq: ${currentSeq}`);
                    console.log(`   Loss Rate: ${packetLoss.toFixed(2)}%`);
                } else if (currentSeq < expectedSeq) {
                    console.log(`⚠️ Out of order packet: Expected ${expectedSeq}, Got ${currentSeq}`);
                } else {
                    console.log(`✅ Packet received in order: Seq ${currentSeq}`);
                }
            } else {
                console.log(`ℹ️ First packet for ${req.body.device}, Seq: ${currentSeq}`);
            }
        } else {
            console.log(`⚠️ No sequence number in packet from ${req.body.device}`);
        }
        
        // Update data dengan hasil perhitungan yang diambil dari frontend
        logData.delay = Math.round(delay);
        logData.throughput = Math.round(throughput);
        logData.jitter = Math.round(jitter);
        logData.packetLoss = parseFloat(packetLoss.toFixed(2));
        logData.messageSize = messageSize;
        logData.sequenceNumber = req.body.sequenceNumber || 0;
        
        // Hapus sentTime/timestamp ESP32
        delete logData.sentTime;
        delete logData.timestamp;

        // Simpan ke database
        const paramLog = new ParamLog(logData);
        await paramLog.save();
        
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