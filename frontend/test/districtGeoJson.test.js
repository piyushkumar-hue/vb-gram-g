import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateStateMetrics,
  areaReportingState,
  districtJoinKey,
  NO_DATA_COLOR,
  rateColor,
  validateAdminGeoJson,
  validCoordinates,
  ZERO_REPORT_COLOR,
} from '../src/domain/districtGeoJson.js'

test('administrative boundary interface validates state and district feature properties', () => {
  assert.match(validateAdminGeoJson(null, 'state'), /No boundary GeoJSON/)
  assert.match(validateAdminGeoJson({ type: 'FeatureCollection', features: [] }, 'district'), /contains no features/)
  assert.match(validateAdminGeoJson({
    type: 'FeatureCollection',
    features: [{ properties: {}, geometry: { type: 'Point', coordinates: [] } }],
  }, 'district'), /name, source identifier, parent/)
})

test('district coordinate validation rejects malformed or out-of-range coordinate arrays', () => {
  assert.equal(validCoordinates([]), false)
  assert.equal(validCoordinates([181, 40]), false)
  assert.equal(validCoordinates([[[-80, 40], [-181, 41]]]), false)
})

test('district metrics join names consistently and distinguish missing data', () => {
  assert.equal(districtJoinKey(' Madhya Pradesh ', 'JABALPUR'), districtJoinKey('madhya pradesh', 'Jabalpur'))
  assert.equal(districtJoinKey('Tamil Nādu', 'Coimbatore'), districtJoinKey('Tamil Nadu', 'Coimbatore'))
  assert.equal(rateColor(null, 'completionRate'), NO_DATA_COLOR)
  assert.notEqual(rateColor(90, 'completionRate'), rateColor(90, 'delayRate'))
  assert.equal(areaReportingState(undefined, true), 'noData')
  assert.equal(areaReportingState({ count: 0, reported: true }, true), 'zero')
  assert.equal(areaReportingState({ count: 4 }, true), 'hasData')
  assert.equal(areaReportingState(undefined, false), 'unavailable')
  assert.notEqual(ZERO_REPORT_COLOR, NO_DATA_COLOR)
})

test('state metrics aggregate actual district totals and rates without inventing zero data', () => {
  const [state] = aggregateStateMetrics([
    { state: 'Madhya Pradesh', count: 10, completed: 5, ongoing: 3, delayed: 2, expenditure: 500 },
    { state: 'Madhya Pradesh', count: 5, completed: 2, ongoing: 1, delayed: 1, expenditure: 250 },
  ])
  assert.equal(state.count, 15)
  assert.equal(state.completed, 7)
  assert.equal(state.ongoing, 4)
  assert.equal(state.delayed, 3)
  assert.equal(state.expenditure, 750)
  assert.equal(state.completionRate, (7 / 15) * 100)
})

test('one district zero report does not label its whole state as reported zero', () => {
  const [state] = aggregateStateMetrics([
    {
      state: 'Madhya Pradesh',
      count: 0,
      completed: 0,
      ongoing: 0,
      delayed: 0,
      expenditure: 0,
      reported: true,
    },
  ])
  assert.equal(state.count, 0)
  assert.equal(state.reported, undefined)
  assert.equal(areaReportingState(state, true), 'noData')
  assert.equal(
    areaReportingState({ count: 0, reported: true }, true),
    'zero'
  )
})
