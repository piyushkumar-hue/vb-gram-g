const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { parse } = require('csv-parse/sync');
const Category = require('../models/Category');
const FieldUpdate = require('../models/FieldUpdate');
const Work = require('../models/Work');
const WorkAudit = require('../models/WorkAudit');
const { allowRoles, requireAuth } = require('../middleware/auth');
const { rejectUnknownQueryParams } = require('../middleware/requestInput');
const { getWorkStatusTransitionError } = require('../domain/workLifecycle');
const { csvCell } = require('../domain/csv');
const { escapeRegex, workIdentity } = require('../domain/workIdentity');
const {
  DEFAULT_PAGE_SIZE,
  buildWorkFilter,
  validateWorkQuery,
} = require('../domain/workQuery');

const router = express.Router();
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
const writableFields = [
  'name',
  'description',
  'category',
  'subCategory',
  'location',
  'lat',
  'lng',
  'plannedProgress',
  'actualProgress',
  'status',
  'expenditure',
  'plannedStartDate',
  'plannedEndDate',
  'actualStartDate',
  'actualEndDate',
];

function validateWorkInput(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }

  const supplied = Object.keys(body);
  const unknown = supplied.filter((field) => !writableFields.includes(field));
  if (unknown.length) return 'Request contains an unsupported field.';
  if (partial && supplied.length === 0) return 'Request body must include at least one supported field.';

  const required = [
    'name',
    'category',
    'subCategory',
    'location',
    'lat',
    'lng',
    'plannedProgress',
  ];
  if (!partial) {
    const missing = required.find((field) => body[field] === undefined);
    if (missing) return `${missing} is required.`;
  }

  if (body.name !== undefined && (
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    body.name.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(body.name)
  )) {
    return 'name must be a non-empty string of at most 200 characters without control characters.';
  }
  if (body.description !== undefined && (
    typeof body.description !== 'string' ||
    body.description.length > 5000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.description)
  )) {
    return 'description must be a string of at most 5,000 characters without control characters.';
  }
  if (body.category !== undefined && !mongoose.isValidObjectId(body.category)) {
    return 'category must be a valid category ID.';
  }
  if (body.subCategory !== undefined && (
    typeof body.subCategory !== 'string' ||
    !body.subCategory.trim() ||
    body.subCategory.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(body.subCategory)
  )) {
    return 'subCategory must be a non-empty string.';
  }
  if (body.location !== undefined) {
    if (!body.location || typeof body.location !== 'object' || Array.isArray(body.location)) {
      return 'location must be an object.';
    }
    const locationFields = [
      'state',
      'district',
      'block',
      'gramPanchayat',
      'stateCode',
      'districtCode',
      'blockCode',
      'gramPanchayatCode',
      'codeScheme',
    ];
    const unknownLocationField = Object.keys(body.location).find((field) => !locationFields.includes(field));
    if (unknownLocationField) return 'location contains an unsupported field.';
    const { state, district, block, gramPanchayat } = body.location || {};
    if ([state, district, block, gramPanchayat].some((value) => typeof value !== 'string' || !value.trim())) {
      return 'location must include state, district, block, and gramPanchayat.';
    }
    for (const [field, value] of Object.entries(body.location)) {
      const maximum = field.endsWith('Code') || field === 'codeScheme' ? 80 : 150;
      if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
        return `location.${field} must be a valid string of at most ${maximum} characters.`;
      }
    }
  }
  for (const field of ['lat', 'lng', 'plannedProgress', 'actualProgress', 'expenditure']) {
    if (body[field] !== undefined && (typeof body[field] !== 'number' || !Number.isFinite(body[field]))) {
      return `${field} must be a finite number.`;
    }
  }
  for (const [field, minimum, maximum] of [
    ['lat', -90, 90],
    ['lng', -180, 180],
    ['plannedProgress', 0, 100],
    ['actualProgress', 0, 100],
    ['expenditure', 0, Number.POSITIVE_INFINITY],
  ]) {
    if (body[field] !== undefined && (body[field] < minimum || body[field] > maximum)) {
      return `${field} must be between ${minimum} and ${maximum === Number.POSITIVE_INFINITY ? 'a non-negative value' : maximum}.`;
    }
  }
  if (body.status !== undefined && !Work.WORK_STATUSES.includes(body.status)) {
    return `status must be one of: ${Work.WORK_STATUSES.join(', ')}.`;
  }
  for (const field of ['plannedStartDate', 'plannedEndDate', 'actualStartDate', 'actualEndDate']) {
    if (body[field] !== undefined &&
        body[field] !== null &&
        (typeof body[field] !== 'string' || Number.isNaN(Date.parse(body[field])))) {
      return `${field} must be a valid date.`;
    }
  }
  return null;
}

