import { test, expect } from '@playwright/test'

// Flujo completo de autenticación contra el servidor real (build + start) y una
// base Postgres de prueba. Cada test corre en un contexto limpio (sin cookies).

test('registro → dashboard → cerrar sesión → login → dashboard', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `Profe ${sufijo}`
  const email = `e2e${sufijo}@x.cl`
  const password = 'clave-segura-123'

  // 1. Registro de usuario nuevo.
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  // Queda autenticado y ve "Hola, {nombre}" en /dashboard.
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: `Hola, ${nombre}` }),
  ).toBeVisible()

  // 2. Cerrar sesión → vuelve a /login.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // 3. Iniciar sesión con esas credenciales → /dashboard de nuevo.
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: `Hola, ${nombre}` }),
  ).toBeVisible()
})

test('visitar /dashboard sin sesión redirige a /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})
