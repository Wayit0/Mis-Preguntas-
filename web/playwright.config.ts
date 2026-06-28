import { defineConfig, devices } from '@playwright/test'

// El puerto 3000 está ocupado por otro proyecto en este entorno; usamos el 3100
// tanto para el server bajo prueba como para baseURL y BETTER_AUTH_URL.
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build de producción + arranque en el puerto dedicado (3100). El server
    // hereda el entorno del proceso de Playwright (DATABASE_URL,
    // BETTER_AUTH_SECRET, BETTER_AUTH_URL), por lo que las pruebas corren contra
    // el Postgres de prueba levantado por el runbook de la Fase 2.
    //
    // Nota: pnpm 10 reenvía el separador `--` de forma literal, por lo que
    // `pnpm start -- -p 3100` ejecuta `next start -- -p 3100` y next interpreta
    // `-p` como directorio. Invocamos `next start` directamente vía `pnpm exec`
    // (equivalente y robusto) para arrancar de verdad en el puerto 3100.
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    // En E2E se registran varias cuentas seguidas desde la misma IP (localhost);
    // desactivamos el rate limiting de better-auth sólo para el server de prueba
    // (lib/auth.ts respeta DISABLE_RATE_LIMIT). Hereda el resto del entorno.
    env: { ...process.env, DISABLE_RATE_LIMIT: '1' },
  },
})
