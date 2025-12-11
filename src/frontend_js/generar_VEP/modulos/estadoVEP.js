/**
 * MÓDULO: Estado VEP
 * Maneja el estado centralizado de la aplicación VEP
 * Patrón Singleton para mantener un único estado global
 */

const EstadoVEP = {
    // Resultados de primera pasada
    procesadosAuto: [],
    requierenSeleccion: [],
    errores: [],

    // Selecciones del usuario
    periodosSeleccionados: {}, // { clienteId: [periodo1, periodo2, ...] }
    clientesExcluidos: new Set(), // Set de clienteIds excluidos

    // Datos originales
    usuariosOriginales: [],

    /**
     * Inicializa el estado con los resultados del backend
     * @param {Object} resultados - Resultados agrupados del backend
     */
    setResultados(resultados) {
        this.procesadosAuto = resultados.procesadosAuto || [];
        this.requierenSeleccion = resultados.requierenSeleccion || [];
        this.errores = resultados.errores || [];

        console.log('📊 Estado actualizado:', {
            procesadosAuto: this.procesadosAuto.length,
            requierenSeleccion: this.requierenSeleccion.length,
            errores: this.errores.length
        });
    },

    /**
     * Agrega un período seleccionado para un cliente
     * @param {string} clienteId - ID del cliente
     * @param {string} periodo - Período seleccionado
     */
    agregarSeleccionPeriodo(clienteId, periodo) {
        if (!this.periodosSeleccionados[clienteId]) {
            this.periodosSeleccionados[clienteId] = [];
        }

        if (!this.periodosSeleccionados[clienteId].includes(periodo)) {
            this.periodosSeleccionados[clienteId].push(periodo);
            console.log(`✅ Período ${periodo} agregado para cliente ${clienteId}`);
        }
    },

    /**
     * Quita un período seleccionado de un cliente
     * @param {string} clienteId - ID del cliente
     * @param {string} periodo - Período a quitar
     */
    quitarSeleccionPeriodo(clienteId, periodo) {
        if (this.periodosSeleccionados[clienteId]) {
            this.periodosSeleccionados[clienteId] = this.periodosSeleccionados[clienteId]
                .filter(p => p !== periodo);

            // Si no quedan períodos, eliminar la entrada
            if (this.periodosSeleccionados[clienteId].length === 0) {
                delete this.periodosSeleccionados[clienteId];
            }

            console.log(`❌ Período ${periodo} quitado para cliente ${clienteId}`);
        }
    },

    /**
     * Excluye un cliente del procesamiento
     * @param {string} clienteId - ID del cliente
     */
    excluirCliente(clienteId) {
        this.clientesExcluidos.add(clienteId);
        console.log(`🚫 Cliente ${clienteId} excluido`);
    },

    /**
     * Incluye un cliente previamente excluido
     * @param {string} clienteId - ID del cliente
     */
    incluirCliente(clienteId) {
        this.clientesExcluidos.delete(clienteId);
        console.log(`✅ Cliente ${clienteId} incluido`);
    },

    /**
     * Verifica si un cliente está excluido
     * @param {string} clienteId - ID del cliente
     * @returns {boolean}
     */
    estaExcluido(clienteId) {
        return this.clientesExcluidos.has(clienteId);
    },

    /**
     * Obtiene los períodos seleccionados de un cliente
     * @param {string} clienteId - ID del cliente
     * @returns {Array<string>}
     */
    obtenerPeriodosCliente(clienteId) {
        return this.periodosSeleccionados[clienteId] || [];
    },

    /**
     * Recopila todos los clientes con períodos seleccionados
     * @returns {Object} Objeto { clienteId: [periodos], ... }
     */
    recopilarSelecciones() {
        const selecciones = {};

        for (const cliente of this.requierenSeleccion) {
            const clienteId = cliente.usuario.id;

            // Solo incluir clientes NO excluidos
            if (!this.estaExcluido(clienteId)) {
                const periodos = this.obtenerPeriodosCliente(clienteId);

                if (periodos.length > 0) {
                    selecciones[clienteId] = periodos;
                }
            }
        }

        console.log('📋 Selecciones recopiladas:', selecciones);
        return selecciones;
    },

    /**
     * Valida que las selecciones sean correctas
     * @returns {Object} { valido: boolean, mensaje: string }
     */
    validarSelecciones() {
        const clientesNoExcluidos = this.requierenSeleccion.filter(
            c => !this.estaExcluido(c.usuario.id)
        );

        const clientesSinPeriodos = clientesNoExcluidos.filter(
            c => !this.periodosSeleccionados[c.usuario.id] ||
                 this.periodosSeleccionados[c.usuario.id].length === 0
        );

        if (clientesSinPeriodos.length > 0) {
            const nombres = clientesSinPeriodos.map(c => c.usuario.nombre).join(', ');
            return {
                valido: false,
                mensaje: `Los siguientes clientes no tienen períodos seleccionados: ${nombres}`
            };
        }

        return { valido: true, mensaje: 'Selecciones válidas' };
    },

    /**
     * Resetea el estado completo
     */
    reset() {
        this.procesadosAuto = [];
        this.requierenSeleccion = [];
        this.errores = [];
        this.periodosSeleccionados = {};
        this.clientesExcluidos.clear();
        this.usuariosOriginales = [];

        console.log('🔄 Estado reseteado');
    },

    /**
     * Obtiene estadísticas del estado actual
     * @returns {Object}
     */
    obtenerEstadisticas() {
        return {
            totalProcesadosAuto: this.procesadosAuto.length,
            totalRequierenSeleccion: this.requierenSeleccion.length,
            totalErrores: this.errores.length,
            clientesConSeleccion: Object.keys(this.periodosSeleccionados).length,
            clientesExcluidos: this.clientesExcluidos.size
        };
    }
};

// Exportar como módulo ES6
export default EstadoVEP;
