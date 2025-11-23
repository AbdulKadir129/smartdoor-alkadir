const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    device: {
        type: String,
        enum: ['esp32cam', 'rfid', 'fingerprint'],
        required: true
    },
    userType: {
        type: String,
        enum: ['admin', 'device_user'],
        default: 'device_user'
    },
    faceId: String,        // Untuk ESP32-CAM
    rfidUid: String,       // Untuk RFID
    fingerId: Number,      // Untuk Fingerprint
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password sebelum save
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Method untuk compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
