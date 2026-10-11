import { useEffect, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import type { SpotProfile } from '../../domain/forecast'

export function SpotMiniMap({ spot }: { spot: SpotProfile }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [spot.longitude, spot.latitude],
      zoom: 12.8,
      minZoom: 10,
      maxZoom: 16,
      attributionControl: false,
      /* the mini map is a still picture of the coast: zoom is the only gesture */
      dragPan: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      boxZoom: false,
      keyboard: false,
    })
    map.scrollZoom.disable()
    map.touchZoomRotate.disable()
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.getContainer().addEventListener('wheel', (e) => {
      e.preventDefault()
      const delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)
      const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta))
      map.setZoom(zoom)
    }, { passive: false })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [spot.latitude, spot.longitude])

  return <div ref={containerRef} className="spot-mini-map" aria-hidden="true" />
}
