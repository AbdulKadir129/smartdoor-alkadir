const mongoose = require('mongoose');

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
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ParamLog', paramLogSchema);
