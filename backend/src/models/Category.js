const mongoose = require('mongoose');

const CATEGORY_NAMES = [
  'Water Security',
  'Core Rural Infrastructure',
  'Rural Livelihood',
  'Disaster & Climate Resilience',
];

const subcategorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: CATEGORY_NAMES,
      required: true,
      unique: true,
      trim: true,
    },
    subcategories: {
      type: [subcategorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
module.exports.CATEGORY_NAMES = CATEGORY_NAMES;
