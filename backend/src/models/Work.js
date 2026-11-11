const mongoose = require('mongoose');
const { WORK_STATUSES } = require('../domain/workLifecycle');

const WORK_SOURCES = ['manual', 'iot'];

const locationSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true, maxlength: 150, match: /^[^\u0000-\u001f\u007f]*$/ },
    district: { type: String, required: true, trim: true, maxlength: 150, index: true, match: /^[^\u0000-\u001f\u007f]*$/ },
    block: { type: String, required: true, trim: true, maxlength: 150, match: /^[^\u0000-\u001f\u007f]*$/ },
    gramPanchayat: { type: String, required: true, trim: true, maxlength: 150, match: /^[^\u0000-\u001f\u007f]*$/ },
    stateCode: { type: String, trim: true, maxlength: 80, default: null, match: /^[^\u0000-\u001f\u007f]*$/ },
    districtCode: { type: String, trim: true, maxlength: 80, default: null, match: /^[^\u0000-\u001f\u007f]*$/ },
    blockCode: { type: String, trim: true, maxlength: 80, default: null, match: /^[^\u0000-\u001f\u007f]*$/ },
    gramPanchayatCode: { type: String, trim: true, maxlength: 80, default: null, match: /^[^\u0000-\u001f\u007f]*$/ },
    codeScheme: { type: String, trim: true, maxlength: 80, default: null, match: /^[^\u0000-\u001f\u007f]*$/ },
  },
  { _id: false }
);

const workSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      match: /^[^\u0000-\u001f\u007f]*$/,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
      match: /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    subCategory: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      match: /^[^\u0000-\u001f\u007f]*$/,
      index: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isDemo: {
      type: Boolean,
      default: false,
      immutable: true,
      index: true,
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    plannedProgress: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    actualProgress: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    status: {
      type: String,
      enum: WORK_STATUSES,
      default: 'Proposed',
      required: true,
      index: true,
    },
    expenditure: {
      type: Number,
      min: 0,
      default: 0,
    },
    plannedStartDate: { type: Date, required: true },
    plannedEndDate: { type: Date, required: true },
    actualStartDate: { type: Date, default: null },
    actualEndDate: { type: Date, default: null },
    source: {
      type: String,
      enum: WORK_SOURCES,
      default: 'manual',
      required: true,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

workSchema.virtual('isDelayed').get(function isDelayed() {
  return this.actualProgress < this.plannedProgress;
});

workSchema.index({ 'location.district': 1, status: 1 });
workSchema.index({ category: 1, 'location.district': 1, status: 1 });

module.exports = mongoose.model('Work', workSchema);
module.exports.WORK_STATUSES = WORK_STATUSES;
module.exports.WORK_SOURCES = WORK_SOURCES;
