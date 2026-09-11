const express = require('express');
const router = express.Router();

const Item = require('../models/Item');
const Order = require('../models/Order');
const Member = require('../models/Member');
const { requireAdminAuth } = require('../middleware/auth');

/**
 * GET /api/items?agency=<agencyId>
 * List items, optionally filtered by agency.
 */
router.get('/', async (req, res) => {
  try {
    const filter = req.query.agency ? { agency: req.query.agency } : {};
    const items = await Item.find(filter).populate('agency', 'name category').sort({ name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load items', details: err.message });
  }
});

/**
 * POST /api/items (Admin Protected)
 * Add a new item under an agency.
 * Body: { agency, name, unitsPerBox, boxesInStock, lastRestocked?, lowStockThreshold? }
 */
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create item', details: err.message });
  }
});

/**
 * PATCH /api/items/:id/restock (Admin Protected)
 * Add boxes to an item's stock and stamp lastRestocked to now.
 * Body: { boxesAdded }
 */
router.patch('/:id/restock', requireAdminAuth, async (req, res) => {
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
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to restock item', details: err.message });
  }
});

/**
 * PATCH /api/items/:id/dispatch (Admin Protected)
 * Remove boxes from stock (e.g. sold/moved out to store shelf).
 * Body: { boxesRemoved }
 */
router.patch('/:id/dispatch', requireAdminAuth, async (req, res) => {
  try {
    const { boxesRemoved } = req.body;
    if (typeof boxesRemoved !== 'number' || boxesRemoved <= 0) {
      return res.status(400).json({ error: 'boxesRemoved must be a positive number' });
    }

    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    item.boxesInStock = Math.max(0, item.boxesInStock - boxesRemoved);
    await item.save();
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to dispatch item', details: err.message });
  }
});

/**
 * POST /api/items/:id/buy
 * User purchase endpoint supporting both BOX and UNIT purchase with customer info.
 * Body: { buyType?: 'box' | 'unit', boxes?: number, units?: number, notes?: string, customerName?: string, shopName?: string, customerPhone?: string }
 */
