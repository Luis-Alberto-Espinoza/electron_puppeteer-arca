/**
 * PLANTILLA de configuración del piloto de Generar VEP.
 * ----------------------------------------------------
 * 1. Copiá este archivo como  piloto_generarVep.config.js  (sin ".example").
 * 2. Completá con datos REALES de un cliente de prueba.
 * 3. El config real está gitignoreado: tus claves NO se suben a git.
 *
 * Nota: el piloto NO usa el repo de contribuyentes (ese depende de Electron).
 * Por eso las credenciales van acá a mano, en vez de salir de resolverAcceso.
 */
module.exports = {
    // Credenciales con las que se hace login en ARCA/AFIP.
    // Si el cliente opera con su propia clave, son las del cliente.
    // Si lo representás, son las del representante.
    login: {
        cuit: '20111111110',
        clave: 'TU_CLAVE_FISCAL',
    },

    // Contribuyente para el que se genera el VEP (el "objetivo").
    // Si login y objetivo son la misma persona, repetí el CUIT.
    objetivo: {
        cuit: '20111111110',
        nombre: 'Cliente De Prueba',
    },

    // Medio de pago. id válidos:
    //   pago_qr | pagar_link | pago_mis_cuentas | interbanking | xn_group
    medioPago: { id: 'pago_qr', nombre: 'Pago QR' },

    // Períodos a generar.
    //   null  → primera pasada: AFIP autodetecta. Si hay varios, el flujo
    //           devuelve "requiereSeleccion" y el piloto lo anota como tal.
    //   array → períodos concretos, ej: ['202401', '202402'] (formato AAAAMM).
    periodos: null,
};
