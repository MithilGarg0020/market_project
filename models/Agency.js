const mongoose = require('mongoose');

// An "agency" is a supplier/brand whose goods the store stocks
// (e.g. Uttam Ghee, Goldiee Masala, Tikks Sauce & Cream, Nirma).
// No pricing fields exist on purpose — this app tracks box quantity only.
const agencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    // Hex color used for the agency's icon tile in the UI
    colorHex: {
      type: String,
      default: '#F1E9D6'
    },
    // Which built-in icon/emoji to render for this agency in the UI
    iconKey: {
      type: String,
      default: 'box'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Agency', agencySchema);
