/**
 * MÓDULO: Renderizador de Resultados
 * Maneja el renderizado visual de los 3 grupos de resultados
 */

import { formatearCUIT, formatearMedioPago, formatearMoneda, formatearTotalPeriodo } from './utilidades.js';
import EstadoVEP from './estadoVEP.js';

/**
 * Muestra la sección completa de resultados
 */
export function mostrarSeccionResultados() {
    const seccion = document.getElementById('seccion-resultados');
    if (seccion) {
        seccion.style.display = 'block';
        console.log('✅ Sección de resultados mostrada');
    }
}

/**
 * Oculta la sección completa de resultados
 */
export function ocultarSeccionResultados() {
    const seccion = document.getElementById('seccion-resultados');
    if (seccion) {
        seccion.style.display = 'none';
        console.log('❌ Sección de resultados ocultada');
    }
}

/**
 * Renderiza el grupo de clientes procesados automáticamente
 * @param {Array} clientes - Array de clientes procesados
 */
export function renderizarGrupoProcesadosAuto(clientes) {
    const grupo = document.getElementById('grupo-procesados-auto');
    const contenido = document.getElementById('contenido-procesados-auto');
    const contador = document.getElementById('contador-procesados-auto');

    if (!clientes || clientes.length === 0) {
        grupo.style.display = 'none';
        return;
    }

    contador.textContent = clientes.length;
    grupo.style.display = 'block';

    const html = clientes.map(cliente => {
        const { usuario, medioPago, vepData } = cliente;

        return `
            <div class="tarjeta-cliente tarjeta-procesado">
                <div class="tarjeta-header">
                    <div class="cliente-info">
                        <span class="cliente-nombre">${usuario.nombre}</span>
                        <span class="cliente-cuit">${formatearCUIT(usuario.cuit)}</span>
                    </div>
                    <div class="cliente-medio-pago">
                        <span class="badge badge-medio-pago">${formatearMedioPago(medioPago)}</span>
                    </div>
                </div>
                <div class="tarjeta-body">
                    <div class="resultado-mensaje">
                        <span class="icono-exito">✓</span>
                        <span>VEP generado exitosamente</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenido.innerHTML = html;
}

/**
 * Renderiza el grupo de clientes que requieren selección
 * @param {Array} clientes - Array de clientes que requieren selección
 */
export function renderizarGrupoRequierenSeleccion(clientes) {
    const grupo = document.getElementById('grupo-requieren-seleccion');
    const contenido = document.getElementById('contenido-requieren-seleccion');
    const contador = document.getElementById('contador-requieren-seleccion');

    if (!clientes || clientes.length === 0) {
        grupo.style.display = 'none';
        return;
    }

    contador.textContent = clientes.length;
    grupo.style.display = 'block';

    const html = clientes.map(cliente => {
        const { usuario, medioPago, periodos } = cliente;
        const clienteId = usuario.id;
        const estaExcluido = EstadoVEP.estaExcluido(clienteId);

        return `
            <div class="tarjeta-cliente tarjeta-requiere-seleccion ${estaExcluido ? 'excluido' : ''}" data-cliente-id="${clienteId}">
                <!-- Header del cliente -->
                <div class="tarjeta-header">
                    <div class="cliente-info">
                        <label class="checkbox-cliente-wrapper">
                            <input
                                type="checkbox"
                                class="checkbox-incluir-cliente"
                                data-cliente-id="${clienteId}"
                                ${estaExcluido ? '' : 'checked'}
                            />
                            <span class="checkbox-label">Procesar este cliente</span>
                        </label>
                        <div class="cliente-detalles">
                            <span class="cliente-nombre">${usuario.nombre}</span>
                            <span class="cliente-cuit">${formatearCUIT(usuario.cuit)}</span>
                        </div>
                    </div>
                    <div class="cliente-medio-pago">
                        <span class="badge badge-medio-pago">${formatearMedioPago(medioPago)}</span>
                    </div>
                </div>

                <!-- Tabla de períodos -->
                <div class="tarjeta-body">
                    <div class="tabla-periodos-wrapper">
                        <table class="tabla-periodos-cliente">
                            <thead>
                                <tr>
                                    <th class="col-check">Seleccionar</th>
                                    <th class="col-periodo">Período</th>
                                    <th class="col-detalle">Detalle</th>
                                    <th class="col-total">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderizarFilasPeriodos(periodos, clienteId)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenido.innerHTML = html;

    // Mostrar botón de confirmar si hay clientes
    const btnConfirmar = document.getElementById('btn-confirmar-seleccion');
    if (btnConfirmar) {
        btnConfirmar.style.display = 'inline-block';
    }
}

/**
 * Renderiza las filas de períodos de un cliente
 * @param {Array} periodos - Array de períodos con sus filas
 * @param {string} clienteId - ID del cliente
 * @returns {string} HTML de las filas
 */
function renderizarFilasPeriodos(periodos, clienteId) {
    return periodos.map(periodo => {
        const { periodo: per, filas } = periodo;
        const periodosSeleccionados = EstadoVEP.obtenerPeriodosCliente(clienteId);
        const estaSeleccionado = periodosSeleccionados.includes(per);
        const total = formatearTotalPeriodo(filas);

        return `
            <tr class="fila-periodo ${estaSeleccionado ? 'seleccionada' : ''}">
                <td class="col-check">
                    <input
                        type="checkbox"
                        class="checkbox-periodo"
                        data-cliente-id="${clienteId}"
                        data-periodo="${per}"
                        ${estaSeleccionado ? 'checked' : ''}
                    />
                </td>
                <td class="col-periodo">
                    <strong>${per}</strong>
                </td>
                <td class="col-detalle">
                    ${renderizarDetallesPeriodo(filas)}
                </td>
                <td class="col-total">
                    <strong>${total}</strong>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Renderiza los detalles de las filas de un período
 * @param {Array} filas - Array de filas del período
 * @returns {string} HTML de los detalles
 */
function renderizarDetallesPeriodo(filas) {
    return `
        <div class="periodo-detalles">
            ${filas.map(fila => `
                <div class="detalle-fila">
                    <span class="detalle-impuesto">Imp. ${fila.impuesto}</span>
                    <span class="detalle-categoria">Cat. ${fila.categoria}</span>
                    <span class="detalle-importe">${formatearMoneda(fila.importe)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Renderiza el grupo de clientes con errores
 * @param {Array} clientes - Array de clientes con errores
 */
export function renderizarGrupoErrores(clientes) {
    const grupo = document.getElementById('grupo-errores');
    const contenido = document.getElementById('contenido-errores');
    const contador = document.getElementById('contador-errores');

    if (!clientes || clientes.length === 0) {
        grupo.style.display = 'none';
        return;
    }

    contador.textContent = clientes.length;
    grupo.style.display = 'block';

    const html = clientes.map(cliente => {
        const { usuario, medioPago, error } = cliente;

        return `
            <div class="tarjeta-cliente tarjeta-error">
                <div class="tarjeta-header">
                    <div class="cliente-info">
                        <span class="cliente-nombre">${usuario.nombre}</span>
                        <span class="cliente-cuit">${formatearCUIT(usuario.cuit)}</span>
                    </div>
                    <div class="cliente-medio-pago">
                        <span class="badge badge-medio-pago">${formatearMedioPago(medioPago)}</span>
                    </div>
                </div>
                <div class="tarjeta-body">
                    <div class="error-mensaje">
                        <span class="icono-error">✕</span>
                        <span class="error-texto">${error || 'Error desconocido'}</span>
                    </div>
                    <div class="error-acciones">
                        <button
                            class="btn-reintentar"
                            data-usuario-id="${usuario.id}"
                        >
                            🔄 Reintentar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenido.innerHTML = html;
}

/**
 * Renderiza todos los grupos a la vez
 */
export function renderizarTodosLosGrupos() {
    console.log('🎨 Renderizando todos los grupos...');

    renderizarGrupoProcesadosAuto(EstadoVEP.procesadosAuto);
    renderizarGrupoRequierenSeleccion(EstadoVEP.requierenSeleccion);
    renderizarGrupoErrores(EstadoVEP.errores);

    mostrarSeccionResultados();

    console.log('✅ Todos los grupos renderizados');
}

/**
 * Limpia todos los grupos
 */
export function limpiarTodosLosGrupos() {
    const contenidos = [
        'contenido-procesados-auto',
        'contenido-requieren-seleccion',
        'contenido-errores'
    ];

    contenidos.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.innerHTML = '';
    });

    ocultarSeccionResultados();
    console.log('🧹 Todos los grupos limpiados');
}
