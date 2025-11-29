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

module.exports = mongoose.model('ParamLog', paramLogSchema);