const mongoose = require('mongoose');

const workAuditSchema = new mongoose.Schema(
  {
    workId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    workName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    action: {
      type: String,
      enum: ['deleted'],
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
  },
  { timestamps: { createdAt: 'recordedAt', updatedAt: false } }
);

workAuditSchema.index({ workId: 1, recordedAt: -1 });

module.exports = mongoose.model('WorkAudit', workAuditSchema);
