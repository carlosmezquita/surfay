import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsLeftRight, Compass, Eye, EyeSlash, MapTrifold, SpinnerGap, Waves, WarningCircle } from '@phosphor-icons/react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { ShorelineExposureProfile } from '../../domain/forecast'
import { loadNearbyShoreline, type ShorelineLayer, type ShorelineTileSegment } from '../../services/shorelineTiles'

const normalize = (value: number) => ((value % 360) + 360) % 360
const difference = (first: number, second: number) => 180 - Math.abs(Math.abs(normalize(first) - normalize(second)) - 180)

function compass(bearing: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(normalize(bearing) / 45) % 8]
}

function pointAt(latitude: number, longitude: number, bearing: number, metres: number): [number, number] {
  const radians = bearing * Math.PI / 180
  const latitudeDelta = Math.cos(radians) * metres / 111_320
  const longitudeDelta = Math.sin(radians) * metres / (111_320 * Math.cos(latitude * Math.PI / 180))
  return [longitude + longitudeDelta, latitude + latitudeDelta]
}

function guidanceData(latitude: number, longitude: number, shoreFacingDeg: number, profile: ShorelineExposureProfile | null): FeatureCollection {
  const centre: [number, number] = [longitude, latitude]
  const tangent = normalize(shoreFacingDeg + 90)
  const features: Array<Feature<Geometry>> = [
    { type: 'Feature', properties: { kind: 'coast' }, geometry: { type: 'LineString', coordinates: [pointAt(latitude, longitude, tangent, 1_050), pointAt(latitude, longitude, tangent + 180, 1_050)] } },
    { type: 'Feature', properties: { kind: 'sea' }, geometry: { type: 'LineString', coordinates: [centre, pointAt(latitude, longitude, shoreFacingDeg, 950)] } },
    { type: 'Feature', properties: { kind: 'sea-tip' }, geometry: { type: 'Point', coordinates: pointAt(latitude, longitude, shoreFacingDeg, 950) } },
  ]
  if (profile) {
    const ring = profile.transmission.map((transmission, index) => pointAt(
      latitude, longitude, index * profile.intervalDeg, 230 + transmission * 920,
    ))
    ring.push(ring[0])
    features.unshift({ type: 'Feature', properties: { kind: 'exposure' }, geometry: { type: 'Polygon', coordinates: [ring] } })
  }
  return { type: 'FeatureCollection', features }
}

function coastlineData(segments: ShorelineTileSegment[]): FeatureCollection {
  const features = (['natural', 'artificial', 'low_water'] as ShorelineLayer[]).flatMap((layer) => {
    const layerSegments = segments.filter((segment) => segment[5] === layer)
    return layerSegments.length ? [{
      type: 'Feature' as const, properties: { layer },
      geometry: { type: 'MultiLineString' as const, coordinates: layerSegments.map((segment) => [[segment[1], segment[2]], [segment[3], segment[4]]]) },
    }] : []
  })
  return {
    type: 'FeatureCollection',
    features,
  }
}

function setShorelineLayerVisibility(map: MapLibreMap, masterVisible: boolean, layers: Record<ShorelineLayer, boolean>) {
  const set = (ids: string[], visible: boolean) => ids.forEach((id) => map.setLayoutProperty(id, 'visibility', masterVisible && visible ? 'visible' : 'none'))
  set(['admin-coast-natural-halo', 'admin-coast-natural'], layers.natural)
  set(['admin-coast-artificial-halo', 'admin-coast-artificial'], layers.artificial)
  set(['admin-coast-low-water'], layers.low_water)
}

