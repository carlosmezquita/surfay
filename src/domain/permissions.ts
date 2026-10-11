import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/admin/access'

export const permissionStatements = {
  ...defaultStatements,
  spot: ['create', 'update', 'publish', 'archive'],
  report: ['create', 'list', 'moderate'],
} as const

export const accessControl = createAccessControl(permissionStatements)

export const userRole = accessControl.newRole({ user: [], session: [], spot: [], report: [] })
export const reporterRole = accessControl.newRole({ user: [], session: [], spot: [], report: ['create'] })
export const adminRole = accessControl.newRole({
  user: ['list', 'get', 'set-role', 'ban'],
  session: [],
  spot: ['create', 'update', 'publish', 'archive'],
  report: ['create', 'list', 'moderate'],
})

export const appRoles = { user: userRole, reporter: reporterRole, admin: adminRole } as const
export type AppRole = keyof typeof appRoles

export function normalizeAppRole(role: unknown): AppRole {
  return role === 'admin' || role === 'reporter' ? role : 'user'
}
