const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { canApplyZeroCoverage, periodDateRange, validateZeroCoverageInput } = require('../src/domain/reportingCoverage');
const ReportingCoverage = require('../src/models/ReportingCoverage');
const User = require('../src/models/User');
const Work = require('../src/models/Work');
const { buildGeography } = require('../src/routes/dashboard');

const validReport = {
  state: 'Madhya Pradesh',
  district: 'Jabalpur',
  periodFrom: '2026-01-01',
  periodTo: '2026-01-31',
};

test('zero-work reports require a district and an exact valid reporting period', () => {
  assert.equal(validateZeroCoverageInput(validReport), null);
  assert.match(validateZeroCoverageInput({ ...validReport, periodFrom: '2026-02-30' }), /valid YYYY-MM-DD/);
  assert.match(validateZeroCoverageInput({ ...validReport, periodFrom: '2026-02-01' }), /on or before/);
  assert.match(validateZeroCoverageInput({ ...validReport, reportedWorkCount: 10 }), /unsupported field/i);
  assert.match(validateZeroCoverageInput({ ...validReport, district: ' '.repeat(1) }), /district must be/);

  const range = periodDateRange(validReport.periodFrom, validReport.periodTo);
  assert.equal(range.periodFrom.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(range.periodTo.toISOString(), '2026-01-31T23:59:59.999Z');
});

test('zero reports apply only to exact-period views without narrowing filters', () => {
  assert.equal(canApplyZeroCoverage({ periodFrom: '2026-01-01', periodTo: '2026-01-31' }), true);
  assert.equal(canApplyZeroCoverage({ periodFrom: '2026-01-01' }), false);
  for (const filter of [
    { category: 'category-id' },
    { status: 'Started' },
    { delayed: 'true' },
    { delayed: 'false' },
    { q: 'bridge' },
    { block: 'Block 1' },
    { gramPanchayat: 'GP 1' },
  ]) {
    assert.equal(
      canApplyZeroCoverage({ periodFrom: '2026-01-01', periodTo: '2026-01-31', ...filter }),
      false
    );
  }
});

test('coverage-only districts are retained without implying state-wide zero reporting', () => {
  const [district] = buildGeography([], [{
    state: 'Madhya Pradesh',
    district: 'Jabalpur',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    submittedBy: { name: 'Officer Example' },
  }]);
  assert.equal(district.count, 0);
  assert.equal(district.reported, true);
  assert.equal(district.reportedBy, 'Officer Example');
  assert.deepEqual(district.blocks, []);

  const withWork = buildGeography([{
    _id: { state: 'Madhya Pradesh', district: 'Jabalpur', block: null, gramPanchayat: null },
    count: 1,
    progressTotal: 50,
    progressCount: 1,
    completed: 0,
    approved: 0,
    started: 1,
    delayed: 0,
    expenditure: 100,
  }], [{
    state: 'Madhya Pradesh',
    district: 'Jabalpur',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  }]);
  assert.equal(withWork[0].count, 1);
  assert.equal(withWork[0].reported, true);
});

test('zero-work report API rejects existing work and records authorized submissions only', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  const secret = 'test-secret-that-is-at-least-32-characters-long';
  process.env.JWT_SECRET = secret;
  const userId = '64b000000000000000000001';
  let existingWorkCount = 0;
  let createdReport = null;
  let userRole = 'officer';
  t.mock.method(User, 'findById', () => ({
    select: async () => ({ _id: userId, role: userRole }),
  }));
  t.mock.method(Work, 'countDocuments', (filter) => ({
    collation: async (collation) => {
      assert.deepEqual(filter['location.state'], validReport.state);
      assert.deepEqual(filter['location.district'], validReport.district);
      assert.deepEqual(filter.plannedStartDate.$gte.toISOString(), '2026-01-01T00:00:00.000Z');
      assert.deepEqual(filter.plannedStartDate.$lte.toISOString(), '2026-01-31T23:59:59.999Z');
      assert.deepEqual(collation, { locale: 'en', strength: 1 });
      return existingWorkCount;
    },
  }));
  t.mock.method(ReportingCoverage, 'create', async (document) => {
    createdReport = document;
    return { ...document, createdAt: new Date('2026-02-01T00:00:00.000Z') };
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const token = jwt.sign({ sub: userId }, secret);
    const submit = (authorizationToken = token) => fetch(`http://127.0.0.1:${address.port}/api/reporting-coverage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authorizationToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(validReport),
    });

    const saved = await submit();
    assert.equal(saved.status, 201);
    assert.equal((await saved.json()).data.reportedWorkCount, 0);
    assert.equal(createdReport.submittedBy, userId);
    assert.equal(createdReport.reportedWorkCount, 0);

    userRole = 'viewer';
    const viewerToken = jwt.sign({ sub: userId }, secret);
    const forbidden = await submit(viewerToken);
    assert.equal(forbidden.status, 403);

    userRole = 'officer';
    existingWorkCount = 1;
    const conflict = await submit();
    assert.equal(conflict.status, 409);
    assert.match((await conflict.json()).message, /work records exist/);
  } finally {
    server.close();
    await once(server, 'close');
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('coverage report uniqueness and immutable audit fields are enforced in the schema', () => {
  const indexes = ReportingCoverage.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    options.unique &&
    fields.state === 1 &&
    fields.district === 1 &&
    fields.periodFrom === 1 &&
    fields.periodTo === 1
  ));
  for (const field of ['state', 'district', 'periodFrom', 'periodTo', 'reportedWorkCount', 'submittedBy']) {
    assert.equal(ReportingCoverage.schema.path(field).options.immutable, true);
  }
});
