const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { rejectUnknownQueryParams } = require('./middleware/requestInput');
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const dashboardRoutes = require('./routes/dashboard');
const fieldUpdateRoutes = require('./routes/fieldUpdates');
const reportingCoverageRoutes = require('./routes/reportingCoverage');
const workRoutes = require('./routes/works');
const { writeRateLimit } = require('./middleware/authRateLimits');

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', writeRateLimit);

app.get('/', rejectUnknownQueryParams(), (request, response) => {
  response.json({
    message: 'VB-G RAM G API',
    health: '/api/health',
  });
});

app.get('/api/health', rejectUnknownQueryParams(), (request, response) => {
  const databaseStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const database = databaseStates[mongoose.connection.readyState] || 'unknown';

  response.status(database === 'connected' ? 200 : 503).json({
    status: database === 'connected' ? 'ok' : 'unavailable',
    database,
  });
});

// Keep health checks reachable while MongoDB is unavailable. Database-backed
// API calls fail fast with 503 instead of hanging in Mongoose's command buffer.
app.use('/api', (request, response, next) => {
  if (mongoose.connection.readyState !== 1) {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return response.status(503).json({
      message: 'Database is temporarily unavailable. Please retry shortly.',
      database: states[mongoose.connection.readyState] || 'unknown',
    });
  }
  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/works', workRoutes);
app.use('/api/field-updates', fieldUpdateRoutes);
app.use('/api/reporting-coverage', reportingCoverageRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((request, response) => {
  response.status(404).json({ message: 'Route not found.' });
});

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);

  if (error instanceof require('multer').MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return response.status(status).json({
      message: status === 413 ? 'CSV file must be 2 MB or smaller.' : 'Invalid file upload.',
    });
  }
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ message: 'Request body contains invalid JSON.' });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(400).json({ message: error.message });
  }
  if (error.name === 'VersionError') {
    return response.status(409).json({ message: 'This record changed during your request. Reload it and try again.' });
  }
  if (error.code === 11000) {
    return response.status(409).json({ message: 'A record with that unique value already exists.' });
  }

  console.error(`Request failed: ${error.message}`);
  return response.status(500).json({ message: 'An unexpected server error occurred.' });
});

module.exports = app;