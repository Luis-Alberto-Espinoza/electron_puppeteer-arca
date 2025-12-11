/**
 * MÓDULO: Manejador de Períodos
 * Gestiona la lógica de selección de períodos y clientes
 */

import EstadoVEP from './estadoVEP.js';
import { renderizarGrupoRequierenSeleccion } from './renderizadorResultados.js';

/**
 * Inicializa todos los event listeners para checkboxes
 */
export function inicializarEventListeners() {
    const seccionResultados = document.getElementById('seccion-resultados');

    if (!seccionResultados) {
        console.error('❌ No se encontró la sección de resultados');
        return;
    }

    // Usar delegación de eventos
    seccionResultados.addEventListener('change', manejarCambioCheckbox);

    console.log('✅ Event listeners de períodos inicializados');
}

/**
 * Maneja el cambio en cualquier checkbox (delegación de eventos)
 * @param {Event} event - Evento de cambio
 */
function manejarCambioCheckbox(event) {
    const target = event.target;

    // Checkbox de incluir/excluir cliente
    if (target.classList.contains('checkbox-incluir-cliente')) {
        const clienteId = target.dataset.clienteId;
        manejarCheckboxCliente(clienteId, target.checked);
        return;
    }

    // Checkbox de período
    if (target.classList.contains('checkbox-periodo')) {
        const clienteId = target.dataset.clienteId;
        const periodo = target.dataset.periodo;
        manejarCheckboxPeriodo(clienteId, periodo, target.checked);
        return;
    }
}

/**
 * Maneja el checkbox de incluir/excluir un cliente
 * @param {string} clienteId - ID del cliente
 * @param {boolean} incluir - True para incluir, false para excluir
 */
function manejarCheckboxCliente(clienteId, incluir) {
    console.log(`🔘 Cliente ${clienteId}: ${incluir ? 'incluir' : 'excluir'}`);

    if (incluir) {
        EstadoVEP.incluirCliente(clienteId);
    } else {
        EstadoVEP.excluirCliente(clienteId);
    }

    // Actualizar visualización de la tarjeta
    actualizarVisualizacionTarjeta(clienteId);
}

/**
 * Maneja el checkbox de un período
 * @param {string} clienteId - ID del cliente
 * @param {string} periodo - Período seleccionado
 * @param {boolean} seleccionar - True para seleccionar, false para deseleccionar
 */
function manejarCheckboxPeriodo(clienteId, periodo, seleccionar) {
    console.log(`📅 Período ${periodo} de cliente ${clienteId}: ${seleccionar ? 'seleccionado' : 'deseleccionado'}`);

    if (seleccionar) {
        EstadoVEP.agregarSeleccionPeriodo(clienteId, periodo);
    } else {
        EstadoVEP.quitarSeleccionPeriodo(clienteId, periodo);
    }

    // Actualizar visualización de la fila
    actualizarVisualizacionFila(clienteId, periodo);
}

/**
 * Actualiza la visualización de una tarjeta de cliente
 * @param {string} clienteId - ID del cliente
 */
function actualizarVisualizacionTarjeta(clienteId) {
    const tarjeta = document.querySelector(`.tarjeta-cliente[data-cliente-id="${clienteId}"]`);

    if (!tarjeta) return;

    const estaExcluido = EstadoVEP.estaExcluido(clienteId);

    if (estaExcluido) {
        tarjeta.classList.add('excluido');
    } else {
        tarjeta.classList.remove('excluido');
    }
}

/**
 * Actualiza la visualización de una fila de período
 * @param {string} clienteId - ID del cliente
 * @param {string} periodo - Período
 */
function actualizarVisualizacionFila(clienteId, periodo) {
    const checkbox = document.querySelector(
        `.checkbox-periodo[data-cliente-id="${clienteId}"][data-periodo="${periodo}"]`
    );

    if (!checkbox) return;

    const fila = checkbox.closest('tr');
    if (!fila) return;

    const estaSeleccionado = checkbox.checked;

    if (estaSeleccionado) {
        fila.classList.add('seleccionada');
    } else {
        fila.classList.remove('seleccionada');
    }
}

/**
 * Recopila todas las selecciones del usuario
 * @returns {Object} Objeto con los datos para enviar al backend
 */
export function recopilarSelecciones() {
    const selecciones = EstadoVEP.recopilarSelecciones();
    const estadisticas = EstadoVEP.obtenerEstadisticas();

    console.log('📊 Selecciones recopiladas:');
    console.log('   Clientes con períodos:', Object.keys(selecciones).length);
    console.log('   Clientes excluidos:', estadisticas.clientesExcluidos);

    return {
        periodosSeleccionados: selecciones,
        clientesExcluidos: Array.from(EstadoVEP.clientesExcluidos)
    };
}

/**
 * Valida que las selecciones sean correctas antes de enviar
 * @returns {Object} { valido: boolean, mensaje: string }
 */
export function validarSelecciones() {
    const validacion = EstadoVEP.validarSelecciones();

    if (!validacion.valido) {
        console.warn('⚠️ Validación fallida:', validacion.mensaje);
    } else {
        console.log('✅ Validación exitosa');
    }

    return validacion;
}

/**
 * Selecciona todos los períodos de un cliente
 * @param {string} clienteId - ID del cliente
 */
export function seleccionarTodosLosPeriodos(clienteId) {
    const cliente = EstadoVEP.requierenSeleccion.find(c => c.usuario.id === clienteId);

    if (!cliente) return;

    cliente.periodos.forEach(periodo => {
        EstadoVEP.agregarSeleccionPeriodo(clienteId, periodo.periodo);
    });

    // Re-renderizar el grupo para actualizar UI
    renderizarGrupoRequierenSeleccion(EstadoVEP.requierenSeleccion);
    inicializarEventListeners();

    console.log(`✅ Todos los períodos de ${clienteId} seleccionados`);
}

/**
 * Deselecciona todos los períodos de un cliente
 * @param {string} clienteId - ID del cliente
 */
export function deseleccionarTodosLosPeriodos(clienteId) {
    delete EstadoVEP.periodosSeleccionados[clienteId];

    // Re-renderizar el grupo para actualizar UI
    renderizarGrupoRequierenSeleccion(EstadoVEP.requierenSeleccion);
    inicializarEventListeners();

    console.log(`❌ Todos los períodos de ${clienteId} deseleccionados`);
}

/**
 * Obtiene un resumen de las selecciones actuales
 * @returns {Object}
 */
export function obtenerResumenSelecciones() {
    const selecciones = EstadoVEP.recopilarSelecciones();

    let totalPeriodos = 0;
    for (const clienteId in selecciones) {
        totalPeriodos += selecciones[clienteId].length;
    }

    return {
        clientesConSeleccion: Object.keys(selecciones).length,
        totalPeriodos: totalPeriodos,
        clientesExcluidos: EstadoVEP.clientesExcluidos.size
    };
}

/**
 * Resetea todas las selecciones
 */
export function resetearSelecciones() {
    EstadoVEP.periodosSeleccionados = {};
    EstadoVEP.clientesExcluidos.clear();

    // Re-renderizar
    renderizarGrupoRequierenSeleccion(EstadoVEP.requierenSeleccion);
    inicializarEventListeners();

    console.log('🔄 Selecciones reseteadas');
}
