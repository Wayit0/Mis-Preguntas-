import { test, expect, type Page } from '@playwright/test'

// Recorrido mobile-friendly: viewport de iPhone 13 (390×844) sobre el mismo
// servidor real (build + start en :3100) y Postgres/Azurite de prueba que usan
// los demás specs. En cada pantalla clave se verifica que NO haya overflow
// horizontal (scrollWidth ≤ clientWidth) y que los controles principales sean
// visibles y clickeables. El shell ya colapsa el sidebar en un drawer (botón ☰),
// así que aquí también se valida esa navegación móvil.
//
// Se fija sólo el viewport (390×844) y `hasTouch`, sin el descriptor completo
// `devices['iPhone 13']`: ese descriptor cambia el navegador a WebKit, mientras
// que el proyecto de Playwright corre en Chromium. Los breakpoints de Tailwind
// son por ancho, así que el viewport basta para validar el layout móvil.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

// Falla si el documento desborda horizontalmente el viewport.
async function assertSinOverflowHorizontal(page: Page, donde: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(
    scrollWidth,
    `overflow horizontal en ${donde} (scrollWidth=${scrollWidth} > clientWidth=${clientWidth})`,
  ).toBeLessThanOrEqual(clientWidth)
}

test('móvil: registro → dashboard → Mis Preguntas → nueva pregunta → Crear Prueba sin overflow', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `Movil ${sufijo}`
  const email = `movil${sufijo}@x.cl`
  const password = 'clave-segura-123'
  const enunciado = `Pregunta desde móvil [${sufijo}]`

  // 1. Login (registro): el card no se desborda y los campos/botón son usables.
  await page.goto('/registro')
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeVisible()
  await assertSinOverflowHorizontal(page, '/registro')

  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // 2. Dashboard: aparece el botón ☰ (sidebar colapsado en móvil), sin overflow.
  await expect(
    page.getByRole('heading', { name: `Hola, ${nombre}` }),
  ).toBeVisible()
  const botonMenu = page.getByRole('button', { name: 'Abrir menú', exact: true })
  await expect(botonMenu).toBeVisible()
  await assertSinOverflowHorizontal(page, '/dashboard')

  // 3. Ir a "Mis Preguntas" usando el drawer móvil (botón ☰).
  await botonMenu.click()
  const nav = page.getByRole('navigation', { name: 'Secciones' })
  await nav.getByRole('link', { name: 'Mis Preguntas' }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await expect(
    page.getByRole('link', { name: /Nueva pregunta/ }),
  ).toBeVisible()
  await assertSinOverflowHorizontal(page, '/preguntas')

  // 4. Abrir el formulario de nueva pregunta: controles visibles y clickeables.
  await page.goto('/preguntas/nueva?asignatura=F%C3%ADsica')
  await expect(
    page.getByRole('heading', { name: /Agregar pregunta/ }),
  ).toBeVisible()
  await expect(page.locator('#pregunta')).toBeVisible()
  await expect(page.locator('#alt-A')).toBeVisible()
  const guardar = page.getByRole('button', { name: 'Guardar pregunta' })
  await expect(guardar).toBeVisible()
  await expect(guardar).toBeEnabled()
  await assertSinOverflowHorizontal(page, '/preguntas/nueva')

  // Crear una pregunta para poblar la pantalla de Crear Prueba.
  await page.locator('#materia').fill('Mecánica')
  await page.locator('#pregunta').fill(enunciado)
  await page.locator('#alt-A').fill('Alternativa A')
  await page.locator('#alt-B').fill('Alternativa B')
  await guardar.click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await expect(page.getByText(enunciado)).toBeVisible()
  await assertSinOverflowHorizontal(page, '/preguntas (con tarjeta)')

  // 5. Abrir Crear Prueba: la pregunta aparece y el botón Generar PDF es usable.
  await page.goto('/prueba?asignatura=F%C3%ADsica')
  await expect(
    page.getByRole('heading', { name: /Crear Prueba/ }),
  ).toBeVisible()
  await expect(page.getByText(enunciado)).toBeVisible()
  const generar = page.getByRole('button', { name: /Generar PDF/ })
  await expect(generar).toBeVisible()
  await expect(generar).toBeEnabled()
  await assertSinOverflowHorizontal(page, '/prueba')
})
