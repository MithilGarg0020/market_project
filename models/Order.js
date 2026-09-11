const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  },
  name: {
    type: String,
    required: true
  },
  agencyName: {
    type: String,
    default: 'Wholesale Supplier'
  },
  buyType: {
    type: String,
    enum: ['box', 'unit'],
    default: 'box'
  },
  packagingType: {
    type: String,
    enum: ['box', 'bag'],
    default: 'box'
  },
  boxesBought: {
    type: Number,
    default: 0
  },
  unitsBought: {
    type: Number,
    default: 0
  },
  unitsPerBox: {
    type: Number,
    default: 1
  },
  rate: {
    type: Number,
    required: true
  },
  subtotal: {
    type: Number,
    required: true
  }
});

const OrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true
    },
    customerName: {
      type: String,
      trim: true,
      default: 'Guest Member'
    },
    shopName: {
      type: String,
      trim: true,
      default: ''
    },
    customerPhone: {
      type: String,
      trim: true,
      default: ''
    },
    items: [OrderItemSchema],
    totalBoxes: {
      type: Number,
      default: 0
    },
    totalUnits: {
      type: Number,
      default: 0
    },
    grandTotal: {
      type: Number,
      required: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['confirmed', 'dispatched', 'delivered', 'cancelled'],
      default: 'confirmed'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Order', OrderSchema);