function addGuidanceLayers(map: MapLibreMap) {
  if (map.getSource('admin-guidance')) return
  map.addSource('admin-coalne-coastline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'admin-coast-natural-halo', type: 'line', source: 'admin-coalne-coastline', filter: ['==', ['get', 'layer'], 'natural'], paint: { 'line-color': '#fff8eb', 'line-width': 5, 'line-opacity': 0.82 } })
  map.addLayer({ id: 'admin-coast-natural', type: 'line', source: 'admin-coalne-coastline', filter: ['==', ['get', 'layer'], 'natural'], paint: { 'line-color': '#176e68', 'line-width': 2.2, 'line-opacity': 0.95 } })
  map.addLayer({ id: 'admin-coast-artificial-halo', type: 'line', source: 'admin-coalne-coastline', filter: ['==', ['get', 'layer'], 'artificial'], paint: { 'line-color': '#fff8eb', 'line-width': 5, 'line-opacity': 0.86 } })
  map.addLayer({ id: 'admin-coast-artificial', type: 'line', source: 'admin-coalne-coastline', filter: ['==', ['get', 'layer'], 'artificial'], paint: { 'line-color': '#d4512c', 'line-width': 2.4, 'line-opacity': 0.98 } })
  map.addLayer({ id: 'admin-coast-low-water', type: 'line', source: 'admin-coalne-coastline', filter: ['==', ['get', 'layer'], 'low_water'], paint: { 'line-color': '#3479a6', 'line-width': 1.7, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } })
  map.addSource('admin-guidance', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'admin-exposure-fill', type: 'fill', source: 'admin-guidance', filter: ['==', ['get', 'kind'], 'exposure'], paint: { 'fill-color': '#2b8078', 'fill-opacity': 0.25 } })
  map.addLayer({ id: 'admin-exposure-edge', type: 'line', source: 'admin-guidance', filter: ['==', ['get', 'kind'], 'exposure'], paint: { 'line-color': '#176e68', 'line-width': 2 } })
  map.addLayer({ id: 'admin-coast-line', type: 'line', source: 'admin-guidance', filter: ['==', ['get', 'kind'], 'coast'], paint: { 'line-color': '#33261a', 'line-width': 4, 'line-dasharray': [2, 1.4] } })
  map.addLayer({ id: 'admin-sea-line', type: 'line', source: 'admin-guidance', filter: ['==', ['get', 'kind'], 'sea'], paint: { 'line-color': '#e05e2b', 'line-width': 3 } })
  map.addLayer({ id: 'admin-sea-tip', type: 'circle', source: 'admin-guidance', filter: ['==', ['get', 'kind'], 'sea-tip'], paint: { 'circle-color': '#e05e2b', 'circle-radius': 6, 'circle-stroke-color': '#fff8eb', 'circle-stroke-width': 2 } })
}

