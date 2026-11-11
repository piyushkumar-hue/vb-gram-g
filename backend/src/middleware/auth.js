const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

async function requireAuth(request, response, next) {
  const authorization = request.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ message: 'A valid bearer token is required.' });
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    /replace[-_ ]with|change[-_ ]me|your[-_ ]secret/i.test(process.env.JWT_SECRET)
  ) {
    return response.status(503).json({ message: 'Authentication is not configured.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sub || !mongoose.isValidObjectId(payload.sub)) {
      return response.status(401).json({ message: 'Invalid or expired token.' });
    }

    const user = await User.findById(payload.sub).select('name email role');
    if (!user) {
      return response.status(401).json({ message: 'Invalid or expired token.' });
    }

    request.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return response.status(401).json({ message: 'Invalid or expired token.' });
    }
    return next(error);
  }
}

function allowRoles(...roles) {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return response.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = { requireAuth, allowRoles };
