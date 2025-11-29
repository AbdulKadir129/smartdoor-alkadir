require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const mqtt = require('mqtt');
const connectDB = require('./config/db');
const AuthLog = require('./models/AuthLog');
const ParamLog = require('./models/ParamLog');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/param', require('./routes/paramRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

const MQTT_BROKER = "mqtts://4c512df94742407c9c30ee672577eba2.s1.eu.hivemq.cloud:8883";
const MQTT_USER = "Alkadir";
const MQTT_PASS = "Alkadir123";

const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USER,
    password: MQTT_PASS,
    rejectUnauthorized: false
});

mqttClient.on('connect', () => {
    console.log("✅ Backend Terhubung ke MQTT HiveMQ & Siap Rekam Data!");
    mqttClient.subscribe(['smartdoor/auth', 'smartdoor/param']);
});

mqttClient.on('message', async (topic, message) => {
    try {
        const payloadStr = message.toString();
        const data = JSON.parse(payloadStr);

        let devRaw = (data.device || 'rfid').toLowerCase();
        let dev = 'rfid';
        if (devRaw.includes('cam')) dev = 'esp32cam';
        else if (devRaw.includes('finger')) dev = 'fingerprint';

        if (topic === 'smartdoor/auth') {
            const newAuth = new AuthLog({
                device: dev,
                method: data.method || 'unknown',
                status: (data.status && data.status.includes('success')) ? 'success' : 'failed',
                userId: data.userId || "Unknown",
                userName: data.userName || "Unknown",
                message: data.message || data.status,
                metadata: {
                    authDelay: data.delay || 0,
                    rssi: data.rssi || 0,
                    confidence: data.similarity || 0
                },
                timestamp: new Date()
            });
            await newAuth.save();
            console.log(`💾 [MONGO] Auth Log Saved: ${dev} - ${data.userId}`);
        } else if (topic === 'smartdoor/param') {
            let size = data.messageSize || payloadStr.length;
            const newParam = new ParamLog({
                device: dev,
                topic: topic,
                payload: "QoS Data",
                delay: data.delay || 0,
                jitter: data.jitter || 0,
                throughput: size * 8,
                messageSize: size,
                packetLoss: 0,
                sequenceNumber: data.sequenceNumber || 0,
                timestamp: new Date()
            });
            await newParam.save();
        }
    } catch (err) {
        console.error("❌ Error Saving to Mongo:", err.message);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
