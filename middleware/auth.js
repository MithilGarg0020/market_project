const crypto = require('crypto');
const AdminConfig = require('../models/AdminConfig');

const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || 'admin123';

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Fetch the active Admin PIN from database or fallback to env/default
 */
async function getActiveAdminPin() {
  try {
    const config = await AdminConfig.findOne({ key: 'admin_pin' }).lean();
    if (config && config.value) {
      return config.value;
    }
  } catch (e) {
    console.error('Error fetching admin PIN from DB:', e.message);
  }
  return DEFAULT_ADMIN_PIN;
}

/**
 * Middleware: Verify Admin Key/PIN on protected routes
 */
async function requireAdminAuth(req, res, next) {
  const pin = req.headers['x-admin-key'];
  const activePin = await getActiveAdminPin();
  if (!pin || !safeCompare(pin, activePin)) {
    return res.status(401).json({ error: 'Unauthorized: Administrative credentials required' });
  }
  next();
}

module.exports = {
  safeCompare,
  getActiveAdminPin,
  requireAdminAuth
};
