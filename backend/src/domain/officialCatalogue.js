const { CATEGORY_NAMES } = require('../models/Category');

const CATALOGUE_COLUMNS = [
  'categoryName',
  'subCategoryCode',
  'subCategoryName',
  'workCode',
  'workName',
  'sourceTitle',
  'sourceUrl',
  'sourceReference',
  'sourcePublishedDate',
  'sourceAccessedDate',
];
const EXPECTED_COUNTS = { categories: 4, subcategories: 29, permissibleWorks: 318 };

function normalizeCatalogueHeaders(headers) {
  const normalizedHeaders = headers.map((header) => header.trim());
  const duplicate = normalizedHeaders.find((header, index) => normalizedHeaders.indexOf(header) !== index);
  if (duplicate !== undefined) throw new Error(`Duplicate CSV column "${duplicate}".`);
  return normalizedHeaders;
}

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase('en');
}

function isOfficialSourceUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (hostname === 'gov.in' ||
        hostname.endsWith('.gov.in') ||
        hostname === 'nic.in' ||
        hostname.endsWith('.nic.in'))
    );
  } catch {
    return false;
  }
}

function validateOfficialCatalogue(rows, columns = CATALOGUE_COLUMNS) {
  const errors = [];
  const suppliedColumns = new Set(columns);
  for (const column of CATALOGUE_COLUMNS) {
    if (!suppliedColumns.has(column)) errors.push({ row: 1, message: `Missing required column "${column}".` });
  }
  for (const column of suppliedColumns) {
    if (!CATALOGUE_COLUMNS.includes(column)) errors.push({ row: 1, message: `Unsupported column "${column}".` });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push({ row: 0, message: 'Catalogue must contain at least one data row.' });
    return { errors, counts: { categories: 0, subcategories: 0, permissibleWorks: 0 } };
  }

  const categories = new Set();
  const subcategories = new Map();
  const subcategoryNames = new Set();
  const workCodes = new Set();
  const workNames = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const categoryName = String(row.categoryName || '').trim();
    const categoryKey = normalized(categoryName);
    const subCategoryCode = String(row.subCategoryCode || '').trim();
    const subCategoryName = String(row.subCategoryName || '').trim();
    const workCode = String(row.workCode || '').trim();
    const workName = String(row.workName || '').trim();
    const sourceTitle = String(row.sourceTitle || '').trim();
    const sourceReference = String(row.sourceReference || '').trim();
    const sourceAccessedDate = String(row.sourceAccessedDate || '').trim();

    for (const [field, value] of Object.entries({
      categoryName,
      subCategoryCode,
      subCategoryName,
      workCode,
      workName,
      sourceTitle,
      sourceUrl: String(row.sourceUrl || '').trim(),
      sourceReference,
      sourceAccessedDate,
    })) {
      if (!value) errors.push({ row: rowNumber, message: `${field} is required.` });
    }

    if (categoryName && !CATEGORY_NAMES.includes(categoryName)) {
      errors.push({ row: rowNumber, message: `Unknown category "${categoryName}".` });
    }
    if (categoryName) categories.add(categoryName);

    const subcategoryKey = `${categoryKey}\u0000${normalized(subCategoryCode)}`;
    if (categoryName && subCategoryCode && subCategoryName) {
      const existingName = subcategories.get(subcategoryKey);
      if (existingName && existingName !== subCategoryName) {
        errors.push({ row: rowNumber, message: `Sub-category code "${subCategoryCode}" has conflicting names.` });
      } else {
        subcategories.set(subcategoryKey, subCategoryName);
      }
      const subcategoryNameKey = `${categoryKey}\u0000${normalized(subCategoryName)}`;
      if (subcategoryNames.has(subcategoryNameKey) && !existingName) {
        errors.push({ row: rowNumber, message: `Duplicate sub-category name "${subCategoryName}" in "${categoryName}".` });
      }
      subcategoryNames.add(subcategoryNameKey);
    }

    const workCodeKey = `${subcategoryKey}\u0000${normalized(workCode)}`;
    if (workCode && workCodes.has(workCodeKey)) {
      errors.push({ row: rowNumber, message: `Duplicate permissible work code "${workCode}".` });
    }
    if (workCode) workCodes.add(workCodeKey);

    const workNameKey = `${subcategoryKey}\u0000${normalized(workName)}`;
    if (workName && workNames.has(workNameKey)) {
      errors.push({ row: rowNumber, message: `Duplicate permissible work name "${workName}" within its sub-category.` });
    }
    if (workName) workNames.add(workNameKey);

    const sourceUrl = String(row.sourceUrl || '').trim();
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
      } catch {
        errors.push({ row: rowNumber, message: 'sourceUrl must be a valid HTTP or HTTPS URL.' });
      }
    }
    for (const [field, value] of [
      ['sourcePublishedDate', String(row.sourcePublishedDate || '').trim()],
      ['sourceAccessedDate', sourceAccessedDate],
    ]) {
      if (
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      ) {
        errors.push({ row: rowNumber, message: `${field} must be a valid YYYY-MM-DD date.` });
      }
    }
  });

  const counts = {
    categories: categories.size,
    subcategories: subcategories.size,
    permissibleWorks: rows.length,
  };
  if (counts.categories !== EXPECTED_COUNTS.categories) {
    errors.push({ row: 0, message: `Expected ${EXPECTED_COUNTS.categories} categories; found ${counts.categories}.` });
  }
  if (counts.subcategories !== EXPECTED_COUNTS.subcategories) {
    errors.push({
      row: 0,
      message: `Expected ${EXPECTED_COUNTS.subcategories} sub-categories; found ${counts.subcategories}.`,
    });
  }
  if (counts.permissibleWorks !== EXPECTED_COUNTS.permissibleWorks) {
    errors.push({
      row: 0,
      message: `Expected ${EXPECTED_COUNTS.permissibleWorks} permissible works; found ${counts.permissibleWorks}.`,
    });
  }
  for (const categoryName of CATEGORY_NAMES) {
    if (!categories.has(categoryName)) errors.push({ row: 0, message: `Category "${categoryName}" is missing.` });
  }

  return { errors, counts };
}

module.exports = {
  CATALOGUE_COLUMNS,
  EXPECTED_COUNTS,
  isOfficialSourceUrl,
  normalizeCatalogueHeaders,
  validateOfficialCatalogue,
};
