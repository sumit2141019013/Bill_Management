require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint (used by keep-alive ping)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/export', require('./routes/export'));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);

      // Keep-alive: ping self every 14 minutes to prevent Render free tier spin-down
      if (process.env.RENDER_EXTERNAL_URL) {
        const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes
        setInterval(async () => {
          try {
            const url = `${process.env.RENDER_EXTERNAL_URL}/api/health`;
            const response = await fetch(url);
            if (response.ok) {
              console.log(`♻️  Keep-alive ping OK at ${new Date().toISOString()}`);
            }
          } catch (err) {
            console.log('♻️  Keep-alive ping failed:', err.message);
          }
        }, PING_INTERVAL);
        console.log('♻️  Keep-alive ping enabled (every 14 min)');
      }
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
