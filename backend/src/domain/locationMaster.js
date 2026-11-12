// Local administrative location master. Blocks can exist before GP mappings are available.
const fs = require('node:fs');
const path = require('node:path');
const MASTER_PATH = path.resolve(__dirname, '../../data/administrative-locations.json');
function readLocationMaster() {
  if (!fs.existsSync(MASTER_PATH)) return [];
  const rows = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Administrative location master must be an array.');
  return rows;
}
function mergeLocationMaster(states, rows) {
  for (const row of rows) {
    const { state, district, block, gramPanchayat } = row;
    if (![state, district, block].every((v) => typeof v === 'string' && v.trim())) continue;
    if (!states.has(state)) states.set(state, new Map());
    const districts = states.get(state);
    if (!districts.has(district)) districts.set(district, new Map());
    const blocks = districts.get(district);
    if (!blocks.has(block)) blocks.set(block, new Set());
    if (typeof gramPanchayat === 'string' && gramPanchayat.trim()) blocks.get(block).add(gramPanchayat);
  }
}
module.exports = { readLocationMaster, mergeLocationMaster, MASTER_PATH };
