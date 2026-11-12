require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
(async () => {
  if (!process.env.BACKUP_DIRECTORY) throw new Error('Set BACKUP_DIRECTORY to a secure private directory.');
  await connectDatabase();
  const dest = path.resolve(process.env.BACKUP_DIRECTORY);
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  const name = `vbgramg-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  const out = {};
  for (const collection of await mongoose.connection.db.listCollections().toArray()) {
    out[collection.name] = await mongoose.connection.db.collection(collection.name).find({}).toArray();
  }
  const file = path.join(dest,name);
  fs.writeFileSync(file, JSON.stringify(out), { flag:'wx', mode:0o600 });
  console.log(`Backup created at ${file}. Contains sensitive data; encrypt and restrict access.`);
  await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exitCode=1;mongoose.disconnect().catch(()=>{});});
