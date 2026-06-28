/**
 * Ejecuta el backfill de `accounts` credential legacy contra la base apuntada
 * por DATABASE_URL. Idempotente: no duplica si ya existe el account.
 *
 *   DATABASE_URL=postgres://...sslmode=require pnpm dlx tsx scripts/run-backfill.ts
 */
import { db } from '@/lib/db'
import { backfillAccounts } from '@/lib/migration/backfill'

const res = await backfillAccounts(db)
console.log(`backfill accounts -> insertados: ${res.inserted}, omitidos: ${res.skipped}`)
process.exit(0)
