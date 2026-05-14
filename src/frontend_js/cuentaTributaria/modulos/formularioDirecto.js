/**
 * MÓDULO: Formulario Directo (Flujo B)
 *
 * Maneja la UI y el estado del Flujo B "Generar VEP directo":
 *   - Una sub-card por cada (cliente, cuit) seleccionado.
 *   - En cada card: tabla dinámica de entradas (periodo + impuesto) + medio de pago.
 *   - Validación de periodo (AAAAMM o MM/AAAA) e impuesto (predefinido o libre).
 *   - Construcción del payload IPC para `cuentaTributaria:procesar` modo
 *     'generar-directo'.
 *
 * Cada entrada se identifica por { groupKey: "<clienteId>|<cuit>", entryId: <uid> }.
 */

import { formatearCUIT, capitalizarTexto } from './utilidadesCT.js';
import { MEDIOS_PAGO } from './renderizadorTablas.js';

// ============================================================
// CONSTANTES
// ============================================================

/**
 * Lista de impuestos predefinidos. "otro" abre input libre.
 * Ampliable en el futuro.
 */
export const IMPUESTOS_DIRECTO = [
    { codigo: '30',  nombre: 'IVA' },
    { codigo: '301', nombre: 'Aportes Seg. Social (Empleador)' },
    { codigo: '351', nombre: 'Contribuciones Seg. Social' },
    { codigo: 'otro', nombre: 'Otro (código manual)' }
];

const ID_CONTENEDOR = 'formularios-directo-ct';
const ID_BTN_GENERAR = 'btn-generar-directo-ct';
const ID_CONTADOR = 'contador-grupos-directo-ct';

// ============================================================
// ESTADO (singleton de módulo)
// ============================================================

/**
 * estado.grupos: { [clave]: { cliente, cuitAsociado, entradas: [{id, periodo, impuesto, impuestoCustom}], medioPagoId } }
 * estado.gruposActivos: Set<clave>  (los que están seleccionados en el selector)
 */
const estado = {
    grupos: {},
    gruposActivos: new Set(),
    onCambio: null,
    uidContador: 1
};

function clave(clienteId, cuit) {
    return `${clienteId}|${cuit}`;
}

function uid() {
    return `e${estado.uidContador++}`;
}

// ============================================================
// API PÚBLICA
// ============================================================

/**
 * Inicializa el módulo (registra event listeners delegados sobre el contenedor).
 * @param {Function} onCambio  Callback que se invoca cuando cambia el estado
 *                             (para que el controlador refresque el contador / botón).
 */
export function inicializarFormularioDirecto({ onCambio } = {}) {
    estado.onCambio = onCambio || null;

    const contenedor = document.getElementById(ID_CONTENEDOR);
    if (!contenedor) {
        console.warn('⚠️ No existe #' + ID_CONTENEDOR);
        return;
    }

    // Delegación de eventos.
    contenedor.addEventListener('click', onClickContenedor);
    contenedor.addEventListener('change', onChangeContenedor);
    contenedor.addEventListener('input', onInputContenedor);
}

/**
 * Reemplaza la lista de grupos activos según los pares (cliente, cuit)
 * seleccionados en el selector.
 *
 * @param {Array<{cliente, cuitAsociado}>} items
 */
export function actualizarGrupos(items) {
    const nuevasClaves = new Set();
    for (const it of items || []) {
        const cliId = it.cliente && it.cliente.id;
        const cuit = it.cuitAsociado;
        if (!cliId || !cuit) continue;

        const k = clave(cliId, cuit);
        nuevasClaves.add(k);

        if (!estado.grupos[k]) {
            estado.grupos[k] = {
                cliente: it.cliente,
                cuitAsociado: cuit,
                entradas: [crearEntradaVacia()],
                medioPagoId: ''
            };
        }
    }

    // Limpiar grupos que ya no están seleccionados.
    for (const k of Object.keys(estado.grupos)) {
        if (!nuevasClaves.has(k)) {
            delete estado.grupos[k];
        }
    }
    estado.gruposActivos = nuevasClaves;

    renderizar();
    notificarCambio();
}

/**
 * Reset total del estado y la UI (al salir o iniciar nuevo proceso).
 */
