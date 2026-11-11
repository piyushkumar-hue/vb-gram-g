const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { allowRoles, requireAuth } = require('../middleware/auth');
const { loginRateLimit, registrationRateLimit } = require('../middleware/authRateLimits');
const { rejectUnknownQueryParams } = require('../middleware/requestInput');

const router = express.Router();
router.use(rejectUnknownQueryParams());

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function authenticationIsConfigured(response) {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    /replace[-_ ]with|change[-_ ]me|your[-_ ]secret/i.test(process.env.JWT_SECRET)
  ) {
    response.status(503).json({ message: 'Authentication is not configured. Set a JWT_SECRET of at least 32 characters.' });
    return false;
  }
  return true;
}

function createToken(user) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: user._id.toString(),
    expiresIn: '8h',
  });
}

router.post('/register', registrationRateLimit, async (request, response, next) => {
  try {
    const unsupported = Object.keys(request.body || {}).find(
      (field) => !['name', 'email', 'password'].includes(field)
    );
    if (unsupported) return response.status(400).json({ message: 'Request contains an unsupported field.' });
    const { name, email, password } = request.body || {};
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 100 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return response.status(400).json({
        message: 'Provide a name, valid email, and password of 8 to 128 characters.',
      });
    }
    if (!authenticationIsConfigured(response)) return undefined;

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) {
      return response.status(409).json({ message: 'An account with that email already exists.' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'viewer',
    });
    return response.status(201).json({
      user: publicUser(user),
      token: createToken(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', loginRateLimit, async (request, response, next) => {
  try {
    const unsupported = Object.keys(request.body || {}).find(
      (field) => !['email', 'password'].includes(field)
    );
    if (unsupported) return response.status(400).json({ message: 'Request contains an unsupported field.' });
    const { email, password } = request.body || {};
    if (
      typeof email !== 'string' ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 1 ||
      password.length > 128
    ) {
      return response.status(400).json({
        message: 'Provide a valid email and password of 1 to 128 characters.',
      });
    }
    if (!authenticationIsConfigured(response)) return undefined;

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ message: 'Email or password is incorrect.' });
    }

    return response.json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', requireAuth, allowRoles('admin'), async (request, response, next) => {
  try {
    const users = await User.find().select('name email role createdAt').sort({ createdAt: -1 }).lean();
    return response.json({ data: users });
  } catch (error) {
    return next(error);
  }
});

router.post('/users', requireAuth, allowRoles('admin'), async (request, response, next) => {
  try {
    const unsupported = Object.keys(request.body || {}).find(
      (field) => !['name', 'email', 'password', 'role'].includes(field)
    );
    if (unsupported) return response.status(400).json({ message: 'Request contains an unsupported field.' });
    const { name, email, password, role } = request.body || {};
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 100 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128 ||
      !['admin', 'officer', 'viewer'].includes(role)
    ) {
      return response.status(400).json({
        message: 'Provide a name, valid email, password of 12 to 128 characters, and a valid role.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) {
      return response.status(409).json({ message: 'An account with that email already exists.' });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role,
    });
    return response.status(201).json({ data: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/users/:id', requireAuth, allowRoles('admin'), async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ message: 'Invalid user ID.' });
  }

  const fields = Object.keys(request.body || {});
  if (!fields.length || fields.some((field) => !['name', 'role'].includes(field))) {
    return response.status(400).json({ message: 'Only name and role can be updated.' });
  }
  if (
    request.body.name !== undefined &&
    (typeof request.body.name !== 'string' ||
      !request.body.name.trim() ||
      request.body.name.trim().length > 100 ||
      /[\u0000-\u001f\u007f]/.test(request.body.name))
  ) {
    return response.status(400).json({ message: 'name must be a non-empty string of at most 100 characters.' });
  }
  if (request.body.role !== undefined && !['admin', 'officer', 'viewer'].includes(request.body.role)) {
    return response.status(400).json({ message: 'role must be admin, officer, or viewer.' });
  }

  try {
    const user = await User.findById(request.params.id);
    if (!user) return response.status(404).json({ message: 'User not found.' });
    if (
      String(user._id) === String(request.user._id) &&
      request.body.role !== undefined &&
      request.body.role !== 'admin'
    ) {
      return response.status(400).json({ message: 'You cannot remove your own admin role.' });
    }
    if (user.role === 'admin' && request.body.role && request.body.role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return response.status(409).json({ message: 'The last administrator cannot be demoted.' });
      }
    }

    if (request.body.name !== undefined) user.name = request.body.name.trim();
    if (request.body.role !== undefined) user.role = request.body.role;
    await user.save();
    return response.json({ data: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
