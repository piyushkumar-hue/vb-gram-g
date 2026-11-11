const { databaseNameFromUri } = require('../config/database');

function isSafeDemoDatabase(databaseName) {
  return typeof databaseName === 'string' && /(?:demo|test)/i.test(databaseName);
}

function assertDemoDatabaseAllowed(databaseName, forceDemo = false) {
  if (!isSafeDemoDatabase(databaseName) && !forceDemo) {
    throw new Error('Refusing to run demo data commands: database name must contain "demo" or "test". Use --force-demo only when you have explicitly verified the target database.');
  }
  if (!databaseName) {
    throw new Error('Unable to determine the MongoDB database name from MONGODB_URI.');
  }
}

function forceDemoRequested(args = process.argv.slice(2)) {
  return args.includes('--force-demo');
}

module.exports = {
  assertDemoDatabaseAllowed,
  databaseNameFromUri,
  forceDemoRequested,
  isSafeDemoDatabase,
};
