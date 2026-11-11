require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const PermissibleWork = require('../models/PermissibleWork');
const {
  CATALOGUE_COLUMNS,
  isOfficialSourceUrl,
  normalizeCatalogueHeaders,
  validateOfficialCatalogue,
} = require('../domain/officialCatalogue');

function loadCatalogue(csvPath) {
  const csv = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const rows = parse(csv, {
    bom: true,
    columns: normalizeCatalogueHeaders,
    skip_empty_lines: true,
    trim: true,
    max_record_size: 20_000,
  });
  const columns = rows.length ? Object.keys(rows[0]) : CATALOGUE_COLUMNS;
  return { rows, result: validateOfficialCatalogue(rows, columns) };
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((arg) => !arg.startsWith('--'));
  const apply = args.includes('--apply');
  const confirmed = args.includes('--confirm-source-reviewed');
  if (!inputPath) {
    throw new Error('Usage: npm run import-catalogue -- <catalogue.csv> [--apply --confirm-source-reviewed]');
  }

  const { rows, result } = loadCatalogue(inputPath);
  console.log(
    `Validated ${result.counts.categories} categories, ${result.counts.subcategories} sub-categories, and ${result.counts.permissibleWorks} permissible works.`
  );
  if (result.errors.length) {
    for (const error of result.errors.slice(0, 100)) {
      console.error(`${error.row ? `Row ${error.row}: ` : ''}${error.message}`);
    }
    throw new Error(`Catalogue validation failed with ${result.errors.length} error(s).`);
  }

  if (!apply) {
    console.log('Dry run only. No database records were written.');
    return;
  }
  if (!confirmed) {
    throw new Error('Database import requires --confirm-source-reviewed after a maintainer verifies every cited source.');
  }
  const unverifiedSource = rows.find((row) => !isOfficialSourceUrl(row.sourceUrl));
  if (unverifiedSource) {
    throw new Error('Every applied source URL must use HTTPS on a .gov.in or .nic.in domain.');
  }

  try {
    await connectDatabase();
    const operations = rows.map((row) => ({
      updateOne: {
        filter: {
          categoryName: row.categoryName,
          subCategoryCode: row.subCategoryCode,
          code: row.workCode,
        },
        update: {
          $set: {
            categoryName: row.categoryName,
            subCategoryCode: row.subCategoryCode,
            subCategoryName: row.subCategoryName,
            code: row.workCode,
            name: row.workName,
            source: {
              title: row.sourceTitle,
              url: row.sourceUrl,
              reference: row.sourceReference,
              publishedDate: row.sourcePublishedDate || null,
              accessedDate: new Date(row.sourceAccessedDate),
            },
            verificationStatus: 'verified',
          },
        },
        upsert: true,
      },
    }));
    const result = await PermissibleWork.bulkWrite(operations, { ordered: true });
    console.log(
      `Catalogue import finished in the separate PermissibleWork collection: ${result.upsertedCount} inserted and ${result.modifiedCount} updated.`
    );
    console.log('Existing entries absent from this file were not deleted.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Catalogue import failed: ${error.message}`);
  process.exitCode = 1;
});
