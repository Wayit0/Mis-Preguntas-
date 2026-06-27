import { test, expect, type Page } from '@playwright/test'

// Registra un usuario nuevo y deja la sesión iniciada en /dashboard.
async function registrar(page: Page): Promise<{ nombre: string; email: string }> {
  const sufijo = Date.now()
  const nombre = `Profe ${sufijo}`
  const email = `shell${sufijo}@x.cl`
  const password = 'clave-segura-123'

  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  return { nombre, email }
}

// Las 7 secciones del sidebar (5 en "Trabajo" + 2 en "Red").
const SECCIONES = [
  'Mis Preguntas',
  'Banco Compartido',
  'Agregar Pregunta',
  'Mis Textos',
  'Crear Prueba',
  'Colaboradores',
  'Importar Documento',
]

test('sin sesión, /dashboard redirige a /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()
})

test('con sesión, el sidebar muestra las 7 secciones y el selector de asignatura', async ({
  page,
}) => {
  await registrar(page)

  const nav = page.getByRole('navigation', { name: 'Secciones' })
  for (const seccion of SECCIONES) {
    await expect(nav.getByRole('link', { name: seccion })).toBeVisible()
  }

  await expect(
    page.getByRole('button', { name: 'Cambiar asignatura' }),
  ).toBeVisible()
})

test('elegir asignatura agrega ?asignatura= y se conserva al navegar', async ({
  page,
}) => {
  await registrar(page)

  // Elegir "Lenguaje" en el selector de asignatura del topbar.
  await page.getByRole('button', { name: 'Cambiar asignatura' }).click()
  await page.getByRole('menuitem', { name: 'Lenguaje' }).click()
  await expect(page).toHaveURL(/[?&]asignatura=Lenguaje\b/)

  // Navegar a "Mis Preguntas" conserva el contexto de asignatura.
  const nav = page.getByRole('navigation', { name: 'Secciones' })
  await nav.getByRole('link', { name: 'Mis Preguntas' }).click()
  await expect(page).toHaveURL(/\/preguntas\?asignatura=Lenguaje\b/)
})
