const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { requireAuth, allowRoles } = require('../middleware/auth');
const Work = require('../models/Work');
const { Evidence, Inspection, Expense, Milestone } = require('../models/WorkEnhancement');
const router = express.Router();
router.use(requireAuth);
const manager = allowRoles('admin','officer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)) });
const safe = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const validId = id => mongoose.isValidObjectId(id);
const text = (v,max=200) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const date = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const finite = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const checkWork = async (req,res) => {
  if (!validId(req.params.workId)) { res.status(400).json({message:'Invalid work ID.'}); return null; }
  const work = await Work.findById(req.params.workId);
  if (!work) { res.status(404).json({message:'Work not found.'}); return null; }
  return work;
};
router.get('/works/:workId', safe(async (req,res) => {
  const work = await checkWork(req,res); if (!work) return;
  const [evidence, inspections, expenses, milestones] = await Promise.all([
    Evidence.find({work:work._id}).select('-bytes').sort({createdAt:-1}).limit(100).lean(),
    Inspection.find({work:work._id}).sort({createdAt:-1}).limit(100).lean(),
    Expense.find({work:work._id}).sort({date:-1}).limit(200).lean(),
    Milestone.find({work:work._id}).sort({dueDate:1}).limit(100).lean(),
  ]);
  const spent = expenses.reduce((sum,e) => sum+e.amount,0);
  const latestVerified = inspections.find(i=>i.verdict==='Verified');
  const now = new Date();
  const overdue = milestones.filter(m=>m.status!=='Completed' && new Date(m.dueDate)<now).length;
  const reasons = [];
  if (overdue) reasons.push(`${overdue} overdue milestone(s)`);
  if (work.plannedEndDate < now && work.status !== 'Completed') reasons.push('Past planned end date');
  if (work.actualProgress + 20 < work.plannedProgress) reasons.push('Progress gap exceeds 20 points');
  if (spent > work.budget && work.budget > 0) reasons.push('Recorded expenses exceed budget');
  if (work.expenditure && Math.abs(spent-work.expenditure)>0.01) reasons.push('Ledger differs from work expenditure field');
  res.json({work:{_id:work._id,name:work.name,budget:work.budget,plannedProgress:work.plannedProgress,actualProgress:work.actualProgress,isDemo:work.isDemo},evidence,inspections,expenses,milestones,financials:{ledgerSpent:spent,budget:work.budget,utilizationPercent:work.budget?Math.round(10000*spent/work.budget)/100:null},verifiedProgress:latestVerified?.reportedProgress??null,risk:{score:Math.min(100,reasons.length*25),reasons,method:'Explainable rule-based screening, not AI prediction'}});
}));
router.post('/works/:workId/evidence',manager,upload.single('photo'),safe(async(req,res)=>{
  const work=await checkWork(req,res); if(!work)return;
  const {stage,caption,latitude,longitude,capturedAt}=req.body;
  const lat=Number(latitude),lng=Number(longitude);
  if(!req.file || !['Before','During','After','Inspection'].includes(stage) || !finite(lat,-90,90) || !finite(lng,-180,180) || !date(capturedAt) || (caption && !text(caption,500))) return res.status(400).json({message:'Valid image (JPEG/PNG/WebP <=2MB), stage, GPS coordinates and capturedAt required.'});
  const signatures={'image/jpeg':b=>b[0]===255&&b[1]===216&&b[2]===255,'image/png':b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/webp':b=>b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'};
  if(!signatures[req.file.mimetype](req.file.buffer)) return res.status(400).json({message:'Image contents do not match the declared format.'});
  const record=await Evidence.create({work:work._id,createdBy:req.user._id,isDemo:work.isDemo,stage,caption:caption||'',latitude:lat,longitude:lng,capturedAt:new Date(capturedAt),mime:req.file.mimetype,bytes:req.file.buffer});
  res.status(201).json({id:record._id});
}));
router.get('/evidence/:id/image',safe(async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({message:'Invalid evidence ID.'});
  const e=await Evidence.findById(req.params.id);if(!e)return res.status(404).json({message:'Not found.'});
  res.set('Cache-Control','private, no-store');res.type(e.mime);res.send(e.bytes);
}));
router.post('/works/:workId/inspections',manager,safe(async(req,res)=>{
  const work=await checkWork(req,res);if(!work)return;
  const {verdict,reportedProgress,notes,checklist}=req.body;
  if(!['Verified','Rejected','Needs rework'].includes(verdict)||!finite(reportedProgress,0,100)||!text(notes,2000)||!Array.isArray(checklist)||checklist.length>30||!checklist.every(c=>text(c.label,120)&&typeof c.passed==='boolean'))return res.status(400).json({message:'Invalid inspection details.'});
  const record=await Inspection.create({work:work._id,createdBy:req.user._id,isDemo:work.isDemo,verdict,reportedProgress,notes,checklist});res.status(201).json(record);
}));
router.post('/works/:workId/expenses',manager,safe(async(req,res)=>{
  const work=await checkWork(req,res);if(!work)return;
  const {amount,date:spentDate,purpose,reference}=req.body;
  if(!finite(amount,0.01,1e12)||!date(spentDate)||!text(purpose,300)||(reference&&!text(reference,100)))return res.status(400).json({message:'Invalid expenditure details.'});
  const record=await Expense.create({work:work._id,createdBy:req.user._id,isDemo:work.isDemo,amount,date:new Date(spentDate),purpose,reference:reference||''});res.status(201).json(record);
}));
router.post('/works/:workId/milestones',manager,safe(async(req,res)=>{
  const work=await checkWork(req,res);if(!work)return;
  const {title,dueDate,notes}=req.body;
  if(!text(title,160)||!date(dueDate)||(notes&&!text(notes,1000)))return res.status(400).json({message:'Invalid milestone details.'});
  const record=await Milestone.create({work:work._id,createdBy:req.user._id,isDemo:work.isDemo,title,dueDate:new Date(dueDate),notes:notes||''});res.status(201).json(record);
}));
router.patch('/milestones/:id',manager,safe(async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({message:'Invalid milestone ID.'});
  if(!['Pending','In progress','Completed'].includes(req.body.status))return res.status(400).json({message:'Invalid milestone status.'});
  const record=await Milestone.findByIdAndUpdate(req.params.id,{$set:{status:req.body.status,completedAt:req.body.status==='Completed'?new Date():null}},{new:true,runValidators:true});
  if(!record)return res.status(404).json({message:'Milestone not found.'});res.json(record);
}));
module.exports=router;
