import { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { accessControl, appRoles } from '../src/domain/permissions'

/**
 * Better Auth CLI-only configuration.
 *
 * D1 and Bun's SQLite use the same SQL dialect, so this file lets Better Auth
 * generate its canonical schema without coupling the Worker runtime to Bun.
 */
export const auth = betterAuth({
  database: new Database(':memory:'),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [admin({ ac: accessControl, roles: appRoles, defaultRole: 'user', adminRoles: ['admin'] })],
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
})
