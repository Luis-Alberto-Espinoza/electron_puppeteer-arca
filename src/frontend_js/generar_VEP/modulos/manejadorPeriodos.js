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

    // Usar delegación de eventos (evitar duplicar si ya se inicializó)
    seccionResultados.removeEventListener('change', manejarCambioCheckbox);
    seccionResultados.addEventListener('change', manejarCambioCheckbox);

    seccionResultados.removeEventListener('click', manejarClickBoton);
    seccionResultados.addEventListener('click', manejarClickBoton);

    console.log('✅ Event listeners de períodos inicializados');
}

/**
 * Maneja clicks delegados en botones dentro de la sección de resultados.
 * Hoy solo: "Seleccionar todos / Quitar todos" de cada tabla de períodos.
 * @param {Event} event
 */
function manejarClickBoton(event) {
    const btn = event.target.closest('.btn-seleccionar-todos-periodos');
    if (!btn) return;

    const clienteId = btn.dataset.clienteId;
    const tipo = btn.dataset.tipo; // 'obligaciones' | 'intereses'
    alternarSeleccionTabla(clienteId, tipo);
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
        const tipo = target.dataset.tipo || 'obligaciones';
        manejarCheckboxPeriodo(clienteId, periodo, tipo, target.checked);
        return;
    }
}

/**
 * Maneja el checkbox de incluir/excluir un cliente
 * @param {string} clienteId - ID del cliente
 * @param {boolean} incluir - True para incluir, false para excluir
 */
function manejarCheckboxCliente(clienteId, incluir) {
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
function manejarCheckboxPeriodo(clienteId, periodo, tipo, seleccionar) {
    if (seleccionar) {
        EstadoVEP.agregarSeleccionPeriodo(clienteId, periodo, tipo);
    } else {
        EstadoVEP.quitarSeleccionPeriodo(clienteId, periodo, tipo);
    }

    // Actualizar visualización de la fila
    actualizarVisualizacionFila(clienteId, periodo, tipo);
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
function actualizarVisualizacionFila(clienteId, periodo, tipo = 'obligaciones') {
    const checkbox = document.querySelector(
        `.checkbox-periodo[data-cliente-id="${clienteId}"][data-periodo="${periodo}"][data-tipo="${tipo}"]`
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
 * Alterna la selección de TODOS los períodos de una tabla (obligaciones o
 * intereses) de un cliente. Si ya están todos seleccionados, los quita; si no,
 * los selecciona todos. Pensado para tablas grandes donde tildar de a uno es
 * engorroso.
 *
 * @param {string} clienteId - ID del cliente
 * @param {string} tipo - 'obligaciones' | 'intereses'
 */
export function alternarSeleccionTabla(clienteId, tipo) {
    const cliente = EstadoVEP.requierenSeleccion.find(
        c => String(c.usuario.id) === String(clienteId)
    );
    if (!cliente || !cliente.periodos) return;

    const lista = cliente.periodos[tipo] || [];
    if (lista.length === 0) return;

    // ¿Ya están todos los de ESTA tabla? → el botón quita; si no, agrega.
    const todosSeleccionados = lista.every(
        p => EstadoVEP.estaPeriodoSeleccionado(clienteId, p.periodo, tipo)
    );

    lista.forEach(p => {
        if (todosSeleccionados) {
            EstadoVEP.quitarSeleccionPeriodo(clienteId, p.periodo, tipo);
        } else {
            EstadoVEP.agregarSeleccionPeriodo(clienteId, p.periodo, tipo);
        }
    });

    // Re-renderizar el grupo para reflejar el nuevo estado (checkboxes + botón).
    // La delegación de eventos vive en el contenedor padre persistente, así que
    // NO hace falta re-inicializar listeners (evitamos duplicarlos).
    renderizarGrupoRequierenSeleccion(EstadoVEP.requierenSeleccion);

    console.log(`${todosSeleccionados ? '❌ Quitados' : '✅ Seleccionados'} todos los períodos de ${tipo} del cliente ${clienteId}`);
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
