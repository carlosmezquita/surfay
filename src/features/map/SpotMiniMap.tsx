import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import type { SpotProfile } from '../../domain/forecast'
import { useLocale } from '../i18n/localeContext'
import { MapLoadingSurface } from '../loading/PublicPageSkeletons'

export function SpotMiniMap({ spot }: { spot: SpotProfile }) {
  const { t } = useLocale()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retryAttempt, setRetryAttempt] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
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
    } catch {
      const timeout = window.setTimeout(() => setStatus('error'), 0)
      return () => window.clearTimeout(timeout)
    }
    map.on('load', () => setStatus('ready'))
    map.on('error', () => {
      if (!map.isStyleLoaded()) setStatus('error')
    })
    map.scrollZoom.disable()
    map.touchZoomRotate.disable()
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.getContainer().addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)
        const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta))
        map.setZoom(zoom)
      },
      { passive: false },
    )
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [spot.latitude, spot.longitude, retryAttempt])

  return (
    <div className="spot-mini-map">
      <div ref={containerRef} className="spot-mini-map" aria-hidden="true" />
      {status === 'loading' && <MapLoadingSurface compact />}
      {status === 'error' && (
        <div className="map-unavailable" role="status">
          <p>{t('mapUnavailable')}</p>
          <button
            type="button"
            className="account-secondary"
            onClick={() => {
              setStatus('loading')
              setRetryAttempt((attempt) => attempt + 1)
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
    </div>
  )
}
