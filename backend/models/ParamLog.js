const mongoose = require('mongoose');

const paramLogSchema = new mongoose.Schema({
    device: { type: String, required: true },
    topic: { type: String, required: true },
    payload: { type: String, default: "QoS Data" },
    
    // Data QoS
    delay: { type: Number, default: 0 },
    jitter: { type: Number, default: 0 },
    throughput: { type: Number, default: 0 },
    messageSize: { type: Number, default: 0 },
    packetLoss: { type: Number, default: 0 },
    sequenceNumber: { type: Number, default: 0 },
    
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ParamLog', paramLogSchema);const mongoose = require('mongoose');

const paramLogSchema = new mongoose.Schema({
    device: {
        type: String,
        enum: ['esp32cam', 'rfid', 'fingerprint'],
        required: true
    },
    payload: {
        type: String,
        required: true
    },
    topic: {
        type: String,
        required: true
    },
    delay: {
        type: Number,
        default: 0
    },
    throughput: {
        type: Number,
        default: 0
    },
    messageSize: {
        type: Number,
        default: 0
    },
    qos: {
        type: Number,
        enum: [0, 1, 2],
        default: 1
    },
    packetLoss: {
        type: Number,
        default: 0
    },
    jitter: {
        type: Number,
        default: 0
    },
    // ✅ TAMBAHAN BARU: Sequence Number untuk Packet Loss Detection
    sequenceNumber: {
        type: Number,
        default: 0,
        index: true  // Index untuk query performance
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Index untuk query performance
paramLogSchema.index({ device: 1, timestamp: -1 });
paramLogSchema.index({ device: 1, sequenceNumber: -1 });

module.exports = mongoose.model('ParamLog', paramLogSchema);