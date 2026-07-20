// Los tests de suscripciones ejercitan el riel PAGO (planes, límites, cobros).
// El lanzamiento gratis viene encendido por defecto en la app y haría Pro a
// todas las cuentas, volviendo triviales esas aserciones: aquí arranca apagado
// y los tests que verifican el lanzamiento lo encienden a mano.
process.env.LANZAMIENTO_GRATIS = 'false'
