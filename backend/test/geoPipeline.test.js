const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  assignDistrictParents,
  normalizeDistrictFeature,
  normalizeStateFeature,
  validateCollection,
  validateCrs,
  validateHierarchyLayer,
  validateProcessedCollection,
} = require('../src/geo/geoPipeline');
const AdministrativeArea = require('../src/models/AdministrativeArea');
const {
  auditRawTopology,
  parseMapshaperTopologyAudit,
} = require('../src/geo/validateGeo');

function feature(name, id, level, geometry, extra = {}) {
  return {
    type: 'Feature',
    properties: {
      shapeName: name,
      shapeID: id,
      shapeISO: level === 'ADM1' ? `IN-${id}` : '',
      shapeGroup: 'IND',
      shapeType: level,
      ...extra,
    },
    geometry,
  };
}

function collection(features) {
  return {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features,
  };
}

const state = feature('Test State', 'TS', 'ADM1', {
  type: 'Polygon',
  coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
});
const district = feature('Test District', 'TD', 'ADM2', {
  type: 'Polygon',
  coordinates: [[[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]],
});

test('boundary validation checks source identifiers, geometry, CRS, and the pinned feature count', () => {
  assert.deepEqual(validateCollection(collection([state]), { level: 'ADM1', expectedCount: 1 }).errors, []);
  assert.match(
    validateCollection(collection([state]), { level: 'ADM1', expectedCount: 2 }).errors.join(' '),
    /Expected 2 ADM1 features/
  );
  assert.match(
    validateCrs({ crs: { properties: { name: 'EPSG:3857' } } }).join(' '),
    /WGS84/
  );
  const invalid = feature('Invalid', 'bad', 'ADM1', {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 10], [0, 10], [10, 0], [0, 0]]],
  });
  assert.match(
    validateCollection(collection([invalid]), { level: 'ADM1', expectedCount: 1 }).errors.join(' '),
    /invalid polygon topology/
  );
  assert.match(
    validateCollection(collection([invalid]), {
      level: 'ADM1',
      expectedCount: 1,
      checkTopology: false,
    }).errors.join(' '),
    /^$/
  );
});

test('raw topology audit parser reports cleanup findings and rejects defective rings', () => {
  const clean = parseMapshaperTopologyAudit(
    '[clean] Retained 36 of 36 features\nType: polygon',
    36
  );
  assert.deepEqual(clean.errors, []);
  assert.deepEqual(clean.findings, []);

  const findings = parseMapshaperTopologyAudit(
    '[clean] Partitioned 2 multi-feature interior gaps\n' +
      '[clean] Removed 16 of 17 slivers using 220m width threshold\n' +
      '[clean] Retained 735 of 735 features\nType: polygon',
    735
  );
  assert.deepEqual(findings.errors, []);
  assert.equal(findings.findings.length, 2);
  assert.match(findings.findings.join(' '), /interior gaps.*slivers/);

  const defective = parseMapshaperTopologyAudit(
    '[i] Skipping a defective ring\n[clean] Retained 1 of 1 features\nType: tabular data',
    1
  );
  assert.match(defective.errors.join(' '), /expected polygon/);
  assert.match(defective.errors.join(' '), /skipped 1 defective polygon ring/);

  const incomplete = parseMapshaperTopologyAudit(
    '[clean] Retained 35 of 36 features\nType: polygon',
    36
  );
  assert.match(incomplete.errors.join(' '), /retained 35 of 36/);
});

test('raw topology audit checks polygon rings without changing the source file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-gram-geo-audit-'));
  const validPath = path.join(directory, 'valid.geojson');
  const defectivePath = path.join(directory, 'defective.geojson');
  const validSource = JSON.stringify(collection([state]));
  const defectiveSource = JSON.stringify(collection([
    feature('Bowtie', 'BT', 'ADM1', {
      type: 'Polygon',
      coordinates: [[[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]],
    }),
  ]));

  try {
    fs.writeFileSync(validPath, validSource);
    const validAudit = auditRawTopology(validPath, 1);
    assert.deepEqual(validAudit.errors, []);
    assert.equal(fs.readFileSync(validPath, 'utf8'), validSource);

    fs.writeFileSync(defectivePath, defectiveSource);
    const defectiveAudit = auditRawTopology(defectivePath, 1);
    assert.match(defectiveAudit.errors.join(' '), /defective polygon ring/);
    assert.equal(fs.readFileSync(defectivePath, 'utf8'), defectiveSource);
  } finally {
    fs.unlinkSync(validPath);
    fs.unlinkSync(defectivePath);
    fs.rmdirSync(directory);
  }
});

test('districts receive a spatially derived parent and processed layers require parent data', () => {
  const joined = assignDistrictParents(collection([state]), collection([district]));
  assert.equal(joined.features[0].properties.stateName, 'Test State');
  assert.equal(joined.features[0].properties.stateCode, 'IN-TS');

  const stateOutput = collection([normalizeStateFeature(state)]);
  const districtOutput = collection([normalizeDistrictFeature(joined.features[0])]);
  assert.deepEqual(validateProcessedCollection(stateOutput, 'state'), []);
  assert.deepEqual(validateProcessedCollection(districtOutput, 'district'), []);
});

test('district parent assignment rejects orphaned or ambiguous geometries', () => {
  const outside = feature('Outside District', 'OUT', 'ADM2', {
    type: 'Polygon',
    coordinates: [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]],
  });
  assert.throws(() => assignDistrictParents(collection([state]), collection([outside])), /strict spatial-sample majority/);
});

test('block and GP boundary validation requires verified LGD codes and existing parent codes', () => {
  const parent = collection([{
    type: 'Feature',
    properties: { name: 'Parent district', code: 'D1', codeScheme: 'LGD', level: 'district' },
    geometry: district.geometry,
  }]);
  const blockLayer = collection([{
    type: 'Feature',
    properties: {
      name: 'Block',
      code: 'B1',
      codeScheme: 'LGD',
      parentCode: 'D1',
      parentCodeScheme: 'LGD',
      level: 'block',
    },
    geometry: district.geometry,
  }]);
  assert.deepEqual(validateHierarchyLayer(blockLayer, { level: 'block', parentCollection: parent }), []);
  const orphan = structuredClone(blockLayer);
  orphan.features[0].properties.parentCode = 'UNKNOWN';
  assert.match(
    validateHierarchyLayer(orphan, { level: 'block', parentCollection: parent }).join(' '),
    /unknown LGD parent code/
  );
});

test('administrative areas support future LGD-coded block and GP hierarchy without accepting orphans', async () => {
  const source = { dataset: 'verified test', url: 'https://example.gov.in/boundaries', license: 'Test', accessedAt: new Date() };
  const block = new AdministrativeArea({
    level: 'block',
    name: 'Block',
    code: 'B1',
    codeScheme: 'LGD',
    source,
  });
  await assert.rejects(block.validate(), /require a district parent code/);
  const gp = new AdministrativeArea({
    level: 'gramPanchayat',
    name: 'GP',
    code: 'G1',
    codeScheme: 'LGD',
    parentCode: 'B1',
    parentCodeScheme: 'LGD',
    source,
  });
  await assert.doesNotReject(gp.validate());
});
