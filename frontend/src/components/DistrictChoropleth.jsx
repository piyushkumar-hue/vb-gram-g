import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GeoJSON, MapContainer, useMap } from 'react-leaflet'
import {
  aggregateStateMetrics,
  areaReportingState,
  districtJoinKey,
  MAP_METRICS,
  metricValue,
  NO_DATA_COLOR,
  normalizeDistrictName,
  rateColor,
  validateAdminGeoJson,
  ZERO_REPORT_COLOR,
} from '../domain/districtGeoJson'

const STATE_DATA_URL = '/data/geo/states.geojson'
const DISTRICT_DATA_URL = '/data/geo/districts.geojson'

function FitBounds({ layerRef, data }) {
  const map = useMap()

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const bounds = layer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 8 })
  }, [data, layerRef, map])

  return null
}

function formatMetric(value, metric) {
  if (!Number.isFinite(value)) return '—'
  if (metric === 'completionRate' || metric === 'delayRate') return `${value.toFixed(1)}%`
  if (metric === 'expenditure') return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  return Math.round(value).toLocaleString('en-IN')
}

function stateMetricKey(state) {
  return normalizeDistrictName(state)
}

export default function DistrictChoropleth({
  active,
  districts,
  selectedState,
  selectedDistrict,
  hasSummary,
  onSelectState,
  onSelectDistrict,
  onBack,
}) {
  const [statesGeoJson, setStatesGeoJson] = useState(null)
  const [districtsGeoJson, setDistrictsGeoJson] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [metric, setMetric] = useState('completionRate')
  const layerRef = useRef(null)
  const requestsRef = useRef({ states: null, districts: null })
  const featureConfigRef = useRef({})
  const metrics = useMemo(
    () => selectedState ? districts : aggregateStateMetrics(districts),
    [districts, selectedState]
  )
  const districtByName = useMemo(
    () => new Map(districts.map((district) => [districtJoinKey(district.state, district.name), district])),
    [districts]
  )
  const stateByName = useMemo(
    () => new Map(aggregateStateMetrics(districts).map((state) => [stateMetricKey(state.name), state])),
    [districts]
  )
  const displayedFeatures = useMemo(() => {
    if (!selectedState) return statesGeoJson?.features || []
    return (districtsGeoJson?.features || []).filter(
      (feature) => normalizeDistrictName(feature.properties.stateName) === normalizeDistrictName(selectedState)
    )
  }, [districtsGeoJson, selectedState, statesGeoJson])
  const displayedGeoJson = useMemo(
    () => ({ type: 'FeatureCollection', features: displayedFeatures }),
    [displayedFeatures]
  )
  const error = loadError ||
    (selectedState
      ? validateAdminGeoJson(displayedGeoJson, 'district')
      : validateAdminGeoJson(displayedGeoJson, 'state'))
  const metricMaximum = Math.max(1, ...metrics.map((area) => area[metric]).filter(Number.isFinite))

  useEffect(() => {
    featureConfigRef.current = {
      selectedState,
      selectedDistrict,
      districtByName,
      stateByName,
      metric,
      metricMaximum,
      hasSummary,
      onSelectState,
      onSelectDistrict,
    }
  }, [districtByName, hasSummary, metric, metricMaximum, onSelectDistrict, onSelectState, selectedDistrict, selectedState, stateByName])

  const metricArea = useCallback((feature, config = featureConfigRef.current) => {
    const properties = feature.properties || {}
    return config.selectedState
      ? config.districtByName.get(districtJoinKey(properties.stateName, properties.name))
      : config.stateByName.get(stateMetricKey(properties.name))
  }, [])

  const featureStyle = useCallback((feature) => {
    const config = featureConfigRef.current
    const properties = feature.properties || {}
    const area = metricArea(feature, config)
    const state = areaReportingState(area, config.hasSummary)
    const selected = config.selectedDistrict &&
      normalizeDistrictName(config.selectedDistrict) === normalizeDistrictName(properties.name)
    return {
      color: selected ? '#26384f' : '#ffffff',
      weight: selected ? 2 : config.selectedState ? 0.7 : 1,
      fillColor: state === 'zero'
        ? ZERO_REPORT_COLOR
        : state === 'hasData'
          ? rateColor(metricValue(area, config.metric), config.metric, config.metricMaximum)
          : NO_DATA_COLOR,
      fillOpacity: state === 'hasData' || state === 'zero' ? 0.84 : 0.7,
    }
  }, [metricArea])

  useEffect(() => {
    if (layerRef.current) layerRef.current.setStyle(featureStyle)
  }, [districtByName, featureStyle, hasSummary, metric, metricMaximum, selectedDistrict, selectedState, stateByName])

  useEffect(() => {
    if (!active || statesGeoJson || requestsRef.current.states) return
    const controller = new AbortController()
    const requests = requestsRef.current
    requests.states = controller
    fetch(STATE_DATA_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('State boundary file request failed.')
        return response.json()
      })
      .then((data) => {
        const validation = validateAdminGeoJson(data, 'state')
        if (validation) throw new Error(validation)
        setStatesGeoJson(data)
        setLoadError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setLoadError(requestError.message)
      })
      .finally(() => {
        if (requests.states === controller) requests.states = null
      })
    return () => {
      controller.abort()
      if (requests.states === controller) requests.states = null
    }
  }, [active, retryCount, statesGeoJson])

  useEffect(() => {
    if (!active || !selectedState || districtsGeoJson || requestsRef.current.districts) return
    const controller = new AbortController()
    const requests = requestsRef.current
    requests.districts = controller
    fetch(DISTRICT_DATA_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('District boundary file request failed.')
        return response.json()
      })
      .then((data) => {
        const validation = validateAdminGeoJson(data, 'district')
        if (validation) throw new Error(validation)
        setDistrictsGeoJson(data)
        setLoadError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setLoadError(requestError.message)
      })
      .finally(() => {
        if (requests.districts === controller) requests.districts = null
      })
    return () => {
      controller.abort()
      if (requests.districts === controller) requests.districts = null
    }
  }, [active, districtsGeoJson, retryCount, selectedState])

  const loading = active && (!statesGeoJson || (selectedState && !districtsGeoJson))
  if (!active) {
    return <div className="boundary-map-empty">Open GIS &amp; geography to load boundary files.</div>
  }

  if (loading) {
    return <div className="boundary-map-empty" role="status"><strong>Loading administrative boundaries</strong><span>Boundary GeoJSON is fetched only when the map is opened.</span></div>
  }

  if (error) {
    return (
      <div className="boundary-map-empty" role="alert">
        <strong>Boundary map unavailable</strong>
        <span>{error}</span>
        <button className="button secondary" onClick={() => { setLoadError(''); setRetryCount((count) => count + 1) }}>
          Retry boundary load
        </button>
      </div>
    )
  }

  function featureEvents(feature, layer) {
    const properties = feature.properties || {}
    function refreshTooltip() {
      const config = featureConfigRef.current
      const area = metricArea(feature, config)
      const status = areaReportingState(area, config.hasSummary)
      const lines = [
        properties.name,
        config.selectedState ? properties.stateName : '',
        status === 'hasData'
          ? `${area.count} recorded works`
          : status === 'zero'
            ? 'Reported: zero works for selected period'
            : status === 'unavailable'
              ? 'Work metrics are not available'
              : 'No work records yet / not reported',
        status === 'hasData'
          ? `${MAP_METRICS[config.metric]}: ${formatMetric(area[config.metric], config.metric)}`
          : '',
        status === 'hasData'
          ? `Completed ${area.completed || 0} · Ongoing ${area.ongoing || 0} · Delayed ${area.delayed || 0}`
          : '',
        status === 'hasData' ? `Expenditure ${formatMetric(area.expenditure, 'expenditure')}` : '',
        status === 'zero' && area.reportedAt
          ? `Submitted ${new Date(area.reportedAt).toLocaleDateString('en-IN')} by ${area.reportedBy || 'user unavailable'}`
          : '',
      ].filter(Boolean)
      const tooltip = document.createElement('div')
      lines.forEach((line, index) => {
        if (index) tooltip.append(document.createElement('br'))
        tooltip.append(document.createTextNode(line))
      })
      layer.bindTooltip(tooltip)
    }
    refreshTooltip()
    layer.on('mouseover', refreshTooltip)
    layer.on('click', () => {
      const config = featureConfigRef.current
      if (config.selectedState) {
        config.onSelectDistrict({ state: properties.stateName, name: properties.name })
      } else {
        config.onSelectState(properties.name)
      }
    })
  }

  return (
    <div className="district-choropleth" data-testid="admin-choropleth">
      <div className="choropleth-toolbar">
        <div className="choropleth-breadcrumb">
          <button onClick={onBack} aria-label="Back to India">India</button>
          {selectedState && <><span>›</span><button onClick={() => onSelectState(selectedState)}>{selectedState}</button></>}
          {selectedDistrict && <><span>›</span><strong>{selectedDistrict}</strong></>}
        </div>
        <label>
          <span className="sr-only">Map metric</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {Object.entries(MAP_METRICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <MapContainer
        center={[22.5, 79]}
        zoom={4}
        scrollWheelZoom={false}
        className="district-choropleth-map"
        key={selectedState || 'india'}
      >
        <GeoJSON
          key={selectedState ? 'districts' : 'states'}
          ref={layerRef}
          data={displayedGeoJson}
          style={featureStyle}
          onEachFeature={featureEvents}
        />
        <FitBounds layerRef={layerRef} data={displayedGeoJson} />
      </MapContainer>
      <div className="choropleth-legend" aria-label="Map legend">
        <span><i className="legend-has-data" />Has recorded works</span>
        <span><i className="legend-zero" />Reported zero works</span>
        <span><i className="legend-no-data" />No data / not yet reported</span>
      </div>
      <div className="boundary-source">
        <strong>Boundary source:</strong> geoBoundaries ADM1 (DataMeet / Election Commission-derived, CC BY 2.5 IN) and ADM2 (Pathways Data, sourced from LGD, ODbL 1.0), snapshot built 12 Dec 2023. Third-party redistributed data, not government-verified; district boundaries are simplified and may be outdated or disputed. Source ADM2 metadata reports 736 units; the pinned GeoJSON contains 735, versus 784 districts shown on the LGD portal. Block and Gram Panchayat boundaries are unavailable, so drill-down stops at district.
      </div>
    </div>
  )
}
