const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Work = require('../src/models/Work');
const User = require('../src/models/User');
const { createDemoWorkDocuments } = require('../src/seed/seedDemoData');
const { demoClearQueries } = require('../src/seed/clearDemoData');
const {
  assertDemoDatabaseAllowed,
  databaseNameFromUri,
  forceDemoRequested,
  isSafeDemoDatabase,
} = require('../src/seed/demoSafety');

test('demo commands allow demo/test database names and refuse ordinary production names', () => {
  assert.equal(databaseNameFromUri('mongodb://localhost/vb_gram_g_test'), 'vb_gram_g_test');
  assert.equal(isSafeDemoDatabase('vb-gram-g-demo'), true);
  assert.equal(isSafeDemoDatabase('vb_gram_g'), false);
  assert.doesNotThrow(() => assertDemoDatabaseAllowed('vb_gram_g_test'));
  assert.doesNotThrow(() => assertDemoDatabaseAllowed('vb_gram_g', true));
  assert.throws(() => assertDemoDatabaseAllowed('vb_gram_g'), /Refusing to run demo data commands/);
  assert.throws(() => assertDemoDatabaseAllowed(null, true), /Unable to determine/);
  assert.equal(forceDemoRequested(['--force-demo']), true);
  assert.equal(forceDemoRequested([]), false);
});

test('demo generator creates more than 150 tagged works across categories, statuses and demo locations', () => {
  const categories = [
    'Water Security',
    'Core Rural Infrastructure',
    'Rural Livelihood',
    'Disaster & Climate Resilience',
  ];
  const categoryIds = new Map(categories.map((name) => [name, new mongoose.Types.ObjectId()]));
  const users = [
    { _id: new mongoose.Types.ObjectId() },
    { _id: new mongoose.Types.ObjectId() },
  ];
  const districts = Array.from({ length: 180 }, (_, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[70 + index / 100, 10], [70.1 + index / 100, 10], [70.1 + index / 100, 10.1], [70 + index / 100, 10.1], [70 + index / 100, 10]]],
    },
    properties: { stateName: `State ${index % 12}`, name: `District ${index}` },
  }));

  const { records, updates } = createDemoWorkDocuments({
    districts,
    categoryIds,
    users,
    now: new Date('2026-10-01T00:00:00.000Z'),
  });

  assert.equal(records.length, 180);
  assert.ok(records.every((record) => record.isDemo === true));
  assert.ok(records.every((record) => record.name.startsWith('DEMO - ')));
  assert.deepEqual(new Set(records.map((record) => record.status)), new Set(Work.WORK_STATUSES));
  assert.deepEqual(new Set(records.map((record) => record.category.toString())).size, 4);
  assert.ok(records.some((record) => record.actualProgress < record.plannedProgress));
  assert.ok(records.some((record) => record.actualProgress === record.plannedProgress));
  assert.ok(new Set(records.map((record) => record.location.state)).size > 1);
  assert.ok(new Set(records.map((record) => record.location.district)).size > 1);
  assert.ok(updates.length > 0);
  assert.ok(records.every((record) => mongoose.isValidObjectId(record.createdBy)));
});

test('demo markers default false for user-created records and are immutable on work/user schemas', () => {
  assert.equal(Work.schema.path('isDemo').defaultValue, false);
  assert.equal(Work.schema.path('isDemo').options.immutable, true);
  assert.equal(User.schema.path('isDemo').defaultValue, false);
  assert.equal(User.schema.path('isDemo').options.immutable, true);
});

test('clear-demo filters are restricted to tagged demo works/users and their linked histories', () => {
  const workIds = [new mongoose.Types.ObjectId()];
  assert.deepEqual(demoClearQueries(workIds), {
    works: { isDemo: true },
    users: { isDemo: true },
    fieldUpdates: { workId: { $in: workIds } },
    audits: { workId: { $in: workIds } },
  });
});