export function resetFormularioDirecto() {
    estado.grupos = {};
    estado.gruposActivos.clear();
    const contenedor = document.getElementById(ID_CONTENEDOR);
    if (contenedor) contenedor.innerHTML = '';
    notificarCambio();
}

/**
 * Devuelve los items listos para enviar al backend (modo 'generar-directo').
 * Solo incluye grupos con al menos una entrada válida y medio de pago.
 *
 * @returns {Array<{cliente, cuitAsociado, deudasABuscar, medioPago}>}
 */
export function recopilarItems() {
    const items = [];
    for (const k of Object.keys(estado.grupos)) {
        const g = estado.grupos[k];
        const deudasABuscar = entradasValidas(g.entradas);
        if (deudasABuscar.length === 0) continue;
        const medioPago = MEDIOS_PAGO.find(m => m.id === g.medioPagoId);
        if (!medioPago) continue;

        items.push({
            cliente: g.cliente,
            cuitAsociado: g.cuitAsociado,
            deudasABuscar,
            medioPago
        });
    }
    return items;
}

/**
 * Validación global para habilitar/deshabilitar el botón.
 *
 * @returns {{ valido: boolean, mensaje: string, cantidad: number }}
 */
export function validar() {
    const claves = Object.keys(estado.grupos);
    if (claves.length === 0) {
        return { valido: false, mensaje: 'Seleccione al menos un cliente y CUIT', cantidad: 0 };
    }
    const items = recopilarItems();
    if (items.length === 0) {
        return {
            valido: false,
            mensaje: 'Agregue al menos una deuda válida y elija medio de pago en cada grupo',
            cantidad: 0
        };
    }
    // Avisar grupos incompletos (no inválida, pero útil).
    const incompletos = claves.length - items.length;
    return {
        valido: true,
        cantidad: items.length,
        mensaje: incompletos > 0
            ? `${items.length} grupo(s) listos · ${incompletos} sin completar (no se procesarán)`
            : `${items.length} grupo(s) listos`
    };
}

// ============================================================
// LÓGICA INTERNA — entradas y validación
// ============================================================

function crearEntradaVacia() {
    return {
        id: uid(),
        periodo: '',          // texto que tipea el usuario (MM/AAAA o AAAAMM)
        impuesto: '30',       // 'otro' o código numérico
        impuestoCustom: ''    // solo si impuesto === 'otro'
    };
}

/**
 * Convierte el periodo escrito a AAAAMM o devuelve null si es inválido.
 * Acepta: 'AAAAMM' (6 dígitos), 'MM/AAAA' o 'M/AAAA' (con barra).
 */
function normalizarPeriodo(txt) {
    if (!txt) return null;
    const s = String(txt).trim();
    // AAAAMM
    let m = s.match(/^(\d{4})(\d{2})$/);
    if (m) {
        const yyyy = m[1], mm = m[2];
        if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12 && parseInt(yyyy, 10) >= 2000) {
            return `${yyyy}${mm}`;
        }
        return null;
    }
    // MM/AAAA o M/AAAA
    m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
        const mm = m[1].padStart(2, '0');
        const yyyy = m[2];
        if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12 && parseInt(yyyy, 10) >= 2000) {
            return `${yyyy}${mm}`;
        }
        return null;
    }
    return null;
}

/**
 * Devuelve el código de impuesto efectivo, o null si es inválido.
 */
function normalizarImpuesto(entrada) {
    if (entrada.impuesto !== 'otro') {
        return entrada.impuesto || null;
    }
    const custom = (entrada.impuestoCustom || '').trim();
    if (/^\d{1,4}$/.test(custom)) return custom;
    return null;
}

function entradaEsValida(entrada) {
    return !!normalizarPeriodo(entrada.periodo) && !!normalizarImpuesto(entrada);
}

function entradasValidas(entradas) {
    const out = [];
    for (const e of (entradas || [])) {
        const periodo = normalizarPeriodo(e.periodo);
        const impuesto = normalizarImpuesto(e);
        if (periodo && impuesto) {
            out.push({ periodo, impuesto });
        }
    }
    return out;
}

function notificarCambio() {
    if (typeof estado.onCambio === 'function') {
        try { estado.onCambio(validar()); } catch (e) { console.error(e); }
    }
    actualizarBotonYContador();
}

