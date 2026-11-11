require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const User = require('../models/User');

async function createAdmin() {
  const { ADMIN_NAME: name, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;

  if (!name?.trim() || !email?.trim() || !password) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in backend/.env first.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error('ADMIN_PASSWORD must be between 12 and 128 characters.');
  }

  await connectDatabase();
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected. Set MONGODB_URI in backend/.env first.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) {
    throw new Error('An account with ADMIN_EMAIL already exists; no account was changed.');
  }

  const admin = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
  });
  console.log(`Administrator account created for ${admin.email}.`);
}

createAdmin()
  .catch((error) => {
    console.error(`Admin creation failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
