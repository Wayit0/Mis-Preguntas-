/**
 * ===========================================================================
 * Migración de datos Render -> Azure (one-shot, idempotente en lo razonable).
 *
 * La base de Azure es NUEVA: los datos viven en el Postgres de Render. Este
 * script orquesta:
 *
 *   1. drizzle-kit migrate  -> crea el esquema en Azure (dominio + tablas
 *      better-auth: sessions/accounts/verifications + columnas añadidas).
 *   2. pg_dump (Render, --data-only --no-owner --no-privileges) de SÓLO las
 *      tablas de dominio (usuarios, preguntas, textos, colaboraciones).
 *   3. psql (Azure) restaura ese dump conservando los IDs.
 *   4. setval(...) reajusta las secuencias serial al MAX(id) de cada tabla.
 *   5. backfillAccounts(azure) -> crea los `accounts` credential legacy.
 *   6. Verificación: imprime conteos origen vs destino por tabla de dominio y
 *      ABORTA (exit 1) si difieren.
 *
 * Variables de entorno requeridas:
 *   RENDER_DATABASE_URL  conexión al Postgres de Render (origen)
 *   AZURE_DATABASE_URL   conexión al Postgres de Azure  (destino)
 *
 * Requiere `pg_dump` y `psql` (cliente de PostgreSQL) en el PATH y `pnpm`.
 *
 * USO (ver runbook completo en web/docs/migracion-azure.md):
 *   RENDER_DATABASE_URL=postgres://... \
 *   AZURE_DATABASE_URL=postgres://...?sslmode=require \
 *   pnpm exec tsx scripts/migrate-render-to-azure.ts
 *
 * AVISO: No ejecutar contra datos reales sin haber leído el runbook y tener un
 * respaldo. El paso de dump/restore MODIFICA la base de Azure.
 * ===========================================================================
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../lib/db/schema'
import { backfillAccounts } from '../lib/migration/backfill'

// Tablas de dominio que se migran (en orden seguro para FKs implícitas).
const DOMAIN_TABLES = [
  'usuarios',
  'preguntas',
  'textos',
  'colaboraciones',
] as const

// Tablas con columna `id` serial cuyas secuencias hay que reajustar tras un
// restore data-only (COPY no avanza la secuencia). `colaboraciones` no tiene
// serial (PK compuesta), por eso queda fuera.
const SERIAL_TABLES = ['usuarios', 'preguntas', 'textos'] as const

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`ERROR: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return v
}

function run(cmd: string, args: string[], env?: Record<string, string>): void {
  console.log(`\n>> ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
    cwd: webDir,
  })
}

/** Conteo de filas por tabla en una conexión dada. */
async function contar(
  sql: ReturnType<typeof postgres>,
  tablas: readonly string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of tablas) {
    // Identificador fijo (lista blanca DOMAIN_TABLES), no input externo.
    const rows = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`)
    out[t] = rows[0].n as number
  }
  return out
}

async function main() {
  const renderUrl = requireEnv('RENDER_DATABASE_URL')
  const azureUrl = requireEnv('AZURE_DATABASE_URL')

  const tmp = mkdtempSync(join(tmpdir(), 'mispreguntas-migracion-'))
  const dumpFile = join(tmp, 'render-data.sql')

  try {
    // --- 1. Esquema en Azure (drizzle-kit migrate) -------------------------
    // drizzle.config.ts lee process.env.DATABASE_URL.
    console.log('== 1/6 Aplicando migraciones Drizzle en Azure ==')
    run('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
      DATABASE_URL: azureUrl,
    })

    // --- 2. pg_dump de Render (sólo datos de dominio) ----------------------
    console.log('== 2/6 pg_dump de Render (data-only) ==')
    const dumpArgs = [
      renderUrl,
      '--data-only',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpFile,
    ]
    for (const t of DOMAIN_TABLES) dumpArgs.push('--table', t)
    run('pg_dump', dumpArgs)

    // --- 3. Restore en Azure (psql) ----------------------------------------
    console.log('== 3/6 Restaurando datos en Azure (psql) ==')
    run('psql', [
      azureUrl,
      '--set',
      'ON_ERROR_STOP=on',
      '--single-transaction',
      '--file',
      dumpFile,
    ])

    // Conexiones drizzle/postgres-js para los pasos en TS (secuencias, backfill,
    // verificación).
    const azureSql = postgres(azureUrl, { prepare: false })
    const renderSql = postgres(renderUrl, { prepare: false })
    const azureDb = drizzle(azureSql, { schema })

    try {
      // --- 4. Reajuste de secuencias --------------------------------------
      console.log('== 4/6 Reajustando secuencias serial en Azure ==')
      for (const t of SERIAL_TABLES) {
        await azureSql.unsafe(
          `SELECT setval(
             pg_get_serial_sequence('"${t}"', 'id'),
             COALESCE((SELECT MAX(id) FROM "${t}"), 1),
             (SELECT MAX(id) FROM "${t}") IS NOT NULL
           )`,
        )
      }

      // --- 5. Backfill de accounts (credential legacy) --------------------
      console.log('== 5/6 Backfill de accounts legacy en Azure ==')
      const res = await backfillAccounts(azureDb)
      console.log(
        `   accounts insertados: ${res.inserted} (omitidos: ${res.skipped})`,
      )

      // --- 6. Verificación de conteos origen vs destino -------------------
      console.log('== 6/6 Verificación de conteos por tabla ==')
      const origen = await contar(renderSql, DOMAIN_TABLES)
      const destino = await contar(azureSql, DOMAIN_TABLES)

      let difieren = false
      for (const t of DOMAIN_TABLES) {
        const ok = origen[t] === destino[t]
        if (!ok) difieren = true
        console.log(
          `   ${ok ? 'OK ' : 'XX '} ${t.padEnd(16)} render=${origen[t]} azure=${destino[t]}`,
        )
      }

      if (difieren) {
        console.error(
          '\nABORTO: los conteos origen vs destino difieren. Revisa el dump/restore.',
        )
        process.exit(1)
      }

      console.log('\nMigración completada: conteos coinciden.')
    } finally {
      await azureSql.end({ timeout: 5 })
      await renderSql.end({ timeout: 5 })
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
