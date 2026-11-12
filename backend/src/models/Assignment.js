const mongoose = require('mongoose');
const assignmentSchema = new mongoose.Schema({
  work: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true, index: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  status: { type: String, enum: ['Pending', 'In progress', 'Completed'], default: 'Pending' },
  dueDate: { type: Date, required: true },
}, { timestamps: true });
module.exports = mongoose.model('Assignment', assignmentSchema);
