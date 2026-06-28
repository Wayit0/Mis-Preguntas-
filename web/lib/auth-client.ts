import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  // Cliente del plugin admin: habilita authClient.admin.* (listUsers, setRole,
  // ban, hasPermission, etc.) y tipa el campo `role` en la sesión del cliente.
  plugins: [adminClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
