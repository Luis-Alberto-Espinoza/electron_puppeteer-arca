/**
 * MÓDULO: Estado CT (Cuenta Tributaria)
 * Maneja el estado centralizado del flujo de Cuenta Tributaria.
 * Patrón Singleton — único estado global del módulo.
 *
 * Clave compuesta: cada "grupo" se identifica por (clienteId, cuitAsociado).
 */

/** Construye la clave compuesta única para un (cliente, cuit). */
function clavear(clienteId, cuitAsociado) {
    return `${clienteId}|${cuitAsociado}`;
}

const EstadoCT = {
    // Resultados de primera pasada
    procesadosAuto: [],       // [{ cliente, cuitAsociado, sinDeuda, message, excelDescargado? }, ...]
    requierenSeleccion: [],   // [{ cliente, cuitAsociado, deudas:[...], totales, excelDescargado, ... }, ...]
    errores: [],              // [{ cliente, cuitAsociado, error }, ...]

    // Selecciones del usuario (key = clavear(clienteId, cuit))
    filasSeleccionadasPorGrupo: {},   // { "cliId|cuit": [idFila1, idFila2, ...] }
    medioPagoPorGrupo: {},            // { "cliId|cuit": { id, nombre } }
    gruposExcluidos: new Set(),       // Set de "cliId|cuit"

    // Medio de pago por defecto (heredado de la primera pasada o fijado por UI)
    medioPagoDefault: null,

    // Items originales enviados a la primera pasada (para reconstrucción / reintentos)
    itemsOriginales: [],

    // Bandera visible/oculto del lote: la pasada de pago y los reintentos usan la misma
    // que la consulta (primera pasada). No se guarda.
    visible: true,

    /** Inicializa el estado con los resultados del backend. */
    setResultados(resultados) {
        this.procesadosAuto = resultados.procesadosAuto || [];
        this.requierenSeleccion = resultados.requierenSeleccion || [];
        this.errores = resultados.errores || [];

        // Pre-poblar medioPagoPorGrupo si el item ya traía un medioPago asignado
        for (const item of this.requierenSeleccion) {
            const k = clavear(item.cliente.id, item.cuitAsociado);
            if (item.medioPago && !this.medioPagoPorGrupo[k]) {
                this.medioPagoPorGrupo[k] = item.medioPago;
            }
        }

        console.log('📊 EstadoCT actualizado:', {
            procesadosAuto: this.procesadosAuto.length,
            requierenSeleccion: this.requierenSeleccion.length,
            errores: this.errores.length
        });
    },

    /** Guarda los items originales para uso posterior (reintentos). */
    setItemsOriginales(items) {
        this.itemsOriginales = items || [];
    },

    /** Fija el medio de pago por defecto (se aplica a grupos sin medio asignado). */
    setMedioPagoDefault(medioPago) {
        this.medioPagoDefault = medioPago;
    },

    // ============================================================
    // SELECCIÓN DE FILAS POR GRUPO
    // ============================================================

    /** Agrega una fila de deuda (por id) a la selección del grupo. */
    agregarSeleccionFila(clienteId, cuitAsociado, idFila) {
        const k = clavear(clienteId, cuitAsociado);
        if (!this.filasSeleccionadasPorGrupo[k]) {
            this.filasSeleccionadasPorGrupo[k] = [];
        }
        if (!this.filasSeleccionadasPorGrupo[k].includes(idFila)) {
            this.filasSeleccionadasPorGrupo[k].push(idFila);
        }
    },

    /** Quita una fila de la selección del grupo. */
    quitarSeleccionFila(clienteId, cuitAsociado, idFila) {
        const k = clavear(clienteId, cuitAsociado);
        if (!this.filasSeleccionadasPorGrupo[k]) return;
        this.filasSeleccionadasPorGrupo[k] = this.filasSeleccionadasPorGrupo[k]
            .filter(id => id !== idFila);
        if (this.filasSeleccionadasPorGrupo[k].length === 0) {
            delete this.filasSeleccionadasPorGrupo[k];
        }
    },

    /** Obtiene los ids de filas seleccionadas para un grupo. */
    obtenerFilasGrupo(clienteId, cuitAsociado) {
        const k = clavear(clienteId, cuitAsociado);
        return this.filasSeleccionadasPorGrupo[k] || [];
    },

    /** ¿La fila está seleccionada en el grupo? */
    estaFilaSeleccionada(clienteId, cuitAsociado, idFila) {
        return this.obtenerFilasGrupo(clienteId, cuitAsociado).includes(idFila);
    },

    // ============================================================
    // MEDIO DE PAGO POR GRUPO
    // ============================================================

    setMedioPagoGrupo(clienteId, cuitAsociado, medioPago) {
        const k = clavear(clienteId, cuitAsociado);
        this.medioPagoPorGrupo[k] = medioPago;
    },

    obtenerMedioPagoGrupo(clienteId, cuitAsociado) {
        const k = clavear(clienteId, cuitAsociado);
        return this.medioPagoPorGrupo[k] || this.medioPagoDefault || null;
    },

    // ============================================================
    // EXCLUSIÓN DE GRUPOS
    // ============================================================

    excluirGrupo(clienteId, cuitAsociado) {
        this.gruposExcluidos.add(clavear(clienteId, cuitAsociado));
    },

    incluirGrupo(clienteId, cuitAsociado) {
        this.gruposExcluidos.delete(clavear(clienteId, cuitAsociado));
    },

    estaExcluido(clienteId, cuitAsociado) {
        return this.gruposExcluidos.has(clavear(clienteId, cuitAsociado));
    },

    // ============================================================
    // RECOPILACIÓN PARA SEGUNDA PASADA
    // ============================================================

    /**
     * Construye la lista de items para enviar al backend en la segunda pasada.
     * Incluye sólo grupos NO excluidos que tengan al menos una fila seleccionada
     * y un medio de pago asignado.
     *
     * @returns {Array<{cliente, cuitAsociado, medioPago, seleccionFilas:{ids:string[]}}>}
     */
    recopilarSelecciones() {
        const items = [];

        for (const grupo of this.requierenSeleccion) {
            const { cliente, cuitAsociado } = grupo;
            if (this.estaExcluido(cliente.id, cuitAsociado)) continue;

            const ids = this.obtenerFilasGrupo(cliente.id, cuitAsociado);
            if (ids.length === 0) continue;

            const medioPago = this.obtenerMedioPagoGrupo(cliente.id, cuitAsociado);
            items.push({
                cliente,
                cuitAsociado,
                medioPago,
                seleccionFilas: { modo: 'ids', ids }
            });
        }

        console.log('📋 Selecciones CT recopiladas:', items.length, 'items');
        return items;
    },

    /**
     * Valida que las selecciones sean correctas.
     * @returns {{ valido: boolean, mensaje: string }}
     */
    validarSelecciones() {
        const noExcluidos = this.requierenSeleccion.filter(
            g => !this.estaExcluido(g.cliente.id, g.cuitAsociado)
        );

        if (noExcluidos.length === 0) {
            return { valido: false, mensaje: 'No hay grupos seleccionados para procesar' };
        }

        const sinFilas = noExcluidos.filter(g => {
            const ids = this.obtenerFilasGrupo(g.cliente.id, g.cuitAsociado);
            return ids.length === 0;
        });

        if (sinFilas.length > 0) {
            const desc = sinFilas
                .map(g => `${g.cliente.nombre} (CUIT ${g.cuitAsociado})`)
                .join(', ');
            return {
                valido: false,
                mensaje: `Los siguientes grupos no tienen filas seleccionadas: ${desc}`
            };
        }

        const sinMedio = noExcluidos.filter(g => {
            return !this.obtenerMedioPagoGrupo(g.cliente.id, g.cuitAsociado);
        });

        if (sinMedio.length > 0) {
            const desc = sinMedio
                .map(g => `${g.cliente.nombre} (CUIT ${g.cuitAsociado})`)
                .join(', ');
            return {
                valido: false,
                mensaje: `Los siguientes grupos no tienen medio de pago: ${desc}`
            };
        }

        return { valido: true, mensaje: 'Selecciones válidas' };
    },

    // ============================================================
    // RESET / ESTADÍSTICAS
    // ============================================================

    reset() {
        this.procesadosAuto = [];
        this.requierenSeleccion = [];
        this.errores = [];
        this.filasSeleccionadasPorGrupo = {};
        this.medioPagoPorGrupo = {};
        this.gruposExcluidos.clear();
        this.medioPagoDefault = null;
        this.itemsOriginales = [];
        this.visible = true;
        console.log('🔄 EstadoCT reseteado');
    },

    obtenerEstadisticas() {
        return {
            totalProcesadosAuto: this.procesadosAuto.length,
            totalRequierenSeleccion: this.requierenSeleccion.length,
            totalErrores: this.errores.length,
            gruposConSeleccion: Object.keys(this.filasSeleccionadasPorGrupo).length,
            gruposExcluidos: this.gruposExcluidos.size
        };
    },

    // Exportado para que los renderizadores puedan construir IDs DOM consistentes
    clavear
};

export default EstadoCT;
export { clavear };
