import { describe, expect, it } from 'vitest'
import { adminRole, reporterRole, userRole } from './permissions'

describe('Surfay role permissions', () => {
  it('keeps ordinary users read-only', () => {
    expect(userRole.authorize({ report: ['create'] }).success).toBe(false)
    expect(userRole.authorize({ spot: ['update'] }).success).toBe(false)
    expect(userRole.authorize({ user: ['list'] }).success).toBe(false)
  })

  it('allows reporters to create reports only', () => {
    expect(reporterRole.authorize({ report: ['create'] }).success).toBe(true)
    expect(reporterRole.authorize({ report: ['moderate'] }).success).toBe(false)
    expect(reporterRole.authorize({ spot: ['create'] }).success).toBe(false)
  })

  it('gives admins the safe core without destructive Better Auth actions', () => {
    expect(adminRole.authorize({ user: ['list', 'get', 'set-role', 'ban'] }).success).toBe(true)
    expect(adminRole.authorize({ user: ['delete'] }).success).toBe(false)
    expect(adminRole.authorize({ user: ['impersonate'] }).success).toBe(false)
    expect(adminRole.authorize({ session: ['revoke'] }).success).toBe(false)
    expect(adminRole.authorize({ spot: ['create', 'update', 'publish', 'archive'] }).success).toBe(true)
    expect(adminRole.authorize({ report: ['create', 'list', 'moderate'] }).success).toBe(true)
  })
})
