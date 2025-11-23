const mongoose = require('mongoose');

const authLogSchema = new mongoose.Schema({
    device: {
        type: String,
        enum: ['esp32cam', 'rfid', 'fingerprint'],
        required: true
    },
    method: { type: String, required: true },
    status: {
        type: String,
        enum: ['success', 'failed'],
        required: true
    },
    userId: String,
    userName: String,
    message: String,
    imageUrl: String,
    
    // --- TAMBAHKAN BAGIAN INI ---
    metadata: {
        authDelay: Number,
        confidence: Number,
        rssi: Number
    },
    // ---------------------------

    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuthLog', authLogSchema);