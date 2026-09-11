const express = require('express');
const router = express.Router();
const Agency = require('../models/Agency');
const Item = require('../models/Item');

/**
 * GET /api/agencies
 * List every agency with aggregated box + item-type counts.
 * (No pricing is ever included in the response.)
 */
router.get('/', async (req, res) => {
  try {
    const agencies = await Agency.find().sort({ name: 1 }).lean();

    const withStats = await Promise.all(
      agencies.map(async (agency) => {
        const items = await Item.find({ agency: agency._id }).lean();
        const totalBoxes = items.reduce((sum, i) => sum + i.boxesInStock, 0);
        return {
          ...agency,
          itemCount: items.length,
          totalBoxes
        };
      })
    );

    res.json(withStats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load agencies', details: err.message });
  }
});

/**
 * GET /api/agencies/:id
 * Single agency + its items, each item's box status computed server-side.
 */
router.get('/:id', async (req, res) => {
  try {
    const agency = await Agency.findById(req.params.id).lean();
    if (!agency) return res.status(404).json({ error: 'Agency not found' });

    const items = await Item.find({ agency: agency._id }).sort({ name: 1 });
    const totalBoxes = items.reduce((sum, i) => sum + i.boxesInStock, 0);

    res.json({
      ...agency,
      itemCount: items.length,
      totalBoxes,
      items: items.map((i) => i.toJSON())
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load agency', details: err.message });
  }
});

const { requireAdminAuth } = require('../middleware/auth');

/**
 * POST /api/agencies (Admin Protected)
 * Create a new agency (e.g. onboarding a new supplier).
 * Body: { name, category, colorHex?, iconKey? }
 */
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const agency = await Agency.create(req.body);
    res.status(201).json(agency);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create agency', details: err.message });
  }
});

/**
 * PUT /api/agencies/:id (Admin Protected)
 * Update agency details (name/category/icon).
 */
router.put('/:id', requireAdminAuth, async (req, res) => {
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

/**
 * DELETE /api/agencies/:id (Admin Protected)
 * Remove an agency and all its items.
 */
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const agency = await Agency.findByIdAndDelete(req.params.id);
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    await Item.deleteMany({ agency: agency._id });
    res.json({ message: 'Agency and its items deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete agency', details: err.message });
  }
});

module.exports = router;
