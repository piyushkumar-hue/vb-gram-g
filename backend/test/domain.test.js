const assert = require('node:assert/strict');
const test = require('node:test');
const { csvCell } = require('../src/domain/csv');
const { getWorkStatusTransitionError } = require('../src/domain/workLifecycle');
const { buildWorkFilter, validateWorkQuery } = require('../src/domain/workQuery');
const { escapeRegex, workIdentity } = require('../src/domain/workIdentity');
const { applyFieldUpdate } = require('../src/services/fieldUpdateService');
const worksRoute = require('../src/routes/works');
const Work = require('../src/models/Work');
const WorkAudit = require('../src/models/WorkAudit');

test('work statuses allow only the same stage or the next lifecycle stage', () => {
  assert.equal(getWorkStatusTransitionError('Proposed', 'Proposed'), null);
  assert.equal(getWorkStatusTransitionError('Proposed', 'Approved'), null);
  assert.match(getWorkStatusTransitionError('Proposed', 'Started'), /one step at a time/);
  assert.match(getWorkStatusTransitionError('Completed', 'Started'), /no further stage/);
  assert.match(getWorkStatusTransitionError('Legacy', 'Approved'), /invalid/i);
});

test('work query validation bounds page sizes and search input', () => {
  assert.equal(validateWorkQuery({ page: '1', limit: '100' }), null);
  assert.match(validateWorkQuery({ page: '0' }), /positive integer/);
  assert.match(validateWorkQuery({ limit: '101' }), /between 1 and 100/);
  assert.match(validateWorkQuery({ q: 'x'.repeat(101) }), /at most 100/);
  assert.match(validateWorkQuery({ delayed: 'sometimes' }), /delayed must be true or false/);
  assert.match(validateWorkQuery({ unexpected: 'value' }), /unsupported query parameter/i);
});

test('work writes reject unsafe nested input and validate their audit fields', () => {
  const validWork = {
    name: 'Village pond repair',
    category: '507f1f77bcf86cd799439011',
    subCategory: 'WAT-01',
    location: { state: 'Madhya Pradesh', district: 'Jabalpur', block: 'Jabalpur', gramPanchayat: 'Barela' },
    lat: 23.1,
    lng: 79.9,
    plannedProgress: 40,
    plannedStartDate: '2026-01-01',
    plannedEndDate: '2026-12-31',
  };
  assert.equal(worksRoute.validateWorkInput(validWork), null);
  assert.match(worksRoute.validateWorkInput({ ...validWork, name: `Unsafe${String.fromCharCode(0)}name` }), /control characters/);
  assert.match(worksRoute.validateWorkInput({ ...validWork, location: { ...validWork.location, injected: 'value' } }), /location contains an unsupported field/);
  assert.match(worksRoute.validateWorkInput({ ...validWork, lat: 91 }), /lat must be between/);
  assert.match(worksRoute.validateWorkInput({}, true), /at least one supported field/);
  assert.equal(Work.schema.path('createdBy').options.immutable, true);
  assert.equal(Work.schema.path('updatedBy').options.ref, 'User');
  assert.equal(WorkAudit.schema.path('action').enumValues.includes('deleted'), true);
});

test('work filters escape search text and apply the delay rule', () => {
  const filter = buildWorkFilter({ q: '.*', district: 'Sample district', delayed: 'true' });
  assert.equal(filter['location.district'], 'Sample district');
  assert.equal(filter.$or[0].name.test('anything'), false);
  assert.equal(filter.$or[0].name.test('.*'), true);
  assert.deepEqual(filter.$expr, { $lt: ['$actualProgress', '$plannedProgress'] });
  assert.deepEqual(buildWorkFilter({}).isDemo, { $ne: true });
  assert.equal(Object.hasOwn(buildWorkFilter({ includeDemo: 'true' }), 'isDemo'), false);
});

test('work identity comparison normalizes casing and safely escapes regex values', () => {
  const first = {
    name: 'Pond Repair',
    category: 'category-1',
    subCategory: 'WAT-01',
    location: { state: 'MP', district: 'Jabalpur', block: 'Block A', gramPanchayat: 'Village 1' },
  };
  const second = {
    name: ' pond repair ',
    category: 'category-1',
    subCategory: 'wat-01',
    location: { state: 'mp', district: 'JABALPUR', block: 'block a', gramPanchayat: 'VILLAGE 1' },
  };
  assert.equal(workIdentity(first), workIdentity(second));
  assert.equal(new RegExp(`^${escapeRegex('Pond.*')}$`).test('Pond.*'), true);
  assert.equal(new RegExp(`^${escapeRegex('Pond.*')}$`).test('PondVillage'), false);
});

test('CSV cells escape formulas and preserve trusted negative numbers', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('\t@SUM(A1:A2)'), '"\'\t@SUM(A1:A2)"');
  assert.equal(csvCell('Village, "North"'), '"Village, ""North"""');
  assert.equal(csvCell(-12.5), '"-12.5"');
});

function makeFallbackModels({ workUpdate, historyDelete, existingUpdate } = {}) {
  const work = { _id: 'work-1', status: 'Proposed', __v: 0, actualProgress: 0 };
  let historyCreated = 0;
  class FieldUpdateModel {
    constructor(input) {
      Object.assign(this, input);
      this._id = 'update-1';
    }

    async save() {
      historyCreated += 1;
    }

    static findOne() {
      return Promise.resolve(existingUpdate || null);
    }

    static async deleteOne() {
      if (historyDelete) await historyDelete();
      historyCreated -= 1;
    }
  }

  const WorkModel = {
    async findById() {
      return work;
    },
    async findOneAndUpdate(filter, update) {
      assert.deepEqual(filter, { _id: 'work-1', status: 'Proposed', __v: 0 });
      if (workUpdate) return workUpdate();
      return { ...work, ...update.$set, __v: 1 };
    },
  };

  const mongooseInstance = {
    async startSession() {
      return {
        async withTransaction() {
          const error = new Error('Transactions are only allowed on replica sets.');
          error.code = 20;
          throw error;
        },
        async endSession() {},
      };
    },
  };

  return {
    FieldUpdateModel,
    WorkModel,
    mongooseInstance,
    get historyCreated() {
      return historyCreated;
    },
  };
}

const updateInput = {
  workId: 'work-1',
  lat: 21,
  lng: 78,
  status: 'Approved',
  progress: 10,
  evidenceUrl: null,
  deviceId: null,
  idempotencyKey: null,
};

test('field update fallback records history and applies the work update', async () => {
  const models = makeFallbackModels();
  const result = await applyFieldUpdate(updateInput, models);
  assert.equal(result.duplicate, false);
  assert.equal(result.work.status, 'Approved');
  assert.equal(result.work.actualProgress, 10);
  assert.equal(models.historyCreated, 1);
});

test('field update fallback removes history if the conditional work update fails', async () => {
  const models = makeFallbackModels({ workUpdate: async () => null });
  await assert.rejects(applyFieldUpdate(updateInput, models), { status: 409 });
  assert.equal(models.historyCreated, 0);
});

test('field update idempotency returns an identical prior update and rejects key reuse with different data', async () => {
  const priorUpdate = { ...updateInput, _id: 'update-1', idempotencyKey: 'retry-1' };
  const models = makeFallbackModels({ existingUpdate: priorUpdate });
  const duplicate = await applyFieldUpdate({ ...updateInput, idempotencyKey: 'retry-1' }, models);
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    applyFieldUpdate({ ...updateInput, progress: 15, idempotencyKey: 'retry-1' }, models),
    { status: 409 }
  );
});
