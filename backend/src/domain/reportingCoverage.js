const { isDateOnly } = require('./workQuery');

function validateZeroCoverageInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }
  const unsupported = Object.keys(body).find(
    (field) => !['state', 'district', 'periodFrom', 'periodTo'].includes(field)
  );
  if (unsupported) return 'Request contains an unsupported field.';
  if (typeof body.state !== 'string' || !body.state.trim() || body.state.length > 150 || /[\u0000-\u001f\u007f]/.test(body.state)) {
    return 'state must be a non-empty string of at most 150 characters.';
  }
  if (typeof body.district !== 'string' || !body.district.trim() || body.district.length > 150 || /[\u0000-\u001f\u007f]/.test(body.district)) {
    return 'district must be a non-empty string of at most 150 characters.';
  }
  for (const field of ['periodFrom', 'periodTo']) {
    if (!isDateOnly(body[field])) return `${field} must be a valid YYYY-MM-DD date.`;
  }
  if (body.periodFrom > body.periodTo) {
    return 'periodFrom must be on or before periodTo.';
  }
  return null;
}

function periodDateRange(periodFrom, periodTo) {
  return {
    periodFrom: new Date(`${periodFrom}T00:00:00.000Z`),
    periodTo: new Date(`${periodTo}T23:59:59.999Z`),
  };
}

function canApplyZeroCoverage(query) {
  return Boolean(query.periodFrom && query.periodTo) &&
    !query.category &&
    !query.status &&
    !query.delayed &&
    !query.q &&
    !query.block &&
    !query.gramPanchayat;
}

module.exports = {
  canApplyZeroCoverage,
  periodDateRange,
  validateZeroCoverageInput,
};
