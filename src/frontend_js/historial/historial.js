/**
 * Vista Historial de acciones (bitácora). SOLO LECTURA.
 * --------------------------------------------------------
 * Lee del backend vía window.electronAPI.historial.{listar,buscar} y pinta la tabla.
 * No escribe nada: el historial lo graban los handlers de cada servicio (vep, etc.).
 *
 * Expone window.inicializarHistorial() — el controlador lo llama al cargar la vista.
 */
(function () {
    // Etiquetas legibles por dominio (clave técnica → texto). Si llega uno nuevo
    // sin mapear, se muestra la clave cruda (no rompe).
    const LABEL_DOMINIO = {
        vep: 'Generar VEP',
        consultaDeuda: 'Consulta de Deuda',
        factura: 'Facturas',
        declaracionJurada: 'Declaración Jurada',
        tasaCero: 'Tasa Cero',
        retenciones: 'Retenciones',
        planDePago: 'Plan de Pago'
    };

    const LABEL_ESTADO = {
        exito: 'Éxito',
        error: 'Error',
        sinDeuda: 'Sin deuda',
        parcial: 'Parcial'
    };

    let debounceId = null;

    // Escapa texto para meterlo en innerHTML sin riesgo (nombres/cuit vienen de datos).
    function esc(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ISO (UTC) → fecha/hora local legible.
    function formatearFecha(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return esc(iso);
        return d.toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    // Arma la celda "Detalle": resumen + (error o datos del detalle).
    function celdaDetalle(entrada) {
        let html = `<div>${esc(entrada.resumen)}</div>`;
        if (entrada.estado === 'error' && entrada.error) {
            html += `<div class="hist-error">${esc(entrada.error)}</div>`;
        } else if (entrada.detalle) {
            const d = entrada.detalle;
            const partes = [];
            if (d.medioPago) partes.push(esc(d.medioPago));
            if (d.periodo) partes.push(esc(d.periodo));
            if (d.archivo) partes.push(esc(d.archivo));
            if (partes.length) html += `<div class="hist-detalle">${partes.join(' · ')}</div>`;
        }
        return html;
    }

    function celdaCliente(cliente) {
        if (!cliente) return '<span class="hist-cliente-cuit">—</span>';
        return `<div class="hist-cliente-nombre">${esc(cliente.nombre)}</div>` +
               `<div class="hist-cliente-cuit">${esc(cliente.cuit)}</div>`;
    }

    function render(entradas) {
        const body = document.getElementById('histBody');
        const vacio = document.getElementById('histVacio');
        const contador = document.getElementById('histContador');
        if (!body) return;

        contador.textContent = `${entradas.length} acción${entradas.length === 1 ? '' : 'es'}`;

        if (!entradas.length) {
            body.innerHTML = '';
            vacio.style.display = 'block';
            return;
        }
        vacio.style.display = 'none';

        body.innerHTML = entradas.map(e => {
            const dom = LABEL_DOMINIO[e.dominio] || e.dominio;
            const est = LABEL_ESTADO[e.estado] || e.estado;
            const chipClase = `hist-chip--${esc(e.estado)}`;
            return `<tr>
                <td class="hist-fecha">${formatearFecha(e.ts)}</td>
                <td>${esc(dom)}</td>
                <td><span class="hist-chip ${chipClase}">${esc(est)}</span></td>
                <td>${celdaCliente(e.cliente)}</td>
                <td>${celdaDetalle(e)}</td>
            </tr>`;
        }).join('');
    }

    // Lee los filtros del DOM y trae del backend (buscar si hay texto, listar si no).
    async function refrescar() {
        if (!window.electronAPI || !window.electronAPI.historial) {
            console.error('[historial] window.electronAPI.historial no disponible');
            return;
        }
        const texto = document.getElementById('histBuscar').value.trim();
        const filtros = {
            dominio: document.getElementById('histDominio').value || undefined,
            estado: document.getElementById('histEstado').value || undefined
        };
        try {
            const entradas = texto
                ? await window.electronAPI.historial.buscar(texto, filtros)
                : await window.electronAPI.historial.listar(filtros);
            render(entradas || []);
        } catch (err) {
            console.error('[historial] error consultando:', err);
            render([]);
        }
    }

    function refrescarDebounce() {
        clearTimeout(debounceId);
        debounceId = setTimeout(refrescar, 200);
    }

    window.inicializarHistorial = function inicializarHistorial() {
        document.getElementById('histRefrescar').addEventListener('click', refrescar);
        document.getElementById('histDominio').addEventListener('change', refrescar);
        document.getElementById('histEstado').addEventListener('change', refrescar);
        document.getElementById('histBuscar').addEventListener('input', refrescarDebounce);
        refrescar();
    };
})();
