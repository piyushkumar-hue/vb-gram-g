const crypto = require('node:crypto');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const booleanValid = require('@turf/boolean-valid').default;
const pointOnFeature = require('@turf/point-on-feature').default;
const findSelfIntersections = require('geojson-polygon-self-intersections');

const SOURCE_COUNTS = { ADM1: 36, ADM2: 735 };
const API_REPORTED_COUNTS = { ADM1: 36, ADM2: 736 };
const CRS84_NAMES = new Set([
  'urn:ogc:def:crs:OGC:1.3:CRS84',
  'urn:ogc:def:crs:EPSG::4326',
  'EPSG:4326',
]);

function geometryCoordinates(geometry) {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'
    ? geometry.coordinates
    : null;
}

function coordinateBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  function visit(value) {
    if (Array.isArray(value) && typeof value[0] === 'number') {
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  }
  visit(geometryCoordinates(geometry));
  return bounds;
}

function boundsContain(bounds, point) {
  const [longitude, latitude] = point.geometry.coordinates;
  return longitude >= bounds[0] && longitude <= bounds[2] &&
    latitude >= bounds[1] && latitude <= bounds[3];
}

function sourceCode(feature, level) {
  return level === 'ADM1' ? feature?.properties?.shapeISO : feature?.properties?.shapeID;
}

function displayName(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hasSelfIntersection(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((coordinates) => {
    const polygon = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } };
    return findSelfIntersections(polygon).geometry.coordinates.length > 0;
  });
}

function hasClosedRings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.every((polygon) =>
    Array.isArray(polygon) &&
    polygon.length > 0 &&
    polygon.every((ring) =>
      Array.isArray(ring) &&
      ring.length >= 4 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
    )
  );
}

