const mongoose = require('mongoose');
const grievanceSchema = new mongoose.Schema({
  reference: { type: String, unique: true, index: true },
  citizenName: { type: String, required: true, trim: true, maxlength: 100 },
  contact: { type: String, trim: true, maxlength: 40, default: '' },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  location: { state: { type: String, required: true }, district: { type: String, required: true }, block: { type: String, default: '' }, gramPanchayat: { type: String, default: '' } },
  category: { type: String, enum: ['Roads', 'Water', 'Sanitation', 'Housing', 'Other'], default: 'Other' },
  status: { type: String, enum: ['Received', 'Under review', 'In progress', 'Resolved', 'Rejected'], default: 'Received', index: true },
  response: { type: String, maxlength: 3000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
grievanceSchema.pre('validate', function setReference(next) { if (!this.reference) this.reference = `VBG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; next(); });
module.exports = mongoose.model('Grievance', grievanceSchema);
