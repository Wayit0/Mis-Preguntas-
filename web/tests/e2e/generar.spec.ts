import { test, expect } from '@playwright/test'

// Flujo de "Crear preguntas con IA": registro, completar parámetros, generar
// (IA MOCKEADA vía GENERAR_AI_FAKE en el entorno del server bajo prueba),
// revisar con disclaimer, guardar y verificar en Mis Preguntas.

test('generar: parámetros → preguntas generadas (IA mockeada) → guardar → Mis Preguntas', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `Genera ${sufijo}`
  const email = `genera${sufijo}@x.cl`
  const password = 'clave-segura-123'

  // 1. Registro → queda autenticado en /dashboard.
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // 2. Ir a Crear con IA.
  await page.goto('/generar?asignatura=F%C3%ADsica')
  await expect(page.getByRole('heading', { name: /Crear con IA/ })).toBeVisible()

  // 3. Completar el formulario y generar.
  await page.locator('#tema').fill('Leyes de Newton')
  await page
    .locator('#que-evaluar')
    .fill('Aplicar la segunda ley en problemas con roce')
  await page.getByRole('button', { name: /Generar preguntas/ }).click()

  // 4. Revisión: 3 preguntas del fixture + disclaimer de IA.
  await expect(page.getByText('3 preguntas generadas')).toBeVisible()
  await expect(
    page.getByText(/generadas por la IA de EduBox/),
  ).toBeVisible()
  await expect(page.getByLabel('Enunciado').first()).toHaveValue(
    /Pregunta generada 1 sobre Leyes de Newton/,
  )

  // 5. Editar una y guardar todas.
  await page
    .getByLabel('Enunciado')
    .first()
    .fill('¿Enunciado editado por el docente? [demo-generar]')
  await page.getByRole('button', { name: 'Guardar 3 preguntas' }).click()

  // 6. Redirige a Mis Preguntas y las preguntas están.
  await expect(page).toHaveURL(/\/preguntas\?asignatura=/)
  await expect(page.getByText(/Enunciado editado por el docente/)).toBeVisible()
})
