const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

/**
 * GET /api/orders
 * List orders.
 * Supports filtering by phone (?phone=9876543210) or customerName (?name=...)
 */
router.get('/', async (req, res) => {
  try {
    const { phone, name, exactPhone, limit = 50 } = req.query;
    const filter = {};

    if (exactPhone) {
      filter.customerPhone = exactPhone.trim();
    } else if (phone) {
      // Escape special regex characters to avoid regex injection or loose matching
      const escaped = phone.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.customerPhone = new RegExp(`^${escaped}$`, 'i');
    }
    if (name) {
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.customerName = new RegExp(`^${escapedName}$`, 'i');
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve orders: ' + err.message });
  }
});

/**
 * GET /api/orders/:orderId
 * Retrieve single order by order reference or MongoDB _id
 */
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    let order = await Order.findOne({ orderId });
    if (!order && orderId.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(orderId);
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve order: ' + err.message });
  }
});

const { requireAdminAuth } = require('../middleware/auth');

/**
 * PATCH /api/orders/:orderId/status (Admin Protected)
 * Update order fulfillment status (e.g. dispatched, delivered, cancelled)
 */
router.patch('/:orderId/status', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['confirmed', 'dispatched', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

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

/**
 * POST /api/orders/migrate-phone
 * Link / migrate past orders to a member's updated phone number.
 * Accepts { oldPhone, newPhone, orderId, customerName, shopName }
 */
router.post('/migrate-phone', async (req, res) => {
  try {
    const { oldPhone, newPhone, orderId, customerName, shopName } = req.body;
    if (!newPhone || !newPhone.trim()) {
      return res.status(400).json({ error: 'Target new phone number is required.' });
    }

    const targetPhone = newPhone.trim();
    const updateFields = { customerPhone: targetPhone };
    if (customerName && customerName.trim()) {
      updateFields.customerName = customerName.trim();
    }
    if (shopName !== undefined) {
      updateFields.shopName = shopName.trim();
    }

    let updatedCount = 0;

    // Case 1: Specific Order ID provided (e.g. from self-service claim)
    if (orderId && orderId.trim()) {
      const trimmedId = orderId.trim();
      const match = await Order.findOneAndUpdate(
        { $or: [{ orderId: trimmedId }, { _id: trimmedId.match(/^[0-9a-fA-F]{24}$/) ? trimmedId : null }] },
        { $set: updateFields },
        { new: true }
      );
      if (match) updatedCount = 1;
    } else if (oldPhone && oldPhone.trim()) {
      // Case 2: Bulk migration of all records from oldPhone -> newPhone
      const escapedOld = oldPhone.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const result = await Order.updateMany(
        { customerPhone: new RegExp(`^${escapedOld}$`, 'i') },
        { $set: updateFields }
      );
      updatedCount = result.modifiedCount;
    }

    res.json({
      success: true,
      message: `Successfully updated ${updatedCount} order(s) to phone ${targetPhone}.`,
      updatedCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to migrate orders: ' + err.message });
  }
});

/**
 * DELETE /api/orders (Admin Protected)
 * Clear orders history.
 * If ?phone=... is provided, clears only that member's orders.
 * Otherwise clears all orders.
 */
router.delete('/', requireAdminAuth, async (req, res) => {
  try {
    const { phone } = req.query;
    const filter = {};
    if (phone && phone.trim()) {
      filter.customerPhone = new RegExp(phone.trim(), 'i');
    }
    const result = await Order.deleteMany(filter);
    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} orders from history.`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear orders: ' + err.message });
  }
});

module.exports = router;
