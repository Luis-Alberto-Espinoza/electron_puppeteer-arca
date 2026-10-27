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

// Lanzadores (componentes/lanzadorAutomatizacion): switch + arrancar ↔ ⏹ Cancelar.
let lanzadorA = null;      // Flujo A, 1ra pasada (y reintentos)
let lanzadorPago = null;   // Flujo A, 2da pasada: sin switch, usa EstadoCT.visible
let lanzadorB = null;      // Flujo B

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

    // Antes que los selectores y el formulario: sus avisos de cambio ya habilitan los lanzadores.
    crearLanzadores();

    // Reset de estado al entrar
    EstadoCT.reset();
    resetearManejadorFilas();
    Object.keys(cuitsProcesarPorUsuarioA).forEach(k => delete cuitsProcesarPorUsuarioA[k]);
    Object.keys(cuitsProcesarPorUsuarioB).forEach(k => delete cuitsProcesarPorUsuarioB[k]);
    resetFormularioDirecto();

    montarSelectorUsuariosA();
    montarSelectorUsuariosB();
    inicializarFormularioDirecto({
        onCambio: (v) => {
            lanzadorB.cambiar(0, { texto: `Generar VEPs directos para ${v.cantidad} CUIT(s)`, ayuda: v.mensaje });
            lanzadorB.habilitar(v.valido);
        }
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
// LANZADORES
// ============================================================

function crearLanzadores() {
    const crear = window.lanzadorAutomatizacion.crear;
    lanzadorA = crear(document.getElementById('lanzador-ct-a'), {
        acciones: [{
            texto: 'Consultar deuda para 0 CUIT(s)',
            preparar: () => {
                const items = expandirItemsA(selectorUsuariosCT.obtenerSeleccionados());
                return items.length ? { items } : null;
            },
            // datos.reintento = un grupo desde Errores (lanzadorA.lanzar), con la elección de la consulta
            ejecutar: (datos, { visible }) => datos.reintento
                ? reintentarGrupo(datos.reintento)
                : ejecutarConsultaPrimeraPasada(datos.items, visible)
        }]
    });
    lanzadorPago = crear(document.getElementById('lanzador-ct-pago'), {
        navegador: false,
        acciones: [{
            texto: 'Confirmar y generar VEP',
            preparar: prepararSegundaPasada,
            ejecutar: ejecutarConsultaSegundaPasada
        }]
    });
    lanzadorB = crear(document.getElementById('lanzador-ct-b'), {
        acciones: [{
            texto: 'Generar VEPs directos para 0 CUIT(s)',
            preparar: () => {
                const items = recopilarItemsDirecto();
                return items.length ? items : null;
            },
            ejecutar: (items, { visible }) => ejecutarGenerarDirecto(items, visible)
        }]
    });
}

// ============================================================
// SELECTOR DE USUARIOS — Flujo A
// ============================================================

function montarSelectorUsuariosA() {
    selectorUsuariosCT = new SelectorUsuarios('selector-usuarios-ct', {
        fuente: 'contribuyentes',   // modelo plano: El Papi/LANDES aparecen vía su representante
        servicio: 'afip',
        // Lote: elegibles los de clave sin validar, NO los de clave incorrecta
        // (filtro de habilitados + botón "Clave"; ver actualizarClave.js)
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selectorUsuariosCT, { lote: true }) : {}),
        mostrarColumnaCUIT: false,
        // Vaciar = onCambioSeleccion([]): ya limpia los CUITs marcados; no hace falta onLimpiar.
        botonLimpiar: true,

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
        fuente: 'contribuyentes',   // modelo plano
        servicio: 'afip',
        // Lote: elegibles los de clave sin validar, NO los de clave incorrecta
        // (filtro de habilitados + botón "Clave"; ver actualizarClave.js)
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selectorUsuariosCT_B, { lote: true }) : {}),
        mostrarColumnaCUIT: false,
        // Vaciar = onCambioSeleccion([]): ya limpia los CUITs marcados; no hace falta onLimpiar.
        botonLimpiar: true,

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
        return `<td style="text-align:center; color:var(--v-texto-2, #9ca3af); font-size:12px;">Sin CUITs</td>`;
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
                ${cuit}${esPrincipal ? ' <span style="color:var(--v-txt-ok, #10b981); font-size:10px;">(principal)</span>' : ''}
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

    // El reintento pasa por el lanzador de la consulta: se ve ⏹ Cancelar y se puede cortar.
    document.addEventListener('ct:reintentar-grupo', (ev) => {
        if (lanzadorA.enCurso() || lanzadorPago.enCurso()) return;
        lanzadorA.lanzar(0, { reintento: ev.detail });
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
    lanzadorA.cambiar(0, { texto: `Consultar deuda para ${items.length} CUIT(s)` });
    lanzadorA.habilitar(items.length > 0);
}

// ============================================================
// PRIMERA PASADA — CONSULTAR
// ============================================================

async function ejecutarConsultaPrimeraPasada(items, visible) {
    EstadoCT.reset();
    EstadoCT.setItemsOriginales(items);
    EstadoCT.visible = visible;
    limpiarTodosLosGrupos();
    ocultarSeccionArchivos();

    mostrarModalProgreso('Consultando deuda en SCT…', items.length);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'consulta-con-seleccion',
            items,
            seleccionFilas: null,
            visible: EstadoCT.visible
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

function prepararSegundaPasada() {
    const validacion = EstadoCT.validarSelecciones();
    if (!validacion.valido) {
        alert(validacion.mensaje);
        return null;
    }

    const items = EstadoCT.recopilarSelecciones();
    if (items.length === 0) {
        alert('No hay selecciones que procesar');
        return null;
    }
    return items;
}

async function ejecutarConsultaSegundaPasada(items) {
    mostrarModalProgreso('Generando VEPs…', items.length);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'consulta-con-seleccion',
            items,
            seleccionFilas: { por: 'ids' },   // marcador — el id real va en cada item
            visible: EstadoCT.visible         // misma elección que la consulta
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

async function ejecutarGenerarDirecto(items, visible) {
    mostrarModalProgreso('Generando VEPs directos…', items.length);

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'generar-directo',
            items,
            visible
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

    mostrarModalProgreso('Reintentando consulta…');
    actualizarProgreso(original.cliente.nombre, cuitAsociado, 'Reintentando consulta…');

    try {
        const respuesta = await window.electronAPI.cuentaTributaria.procesar({
            modo: 'consulta-con-seleccion',
            items: [original],
            seleccionFilas: null,
            visible: EstadoCT.visible   // el reintento es parte del mismo lote
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
    const v = EstadoCT.validarSelecciones();
    lanzadorPago.habilitar(v.valido);
    lanzadorPago.cambiar(0, { ayuda: v.valido ? '' : v.mensaje });
}

// Rueda común (componentes/rueda): no bloquea y gira siempre, así no parece colgado.
function mostrarModalProgreso(mensaje, total) {
    window.ruedaTrabajando?.mostrar({
        servicio: 'ARCA', subservicio: 'Cuenta Tributaria', mensaje, actual: 1, total
    });
}

function actualizarProgreso(cliente, cuit, mensaje, actual, total) {
    window.ruedaTrabajando?.mostrar({ cliente, cuit, mensaje, actual, total });
}

function ocultarModalProgreso() {
    window.ruedaTrabajando?.ocultar();
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
            // El backend avisa ANTES de cada cliente (procesados = los ya hechos) y manda
            // `cliente` como texto (el nombre), no como objeto.
            const nombreCrudo = typeof datos.cliente === 'string' ? datos.cliente : datos.cliente?.nombre;
            const nombre = nombreCrudo ? capitalizarTexto(nombreCrudo) : '';
            const terminando = proc >= total;
            actualizarProgreso(terminando ? '' : nombre, terminando ? '' : (datos.cuitAsociado || ''),
                // Sin "Terminando…" queda el mensaje del arranque (consultar / generar VEPs).
                terminando ? 'Terminando…' : undefined, proc + 1, total);
        }
    });
}
