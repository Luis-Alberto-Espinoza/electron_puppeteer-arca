/**
 * MÓDULO: Manejador de Filas (Cuenta Tributaria)
 * Event delegation para los grupos de resultados:
 *  - Checkbox "Procesar este CUIT" (excluir/incluir grupo)
 *  - Checkbox individual por fila de deuda
 *  - Selector de medio de pago por grupo
 *  - Botón Reintentar (emite CustomEvent al controlador)
 */

import EstadoCT from './estadoCT.js';
import { MEDIOS_PAGO } from './renderizadorTablas.js';

let inicializado = false;

/**
 * Inicializa los listeners delegados sobre la sección de resultados de CT.
 * Idempotente: si ya se llamó, no vuelve a registrar.
 */
export function inicializarManejadorFilas() {
    if (inicializado) return;
    inicializado = true;

    const root = document.getElementById('seccion-resultados-ct');
    if (!root) {
        console.warn('⚠️ No existe #seccion-resultados-ct — manejador no se inicializa');
        inicializado = false;
        return;
    }

    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);

    console.log('🎛️ Manejador de filas CT inicializado');
}

/**
 * Limpia el flag de inicialización (usar tras un reset duro / desmontar la vista).
 */
export function resetearManejadorFilas() {
    inicializado = false;
}

// ============================================================
// HANDLERS
// ============================================================

function onChange(ev) {
    const t = ev.target;
    if (!t) return;

    if (t.classList.contains('checkbox-incluir-grupo')) {
        manejarToggleGrupo(t);
        return;
    }

    if (t.classList.contains('checkbox-fila')) {
        manejarToggleFila(t);
        return;
    }

    if (t.classList.contains('select-medio-pago-grupo')) {
        manejarCambioMedioPago(t);
        return;
    }
}

function onClick(ev) {
    const btn = ev.target.closest('.btn-reintentar');
    if (!btn) return;

    const clienteId = btn.dataset.clienteId;
    const cuit = btn.dataset.cuit;
    if (!clienteId || !cuit) return;

    document.dispatchEvent(new CustomEvent('ct:reintentar-grupo', {
        detail: { clienteId, cuitAsociado: cuit }
    }));
}

// ============================================================
// LÓGICA POR ACCIÓN
// ============================================================

function manejarToggleGrupo(checkbox) {
    const clienteId = checkbox.dataset.clienteId;
    const cuit = checkbox.dataset.cuit;
    if (!clienteId || !cuit) return;

    if (checkbox.checked) {
        EstadoCT.incluirGrupo(clienteId, cuit);
    } else {
        EstadoCT.excluirGrupo(clienteId, cuit);
    }

    // Reflejar visualmente en la tarjeta
    const tarjeta = checkbox.closest('.tarjeta-grupo');
    if (tarjeta) tarjeta.classList.toggle('excluido', !checkbox.checked);

    notificarCambioSeleccion();
}

function manejarToggleFila(checkbox) {
    const clienteId = checkbox.dataset.clienteId;
    const cuit = checkbox.dataset.cuit;
    const idFila = checkbox.dataset.filaId;
    if (!clienteId || !cuit || !idFila) return;

    if (checkbox.checked) {
        EstadoCT.agregarSeleccionFila(clienteId, cuit, idFila);
    } else {
        EstadoCT.quitarSeleccionFila(clienteId, cuit, idFila);
    }

    // Pintar la fila como seleccionada
    const tr = checkbox.closest('tr.fila-deuda');
    if (tr) tr.classList.toggle('seleccionada', checkbox.checked);

    notificarCambioSeleccion();
}

function manejarCambioMedioPago(select) {
    const clienteId = select.dataset.clienteId;
    const cuit = select.dataset.cuit;
    const idMedio = select.value;
    if (!clienteId || !cuit) return;

    if (!idMedio) {
        // Limpiar — fallback al default
        const k = `${clienteId}|${cuit}`;
        delete EstadoCT.medioPagoPorGrupo[k];
    } else {
        const medio = MEDIOS_PAGO.find(m => m.id === idMedio);
        if (medio) EstadoCT.setMedioPagoGrupo(clienteId, cuit, medio);
    }

    notificarCambioSeleccion();
}

// ============================================================
// EVENTOS HACIA EL CONTROLADOR
// ============================================================

function notificarCambioSeleccion() {
    document.dispatchEvent(new CustomEvent('ct:seleccion-cambiada', {
        detail: EstadoCT.obtenerEstadisticas()
    }));
}
