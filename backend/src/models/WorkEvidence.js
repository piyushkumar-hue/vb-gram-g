const mongoose = require('mongoose');
const evidenceSchema = new mongoose.Schema({
  work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true, index: true },
  url: { type: String, required: true, maxlength: 1000 },
  caption: { type: String, trim: true, maxlength: 300, default: '' },
  stage: { type: String, enum: ['Before', 'During', 'After', 'Inspection'], default: 'During' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
module.exports = mongoose.model('WorkEvidence', evidenceSchema);
