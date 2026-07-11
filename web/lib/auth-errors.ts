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
    default:
      return fallback
  }
}
