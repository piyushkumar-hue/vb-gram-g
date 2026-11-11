const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  SOURCE_COUNTS,
  assignDistrictParents,
  normalizeDistrictFeature,
  normalizeStateFeature,
  validateCollection,
  validateCrs,
  validateProcessedCollection,
} = require('./geoPipeline');
const { validateRawSources } = require('./validateGeo');

const rawDirectory = path.resolve(__dirname, '../../../data/geo/raw');
const sourceSimplifiedDirectory = path.resolve(__dirname, '../../../data/geo/source-simplified');
const outputDirectory = path.resolve(__dirname, '../../../frontend/public/data/geo');

function readSource(filename) {
  return JSON.parse(fs.readFileSync(path.join(rawDirectory, filename), 'utf8'));
}

function readSimplifiedSource(filename) {
  return JSON.parse(fs.readFileSync(path.join(sourceSimplifiedDirectory, filename), 'utf8'));
}

function simplifyWithMapshaper(inputFile, outputFile) {
  const executable = require.resolve('mapshaper/bin/mapshaper');
  execFileSync(
    process.execPath,
    [executable, inputFile, '-simplify', '5%', 'keep-shapes', '-o', 'format=geojson', outputFile],
    { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
  );
}

function processBoundaries() {
  const rawValidation = validateRawSources();
  const rawErrors = rawValidation.flatMap((result) => result.errors);
  if (rawErrors.length) throw new Error(`Raw source validation failed: ${rawErrors.join(' ')}`);

  const states = readSource('geoBoundaries-IND-ADM1.geojson');
  const sourceDistricts = readSource('geoBoundaries-IND-ADM2.geojson');
  const simplifiedStates = readSimplifiedSource('geoBoundaries-IND-ADM1_simplified.geojson');
  const simplifiedDistricts = readSimplifiedSource('geoBoundaries-IND-ADM2_simplified.geojson');
  const simplifiedStateById = new Map(simplifiedStates.features.map((feature) => [feature.properties.shapeID, feature]));
  const simplifiedDistrictById = new Map(simplifiedDistricts.features.map((feature) => [feature.properties.shapeID, feature]));
  const districts = assignDistrictParents(states, sourceDistricts);
  const stateInput = {
    type: 'FeatureCollection',
    name: 'India states and union territories',
    features: states.features.map((feature) => {
      const simplified = simplifiedStateById.get(feature.properties.shapeID);
      if (!simplified) throw new Error(`No publisher-simplified state feature for "${feature.properties.shapeName}".`);
      return normalizeStateFeature({ ...feature, geometry: simplified.geometry });
    }),
  };
  const districtInput = {
    type: 'FeatureCollection',
    name: 'India districts',
    features: districts.features.map((feature) => {
      const simplified = simplifiedDistrictById.get(feature.properties.shapeID);
      if (!simplified) throw new Error(`No publisher-simplified district feature for "${feature.properties.shapeName}".`);
      return normalizeDistrictFeature({ ...feature, geometry: simplified.geometry });
    }),
  };
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-gram-geo-'));
  const stateInputPath = path.join(temporaryDirectory, 'states-input.geojson');
  const districtInputPath = path.join(temporaryDirectory, 'districts-input.geojson');
  const stateOutputPath = path.join(temporaryDirectory, 'states.geojson');
  const districtOutputPath = path.join(temporaryDirectory, 'districts.geojson');
  let stateOutput;
  let districtOutput;
  try {
    fs.writeFileSync(stateInputPath, JSON.stringify(stateInput));
    fs.writeFileSync(districtInputPath, JSON.stringify(districtInput));
    simplifyWithMapshaper(stateInputPath, stateOutputPath);
    simplifyWithMapshaper(districtInputPath, districtOutputPath);
    stateOutput = JSON.parse(fs.readFileSync(stateOutputPath, 'utf8'));
    districtOutput = JSON.parse(fs.readFileSync(districtOutputPath, 'utf8'));
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const errors = [
    ...validateCrs(states),
    ...validateCrs(sourceDistricts),
    ...(stateOutput.features.length === SOURCE_COUNTS.ADM1
      ? []
      : [`Expected ${SOURCE_COUNTS.ADM1} processed state/UT features; found ${stateOutput.features.length}.`]),
    ...(districtOutput.features.length === SOURCE_COUNTS.ADM2
      ? []
      : [`Expected ${SOURCE_COUNTS.ADM2} processed district features; found ${districtOutput.features.length}.`]),
    ...validateProcessedCollection(stateOutput, 'state'),
    ...validateProcessedCollection(districtOutput, 'district'),
  ];
  if (errors.length) throw new Error(`Processed boundary validation failed: ${errors.join(' ')}`);

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'states.geojson'), JSON.stringify(stateOutput));
  fs.writeFileSync(path.join(outputDirectory, 'districts.geojson'), JSON.stringify(districtOutput));
  return {
    states: stateOutput.features.length,
    districts: districtOutput.features.length,
    stateBytes: fs.statSync(path.join(outputDirectory, 'states.geojson')).size,
    districtBytes: fs.statSync(path.join(outputDirectory, 'districts.geojson')).size,
  };
}

if (require.main === module) {
  try {
    const result = processBoundaries();
    console.log(
      `Wrote ${result.states} states/UTs (${result.stateBytes} bytes) and ${result.districts} districts (${result.districtBytes} bytes).`
    );
    console.log('Mapshaper retained 5% of publisher-simplified vertices with keep-shapes. District parents are spatially derived; source files have no LGD codes.');
  } catch (error) {
    console.error(`Boundary processing failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { processBoundaries };
