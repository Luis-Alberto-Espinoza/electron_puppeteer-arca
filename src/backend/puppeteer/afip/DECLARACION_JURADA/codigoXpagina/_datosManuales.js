// _datosManuales.js
// PLACEHOLDERS de la carga de la DDJJ. Hoy están HARDCODEADOS y marcados con la
// bandera única "DatoAModificarPorExcel" para poder avanzar con la interacción del
// portal sin tener el cableado del Excel/frontend.
//
// Plan: mañana este mismo objeto lo arma el frontend (o el parser del Excel) y se
// pasa por el payload. El paso_11 NO sabe de dónde sale: recibe este objeto y listo.
// Por eso lo dejamos con la forma final (lo que mandaría la vista), no desparramado.
//
// Caso de prueba: Debora / Abril 202604 (ver declaracionJurada_handoff.md §3):
//   base 21.696.298,30 × alícuota 2,50% = impuesto 542.407,46.

module.exports = {
    // Alícuota TAL COMO aparece en el popup de AFIP ("2,50 - Tasa Reducida").
    // = alícuota del Excel (0.025) × 100. La usamos para ubicar la fila del popup.
    alicuotaObjetivo: 2.50,            // DatoAModificarPorExcel

    // Base imponible a tipear en la fila que matchea la alícuota.
    // String → se tipea VERBATIM (así probamos en vivo con/sin separadores sin tocar código).
    base: '21696298,30',               // DatoAModificarPorExcel

    // Totales de la página "Determinación" que se cargan a mano (no salen del Detallar).
    // La clave es la ETIQUETA exacta del campo en el portal; el valor se tipea verbatim.
    // Vacío/null → el paso_13 lo saltea (no toca el campo).
    totalesDeterminacion: {
        'Total de Ingresos No gravados': '0',   // DatoAModificarPorExcel
    },

    // Página "Liquidación": Fecha de Pago (v-datefield, formato DD/MM/AAAA).
    // Vacío → no se toca (todavía no cableamos el llenado de la fecha). DatoAModificarPorExcel.
    fechaPago: '',                               // DatoAModificarPorExcel

    // Plan B — RETENCIONES: las manda el FRONTEND (el usuario elige los .txt). Este default
    // queda VACÍO a propósito: si el frontend no manda nada, NO se sube nada (antes caían acá
    // las rutas de Debora y se colaban a cualquier cliente → peligro).
    // Para probar la subida a mano, descomentá una ruta real (NO dejar hardcodeado en uso).
    retenciones: {
        // 'Retenciones Sufridas': '/ruta/al/27334617977_Retenciones_SIRTAC_IB_2026-05.txt',
        // 'Percepciones': '/ruta/al/27334617977_Percepciones_SIRCAR_IB_2026-05.txt',
        // 'Percepciones Aduaneras': '',
        // 'Pagos a Cuenta': '',
        // 'Recaudaciones SIRCREB/SIRCUPA': '',
        // 'Otros Débitos': '',
        // 'Otros Créditos': '',
    },
};
