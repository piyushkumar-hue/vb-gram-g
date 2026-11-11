require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const FieldUpdate = require('../models/FieldUpdate');
const User = require('../models/User');
const Work = require('../models/Work');
const WorkAudit = require('../models/WorkAudit');
const {
  assertDemoDatabaseAllowed,
  databaseNameFromUri,
  forceDemoRequested,
} = require('./demoSafety');

function demoClearQueries(demoWorkIds) {
  return {
    works: { isDemo: true },
    users: { isDemo: true },
    fieldUpdates: { workId: { $in: demoWorkIds } },
    audits: { workId: { $in: demoWorkIds } },
  };
}

async function clearDemoDatabase() {
  assertDemoDatabaseAllowed(databaseNameFromUri(process.env.MONGODB_URI), forceDemoRequested());
  await connectDatabase();
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB is not connected.');

  const demoWorkIds = await Work.find({ isDemo: true }).distinct('_id');
  const filters = demoClearQueries(demoWorkIds);
  const [history, audits, works, users] = await Promise.all([
    FieldUpdate.deleteMany(filters.fieldUpdates),
    WorkAudit.deleteMany(filters.audits),
    Work.deleteMany(filters.works),
    User.deleteMany(filters.users),
  ]);

  console.log(`Cleared only tagged demo records from database "${mongoose.connection.name}": ${works.deletedCount} works, ${history.deletedCount} field updates, ${audits.deletedCount} audit events, ${users.deletedCount} demo accounts.`);
}

if (require.main === module) {
  clearDemoDatabase()
    .catch((error) => {
      console.error(`Clear demo data failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { clearDemoDatabase, demoClearQueries };
