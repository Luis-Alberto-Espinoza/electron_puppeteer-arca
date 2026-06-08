/**
 * MÓDULO PRINCIPAL: Cuenta Tributaria (SCT)
 * Controlador de Flujo A (consulta con selección) y Flujo B (generar VEP directo).
 */

import EstadoCT from './modulos/estadoCT.js';
import {
    renderizarTodosLosGrupos,
    limpiarTodosLosGrupos,
    ocultarSeccionResultados,
    MEDIOS_PAGO
} from './modulos/renderizadorTablas.js';
import {
    inicializarManejadorFilas,
    resetearManejadorFilas
} from './modulos/manejadorFilas.js';
import {
    renderizarArchivosDescargados,
    ocultarSeccionArchivos,
    limpiarArchivos
} from './modulos/renderizadorArchivos.js';
import {
    inicializarFormularioDirecto,
    actualizarGrupos as actualizarGruposDirecto,
    recopilarItems as recopilarItemsDirecto,
    resetFormularioDirecto
} from './modulos/formularioDirecto.js';
import { capitalizarTexto } from './modulos/utilidadesCT.js';

// ============================================================
// ESTADO LOCAL DEL CONTROLADOR
// ============================================================

let selectorUsuariosCT = null;     // Flujo A
let selectorUsuariosCT_B = null;   // Flujo B

// Por usuario (clienteId) → Set de cuitAsociados marcados para procesar.
// Estado independiente por flujo.
const cuitsProcesarPorUsuarioA = {};
const cuitsProcesarPorUsuarioB = {};

// Modo activo: 'consulta-seleccion' (Flujo A) o 'generar-directo' (Flujo B)
let flujoActivo = 'consulta-seleccion';

// ============================================================
// INICIALIZACIÓN
// ============================================================

window.inicializarCuentaTributaria = inicializarCuentaTributaria;

function inicializarCuentaTributaria() {
    console.log('🟢 Inicializando vista Cuenta Tributaria...');

    if (typeof SelectorUsuarios === 'undefined') {
        console.warn('SelectorUsuarios aún no disponible — reintentando...');
        setTimeout(inicializarCuentaTributaria, 100);
        return;
    }

    // Reset de estado al entrar
    EstadoCT.reset();
    resetearManejadorFilas();
    Object.keys(cuitsProcesarPorUsuarioA).forEach(k => delete cuitsProcesarPorUsuarioA[k]);
    Object.keys(cuitsProcesarPorUsuarioB).forEach(k => delete cuitsProcesarPorUsuarioB[k]);
    resetFormularioDirecto();

    montarSelectorUsuariosA();
    montarSelectorUsuariosB();
    inicializarFormularioDirecto({
        onCambio: () => { /* el módulo ya actualiza su botón y contador */ }
    });
    configurarEventListeners();
    inicializarManejadorFilas();
    suscribirIPCProgreso();

    actualizarContadorGruposA([]);
    ocultarSeccionResultados();
    ocultarSeccionArchivos();

    console.log('✅ Vista Cuenta Tributaria lista');
}

// ============================================================
// SELECTOR DE USUARIOS — Flujo A
// ============================================================

function montarSelectorUsuariosA() {
    selectorUsuariosCT = new SelectorUsuarios('selector-usuarios-ct', {
        campoCredencial: 'claveAFIP',
        campoEstado: 'estado_afip',
        campoError: 'errorAfip',
        permitirInvalidos: false,
        permitirSinValidar: false,
        mensajeSinValidar: 'Debe validar las credenciales AFIP en Gestión de Clientes',
        mostrarColumnaCUIT: false,

        onCambioSeleccion: (seleccionados) => {
            const idsSeleccionados = new Set(seleccionados.map(u => String(u.id)));
            Object.keys(cuitsProcesarPorUsuarioA).forEach(k => {
                if (!idsSeleccionados.has(String(k))) delete cuitsProcesarPorUsuarioA[k];
            });
            for (const u of seleccionados) {
                const cuits = obtenerCuitsAsociados(u);
                if (!cuitsProcesarPorUsuarioA[u.id]) {
                    cuitsProcesarPorUsuarioA[u.id] = new Set();
                }
                if (cuits.length === 1) {
                    cuitsProcesarPorUsuarioA[u.id].add(cuits[0]);
                }
            }
            actualizarContadorGruposA(seleccionados);
        },

        renderizarColumnasExtras: renderizarColumnaCuitsA,
        headersColumnasExtras: ['CUITs a procesar']
    });
}

