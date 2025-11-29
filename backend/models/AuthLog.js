const mongoose = require('mongoose');

const authLogSchema = new mongoose.Schema({
    device: { 
        type: String, 
        required: true 
        // Saya hapus enum biar tidak error kalau nama beda dikit
    },
    method: { type: String, default: 'unknown' },
    status: { type: String, required: true },
    userId: { type: String, default: 'Unknown' },
    userName: { type: String, default: 'Unknown' },
    message: { type: String, default: '-' },
    
    // Metadata untuk menyimpan info tambahan
    metadata: {
        authDelay: { type: Number, default: 0 },
        confidence: { type: Number, default: 0 },
        rssi: { type: Number, default: 0 }
    },

    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuthLog', authLogSchema);