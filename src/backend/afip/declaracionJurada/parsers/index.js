// parsers/index.js
// Despachador de parsers de DDJJ: auto-detecta el formato del Excel y delega al parser
// correcto. Ambos parsers devuelven el MISMO modelo canónico, así que el handler y el
// flujo Puppeteer no se enteran de qué formato vino.
//
//  - Formato 1 "Liquidaciones": una hoja por cliente, fila-por-actividad (parserLiquidacionesIIBB).
//  - Formato 2 "Planilla IVA - IB": matriz mes × actividad, hoja tipo RESUMEN (parserPlanillaIvaIB).

const liquidaciones = require('./parserLiquidacionesIIBB.js');
const planilla = require('./parserPlanillaIvaIB.js');

/** (archivo, hoja, periodo AAAAMM) → modelo canónico, eligiendo el parser por contenido. */
function parsear(archivo, hoja, periodo) {
    if (planilla.esPlanillaIvaIB(archivo, hoja)) {
        return planilla.parsearPlanillaIvaIB(archivo, hoja, periodo);
    }
    try {
        return liquidaciones.parsearLiquidacionIIBB(archivo, hoja, periodo);
    } catch (e) {
        // "No es Planilla" acá significa solo "no pude ubicar su bloque", así que una planilla
        // con un header raro cae igual al parser de Liquidaciones y falla con un mensaje que
        // apunta al formato equivocado. Si la hoja tiene el marcador "DDJJ IIBB", decimos qué
        // pasó DE VERDAD en vez de mandar a buscar encabezados que nunca van a estar.
        const diagnostico = planilla.diagnosticarPlanilla(archivo, hoja);
        if (diagnostico) throw new Error(diagnostico);
        throw e;
    }
}

module.exports = {
    parsear,
    listarHojas: liquidaciones.listarHojas   // misma implementación para ambos formatos
};
