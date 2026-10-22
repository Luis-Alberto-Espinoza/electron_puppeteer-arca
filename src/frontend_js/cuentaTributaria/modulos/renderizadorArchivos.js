/**
 * MÓDULO: Renderizador de Archivos Descargados (Cuenta Tributaria)
 * Muestra Excels de la 1ra pasada, PDFs de la 2da pasada y errores.
 *
 * Patrón inspirado en src/frontend_js/generar_VEP/modulos/renderizadorArchivos.js
 * — adaptado para tres tipos de bloque y delegación de eventos en el contenedor.
 */

import EstadoCT from './estadoCT.js';
import { formatearCUIT, formatearMedioPago, capitalizarTexto } from './utilidadesCT.js';

const ID_SECCION = 'seccion-archivos-descargados-ct';
const ID_LISTA   = 'lista-archivos-descargados-ct';

// ============================================================
// VISIBILIDAD
// ============================================================

export function mostrarSeccionArchivos() {
    const sec = document.getElementById(ID_SECCION);
    if (sec) {
        sec.style.display = 'block';
        // Llevar el foco visual a los archivos recién descargados. requestAnimationFrame
        // para que el layout ya esté calculado tras el cambio de display.
        requestAnimationFrame(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
}

export function ocultarSeccionArchivos() {
    const sec = document.getElementById(ID_SECCION);
    if (sec) sec.style.display = 'none';
}

export function limpiarArchivos() {
    const lista = document.getElementById(ID_LISTA);
    if (lista) lista.innerHTML = '';
    ocultarSeccionArchivos();
}

// ============================================================
// API PRINCIPAL
// ============================================================

/**
 * Renderiza la lista combinada: Excels (1ra pasada) + PDFs/errores (2da pasada).
 *
 * @param {Array} resultadosSegundaPasada Items de la respuesta de la 2da pasada
 *        (cada uno con cliente, cuitAsociado, status, pdfDescargado?, error?).
 * @param {{ incluirExcels?: boolean }} [opciones] incluirExcels:false para Flujo B
 *        (Generar VEP directo), que no tiene 1ra pasada con Excels.
 */
export function renderizarArchivosDescargados(resultadosSegundaPasada = [], { incluirExcels = true } = {}) {
    const lista = document.getElementById(ID_LISTA);
    if (!lista) {
        console.error('❌ No se encontró #' + ID_LISTA);
        return;
    }

    const bloques = [];

    // Excels de la 1ra pasada (los que tengan path). Solo Flujo A.
    const excels = incluirExcels
        ? (EstadoCT.requierenSeleccion || [])
            .filter(g => g.excelDescargado && g.excelDescargado.path)
            .map(g => ({
                tipo: 'excel',
                cliente: g.cliente,
                cuitAsociado: g.cuitAsociado,
                archivo: g.excelDescargado
            }))
        : [];
    if (excels.length > 0) {
        bloques.push(renderBloque('📑 Excels descargados', excels.map(renderItemExcel).join('')));
    }

    // PDFs de la 2da pasada.
    const pdfs = (resultadosSegundaPasada || [])
        .filter(r => r && r.status === 'success' && r.pdfDescargado && r.pdfDescargado.path);
    if (pdfs.length > 0) {
        bloques.push(renderBloque('🧾 VEPs generados', pdfs.map(renderItemPdf).join('')));
    }

    // Errores y casos sin-match.
    const erroresOrange = (resultadosSegundaPasada || [])
        .filter(r => r && r.status && r.status !== 'success');
    if (erroresOrange.length > 0) {
        bloques.push(renderBloque('⚠️ Con problemas', erroresOrange.map(renderItemError).join('')));
    }

    if (bloques.length === 0) {
        lista.innerHTML = `
            <div style="text-align:center; padding:32px; color:var(--v-texto-2, #6b7280);">
                <p>No hay archivos para mostrar.</p>
            </div>
        `;
        mostrarSeccionArchivos();
        return;
    }

    lista.innerHTML = bloques.join('');
    // Botones Abrir / Carpeta: componente común (componentes/archivoResultado)
    window.archivoResultado.completarBotones(lista, { etiquetaAbrir: 'Abrir', etiquetaCarpeta: 'Carpeta' });
    mostrarSeccionArchivos();
    console.log(`✅ Archivos CT renderizados: ${excels.length} Excel(s), ${pdfs.length} PDF(s), ${erroresOrange.length} con problemas`);
}

// ============================================================
// BLOQUES
// ============================================================

function renderBloque(titulo, htmlItems) {
    return `
        <div class="bloque-archivos-ct">
            <h3 class="bloque-archivos-titulo">${titulo}</h3>
            <div class="bloque-archivos-items">${htmlItems}</div>
        </div>
    `;
}

function renderItemExcel({ cliente, cuitAsociado, archivo }) {
    return `
        <div class="archivo-item">
            <div class="archivo-info">
                <div class="archivo-icono">📑</div>
                <div class="archivo-detalles">
                    <div class="archivo-usuario">${capitalizarTexto((cliente && cliente.nombre) || '')} — ${formatearCUIT(cuitAsociado)}</div>
                    <div class="archivo-nombre">${escapeHtml(archivo.nombre || 'Excel')}</div>
                </div>
            </div>
            <div class="archivo-acciones" data-ruta-archivo="${escapeAttr(archivo.path)}"></div>
        </div>
    `;
}

function renderItemPdf(resultado) {
    const { cliente, cuitAsociado, medioPago, pdfDescargado } = resultado;
    const datos = pdfDescargado.datos || {};
    const etiquetaPeriodo = datos.periodo
        ? `Período ${datos.periodo}`
        : (datos.esConsolidado
            ? (datos.cantidadSubVeps
                ? `Consolidado (${datos.cantidadSubVeps} subVEPs)`
                : 'Consolidado')
            : null);
    const lineaMeta = [
        datos.nroVep ? `Nro VEP ${datos.nroVep}` : null,
        etiquetaPeriodo,
        medioPago ? formatearMedioPago(medioPago) : null
    ].filter(Boolean).join(' · ');

    return `
        <div class="archivo-item">
            <div class="archivo-info">
                <div class="archivo-icono">🧾</div>
                <div class="archivo-detalles">
                    <div class="archivo-usuario">${capitalizarTexto((cliente && cliente.nombre) || '')} — ${formatearCUIT(cuitAsociado)}</div>
                    <div class="archivo-nombre">${escapeHtml(pdfDescargado.nombre || 'VEP.pdf')}</div>
                    ${lineaMeta ? `<div class="archivo-meta">${escapeHtml(lineaMeta)}</div>` : ''}
                </div>
            </div>
            <div class="archivo-acciones" data-ruta-archivo="${escapeAttr(pdfDescargado.path)}"></div>
        </div>
    `;
}

function renderItemError(resultado) {
    const { cliente, cuitAsociado, status, error } = resultado;
    const etiqueta = status === 'sin-match' ? 'Sin coincidencias' : 'Error';
    return `
        <div class="archivo-item archivo-item-error">
            <div class="archivo-info">
                <div class="archivo-icono">⚠️</div>
                <div class="archivo-detalles">
                    <div class="archivo-usuario">${capitalizarTexto((cliente && cliente.nombre) || '')} — ${formatearCUIT(cuitAsociado)}</div>
                    <div class="archivo-nombre">${etiqueta}</div>
                    <div class="archivo-meta">${escapeHtml(error || 'Sin detalles')}</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#96;');
}
