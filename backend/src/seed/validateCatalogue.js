const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const {
  CATALOGUE_COLUMNS,
  normalizeCatalogueHeaders,
  validateOfficialCatalogue,
} = require('../domain/officialCatalogue');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run validate-catalogue -- <path-to-catalogue.csv>');
  process.exitCode = 1;
} else {
  try {
    const csv = fs.readFileSync(path.resolve(inputPath), 'utf8');
    const rows = parse(csv, {
      bom: true,
      columns: normalizeCatalogueHeaders,
      skip_empty_lines: true,
      trim: true,
      max_record_size: 20_000,
    });
    const columns = rows.length ? Object.keys(rows[0]) : CATALOGUE_COLUMNS;
    const result = validateOfficialCatalogue(rows, columns);
    console.log(
      `Found ${result.counts.categories} categories, ${result.counts.subcategories} sub-categories, and ${result.counts.permissibleWorks} permissible works.`
    );
    if (result.errors.length) {
      console.error(`Catalogue validation failed with ${result.errors.length} error(s):`);
      for (const error of result.errors.slice(0, 100)) {
        console.error(`${error.row ? `Row ${error.row}: ` : ''}${error.message}`);
      }
      if (result.errors.length > 100) console.error('Further validation errors omitted.');
      process.exitCode = 1;
    } else {
      console.log('Structure and required source-reference fields are valid. This command does not import or verify source claims.');
    }
  } catch (error) {
    console.error(`Could not read or parse catalogue CSV: ${error.message}`);
    process.exitCode = 1;
  }
}
