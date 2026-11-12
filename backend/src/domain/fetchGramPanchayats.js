// Best-effort LGD lookup. Never invent Gram Panchayat names.
// The LGD endpoint can be unavailable or change response shape; failures are surfaced to UI.
const API = 'https://india-lgd-index-api.vercel.app';
const LGD = 'https://lgdirectory.gov.in/webservices/lgdws';
const cache = new Map();
const field = (row, keys) => {
  for (const key of keys) if (row && row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return '';
};
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function json(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`LGD service returned HTTP ${response.status}`);
  return response.json();
}
function rows(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    for (const key of ['data', 'result', 'results', 'list', 'gramPanchayats', 'localBodies']) {
      if (Array.isArray(body[key])) return body[key];
    }
  }
  throw new Error('Unexpected LGD response format; no unverified names were used');
}
async function fetchGramPanchayats({ state, district, block }) {
  const cacheKey = JSON.stringify([state, district, block]);
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const states = rows(await json(`${API}/v1/states`));
  const stateRow = states.find((r) => normalize(field(r, ['name','stateNameEnglish','stateName'])) === normalize(state));
  if (!stateRow) throw new Error(`State not found: ${state}`);
  const stateCode = field(stateRow, ['code','lgdCode','stateCode']);
  if (!/^\d+$/.test(stateCode)) throw new Error('State code missing');
  const districts = rows(await json(`${API}/v1/districts?state=${encodeURIComponent(stateCode)}`));
  const districtRow = districts.find((r) => normalize(field(r, ['name','districtNameEnglish','districtName'])) === normalize(district));
  if (!districtRow) throw new Error(`District not found: ${district}`);
  const districtCode = field(districtRow, ['code','lgdCode','districtCode']);
  if (!/^\d+$/.test(districtCode)) throw new Error('District code missing');
  const blocks = rows(await json(`${API}/v1/blocks?district=${encodeURIComponent(districtCode)}`));
  const blockRow = blocks.find((r) => normalize(field(r, ['name','blockNameEnglish','blockName'])) === normalize(block));
  if (!blockRow) throw new Error(`Block not found in LGD: ${block}`);
  const blockCode = field(blockRow, ['code','lgdCode','blockCode']);
  if (!/^\d+$/.test(blockCode)) throw new Error('Block code missing');
    const gpUrl = `${LGD}/getBlockwiseMappedGP?blockCode=${encodeURIComponent(blockCode)}`;
  const gpResponse = await fetch(gpUrl, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!gpResponse.ok) {
    const detail = (await gpResponse.text()).slice(0, 300);
    throw new Error(`LGD GP request failed: HTTP ${gpResponse.status} ${detail}`);
  }
  const gpBody = await gpResponse.json();
  const gpRows = rows(gpBody);
  if (gpRows.length && gpRows.some((r) => typeof r !== 'object' || r === null)) {
    throw new Error('Unexpected GP directory entries');
  }
  const names = gpRows.map((r) => field(r, [
    'localBodyNameEnglish', 'localBodyName', 'gramPanchayatNameEnglish',
    'gramPanchayatName', 'gpNameEnglish', 'gpName', 'nameEnglish', 'name',
  ])).filter(Boolean);
  if (gpRows.length && names.length !== gpRows.length) {
    throw new Error('LGD returned GP rows without recognizable names');
  }
  const data = [...new Set(names)].sort((a,b) => a.localeCompare(b));
  cache.set(cacheKey, { data, expires: Date.now() + 24 * 60 * 60 * 1000 });
  return data;
}
module.exports = { fetchGramPanchayats };
