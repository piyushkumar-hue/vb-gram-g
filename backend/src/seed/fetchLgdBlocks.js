// Downloads a public LGD-derived snapshot of Indian blocks, no fake Gram Panchayat names.
// Source: https://github.com/shrinivas-sn/india-lgd-index-api
// Usage: npm run fetch-lgd-blocks
const fs = require('node:fs');
const path = require('node:path');
const { MASTER_PATH } = require('../domain/locationMaster');
const ORIGIN = 'https://india-lgd-index-api.vercel.app';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const field = (obj, keys) => {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return '';
};
const nameOf = (obj) => field(obj, ['name', 'nameEnglish', 'stateNameEnglish', 'districtNameEnglish', 'blockNameEnglish', 'state_name', 'district_name', 'block_name', 'stateName', 'districtName', 'blockName']);
const codeOf = (obj) => field(obj, ['code', 'lgdCode', 'stateCode', 'districtCode', 'state_code', 'district_code', 'stateLgdCode', 'districtLgdCode']);
async function get(endpoint) {
  const res = await fetch(`${ORIGIN}${endpoint}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) throw new Error(`${endpoint}: unexpected API response`);
  return json.data;
}
async function main() {
  const states = await get('/v1/states');
  const districts = await get('/v1/districts');
  const byState = new Map(states.map((s) => [codeOf(s), nameOf(s)]));
  const byDistrict = new Map(districts.map((d) => [codeOf(d), d]));
  if (states.length < 30 || districts.length < 600 || ![...byState.values()].every(Boolean)) {
    throw new Error('LGD state/district response has unexpected fields; no files changed.');
  }
  const rows = [];
  for (const s of states) {
    const stateCode = codeOf(s);
    const blocks = await get(`/v1/blocks?state=${encodeURIComponent(stateCode)}`);
    for (const b of blocks) {
      const districtCode = field(b, ['districtCode', 'district_code', 'districtLgdCode', 'district_lgd_code']);
      const district = byDistrict.get(districtCode);
      const blockName = nameOf(b);
      const districtName = district && nameOf(district);
      const districtState = district && field(district, ['stateCode', 'state_code', 'stateLgdCode']);
      if (!districtName || !blockName || (districtState && districtState !== stateCode)) {
        throw new Error(`Unrecognized LGD block fields for state ${stateCode}: ${JSON.stringify(b).slice(0,350)}. No files changed.`);
      }
      rows.push({ state: byState.get(stateCode), district: districtName, block: blockName, gramPanchayat: '' });
    }
    await pause(250);
  }
  if (rows.length < 6000) throw new Error(`Only ${rows.length} blocks found; no files changed.`);
  let previous = [];
  if (fs.existsSync(MASTER_PATH)) {
    previous = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
    if (!Array.isArray(previous)) throw new Error('Existing master is not an array.');
  }
  // Retain existing GP mappings; merge new official block entries without inventing GPs.
  const combined = new Map();
  for (const row of [...previous, ...rows]) {
    const key = JSON.stringify([row.state, row.district, row.block, row.gramPanchayat || '']);
    combined.set(key, row);
  }
  fs.mkdirSync(path.dirname(MASTER_PATH), { recursive: true });
  const temp = `${MASTER_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify([...combined.values()], null, 2) + '\n');
  fs.renameSync(temp, MASTER_PATH);
  console.log(`Imported ${rows.length} LGD-derived blocks across ${states.length} states. Restart backend.`);
  console.log('Gram Panchayat names are NOT included in this source. They require a separate verified mapping.');
}
main().catch((err) => { console.error('LGD download failed:', err.message); process.exitCode = 1; });
