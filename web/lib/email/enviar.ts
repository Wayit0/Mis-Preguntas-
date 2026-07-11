/**
 * Envío de correo transaccional vía Resend (REST API, sin SDK: evita una
 * dependencia extra). Se usa para la verificación de correo de better-auth.
 *
 * Config por entorno:
 *   RESEND_API_KEY  — clave de la cuenta Resend (secreto). Si NO está definida,
 *                     el envío se OMITE con un warning (no rompe el registro):
 *                     útil en local/QA antes de configurar la clave.
 *   EMAIL_FROM      — remitente, ej. 'EduBox <no-reply@edubox.cl>'. El dominio
 *                     debe estar verificado en Resend para poder enviar a
 *                     cualquier destinatario.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'EduBox <no-reply@edubox.cl>'

/**
 * Envía un correo. Devuelve true si Resend lo aceptó, false si se omitió o
 * falló (siempre captura el error: el fallo de correo no debe tumbar el flujo
 * que lo dispara, p. ej. el registro).
 */
export async function enviarCorreo(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY no configurada; se omite el envío a ${to} ("${subject}")`,
    )
    return false
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    })
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.error(`[email] Resend rechazó el envío (${res.status}): ${detalle}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[email] Error enviando correo vía Resend:', e)
    return false
  }
}

/** Escapa texto para interpolarlo con seguridad dentro del HTML del correo. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Correo de verificación de cuenta. `url` es el enlace de better-auth que, al
 * abrirse, marca el correo como verificado (y dispara la auto-asociación al
 * colegio por dominio).
 */
export async function enviarVerificacionCorreo(
  email: string,
  nombre: string,
  url: string,
): Promise<boolean> {
  const saludo = nombre ? `Hola ${esc(nombre)},` : 'Hola,'
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:20px;font-weight:700;">📚 EduBox</div>
          </td></tr>
          <tr><td style="padding:8px 32px 0;">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${saludo}</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
              Verifica tu correo para activar tu cuenta. Si te registraste con el
              correo de tu colegio, al verificarlo tu cuenta se asociará
              automáticamente y podrás compartir tus pruebas y preguntas con el
              resto del equipo.
            </p>
          </td></tr>
          <tr><td style="padding:4px 32px 24px;">
            <a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Verificar mi correo</a>
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="${esc(url)}" style="color:#4f46e5;word-break:break-all;">${esc(url)}</a>
            </p>
            <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
              Si no creaste una cuenta en EduBox, puedes ignorar este correo.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return enviarCorreo(email, 'Verifica tu correo — EduBox', html)
}

/**
 * Correo de recuperación de contraseña. `url` es el enlace de better-auth que,
 * al abrirse, valida el token de reset y redirige a la página /restablecer para
 * fijar la nueva contraseña. El enlace expira en 1 hora.
 */
export async function enviarResetPassword(
  email: string,
  nombre: string,
  url: string,
): Promise<boolean> {
  const saludo = nombre ? `Hola ${esc(nombre)},` : 'Hola,'
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:20px;font-weight:700;">📚 EduBox</div>
          </td></tr>
          <tr><td style="padding:8px 32px 0;">
            <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${saludo}</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              Haz clic en el botón para elegir una nueva. El enlace vence en 1 hora.
            </p>
          </td></tr>
          <tr><td style="padding:4px 32px 24px;">
            <a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Restablecer mi contraseña</a>
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="${esc(url)}" style="color:#4f46e5;word-break:break-all;">${esc(url)}</a>
            </p>
            <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
              Si no solicitaste cambiar tu contraseña, puedes ignorar este correo:
              tu contraseña actual seguirá siendo válida.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return enviarCorreo(email, 'Restablece tu contraseña — EduBox', html)
}
