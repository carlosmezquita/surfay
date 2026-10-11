import type { ShorelineExposureProfile } from '../domain/forecast'
import type { SpotDraft } from '../domain/spotAdmin'

type Progress = { progress: number; stage: string }

export function calculateShorelineExposure(
  spot: Pick<SpotDraft, 'latitude' | 'longitude' | 'shoreFacingDeg'>,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
) {
  return new Promise<ShorelineExposureProfile>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/shoreline.worker.ts', import.meta.url), { type: 'module' })
    const requestId = crypto.randomUUID()
    const cleanup = () => worker.terminate()
    const abort = () => { cleanup(); reject(new DOMException('Calculation cancelled', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
      if (event.data.requestId !== requestId) return
      if (event.data.type === 'progress') onProgress({ progress: Number(event.data.progress), stage: String(event.data.stage) })
      if (event.data.type === 'complete') { cleanup(); resolve(event.data.profile as ShorelineExposureProfile) }
      if (event.data.type === 'error') { cleanup(); reject(new Error(String(event.data.error))) }
    }
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'Exposure worker failed')) }
    worker.postMessage({ type: 'calculate', requestId, spot })
  })
}
