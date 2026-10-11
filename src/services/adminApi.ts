import type { AdminSpotRecord, SpotDraft } from '../domain/spotAdmin'
import type { ShorelineExposureProfile } from '../domain/forecast'

export type AdminSummary = {
  users: number; pendingReports: number; spots: { total?: number; published?: number; drafts?: number; archived?: number }
  catalogueVersion: number; latestForecast: { generated_at: string; catalogue_version: number } | null
}
export type AdminReport = {
  id: string; spotSlug: string; spotName?: string; reporter: { name: string; email: string }; observedAt: string; submittedAt: string
  observedScore: number; observedHeight: string; windMatched: boolean | null; note: string
  moderationStatus: 'pending' | 'accepted' | 'rejected'; moderationNote: string
}

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init, credentials: 'include',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  const payload = await response.json() as T & { error?: string; fields?: Record<string, string> }
  if (!response.ok) {
    const error = new Error(payload.error || `Surfay API returned ${response.status}`) as Error & { fields?: Record<string, string> }
    error.fields = payload.fields; throw error
  }
  return payload
}

export const fetchAdminSummary = () => api<AdminSummary>('/api/admin/summary')
export const fetchAdminSpots = () => api<{ spots: AdminSpotRecord[] }>('/api/admin/spots')
export const createAdminSpot = (draft: SpotDraft, exposure: ShorelineExposureProfile | null) => api<{ spot: AdminSpotRecord }>('/api/admin/spots', { method: 'POST', body: JSON.stringify({ draft, exposure }) })
export const updateAdminSpot = (spot: AdminSpotRecord, draft: SpotDraft, exposure: ShorelineExposureProfile | null) => api<{ spot: AdminSpotRecord }>(`/api/admin/spots/${spot.id}`, { method: 'PATCH', body: JSON.stringify({ draft, exposure, revision: spot.revision }) })
export const publishAdminSpot = (id: string, revision: number) => api<{ spot: AdminSpotRecord; catalogueVersion: number }>(`/api/admin/spots/${id}/publish`, { method: 'POST', body: JSON.stringify({ revision }) })
export const archiveAdminSpot = (id: string, revision: number) => api<{ spot: AdminSpotRecord; catalogueVersion: number }>(`/api/admin/spots/${id}/archive`, { method: 'POST', body: JSON.stringify({ revision }) })
export const fetchAdminReports = (status = 'pending', cursor?: string) => api<{ reports: AdminReport[]; nextCursor: string | null }>(`/api/admin/reports?status=${encodeURIComponent(status)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
export const moderateAdminReport = (id: string, status: 'accepted' | 'rejected', note = '') => api<{ ok: true }>(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) })
