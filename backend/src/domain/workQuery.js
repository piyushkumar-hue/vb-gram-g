const mongoose = require('mongoose');
const Work = require('../models/Work');

const LOCATION_FIELDS = ['state', 'district', 'block', 'gramPanchayat'];
const MAX_SEARCH_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const PERIOD_FIELDS = ['periodFrom', 'periodTo'];

function isDateOnly(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateWorkQuery(query, { pagination = true } = {}) {
  const allowedFields = [
    ...LOCATION_FIELDS,
    ...PERIOD_FIELDS,
    'q',
    'status',
    'category',
    'delayed',
    'includeDemo',
    ...(pagination ? ['page', 'limit'] : []),
  ];
  const unsupported = Object.keys(query).find((field) => !allowedFields.includes(field));
  if (unsupported) return 'Request contains an unsupported query parameter.';

  for (const field of [...LOCATION_FIELDS, ...PERIOD_FIELDS, 'q', 'status', 'category', 'delayed']) {
    if (query[field] !== undefined && typeof query[field] !== 'string') {
      return `${field} must be a string.`;
    }
    if (query[field] !== undefined && !query[field].trim()) {
      return `${field} cannot be empty.`;
    }
    if (LOCATION_FIELDS.includes(field) && query[field]?.length > 150) {
      return `${field} must be at most 150 characters.`;
    }
    if (LOCATION_FIELDS.includes(field) && /[\u0000-\u001f\u007f]/.test(query[field] || '')) {
      return `${field} must not contain control characters.`;
    }
  }

  for (const field of PERIOD_FIELDS) {
    if (query[field] !== undefined && !isDateOnly(query[field])) {
      return `${field} must be a valid YYYY-MM-DD date.`;
    }
  }
  if (query.periodFrom && query.periodTo && query.periodFrom > query.periodTo) {
    return 'periodFrom must be on or before periodTo.';
  }
  if (query.category && !mongoose.isValidObjectId(query.category)) {
    return 'category must be a valid category ID.';
  }
  if (query.status && !Work.WORK_STATUSES.includes(query.status)) {
    return 'Invalid work status.';
  }
  if (query.q && (query.q.length > MAX_SEARCH_LENGTH || /[\u0000-\u001f]/.test(query.q))) {
    return `q must be at most ${MAX_SEARCH_LENGTH} characters and contain no control characters.`;
  }
  if (query.delayed !== undefined && !['true', 'false'].includes(query.delayed)) {
    return 'delayed must be true or false.';
  }
  if (query.includeDemo !== undefined && !['true', 'false'].includes(query.includeDemo)) {
    return 'includeDemo must be true or false.';
  }

  if (pagination) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || DEFAULT_PAGE_SIZE);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return `page must be a positive integer and limit must be between 1 and ${MAX_PAGE_SIZE}.`;
    }
  }
  return null;
}

function buildWorkFilter(query) {
  const filter = query.includeDemo === 'true' ? {} : { isDemo: { $ne: true } };
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.periodFrom || query.periodTo) {
    filter.plannedStartDate = {};
    if (query.periodFrom) filter.plannedStartDate.$gte = new Date(`${query.periodFrom}T00:00:00.000Z`);
    if (query.periodTo) filter.plannedStartDate.$lte = new Date(`${query.periodTo}T23:59:59.999Z`);
  }
  for (const field of LOCATION_FIELDS) {
    if (query[field]) filter[`location.${field}`] = query[field];
  }
  if (query.q) {
    const search = new RegExp(escapeRegex(query.q.trim()), 'i');
    filter.$or = [{ name: search }, { description: search }, { 'location.gramPanchayat': search }];
  }
  if (query.delayed === 'true') filter.$expr = { $lt: ['$actualProgress', '$plannedProgress'] };
  if (query.delayed === 'false') filter.$expr = { $gte: ['$actualProgress', '$plannedProgress'] };
  return filter;
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildWorkFilter,
  isDateOnly,
  validateWorkQuery,
};
