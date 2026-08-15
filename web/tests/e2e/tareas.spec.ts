import { test, expect, type Page } from '@playwright/test'
import postgres from 'postgres'

// E2E del flujo completo de Cursos y Tareas (spec 2026-08-15). Cubre de punta a
// punta lo que las suites de integración prueban por partes:
//  1. El profesor crea un curso por UI y asigna una prueba existente a ese curso
//     desde /mis-pruebas (congela el snapshot, Task 5).
//  2. El estudiante se registra desde /unirse/CODIGO (Task 8), responde la
//     tarea marcando la alternativa correcta y la entrega (Task 6/10).
//  3. El profesor ve la entrega reflejada en /cursos/[id]/tareas/[asigId]
//     (Task 7/11).
//
// Semilla: la pregunta y la prueba del profesor se insertan directo en BD (como
// roles.spec.ts hace con preguntas compartidas) — más rápido y evita depender
// del formulario de creación de preguntas (que sube imágenes a Blob Storage,
// fuera del alcance de este flujo). El curso y la asignación SÍ se crean por UI,
// que es lo que este test existe para probar.

const PASSWORD = 'clave-segura-123'

const sql = postgres(process.env.DATABASE_URL!, { prepare: false })

test.afterAll(async () => {
  await sql.end({ timeout: 5 })
})

async function registrar(page: Page, nombre: string, email: string) {
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('#password2').fill(PASSWORD)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function idDeUsuario(email: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    SELECT id FROM usuarios WHERE email = ${email.toLowerCase()} LIMIT 1
  `
  return row.id
}

/** Inserta 1 pregunta de alternativas (A/B, correcta=B) y 1 prueba que la incluye. */
async function sembrarPreguntaYPrueba(
  userId: number,
  sufijo: number,
): Promise<{ tituloPrueba: string }> {
  const enunciado = `¿Cuánto es 2+2? [${sufijo}]`
  const [pregunta] = await sql<{ id: number }[]>`
    INSERT INTO preguntas (user_id, asignatura, pregunta, "A", "B", correcta, tipo)
    VALUES (${userId}, 'Matemática', ${enunciado}, '3', '4', 'B', 'seleccion_multiple')
    RETURNING id
  `
  const tituloPrueba = `Prueba E2E ${sufijo}`
  await sql`
    INSERT INTO pruebas (user_id, asignatura, titulo, preguntas_ids)
    VALUES (${userId}, 'Matemática', ${tituloPrueba}, ${JSON.stringify([pregunta.id])}::jsonb)
  `
  return { tituloPrueba }
}

async function joinCodeDeCurso(cursoId: number): Promise<string> {
  const [row] = await sql<{ join_code: string }[]>`
    SELECT join_code FROM cursos WHERE id = ${cursoId} LIMIT 1
  `
  return row.join_code
}

test('profesor asigna una prueba, el alumno la responde y el profesor ve el resultado', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)

  const sufijo = Date.now()
  const nombreProfe = `Profe Tareas ${sufijo}`
  const emailProfe = `tareas-profe-${sufijo}@x.cl`
  const nombreCurso = `Curso E2E ${sufijo}`
  const nombreEstudiante = `Alumno Tareas ${sufijo}`
  const emailEstudiante = `tareas-alumno-${sufijo}@x.cl`

  // --- 1. Semilla: profesor (UI, para tener credenciales reales) + 1 pregunta
  //        de alternativas + 1 prueba (BD, sin pasar por el uploader de imágenes).
  await registrar(page, nombreProfe, emailProfe)
  const profeId = await idDeUsuario(emailProfe)
  const { tituloPrueba } = await sembrarPreguntaYPrueba(profeId, sufijo)

  // --- 2. Profesor: crea el curso por UI (queda logueado tras registrarse).
  await page.goto('/cursos')
  await page.locator('#nombre-curso').fill(nombreCurso)
  await page.getByRole('button', { name: 'Crear curso' }).click()
  await expect(page).toHaveURL(/\/cursos\/\d+$/)
  const cursoId = Number(page.url().match(/\/cursos\/(\d+)$/)![1])
  const joinCode = await joinCodeDeCurso(cursoId)

  // --- 3. Profesor: asigna la prueba al curso desde /mis-pruebas. El profesor
  //        recién creado sólo tiene esta prueba y este curso, así que el
  //        selector de curso (con un único <option>) ya trae el curso correcto.
  await page.goto('/mis-pruebas')
  await expect(page.getByRole('heading', { name: tituloPrueba })).toBeVisible()
  await page.getByRole('button', { name: '📤 Asignar' }).click()
  await expect(page.getByRole('button', { name: 'Asignada ✓' })).toBeVisible()

  // --- 4. Estudiante: se registra desde /unirse/CODIGO (contexto/página nuevos,
  //        sin cookies del profesor).
  const ctxEstudiante = await browser.newContext()
  const pageEst = await ctxEstudiante.newPage()
  try {
    await pageEst.goto(`/unirse/${joinCode}`)
    await expect(
      pageEst.getByText(`Te estás uniendo a «${nombreCurso}»`, { exact: false }),
    ).toBeVisible()
    await pageEst.locator('#nombre').fill(nombreEstudiante)
    await pageEst.locator('#email').fill(emailEstudiante)
    await pageEst.locator('#password').fill(PASSWORD)
    await pageEst.getByRole('button', { name: 'Crear cuenta y unirme' }).click()

    // El registro redirige con router.push('/tareas'); si la cookie de sesión
    // reemitida por el server action (returnHeaders, Task 8) no prende en el
    // navegador, requireEstudiante() del layout de /tareas rebota a /login sin
    // sesión. Se verificó en vivo que la reemisión funciona (Task 8/9); esta
    // aserción dura protege contra una regresión futura en vez de solo
    // registrarla en el log y seguir de largo.
    await pageEst.waitForURL(/\/(tareas|login)$/, { timeout: 15_000 })
    expect(pageEst.url().includes('/login')).toBe(false)

    // --- 5. Estudiante: abre la tarea, marca la alternativa correcta y la envía.
    await expect(pageEst.getByText(tituloPrueba)).toBeVisible()
    await pageEst.getByText(tituloPrueba).click()
    await expect(pageEst).toHaveURL(/\/tareas\/\d+$/)

    await pageEst
      .locator('label', { hasText: 'B)' })
      .locator('input[type="radio"]')
      .check()

    pageEst.once('dialog', (dialog) => dialog.accept())
    await pageEst.getByRole('button', { name: '📨 Enviar respuestas' }).click()

    await expect(pageEst.getByText('Tu resultado: 1/1')).toBeVisible()

    // La lista /tareas también refleja el puntaje.
    await pageEst.goto('/tareas')
    await expect(pageEst.getByText('1/1')).toBeVisible()
  } finally {
    await ctxEstudiante.close()
  }

  // --- 6. Profesor: abre los resultados de la asignación y ve la entrega.
  await page.goto(`/cursos/${cursoId}`)
  await expect(page.getByText('1/1 entregadas')).toBeVisible()
  await page.getByRole('link', { name: tituloPrueba }).click()
  await expect(page).toHaveURL(/\/cursos\/\d+\/tareas\/\d+$/)

  const filaAlumno = page.locator('tr', { hasText: nombreEstudiante })
  await expect(filaAlumno).toBeVisible()
  await expect(filaAlumno.getByText('1/1', { exact: false })).toBeVisible()
})
