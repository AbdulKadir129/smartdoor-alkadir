require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const mqtt = require('mqtt'); // Wajib ada untuk HiveMQ
const connectDB = require('./config/db');

// Import Models
const AuthLog = require('./models/AuthLog');
const ParamLog = require('./models/ParamLog');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// 1. KONEKSI DATABASE
// ==========================================================
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Serve Frontend Files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes (Agar frontend bisa ambil data history)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/param', require('./routes/paramRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// ==========================================================
// 2. KONEKSI MQTT (HIVEMQ -> BACKEND)
// ==========================================================
const MQTT_BROKER = "mqtts://4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud:8883";
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

console.log("🔄 Menghubungkan Backend ke MQTT HiveMQ...");

const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USER,
    password: MQTT_PASS,
    rejectUnauthorized: false // Wajib false untuk HiveMQ Cloud
});

mqttClient.on('connect', () => {
    console.log("✅ Backend Terhubung ke MQTT HiveMQ & Siap Rekam Data!");
    // Subscribe ke topik ESP32
    mqttClient.subscribe(['smartdoor/auth', 'smartdoor/param']);
});

// ==========================================================
// 3. LOGIKA PENYIMPANAN KE MONGODB ATLAS
// ==========================================================
mqttClient.on('message', async (topic, message) => {
    try {
        const payloadStr = message.toString();
        const data = JSON.parse(payloadStr);
        const arrivalTime = Date.now();

        // Normalisasi Nama Device (Agar rapi di database)
        let devRaw = (data.device || 'rfid').toLowerCase();
        let dev = 'rfid'; // Default
        if (devRaw.includes('cam')) dev = 'esp32cam';
        else if (devRaw.includes('finger')) dev = 'fingerprint';

        console.log(`📩 Data Masuk [${dev}]:`, payloadStr.substring(0, 50) + "...");

        // --- SKENARIO 1: SIMPAN LOG AUTENTIKASI ---
        if (topic === 'smartdoor/auth') {
            // Hitung Delay (Waktu Server - Waktu Kirim ESP32)
            let sentTime = data.sentTime || arrivalTime;
            let delay = arrivalTime - sentTime;
            if (delay < 0) delay = 0;

            const newAuth = new AuthLog({
                device: dev,
                method: data.method || 'unknown',
                status: (data.status && data.status.includes('success')) ? 'success' : 'failed',
                userId: data.userId || "Unknown",
                userName: data.userName || "Unknown",
                message: data.message || data.status,
                metadata: {
                    authDelay: delay,
                    rssi: data.rssi || 0,
                    confidence: data.similarity || 0
                },
                timestamp: new Date() // Gunakan waktu server saat ini
            });

            await newAuth.save();
            console.log(`💾 [MONGO ATLAS] Auth Log Saved: ${dev} - ${data.userId}`);
        } 
        
        // --- SKENARIO 2: SIMPAN LOG PARAMETER (QoS) ---
        else if (topic === 'smartdoor/param') {
            let sentTime = data.sentTime || arrivalTime;
            let delay = arrivalTime - sentTime;
            let size = data.messageSize || payloadStr.length;
            
            const newParam = new ParamLog({
                device: dev,
                topic: topic,
                payload: "QoS Data",
                delay: delay < 0 ? 0 : delay,
                jitter: data.jitter || 0,
                throughput: size * 8, // Bits
                messageSize: size,
                packetLoss: 0,
                sequenceNumber: data.sequenceNumber || 0,
                timestamp: new Date()
            });

            await newParam.save();
            // console.log("💾 [MONGO ATLAS] QoS Log Saved");
        }

    } catch (err) {
        console.error("❌ Error Saving to Mongo:", err.message);
    }
});

// Root Endpoint
app.get('/api', (req, res) => {
    res.json({ message: 'Smart Door Backend Online', mongo: 'Connected' });
});

// Fallback Route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});