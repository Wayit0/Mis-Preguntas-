import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Flujo de "Crear Prueba": registra un usuario, crea 2 preguntas de selección
// múltiple, va a /prueba, las selecciona y genera el PDF, verificando que la
// descarga es realmente un PDF (firma `%PDF`). Corre contra el servidor real
// (build + start) y Postgres/Azurite de prueba.

const ASIGNATURA = 'Física'
const ASIGNATURA_URL = encodeURIComponent(ASIGNATURA)

async function crearPregunta(
  page: Page,
  opts: { materia: string; contenido: string; enunciado: string },
) {
  await page.goto(`/preguntas/nueva?asignatura=${ASIGNATURA_URL}`)
  await expect(
    page.getByRole('heading', { name: /Agregar pregunta/ }),
  ).toBeVisible()

  await page.locator('#materia').fill(opts.materia)
  await page.locator('#contenido').fill(opts.contenido)
  await page.locator('#pregunta').fill(opts.enunciado)
  await page.locator('#alt-A').fill('Alternativa A')
  await page.locator('#alt-B').fill('Alternativa B')
  await page.locator('#alt-C').fill('Alternativa C')
  await page.locator('#alt-D').fill('Alternativa D')
  // La correcta por defecto (A) es suficiente para selección múltiple.

  await page.getByRole('button', { name: 'Guardar pregunta' }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
}

test('registrar → crear 2 preguntas → seleccionar → descargar PDF', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `Profe ${sufijo}`
  const email = `prueba${sufijo}@x.cl`
  const password = 'clave-segura-123'
  const enun1 = `Pregunta uno del set [${sufijo}]`
  const enun2 = `Pregunta dos del set [${sufijo}]`

  // 1. Registro → queda autenticado en /dashboard.
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // 2. Crear 2 preguntas de selección múltiple.
  await crearPregunta(page, {
    materia: 'Mecánica',
    contenido: 'Cinemática',
    enunciado: enun1,
  })
  await crearPregunta(page, {
    materia: 'Mecánica',
    contenido: 'Dinámica',
    enunciado: enun2,
  })

  // 3. Ir a Crear Prueba con contexto de asignatura.
  await page.goto(`/prueba?asignatura=${ASIGNATURA_URL}`)
  await expect(
    page.getByRole('heading', { name: /Crear Prueba/ }),
  ).toBeVisible()

  // Las dos preguntas aparecen en el listado de selección.
  await expect(page.getByText(enun1)).toBeVisible()
  await expect(page.getByText(enun2)).toBeVisible()

  // 4. Seleccionar ambas preguntas (los únicos checkboxes de la página).
  const checkboxes = page.getByRole('checkbox')
  await expect(checkboxes).toHaveCount(2)
  await checkboxes.nth(0).check()
  await checkboxes.nth(1).check()

  // Opciones de encabezado.
  await page.locator('#titulo').fill('Prueba de ejemplo')
  await page.locator('#colegio').fill('Colegio E2E')

  // 5. Generar PDF y verificar que la descarga es un PDF.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Generar PDF/ }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const ruta = await download.path()
  const buffer = readFileSync(ruta)
  expect(buffer.length).toBeGreaterThan(1024)
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
})
