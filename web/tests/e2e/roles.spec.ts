import { test, expect, type Page } from '@playwright/test'
import postgres from 'postgres'

// E2E de roles (Parte E.2). Cubre:
//  1. Guards: un teacher recibe redirect al intentar /admin y /colegio.
//  2. Flujo school_admin: un profesor se une por código y aparece en la lista
//     del colegio; el banco del colegio muestra una pregunta compartida suya.
//  3. Flujo admin global: crear un colegio y designar a un usuario como
//     school_admin (su rol/colegio cambian).
//
// Para roles, sembramos directamente en la BD de prueba (el servidor E2E usa el
// mismo DATABASE_URL): no se puede crear un global_admin vía UI. Los usuarios que
// deben INICIAR SESIÓN se registran por UI (para tener credenciales reales) y
// luego se promueven en la BD; getActor() lee la fila de usuarios, así que el
// nuevo rol surte efecto en la siguiente petición sin re-login.

const PASSWORD = 'clave-segura-123'

// Cliente de BD perezoso compartido por los tests del archivo.
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

// --- helpers de BD (siembra de roles/colegios/preguntas) ---

async function idDeUsuario(email: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    SELECT id FROM usuarios WHERE email = ${email.toLowerCase()} LIMIT 1
  `
  return row.id
}

async function promover(email: string, role: string, colegioId?: number) {
  await sql`
    UPDATE usuarios
    SET role = ${role}, colegio_id = ${colegioId ?? null}
    WHERE email = ${email.toLowerCase()}
  `
}

async function crearColegioDB(nombre: string, joinCode: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO colegios (nombre, join_code) VALUES (${nombre}, ${joinCode})
    RETURNING id
  `
  return row.id
}

async function crearUsuarioDB(nombre: string, email: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO usuarios (nombre, email, password_hash, role)
    VALUES (${nombre}, ${email.toLowerCase()}, 'x', 'teacher')
    RETURNING id
  `
  return row.id
}

async function crearPreguntaCompartidaDB(userId: number, enunciado: string) {
  await sql`
    INSERT INTO preguntas (user_id, asignatura, pregunta, "A", "B", correcta, compartida)
    VALUES (${userId}, 'Matemática', ${enunciado}, '3', '4', 'B', 1)
  `
}

async function rolYColegioDB(
  email: string,
): Promise<{ role: string; colegioId: number | null }> {
  const [row] = await sql<{ role: string; colegio_id: number | null }[]>`
    SELECT role, colegio_id FROM usuarios WHERE email = ${email.toLowerCase()} LIMIT 1
  `
  return { role: row.role, colegioId: row.colegio_id }
}

// ---------------------------------------------------------------------------

test('un teacher recibe redirect al entrar a /admin y a /colegio (guard)', async ({
  page,
}) => {
  const sufijo = Date.now()
  await registrar(page, `Profe ${sufijo}`, `rol-teacher-${sufijo}@x.cl`)

  // /admin: requireRole(['global_admin']) → redirige a "/" → /dashboard.
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: /Administración/ }),
  ).toHaveCount(0)

  // /colegio: requireRole(['school_admin','global_admin']) → /dashboard.
  await page.goto('/colegio')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('school_admin: el profesor se une por código y aparece; el banco muestra su pregunta compartida', async ({
  browser,
}) => {
  const sufijo = Date.now()
  const joinCode = `E2E-CODE-${sufijo}`
  const colegioId = await crearColegioDB(`Colegio E2E ${sufijo}`, joinCode)

  const emailAdmin = `rol-admin-${sufijo}@x.cl`
  const emailProfe = `rol-profe-${sufijo}@x.cl`
  const enunciado = `Pregunta compartida del profe [${sufijo}]`

  const ctxAdmin = await browser.newContext()
  const ctxProfe = await browser.newContext()
  const pageAdmin = await ctxAdmin.newPage()
  const pageProfe = await ctxProfe.newPage()

  try {
    // School_admin: registrar por UI y promover en BD a admin de ESTE colegio.
    await registrar(pageAdmin, `Admin ${sufijo}`, emailAdmin)
    await promover(emailAdmin, 'school_admin', colegioId)

    // Profesor: registrar por UI (sin colegio aún).
    await registrar(pageProfe, `Profe ${sufijo}`, emailProfe)

    // El profesor se une por código desde /cuenta.
    await pageProfe.goto('/cuenta')
    await pageProfe.locator('#codigo-colegio').fill(joinCode)
    await pageProfe.getByRole('button', { name: 'Unirme' }).click()
    // Al unirse, el bloque «Unirse a un colegio» desaparece.
    await expect(
      pageProfe.getByRole('heading', { name: /Unirse a un colegio/ }),
    ).toHaveCount(0)

    // El profesor publica una pregunta compartida (sembrada en BD por robustez).
    const profeId = await idDeUsuario(emailProfe)
    await crearPreguntaCompartidaDB(profeId, enunciado)

    // El admin ve al profesor en la lista de profesores del colegio.
    await pageAdmin.goto('/colegio?tab=profesores')
    await expect(pageAdmin.getByText(emailProfe)).toBeVisible()

    // El banco del colegio muestra la pregunta compartida del profe.
    await pageAdmin.goto('/colegio?tab=banco')
    await expect(pageAdmin.getByText(enunciado)).toBeVisible()
  } finally {
    await ctxAdmin.close()
    await ctxProfe.close()
  }
})

test('admin global: crear un colegio y designar a un usuario como school_admin', async ({
  page,
}) => {
  const sufijo = Date.now()
  const emailAdmin = `rol-global-${sufijo}@x.cl`
  const emailObjetivo = `rol-objetivo-${sufijo}@x.cl`
  const nombreColegio = `Colegio Global ${sufijo}`

  // Admin global: registrar por UI y promover en BD.
  await registrar(page, `Global ${sufijo}`, emailAdmin)
  await promover(emailAdmin, 'global_admin')

  // Usuario objetivo: existe en BD (aparecerá en la lista de usuarios).
  await crearUsuarioDB(`Objetivo ${sufijo}`, emailObjetivo)

  // La sesión del admin se creó como teacher, pero getActor lee el rol fresco de
  // BD, así que /admin ya es accesible sin re-login.
  await page.goto('/admin?tab=colegios')
  await expect(
    page.getByRole('heading', { name: /Administración/ }),
  ).toBeVisible()

  // Crear un colegio.
  await page.locator('#nombre-colegio-nuevo').fill(nombreColegio)
  await page.getByRole('button', { name: /Crear colegio/ }).click()
  await expect(page.getByText(nombreColegio).first()).toBeVisible()

  // Ir a Usuarios, seleccionar el colegio del usuario objetivo y designarlo
  // administrador de ese colegio.
  await page.goto('/admin?tab=usuarios')
  await expect(page.getByText(emailObjetivo, { exact: false })).toBeVisible()
  await page
    .getByLabel(`Colegio de ${emailObjetivo}`)
    .selectOption({ label: nombreColegio })
  await page
    .getByRole('button', { name: `Designar administrador de ${emailObjetivo}` })
    .click()

  // El rol y el colegio del usuario cambiaron en la BD.
  await expect
    .poll(async () => (await rolYColegioDB(emailObjetivo)).role)
    .toBe('school_admin')
  const final = await rolYColegioDB(emailObjetivo)
  expect(final.colegioId).not.toBeNull()
})