// ============================================================
// SELECTOR DE USUARIOS — Flujo B
// ============================================================

function montarSelectorUsuariosB() {
    selectorUsuariosCT_B = new SelectorUsuarios('selector-usuarios-ct-b', {
        campoCredencial: 'claveAFIP',
        campoEstado: 'estado_afip',
        campoError: 'errorAfip',
        permitirInvalidos: false,
        permitirSinValidar: false,
        mensajeSinValidar: 'Debe validar las credenciales AFIP en Gestión de Clientes',
        mostrarColumnaCUIT: false,

        onCambioSeleccion: (seleccionados) => {
            const idsSeleccionados = new Set(seleccionados.map(u => String(u.id)));
            Object.keys(cuitsProcesarPorUsuarioB).forEach(k => {
                if (!idsSeleccionados.has(String(k))) delete cuitsProcesarPorUsuarioB[k];
            });
            for (const u of seleccionados) {
                const cuits = obtenerCuitsAsociados(u);
                if (!cuitsProcesarPorUsuarioB[u.id]) {
                    cuitsProcesarPorUsuarioB[u.id] = new Set();
                }
                if (cuits.length === 1) {
                    cuitsProcesarPorUsuarioB[u.id].add(cuits[0]);
                }
            }
            sincronizarFormularioDirecto(seleccionados);
        },

        renderizarColumnasExtras: renderizarColumnaCuitsB,
        headersColumnasExtras: ['CUITs a procesar']
    });
}

/**
 * Devuelve la lista de CUITs asociados disponibles para un usuario.
 */
function obtenerCuitsAsociados(usuario) {
    const principal = usuario.cuit || usuario.cuil;
    const asociados = Array.isArray(usuario.cuitAsociados) ? usuario.cuitAsociados : [];
    const set = new Set();
    if (principal) set.add(String(principal));
    for (const c of asociados) {
        if (c) set.add(String(c));
    }
    return Array.from(set);
}

function renderizarColumnaCuitsA(usuario) {
    return renderizarColumnaCuitsGeneric(usuario, cuitsProcesarPorUsuarioA, 'ct-cuit-check-a');
}

function renderizarColumnaCuitsB(usuario) {
    return renderizarColumnaCuitsGeneric(usuario, cuitsProcesarPorUsuarioB, 'ct-cuit-check-b');
}

function renderizarColumnaCuitsGeneric(usuario, estadoCuits, claseCheckbox) {
    const cuits = obtenerCuitsAsociados(usuario);

    // Pre-marcar en el estado cuando el cliente tiene 1 solo CUIT (sin asociados).
    // Si tiene múltiples CUITs (con asociados), ninguno queda pre-marcado.
    // Lo hacemos acá para que el HTML del checkbox refleje el estado desde
    // el primer render — el componente SelectorUsuarios renderiza la columna
    // antes de invocar onCambioSeleccion, y un side-effect post-render no
    // llegaría al `checked` del input.
    if (cuits.length === 1 && !estadoCuits[usuario.id]) {
        estadoCuits[usuario.id] = new Set([cuits[0]]);
    }

    const seleccionadosUsuario = estadoCuits[usuario.id] || new Set();

    if (cuits.length === 0) {
        return `<td style="text-align:center; color:#9ca3af; font-size:12px;">Sin CUITs</td>`;
    }

    const opciones = cuits.map(cuit => {
        const checked = seleccionadosUsuario.has(cuit) ? 'checked' : '';
        const esPrincipal = cuit === String(usuario.cuit || '');
        return `
            <label style="display:flex; align-items:center; gap:6px; font-size:12px; margin:2px 0; cursor:pointer; font-family:monospace;">
                <input type="checkbox"
                       class="${claseCheckbox}"
                       data-usuario-id="${usuario.id}"
                       value="${cuit}"
                       ${checked}
                       style="accent-color:#667eea;" />
                ${cuit}${esPrincipal ? ' <span style="color:#10b981; font-size:10px;">(principal)</span>' : ''}
            </label>
        `;
    }).join('');

    return `<td style="padding:6px 10px; vertical-align:top;">${opciones}</td>`;
}

