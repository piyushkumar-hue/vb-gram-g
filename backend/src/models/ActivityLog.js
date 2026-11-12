const mongoose = require('mongoose');
const schema = new mongoose.Schema({actor:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},method:{type:String,required:true},path:{type:String,required:true,maxlength:300},status:{type:Number,required:true},at:{type:Date,default:Date.now,index:true}}, {versionKey:false});
module.exports=mongoose.model('ActivityLog',schema);
