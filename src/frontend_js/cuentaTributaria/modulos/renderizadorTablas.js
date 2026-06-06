/**
 * MÓDULO: Renderizador de Tablas (Cuenta Tributaria)
 * Renderiza los 3 grupos de resultados de la primera pasada del Flujo A.
 */

import {
    formatearCUIT,
    formatearMoneda,
    formatearMedioPago,
    capitalizarTexto,
    formatearPeriodoAAAAMM,
    sumarImportes,
    parseImporte
} from './utilidadesCT.js';
import EstadoCT from './estadoCT.js';

/**
 * Medios de pago disponibles (mismo set que el módulo VEP).
 * Si en el futuro se centralizan, importar de un módulo único.
 */
export const MEDIOS_PAGO = [
    { id: 'pago_qr', nombre: 'Pago QR' },
    { id: 'pagar_link', nombre: 'Pagar Link' },
    { id: 'pago_mis_cuentas', nombre: 'Pago Mis Cuentas' },
    { id: 'interbanking', nombre: 'Interbanking' },
    { id: 'xn_group', nombre: 'XN Group' }
];

// ============================================================
// VISIBILIDAD DE LA SECCIÓN
// ============================================================

export function mostrarSeccionResultados() {
    const sec = document.getElementById('seccion-resultados-ct');
    if (sec) {
        sec.style.display = 'block';
        // Llevar el foco visual al resultado recién aparecido. requestAnimationFrame
        // para que el layout ya esté calculado tras el cambio de display.
        requestAnimationFrame(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
}

export function ocultarSeccionResultados() {
    const sec = document.getElementById('seccion-resultados-ct');
    if (sec) sec.style.display = 'none';
}

// ============================================================
// GRUPO: PROCESADOS AUTOMÁTICAMENTE (sin deuda)
// ============================================================

export function renderizarGrupoProcesadosAuto(items) {
    const grupo = document.getElementById('grupo-procesados-auto-ct');
    const contenido = document.getElementById('contenido-procesados-auto-ct');
    const contador = document.getElementById('contador-procesados-auto-ct');

    if (!items || items.length === 0) {
        if (grupo) grupo.style.display = 'none';
        return;
    }

    contador.textContent = items.length;
    grupo.style.display = 'block';

    const html = items.map(item => {
        const { cliente, cuitAsociado, medioPago, sinDeuda, message, excelDescargado } = item;
        const icono = sinDeuda ? 'ℹ️' : '✓';
        const mensaje = sinDeuda
            ? (message || 'Sin deuda pendiente')
            : (message || 'Procesado correctamente');

        return `
            <div class="tarjeta-grupo tarjeta-procesado">
                <div class="tarjeta-header">
                    <div class="grupo-info">
                        <div class="grupo-detalles">
                            <span class="grupo-cliente-nombre">${capitalizarTexto(cliente.nombre || '')}</span>
                            <span class="grupo-cuit">${formatearCUIT(cuitAsociado)}</span>
                            ${cliente.cuitLogin && cliente.cuitLogin !== cuitAsociado
                                ? `<span class="grupo-cuit-login">login: ${formatearCUIT(cliente.cuitLogin)}</span>`
                                : ''}
                        </div>
                    </div>
                    ${medioPago ? `<div><span class="badge-medio-pago">${formatearMedioPago(medioPago)}</span></div>` : ''}
                </div>
                <div class="tarjeta-body">
                    <div class="resultado-mensaje">
                        <span class="icono-exito">${icono}</span>
                        <span>${mensaje}</span>
                        ${excelDescargado
                            ? `<span style="margin-left:auto; font-size:12px; color:#6b7280;">📄 Excel descargado</span>`
                            : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenido.innerHTML = html;
}

// ============================================================
// GRUPO: REQUIEREN SELECCIÓN DE FILAS
// ============================================================

export function renderizarGrupoRequierenSeleccion(items) {
    const grupo = document.getElementById('grupo-requieren-seleccion-ct');
    const contenido = document.getElementById('contenido-requieren-seleccion-ct');
    const contador = document.getElementById('contador-requieren-seleccion-ct');

    if (!items || items.length === 0) {
        if (grupo) grupo.style.display = 'none';
        const btn = document.getElementById('btn-confirmar-seleccion-ct');
        if (btn) btn.style.display = 'none';
        return;
    }

    contador.textContent = items.length;
    grupo.style.display = 'block';

    const html = items.map(item => {
        const { cliente, cuitAsociado, deudas, totales, excelDescargado } = item;
        const excluido = EstadoCT.estaExcluido(cliente.id, cuitAsociado);
        const medioPagoActual = EstadoCT.obtenerMedioPagoGrupo(cliente.id, cuitAsociado);

        return `
            <div class="tarjeta-grupo tarjeta-requiere-seleccion ${excluido ? 'excluido' : ''}"
                 data-cliente-id="${cliente.id}"
                 data-cuit="${cuitAsociado}">

                <div class="tarjeta-header">
                    <div class="grupo-info">
                        <label class="checkbox-grupo-wrapper">
                            <input type="checkbox"
                                   class="checkbox-incluir-grupo"
                                   data-cliente-id="${cliente.id}"
                                   data-cuit="${cuitAsociado}"
                                   ${excluido ? '' : 'checked'} />
                            <span class="checkbox-label">Procesar este CUIT</span>
                        </label>
                        <div class="grupo-detalles">
                            <span class="grupo-cliente-nombre">${capitalizarTexto(cliente.nombre || '')}</span>
                            <span class="grupo-cuit">${formatearCUIT(cuitAsociado)}</span>
                            ${cliente.cuitLogin && cliente.cuitLogin !== cuitAsociado
                                ? `<span class="grupo-cuit-login">login: ${formatearCUIT(cliente.cuitLogin)}</span>`
                                : ''}
                            ${excelDescargado
                                ? `<span style="font-size:12px; color:#10b981;">📄 Excel ✓</span>`
                                : ''}
                        </div>
                    </div>
                </div>

                <div class="tarjeta-body">
                    ${renderizarTablaDeudas(deudas, cliente.id, cuitAsociado)}
                    ${renderizarTotalesTabla(totales, deudas)}

                    <div class="selector-medio-pago-grupo selector-medio-pago-pie">
                        <label>💳 Medio de pago:</label>
                        <select class="select-medio-pago-grupo"
                                data-cliente-id="${cliente.id}"
                                data-cuit="${cuitAsociado}">
                            <option value="">— Elegir —</option>
                            ${MEDIOS_PAGO.map(m => `
                                <option value="${m.id}"
                                        ${medioPagoActual && medioPagoActual.id === m.id ? 'selected' : ''}>
                                    ${m.nombre}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenido.innerHTML = html;

    const btn = document.getElementById('btn-confirmar-seleccion-ct');
    if (btn) btn.style.display = 'inline-block';
}

/**
 * Renderiza la tabla de filas de deuda para un grupo.
 */
function renderizarTablaDeudas(deudas, clienteId, cuitAsociado) {
    if (!deudas || deudas.length === 0) {
        return '<p style="color:#6b7280; font-size:13px; padding:12px;">Sin filas extraídas</p>';
    }

    return `
        <div class="tabla-deuda-wrapper">
            <table class="tabla-deuda">
                <thead>
                    <tr>
                        <th class="col-check"></th>
                        <th class="col-periodo">Período</th>
                        <th class="col-impuesto">Imp.</th>
                        <th class="col-concepto">Conc.</th>
                        <th class="col-subconcepto">Sub.</th>
                        <th>Venc.</th>
                        <th class="col-importe">Saldo</th>
                        <th class="col-importe">Int. Resarc.</th>
                        <th class="col-importe">Int. Punit.</th>
                        <th class="col-importe">Total fila</th>
                    </tr>
                </thead>
                <tbody>
                    ${deudas.map(fila => renderizarFilaDeuda(fila, clienteId, cuitAsociado)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderizarFilaDeuda(fila, clienteId, cuitAsociado) {
    const seleccionada = EstadoCT.estaFilaSeleccionada(clienteId, cuitAsociado, fila.id);
    const totalFila = (parseImporte(fila.saldo) || 0)
                    + (parseImporte(fila.intResarcitorio) || 0)
                    + (parseImporte(fila.intPunitorio) || 0);

    return `
        <tr class="fila-deuda ${seleccionada ? 'seleccionada' : ''}"
            data-fila-id="${fila.id || ''}">
            <td class="col-check">
                <input type="checkbox"
                       class="checkbox-fila"
                       data-cliente-id="${clienteId}"
                       data-cuit="${cuitAsociado}"
                       data-fila-id="${fila.id || ''}"
                       ${seleccionada ? 'checked' : ''}
                       ${fila.id ? '' : 'disabled'} />
            </td>
            <td class="col-periodo"><strong>${formatearPeriodoAAAAMM(fila.periodo)}</strong></td>
            <td class="col-impuesto">${fila.impuesto || ''}</td>
            <td class="col-concepto">${fila.concepto || ''}</td>
            <td class="col-subconcepto">${fila.subconcepto || ''}</td>
            <td>${fila.vencimiento || ''}</td>
            <td class="col-importe">${formatearMoneda(fila.saldo)}</td>
            <td class="col-importe">${formatearMoneda(fila.intResarcitorio)}</td>
            <td class="col-importe">${formatearMoneda(fila.intPunitorio)}</td>
            <td class="col-importe">${formatearMoneda(totalFila)}</td>
        </tr>
    `;
}

function renderizarTotalesTabla(totales, deudas) {
    // Si el backend trajo totales, mostramos los originales; si no, sumamos las filas.
    const subtotal = totales && totales.subtotal != null
        ? totales.subtotal
        : sumarImportes((deudas || []).map(d => ({ importe: d.saldo })));
    const total = totales && totales.total != null
        ? totales.total
        : sumarImportes((deudas || []).map(d => ({
              importe: (parseImporte(d.saldo) || 0)
                     + (parseImporte(d.intResarcitorio) || 0)
                     + (parseImporte(d.intPunitorio) || 0)
          })));

    return `
        <div class="tabla-totales">
            <div>
                <span class="total-label">Subtotal:</span>
                <span class="total-valor">${formatearMoneda(subtotal)}</span>
            </div>
            <div>
                <span class="total-label">Total:</span>
                <span class="total-valor">${formatearMoneda(total)}</span>
            </div>
        </div>
    `;
}

// ============================================================
// GRUPO: ERRORES
// ============================================================

export function renderizarGrupoErrores(items) {
    const grupo = document.getElementById('grupo-errores-ct');
    const contenido = document.getElementById('contenido-errores-ct');
    const contador = document.getElementById('contador-errores-ct');

    if (!items || items.length === 0) {
        if (grupo) grupo.style.display = 'none';
        return;
    }

    contador.textContent = items.length;
    grupo.style.display = 'block';

    const html = items.map(item => {
        const { cliente, cuitAsociado, error } = item;
        return `
            <div class="tarjeta-grupo tarjeta-error">
                <div class="tarjeta-header">
                    <div class="grupo-info">
                        <div class="grupo-detalles">
                            <span class="grupo-cliente-nombre">${capitalizarTexto(cliente.nombre || '')}</span>
                            <span class="grupo-cuit">${formatearCUIT(cuitAsociado)}</span>
                        </div>
                    </div>
                </div>
                <div class="tarjeta-body">
                    <div class="error-mensaje">
                        <span class="icono-error">✕</span>
                        <span class="error-texto">${error || 'Error desconocido'}</span>
                    </div>
                    <div class="error-acciones">
                        <button class="btn-reintentar"
                                data-cliente-id="${cliente.id}"
                                data-cuit="${cuitAsociado}">
                            🔄 Reintentar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contenido.innerHTML = html;
}

// ============================================================
// ORQUESTADORES
// ============================================================

export function renderizarTodosLosGrupos() {
    renderizarGrupoProcesadosAuto(EstadoCT.procesadosAuto);
    renderizarGrupoRequierenSeleccion(EstadoCT.requierenSeleccion);
    renderizarGrupoErrores(EstadoCT.errores);
    mostrarSeccionResultados();
}

export function limpiarTodosLosGrupos() {
    ['contenido-procesados-auto-ct',
     'contenido-requieren-seleccion-ct',
     'contenido-errores-ct'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
    ocultarSeccionResultados();
}