router.post('/:id/buy', async (req, res) => {
  try {
    const buyType = req.body.buyType === 'unit' ? 'unit' : 'box';
    const notes = req.body.notes ? String(req.body.notes).trim() : '';
    const customerName = req.body.customerName ? String(req.body.customerName).trim() : 'Guest Member';
    const shopName = req.body.shopName ? String(req.body.shopName).trim() : '';
    const customerPhone = req.body.customerPhone ? String(req.body.customerPhone).trim() : '';

    const item = await Item.findById(req.params.id).populate('agency', 'name category');
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const unitsPerBox = item.unitsPerBox || 1;
    const pricePerBox = item.pricePerBox || 0;
    const pricePerUnit = item.pricePerUnit || (unitsPerBox ? Number((pricePerBox / unitsPerBox).toFixed(2)) : pricePerBox);

    let totalAmount = 0;
    let boxesBought = 0;
    let unitsBought = 0;

    if (buyType === 'unit') {
      const units = Number(req.body.units ?? req.body.quantity);
      if (!units || units <= 0) {
        return res.status(400).json({ error: 'Number of units must be at least 1' });
      }

      const maxUnitsAvailable = Math.floor(item.boxesInStock * unitsPerBox);
      if (units > maxUnitsAvailable) {
        return res.status(400).json({
          error: `Insufficient stock. Only ${maxUnitsAvailable} units (${item.boxesInStock} boxes) available.`
        });
      }

      const boxesDeducted = Number((units / unitsPerBox).toFixed(3));
      item.boxesInStock = Math.max(0, Number((item.boxesInStock - boxesDeducted).toFixed(2)));
      await item.save();

      unitsBought = units;
      boxesBought = boxesDeducted;
      totalAmount = Number((units * pricePerUnit).toFixed(2));
    } else {
      const boxes = Number(req.body.boxes ?? req.body.quantity);
      if (!boxes || boxes <= 0) {
        return res.status(400).json({ error: 'Number of boxes must be at least 1' });
      }

      if (item.boxesInStock < boxes) {
        return res.status(400).json({
          error: `Insufficient stock. Only ${item.boxesInStock} box${item.boxesInStock === 1 ? '' : 'es'} available.`
        });
      }

      item.boxesInStock = Math.max(0, Number((item.boxesInStock - boxes).toFixed(2)));
      await item.save();

      boxesBought = boxes;
      unitsBought = boxes * unitsPerBox;
      totalAmount = Number((boxes * pricePerBox).toFixed(2));
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

    // Auto-create / update Member in database
    if (customerPhone) {
      await Member.findOneAndUpdate(
        { phone: customerPhone },
        {
          $set: {
            name: customerName,
            shopName: shopName || '',
            phone: customerPhone
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(() => {});
    }

    // Save order in database
    const orderDoc = await Order.create({
      orderId,
      customerName,
      shopName,
      customerPhone,
      items: [
        {
          item: item._id,
          name: item.name,
          agencyName: item.agency?.name || 'Wholesale Supplier',
          buyType,
          packagingType: item.packagingType || 'box',
          boxesBought,
          unitsBought,
          unitsPerBox,
          rate: buyType === 'unit' ? pricePerUnit : pricePerBox,
          subtotal: totalAmount
        }
      ],
      totalBoxes: boxesBought,
      totalUnits: unitsBought,
      grandTotal: totalAmount,
      notes,
      status: 'confirmed'
    });

    return res.json({
      success: true,
      orderId,
      order: orderDoc,
      message: `Successfully purchased ${buyType === 'unit' ? `${unitsBought} pieces` : `${boxesBought} boxes`} of ${item.name}!`,
      buyType,
      item,
      customerName,
      shopName,
      customerPhone,
      boxesBought,
      unitsBought,
      pricePerBox,
      pricePerUnit,
      totalAmount,
      notes,
      purchaseDate: orderDoc.createdAt
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to process purchase: ' + err.message });
  }
});

/**
 * POST /api/items/checkout
 * Batch cart purchase endpoint supporting both BOX and UNIT items with order notes & member info.
 * Body: { items: [ { itemId, buyType: 'box' | 'unit', quantity?: number, boxes?: number, units?: number } ], notes?: string, customerName?: string, shopName?: string, customerPhone?: string }
 */
router.post('/checkout', async (req, res) => {
  try {
    const { items: cartItems, notes, customerName = 'Guest Member', shopName = '', customerPhone = '' } = req.body;
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty. Add at least one item.' });
    }

    // Phase 1: Validate stock for all items first
    const itemsToUpdate = [];
    for (const cItem of cartItems) {
      const dbItem = await Item.findById(cItem.itemId).populate('agency', 'name category');
      if (!dbItem) {
        return res.status(404).json({ error: `Item not found (ID: ${cItem.itemId})` });
      }

      const buyType = cItem.buyType === 'unit' ? 'unit' : 'box';
      const unitsPerBox = dbItem.unitsPerBox || 1;

      if (buyType === 'unit') {
        const units = Number(cItem.units ?? cItem.quantity);
        if (!units || units <= 0) {
          return res.status(400).json({ error: `Invalid unit quantity for "${dbItem.name}".` });
        }
        const maxUnitsAvailable = Math.floor(dbItem.boxesInStock * unitsPerBox);
        if (units > maxUnitsAvailable) {
          return res.status(400).json({
            error: `Insufficient stock for "${dbItem.name}". Requested ${units} units, but only ${maxUnitsAvailable} units available.`
          });
        }
        itemsToUpdate.push({ dbItem, buyType, units, boxes: Number((units / unitsPerBox).toFixed(3)) });
      } else {
        const boxes = Number(cItem.boxes ?? cItem.quantity);
        if (!boxes || boxes <= 0) {
          return res.status(400).json({ error: `Invalid box quantity for "${dbItem.name}".` });
        }
        if (dbItem.boxesInStock < boxes) {
          return res.status(400).json({
            error: `Insufficient stock for "${dbItem.name}". Requested ${boxes} boxes, but only ${dbItem.boxesInStock} available.`
          });
        }
        itemsToUpdate.push({ dbItem, buyType, boxes, units: boxes * unitsPerBox });
      }
    }

    // Phase 2: Deduct stock and assemble order breakdown
    let grandTotal = 0;
    let totalBoxesCount = 0;
    let totalUnitsCount = 0;
    const purchasedSummary = [];

    for (const entry of itemsToUpdate) {
      const { dbItem, buyType, boxes, units } = entry;
      const unitsPerBox = dbItem.unitsPerBox || 1;
      const pricePerBox = dbItem.pricePerBox || 0;
      const pricePerUnit = dbItem.pricePerUnit || (unitsPerBox ? Number((pricePerBox / unitsPerBox).toFixed(2)) : pricePerBox);

      let subtotal = 0;
      if (buyType === 'unit') {
        subtotal = Number((units * pricePerUnit).toFixed(2));
        dbItem.boxesInStock = Math.max(0, Number((dbItem.boxesInStock - boxes).toFixed(2)));
      } else {
        subtotal = Number((boxes * pricePerBox).toFixed(2));
        dbItem.boxesInStock = Math.max(0, Number((dbItem.boxesInStock - boxes).toFixed(2)));
      }

      await dbItem.save();

      grandTotal += subtotal;
      totalBoxesCount += boxes;
      totalUnitsCount += units;

      purchasedSummary.push({
        item: dbItem._id,
        itemId: dbItem._id,
        name: dbItem.name,
        agencyName: dbItem.agency?.name || 'Wholesale Supplier',
        buyType,
        packagingType: dbItem.packagingType || 'box',
        unitsPerBox,
        boxesBought: boxes,
        unitsBought: units,
        rate: buyType === 'unit' ? pricePerUnit : pricePerBox,
        subtotal,
        remainingStock: dbItem.boxesInStock
      });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const finalGrandTotal = Number(grandTotal.toFixed(2));
    const cleanCustomerName = String(customerName).trim() || 'Guest Member';
    const cleanShopName = String(shopName).trim() || '';
    const cleanCustomerPhone = String(customerPhone).trim() || '';

    if (cleanCustomerPhone) {
      await Member.findOneAndUpdate(
        { phone: cleanCustomerPhone },
        {
          $set: {
            name: cleanCustomerName,
            shopName: cleanShopName,
            phone: cleanCustomerPhone
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(() => {});
    }

    const orderDoc = await Order.create({
      orderId,
      customerName: cleanCustomerName,
      shopName: cleanShopName,
      customerPhone: cleanCustomerPhone,
      items: purchasedSummary,
      totalBoxes: totalBoxesCount,
      totalUnits: totalUnitsCount,
      grandTotal: finalGrandTotal,
      notes: notes ? String(notes).trim() : '',
      status: 'confirmed'
    });

    res.json({
      success: true,
      orderId,
      order: orderDoc,
      customerName: orderDoc.customerName,
      shopName: orderDoc.shopName,
      customerPhone: orderDoc.customerPhone,
      message: `Order #${orderId} confirmed across ${purchasedSummary.length} products!`,
      items: purchasedSummary,
      totalBoxes: totalBoxesCount,
      totalUnits: totalUnitsCount,
      grandTotal: finalGrandTotal,
      notes: notes ? String(notes).trim() : '',
      purchaseDate: orderDoc.createdAt
    });
  } catch (err) {
    res.status(400).json({ error: 'Checkout failed: ' + err.message });
  }
});

/**
 * PUT /api/items/:id (Admin Protected)
 * Full update of an item's fields.
 */
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update item', details: err.message });
  }
});

/**
 * DELETE /api/items/:id (Admin Protected)
 */
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item', details: err.message });
  }
});

module.exports = router;
