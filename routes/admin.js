const express = require('express');
const router = express.Router();
const Agency = require('../models/Agency');
const Item = require('../models/Item');
const Order = require('../models/Order');
const AdminConfig = require('../models/AdminConfig');

const crypto = require('crypto');

const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || 'admin123';

// Brute-force protection: rate limit verification attempts per IP
const loginAttempts = new Map(); // ip -> { count: number, lockedUntil: number }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes lockout

function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingMins = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      allowed: false,
      message: `Too many failed attempts. Admin access locked for ${remainingMins} minute(s).`
    };
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    loginAttempts.delete(ip);
  }

  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(ip, record);
  return record;
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

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
 * Helper to fetch the active Admin PIN from DB or env fallback
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
 * Middleware: Verify Admin Key/PIN
 */
async function requireAdminAuth(req, res, next) {
  const pin = req.headers['x-admin-key'];
  const activePin = await getActiveAdminPin();
  if (!pin || !safeCompare(pin, activePin)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }
  next();
}

/**
 * POST /api/admin/verify
 * Check if provided PIN is valid (with rate-limiting and brute-force lockout)
 */
router.post('/verify', async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({ valid: false, error: rateLimit.message });
  }

  const { pin } = req.body;
  const activePin = await getActiveAdminPin();

  if (!pin || !safeCompare(pin, activePin)) {
    const record = recordFailedAttempt(clientIp);
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - record.count);
    const errorMsg = attemptsLeft === 0
      ? 'Account locked for 10 minutes due to multiple failed attempts.'
      : `Incorrect PIN. ${attemptsLeft} attempt(s) remaining before lockout.`;
    return res.status(401).json({ valid: false, error: errorMsg });
  }

  clearAttempts(clientIp);
  return res.json({ valid: true, message: 'Admin authenticated' });
});

/**
 * POST /api/admin/change-pin
 * Securely change the Admin Passcode/PIN
 */
router.post('/change-pin', async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: rateLimit.message });
  }

  try {
    const { currentPin, newPin } = req.body;
    const activePin = await getActiveAdminPin();

    if (!currentPin || !safeCompare(currentPin, activePin)) {
      recordFailedAttempt(clientIp);
      return res.status(401).json({ error: 'Current passcode is incorrect.' });
    }

    if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 6) {
      return res.status(400).json({ error: 'New passcode must be at least 6 characters for security.' });
    }

    await AdminConfig.findOneAndUpdate(
      { key: 'admin_pin' },
      { $set: { value: newPin.trim() } },
      { upsert: true, new: true }
    );

    clearAttempts(clientIp);
    return res.json({ success: true, message: 'Admin passcode updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update passcode: ' + err.message });
  }
});

// Apply authentication middleware to all subsequent admin routes
router.use(requireAdminAuth);

/**
 * GET /api/admin/stats
 * Aggregated administrative metrics across agencies and items
 */
router.get('/stats', async (req, res) => {
  try {
    const agencies = await Agency.find().lean();
    const items = await Item.find().populate('agency', 'name category').lean();
    const totalOrders = await Order.countDocuments();
    const allOrders = await Order.find().lean();
    const totalRevenue = allOrders.reduce((sum, ord) => sum + (ord.grandTotal || 0), 0);

    const totalAgencies = agencies.length;
    const totalItems = items.length;
    const totalBoxes = items.reduce((sum, item) => sum + (item.boxesInStock || 0), 0);
    const totalInventoryValue = items.reduce((sum, item) => sum + ((item.boxesInStock || 0) * (item.pricePerBox || 0)), 0);

    const lowStockItems = items.filter((item) => {
      const threshold = item.lowStockThreshold ?? item.threshold ?? 5;
      return item.boxesInStock <= threshold;
    });

    const outOfStockItems = items.filter((item) => (item.boxesInStock || 0) === 0);

    res.json({
      totalAgencies,
      totalItems,
      totalBoxes,
      totalInventoryValue,
      totalOrders,
      totalRevenue,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      lowStockList: lowStockItems.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin stats', details: err.message });
  }
});

/**
 * Agency Management
 */
router.post('/agencies', async (req, res) => {
  try {
    const agency = await Agency.create(req.body);
    res.status(201).json(agency);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create agency', details: err.message });
  }
});

router.put('/agencies/:id', async (req, res) => {
  try {
    const agency = await Agency.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    res.json(agency);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update agency', details: err.message });
  }
});

router.delete('/agencies/:id', async (req, res) => {
  try {
    const agency = await Agency.findByIdAndDelete(req.params.id);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    await Item.deleteMany({ agency: agency._id });
    res.json({ message: 'Agency and associated items deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete agency', details: err.message });
  }
});

/**
 * Item Management
 */
router.post('/items', async (req, res) => {
  try {
    const item = await Item.create(req.body);
    const populated = await Item.findById(item._id).populate('agency', 'name category');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create item', details: err.message });
  }
});

router.put('/items/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('agency', 'name category');
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update item', details: err.message });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item', details: err.message });
  }
});

/**
 * Quick Restock / Dispatch
 */
router.patch('/items/:id/restock', async (req, res) => {
  try {
    const { boxesAdded } = req.body;
    if (typeof boxesAdded !== 'number' || boxesAdded <= 0) {
      return res.status(400).json({ error: 'boxesAdded must be a positive number' });
    }

    const item = await Item.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { boxesInStock: boxesAdded },
        $set: { lastRestocked: new Date() }
      },
      { new: true }
    ).populate('agency', 'name category');

    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to restock item', details: err.message });
  }
});

router.patch('/items/:id/dispatch', async (req, res) => {
  try {
    const { boxesRemoved } = req.body;
    if (typeof boxesRemoved !== 'number' || boxesRemoved <= 0) {
      return res.status(400).json({ error: 'boxesRemoved must be a positive number' });
    }

    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.boxesInStock = Math.max(0, item.boxesInStock - boxesRemoved);
    await item.save();
    const populated = await Item.findById(item._id).populate('agency', 'name category');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to dispatch item', details: err.message });
  }
});

/**
 * Order Management for Admin
 */
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders: ' + err.message });
  }
});

router.patch('/orders/:orderId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { orderId } = req.params;
    let order = await Order.findOneAndUpdate(
      { orderId },
      { $set: { status } },
      { new: true }
    );
    if (!order && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findByIdAndUpdate(
        orderId,
        { $set: { status } },
        { new: true }
      );
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status: ' + err.message });
  }
});

router.patch('/orders/:orderId', async (req, res) => {
  try {
    const { customerPhone, customerName, shopName, notes } = req.body;
    const { orderId } = req.params;
    const updates = {};
    if (customerPhone !== undefined) updates.customerPhone = customerPhone.trim();
    if (customerName !== undefined) updates.customerName = customerName.trim();
    if (shopName !== undefined) updates.shopName = shopName.trim();
    if (notes !== undefined) updates.notes = notes.trim();

    let order = await Order.findOneAndUpdate(
      { orderId },
      { $set: updates },
      { new: true }
    );
    if (!order && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findByIdAndUpdate(
        orderId,
        { $set: updates },
        { new: true }
      );
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order: ' + err.message });
  }
});

router.delete('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    let order = await Order.findOneAndDelete({ orderId });
    if (!order && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findByIdAndDelete(orderId);
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order: ' + err.message });
  }
});

router.delete('/orders', async (req, res) => {
  try {
    const result = await Order.deleteMany({});
    res.json({ message: 'All order history deleted successfully', deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear all orders: ' + err.message });
  }
});

module.exports = router;
