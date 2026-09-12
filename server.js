require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const agencyRoutes = require('./routes/agencies');
const itemRoutes = require('./routes/items');
const adminRoutes = require('./routes/admin');
const orderRoutes = require('./routes/orders');
const memberRoutes = require('./routes/members');

const app = express();

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined');
  process.exit(1);
}

app.disable('x-powered-by');

// Clean duplicate slashes from URLs (e.g. //agencies -> /agencies)
app.use((req, res, next) => {
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '1mb'
}));

// Root endpoint for testing / health check
app.get('/', (req, res) => {
  res.send('Backend is working!');
});

// Health endpoints
app.get(['/api/health', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1
      ? 'connected'
      : 'not connected'
  });
});

// Mount routes on both /api/* and root /* to prevent 404 from frontend base URL mismatches
app.use(['/api/agencies', '/agencies'], agencyRoutes);
app.use(['/api/items', '/items'], itemRoutes);
app.use(['/api/admin', '/admin'], adminRoutes);
app.use(['/api/orders', '/orders'], orderRoutes);
app.use(['/api/members', '/members'], memberRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong on the server'
  });
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });