require('dotenv').config();

const app = require('./app');
const connectDatabase = require('./config/database');
const mongoose = require('mongoose');

const port = process.env.PORT ? Number(process.env.PORT) : 53184;
const retryDelayMs = Math.max(1000, Number(process.env.MONGODB_RETRY_DELAY_MS) || 5000);
let shuttingDown = false;

async function connectWithRetry() {
  let attempt = 0;
  while (!shuttingDown && mongoose.connection.readyState !== 1) {
    attempt += 1;
    try {
      await connectDatabase();
      return;
    
} catch (error) {
  console.error(`MongoDB ERROR (attempt ${attempt}):`, error.message);

  console.error(`Retrying in ${retryDelayMs} ms.`);

  await new Promise((resolve) =>
    setTimeout(resolve, retryDelayMs)
  );
}

  }
}

async function shutdown(signal, server) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    try { await mongoose.disconnect(); }
    catch (error) { console.error(`MongoDB disconnect failed: ${error.message}`); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

async function startServer() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  // Bind HTTP before connecting so platform health checks can reach the API.
  const server = app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port}.`));
  server.on('error', (error) => {
    console.error(`API server error: ${error.code || error.message}`);
    process.exitCode = 1;
    shuttingDown = true;
  });
  process.on('SIGTERM', () => shutdown('SIGTERM', server));
  process.on('SIGINT', () => shutdown('SIGINT', server));
  connectWithRetry().catch((error) => console.error(`MongoDB reconnect loop stopped: ${error.message}`));
}

startServer().catch((error) => {
  console.error(`API startup failed: ${error.message}`);
  process.exitCode = 1;
});
