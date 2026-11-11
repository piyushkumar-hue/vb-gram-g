const { rateLimit } = require('express-rate-limit');

function createAuthRateLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(request, response) {
      return response.status(429).json({
        message: 'Too many authentication attempts. Wait before trying again.',
      });
    },
  });
}

const writeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip(request) {
    return ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  },
  handler(request, response) {
    return response.status(429).json({
      message: 'Too many write requests. Wait before trying again.',
    });
  },
});

module.exports = {
  loginRateLimit: createAuthRateLimiter(10),
  registrationRateLimit: createAuthRateLimiter(5),
  writeRateLimit,
};
