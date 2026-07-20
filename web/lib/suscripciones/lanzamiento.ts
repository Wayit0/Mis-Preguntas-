// ---------------------------------------------------------------------------
// Lanzamiento abierto: mientras EduBox esté en versión de lanzamiento, todas
// las cuentas tienen las funciones Pro liberadas y no se cobra a nadie. Es un
// único interruptor para que la promesa de /precios y los entitlements reales
// nunca se contradigan.
//
// Para terminar el lanzamiento: LANZAMIENTO_GRATIS=false en el App Service
// (vuelven los límites del plan de cada quien y reaparece el checkout).
// ---------------------------------------------------------------------------

export function lanzamientoGratis(): boolean {
  return process.env.LANZAMIENTO_GRATIS !== 'false'
}
