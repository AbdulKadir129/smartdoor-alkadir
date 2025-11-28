const express = require('express');
const mongoose = require('mongoose');
const ParamLog = require('./ParamLog');
const router = express.Router();

// Global storage untuk hitung QoS per device (in-memory)
let qosData = {
    esp32cam: { lastSeq: 0, lastDelay: 0, totalBytes: 0, startTime: Date.now(), packets: [] },
    rfid: { lastSeq: 0, lastDelay: 0, totalBytes: 0, startTime: Date.now(), packets: [] },
    fingerprint: { lastSeq: 0, lastDelay: 0, totalBytes: 0, startTime: Date.now(), packets: [] }
};

// ✅ FUNGSI HITUNG QOS (panggil setiap MQTT param masuk)
function calculateQoS(payload, device) {
    const receiveTime = Date.now();
    const sentTime = payload.sentTime || 0;
    const seqNum = payload.sequenceNumber || 0;
    const msgSize = payload.messageSize || 0;
    
    // 1. DELAY (ms) - broker → backend
    const delay = receiveTime - sentTime;
    
    // 2. PACKET LOSS (%) - dari sequenceNumber
    const deviceData = qosData[device];
    let packetLoss = 0;
    if (seqNum > deviceData.lastSeq + 1) {
        const lostPackets = seqNum - deviceData.lastSeq - 1;
        packetLoss = (lostPackets / seqNum) * 100;
    }
    
    // 3. JITTER (ms) - variasi delay berturut-turut
    const jitter = Math.abs(delay - deviceData.lastDelay);
    
    // 4. THROUGHPUT (bytes/sec) - total byte diterima per detik
    deviceData.totalBytes += msgSize;
    const elapsed = (Date.now() - deviceData.startTime) / 1000;
    const throughput = elapsed > 0 ? deviceData.totalBytes / elapsed : 0;
    
    // Update state untuk perhitungan berikutnya
    deviceData.lastSeq = seqNum;
    deviceData.lastDelay = delay;
    deviceData.packets.push({ 
        delay, 
        seqNum, 
        msgSize, 
        receiveTime,
        sentTime 
    });
    
    // Simpan hanya 100 data terakhir per device (untuk realtime chart)
    if (deviceData.packets.length > 100) {
        deviceData.packets.shift();
    }
    
    return {
        delay: Math.round(delay),
        packetLoss: Math.round(packetLoss * 100) / 100,
        jitter: Math.round(jitter),
        throughput: Math.round(throughput),
        sequenceNumber: seqNum,
        messageSize: msgSize,
        receiveTime: receiveTime
    };
}

// ✅ MQTT PARAM ENDPOINT (dari ESP32 → broker → backend)
router.post('/param', async (req, res) => {
    try {
        const payload = req.body;
        const device = payload.device;
        
        if (!['esp32cam', 'rfid', 'fingerprint'].includes(device)) {
            return res.status(400).json({ error: 'Invalid device' });
        }
        
        // Hitung QoS broker → backend
        const qos = calculateQoS(payload, device);
        
        // Gabung data asli + hasil QoS
        const paramLogData = {
            device: device,
            payload: JSON.stringify(payload),
            topic: payload.topic || 'smartdoor/param',
            messageSize: payload.messageSize || 0,
            qos: payload.qos || 1,
            sequenceNumber: payload.sequenceNumber || 0,
            ...qos,  // delay, packetLoss, jitter, throughput
            sentTime: payload.sentTime || 0
        };
        
        // Simpan ke MongoDB
        const paramLog = new ParamLog(paramLogData);
        await paramLog.save();
        
        res.json({ 
            success: true, 
            data: paramLogData,
            qos: qos 
        });
        
    } catch (error) {
        console.error('Param save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ REALTIME QOS (untuk chart live di frontend)
router.get('/qos/realtime', async (req, res) => {
    try {
        const device = req.query.device || 'esp32cam';
        const packets = qosData[device]?.packets || [];
        
        res.json({
            device,
            latest: packets.slice(-10), // 10 data terakhir
            stats: {
                avgDelay: Math.round(packets.reduce((sum, p) => sum + p.delay, 0) / packets.length || 0),
                avgJitter: Math.round(packets.reduce((sum, p) => sum + Math.abs(p.delay - (packets[packets.length-2]?.delay || 0)), 0) / packets.length || 0),
                totalThroughput: Math.round(qosData[device]?.totalBytes || 0),
                packetLoss: Math.round((qosData[device]?.lastSeq || 0) * 0.01) // simplified
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ HISTORY QOS (untuk analisis skripsi)
router.get('/qos/history', async (req, res) => {
    try {
        const { device, start, end } = req.query;
        const filter = { device };
        
        if (start) filter.timestamp = { $gte: new Date(start) };
        if (end) filter.timestamp.$lte = new Date(end);
        
        const logs = await ParamLog.find(filter)
            .sort({ timestamp: -1 })
            .limit(1000);
            
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ SUMMARY QOS per device (untuk dashboard)
router.get('/qos/summary', async (req, res) => {
    try {
        const summaries = {};
        const devices = ['esp32cam', 'rfid', 'fingerprint'];
        
        for (const device of devices) {
            const stats = await ParamLog.aggregate([
                { $match: { device } },
                {
                    $group: {
                        _id: null,
                        avgDelay: { $avg: '$delay' },
                        avgJitter: { $avg: '$jitter' },
                        avgThroughput: { $avg: '$throughput' },
                        packetLoss: { $avg: '$packetLoss' },
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            summaries[device] = stats[0] || {
                avgDelay: 0, avgJitter: 0, avgThroughput: 0, packetLoss: 0, count: 0
            };
        }
        
        res.json(summaries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
