export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function methodNotAllowed(allow: string) {
  return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: allow } })
}

export function notFound() {
  return json({ error: 'Not found' }, { status: 404 })
}


export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json()
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('Expected a JSON object')
  }
  return body as Record<string, unknown>
}
