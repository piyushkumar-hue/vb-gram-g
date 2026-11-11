const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { assertDedicatedDatabase, databaseNameFromUri } = connectDatabase;

test('database URI validation accepts the dedicated database in MongoDB URI formats', () => {
  const multiHostUri = 'mongodb://host-a:27017,host-b:27017/vb_gram_g?authSource=admin';
  const srvUri = 'mongodb+srv://cluster.example/vb_gram_g?retryWrites=true&w=majority';

  assert.equal(databaseNameFromUri(multiHostUri), 'vb_gram_g');
  assert.equal(databaseNameFromUri(srvUri), 'vb_gram_g');
  assert.doesNotThrow(() => assertDedicatedDatabase(multiHostUri));
  assert.doesNotThrow(() => assertDedicatedDatabase(srvUri));
});

test('database URI validation refuses explicitly different databases and accepts Atlas URIs without a path', () => {
  assert.equal(databaseNameFromUri('mongodb://host-a:27017/alumniConnectDB'), 'alumniConnectDB');
  assert.throws(
    () => assertDedicatedDatabase('mongodb://host-a:27017/alumniConnectDB'),
    /must use "vb_gram_g"/
  );
  assert.doesNotThrow(() => assertDedicatedDatabase('mongodb+srv://cluster.example/?retryWrites=true&w=majority'));
  assert.equal(databaseNameFromUri('mongodb+srv://cluster.example/?retryWrites=true&w=majority'), null);
  assert.throws(
    () => assertDedicatedDatabase('not-a-mongodb-uri'),
    /not a valid MongoDB connection string/
  );
});

test('database connection refuses alumniConnectDB before opening a connection', async () => {
  const originalUri = process.env.MONGODB_URI;
  const originalConnect = mongoose.connect;
  let connectionAttempted = false;
  process.env.MONGODB_URI = 'mongodb://host-a:27017/alumniConnectDB';
  mongoose.connect = async () => {
    connectionAttempted = true;
  };

  try {
    await assert.rejects(connectDatabase(), /must use "vb_gram_g"/);
    assert.equal(connectionAttempted, false);
  } finally {
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
    mongoose.connect = originalConnect;
  }
});