function actualizarBotonYContador() {
    const v = validar();
    const btn = document.getElementById(ID_BTN_GENERAR);
    const cont = document.getElementById(ID_CONTADOR);
    if (cont) cont.textContent = String(v.cantidad);
    if (btn) {
        btn.disabled = !v.valido;
        btn.title = v.mensaje;
    }
}

// ============================================================
// EVENT HANDLERS (delegados sobre #formularios-directo-ct)
// ============================================================

function leerDataset(target) {
    return {
        groupKey: target.dataset.groupKey,
        entryId: target.dataset.entryId
    };
}

function onClickContenedor(ev) {
    const t = ev.target.closest('button');
    if (!t) return;

    if (t.classList.contains('btn-agregar-entrada')) {
        const { groupKey } = leerDataset(t);
        agregarEntrada(groupKey);
        return;
    }
    if (t.classList.contains('btn-eliminar-entrada')) {
        const { groupKey, entryId } = leerDataset(t);
        eliminarEntrada(groupKey, entryId);
        return;
    }
}

function onChangeContenedor(ev) {
    const t = ev.target;
    if (!t) return;

    if (t.classList.contains('select-impuesto-directo')) {
        const { groupKey, entryId } = leerDataset(t);
        actualizarEntrada(groupKey, entryId, { impuesto: t.value });
        // Re-render solo de la fila para mostrar/ocultar el input "otro".
        renderizar();
        return;
    }
    if (t.classList.contains('select-medio-pago-directo')) {
        const groupKey = t.dataset.groupKey;
        if (!estado.grupos[groupKey]) return;
        estado.grupos[groupKey].medioPagoId = t.value;
        notificarCambio();
        return;
    }
}

function onInputContenedor(ev) {
    const t = ev.target;
    if (!t) return;

    if (t.classList.contains('input-periodo-directo')) {
        const { groupKey, entryId } = leerDataset(t);
        actualizarEntrada(groupKey, entryId, { periodo: t.value });
        actualizarValidacionFila(groupKey, entryId);
        notificarCambio();
        return;
    }
    if (t.classList.contains('input-impuesto-custom')) {
        const { groupKey, entryId } = leerDataset(t);
        actualizarEntrada(groupKey, entryId, { impuestoCustom: t.value });
        actualizarValidacionFila(groupKey, entryId);
        notificarCambio();
        return;
    }
}

// ============================================================
// MUTACIONES DE ESTADO
// ============================================================

function agregarEntrada(groupKey) {
    if (!estado.grupos[groupKey]) return;
    estado.grupos[groupKey].entradas.push(crearEntradaVacia());
    renderizar();
    notificarCambio();
}

function eliminarEntrada(groupKey, entryId) {
    const g = estado.grupos[groupKey];
    if (!g) return;
    g.entradas = g.entradas.filter(e => e.id !== entryId);
    if (g.entradas.length === 0) {
        // Siempre dejar una entrada vacía visible.
        g.entradas.push(crearEntradaVacia());
    }
    renderizar();
    notificarCambio();
}

function actualizarEntrada(groupKey, entryId, parcial) {
    const g = estado.grupos[groupKey];
    if (!g) return;
    const e = g.entradas.find(x => x.id === entryId);
    if (!e) return;
    Object.assign(e, parcial);
}

// ============================================================
// RENDER
// ============================================================

function renderizar() {
    const cont = document.getElementById(ID_CONTENEDOR);
    if (!cont) return;

    const claves = Object.keys(estado.grupos);
    if (claves.length === 0) {
        cont.innerHTML = `
            <div class="formulario-directo-vacio">
                Seleccione un cliente y al menos un CUIT para empezar a cargar deudas.
            </div>
        `;
        actualizarBotonYContador();
        return;
    }

    cont.innerHTML = claves.map(k => renderGrupo(k, estado.grupos[k])).join('');
    actualizarBotonYContador();
}

