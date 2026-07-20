// Traduce los códigos de error de better-auth a mensajes en español (es-CL)
// equivalentes a los del MVP. better-auth devuelve `INVALID_EMAIL_OR_PASSWORD`
// de forma genérica tanto para "correo inexistente" como para "contraseña
// incorrecta" (evita enumeración de usuarios); el formulario de login usa la
// acción `correoRegistrado` para decidir cuál de los dos mensajes mostrar.

export const ERROR_GENERICO = 'Ocurrió un error. Intenta nuevamente.'

export function mensajeErrorAuth(
  code: string | undefined | null,
  fallback: string = ERROR_GENERICO,
): string {
  switch (code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'Ya existe una cuenta con ese correo'
    case 'USER_NOT_FOUND':
      return 'Correo no encontrado'
    case 'INVALID_PASSWORD':
      return 'Contraseña incorrecta'
    case 'INVALID_EMAIL_OR_PASSWORD':
      // Caso ambiguo: el llamador (login) afina el mensaje según si el correo
      // existe. Por defecto asumimos contraseña incorrecta.
      return 'Contraseña incorrecta'
    case 'PASSWORD_TOO_SHORT':
      return 'La contraseña debe tener al menos 6 caracteres'
    case 'INVALID_EMAIL':
      return 'Correo electrónico no válido'
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'El enlace de recuperación no es válido o expiró. Solicítalo de nuevo.'
    // Códigos del login social: no llegan como respuesta de la API sino en la
    // URL de retorno (?error=...), en minúsculas y con guiones bajos.
    case 'account_not_linked':
      return 'Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña y luego podrás entrar con Google.'
    case 'account_already_linked_to_different_user':
    case 'unable_to_link_account':
      return 'No pudimos vincular esa cuenta con tu correo. Escríbenos a contacto@edubox.cl.'
    case 'email_not_found':
      return 'El proveedor no entregó un correo electrónico. Inicia sesión con tu correo y contraseña.'
    case 'invalid_code':
    case 'no_code':
    case 'invalid_callback_request':
    case 'state_not_found':
    case 'please_restart_the_process':
      return 'No se completó el inicio de sesión con el proveedor. Intenta de nuevo.'
    default:
      return fallback
  }
}
