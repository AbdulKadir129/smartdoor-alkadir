const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Ambil link dari .env atau pakai localhost sebagai cadangan
        const connString = process.env.MONGO_URI || 'mongodb://localhost:27017/smartdoor';
        
        await mongoose.connect(connString, {
            // --- BARIS INI YANG MEMAKSA MASUK KE FOLDER SMARTDOOR ---
            dbName: 'smartdoor', 
            // -------------------------------------------------------
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        const host = mongoose.connection.host;
        console.log(`✅ MongoDB Connected: ${host}`);
        console.log(`📂 Database Name: smartdoor`); // Konfirmasi di log
        
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;