const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Order = require('../models/Order');

/**
 * GET /api/members
 * List all members (can search by name, phone, or shopName).
 */
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search && search.trim()) {
      const q = new RegExp(search.trim(), 'i');
      filter.$or = [{ name: q }, { phone: q }, { shopName: q }];
    }
    const members = await Member.find(filter).sort({ createdAt: -1 }).lean();

    // Attach order summary for each member
    const membersWithStats = await Promise.all(
      members.map(async (m) => {
        const orderCount = await Order.countDocuments({ customerPhone: m.phone });
        const orders = await Order.find({ customerPhone: m.phone }).select('grandTotal createdAt').lean();
        const totalSpent = orders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
        return {
          ...m,
          orderCount,
          totalSpent: Number(totalSpent.toFixed(2)),
          lastOrderDate: orders.length > 0 ? orders[orders.length - 1].createdAt : null
        };
      })
    );

    res.json(membersWithStats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members: ' + err.message });
  }
});

/**
 * POST /api/members
 * Create or update a member profile by phone number (upsert).
 */
router.post('/', async (req, res) => {
  try {
    const { name, shopName, phone, city, address, oldPhone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Member name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanPhone = phone.trim();
    const cleanOldPhone = (oldPhone || '').trim();

    const updateData = {
      name: name.trim(),
      shopName: (shopName || '').trim(),
      phone: cleanPhone,
      city: (city || '').trim(),
      address: (address || '').trim()
    };

    let member;
    // If the member is changing their phone number, update their existing record
    if (cleanOldPhone && cleanOldPhone !== cleanPhone) {
      member = await Member.findOneAndUpdate(
        { phone: cleanOldPhone },
        { $set: updateData },
        { new: true }
      );
    }

    // If not found by oldPhone or phone didn't change, upsert by new phone number
    if (!member) {
      member = await Member.findOneAndUpdate(
        { phone: cleanPhone },
        { $set: updateData },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    res.status(200).json(member);
  } catch (err) {
    res.status(400).json({ error: 'Failed to save member: ' + err.message });
  }
});

/**
 * GET /api/members/:phone
 * Retrieve member details and order history by phone.
 */
router.get('/:phone', async (req, res) => {
  try {
    const member = await Member.findOne({ phone: req.params.phone }).lean();
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const orders = await Order.find({ customerPhone: req.params.phone }).sort({ createdAt: -1 });
    res.json({ member, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch member details: ' + err.message });
  }
});

const { requireAdminAuth } = require('../middleware/auth');

/**
 * DELETE /api/members/:id (Admin Protected)
 * Delete member profile
 */
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const member = await Member.findByIdAndDelete(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true, message: `Member "${member.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete member: ' + err.message });
  }
});

module.exports = router;
