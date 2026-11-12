require('dotenv').config();
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const Category = require('../models/Category');
const categories = [
  { name: 'Water Security', subcategories: [
    { code: 'WAT-01', name: 'Water conservation and harvesting' },
    { code: 'WAT-02', name: 'Traditional water bodies' },
  ] },
  { name: 'Core Rural Infrastructure', subcategories: [
    { code: 'INF-01', name: 'Rural connectivity' },
    { code: 'INF-02', name: 'Sanitation and drainage' },
  ] },
  { name: 'Rural Livelihood', subcategories: [
    { code: 'LIV-01', name: 'Agriculture and allied activities' },
    { code: 'LIV-02', name: 'Skill and livelihood facilities' },
  ] },
  { name: 'Disaster & Climate Resilience', subcategories: [
    { code: 'RES-01', name: 'Flood and erosion control' },
    { code: 'RES-02', name: 'Climate-resilient community assets' },
  ] },
];
async function main() {
  await connectDatabase();
  for (const category of categories) {
    await Category.updateOne(
      { name: category.name },
      { $setOnInsert: category },
      { upsert: true }
    );
  }
  console.log('Categories available:', await Category.countDocuments());
}
main().catch(err => { console.error('Category initialization failed:', err.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
