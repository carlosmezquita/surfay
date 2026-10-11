import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { accessControl, appRoles } from '../src/domain/permissions'
import type { Env } from './env'

function trustedOrigins(env: Env) {
  return (env.TRUSTED_ORIGINS ?? env.BETTER_AUTH_URL)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    plugins: [admin({ ac: accessControl, roles: appRoles, defaultRole: 'user', adminRoles: ['admin'] })],
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
  })
}
