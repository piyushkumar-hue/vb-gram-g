require('dotenv').config();

const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const Category = require('../models/Category');
const FieldUpdate = require('../models/FieldUpdate');
const User = require('../models/User');
const Work = require('../models/Work');
const {
  assertDemoDatabaseAllowed,
  databaseNameFromUri,
  forceDemoRequested,
} = require('./demoSafety');

const categories = [
  {
    name: 'Water Security',
    subcategories: [
      { code: 'WAT-01', name: 'Water conservation and harvesting' },
      { code: 'WAT-02', name: 'Traditional water bodies' },
    ],
  },
  {
    name: 'Core Rural Infrastructure',
    subcategories: [
      { code: 'INF-01', name: 'Rural connectivity' },
      { code: 'INF-02', name: 'Sanitation and drainage' },
    ],
  },
  {
    name: 'Rural Livelihood',
    subcategories: [
      { code: 'LIV-01', name: 'Agriculture and allied activities' },
      { code: 'LIV-02', name: 'Skill and livelihood facilities' },
    ],
  },
  {
    name: 'Disaster & Climate Resilience',
    subcategories: [
      { code: 'RES-01', name: 'Flood and erosion control' },
      { code: 'RES-02', name: 'Climate-resilient community assets' },
    ],
  },
];

const demoAccounts = [
  { name: 'Demo Administrator', email: 'admin.demo@vbgramg.invalid', role: 'admin' },
  { name: 'Demo Officer', email: 'officer.demo@vbgramg.invalid', role: 'officer' },
  { name: 'Demo Viewer', email: 'viewer.demo@vbgramg.invalid', role: 'viewer' },
];

const workTemplates = {
  'Water Security': [
    ['Farm pond restoration', 'WAT-01'],
    ['School rainwater harvesting', 'WAT-01'],
    ['Recharge pit construction', 'WAT-01'],
    ['Contour trench and bund work', 'WAT-01'],
    ['Village pond desilting', 'WAT-02'],
    ['Community tank restoration', 'WAT-02'],
  ],
  'Core Rural Infrastructure': [
    ['Village approach road improvement', 'INF-01'],
    ['Road drainage crossing', 'INF-01'],
    ['Culvert repair near market', 'INF-01'],
    ['Community soak pit construction', 'INF-02'],
    ['Greywater drainage improvement', 'INF-02'],
    ['Public sanitation facility repair', 'INF-02'],
  ],
  'Rural Livelihood': [
    ['Community horticulture plot', 'LIV-01'],
    ['Small livestock shelter construction', 'LIV-01'],
    ['Farmer-group irrigation channel', 'LIV-01'],
    ['Seed storage facility repair', 'LIV-01'],
    ['Self-help group work shed', 'LIV-02'],
    ['Rural skills training room', 'LIV-02'],
  ],
  'Disaster & Climate Resilience': [
    ['Riverbank erosion protection', 'RES-01'],
    ['Stormwater channel reinforcement', 'RES-01'],
    ['Flood shelter access improvement', 'RES-01'],
    ['Slope drainage stabilization', 'RES-01'],
    ['Climate-resilient community plantation', 'RES-02'],
    ['Community climate shelter repair', 'RES-02'],
  ],
};

function districtSamplePoint(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    throw new Error('District boundary file contains an unsupported geometry.');
  }
  const ring = geometry.type === 'Polygon'
    ? geometry.coordinates?.[0]
    : geometry.coordinates?.[0]?.[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error('District boundary file contains a malformed polygon ring.');
  }
  const points = ring.slice(0, -1);
  const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Could not derive a sample coordinate from district boundary data.');
  }
  return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
}

