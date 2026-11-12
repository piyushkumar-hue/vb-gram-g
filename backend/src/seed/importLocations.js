// Import a user-supplied, verified CSV of state/district/block/Gram Panchayat names.
// Usage: npm run import-locations -- "C:\\path\\to\\locations.csv"
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { MASTER_PATH } = require('../domain/locationMaster');
const input = process.argv[2];
if (!input) { console.error('Usage: npm run import-locations -- "path/to/locations.csv"'); process.exit(1); }
try {
  const csv = fs.readFileSync(path.resolve(input), 'utf8');
  const rows = parse(csv.replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true });
  if (!rows.length) throw new Error('CSV has no records.');
  const keys = ['state', 'district', 'block', 'gramPanchayat'];
  const unique = new Map();
  rows.forEach((row, index) => {
    for (const key of keys) {
      if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 150) {
        throw new Error(`Row ${index + 2}: missing or invalid ${key}`);
      }
    }
    const record = Object.fromEntries(keys.map((key) => [key, row[key].trim()]));
    unique.set(JSON.stringify(keys.map((key) => record[key])), record);
  });
  fs.mkdirSync(path.dirname(MASTER_PATH), { recursive: true });
  // Atomic replace; only after every row validates.
  const temporary = `${MASTER_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...unique.values()], null, 2) + '\n');
  fs.renameSync(temporary, MASTER_PATH);
  console.log(`Imported ${unique.size} administrative rows. Restart backend to refresh location dropdowns.`);
} catch (error) { console.error(`Import failed: ${error.message}`); process.exitCode = 1; }
