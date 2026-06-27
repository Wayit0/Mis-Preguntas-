import { test, expect, type Page } from '@playwright/test'

// Flujo de colaboradores con DOS usuarios reales (contextos de navegador
// independientes, sesiones separadas) contra el servidor real + Postgres de
// prueba: A invita a B por email → B aparece en «Quién me puede ver a mí» de A,
// y A aparece en «Colegas que puedo ver» de B. Luego A lo quita.

async function registrar(page: Page, nombre: string, email: string) {
  const password = 'clave-segura-123'
  await page.goto('/registro')
  await page.locator('#nombre').fill(nombre)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password2').fill(password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('A invita a B por email; B ve a A; A puede quitar a B', async ({
  browser,
}) => {
  const sufijo = Date.now()
  const nombreA = `Ana ${sufijo}`
  const emailA = `cola-a-${sufijo}@x.cl`
  const nombreB = `Bruno ${sufijo}`
  const emailB = `cola-b-${sufijo}@x.cl`

  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  try {
    await registrar(pageA, nombreA, emailA)
    await registrar(pageB, nombreB, emailB)

    // A: pestaña «Quién me puede ver a mí» → agregar a B por email.
    await pageA.goto('/colaboradores')
    await pageA.getByRole('tab', { name: 'Quién me puede ver a mí' }).click()
    await pageA.locator('#email-colega').fill(emailB)
    await pageA.getByRole('button', { name: /Agregar colaborador/ }).click()

    // B aparece en la lista de A (por su email).
    await expect(pageA.getByText(emailB)).toBeVisible()

    // B: pestaña por defecto «Colegas que puedo ver» → ve a A.
    await pageB.goto('/colaboradores')
    await expect(
      pageB.getByRole('tab', { name: 'Colegas que puedo ver' }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(pageB.getByText(emailA)).toBeVisible()

    // A quita a B → desaparece de la lista.
    await pageA.getByRole('button', { name: 'Quitar' }).first().click()
    await expect(pageA.getByText(emailB)).toHaveCount(0)
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