function renderGrupo(groupKey, g) {
    return `
        <div class="card-grupo-directo" data-group-key="${escapeAttr(groupKey)}">
            <div class="card-grupo-header">
                <div class="card-grupo-info">
                    <span class="card-grupo-cliente">${capitalizarTexto((g.cliente && g.cliente.nombre) || '')}</span>
                    <span class="card-grupo-cuit">${formatearCUIT(g.cuitAsociado)}</span>
                </div>
                <div class="card-grupo-medio">
                    <label>Medio de pago:</label>
                    <select class="select-medio-pago-directo" data-group-key="${escapeAttr(groupKey)}">
                        <option value="">— Elegir —</option>
                        ${MEDIOS_PAGO.map(m => `
                            <option value="${m.id}" ${g.medioPagoId === m.id ? 'selected' : ''}>
                                ${m.nombre}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>

            <div class="card-grupo-body">
                <table class="tabla-entradas-directo">
                    <thead>
                        <tr>
                            <th class="col-periodo-directo">Período (MM/AAAA o AAAAMM)</th>
                            <th class="col-impuesto-directo">Impuesto</th>
                            <th class="col-acciones-directo"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${g.entradas.map(e => renderEntrada(groupKey, e)).join('')}
                    </tbody>
                </table>
                <button class="btn-agregar-entrada" data-group-key="${escapeAttr(groupKey)}">
                    + Agregar deuda
                </button>
            </div>
        </div>
    `;
}

function renderEntrada(groupKey, e) {
    const valida = entradaEsValida(e);
    const periodoOk = !!normalizarPeriodo(e.periodo);
    const impuestoOk = !!normalizarImpuesto(e);

    return `
        <tr class="fila-entrada-directo ${valida ? 'fila-valida' : ''}"
            data-entry-id="${escapeAttr(e.id)}">
            <td class="col-periodo-directo">
                <input type="text"
                       class="input-periodo-directo ${e.periodo && !periodoOk ? 'input-invalido' : ''}"
                       data-group-key="${escapeAttr(groupKey)}"
                       data-entry-id="${escapeAttr(e.id)}"
                       value="${escapeAttr(e.periodo)}"
                       placeholder="ej: 12/2024" />
            </td>
            <td class="col-impuesto-directo">
                <select class="select-impuesto-directo"
                        data-group-key="${escapeAttr(groupKey)}"
                        data-entry-id="${escapeAttr(e.id)}">
                    ${IMPUESTOS_DIRECTO.map(i => `
                        <option value="${i.codigo}" ${e.impuesto === i.codigo ? 'selected' : ''}>
                            ${i.codigo === 'otro' ? i.nombre : `${i.codigo} — ${i.nombre}`}
                        </option>
                    `).join('')}
                </select>
                ${e.impuesto === 'otro' ? `
                    <input type="text"
                           class="input-impuesto-custom ${e.impuestoCustom && !impuestoOk ? 'input-invalido' : ''}"
                           data-group-key="${escapeAttr(groupKey)}"
                           data-entry-id="${escapeAttr(e.id)}"
                           value="${escapeAttr(e.impuestoCustom)}"
                           placeholder="código numérico"
                           style="margin-top:4px; width:100%;" />
                ` : ''}
            </td>
            <td class="col-acciones-directo">
                <button class="btn-eliminar-entrada"
                        data-group-key="${escapeAttr(groupKey)}"
                        data-entry-id="${escapeAttr(e.id)}"
                        title="Eliminar esta deuda">
                    🗑
                </button>
            </td>
        </tr>
    `;
}

function actualizarValidacionFila(groupKey, entryId) {
    const fila = document.querySelector(
        `tr.fila-entrada-directo[data-entry-id="${cssEscape(entryId)}"]`
    );
    if (!fila) return;

    const g = estado.grupos[groupKey];
    if (!g) return;
    const e = g.entradas.find(x => x.id === entryId);
    if (!e) return;

    fila.classList.toggle('fila-valida', entradaEsValida(e));

    const inputPeriodo = fila.querySelector('.input-periodo-directo');
    if (inputPeriodo) {
        const periodoOk = !!normalizarPeriodo(e.periodo);
        inputPeriodo.classList.toggle('input-invalido', !!e.periodo && !periodoOk);
    }
    const inputImp = fila.querySelector('.input-impuesto-custom');
    if (inputImp) {
        const ok = !!normalizarImpuesto(e);
        inputImp.classList.toggle('input-invalido', !!e.impuestoCustom && !ok);
    }
}

// ============================================================
// HELPERS
// ============================================================

function escapeAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function cssEscape(str) {
    if (window.CSS && CSS.escape) return CSS.escape(str);
    return String(str).replace(/(["\\])/g, '\\$1');
}
