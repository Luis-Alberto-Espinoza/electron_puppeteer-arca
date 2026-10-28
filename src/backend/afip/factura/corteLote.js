// afip/factura/corteLote.js
// Lo común a los lotes de Factura Tipificada y de Notas NC/ND: TODOS los
// comprobantes van en UN login (el flujo detallado los hace uno tras otro,
// volviendo al menú). Como es una sola llamada, si se corta no hay retorno por
// comprobante: se arma con los avisos del flujo.
//   - corte(resultado): el usuario canceló o cerró el navegador.
//   - loteEnUnaSesion(...): corre el lote, le pasa a la rueda qué está haciendo
//     y devuelve un resultado por comprobante (null = no se intentó). El que
//     estaba CONFIRMANDO cuando se cortó queda dudoso (no se sabe si AFIP lo grabó).

const CORTES = { CANCELADO: 'cancelado', NAVEGADOR_CERRADO: 'cerrado' };

/** 'cancelado' | 'cerrado' | null */
function corte(resultado) {
    return (resultado && CORTES[resultado.error]) || null;
}

const PASOS = {
    'completando-datos': 'cargando los datos…',
    'confirmando': 'confirmando en AFIP…'
};

/**
 * @param {object} p
 * @param {Electron.WebContents} p.sender  a quién mandarle los avisos de la rueda
 * @param {string} p.canal                 canal de la rueda (contrato de componentes/rueda)
 * @param {string} p.queEs                 "Comprobante" | "Nota"
 * @param {string[]} p.nombres             texto para la rueda, uno por comprobante
 * @param {(enviarProgreso: Function) => Promise<object>} p.correr  llama al manager con TODOS
 * @returns {Promise<{resultados: Array<object|null>, cortadoPor: string|null, resultado: object}>}
 */
async function loteEnUnaSesion({ sender, canal, queEs, nombres, correr }) {
    const total = nombres.length;
    const resultados = new Array(total).fill(null);
    let enCurso = null;      // índice 0-based del que se está haciendo
    let confirmando = false;

    const avisar = (indice, mensaje) => {
        if (sender && !(sender.isDestroyed && sender.isDestroyed())) {
            sender.send(canal, {
                tipo: 'progreso', nombre: nombres[indice] || '', mensaje: `${queEs} ${indice + 1} de ${total}: ${mensaje}`,
                procesados: resultados.filter(Boolean).length, total
            });
        }
    };
    avisar(0, 'iniciando sesión en AFIP…');

    const enviarProgreso = (aviso) => {
        const i = (aviso.facturaActual || 1) - 1;
        if (aviso.tipo === 'procesando' && PASOS[aviso.paso]) {
            enCurso = i;
            confirmando = aviso.paso === 'confirmando';
            avisar(i, PASOS[aviso.paso]);
        } else if (aviso.tipo === 'resultado-factura') {
            resultados[i] = aviso.resultado;
            enCurso = null;
            confirmando = false;
        }
    };

    const resultado = await correr(enviarProgreso);
    const cortadoPor = corte(resultado);

    if (cortadoPor) {
        if (enCurso !== null) {
            resultados[enCurso] = {
                success: false, cortado: cortadoPor, dudosa: confirmando,
                message: resultado.message, error: resultado.message
            };
        }
    } else if (!resultado?.modoTest && !resultados.some(r => r && r.cortaLote)) {
        // Se cayó la sesión antes de terminar (login, AFIP, error inesperado):
        // los que no tienen resultado fallaron con ese motivo (reintentables).
        const motivo = resultado?.message || resultado?.error || 'No se pudo completar la sesión en AFIP';
        resultados.forEach((r, i) => {
            if (!r) resultados[i] = { success: false, dudosa: i === enCurso && confirmando, message: motivo, error: motivo };
        });
    }

    return { resultados, cortadoPor, resultado };
}

module.exports = { corte, loteEnUnaSesion };