function validateCollection(collection, {
  level,
  expectedCount,
  requireParent = false,
  checkTopology = true,
}) {
  const errors = [];
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { errors: ['Expected a GeoJSON FeatureCollection.'], count: 0 };
  }

  const crsName = collection.crs?.properties?.name;
  if (crsName && !CRS84_NAMES.has(crsName)) {
    errors.push(`Unsupported CRS "${crsName}"; boundaries must use WGS84 longitude/latitude.`);
  }
  if (collection.features.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} ${level} features in the pinned source file; found ${collection.features.length}.`);
  }

  const sourceIds = new Set();
  const geometryHashes = new Set();
  collection.features.forEach((feature, index) => {
    const properties = feature?.properties || {};
    const code = sourceCode(feature, level);
    if (
      feature?.type !== 'Feature' ||
      !String(properties.shapeName || '').trim() ||
      !String(code || '').trim() ||
      properties.shapeGroup !== 'IND' ||
      properties.shapeType !== level
    ) {
      errors.push(`${level} feature ${index + 1} is missing its source name, identifier, country, or level.`);
      return;
    }
    if (requireParent && (!properties.stateName || !properties.stateCode)) {
      errors.push(`${level} feature ${index + 1} has no matched parent state.`);
    }

    const id = String(code).trim();
    if (sourceIds.has(id)) errors.push(`${level} contains duplicate source identifier "${id}".`);
    sourceIds.add(id);

    const geometry = feature.geometry;
    const coordinates = geometryCoordinates(geometry);
    if (
      !coordinates ||
      !['Polygon', 'MultiPolygon'].includes(geometry.type) ||
      !coordinatesHaveWgs84(coordinates) ||
      !hasClosedRings(geometry)
    ) {
      errors.push(`${level} feature ${index + 1} has invalid or non-WGS84 polygon coordinates.`);
      return;
    }
    if (checkTopology) {
      try {
        if (!booleanValid(feature) || hasSelfIntersection(geometry)) {
          errors.push(`${level} feature ${index + 1} has invalid polygon topology.`);
        }
      } catch {
        errors.push(`${level} feature ${index + 1} could not be checked for polygon validity.`);
      }
    }

    const digest = crypto
      .createHash('sha256')
      .update(`${String(properties.shapeName).trim().toLocaleLowerCase('en')}\u0000${JSON.stringify(geometry)}`)
      .digest('hex');
    if (geometryHashes.has(digest)) errors.push(`${level} contains a duplicate feature geometry for "${properties.shapeName}".`);
    geometryHashes.add(digest);
  });

  return { errors, count: collection.features.length };
}

function coordinatesHaveWgs84(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return false;
  if (typeof coordinates[0] === 'number') {
    return coordinates.length >= 2 &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1]) &&
      coordinates[0] >= -180 &&
      coordinates[0] <= 180 &&
      coordinates[1] >= -90 &&
      coordinates[1] <= 90;
  }
  return coordinates.every(coordinatesHaveWgs84);
}

function assignDistrictParents(states, districts) {
  const stateFeatures = states.features.map((feature) => ({
    feature,
    bounds: coordinateBounds(feature.geometry),
  }));
  return {
    ...districts,
    features: districts.features.map((district) => {
      const bounds = coordinateBounds(district.geometry);
      const width = bounds[2] - bounds[0];
      const height = bounds[3] - bounds[1];
      const step = Math.max(0.002, Math.min(0.05, Math.sqrt((width * height) / 400)));
      const points = [];
      for (let longitude = bounds[0] + step / 2; longitude < bounds[2]; longitude += step) {
        for (let latitude = bounds[1] + step / 2; latitude < bounds[3]; latitude += step) {
          const point = {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
          };
          if (booleanPointInPolygon(point, district)) points.push(point);
        }
      }
      if (!points.length) {
        points.push(pointOnFeature(district));
      }
      const votes = new Map();
      let matchedPoints = 0;
      for (const point of points) {
        const candidates = stateFeatures.filter(({ bounds }) => boundsContain(bounds, point));
        const parents = candidates.filter(({ feature }) => booleanPointInPolygon(point, feature));
        if (parents.length === 1) {
          const parentId = parents[0].feature.properties.shapeID;
          const vote = votes.get(parentId) || { feature: parents[0].feature, count: 0 };
          vote.count += 1;
          votes.set(parentId, vote);
          matchedPoints += 1;
        }
      }
      const rankedParents = [...votes.values()].sort((left, right) => right.count - left.count);
      const winner = rankedParents[0];
      if (
        !winner ||
        winner.count <= matchedPoints / 2
      ) {
        throw new Error(
          `Could not assign district "${district.properties.shapeName}" to a state with a strict spatial-sample majority.`
        );
      }
      const parent = winner.feature;
      return {
        ...district,
        properties: {
          ...district.properties,
          stateName: parent.properties.shapeName,
          stateCode: parent.properties.shapeISO,
          stateCodeScheme: 'ISO 3166-2 (geoBoundaries source); not LGD',
          stateParentMatchRatio: matchedPoints ? winner.count / matchedPoints : 0,
          stateParentMethod: `point-in-polygon sample grid; step <= 0.05 degrees`,
        },
      };
    }),
  };
}

function normalizeStateFeature(feature) {
  return normalizeAreaFeature(feature, 'state');
}

function normalizeAreaFeature(feature, level) {
  const isState = level === 'state';
  return {
    type: 'Feature',
    id: feature.properties.shapeID,
    properties: {
      name: displayName(feature.properties.shapeName),
      sourceName: feature.properties.shapeName,
      boundaryId: feature.properties.shapeID,
      code: isState ? feature.properties.shapeISO : feature.properties.shapeID,
      codeScheme: isState
        ? 'ISO 3166-2 (geoBoundaries source); not LGD'
        : 'geoBoundaries shapeID; not LGD',
      level,
    },
    geometry: feature.geometry,
  };
}

function normalizeDistrictFeature(feature) {
  const normalized = normalizeAreaFeature(feature, 'district');
  return {
    ...normalized,
    properties: {
      ...normalized.properties,
      stateName: displayName(feature.properties.stateName),
      stateCode: feature.properties.stateCode,
      stateCodeScheme: feature.properties.stateCodeScheme,
      stateParentMatchRatio: feature.properties.stateParentMatchRatio,
      stateParentMethod: feature.properties.stateParentMethod,
    },
  };
}

function validateProcessedCollection(collection, level) {
  const errors = [];
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return ['Expected a processed GeoJSON FeatureCollection.'];
  }
  errors.push(...validateCrs(collection));
  const ids = new Set();
  collection.features.forEach((feature, index) => {
    const properties = feature.properties || {};
    if (!properties.name || !properties.boundaryId || !properties.code || properties.level !== level) {
      errors.push(`${level} output feature ${index + 1} is missing required name/code properties.`);
    }
    if (level === 'district' && (!properties.stateName || !properties.stateCode)) {
      errors.push(`District output feature ${index + 1} has no parent state.`);
    }
    if (ids.has(properties.boundaryId)) errors.push(`${level} output has duplicate boundary ID "${properties.boundaryId}".`);
    ids.add(properties.boundaryId);
    try {
      if (
        !geometryCoordinates(feature.geometry) ||
        !coordinatesHaveWgs84(feature.geometry.coordinates) ||
        !hasClosedRings(feature.geometry) ||
        !booleanValid(feature) ||
        hasSelfIntersection(feature.geometry)
      ) {
        errors.push(`${level} output feature ${index + 1} has invalid polygon geometry.`);
      }
    } catch {
      errors.push(`${level} output feature ${index + 1} could not be checked for polygon validity.`);
    }
  });
  return errors;
}

function validateHierarchyLayer(collection, { level, parentCollection }) {
  const errors = [];
  const expectedParentLevel = { block: 'district', gramPanchayat: 'block' }[level];
  if (!expectedParentLevel) return [`Unsupported deeper administrative level "${level}".`];
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return ['Expected a GeoJSON FeatureCollection.'];
  }
  errors.push(...validateCrs(collection));
  const parentCodes = new Set(
    (parentCollection?.features || [])
      .filter((feature) => feature.properties?.codeScheme === 'LGD')
      .map((feature) => String(feature.properties.code))
  );
  if (!parentCodes.size) errors.push(`A parent ${expectedParentLevel} GeoJSON with LGD codes is required.`);
  const codes = new Set();
  const features = new Set();
  collection.features.forEach((feature, index) => {
    const properties = feature?.properties || {};
    if (
      feature?.type !== 'Feature' ||
      properties.level !== level ||
      !String(properties.name || '').trim() ||
      !String(properties.code || '').trim() ||
      properties.codeScheme !== 'LGD' ||
      !String(properties.parentCode || '').trim() ||
      properties.parentCodeScheme !== 'LGD'
    ) {
      errors.push(`${level} feature ${index + 1} must include name, LGD code, and LGD parentCode properties.`);
      return;
    }
    if (!parentCodes.has(String(properties.parentCode))) {
      errors.push(`${level} feature ${index + 1} references an unknown LGD parent code.`);
    }
    if (codes.has(String(properties.code))) errors.push(`${level} contains duplicate LGD code "${properties.code}".`);
    codes.add(String(properties.code));
    const geometry = feature.geometry;
    if (
      !geometryCoordinates(geometry) ||
      !coordinatesHaveWgs84(geometry.coordinates) ||
      !hasClosedRings(geometry)
    ) {
      errors.push(`${level} feature ${index + 1} has invalid WGS84 polygon coordinates.`);
      return;
    }
    try {
      if (!booleanValid(feature) || hasSelfIntersection(geometry)) {
        errors.push(`${level} feature ${index + 1} has invalid polygon topology.`);
      }
    } catch {
      errors.push(`${level} feature ${index + 1} could not be checked for polygon validity.`);
    }
    const digest = crypto
      .createHash('sha256')
      .update(`${String(properties.code)}\u0000${JSON.stringify(geometry)}`)
      .digest('hex');
    if (features.has(digest)) errors.push(`${level} contains duplicate geometry for LGD code "${properties.code}".`);
    features.add(digest);
  });
  return errors;
}

function validateCrs(collection) {
  const crsName = collection.crs?.properties?.name;
  if (!crsName || CRS84_NAMES.has(crsName)) return [];
  return [`Unsupported CRS "${crsName}"; expected WGS84 longitude/latitude.`];
}

module.exports = {
  API_REPORTED_COUNTS,
  SOURCE_COUNTS,
  assignDistrictParents,
  hasSelfIntersection,
  normalizeDistrictFeature,
  normalizeAreaFeature,
  normalizeStateFeature,
  validateCollection,
  validateCrs,
  validateHierarchyLayer,
  validateProcessedCollection,
};
