const mongoose = require('mongoose');
const { WORK_STATUSES } = require('../domain/workLifecycle');

const fieldUpdateSchema = new mongoose.Schema(
  {
    workId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Work',
      required: true,
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
    status: {
      type: String,
      enum: WORK_STATUSES,
      required: true,
    },
    progress: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    evidenceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    source: {
      type: String,
      enum: ['iot'],
      default: 'iot',
      required: true,
    },
    deviceId: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

fieldUpdateSchema.index({ workId: 1, receivedAt: -1 });
fieldUpdateSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('FieldUpdate', fieldUpdateSchema);
