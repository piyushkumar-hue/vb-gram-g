const mongoose = require('mongoose');
const FieldUpdate = require('../models/FieldUpdate');
const Work = require('../models/Work');
const { getWorkStatusTransitionError } = require('../domain/workLifecycle');

function transactionUnsupported(error) {
  return (
    error.code === 20 ||
    /transactions are only allowed|does not support transactions|transaction numbers are only allowed/i.test(
      error.message || ''
    )
  );
}

function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertSameRequest(existing, input) {
  const sameFields = ['workId', 'lat', 'lng', 'status', 'progress', 'deviceId'];
  const matches = sameFields.every((field) => String(existing[field] ?? '') === String(input[field] ?? ''));
  const sameEvidence = (existing.evidenceUrl || null) === (input.evidenceUrl || null);
  if (!matches || !sameEvidence) {
    throw makeHttpError(409, 'Idempotency-Key has already been used with different field-update data.');
  }
}

async function getExistingUpdate(idempotencyKey, models, session) {
  if (!idempotencyKey) return null;
  let query = models.FieldUpdateModel.findOne({ idempotencyKey });
  if (session) query = query.session(session);
  return query;
}

async function validateAndUpdateWork(input, models, session) {
  let query = models.WorkModel.findById(input.workId);
  if (session) query = query.session(session);
  const work = await query;
  if (!work) throw makeHttpError(404, 'Work record not found.');

  const transitionError = getWorkStatusTransitionError(work.status, input.status);
  if (transitionError) throw makeHttpError(409, transitionError);

  work.lat = input.lat;
  work.lng = input.lng;
  work.status = input.status;
  work.actualProgress = input.progress;
  work.source = 'iot';
  work.updatedBy = null;
  await work.save(session ? { session } : undefined);
  return work;
}

async function runTransaction(input, models) {
  const session = await models.mongooseInstance.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const existing = await getExistingUpdate(input.idempotencyKey, models, session);
      if (existing) {
        assertSameRequest(existing, input);
        let existingWorkQuery = models.WorkModel.findById(existing.workId);
        existingWorkQuery = existingWorkQuery.session(session);
        const existingWork = await existingWorkQuery;
        if (!existingWork) throw makeHttpError(409, 'The work for this field-update history record no longer exists.');
        result = { fieldUpdate: existing, work: existingWork, duplicate: true };
        return;
      }

      const work = await validateAndUpdateWork(input, models, session);
      const fieldUpdate = new models.FieldUpdateModel(input);
      await fieldUpdate.save({ session });
      result = { fieldUpdate, work, duplicate: false };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function runCompensatingWrite(input, models) {
  const existing = await getExistingUpdate(input.idempotencyKey, models);
  if (existing) {
    assertSameRequest(existing, input);
    const work = await models.WorkModel.findById(existing.workId);
    if (!work) throw makeHttpError(409, 'The work for this field-update history record no longer exists.');
    return { fieldUpdate: existing, work, duplicate: true };
  }

  const work = await models.WorkModel.findById(input.workId);
  if (!work) throw makeHttpError(404, 'Work record not found.');
  const transitionError = getWorkStatusTransitionError(work.status, input.status);
  if (transitionError) throw makeHttpError(409, transitionError);

  const previous = {
    lat: work.lat,
    lng: work.lng,
    status: work.status,
    actualProgress: work.actualProgress,
    source: work.source,
  };
  const fieldUpdate = new models.FieldUpdateModel(input);
  await fieldUpdate.save();

  try {
    const updatedWork = await models.WorkModel.findOneAndUpdate(
      {
        _id: work._id,
        status: work.status,
        __v: work.__v === undefined ? { $exists: false } : work.__v,
      },
      {
        $set: {
          lat: input.lat,
          lng: input.lng,
          status: input.status,
          actualProgress: input.progress,
          source: 'iot',
          updatedBy: null,
        },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true }
    );
    if (!updatedWork) {
      throw makeHttpError(409, 'The work changed during this update. Reload it and submit the field update again.');
    }
    return { fieldUpdate, work: updatedWork, duplicate: false };
  } catch (writeError) {
    try {
      await models.FieldUpdateModel.deleteOne({ _id: fieldUpdate._id });
    } catch (rollbackError) {
      console.error(`Field update rollback failed: ${rollbackError.message}`);
      const consistencyError = new Error(
        'Field update could not be fully applied. An administrator must reconcile the work and its update history.'
      );
      consistencyError.cause = writeError;
      consistencyError.rollbackError = rollbackError;
      throw consistencyError;
    }

    Object.assign(work, previous);
    throw writeError;
  }
}

async function applyFieldUpdate(input, overrides = {}) {
  const models = {
    mongooseInstance: overrides.mongooseInstance || mongoose,
    WorkModel: overrides.WorkModel || Work,
    FieldUpdateModel: overrides.FieldUpdateModel || FieldUpdate,
  };

  if (!input.idempotencyKey) return runWithTransactionFallback(input, models);
  const priorUpdate = await getExistingUpdate(input.idempotencyKey, models);
  if (priorUpdate) {
    assertSameRequest(priorUpdate, input);
    const priorWork = await models.WorkModel.findById(priorUpdate.workId);
    if (!priorWork) throw makeHttpError(409, 'The work for this field-update history record no longer exists.');
    return { fieldUpdate: priorUpdate, work: priorWork, duplicate: true };
  }
  try {
    return await runWithTransactionFallback(input, models);
  } catch (error) {
    if (error.code !== 11000 || !input.idempotencyKey) throw error;
    const duplicate = await getExistingUpdate(input.idempotencyKey, models);
    if (!duplicate) throw error;
    assertSameRequest(duplicate, input);
    const work = await models.WorkModel.findById(duplicate.workId);
    if (!work) throw makeHttpError(409, 'The work for this field-update history record no longer exists.');
    return { fieldUpdate: duplicate, work, duplicate: true };
  }
}

async function runWithTransactionFallback(input, models) {
  try {
    return await runTransaction(input, models);
  } catch (error) {
    if (!transactionUnsupported(error)) throw error;
    return runCompensatingWrite(input, models);
  }
}

module.exports = { applyFieldUpdate, transactionUnsupported };
