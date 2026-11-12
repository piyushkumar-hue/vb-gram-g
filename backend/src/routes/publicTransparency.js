const express=require('express');
const rateLimit=require('express-rate-limit');
const PublicWork=require('../models/PublicWork');
const Grievance=require('../models/Grievance');
const router=express.Router();
router.get('/works',async(req,res,next)=>{try{const rows=await PublicWork.find().populate('work','name status location plannedProgress actualProgress isDemo').sort({publishedAt:-1}).limit(100).lean();res.json({works:rows.filter(r=>r.work&&!r.work.isDemo).map(r=>({id:r.work._id,name:r.work.name,status:r.work.status,location:r.work.location,progress:r.work.actualProgress,publishedAt:r.publishedAt}))})}catch(e){next(e)}});
module.exports=router;