// ============================================================
// EVENT LISTENERS GLOBALES
// ============================================================

function configurarEventListeners() {
    // Tabs Flujo A / Flujo B
    const tabA = document.getElementById('tab-consulta-seleccion');
    const tabB = document.getElementById('tab-generar-directo');
    if (tabA) tabA.addEventListener('click', () => cambiarFlujo('consulta-seleccion'));
    if (tabB) tabB.addEventListener('click', () => cambiarFlujo('generar-directo'));

    // Delegación checkboxes CUITs — Flujo A
    const contenedorSelectorA = document.getElementById('selector-usuarios-ct');
    if (contenedorSelectorA) {
        contenedorSelectorA.addEventListener('change', (ev) => {
            const t = ev.target;
            if (!t || !t.classList.contains('ct-cuit-check-a')) return;
            manejarCambioCuitA(t);
        });
    }

    // Delegación checkboxes CUITs — Flujo B
    const contenedorSelectorB = document.getElementById('selector-usuarios-ct-b');
    if (contenedorSelectorB) {
        contenedorSelectorB.addEventListener('change', (ev) => {
            const t = ev.target;
            if (!t || !t.classList.contains('ct-cuit-check-b')) return;
            manejarCambioCuitB(t);
        });
    }

    // Botón Consultar (primera pasada — Flujo A)
    const btnConsultar = document.getElementById('btn-consultar-deuda-ct');
    if (btnConsultar) btnConsultar.addEventListener('click', ejecutarConsultaPrimeraPasada);

    // Botón Confirmar y generar VEP (segunda pasada — Flujo A)
    const btnConfirmar = document.getElementById('btn-confirmar-seleccion-ct');
    if (btnConfirmar) btnConfirmar.addEventListener('click', ejecutarConsultaSegundaPasada);

    // Botón Generar VEPs directos (Flujo B)
    const btnDirecto = document.getElementById('btn-generar-directo-ct');
    if (btnDirecto) btnDirecto.addEventListener('click', ejecutarGenerarDirecto);

    // Botón Cancelar todo
    const btnCancelar = document.getElementById('btn-cancelar-todo-ct');
    if (btnCancelar) btnCancelar.addEventListener('click', cancelarTodo);

    // Botón Nuevo proceso
    const btnNuevo = document.getElementById('btn-nuevo-proceso-ct');
    if (btnNuevo) btnNuevo.addEventListener('click', iniciarNuevoProceso);

    // Eventos del manejador de filas
    document.addEventListener('ct:seleccion-cambiada', () => {
        actualizarBotonConfirmar();
    });

    document.addEventListener('ct:reintentar-grupo', (ev) => {
        reintentarGrupo(ev.detail);
    });
}

function manejarCambioCuitA(checkbox) {
    const usuarioId = checkbox.dataset.usuarioId;
    const cuit = checkbox.value;
    if (!usuarioId || !cuit) return;

    if (!cuitsProcesarPorUsuarioA[usuarioId]) {
        cuitsProcesarPorUsuarioA[usuarioId] = new Set();
    }
    if (checkbox.checked) {
        cuitsProcesarPorUsuarioA[usuarioId].add(cuit);
    } else {
        cuitsProcesarPorUsuarioA[usuarioId].delete(cuit);
    }

    const seleccionados = selectorUsuariosCT.obtenerSeleccionados();
    actualizarContadorGruposA(seleccionados);
}

function manejarCambioCuitB(checkbox) {
    const usuarioId = checkbox.dataset.usuarioId;
    const cuit = checkbox.value;
    if (!usuarioId || !cuit) return;

    if (!cuitsProcesarPorUsuarioB[usuarioId]) {
        cuitsProcesarPorUsuarioB[usuarioId] = new Set();
    }
    if (checkbox.checked) {
        cuitsProcesarPorUsuarioB[usuarioId].add(cuit);
    } else {
        cuitsProcesarPorUsuarioB[usuarioId].delete(cuit);
    }

    const seleccionados = selectorUsuariosCT_B.obtenerSeleccionados();
    sincronizarFormularioDirecto(seleccionados);
}

/**
 * Convierte la selección actual del selector B en items y se la pasa al
 * módulo formularioDirecto para que renderice las cards correspondientes.
 */