async function validateCategorySubcategory(body) {
  if (!body.category || !body.subCategory) return null;
  const category = await Category.findById(body.category).select('subcategories.code');
  if (!category) return 'category was not found.';
  if (!category.subcategories.some((subcategory) => subcategory.code === body.subCategory.trim())) {
    return 'subCategory must be a code listed under the selected category.';
  }
  return null;
}

router.use(requireAuth);
router.use((request, response, next) => {
  const filteredList = request.method === 'GET' &&
    (request.path === '/' || request.path === '/export.csv');
  if (filteredList) return next();
  return rejectUnknownQueryParams()(request, response, next);
});

router.get('/export.csv', async (request, response, next) => {
  try {
    const validationError = validateWorkQuery(request.query, { pagination: false });
    if (validationError) return response.status(400).json({ message: validationError });

    const headers = [
      'name',
      'description',
      'category',
      'subCategory',
      'state',
      'district',
      'block',
      'gramPanchayat',
      'lat',
      'lng',
      'plannedProgress',
      'actualProgress',
      'status',
      'expenditure',
      'plannedStartDate',
      'plannedEndDate',
      'actualStartDate',
      'actualEndDate',
      'source',
      'delayed',
    ];
    const cursor = Work.find(buildWorkFilter(request.query))
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .cursor({ batchSize: 250 });
    async function* csvRows() {
      yield `${headers.map(csvCell).join(',')}\r\n`;
      for await (const work of cursor) {
        yield `${[
        work.name,
        work.description,
        work.category?.name,
        work.subCategory,
        work.location?.state,
        work.location?.district,
        work.location?.block,
        work.location?.gramPanchayat,
        work.lat,
        work.lng,
        work.plannedProgress,
        work.actualProgress,
        work.status,
        work.expenditure,
        work.plannedStartDate?.toISOString(),
        work.plannedEndDate?.toISOString(),
        work.actualStartDate?.toISOString(),
        work.actualEndDate?.toISOString(),
        work.source,
        work.actualProgress < work.plannedProgress,
      ]
        .map(csvCell)
        .join(',')}\r\n`;
      }
    }

    response.set('Content-Type', 'text/csv; charset=utf-8');
    response.set('Content-Disposition', 'attachment; filename="vb-gram-g-works.csv"');
    try {
      await pipeline(Readable.from(csvRows()), response);
    } catch (error) {
      await cursor.close();
      if (response.headersSent) {
        console.error('CSV export stream failed after the response began.');
        if (!response.destroyed) response.destroy();
        return;
      }
      return next(error);
    }
    return;
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/import',
  allowRoles('admin', 'officer'),
  csvUpload.single('file'),
  async (request, response, next) => {
    if (!request.file) {
      return response.status(400).json({ message: 'Upload a CSV file using the "file" form field.' });
    }
    if (!request.file.originalname.toLowerCase().endsWith('.csv')) {
      return response.status(400).json({ message: 'The uploaded file must have a .csv extension.' });
    }

    let rows;
    try {
      rows = parse(request.file.buffer, {
        bom: true,
        columns: (headers) => {
          const normalizedHeaders = headers.map((header) => header.trim());
          const duplicate = normalizedHeaders.find(
            (header, index) => normalizedHeaders.indexOf(header) !== index
          );
          if (duplicate !== undefined) throw new Error(`Duplicate CSV column "${duplicate}".`);
          return normalizedHeaders;
        },
        skip_empty_lines: true,
        trim: true,
        max_record_size: 10_000,
      });
    } catch (error) {
      return response.status(400).json({ message: `Could not parse CSV: ${error.message}` });
    }
    if (!rows.length) return response.status(400).json({ message: 'The CSV file has no data rows.' });
    if (rows.length > 1000) {
      return response.status(400).json({ message: 'A single CSV upload can contain at most 1,000 work records.' });
    }

    const requiredHeaders = [
      'name',
      'category',
      'subCategory',
      'state',
      'district',
      'block',
      'gramPanchayat',
      'lat',
      'lng',
      'plannedProgress',
      'plannedStartDate',
      'plannedEndDate',
    ];
    const headers = Object.keys(rows[0]);
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    const allowedHeaders = [
      ...requiredHeaders,
      'description',
      'actualProgress',
      'status',
      'expenditure',
      'actualStartDate',
      'actualEndDate',
      'source',
      'delayed',
    ];
    const unsupportedHeaders = headers.filter((header) => !allowedHeaders.includes(header));
    if (missingHeaders.length) {
      return response.status(400).json({
        message: `CSV is missing required columns: ${missingHeaders.join(', ')}.`,
        requiredHeaders,
      });
    }
    if (unsupportedHeaders.length) {
      return response.status(400).json({
        message: `CSV contains unsupported columns: ${unsupportedHeaders.join(', ')}.`,
        allowedHeaders,
      });
    }

    try {
      const categories = await Category.find().select('name subcategories');
      const categoriesByName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
      const errors = [];
      const documents = [];
      const documentRows = [];
      const seenIdentities = new Set();

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const category = categoriesByName.get((row.category || '').toLowerCase());
        if (!category) {
          errors.push({ row: rowNumber, message: `Unknown category "${row.category || ''}".` });
          return;
        }
        const subcategory = category.subcategories.find(
          (item) => item.code === row.subCategory?.trim().toUpperCase()
        );
        if (!subcategory) {
          errors.push({
            row: rowNumber,
            message: `Sub-category "${row.subCategory || ''}" is not listed under ${category.name}.`,
          });
          return;
        }

        const numericFields = ['lat', 'lng', 'plannedProgress'];
        if (row.actualProgress !== undefined && row.actualProgress !== '') numericFields.push('actualProgress');
        if (row.expenditure !== undefined && row.expenditure !== '') numericFields.push('expenditure');
        const numericValues = {};
        let invalidNumber = false;
        for (const field of numericFields) {
          numericValues[field] = Number(row[field]);
          if (row[field] === '' || !Number.isFinite(numericValues[field])) invalidNumber = true;
        }
        if (invalidNumber) {
          errors.push({ row: rowNumber, message: 'Coordinates, progress, and expenditure values must be valid numbers.' });
          return;
        }

        const document = {
          name: row.name,
          description: row.description || '',
          category: category._id,
          subCategory: subcategory.code,
          location: {
            state: row.state,
            district: row.district,
            block: row.block,
            gramPanchayat: row.gramPanchayat,
          },
          ...numericValues,
          status: row.status || 'Proposed',
          plannedStartDate: row.plannedStartDate,
          plannedEndDate: row.plannedEndDate,
          actualStartDate: row.actualStartDate || null,
          actualEndDate: row.actualEndDate || null,
          source: 'manual',
          createdBy: request.user._id,
          updatedBy: request.user._id,
        };
        if (document.status !== 'Proposed') {
          errors.push({
            row: rowNumber,
            message: 'Imported work records must start in the Proposed status.',
          });
          return;
        }
        const work = new Work(document);
        const validationError = work.validateSync();
        if (validationError) {
          errors.push({ row: rowNumber, message: validationError.message });
          return;
        }
        const identity = workIdentity(document);
        if (seenIdentities.has(identity)) {
          errors.push({ row: rowNumber, message: 'This work is duplicated within the uploaded CSV.' });
          return;
        }
        seenIdentities.add(identity);
        if (new Date(document.plannedStartDate) > new Date(document.plannedEndDate)) {
          errors.push({ row: rowNumber, message: 'plannedEndDate must be on or after plannedStartDate.' });
          return;
        }
        documents.push(document);
        documentRows.push(rowNumber);
      });

      if (!errors.length && documents.length) {
        const existing = await Work.find({
          $or: documents.map((document) => ({
            name: new RegExp(`^${escapeRegex(document.name.trim())}$`, 'i'),
            category: document.category,
            subCategory: document.subCategory,
            'location.state': new RegExp(`^${escapeRegex(document.location.state)}$`, 'i'),
            'location.district': new RegExp(`^${escapeRegex(document.location.district)}$`, 'i'),
            'location.block': new RegExp(`^${escapeRegex(document.location.block)}$`, 'i'),
            'location.gramPanchayat': new RegExp(`^${escapeRegex(document.location.gramPanchayat)}$`, 'i'),
          })),
        })
          .select('name category subCategory location')
          .lean();
        const existingIdentities = new Set(existing.map(workIdentity));
        documents.forEach((document, index) => {
          if (existingIdentities.has(workIdentity(document))) {
            errors.push({
              row: documentRows[index],
              message: 'A work with this name and location already exists.',
            });
          }
        });
      }

      if (errors.length) {
        return response.status(400).json({
          message: 'No records were imported because the CSV contains validation errors.',
          errorCount: errors.length,
          errors: errors.slice(0, 100),
          errorsTruncated: errors.length > 100,
        });
      }

      const inserted = await Work.insertMany(documents, { ordered: true });
      return response.status(201).json({
        message: 'CSV import completed.',
        imported: inserted.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/locations', async (request, response, next) => {
  try {
    const validationError = validateWorkQuery(request.query, { pagination: false });
    if (validationError) return response.status(400).json({ message: validationError });
    const records = await Work.aggregate([
      { $match: buildWorkFilter(request.query) },
      {
        $group: {
          _id: {
            state: '$location.state',
            district: '$location.district',
            block: '$location.block',
            gramPanchayat: '$location.gramPanchayat',
          },
        },
      },
      { $sort: { '_id.state': 1, '_id.district': 1, '_id.block': 1, '_id.gramPanchayat': 1 } },
    ]);

    const states = new Map();
    for (const { _id: location } of records) {
      if (!location.state || !location.district || !location.block || !location.gramPanchayat) continue;
      if (!states.has(location.state)) states.set(location.state, new Map());
      const districts = states.get(location.state);
      if (!districts.has(location.district)) districts.set(location.district, new Map());
      const blocks = districts.get(location.district);
      if (!blocks.has(location.block)) blocks.set(location.block, new Set());
      blocks.get(location.block).add(location.gramPanchayat);
    }

    return response.json({
      data: [...states].map(([name, districts]) => ({
        name,
        districts: [...districts].map(([districtName, blocks]) => ({
          name: districtName,
          blocks: [...blocks].map(([blockName, gramPanchayats]) => ({
            name: blockName,
            gramPanchayats: [...gramPanchayats],
          })),
        })),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (request, response, next) => {
  try {
    const validationError = validateWorkQuery(request.query);
    if (validationError) return response.status(400).json({ message: validationError });

    const page = Number(request.query.page || 1);
    const limit = Number(request.query.limit || DEFAULT_PAGE_SIZE);

    const filter = buildWorkFilter(request.query);
    const [data, total] = await Promise.all([
      Work.find(filter)
        .populate('category', 'name subcategories')
          .populate('createdBy', 'name email')
          .populate('updatedBy', 'name email')
          .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Work.countDocuments(filter),
    ]);
    return response.json({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', allowRoles('admin', 'officer'), async (request, response, next) => {
  try {
    const validationError = validateWorkInput(request.body);
    if (validationError) return response.status(400).json({ message: validationError });
    if (request.body.status && request.body.status !== 'Proposed') {
      return response.status(409).json({ message: 'New work records must start in the Proposed status.' });
    }
    if (
      request.body.plannedStartDate &&
      request.body.plannedEndDate &&
      new Date(request.body.plannedStartDate) > new Date(request.body.plannedEndDate)
    ) {
      return response.status(400).json({ message: 'plannedEndDate must be on or after plannedStartDate.' });
    }
    const categoryError = await validateCategorySubcategory(request.body);
    if (categoryError) return response.status(400).json({ message: categoryError });

    const work = await Work.create({
      ...request.body,
      source: 'manual',
      createdBy: request.user._id,
      updatedBy: request.user._id,
    });
    return response.status(201).json({
      data: await work
        .populate('category', 'name subcategories')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email'),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ message: 'Invalid work ID.' });
  }
  try {
    const work = await Work.findById(request.params.id)
      .populate('category', 'name subcategories')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    if (!work) return response.status(404).json({ message: 'Work record not found.' });
    return response.json({ data: work });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', allowRoles('admin', 'officer'), async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ message: 'Invalid work ID.' });
  }
  try {
    const validationError = validateWorkInput(request.body, true);
    if (validationError) return response.status(400).json({ message: validationError });
    const work = await Work.findById(request.params.id);
    if (!work) return response.status(404).json({ message: 'Work record not found.' });

    const updatedValues = { ...request.body };
    if (updatedValues.status !== undefined) {
      const transitionError = getWorkStatusTransitionError(work.status, updatedValues.status);
      if (transitionError) return response.status(409).json({ message: transitionError });
    }
    const plannedStartDate = updatedValues.plannedStartDate || work.plannedStartDate;
    const plannedEndDate = updatedValues.plannedEndDate || work.plannedEndDate;
    if (new Date(plannedStartDate) > new Date(plannedEndDate)) {
      return response.status(400).json({ message: 'plannedEndDate must be on or after plannedStartDate.' });
    }
    const categoryId = updatedValues.category || work.category;
    const subCategory = updatedValues.subCategory || work.subCategory;
    const categoryError = await validateCategorySubcategory({ category: categoryId, subCategory });
    if (categoryError) return response.status(400).json({ message: categoryError });

    Object.assign(work, updatedValues);
    work.updatedBy = request.user._id;
    await work.save();
    return response.json({
      data: await work
        .populate('category', 'name subcategories')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email'),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', allowRoles('admin'), async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ message: 'Invalid work ID.' });
  }
  try {
    if (await FieldUpdate.exists({ workId: request.params.id })) {
      return response.status(409).json({
        message: 'This work has field-update history and cannot be deleted. Keep the work record to preserve its audit history.',
      });
    }
    const work = await Work.findByIdAndDelete(request.params.id);
    if (!work) return response.status(404).json({ message: 'Work record not found.' });
    try {
      const audit = await WorkAudit.create({
        workId: work._id,
        workName: work.name,
        action: 'deleted',
        actorId: request.user._id,
        actorName: request.user.name,
      });
      return response.json({
        message: 'Work record deleted.',
        audit: { actorName: audit.actorName, recordedAt: audit.recordedAt },
      });
    } catch (auditError) {
      console.error(`Work ${work._id} was deleted, but its audit event could not be persisted: ${auditError.message}`);
      return response.status(500).json({
        message: 'Work was deleted, but its audit event could not be saved. Notify an administrator.',
      });
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.validateWorkInput = validateWorkInput;
