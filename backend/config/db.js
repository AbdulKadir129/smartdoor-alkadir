const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // LOGIKA OTOMATIS (Smart Switch):
        // 1. Cek apakah ada settingan 'MONGO_URI' di sistem (biasanya ada di Server Render/Cloud).
        // 2. Jika TIDAK ada, otomatis pakai 'mongodb://localhost...' (Laptop).
        const connString = process.env.MONGO_URI || 'mongodb://localhost:27017/smartdoor_db';
        
        await mongoose.connect(connString, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        // Log info supaya kita tahu sedang konek ke mana
        const host = mongoose.connection.host;
        const connectionType = host.includes('mongodb.net') ? '☁️ CLOUD (MongoDB Atlas)' : '💻 LOCALHOST';

        console.log(`✅ MongoDB Connected Successfully`);
        console.log(`   Target: ${connectionType}`);
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;