export function SpotCoordinatePicker({ latitude, longitude, shoreFacingDeg, exposure, locale, onChange, onShoreFacingChange }: {
  latitude: number
  longitude: number
  shoreFacingDeg: number
  exposure: ShorelineExposureProfile | null
  locale: 'gl' | 'es'
  onChange: (latitude: number, longitude: number) => void
  onShoreFacingChange: (bearing: number) => void
}) {
  const [showCoastline, setShowCoastline] = useState(true)
  const [visibleLayers, setVisibleLayers] = useState<Record<ShorelineLayer, boolean>>({ natural: true, artificial: true, low_water: false })
  const [coastline, setCoastline] = useState<ShorelineTileSegment[]>([])
  const [coastlineStatus, setCoastlineStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  const latestRef = useRef({ latitude, longitude, shoreFacingDeg, exposure, coastline, showCoastline, visibleLayers })
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { latestRef.current = { latitude, longitude, shoreFacingDeg, exposure, coastline, showCoastline, visibleLayers } }, [latitude, longitude, shoreFacingDeg, exposure, coastline, showCoastline, visibleLayers])

  useEffect(() => {
    if (!showCoastline) return
    let active = true
    const timer = window.setTimeout(() => {
      setCoastlineStatus('loading')
      void loadNearbyShoreline(latitude, longitude).then(({ segments }) => {
        if (!active) return
        setCoastline(segments); setCoastlineStatus('ready')
      }).catch(() => { if (active) setCoastlineStatus('error') })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [latitude, longitude, showCoastline])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const initial = latestRef.current
    const map = new maplibregl.Map({
      container: containerRef.current, style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [initial.longitude, initial.latitude], zoom: 12, minZoom: 6.5, maxZoom: 17, attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    const marker = new maplibregl.Marker({ draggable: true, color: '#c85b3c' }).setLngLat([initial.longitude, initial.latitude]).addTo(map)
    marker.on('dragend', () => {
      const point = marker.getLngLat(); onChangeRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)))
    })
    map.on('click', (event) => {
      marker.setLngLat(event.lngLat); onChangeRef.current(Number(event.lngLat.lat.toFixed(6)), Number(event.lngLat.lng.toFixed(6)))
    })
    map.on('load', () => {
      addGuidanceLayers(map)
      const current = latestRef.current
      ;(map.getSource('admin-guidance') as GeoJSONSource).setData(guidanceData(current.latitude, current.longitude, current.shoreFacingDeg, current.exposure))
      ;(map.getSource('admin-coalne-coastline') as GeoJSONSource).setData(coastlineData(current.coastline))
      setShorelineLayerVisibility(map, current.showCoastline, current.visibleLayers)
    })
    markerRef.current = marker; mapRef.current = map
    return () => { marker.remove(); map.remove(); markerRef.current = null; mapRef.current = null }
  }, [])

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude])
    const source = mapRef.current?.getSource('admin-guidance') as GeoJSONSource | undefined
    source?.setData(guidanceData(latitude, longitude, shoreFacingDeg, exposure))
  }, [latitude, longitude, shoreFacingDeg, exposure])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('admin-coalne-coastline') as GeoJSONSource | undefined
    source?.setData(coastlineData(coastline))
    if (map?.getLayer('admin-coast-natural')) setShorelineLayerVisibility(map, showCoastline, visibleLayers)
  }, [coastline, showCoastline, visibleLayers])

  const coastLineDeg = useMemo(() => normalize(shoreFacingDeg + 90) % 180, [shoreFacingDeg])
  const setCoastLine = (lineBearing: number) => {
    const firstNormal = normalize(lineBearing + 90)
    const secondNormal = normalize(lineBearing - 90)
    onShoreFacingChange(difference(firstNormal, shoreFacingDeg) <= difference(secondNormal, shoreFacingDeg) ? firstNormal : secondNormal)
  }
  const labels = locale === 'gl' ? {
    title: 'Debuxa a orientación da costa', help: 'Xira a liña e comproba que o punto laranxa queda no lado do mar.', rotate: 'Xirar liña de costa', sea: 'Mar cara', offshore: 'Terral desde', flip: 'Cambiar lado terra / mar', map: 'Mapa para colocar o spot e orientar a costa', exposure: 'A área verde usa costa natural + portos. A baixamar é só unha referencia visual.', coastline: 'Capas IHM', coastlineHelp: 'Mostrar ou ocultar as capas para investigar o spot.', loadingCoast: 'Cargando costa', coastError: 'Costa non dispoñible', natural: 'Natural', artificial: 'Portos', low_water: 'Baixamar',
  } : {
    title: 'Dibuja la orientación de la costa', help: 'Gira la línea y comprueba que el punto naranja queda en el lado del mar.', rotate: 'Girar línea de costa', sea: 'Mar hacia', offshore: 'Terral desde', flip: 'Cambiar lado tierra / mar', map: 'Mapa para colocar el spot y orientar la costa', exposure: 'El área verde usa costa natural + puertos. La bajamar es solo una referencia visual.', coastline: 'Capas IHM', coastlineHelp: 'Muestra u oculta las capas para investigar el spot.', loadingCoast: 'Cargando costa', coastError: 'Costa no disponible', natural: 'Natural', artificial: 'Puertos', low_water: 'Bajamar',
  }

  return <div className="admin-orientation-picker">
    <div className="admin-map-stage"><div className="admin-coordinate-map" ref={containerRef} aria-label={labels.map} /><div className={`admin-map-layer-filter${showCoastline ? ' is-active' : ''}`}><button type="button" className="admin-map-layer-toggle" onClick={() => setShowCoastline((visible) => !visible)} title={labels.coastlineHelp} aria-pressed={showCoastline}><MapTrifold weight="bold" /><span><strong>{labels.coastline}</strong><small>{coastlineStatus === 'loading' && showCoastline ? labels.loadingCoast : coastlineStatus === 'error' ? labels.coastError : 'IHM · CC BY 4.0'}</small></span>{coastlineStatus === 'loading' && showCoastline ? <SpinnerGap className="spin" /> : coastlineStatus === 'error' ? <WarningCircle /> : showCoastline ? <Eye /> : <EyeSlash />}</button><div className="admin-map-layer-options">{(['natural', 'artificial', 'low_water'] as ShorelineLayer[]).map((layer) => <button type="button" key={layer} className={visibleLayers[layer] ? 'is-active' : ''} aria-pressed={visibleLayers[layer]} onClick={() => setVisibleLayers((current) => ({ ...current, [layer]: !current[layer] }))}><i className={`is-${layer}`} />{labels[layer]}</button>)}</div></div></div>
    <div className="admin-orientation-controls">
      <div className="admin-orientation-copy"><span><Compass weight="bold" /></span><div><strong>{labels.title}</strong><small>{labels.help}</small></div></div>
      <label className="admin-bearing-range"><span>{labels.rotate}</span><input type="range" min="0" max="179" step="1" value={Math.round(coastLineDeg)} onChange={(event) => setCoastLine(Number(event.target.value))} /><output>{Math.round(coastLineDeg)}°</output></label>
      <div className="admin-orientation-readout"><span><Waves weight="bold" /> {labels.sea} <strong>{compass(shoreFacingDeg)} · {Math.round(shoreFacingDeg)}°</strong></span><span>{labels.offshore} <strong>{compass(shoreFacingDeg + 180)} · {Math.round(normalize(shoreFacingDeg + 180))}°</strong></span></div>
      <button type="button" className="admin-flip-side" onClick={() => onShoreFacingChange(normalize(shoreFacingDeg + 180))}><ArrowsLeftRight weight="bold" /> {labels.flip}</button>
      <p>{labels.exposure}</p>
    </div>
  </div>
}
