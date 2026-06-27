import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// prepare:false es requerido para poolers en modo transacción (p. ej. PgBouncer
// / Azure) y evita problemas con prepared statements en serverless.
const client = postgres(process.env.DATABASE_URL!, { prepare: false })

export const db = drizzle(client, { schema })
