import { appRoles, normalizeAppRole, type AppRole } from '../src/domain/permissions'
import { createAuth } from './auth'
import type { Env } from './env'
import { json } from './http'

export type SessionUser = { id: string; name: string; email: string; role: AppRole }

export async function sessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const session = await createAuth(env).api.getSession({ headers: request.headers })
  if (!session?.user) return null
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: normalizeAppRole(session.user.role) }
}

export function roleCan(role: AppRole, resource: 'spot' | 'report' | 'user', action: string) {
  return appRoles[role].authorize({ [resource]: [action] } as never).success
}

export async function requirePermission(
  request: Request,
  env: Env,
  resource: 'spot' | 'report' | 'user',
  action: string,
) {
  const user = await sessionUser(request, env)
  if (!user) return { response: json({ error: 'Authentication required' }, { status: 401 }), user: null }
  if (!roleCan(user.role, resource, action)) {
    return { response: json({ error: 'Permission denied' }, { status: 403 }), user: null }
  }
  return { response: null, user }
}

export function trustedMutation(request: Request, env: Env) {
  if (request.method === 'GET' || request.method === 'HEAD') return null
  const origin = request.headers.get('Origin')
  const allowed = (env.TRUSTED_ORIGINS ?? env.BETTER_AUTH_URL).split(',').map((item) => item.trim())
  if (!origin || !allowed.includes(origin)) return json({ error: 'Untrusted request origin' }, { status: 403 })
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }
  return null
}

export async function guardLastAdmin(request: Request, env: Env) {
  const url = new URL(request.url)
  const setRole = url.pathname.endsWith('/admin/set-role')
  const banUser = url.pathname.endsWith('/admin/ban-user')
  if (!setRole && !banUser) return null
  const actor = await sessionUser(request, env)
  if (!actor || actor.role !== 'admin') return null
  const body = await request.clone().json().catch(() => null) as { userId?: string; role?: string | string[] } | null
  if (typeof body?.userId !== 'string' || body.userId.length > 128) return null
  const target = await env.DB.prepare('SELECT role, banned FROM user WHERE id = ?').bind(body.userId)
    .first<{ role: string; banned: number }>()
  const removingAdmin = target?.role === 'admin' && (banUser || (setRole && body.role !== 'admin'))
  if (!removingAdmin) return null
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM user WHERE role = 'admin' AND COALESCE(banned, 0) = 0")
    .first<{ total: number }>()
  return (count?.total ?? 0) <= 1
    ? json({ error: 'The last active administrator cannot be demoted or banned' }, { status: 409 })
    : null
}

