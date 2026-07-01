/**
 * Hook de instrumentación de Next: `register()` se ejecuta una vez al arrancar
 * cada instancia del servidor (antes de servir peticiones). Lo usamos para
 * aplicar las migraciones de Drizzle pendientes en el arranque, de modo que cada
 * despliegue (que reinicia la app) deje el esquema al día automáticamente.
 *
 * - Sólo corre en el runtime Node (no en Edge).
 * - Si algo falla, se registra el error pero NO se relanza: preferimos que la
 *   app arranque (y quede visible el fallo en logs) antes que entrar en un bucle
 *   de reinicios. Las migraciones son idempotentes, así que reintenta al próximo
 *   arranque.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { runMigrations } = await import('./lib/db/migrate')
    await runMigrations()
  } catch (err) {
    console.error('[instrumentation] fallo al aplicar migraciones:', err)
  }
}
