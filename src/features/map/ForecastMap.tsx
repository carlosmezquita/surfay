import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl'
import type { SpotProfile } from '../../domain/forecast'

type ForecastMapProps = {
  spots: SpotProfile[]
  activeSlug: string
  scores: Record<string, number>
  focus: { slug: string; tick: number } | null
  onSelect: (slug: string) => void
}

const GALICIA_PILOT_BOUNDS: [[number, number], [number, number]] = [
  [-8.96, 43.22],
  [-8.01, 43.7],
]

const CLUSTER_MAX_ZOOM = 14
const CLUSTER_RADIUS = 50
const CLUSTER_LAYER_ID = 'spots-clusters-query'
const SPOT_LAYER_ID = 'spots-unclustered-query'

export function ForecastMap({ spots, activeSlug, scores, focus, onSelect }: ForecastMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, Marker>())
  const onSelectRef = useRef(onSelect)
  const scoresRef = useRef(scores)
  const activeSlugRef = useRef(activeSlug)
  const markerFrameRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    scoresRef.current = scores
    activeSlugRef.current = activeSlug
    onSelectRef.current = onSelect
  }, [activeSlug, onSelect, scores])

  const spotsById = useMemo(() => {
    const byId = new Map<string, SpotProfile>()
    for (const spot of spots) byId.set(spot.slug, spot)
    return byId
  }, [spots])

  const updateSpotMarkers = useCallback(() => {
    const currentScores = scoresRef.current
    const currentActive = activeSlugRef.current

    for (const [key, marker] of markersRef.current) {
      if (!key.startsWith('spot:')) continue
      const slug = key.slice(5)
      const root = marker.getElement()
      const button = root.querySelector<HTMLButtonElement>('button')
      const scoreEl = button?.querySelector('span')
      const displayScore = currentScores[slug] ?? 1
      const isActive = slug === currentActive

      // MapLibre adds its own `maplibregl-marker` class to this element. Never
      // replace the full className here: removing that class also removes the
      // absolute positioning that keeps the DOM marker attached to the map.
      root.classList.toggle('is-active', isActive)
      if (button) {
        button.className = `surf-map-marker score-${displayScore}${isActive ? ' is-active' : ''}`
      }
      if (scoreEl) scoreEl.textContent = String(displayScore)
    }
  }, [])

  const syncMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(CLUSTER_LAYER_ID) || !map.getLayer(SPOT_LAYER_ID)) return

    const nextKeys = new Set<string>()
    const seenSpots = new Set<string>()
    const spotFeatures = map.queryRenderedFeatures({ layers: [SPOT_LAYER_ID] })

    for (const feature of spotFeatures) {
      const props = feature.properties as
        | { slug?: string; name?: string; longitude?: number; latitude?: number }
        | undefined
      if (
        !props?.slug ||
        !props.name ||
        typeof props.longitude !== 'number' ||
        typeof props.latitude !== 'number' ||
        seenSpots.has(props.slug)
      ) continue
      seenSpots.add(props.slug)

      const key = `spot:${props.slug}`
      // Source-tile feature geometry can be wrapped. These properties come
      // directly from the catalogue and remain the pin's canonical location.
      const coords: [number, number] = [props.longitude, props.latitude]
      const displayScore = scoresRef.current[props.slug] ?? 1
      const isActive = props.slug === activeSlugRef.current
      nextKeys.add(key)

      let marker = markersRef.current.get(key)
      if (!marker) {
        const markerRoot = document.createElement('div')
        markerRoot.className = `surf-map-marker-root${isActive ? ' is-active' : ''}`

        const button = document.createElement('button')
        button.type = 'button'
        button.className = `surf-map-marker score-${displayScore}${isActive ? ' is-active' : ''}`
        button.setAttribute('aria-label', `${props.name}: ${displayScore} de 5`)

        const scoreEl = document.createElement('span')
        scoreEl.textContent = String(displayScore)
        const labelEl = document.createElement('small')
        labelEl.textContent = props.name
        button.append(scoreEl, labelEl)
        button.addEventListener('click', () => onSelectRef.current(props.slug!))
        markerRoot.append(button)

        marker = new maplibregl.Marker({
          element: markerRoot,
          anchor: 'center',
          subpixelPositioning: true,
        })
          .setLngLat([coords[0], coords[1]])
          .addTo(map)
        markersRef.current.set(key, marker)
      } else {
        marker.setLngLat([coords[0], coords[1]])
      }
    }

    const clusterFeatures = map.queryRenderedFeatures({ layers: [CLUSTER_LAYER_ID] })
    const seenClusters = new Set<number>()

    for (const feature of clusterFeatures) {
      const props = feature.properties as
        | { cluster_id?: number; point_count?: number; maxScore?: number; sumScore?: number }
        | undefined
      if (props?.cluster_id === undefined || !props.point_count || seenClusters.has(props.cluster_id)) continue
      seenClusters.add(props.cluster_id)

      const key = `cluster:${props.cluster_id}`
      const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates
      const count = props.point_count
      const bestScore = Math.round(props.maxScore ?? 1)
      const avgScore = Math.round(((props.sumScore ?? count) / count) * 10) / 10
      nextKeys.add(key)

      let marker = markersRef.current.get(key)
      if (!marker) {
        const markerRoot = document.createElement('div')
        markerRoot.className = 'surf-map-marker-root is-cluster'

        const button = document.createElement('button')
        button.type = 'button'
        button.className = `surf-map-cluster score-${bestScore}`
        button.setAttribute('aria-label', `${count} spots agrupados, mejor puntuación ${bestScore} de 5`)
        button.title = `${count} spots · media ${avgScore} de 5`

        const scoreEl = document.createElement('span')
        scoreEl.textContent = String(bestScore)
        const countEl = document.createElement('small')
        countEl.textContent = `×${count}`
        button.append(scoreEl, countEl)
        button.addEventListener('click', () => {
          const source = map.getSource('spots-source') as maplibregl.GeoJSONSource | undefined
          if (!source) return
          source.getClusterExpansionZoom(props.cluster_id!).then((zoom) => {
            const currentPosition = markersRef.current.get(key)?.getLngLat()
            if (!currentPosition) return
            map.easeTo({
              center: currentPosition,
              zoom: Math.min(zoom + 0.5, CLUSTER_MAX_ZOOM),
            })
          })
        })
        markerRoot.append(button)

        marker = new maplibregl.Marker({
          element: markerRoot,
          anchor: 'center',
          subpixelPositioning: true,
        })
          .setLngLat([coords[0], coords[1]])
          .addTo(map)
        markersRef.current.set(key, marker)
      } else {
        marker.setLngLat([coords[0], coords[1]])
        const button = marker.getElement().querySelector<HTMLButtonElement>('button')
        const scoreEl = button?.querySelector('span')
        const countEl = button?.querySelector('small')
        if (button) {
          button.className = `surf-map-cluster score-${bestScore}`
          button.title = `${count} spots · media ${avgScore} de 5`
        }
        if (scoreEl) scoreEl.textContent = String(bestScore)
        if (countEl) countEl.textContent = `×${count}`
      }
    }

    for (const [key, marker] of markersRef.current) {
      if (nextKeys.has(key)) continue
      marker.remove()
      markersRef.current.delete(key)
    }
  }, [])

  const scheduleMarkerSync = useCallback(() => {
    if (markerFrameRef.current !== null) return
    markerFrameRef.current = window.requestAnimationFrame(() => {
      markerFrameRef.current = null
      syncMarkers()
    })
  }, [syncMarkers])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-8.48, 43.42],
      zoom: 8.5,
      minZoom: 7.6,
      maxZoom: 15,
      attributionControl: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    const bottomPadding = window.innerWidth < 760 ? Math.round(window.innerHeight * 0.42) : 54
    map.fitBounds(GALICIA_PILOT_BOUNDS, {
      padding: { top: 84, bottom: bottomPadding, left: 28, right: 28 },
      duration: 0,
    })

    map.on('load', () => {
      map.addSource('spots-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
        clusterProperties: {
          maxScore: ['max', ['get', 'score']],
          sumScore: ['+', ['get', 'score']],
        },
      })
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: 'spots-source',
        filter: ['has', 'point_count'],
        paint: { 'circle-radius': 1, 'circle-opacity': 0 },
      })
      map.addLayer({
        id: SPOT_LAYER_ID,
        type: 'circle',
        source: 'spots-source',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': 1, 'circle-opacity': 0 },
      })

      map.on('move', scheduleMarkerSync)
      map.on('moveend', scheduleMarkerSync)
      map.on('sourcedata', (event) => {
        if (event.sourceId === 'spots-source' && event.isSourceLoaded) scheduleMarkerSync()
      })
      setIsReady(true)
    })

    mapRef.current = map
    const markers = markersRef.current
    return () => {
      if (markerFrameRef.current !== null) window.cancelAnimationFrame(markerFrameRef.current)
      for (const marker of markers.values()) marker.remove()
      markers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [scheduleMarkerSync])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady || !focus) return
    const spot = spotsById.get(focus.slug)
    if (!spot) return
    const narrow = window.innerWidth < 760
    map.easeTo({
      center: [spot.longitude, spot.latitude],
      duration: 650,
      padding: narrow
        ? { top: 0, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 }
        : { top: 0, bottom: 0, left: 460, right: 0 },
    })
  }, [focus, isReady, spotsById])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return
    const source = map.getSource('spots-source') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    source.setData({
      type: 'FeatureCollection',
      features: spots.map((spot) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [spot.longitude, spot.latitude] },
        properties: {
          slug: spot.slug,
          name: spot.name,
          longitude: spot.longitude,
          latitude: spot.latitude,
          score: scores[spot.slug] ?? 1,
        },
      })),
    })
  }, [spots, scores, isReady])

  useEffect(() => {
    if (!isReady) return
    updateSpotMarkers()
  }, [activeSlug, scores, isReady, updateSpotMarkers])

  return (
    <div className="forecast-map-shell" aria-label="Mapa interactivo de spots de surf">
      <div ref={containerRef} className="forecast-map-canvas" />
      {!isReady && <div className="forecast-map-loading" aria-hidden="true" />}
    </div>
  )
}
