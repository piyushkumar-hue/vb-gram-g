const fs = require('node:fs');
const path = require('node:path');
const simplify = require('@turf/simplify').default;
const {
  validateHierarchyLayer,
  validateProcessedCollection,
} = require('./geoPipeline');

const SUPPORTED_LEVELS = new Set(['block', 'gramPanchayat']);

function processLevel(level, inputPath, parentPath, outputPath) {
  if (!SUPPORTED_LEVELS.has(level)) {
    throw new Error('Level must be "block" or "gramPanchayat".');
  }
  const source = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const parent = JSON.parse(fs.readFileSync(path.resolve(parentPath), 'utf8'));
  const errors = validateHierarchyLayer(source, { level, parentCollection: parent });
  if (errors.length) throw new Error(`Source validation failed: ${errors.join(' ')}`);

  const result = {
    type: 'FeatureCollection',
    name: `India ${level} boundaries`,
    features: source.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        boundaryId: String(feature.properties.code),
      },
      geometry: simplify(feature, { tolerance: 0.0005, highQuality: true }).geometry,
    })),
  };
  const outputErrors = validateProcessedCollection(result, level);
  if (outputErrors.length) throw new Error(`Processed layer validation failed: ${outputErrors.join(' ')}`);

  const target = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(result));
  return { featureCount: result.features.length, bytes: fs.statSync(target).size };
}

if (require.main === module) {
  try {
    const [, , level, inputPath, parentPath, outputPath] = process.argv;
    if (!level || !inputPath || !parentPath || !outputPath) {
      throw new Error(
        'Usage: npm run process-geo-level -- <block|gramPanchayat> <source.geojson> <parent.geojson> <output.geojson>'
      );
    }
    const result = processLevel(level, inputPath, parentPath, outputPath);
    console.log(`Wrote ${result.featureCount} ${level} features (${result.bytes} bytes).`);
  } catch (error) {
    console.error(`Deeper boundary processing failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { processLevel };
