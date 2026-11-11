export const MAP_METRICS = {
  completionRate: 'Completion rate',
  delayRate: 'Delay rate',
  count: 'Total works',
  completed: 'Completed works',
  ongoing: 'Ongoing works',
  delayed: 'Delayed works',
  expenditure: 'Expenditure',
}

export const ZERO_REPORT_COLOR = '#557ac7'
export const NO_DATA_COLOR = '#c5cbd3'

export function normalizeDistrictName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('en')
}

export function validCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return false
  if (typeof coordinates[0] === 'number') {
    return coordinates.length >= 2 &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1]) &&
      coordinates[0] >= -180 &&
      coordinates[0] <= 180 &&
      coordinates[1] >= -90 &&
      coordinates[1] <= 90
  }
  return coordinates.every(validCoordinates)
}

function validLinearRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validCoordinates)) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

function validPolygon(coordinates) {
  return Array.isArray(coordinates) &&
    coordinates.length > 0 &&
    coordinates.every(validLinearRing)
}

export function validateAdminGeoJson(data, level) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return 'No boundary GeoJSON is loaded.'
  }
  if (!data.features.length) return 'The boundary GeoJSON contains no features.'
  const seen = new Set()
  for (const feature of data.features) {
    const properties = feature?.properties || {}
    const geometry = feature?.geometry
    const parentMissing = level === 'district' && !String(properties.stateName || '').trim()
    const geometryValid =
      geometry?.type === 'Polygon'
        ? validPolygon(geometry.coordinates)
        : geometry?.type === 'MultiPolygon' &&
          Array.isArray(geometry.coordinates) &&
          geometry.coordinates.length > 0 &&
          geometry.coordinates.every(validPolygon)
    if (
      feature?.type !== 'Feature' ||
      !String(properties.name || '').trim() ||
      !String(properties.code || '').trim() ||
      !String(properties.boundaryId || '').trim() ||
      properties.level !== level ||
      parentMissing ||
      !geometryValid
    ) {
      return `Each ${level} feature must include a name, source identifier, parent where required, and valid WGS84 Polygon or MultiPolygon coordinates.`
    }
    if (seen.has(properties.boundaryId)) return `The ${level} GeoJSON contains duplicate boundary identifiers.`
    seen.add(properties.boundaryId)
  }
  return ''
}

export function districtJoinKey(state, district) {
  return `${normalizeDistrictName(state)}\u0000${normalizeDistrictName(district)}`
}

export function aggregateStateMetrics(districts) {
  const states = new Map()
  for (const district of districts) {
    const key = normalizeDistrictName(district.state)
    if (!key) continue
    if (!states.has(key)) {
      states.set(key, {
        name: district.state,
        count: 0,
        completed: 0,
        ongoing: 0,
        delayed: 0,
        expenditure: 0,
      })
    }
    const entry = states.get(key)
    entry.count += district.count || 0
    entry.completed += district.completed || 0
    entry.ongoing += district.ongoing || 0
    entry.delayed += district.delayed || 0
    entry.expenditure += district.expenditure || 0
  }
  return [...states.values()].map((area) => ({
    ...area,
    completionRate: area.count ? (area.completed / area.count) * 100 : null,
    delayRate: area.count ? (area.delayed / area.count) * 100 : null,
  }))
}

export function metricValue(area, metric) {
  if (!area || !Number.isFinite(area[metric])) return null
  return area[metric]
}

export function rateColor(value, metric, maximum = 100) {
  if (!Number.isFinite(value)) return NO_DATA_COLOR
  if (metric === 'delayRate') {
    if (value >= 60) return '#b42318'
    if (value >= 40) return '#dc6b35'
    if (value >= 20) return '#e8aa46'
    return '#5b9b74'
  }
  if (metric === 'completionRate') {
    if (value >= 80) return '#2c8059'
    if (value >= 60) return '#66a878'
    if (value >= 40) return '#a4bd68'
    if (value >= 20) return '#e0b44f'
    return '#c86f57'
  }
  if (value === 0) return '#f1e7c8'
  const normalized = Math.min(1, value / Math.max(1, maximum))
  const red = Math.round(245 - normalized * 190)
  const green = Math.round(236 - normalized * 65)
  const blue = Math.round(221 - normalized * 115)
  return `rgb(${red}, ${green}, ${blue})`
}

export function areaReportingState(area, hasSummary) {
  if (!hasSummary) return 'unavailable'
  if (area?.reported === true && area.count === 0) return 'zero'
  if (area?.count > 0) return 'hasData'
  return 'noData'
}
