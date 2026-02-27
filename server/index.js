const express = require('express');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const scanRoutes = require('./routes/scanRoutes');

const app = express();
app.use(express.json({ limit: '50mb' })); 

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);

// SPA Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));