function sincronizarFormularioDirecto(usuariosSeleccionados) {
    const items = expandirItemsB(usuariosSeleccionados);
    actualizarGruposDirecto(items);
}

function expandirItemsB(usuariosSeleccionados) {
    const items = [];
    for (const u of usuariosSeleccionados || []) {
        const cuits = cuitsProcesarPorUsuarioB[u.id];
        if (!cuits || cuits.size === 0) continue;
        for (const cuit of cuits) {
            items.push({
                cliente: {
                    id: u.id,
                    nombre: u.nombre || '',
                    cuitLogin: u.cuit || u.cuil || ''
                },
                cuitAsociado: String(cuit)
            });
        }
    }
    return items;
}

// ============================================================
// CAMBIO DE FLUJO (Tabs)
// ============================================================

function cambiarFlujo(flujo) {
    flujoActivo = flujo;

    // El cuadro de archivos es compartido por ambos flujos; al cambiar de tab
    // lo ocultamos para no mostrar los resultados de un flujo bajo el otro.
    ocultarSeccionArchivos();

    const tabA = document.getElementById('tab-consulta-seleccion');
    const tabB = document.getElementById('tab-generar-directo');
    const modA = document.getElementById('modulo-consulta-seleccion');
    const modB = document.getElementById('modulo-generar-directo');
    const descA = document.getElementById('descripcion-consulta-seleccion');
    const descB = document.getElementById('descripcion-generar-directo');

    if (flujo === 'consulta-seleccion') {
        if (tabA) tabA.classList.add('tab-activo');
        if (tabB) tabB.classList.remove('tab-activo');
        if (modA) modA.style.display = '';
        if (modB) modB.style.display = 'none';
        if (descA) descA.style.display = '';
        if (descB) descB.style.display = 'none';
    } else {
        if (tabA) tabA.classList.remove('tab-activo');
        if (tabB) tabB.classList.add('tab-activo');
        if (modA) modA.style.display = 'none';
        if (modB) modB.style.display = '';
        if (descA) descA.style.display = 'none';
        if (descB) descB.style.display = '';
    }
}

// ============================================================
// EXPANSIÓN (cliente × cuit) → items para backend
// ============================================================

function expandirItemsA(usuariosSeleccionados) {
    const items = [];
    for (const u of usuariosSeleccionados) {
        const cuits = cuitsProcesarPorUsuarioA[u.id];
        if (!cuits || cuits.size === 0) continue;
        for (const cuit of cuits) {
            items.push({
                cliente: {
                    id: u.id,
                    nombre: u.nombre || '',
                    cuitLogin: u.cuit || u.cuil || ''
                },
                cuitAsociado: String(cuit)
            });
        }
    }
    return items;
}

function actualizarContadorGruposA(usuariosSeleccionados) {
    const items = expandirItemsA(usuariosSeleccionados);
    const cont = document.getElementById('contador-grupos-ct');
    if (cont) cont.textContent = String(items.length);
    const btn = document.getElementById('btn-consultar-deuda-ct');
    if (btn) btn.disabled = items.length === 0;
}

// ============================================================
// PRIMERA PASADA — CONSULTAR
// ============================================================

async function ejecutarConsultaPrimeraPasada() {
    const seleccionados = selectorUsuariosCT.obtenerSeleccionados();
    const items = expandirItemsA(seleccionados);

    if (items.length === 0) {
        alert('Seleccione al menos un cliente y un CUIT a procesar.');
        return;
    }

    EstadoCT.reset();
    EstadoCT.setItemsOriginales(items);
    limpiarTodosLosGrupos();
    ocultarSeccionArchivos();

    mostrarModalProgreso('Consultando deuda en SCT...', `0 / ${items.length}`);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'consulta-con-seleccion',
            items,
            seleccionFilas: null
        });

        ocultarModalProgreso();
        manejarRespuestaPrimeraPasada(respuesta);

    } catch (err) {
        ocultarModalProgreso();
        console.error('❌ Error en primera pasada:', err);
        alert(`Error al consultar deuda: ${err?.message || err}`);
    }
}

