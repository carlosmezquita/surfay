export type ConditionReportInput = {
  spotSlug: string
  snapshotId: string
  forecastTime: string
  observedScore: 1 | 2 | 3 | 4 | 5
  observedHeight: 'smaller' | 'matched' | 'larger'
  windMatched: boolean | null
  note: string
}

export type ConditionReportRecord = Omit<ConditionReportInput, 'snapshotId'> & {
  snapshotId: string | null
  id: string
  spotName?: string
  observedAt: string
  submittedAt: string
  moderationStatus: 'pending' | 'accepted' | 'rejected'
}

export type Entitlements = {
  authenticated: boolean
  plan: 'free' | 'member' | 'contributor' | 'admin'
  role: 'user' | 'reporter' | 'admin'
  showAds: boolean
  canReport: boolean
  canAccessAdmin: boolean
}

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Surfay API returned ${response.status}`)
  return payload
}

export function submitConditionReport(input: ConditionReportInput) {
  return api<{ report: ConditionReportRecord }>('/api/reports', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function fetchMyReports() {
  return api<{ reports: ConditionReportRecord[] }>('/api/reports/me')
}

export function fetchEntitlements() {
  return api<Entitlements>('/api/me/entitlements')
}

