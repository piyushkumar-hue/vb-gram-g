const mongoose=require('mongoose');
const schema=new mongoose.Schema({work:{type:mongoose.Schema.Types.ObjectId,ref:'Work',unique:true,required:true},publishedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},publishedAt:{type:Date,default:Date.now}}, {timestamps:true});
module.exports=mongoose.model('PublicWork',schema);
