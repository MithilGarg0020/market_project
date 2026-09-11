const mongoose = require('mongoose');

// A single stock-keeping unit belonging to one agency.
// Deliberately has NO price field — this app only tracks box/unit quantity.
const itemSchema = new mongoose.Schema(
  {
    agency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    unitsPerBox: {
      type: Number,
      required: true,
      min: 1
    },
    boxesInStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    lastRestocked: {
      type: Date,
      default: Date.now
    },
    // Boxes at or below this count are flagged "low stock" in the API/UI
    lowStockThreshold: {
      type: Number,
      default: 10
    },
    // Wholesale price per box/bag (in INR ₹)
    pricePerBox: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    // Packaging format: 'box' or 'bag'
    packagingType: {
      type: String,
      enum: ['box', 'bag'],
      default: 'box',
      trim: true
    }
  },
  { timestamps: true }
);

// Virtual so the client doesn't have to re-derive this everywhere
itemSchema.virtual('status').get(function () {
  return this.boxesInStock <= this.lowStockThreshold ? 'low' : 'ok';
});

// Virtual for price per individual unit (derived from box price / units per box)
itemSchema.virtual('pricePerUnit').get(function () {
  if (!this.pricePerBox || !this.unitsPerBox) return 0;
  return Number((this.pricePerBox / this.unitsPerBox).toFixed(2));
});

itemSchema.set('toJSON', { virtuals: true });
itemSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Item', itemSchema);
