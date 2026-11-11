const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  API_REPORTED_COUNTS,
  SOURCE_COUNTS,
  validateCollection,
  validateCrs,
} = require('./geoPipeline');

const rawDirectory = path.resolve(__dirname, '../../../data/geo/raw');
const sources = [
  { level: 'ADM1', file: 'geoBoundaries-IND-ADM1.geojson' },
  { level: 'ADM2', file: 'geoBoundaries-IND-ADM2.geojson' },
];

function parseMapshaperTopologyAudit(output, expectedCount) {
  const errors = [];
  const lines = output.split(/\r?\n/);
  const retainedMatch = output.match(/\[clean\]\s+Retained\s+(\d+)\s+of\s+(\d+)\s+features/i);
  const geometryTypeMatch = output.match(/\bType:\s*([^\r\n]+)/i);
  const retainedCount = retainedMatch ? Number(retainedMatch[1]) : null;
  const sourceCount = retainedMatch ? Number(retainedMatch[2]) : null;
  const geometryType = geometryTypeMatch?.[1].trim().toLowerCase() || null;
  const defectiveRings = lines.filter((line) => /skipping a defective ring/i.test(line));
  const findings = lines
    .filter((line) => /^\[clean\]/i.test(line) && !/\bRetained\b/i.test(line))
    .map((line) => line.trim());

  if (!retainedMatch) errors.push('Mapshaper did not report retained/source feature counts.');
  else if (sourceCount !== expectedCount || retainedCount !== expectedCount) {
    errors.push(
      `Mapshaper retained ${retainedCount} of ${sourceCount} features; expected ${expectedCount}.`
    );
  }
  if (geometryType !== 'polygon') {
    errors.push(`Mapshaper reported layer geometry type "${geometryType || 'unknown'}"; expected polygon.`);
  }
  if (defectiveRings.length) {
    errors.push(`Mapshaper skipped ${defectiveRings.length} defective polygon ring(s).`);
  }

  return { errors, findings, retainedCount, sourceCount, geometryType };
}

function auditRawTopology(filename, expectedCount) {
  const executable = require.resolve('mapshaper/bin/mapshaper');
  const result = spawnSync(
    process.execPath,
    [executable, filename, '-clean', '-verbose', '-info'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Mapshaper raw topology audit failed with exit code ${result.status}: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return parseMapshaperTopologyAudit(
    `${result.stdout || ''}\n${result.stderr || ''}`,
    expectedCount
  );
}

function validateRawSources() {
  const results = [];
  for (const source of sources) {
    const filename = path.join(rawDirectory, source.file);
    const collection = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const validation = validateCollection(collection, {
      level: source.level,
      expectedCount: SOURCE_COUNTS[source.level],
      checkTopology: false,
    });
    validation.errors.push(...validateCrs(collection));
    const topology = auditRawTopology(filename, SOURCE_COUNTS[source.level]);
    validation.errors.push(...topology.errors);
    results.push({ ...source, ...validation, topology });
  }
  return results;
}

function main() {
  const results = validateRawSources();
  let failed = false;
  for (const result of results) {
    console.log(`${result.file}: ${result.count} ${result.level} features`);
    console.log(
      `Mapshaper topology audit: ${result.topology.retainedCount}/${result.topology.sourceCount} retained as ${result.topology.geometryType}.`
    );
    for (const finding of result.topology.findings) {
      console.log(`TOPOLOGY CLEANUP FINDING (${result.level}): ${finding}`);
    }
    for (const error of result.errors) {
      failed = true;
      console.error(`ERROR: ${error}`);
    }
    const metadataCount = API_REPORTED_COUNTS[result.level];
    if (result.count !== metadataCount) {
      console.warn(
        `SOURCE METADATA MISMATCH: geoBoundaries API reports ${metadataCount} ${result.level} units; pinned GeoJSON contains ${result.count}.`
      );
    }
  }
  if (failed) process.exitCode = 1;
  else {
    console.log(
      'Raw boundary structure, CRS, identifiers, duplicate features, pinned counts, and Mapshaper topology audits passed. Cleanup findings are reported for review; source files were not modified.'
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Boundary validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  auditRawTopology,
  parseMapshaperTopologyAudit,
  validateRawSources,
};
