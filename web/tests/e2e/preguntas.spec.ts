import { test, expect } from '@playwright/test'

// Flujo completo de "Mis Preguntas": registro, alta de una pregunta de selección
// múltiple CON imagen en el enunciado y en una alternativa, marcado de la
// correcta, verla en la lista, filtrar por materia, editarla, compartirla y
// eliminarla. Corre contra el servidor real (build + start) y Postgres/Azurite
// de prueba.

// PNG 1×1 transparente (suficiente para validar la subida a Blob/Azurite).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function imagen(nombre: string) {
  return { name: nombre, mimeType: 'image/png', buffer: PNG_1x1 }
}

test('crear (con imágenes) → listar → filtrar → editar → compartir → eliminar', async ({
  page,
}) => {
  const sufijo = Date.now()
  const nombre = `Profe ${sufijo}`
  const email = `preg${sufijo}@x.cl`
  const password = 'clave-segura-123'
  const enunciado = `¿Cuál es la altura del acantilado? [${sufijo}]`
  const enunciadoEditado = `Enunciado editado del acantilado [${sufijo}]`

  // 1. Registro → queda autenticado en /dashboard.
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // 2. Ir al formulario de nueva pregunta con contexto de asignatura.
  await page.goto('/preguntas/nueva?asignatura=F%C3%ADsica')
  await expect(
    page.getByRole('heading', { name: /Agregar pregunta/ }),
  ).toBeVisible()

  // Clasificación.
  await page.locator('#materia').fill('Mecánica')
  await page.locator('#contenido').fill('Caída libre')

  // Enunciado + imagen del enunciado.
  await page.locator('#pregunta').fill(enunciado)
  await page
    .locator('input[name="imagen_pregunta"]')
    .setInputFiles(imagen('enunciado.png'))

  // Alternativas + imagen en la alternativa A.
  await page.locator('#alt-A').fill('20 m')
  await page.locator('#alt-B').fill('30 m')
  await page.locator('#alt-C').fill('40 m')
  await page.locator('#alt-D').fill('50 m')
  await page.locator('input[name="imagen_A"]').setInputFiles(imagen('a.png'))

  // Marcar la correcta = B.
  await page.getByRole('combobox', { name: 'Respuesta correcta' }).click()
  await page.getByRole('option', { name: 'B', exact: true }).click()

  // Guardar → vuelve a la lista.
  await page.getByRole('button', { name: 'Guardar pregunta' }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)

  // 3. Aparece en la lista, con la materia y la correcta (B) marcada con ✓.
  await expect(page.getByText(enunciado)).toBeVisible()
  await expect(page.getByText('Mecánica · Caída libre')).toBeVisible()
  await expect(page.getByText('20 m')).toBeVisible()
  await expect(page.locator('li', { hasText: '30 m' })).toContainText('✓')

  // 4. Filtrar por materia "Mecánica": sigue visible.
  await page.getByRole('combobox', { name: 'Filtrar por materia' }).click()
  await page.getByRole('option', { name: 'Mecánica', exact: true }).click()
  await expect(page).toHaveURL(/materia=Mec/)
  await expect(page.getByText(enunciado)).toBeVisible()

  // 5. Editar: cambiar el enunciado.
  await page.getByRole('link', { name: /Editar/ }).first().click()
  await expect(page).toHaveURL(/\/editar/)
  await expect(page.locator('#pregunta')).toHaveValue(enunciado)
  await page.locator('#pregunta').fill(enunciadoEditado)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).toHaveURL(/\/preguntas(\?|$)/)
  await expect(page.getByText(enunciadoEditado)).toBeVisible()

  // 6. Compartir: el estado pasa a "Compartida".
  await page.getByRole('button', { name: /Compartir/ }).first().click()
  await expect(page.getByText('● Compartida')).toBeVisible()

  // 7. Eliminar: desaparece de la lista.
  await page.getByRole('button', { name: /Eliminar/ }).first().click()
  await expect(page.getByText(enunciadoEditado)).toHaveCount(0)
})
