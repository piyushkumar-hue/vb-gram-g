const mongoose = require('mongoose');

const reportingCoverageSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true, maxlength: 150, immutable: true },
    district: { type: String, required: true, trim: true, maxlength: 150, immutable: true },
    periodFrom: { type: Date, required: true, immutable: true },
    periodTo: { type: Date, required: true, immutable: true },
    reportedWorkCount: { type: Number, enum: [0], default: 0, immutable: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  },
  { timestamps: true }
);

reportingCoverageSchema.index(
  { state: 1, district: 1, periodFrom: 1, periodTo: 1 },
  { unique: true }
);

module.exports = mongoose.model('ReportingCoverage', reportingCoverageSchema);
