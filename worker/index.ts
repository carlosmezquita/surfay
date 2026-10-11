import { createAuth } from './auth'
import { guardLastAdmin } from './authorization'
import {
  adminReports,
  adminSpots,
  adminSummary,
  archiveAdminSpot,
  moderateReport,
  publishAdminSpot,
  updateAdminSpot,
} from './admin'
import type { Env } from './env'
import { forecastSummaryResponse, pruneForecasts, refreshForecast, spotForecastResponse } from './forecast'
import { json, methodNotAllowed, notFound } from './http'
import { createReport, entitlements, listMyReports } from './reports'

async function fetchHandler(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/api/auth/')) {
    const guard = await guardLastAdmin(request, env)
    return guard ?? createAuth(env).handler(request)
  }

  if (url.pathname === '/api/admin/summary') {
    return request.method === 'GET' ? adminSummary(request, env) : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/admin/spots') {
    return request.method === 'GET' || request.method === 'POST'
      ? adminSpots(request, env)
      : methodNotAllowed('GET, POST')
  }

  const spotRoute = url.pathname.match(/^\/api\/admin\/spots\/([^/]+)(?:\/(publish|archive))?$/)
  if (spotRoute) {
    const id = decodeURIComponent(spotRoute[1])
    if (!spotRoute[2]) return request.method === 'PATCH' ? updateAdminSpot(request, env, id) : methodNotAllowed('PATCH')
    if (spotRoute[2] === 'publish') return request.method === 'POST' ? publishAdminSpot(request, env, id) : methodNotAllowed('POST')
    return request.method === 'POST' ? archiveAdminSpot(request, env, id) : methodNotAllowed('POST')
  }

  if (url.pathname === '/api/admin/reports') {
    return request.method === 'GET' ? adminReports(request, env) : methodNotAllowed('GET')
  }

  const reportRoute = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/)
  if (reportRoute) {
    return request.method === 'PATCH'
      ? moderateReport(request, env, decodeURIComponent(reportRoute[1]))
      : methodNotAllowed('PATCH')
  }

  if (url.pathname === '/api/health') {
    return request.method === 'GET'
      ? json({ ok: true, service: 'surfay-api' })
      : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/forecast/summary') {
    return request.method === 'GET' ? forecastSummaryResponse(env, ctx) : methodNotAllowed('GET')
  }

  const spotForecastRoute = url.pathname.match(/^\/api\/forecast\/([^/]+)$/)
  if (spotForecastRoute) {
    return request.method === 'GET'
      ? spotForecastResponse(env, decodeURIComponent(spotForecastRoute[1]), ctx)
      : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/forecast') {
    return request.method === 'GET' ? forecastSummaryResponse(env, ctx) : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/reports') {
    return request.method === 'POST' ? createReport(request, env) : methodNotAllowed('POST')
  }

  if (url.pathname === '/api/reports/me') {
    return request.method === 'GET' ? listMyReports(request, env) : methodNotAllowed('GET')
  }

  if (url.pathname === '/api/me/entitlements') {
    return request.method === 'GET' ? entitlements(request, env) : methodNotAllowed('GET')
  }

  return notFound()
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      return await fetchHandler(request, env, ctx)
    } catch (error) {
      if (String(error).includes('SURFAY_LAST_ADMIN')) {
        return json({ error: 'The last active administrator cannot be demoted or banned' }, { status: 409 })
      }
      if (error instanceof URIError) return json({ error: 'Invalid route encoding' }, { status: 400 })
      console.error('Request failed', error)
      return json({ error: 'The request could not be completed' }, { status: 500 })
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil((async () => {
      try {
        await refreshForecast(env)
        await pruneForecasts(env)
      } catch (error) {
        console.error('Scheduled forecast refresh failed', error)
      }
    })())
  },
} satisfies ExportedHandler<Env>

