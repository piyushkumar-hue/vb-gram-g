
const dns = require('node:dns');
const mongoose = require('mongoose');

const DATABASE_NAME = 'vb_gram_g';

function databaseNameFromUri(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return null;

  try {
    return new mongoose.mongo.MongoClient(uri).options.dbName || null;
  } catch {
    return null;
  }
}

function assertDedicatedDatabase(uri) {
  const databaseName = databaseNameFromUri(uri);

  if (databaseName && databaseName !== DATABASE_NAME) {
    throw new Error(
      `MONGODB_URI targets "${databaseName}", but this application must use "${DATABASE_NAME}".`
    );
  }

  if (!databaseName && !/^mongodb(?:\+srv)?:\/\//i.test(uri || '')) {
    throw new Error('MONGODB_URI is not a valid MongoDB connection string.');
  }
}

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri || !mongoUri.trim()) {
    throw new Error('MONGODB_URI is not set. Add it to the backend .env file.');
  }

  assertDedicatedDatabase(mongoUri);

  if (process.env.MONGODB_DNS_SERVER) {
    dns.setServers([process.env.MONGODB_DNS_SERVER]);
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(mongoUri, {
      dbName: DATABASE_NAME,
      serverSelectionTimeoutMS:
        Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 15000,
      connectTimeoutMS:
        Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    console.log(`Connected to MongoDB database "${DATABASE_NAME}".`);

    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    throw error;
  }
}

connectDatabase.assertDedicatedDatabase = assertDedicatedDatabase;
connectDatabase.databaseNameFromUri = databaseNameFromUri;
connectDatabase.DATABASE_NAME = DATABASE_NAME;

module.exports = connectDatabase;
