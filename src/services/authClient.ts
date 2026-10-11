import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import { accessControl, appRoles } from '../domain/permissions'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [adminClient({ ac: accessControl, roles: appRoles })],
})
