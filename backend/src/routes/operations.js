const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, allowRoles } = require('../middleware/auth');
const Work = require('../models/Work');
const User = require('../models/User');
const Assignment = require('../models/Assignment');
const Grievance = require('../models/Grievance');
const Notification = require('../models/Notification');
const WorkEvidence = require('../models/WorkEvidence');
const router = express.Router();
router.use(requireAuth);
const managers = allowRoles('admin', 'officer');
const isId = (id) => mongoose.isValidObjectId(id);

router.get('/officers', managers, async (req, res, next) => { try { const officers = await User.find({ role: { $in: ['admin', 'officer'] } }).select('name email role').sort({ name: 1 }); res.json({ officers }); } catch (e) { next(e); } });
router.get('/assignments', async (req, res, next) => { try {
  const filter = req.user.role === 'admin' ? {} : { $or: [{ assignee: req.user._id }, { assignedBy: req.user._id }] };
  const rows = await Assignment.find(filter).populate('work', 'name location status actualProgress').populate('assignee', 'name email').populate('assignedBy', 'name').sort({ dueDate: 1 }).limit(300);
  res.json({ assignments: rows });
} catch (e) { next(e); } });
router.post('/assignments', managers, async (req, res, next) => { try {
  const { workId, assigneeId, title, description = '', priority = 'Medium', dueDate } = req.body || {};
  if (!isId(workId) || !isId(assigneeId) || typeof title !== 'string' || !title.trim() || !dueDate || Number.isNaN(Date.parse(dueDate))) return res.status(400).json({ message: 'A valid work, assignee, title and due date are required.' });
  const [work, assignee] = await Promise.all([Work.findById(workId), User.findById(assigneeId).select('name role')]);
  if (!work || !assignee || assignee.role === 'viewer') return res.status(404).json({ message: 'Work or eligible officer was not found.' });
  const row = await Assignment.create({ work: workId, assignee: assigneeId, assignedBy: req.user._id, title: title.trim(), description, priority, dueDate });
  await Notification.create({ recipient: assigneeId, title: 'New work assignment', message: `${title.trim()} · ${work.name}`, type: 'assignment', link: '/operations' });
  res.status(201).json({ assignment: await row.populate([{ path: 'work', select: 'name location status actualProgress' }, { path: 'assignee', select: 'name email' }, { path: 'assignedBy', select: 'name' }]) });
} catch (e) { next(e); } });
router.patch('/assignments/:id', async (req, res, next) => { try {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid assignment ID.' });
  const row = await Assignment.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Assignment not found.' });
  if (req.user.role !== 'admin' && String(row.assignee) !== String(req.user._id) && String(row.assignedBy) !== String(req.user._id)) return res.status(403).json({ message: 'Not allowed to update this assignment.' });
  if (req.body.status && !['Pending', 'In progress', 'Completed'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid assignment status.' });
  if (req.body.status) row.status = req.body.status;
  await row.save(); res.json({ assignment: await row.populate([{ path: 'work', select: 'name location status actualProgress' }, { path: 'assignee', select: 'name email' }, { path: 'assignedBy', select: 'name' }]) });
} catch (e) { next(e); } });

router.get('/grievances', async (req, res, next) => { try { const grievances = await Grievance.find().populate('createdBy', 'name').sort({ createdAt: -1 }).limit(300); res.json({ grievances }); } catch (e) { next(e); } });
router.post('/grievances', async (req, res, next) => { try {
  const b = req.body || {}; if (![b.citizenName, b.subject, b.description, b.location?.state, b.location?.district].every((v) => typeof v === 'string' && v.trim())) return res.status(400).json({ message: 'Citizen name, subject, description, state and district are required.' });
  const grievance = await Grievance.create({ ...b, createdBy: req.user._id }); res.status(201).json({ grievance });
} catch (e) { next(e); } });
router.patch('/grievances/:id', managers, async (req, res, next) => { try {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid grievance ID.' });
  const allowed = ['Received', 'Under review', 'In progress', 'Resolved', 'Rejected'];
  if (req.body.status && !allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid grievance status.' });
  const grievance = await Grievance.findByIdAndUpdate(req.params.id, { $set: { ...(req.body.status ? { status: req.body.status } : {}), ...(typeof req.body.response === 'string' ? { response: req.body.response.slice(0, 3000) } : {}), updatedBy: req.user._id } }, { new: true, runValidators: true });
  if (!grievance) return res.status(404).json({ message: 'Grievance not found.' });
  if (grievance.createdBy) await Notification.create({ recipient: grievance.createdBy, title: 'Grievance status updated', message: `${grievance.reference}: ${grievance.status}`, type: 'grievance', link: '/operations' });
  res.json({ grievance });
} catch (e) { next(e); } });

router.get('/notifications', async (req, res, next) => { try { const notifications = await Notification.find({ $or: [{ recipient: req.user._id }, { recipient: null }] }).sort({ createdAt: -1 }).limit(100); res.json({ notifications, unread: notifications.filter((n) => !n.readAt).length }); } catch (e) { next(e); } });
router.patch('/notifications/:id/read', async (req, res, next) => { try { if (!isId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID.' }); const row = await Notification.findOneAndUpdate({ _id: req.params.id, $or: [{ recipient: req.user._id }, { recipient: null }] }, { $set: { readAt: new Date() } }, { new: true }); if (!row) return res.status(404).json({ message: 'Notification not found.' }); res.json({ notification: row }); } catch (e) { next(e); } });

router.get('/works/:workId/evidence', async (req, res, next) => { try { if (!isId(req.params.workId)) return res.status(400).json({ message: 'Invalid work ID.' }); const evidence = await WorkEvidence.find({ work: req.params.workId }).populate('uploadedBy', 'name').sort({ createdAt: -1 }); res.json({ evidence }); } catch (e) { next(e); } });
router.post('/works/:workId/evidence', managers, async (req, res, next) => { try { if (!isId(req.params.workId)) return res.status(400).json({ message: 'Invalid work ID.' }); const { url, caption = '', stage = 'During' } = req.body || {}; if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return res.status(400).json({ message: 'Evidence URL must use HTTPS.' }); if (!await Work.exists({ _id: req.params.workId })) return res.status(404).json({ message: 'Work not found.' }); const evidence = await WorkEvidence.create({ work: req.params.workId, url, caption, stage, uploadedBy: req.user._id }); res.status(201).json({ evidence: await evidence.populate('uploadedBy', 'name') }); } catch (e) { next(e); } });

router.patch('/works/:workId/finance', managers, async (req, res, next) => { try {
  if (!isId(req.params.workId)) return res.status(400).json({ message: 'Invalid work ID.' });
  const fields = ['budget', 'amountReleased', 'expenditure']; const patch = {};
  for (const field of fields) if (req.body[field] !== undefined) { const value = req.body[field]; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return res.status(400).json({ message: `${field} must be a non-negative number.` }); patch[field] = value; }
  if (!Object.keys(patch).length) return res.status(400).json({ message: 'Provide at least one financial field.' });
  const work = await Work.findByIdAndUpdate(req.params.workId, { $set: patch }, { new: true, runValidators: true });
  if (!work) return res.status(404).json({ message: 'Work not found.' }); res.json({ work });
} catch (e) { next(e); } });

router.get('/insights', async (req, res, next) => { try {
  const works = await Work.find(req.query.includeDemo === 'true' ? {} : { isDemo: false }).select('name status plannedProgress actualProgress expenditure plannedEndDate location');
  const now = new Date(); const insights = works.map((w) => { const gap = Math.max(0, (w.plannedProgress || 0) - (w.actualProgress || 0)); const overdue = w.status !== 'Completed' && w.plannedEndDate < now; return { workId: w._id, name: w.name, district: w.location?.district, gap, overdue, expenditure: w.expenditure || 0, level: overdue || gap >= 30 ? 'High' : gap >= 15 ? 'Medium' : 'Low', reason: overdue ? 'Planned end date has passed and work is not completed.' : gap >= 15 ? `Actual progress trails planned progress by ${gap} percentage points.` : 'No major progress risk detected from available fields.' }; }).filter((x) => x.level !== 'Low').sort((a, b) => (b.overdue - a.overdue) || b.gap - a.gap).slice(0, 50);
  const totals = works.reduce((a, w) => ({ budget: a.budget + (w.budget || 0), amountReleased: a.amountReleased + (w.amountReleased || 0), budgetSpent: a.budgetSpent + (w.expenditure || 0), completed: a.completed + (w.status === 'Completed' ? 1 : 0) }), { budget: 0, amountReleased: 0, budgetSpent: 0, completed: 0 });
  res.json({ generatedAt: now.toISOString(), disclaimer: 'Rule-based operational indicators from entered records; not an AI prediction or independent verification.', totals: { works: works.length, ...totals }, risks: insights });
} catch (e) { next(e); } });
router.get('/reports/works.csv', async (req, res, next) => { try {
  const works = await Work.find(req.query.includeDemo === 'true' ? {} : { isDemo: false }).populate('category', 'name').sort({ 'location.state': 1, 'location.district': 1 });
  const columns = ['name','category','status','state','district','block','gramPanchayat','plannedProgress','actualProgress','expenditure','plannedStartDate','plannedEndDate'];
  const rows = [columns, ...works.map((w) => [w.name,w.category?.name || '',w.status,w.location.state,w.location.district,w.location.block,w.location.gramPanchayat,w.plannedProgress,w.actualProgress,w.expenditure,w.plannedStartDate?.toISOString?.() || '',w.plannedEndDate?.toISOString?.() || ''])];
  const csv = rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="vb-gram-g-works-report.csv"' }).send(csv);
} catch (e) { next(e); } });
module.exports = router;
