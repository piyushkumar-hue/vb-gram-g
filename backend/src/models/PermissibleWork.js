const mongoose = require('mongoose');
const { CATEGORY_NAMES } = require('./Category');

const sourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 250 },
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          try {
            return ['http:', 'https:'].includes(new URL(value).protocol);
          } catch {
            return false;
          }
        },
        message: 'Source URL must use HTTP or HTTPS.',
      },
    },
    reference: { type: String, required: true, trim: true, maxlength: 500 },
    publishedDate: { type: Date, default: null },
    accessedDate: { type: Date, required: true },
  },
  { _id: false }
);

const permissibleWorkSchema = new mongoose.Schema(
  {
    categoryName: { type: String, enum: CATEGORY_NAMES, required: true, trim: true },
    subCategoryCode: { type: String, required: true, trim: true, uppercase: true },
    subCategoryName: { type: String, required: true, trim: true, maxlength: 200 },
    code: { type: String, required: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 300 },
    source: { type: sourceSchema, required: true },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified'],
      default: 'pending',
      required: true,
    },
  },
  { timestamps: true }
);

permissibleWorkSchema.index(
  { categoryName: 1, subCategoryCode: 1, code: 1 },
  { unique: true }
);
permissibleWorkSchema.index({ categoryName: 1, subCategoryCode: 1, name: 1 });

module.exports = mongoose.model('PermissibleWork', permissibleWorkSchema);
