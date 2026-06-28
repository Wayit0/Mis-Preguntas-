import { test, expect } from '@playwright/test'

// Flujo de "Importar Documento con IA": registro, subir un documento, ver las
// preguntas detectadas (la IA está MOCKEADA vía la variable de entorno
// IMPORT_AI_FAKE, que hace que detectarPreguntas devuelva un fixture sin llamar
// al API real de Anthropic), confirmar y verificar que aparecen en Mis Preguntas.
//
// El servidor bajo prueba se arranca con IMPORT_AI_FAKE=1 en el entorno.

// PNG 1×1 transparente: basta como documento de imagen soportado (su contenido
// es irrelevante porque la detección está mockeada).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test('importar: subir documento → preguntas detectadas (IA mockeada) → guardar → Mis Preguntas', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `Importa ${sufijo}`
  const email = `import${sufijo}@x.cl`
  const password = 'clave-segura-123'

  // 1. Registro → queda autenticado en /dashboard.
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // 2. Ir a Importar con contexto de asignatura.
  await page.goto('/importar?asignatura=F%C3%ADsica')
  await expect(
    page.getByRole('heading', { name: /Importar Documento/ }),
  ).toBeVisible()

  // 3. Subir un documento (imagen) y analizar.
  await page
    .locator('input[name="archivo"]')
    .setInputFiles({ name: 'prueba.png', mimeType: 'image/png', buffer: PNG_1x1 })
  await page.getByRole('button', { name: 'Analizar documento' }).click()

  // 4. Ver las preguntas detectadas (el fixture trae 2).
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()
  await expect(page.getByLabel('Enunciado').first()).toHaveValue(
    /unidad de fuerza/,
  )

  // 5. Confirmar el guardado en lote.
  await page.getByRole('button', { name: /Guardar 2 preguntas/ }).click()

  // 6. Redirige a Mis Preguntas y aparecen ambas preguntas importadas.
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await expect(page.getByText(/unidad de fuerza/)).toBeVisible()
  await expect(page.getByText(/primera ley de Newton/)).toBeVisible()
})