function createDemoWorkDocuments({ districts, categoryIds, users, now = new Date(), count = 180 }) {
  if (!Array.isArray(districts) || districts.length === 0) {
    throw new Error('No district boundary features are available to place demo records.');
  }
  const statuses = Work.WORK_STATUSES;
  const categoryEntries = categories.map((category) => ({
    ...category,
    _id: categoryIds.get(category.name),
  }));
  const records = [];
  const updates = [];

  for (let index = 0; index < count; index += 1) {
    const feature = districts[index % districts.length];
    const properties = feature.properties || {};
    const state = properties.stateName;
    const district = properties.name;
    if (typeof state !== 'string' || !state.trim() || typeof district !== 'string' || !district.trim()) {
      throw new Error('District boundary feature is missing its state or district name.');
    }

    const category = categoryEntries[index % categoryEntries.length];
    const categoryTemplates = workTemplates[category.name];
    const [workName, subcategoryCode] = categoryTemplates[Math.floor(index / categoryEntries.length) % categoryTemplates.length];
    const subcategory = category.subcategories.find((entry) => entry.code === subcategoryCode);
    const status = statuses[index % statuses.length];
    const plannedProgress = status === 'Completed' ? 100 : status === 'Proposed' ? 0 : 25 + ((index * 7) % 65);
    const isDelayed = status !== 'Completed' && status !== 'Proposed' && index % 5 === 0;
    const actualProgress = isDelayed ? Math.max(0, plannedProgress - 10) : plannedProgress;
    const point = districtSamplePoint(feature);
    const actor = users[index % 2];
    const workId = new mongoose.Types.ObjectId();
    const work = {
      _id: workId,
      name: `DEMO - ${workName} ${String(index + 1).padStart(3, '0')}`,
      description: `Synthetic demonstration record for ${district}, ${state}; not a real scheme report.`,
      category: category._id,
      subCategory: subcategory.code,
      location: {
        state,
        district,
        block: `Demo Block ${1 + (index % 4)}`,
        gramPanchayat: `Demo GP ${1 + (index % 6)}`,
      },
      lat: point.lat,
      lng: point.lng,
      plannedProgress,
      actualProgress,
      status,
      expenditure: status === 'Proposed' ? 0 : (index + 1) * 12500,
      plannedStartDate: new Date(Date.UTC(now.getUTCFullYear(), Math.floor(index % 12), 1)),
      plannedEndDate: new Date(Date.UTC(now.getUTCFullYear(), 11, 31)),
      actualStartDate: ['Started', 'Completed'].includes(status) ? new Date(Date.UTC(now.getUTCFullYear(), 1, 1)) : null,
      actualEndDate: status === 'Completed' ? new Date(Date.UTC(now.getUTCFullYear(), 5, 1)) : null,
      source: index % 3 === 0 ? 'iot' : 'manual',
      createdBy: actor._id,
      updatedBy: actor._id,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };
    records.push(work);

    if (index % 3 === 0) {
      updates.push({
        workId,
        lat: point.lat,
        lng: point.lng,
        status,
        progress: actualProgress,
        source: 'iot',
        deviceId: `demo-device-${1 + (index % 8)}`,
        receivedAt: new Date(now.getTime() - index * 60_000),
      });
    }
  }

  return { records, updates };
}

async function loadDistrictFeatures() {
  const filePath = path.resolve(__dirname, '../../../frontend/public/data/geo/districts.geojson');
  const collection = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('District boundary GeoJSON is not a FeatureCollection.');
  }
  return collection.features;
}

async function seedDemoDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  assertDemoDatabaseAllowed(databaseNameFromUri(mongoUri), forceDemoRequested());
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Set DEMO_ACCOUNT_PASSWORD to a password between 12 and 128 characters before seeding.');
  }
  const districts = await loadDistrictFeatures();
  if (districts.length < 150) throw new Error('At least 150 district features are required for demo seeding.');

  await connectDatabase();
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected.');
  }

  if (await Work.exists({ isDemo: true })) {
    throw new Error('Demo works already exist. Run npm run clear-demo before seeding again.');
  }
  const conflictingUser = await User.findOne({ email: { $in: demoAccounts.map((account) => account.email) } }).select('email');
  if (conflictingUser) {
    throw new Error('A demo account email already exists. No existing account was changed; resolve the collision before seeding.');
  }

  const categoryIds = new Map();
  const missingCategories = [];
  for (const category of categories) {
    const existing = await Category.findOne({ name: category.name }).select('subcategories');
    if (existing) {
      const availableCodes = new Set(existing.subcategories.map((entry) => entry.code));
      if (category.subcategories.some((entry) => !availableCodes.has(entry.code))) {
        throw new Error(`Existing category "${category.name}" lacks required demo sub-categories; no category was modified.`);
      }
      categoryIds.set(category.name, existing._id);
    } else {
      missingCategories.push(category);
    }
  }

  if (missingCategories.length) {
    const insertedCategories = await Category.insertMany(missingCategories, { ordered: true });
    for (const category of insertedCategories) categoryIds.set(category.name, category._id);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const users = await User.insertMany(
    demoAccounts.map((account) => ({ ...account, passwordHash, isDemo: true })),
    { ordered: true }
  );
  const { records, updates } = createDemoWorkDocuments({ districts, categoryIds, users });
  const insertedWorks = await Work.insertMany(records, { ordered: true });
  await FieldUpdate.insertMany(updates, { ordered: true });

  console.log(`Demo seed inserted ${insertedWorks.length} demo works and ${updates.length} field updates in database "${mongoose.connection.name}".`);
  console.log('Demo login emails: admin.demo@vbgramg.invalid, officer.demo@vbgramg.invalid, viewer.demo@vbgramg.invalid');
  console.log('All demo accounts use DEMO_ACCOUNT_PASSWORD. The password value is not printed.');
}

if (require.main === module) {
  seedDemoDatabase()
    .catch((error) => {
      console.error(`Demo seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { createDemoWorkDocuments, districtSamplePoint, seedDemoDatabase };
