import { defineConfig, configDefaults } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    // Los tests E2E (Playwright) viven en tests/e2e y se corren con
    // `playwright test`, no con vitest.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
})