function manejarRespuestaPrimeraPasada(respuesta) {
    if (!respuesta) {
        alert('Respuesta vacía del backend');
        return;
    }
    if (respuesta.success === false && !respuesta.requierenSeleccion) {
        alert(`Error: ${respuesta.message || 'desconocido'}`);
        return;
    }

    EstadoCT.setResultados({
        procesadosAuto: respuesta.procesadosAuto || [],
        requierenSeleccion: respuesta.requierenSeleccion || [],
        errores: respuesta.errores || []
    });

    renderizarTodosLosGrupos();
    actualizarBotonConfirmar();
}

// ============================================================
// SEGUNDA PASADA — CONFIRMAR Y GENERAR VEP
// ============================================================

async function ejecutarConsultaSegundaPasada() {
    const validacion = EstadoCT.validarSelecciones();
    if (!validacion.valido) {
        alert(validacion.mensaje);
        return;
    }

    const items = EstadoCT.recopilarSelecciones();
    if (items.length === 0) {
        alert('No hay selecciones que procesar');
        return;
    }

    mostrarModalProgreso('Generando VEPs...', `0 / ${items.length}`);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'consulta-con-seleccion',
            items,
            seleccionFilas: { por: 'ids' }   // marcador — el id real va en cada item
        });

        ocultarModalProgreso();
        manejarRespuestaSegundaPasada(respuesta);

    } catch (err) {
        ocultarModalProgreso();
        console.error('❌ Error en segunda pasada:', err);
        alert(`Error al generar VEP: ${err?.message || err}`);
    }
}

function manejarRespuestaSegundaPasada(respuesta) {
    if (!respuesta) {
        alert('Respuesta vacía del backend');
        return;
    }
    if (respuesta.success === false && !Array.isArray(respuesta.resultados)) {
        alert(`Error: ${respuesta.message || 'desconocido'}`);
        return;
    }

    const resultados = respuesta.resultados || [];
    const exitosos = resultados.filter(r => r && r.status === 'success');
    const conProblemas = resultados.filter(r => r && r.status && r.status !== 'success');

    renderizarArchivosDescargados(resultados);

    // Resumen breve.
    const partes = [];
    partes.push(`${exitosos.length} VEP(s) generado(s)`);
    if (conProblemas.length) partes.push(`${conProblemas.length} con problemas`);
    console.log(`🟢 [CT] 2da pasada: ${partes.join(' · ')}`);
}

// ============================================================
// FLUJO B — GENERAR VEP DIRECTO
// ============================================================

async function ejecutarGenerarDirecto() {
    const items = recopilarItemsDirecto();
    if (items.length === 0) {
        alert('Cargue al menos una deuda válida y elija medio de pago en cada grupo.');
        return;
    }

    mostrarModalProgreso('Generando VEPs directos...', `0 / ${items.length}`);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'generar-directo',
            items
        });

        ocultarModalProgreso();
        manejarRespuestaGenerarDirecto(respuesta);

    } catch (err) {
        ocultarModalProgreso();
        console.error('❌ Error en Flujo B:', err);
        alert(`Error al generar VEP directo: ${err?.message || err}`);
    }
}

function manejarRespuestaGenerarDirecto(respuesta) {
    if (!respuesta) {
        alert('Respuesta vacía del backend');
        return;
    }
    if (respuesta.success === false && !Array.isArray(respuesta.resultados)) {
        alert(`Error: ${respuesta.message || 'desconocido'}`);
        return;
    }

    const resultados = respuesta.resultados || [];
    const exitosos = resultados.filter(r => r && r.status === 'success');
    const conProblemas = resultados.filter(r => r && r.status && r.status !== 'success');

    // Flujo B no tiene 1ra pasada (no descarga Excels): incluirExcels:false evita
    // arrastrar Excels viejos que hubiera dejado una consulta previa de Flujo A.
    renderizarArchivosDescargados(resultados, { incluirExcels: false });

    const partes = [];
    partes.push(`${exitosos.length} VEP(s) generado(s)`);
    if (conProblemas.length) partes.push(`${conProblemas.length} con problemas`);
    console.log(`🟢 [CT] Flujo B: ${partes.join(' · ')}`);
}

// ============================================================
// REINTENTAR UN GRUPO
// ============================================================

