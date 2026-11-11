const assert = require('node:assert/strict');
const test = require('node:test');
const { CATEGORY_NAMES } = require('../src/models/Category');
const PermissibleWork = require('../src/models/PermissibleWork');
const {
  CATALOGUE_COLUMNS,
  isOfficialSourceUrl,
  normalizeCatalogueHeaders,
  validateOfficialCatalogue,
} = require('../src/domain/officialCatalogue');

function createStructureOnlyFixture() {
  const subcategoriesPerCategory = [8, 7, 7, 7];
  const rows = [];
  let workNumber = 0;
  let subcategoryNumber = 0;
  for (const [categoryIndex, categoryName] of CATEGORY_NAMES.entries()) {
    for (let index = 0; index < subcategoriesPerCategory[categoryIndex]; index += 1) {
      const subCategoryCode = `TEST-${String(++subcategoryNumber).padStart(2, '0')}`;
      const workCount = subcategoryNumber === 29 ? 10 : 11;
      for (let workIndex = 0; workIndex < workCount; workIndex += 1) {
        rows.push({
          categoryName,
          subCategoryCode,
          subCategoryName: `Test sub-category ${subcategoryNumber}`,
          workCode: `TEST-WORK-${++workNumber}`,
          workName: `Test permissible work ${workNumber}`,
          sourceTitle: 'Test fixture only',
          sourceUrl: 'https://example.invalid/test-source',
          sourceReference: 'Automated test fixture; not official data',
          sourceAccessedDate: '2026-01-01',
        });
      }
    }
  }
  return rows;
}

test('catalogue validator accepts only the expected complete structure and source metadata', () => {
  const result = validateOfficialCatalogue(createStructureOnlyFixture(), CATALOGUE_COLUMNS);
  assert.deepEqual(result.counts, { categories: 4, subcategories: 29, permissibleWorks: 318 });
  assert.deepEqual(result.errors, []);
});

test('catalogue validator rejects incomplete counts and unsafe or missing source references', () => {
  const rows = createStructureOnlyFixture().slice(0, 1);
  rows[0].sourceUrl = 'javascript:alert(1)';
  rows[0].sourceAccessedDate = 'not-a-date';
  const result = validateOfficialCatalogue(rows, CATALOGUE_COLUMNS);
  assert.ok(result.errors.some((error) => error.message.includes('Expected 318 permissible works')));
  assert.ok(result.errors.some((error) => error.message.includes('HTTP or HTTPS')));
  assert.ok(result.errors.some((error) => error.message.includes('YYYY-MM-DD')));
});

test('catalogue validator identifies repeated permissible-work codes', () => {
  const rows = createStructureOnlyFixture().slice(0, 2);
  rows[1].workCode = rows[0].workCode;
  const result = validateOfficialCatalogue(rows, CATALOGUE_COLUMNS);
  assert.ok(result.errors.some((error) => error.message.includes('Duplicate permissible work code')));
});

test('catalogue source URLs and CSV headers are constrained for safe import', () => {
  assert.equal(isOfficialSourceUrl('https://nrega.dord.gov.in/'), true);
  assert.equal(isOfficialSourceUrl('http://nrega.dord.gov.in/'), false);
  assert.equal(isOfficialSourceUrl('https://example.invalid/catalogue'), false);
  assert.throws(() => normalizeCatalogueHeaders(['workName', ' workName ']), /Duplicate CSV column/);
});

test('catalogue schema keeps source-backed entries separate and pending by default', () => {
  const entry = new PermissibleWork({
    categoryName: CATEGORY_NAMES[0],
    subCategoryCode: 'TEST-01',
    subCategoryName: 'Test fixture only',
    code: 'TEST-001',
    name: 'Test permissible entry only',
    source: {
      title: 'Test source',
      url: 'https://example.invalid/source',
      reference: 'Automated test fixture; not official data',
      accessedDate: '2026-01-01',
    },
  });
  assert.equal(entry.verificationStatus, 'pending');
  assert.equal(entry.validateSync(), undefined);

  const unsafeSource = new PermissibleWork({
    ...entry.toObject(),
    source: { ...entry.source.toObject(), url: 'javascript:alert(1)' },
  });
  assert.ok(unsafeSource.validateSync().errors['source.url']);
});
