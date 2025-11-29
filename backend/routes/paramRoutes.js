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


// POST param log - DENGAN PERHITUNGAN OTOMATIS + PACKET LOSS DETECTION
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
        
        // ========================================
        // 4. PACKET LOSS - DETEKSI REAL DENGAN SEQUENCE NUMBER
        // ========================================
        let packetLoss = 0;
        let lostPackets = 0;

        if (req.body.sequenceNumber !== undefined) {
            const currentSeq = parseInt(req.body.sequenceNumber);
            
            // Gunakan lastLog yang sudah di-query untuk jitter (efisiensi)
            const lastLogForSeq = lastLog || await ParamLog.findOne({ device: req.body.device })
                .sort({ timestamp: -1 })
                .limit(1);
            
            if (lastLogForSeq && lastLogForSeq.sequenceNumber !== undefined) {
                const lastSeq = lastLogForSeq.sequenceNumber;
                const expectedSeq = lastSeq + 1;
                
                // Hitung packet loss
                if (currentSeq > expectedSeq) {
                    // Ada paket yang hilang
                    lostPackets = currentSeq - expectedSeq;
                    
                    // Hitung persentase packet loss
                    // Formula: (Lost Packets / Current Sequence) * 100
                    packetLoss = (lostPackets / currentSeq) * 100;
                    
                    console.log(`⚠️ PACKET LOSS DETECTED!`);
                    console.log(`   Device: ${req.body.device}`);
                    console.log(`   Expected Seq: ${expectedSeq}`);
                    console.log(`   Received Seq: ${currentSeq}`);
                    console.log(`   Lost Packets: ${lostPackets}`);
                    console.log(`   Loss Rate: ${packetLoss.toFixed(2)}%`);
                    
                    // Optional: Alert jika packet loss tinggi
                    if (packetLoss > 10) {
                        console.error(`🚨 HIGH PACKET LOSS ALERT: ${req.body.device} - ${packetLoss.toFixed(2)}%`);
                    }
                } else if (currentSeq < expectedSeq) {
                    // Paket datang out of order (bisa diabaikan atau log)
                    console.log(`⚠️ Out of order packet: Expected ${expectedSeq}, Got ${currentSeq}`);
                    // Tidak hitung sebagai packet loss
                } else {
                    // currentSeq === expectedSeq (normal, no loss)
                    console.log(`✅ Packet received in order: Seq ${currentSeq}`);
                }
            } else {
                // Ini adalah paket pertama dari device ini
                console.log(`ℹ️ First packet for ${req.body.device}, Seq: ${currentSeq}`);
            }
        } else {
            // Tidak ada sequence number (backward compatibility)
            console.log(`⚠️ No sequence number in packet from ${req.body.device}`);
        }
        
        // Update data dengan hasil perhitungan
        logData.delay = Math.round(delay);
        logData.throughput = Math.round(throughput);
        logData.jitter = Math.round(jitter);
        logData.packetLoss = parseFloat(packetLoss.toFixed(2));
        logData.sequenceNumber = req.body.sequenceNumber || 0;
        
        // Hapus sentTime dan timestamp bawaan ESP32, pakai server time
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