/**
 * Control cruzado de las secciones de un plan contra el "Consolidado" que
 * muestra la lista de planes (seguimiento_presentacion.aspx):
 *   - Plan de Pago: el capital total (fila Totales) debe ser el consolidado.
 *   - Obligaciones: Σ "Saldo a Cancelar" (Impositivas + Previsionales) debe
 *     ser el consolidado. Se usa Saldo y no Monto porque, si hubo pagos
 *     imputados, Monto lo supera (ej: plan Q146397).
 * Si no cierra, casi siempre es que AFIP cambió la página y estamos leyendo
 * mal: por eso se avisa en el log y queda en el resultado del plan.
 *
 * Estados por control: 'ok' | 'difiere' | 'sinDatos' (no se pudo comparar).
 */

const { parseNumero } = require('./datosResumenBuilder.js');

const aCentavos = (n) => Math.round(n * 100);

/**
 * @param {string} consolidadoTexto - celda "Consolidado" de la lista (ej "9.421.641,15")
 * @param {Object} modelos - { planPago, obligImp, obligPrev } modelos de paso_8 (o null)
 * @param {boolean} obligacionesCompletas - false si alguna sección de obligaciones falló
 *        (no "no disponible": falló) → la suma estaría incompleta
 */
function validar(consolidadoTexto, modelos, obligacionesCompletas) {
    const consolidado = parseNumero(consolidadoTexto);
    if (!consolidado) {
        return { consolidado: null, planPago: { estado: 'sinDatos' }, obligaciones: { estado: 'sinDatos' } };
    }

    return {
        consolidado,
        planPago: comparar(consolidado, capitalTotal(modelos.planPago)),
        obligaciones: obligacionesCompletas
            ? comparar(consolidado, saldoObligaciones([modelos.obligImp, modelos.obligPrev]))
            : { estado: 'sinDatos' }
    };
}

function comparar(esperado, obtenido) {
    if (obtenido === null) return { estado: 'sinDatos' };
    const ok = aCentavos(esperado) === aCentavos(obtenido);
    return { estado: ok ? 'ok' : 'difiere', obtenido, diferencia: (aCentavos(obtenido) - aCentavos(esperado)) / 100 };
}

function capitalTotal(modelo) {
    if (!modelo) return null;
    const totales = modelo.bloques.find(b => b.total);
    return totales ? parseNumero(totales.filas[0][1]) : null;
}

function saldoObligaciones(modelos) {
    const presentes = modelos.filter(Boolean);
    if (presentes.length === 0) return null;

    let suma = 0;
    for (const modelo of presentes) {
        const col = modelo.columnas.findIndex(c => /saldo a cancelar/i.test(c.titulo));
        if (col < 0) return null;
        for (const bloque of modelo.bloques) {
            if (!bloque.total) suma += parseNumero(bloque.filas[0][col]);
        }
    }
    return suma;
}

module.exports = { validar };
