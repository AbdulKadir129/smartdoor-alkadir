const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'smartdoor-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 jam
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/param', require('./routes/paramRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// Root endpoint
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Smart Door Security System API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Fallback ke index.html untuk SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api`);
});