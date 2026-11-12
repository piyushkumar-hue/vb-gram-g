const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 1000 },
  type: { type: String, enum: ['assignment', 'deadline', 'grievance', 'system'], default: 'system' },
  readAt: { type: Date, default: null },
  link: { type: String, default: '' },
}, { timestamps: true });
module.exports = mongoose.model('Notification', notificationSchema);
