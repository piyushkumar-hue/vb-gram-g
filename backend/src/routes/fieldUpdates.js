const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const FieldUpdate = require('../models/FieldUpdate');
const Work = require('../models/Work');
const { requireAuth } = require('../middleware/auth');
const { applyFieldUpdate } = require('../services/fieldUpdateService');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../domain/workQuery');
const { rejectUnknownQueryParams } = require('../middleware/requestInput');

const router = express.Router();

function validDeviceKey(request) {
  const expected = process.env.FIELD_DEVICE_API_KEY;
  const provided = request.get('x-api-key');
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

router.post('/', rejectUnknownQueryParams(), async (request, response, next) => {
  if (
    !process.env.FIELD_DEVICE_API_KEY ||
    /replace[-_ ]with|change[-_ ]me|your[-_ ]secret/i.test(process.env.FIELD_DEVICE_API_KEY)
  ) {
    return response.status(503).json({ message: 'Field update authentication is not configured.' });
  }
  if (!validDeviceKey(request)) {
    return response.status(401).json({ message: 'A valid x-api-key is required.' });
  }

  const { workId, lat, lng, status, progress, evidenceUrl, deviceId } = request.body || {};
  const allowedFields = ['workId', 'lat', 'lng', 'status', 'progress', 'evidenceUrl', 'deviceId'];
  const unknownField = Object.keys(request.body || {}).find((field) => !allowedFields.includes(field));
  if (unknownField) {
    return response.status(400).json({ message: 'Request contains an unsupported field.' });
  }
  if (!mongoose.isValidObjectId(workId)) {
    return response.status(400).json({ message: 'workId must be a valid work ID.' });
  }
  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== 'number' ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    typeof progress !== 'number' ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100 ||
    !Work.WORK_STATUSES.includes(status)
  ) {
    return response.status(400).json({ message: 'Provide valid lat, lng, status, and progress values.' });
  }
  if (evidenceUrl !== undefined && evidenceUrl !== null) {
    if (typeof evidenceUrl !== 'string' || evidenceUrl.length > 2048) {
      return response.status(400).json({ message: 'evidenceUrl must be a string of at most 2,048 characters.' });
    }
    try {
      const url = new URL(evidenceUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch {
      return response.status(400).json({ message: 'evidenceUrl must be a valid HTTP or HTTPS URL.' });
    }
  }
  if (deviceId !== undefined && (
    typeof deviceId !== 'string' ||
    !deviceId.trim() ||
    deviceId.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(deviceId)
  )) {
    return response.status(400).json({ message: 'deviceId must be a non-empty string of at most 100 characters.' });
  }
  const idempotencyKey = request.get('Idempotency-Key') || undefined;
  if (idempotencyKey && (!/^[\w.:=-]{1,128}$/.test(idempotencyKey))) {
    return response.status(400).json({ message: 'Idempotency-Key must contain 1 to 128 safe characters.' });
  }

  try {
    const result = await applyFieldUpdate({
      workId,
      lat,
      lng,
      status,
      progress,
      evidenceUrl: evidenceUrl || null,
      deviceId: deviceId?.trim() || null,
      idempotencyKey: idempotencyKey || null,
    });
    return response.status(result.duplicate ? 200 : 201).json({
      data: result.fieldUpdate,
      work: result.work,
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ message: error.message });
    return next(error);
  }
});

router.get('/', requireAuth, async (request, response, next) => {
  const unsupportedQuery = Object.keys(request.query).find(
    (field) => !['workId', 'page', 'limit'].includes(field)
  );
  if (unsupportedQuery) return response.status(400).json({ message: 'Request contains an unsupported query parameter.' });
  const { workId } = request.query;
  if (workId && !mongoose.isValidObjectId(workId)) {
    return response.status(400).json({ message: 'workId must be a valid work ID.' });
  }
  const page = Number(request.query.page || 1);
  const limit = Number(request.query.limit || DEFAULT_PAGE_SIZE);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    return response.status(400).json({ message: `page must be positive and limit must be between 1 and ${MAX_PAGE_SIZE}.` });
  }
  try {
    const filter = workId ? { workId } : {};
    const [data, total] = await Promise.all([
      FieldUpdate.find(filter)
        .sort({ receivedAt: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FieldUpdate.countDocuments(filter),
    ]);
    return response.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
