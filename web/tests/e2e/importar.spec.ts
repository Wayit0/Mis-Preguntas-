import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

// Flujo de "Importar Documento con IA": registro, subir un documento, ver las
// preguntas detectadas (la IA está MOCKEADA vía la variable de entorno
// IMPORT_AI_FAKE, que hace que detectarPreguntas devuelva un fixture sin llamar
// al API real de Anthropic), confirmar y verificar que aparecen en Mis Preguntas.
//
// El servidor bajo prueba se arranca con IMPORT_AI_FAKE=1 en el entorno.

// __dirname (no `import.meta.url`): el paquete no declara "type": "module" y
// Playwright carga los .spec.ts vía su hook de require() en modo CommonJS; el
// runtime de Node detecta la sintaxis ESM de `import.meta` en el archivo
// transformado y aborta la carga ("Cannot use 'import.meta' outside a
// module"), sin llegar a ejecutar ningún test del archivo.
const fixturesDir = join(__dirname, '..', 'fixtures')

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

test('importar: DOCX con imagen incrustada → miniatura en revisión → guardar', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `ImportaImg ${sufijo}`
  const email = `importimg${sufijo}@x.cl`
  const password = 'clave-segura-123'

  const docxConImagen = readFileSync(join(fixturesDir, 'sample-con-imagen.docx'))

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

  // 3. Subir un DOCX con una imagen incrustada y analizar. El fixture del IA
  // (IMPORT_AI_FAKE) referencia esa imagen en `imagenPreguntaIndice: 0` de la
  // primera pregunta detectada.
  await page.locator('input[name="archivo"]').setInputFiles({
    name: 'prueba-con-imagen.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docxConImagen,
  })
  await page.getByRole('button', { name: 'Analizar documento' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()

  // 4. La miniatura de la imagen del enunciado aparece en la primera tarjeta.
  await expect(
    page.getByRole('img', { name: /Imagen del enunciado 1/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Quitar imagen' }).first(),
  ).toBeVisible()

  // 5. Guardar → vuelve a Mis Preguntas sin errores.
  await page.getByRole('button', { name: /Guardar 2 preguntas/ }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await expect(page.getByText(/unidad de fuerza/)).toBeVisible()
})

test('importar: recortar imagen a mano en la revisión y restaurar', async ({
  page,
}) => {
  const sufijo = Date.now()
  const email = `importcrop${sufijo}@x.cl`
  const password = 'clave-segura-123'

  const docxConImagen = readFileSync(join(fixturesDir, 'sample-con-imagen.docx'))

  // 1. Registro y análisis del DOCX con imagen (IA mockeada). El fixture trae
  // además `imagenPreguntaRecorte`, pero con la imagen de 4×4 px el recorte
  // server-side queda bajo el mínimo y se ignora: la miniatura es la original.
  await page.goto('/registro')
  await page.locator('#nombre').fill(`ImportaCrop ${sufijo}`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/importar?asignatura=F%C3%ADsica')
  await page.locator('input[name="archivo"]').setInputFiles({
    name: 'prueba-con-imagen.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docxConImagen,
  })
  await page.getByRole('button', { name: 'Analizar documento' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()

  const miniatura = page.getByRole('img', { name: /Imagen del enunciado 1/ })
  await expect(miniatura).toBeVisible()
  const srcOriginal = await miniatura.getAttribute('src')

  // 2. Abrir el diálogo de recorte y dibujar una selección arrastrando.
  await page.getByRole('button', { name: 'Recortar' }).first().click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText('Recortar imagen')).toBeVisible()

  const imagenDialogo = dialogo.getByRole('img', { name: 'Imagen a recortar' })
  const caja = await imagenDialogo.boundingBox()
  if (!caja) throw new Error('la imagen del diálogo no tiene bounding box')
  await page.mouse.move(caja.x + caja.width * 0.15, caja.y + caja.height * 0.15)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width * 0.7, caja.y + caja.height * 0.7, {
    steps: 5,
  })
  await page.mouse.up()

  // 3. Aplicar: la miniatura cambia (base64 distinto al original).
  await dialogo.getByRole('button', { name: 'Aplicar recorte' }).click()
  await expect(dialogo).not.toBeVisible()
  await expect
    .poll(async () => miniatura.getAttribute('src'))
    .not.toBe(srcOriginal)

  // 4. Restaurar: vuelve exactamente a la imagen original.
  await page.getByRole('button', { name: 'Recortar' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar original' }).click()
  await expect
    .poll(async () => miniatura.getAttribute('src'))
    .toBe(srcOriginal)
})

test('importar: el borrador se retoma tras recargar y desaparece al guardar', async ({
  page,
}) => {
  const sufijo = Date.now()
  const password = 'clave-segura-123'

  // 1. Registro y análisis (IA mockeada) con una imagen 1x1.
  await page.goto('/registro')
  await page.locator('#nombre').fill(`Borrador ${sufijo}`)
  await page.locator('#email').fill(`borrador${sufijo}@x.cl`)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.goto('/importar?asignatura=F%C3%ADsica')
  await page
    .locator('input[name="archivo"]')
    .setInputFiles({ name: 'prueba.png', mimeType: 'image/png', buffer: PNG_1x1 })
  await page.getByRole('button', { name: 'Analizar documento' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()

  // 2. Editar el primer enunciado y esperar el auto-guardado (debounce 3 s).
  const enunciado = page.getByLabel('Enunciado').first()
  await enunciado.fill('¿Cuál es la unidad de fuerza? [EDITADO]')
  await page.waitForTimeout(4500)

  // 3. Recargar: el trabajo en curso aparece como borrador retomable.
  await page.reload()
  await expect(page.getByText('Importaciones en curso')).toBeVisible()
  await expect(page.getByText('prueba.png')).toBeVisible()

  // 4. Retomar: la edición sigue tal cual.
  await page.getByRole('button', { name: 'Retomar' }).click()
  await expect(page.getByText('2 preguntas detectadas')).toBeVisible()
  await expect(page.getByLabel('Enunciado').first()).toHaveValue(/\[EDITADO\]/)

  // 5. Guardar: redirige a Mis Preguntas y el borrador desaparece de /importar.
  await page.getByRole('button', { name: /Guardar 2 preguntas/ }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await page.goto('/importar')
  await expect(page.getByText('Importaciones en curso')).not.toBeVisible()
})