async function reintentarGrupo({ clienteId, cuitAsociado }) {
    // Buscar el item original
    const original = EstadoCT.itemsOriginales.find(it =>
        String(it.cliente.id) === String(clienteId)
        && String(it.cuitAsociado) === String(cuitAsociado)
    );
    if (!original) {
        alert('No se encontró el item original para reintentar');
        return;
    }

    mostrarModalProgreso('Reintentando consulta...', `${original.cliente.nombre} — ${cuitAsociado}`);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'consulta-con-seleccion',
            items: [original],
            seleccionFilas: null
        });

        ocultarModalProgreso();

        // Quitar el grupo de la lista de errores y mergear los nuevos resultados
        EstadoCT.errores = EstadoCT.errores.filter(e =>
            !(String(e.cliente.id) === String(clienteId)
              && String(e.cuitAsociado) === String(cuitAsociado))
        );

        if (respuesta?.procesadosAuto?.length) {
            EstadoCT.procesadosAuto.push(...respuesta.procesadosAuto);
        }
        if (respuesta?.requierenSeleccion?.length) {
            EstadoCT.requierenSeleccion.push(...respuesta.requierenSeleccion);
        }
        if (respuesta?.errores?.length) {
            EstadoCT.errores.push(...respuesta.errores);
        }

        renderizarTodosLosGrupos();
        actualizarBotonConfirmar();

    } catch (err) {
        ocultarModalProgreso();
        alert(`Error al reintentar: ${err?.message || err}`);
    }
}

// ============================================================
// CANCELAR / NUEVO PROCESO
// ============================================================

function cancelarTodo() {
    if (!confirm('¿Cancelar todo y limpiar resultados?')) return;
    EstadoCT.reset();
    limpiarTodosLosGrupos();
    limpiarArchivos();
    resetFormularioDirecto();
    actualizarBotonConfirmar();
}

function iniciarNuevoProceso() {
    EstadoCT.reset();
    limpiarTodosLosGrupos();
    limpiarArchivos();
    Object.keys(cuitsProcesarPorUsuarioA).forEach(k => delete cuitsProcesarPorUsuarioA[k]);
    Object.keys(cuitsProcesarPorUsuarioB).forEach(k => delete cuitsProcesarPorUsuarioB[k]);
    resetFormularioDirecto();
    if (selectorUsuariosCT?.limpiarSeleccion) selectorUsuariosCT.limpiarSeleccion();
    if (selectorUsuariosCT_B?.limpiarSeleccion) selectorUsuariosCT_B.limpiarSeleccion();
    actualizarContadorGruposA([]);
    actualizarBotonConfirmar();
}

// ============================================================
// HELPERS UI
// ============================================================

function actualizarBotonConfirmar() {
    const btn = document.getElementById('btn-confirmar-seleccion-ct');
    if (!btn) return;
    const v = EstadoCT.validarSelecciones();
    btn.disabled = !v.valido;
    btn.title = v.valido ? '' : v.mensaje;
}

function mostrarModalProgreso(titulo, texto) {
    const modal = document.getElementById('modal-progreso-ct');
    const tit = document.getElementById('modal-progreso-titulo-ct');
    const txt = document.getElementById('progreso-texto-ct');
    const fill = document.getElementById('progreso-fill-ct');
    if (tit) tit.textContent = titulo;
    if (txt) txt.textContent = texto || '';
    if (fill) fill.style.width = '0%';
    if (modal) modal.style.display = 'flex';
}

function actualizarProgreso(porcentaje, texto) {
    const fill = document.getElementById('progreso-fill-ct');
    const txt = document.getElementById('progreso-texto-ct');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, porcentaje))}%`;
    if (txt && texto != null) txt.textContent = texto;
}

function ocultarModalProgreso() {
    const modal = document.getElementById('modal-progreso-ct');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// SUSCRIPCIÓN A EVENTOS DE PROGRESO IPC
// ============================================================

function suscribirIPCProgreso() {
    if (!window.electronAPI?.cuentaTributaria?.onUpdate) return;

    window.electronAPI.cuentaTributaria.onUpdate((datos) => {
        if (!datos) return;
        if (datos.tipo === 'progreso') {
            const total = datos.total || 1;
            const proc = datos.procesados || 0;
            const pct = Math.round((proc / total) * 100);
            const nombre = datos.cliente?.nombre ? capitalizarTexto(datos.cliente.nombre) : '';
            actualizarProgreso(pct, `${proc} / ${total} — ${nombre} ${datos.cuitAsociado || ''}`);
        }
    });
}
