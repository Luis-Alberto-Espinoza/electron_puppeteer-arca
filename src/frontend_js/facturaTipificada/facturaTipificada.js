/**
 * Módulo de Facturas Tipificadas
 * Permite generar múltiples facturas con datos específicos del cliente
 */

let contadorFacturas = 0;
let contadoresLineasPorFactura = {}; // { facturaId: contadorLineas }

// --- Estado del modo Nota de Crédito/Débito (picker de Excel) ---
// modoNotaActivo: false (factura normal) | 'credito' | 'debito'.
let modoNotaActivo = false;
// Modo prueba: lo decide el botón que se tocó (🧪 Probar = true, 🧾 Generar = false).
let modoPruebaPedido = false;
// Últimas facturas leídas del Excel elegido.
let facturasDelExcel = [];
// Facturas tildadas para hacerles nota: key `PV||Nro` → { factura, montoOverride }.
let notasSeleccionadas = new Map();

/**
 * Opciones del select #universocomprobante de AFIP, separadas por tipo de EMISOR.
 *
 * Ojo: el `value` debe coincidir EXACTO con el value del <option> que AFIP usa
 * para ese emisor, porque es lo que seteamos en Puppeteer (paso_0). AFIP muestra
 * un select distinto según el emisor:
 *   - B (Responsable Inscripto): universo A / B / T.
 *   - C (Monotributista): universo C (Factura/NC/ND C), con OTROS values.
 * Ambos sets fueron tomados del HTML real del select de AFIP.
 */
const OPCIONES_COMPROBANTE = {
    B: [
        { value: '10',  label: 'Factura A' },
        { value: '11',  label: 'Nota de Débito A' },
        { value: '12',  label: 'Nota de Crédito A' },
        { value: '13',  label: 'Recibo A' },
        { value: '19',  label: 'Factura B' },
        { value: '21',  label: 'Nota de Débito B' },
        { value: '23',  label: 'Nota de Crédito B' },
        { value: '25',  label: 'Recibo B' },
        { value: '111', label: 'Factura T' },
        { value: '112', label: 'Nota de Débito T' },
        { value: '113', label: 'Nota de Crédito T' },
        { value: '114', label: 'Factura de Crédito Electrónica MiPyMEs (FCE) A' },
        { value: '115', label: 'Nota de Débito Electrónica MiPyMEs (FCE) A' },
        { value: '116', label: 'Nota de Crédito Electrónica MiPyMEs (FCE) A' },
        { value: '117', label: 'Factura de Crédito Electrónica MiPyMEs (FCE) B' },
        { value: '118', label: 'Nota de Débito Electrónica MiPyMEs (FCE) B' },
        { value: '119', label: 'Nota de Crédito Electrónica MiPyMEs (FCE) B' },
    ],
    C: [
        { value: '2',   label: 'Factura C' },
        { value: '3',   label: 'Nota de Débito C' },
        { value: '4',   label: 'Nota de Crédito C' },
        { value: '5',   label: 'Recibo C' },
        { value: '120', label: 'Factura de Crédito Electrónica MiPyMEs (FCE) C' },
        { value: '121', label: 'Nota de Débito Electrónica MiPyMEs (FCE) C' },
        { value: '122', label: 'Nota de Crédito Electrónica MiPyMEs (FCE) C' },
    ],
};

// Opción seleccionada por defecto = "Factura" del tipo del emisor (igual que el
// hardcodeo histórico: B -> Factura B (19), C -> Factura C (2)).
const DEFAULT_COMPROBANTE = { B: '19', C: '2' };

/**
 * Puebla el select de tipo de comprobante según el tipo de emisor (B/C) y marca
 * la opción por defecto. Si no hay opciones para ese emisor, oculta el grupo y
 * deja que el backend use el default de AFIP.
 */
function poblarSelectTipoComprobante() {
    const select = document.getElementById('tipoComprobante');
    const grupo = document.getElementById('grupoTipoComprobante');
    if (!select) return;

    const tipo = window.usuarioSeleccionado?.tipoContribuyente;
    const opciones = OPCIONES_COMPROBANTE[tipo] || [];

    if (opciones.length === 0) {
        if (grupo) grupo.style.display = 'none';
        select.innerHTML = '';
        select.required = false; // sin opciones no puede ser required (bloquearía el submit)
        return;
    }

    if (grupo) grupo.style.display = '';
    select.required = true;
    select.innerHTML = '';

    // Facturas/Recibos: van con su value real de AFIP (lo usa paso_0 directo).
    // Las NOTAS del catálogo (con letra) se colapsan a dos opciones sin letra:
    // el usuario solo elige Crédito/Débito; la letra real la deriva el backend
    // por fila del Excel (ver docs/AFIP_DOC/notaCreditoDebito.md).
    opciones
        .filter(o => !o.label.startsWith('Nota de'))
        .forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.value === DEFAULT_COMPROBANTE[tipo]) opt.selected = true;
            select.appendChild(opt);
        });

    [{ value: VALOR_NOTA_CREDITO, label: 'Nota de Crédito' },
     { value: VALOR_NOTA_DEBITO, label: 'Nota de Débito' }].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        select.appendChild(opt);
    });
}

// Values sentinela para las notas en el select (no son values de AFIP: la NC/ND
// real se arma por fila en el backend).
const VALOR_NOTA_CREDITO = 'nota_credito';
const VALOR_NOTA_DEBITO = 'nota_debito';

/** value del select → 'credito' | 'debito' | null (si es factura/recibo). */
function tipoNotaDeValue(value) {
    if (value === VALOR_NOTA_CREDITO) return 'credito';
    if (value === VALOR_NOTA_DEBITO) return 'debito';
    return null;
}

// ==========================================================================
// MODO NOTA DE CRÉDITO/DÉBITO (picker de Excel)
// ==========================================================================

/** Listener del select de tipo de comprobante: enchufa el modo nota o normal. */
function onCambioTipoComprobante() {
    const select = document.getElementById('tipoComprobante');
    if (!select) return;
    aplicarModoNota(tipoNotaDeValue(select.value));
}

/**
 * Activa/desactiva el modo nota: en modo nota se oculta la carga manual
 * (receptor, fechas de servicio, facturas a generar, factura distinta) y se
 * muestra el picker de Excel, que es de donde salen las facturas a anular/ajustar.
 */
function aplicarModoNota(tipoNota) {
    modoNotaActivo = tipoNota || false;
    const esNota = !!tipoNota;

    // En modo nota mostramos solo Empresa + Tipo de Comprobante + Fecha (cabezal
    // mínimo que la nota necesita); todo lo demás sale del Excel. Tipo Actividad,
    // PV y Tipo Contribuyente se ocultan (paso_0 ignora el PV; el resto es info o
    // sale derivado).
    ['seccionFechasServicio', 'seccionReceptor', 'seccionFacturasGenerar', 'seccionFacturaDistinta',
     'grupoTipoActividad', 'filaPuntoVenta', 'filaTipoContribuyente']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = esNota ? 'none' : '';
        });

    const picker = document.getElementById('seccionNotasPicker');
    if (picker) picker.style.display = esNota ? 'block' : 'none';

    // Etiqueta de los botones del lanzador según el modo.
    actualizarTextosLanzador();

    if (esNota) {
        cargarExcelsParaNotas();
    } else {
        facturasDelExcel = [];
        notasSeleccionadas.clear();
        limpiarTablaNotas();
        // Restaurar la visibilidad de fechas de servicio según el tipo de actividad.
        const tipoActividad = document.getElementById('tipoActividad');
        const seccionFechas = document.getElementById('seccionFechasServicio');
        if (seccionFechas && tipoActividad) {
            seccionFechas.style.display = tipoActividad.value === 'Servicio' ? 'block' : 'none';
        }
        actualizarContadorFacturas();
    }
}

/** Pide al backend los Excels de consulta del emisor y puebla el select. */
async function cargarExcelsParaNotas() {
    const select = document.getElementById('notasExcelSelect');
    const mensaje = document.getElementById('notasPickerMensaje');
    const btnExtraer = document.getElementById('btnExtraerData');
    if (!select) return;

    select.innerHTML = '<option>Cargando...</option>';
    select.disabled = true;
    if (btnExtraer) btnExtraer.disabled = true;
    limpiarTablaNotas();

    try {
        const resp = await window.electronAPI.notaCreditoDebito.listarExcels({ usuario: window.usuarioSeleccionado });
        if (!resp || !resp.success) throw new Error((resp && resp.message) || 'No se pudieron listar los Excels.');

        const excels = resp.excels || [];
        if (excels.length === 0) {
            select.innerHTML = '';
            select.disabled = true;
            if (mensaje) {
                mensaje.textContent = '⚠️ No hay Excel de consulta para este emisor. Primero generá una Consulta de Comprobantes para poder hacer notas.';
                mensaje.style.color = '#b9770e';
            }
            return;
        }

        select.innerHTML = '';
        excels.forEach(x => {
            const opt = document.createElement('option');
            opt.value = x.ruta;
            opt.textContent = `${x.nombre}  (${x.fechaLegible})`;
            select.appendChild(opt);
        });
        select.disabled = false;
        if (btnExtraer) btnExtraer.disabled = false;
        if (mensaje) {
            mensaje.textContent = 'Elegí un Excel y tocá "Extraer data" para ver las facturas.';
            mensaje.style.color = '';
        }
    } catch (e) {
        select.innerHTML = '';
        if (mensaje) { mensaje.textContent = '❌ ' + e.message; mensaje.style.color = '#c0392b'; }
    }
}

/** Lee el Excel elegido y renderiza la tabla de facturas. */
async function extraerDataNotas() {
    const select = document.getElementById('notasExcelSelect');
    const btnExtraer = document.getElementById('btnExtraerData');
    if (!select || !select.value) return;

    if (btnExtraer) { btnExtraer.disabled = true; btnExtraer.textContent = 'Leyendo...'; }
    try {
        const resp = await window.electronAPI.notaCreditoDebito.leerExcel({ ruta: select.value });
        if (!resp || !resp.success) throw new Error((resp && resp.message) || 'No se pudo leer el Excel.');
        facturasDelExcel = resp.facturas || [];
        notasSeleccionadas.clear();
        renderTablaNotas(facturasDelExcel);
    } catch (e) {
        facturasDelExcel = [];
        notasSeleccionadas.clear();
        const cont = document.getElementById('notasTablaContainer');
        if (cont) cont.innerHTML = `<p class="info-text" style="color:var(--v-txt-error, #c0392b);">❌ ${_escaparHtml(e.message)}</p>`;
        actualizarSeleccionInfo();
    } finally {
        if (btnExtraer) { btnExtraer.disabled = false; btnExtraer.textContent = '📤 Extraer data'; }
    }
}

/**
 * Abre el buscador de archivos del SO para elegir un Excel de consulta a mano.
 * Es la vía robusta cuando la lista automática no lo encuentra. El archivo
 * elegido se inserta como opción seleccionada del select, así `extraerDataNotas`
 * (que lee `select.value` como ruta) lo procesa sin cambios.
 */
async function elegirExcelManual() {
    const select = document.getElementById('notasExcelSelect');
    const mensaje = document.getElementById('notasPickerMensaje');
    const btnExtraer = document.getElementById('btnExtraerData');
    if (!select) return;

    const usuario = window.usuarioSeleccionado || {};
    const resp = await window.electronAPI.notaCreditoDebito.elegirExcel({
        cuit: usuario.cuit,
        nombre: usuario.razonSocial || usuario.nombre
    });

    if (!resp || !resp.success) {
        if (resp && resp.canceled) return;   // el usuario canceló: sin ruido
        if (mensaje) { mensaje.textContent = '❌ ' + ((resp && resp.message) || 'No se pudo abrir el archivo.'); mensaje.style.color = '#c0392b'; }
        return;
    }

    const ruta = resp.archivo;
    const nombreArchivo = ruta.split(/[\\/]/).pop();
    let opt = Array.from(select.options).find(o => o.value === ruta);
    if (!opt) {
        opt = document.createElement('option');
        opt.value = ruta;
        opt.textContent = `📂 ${nombreArchivo} (elegido a mano)`;
        select.insertBefore(opt, select.firstChild);
    }
    select.value = ruta;
    select.disabled = false;
    if (btnExtraer) btnExtraer.disabled = false;
    if (mensaje) { mensaje.textContent = 'Archivo elegido. Tocá "Extraer data" para ver las facturas.'; mensaje.style.color = ''; }
}

function limpiarTablaNotas() {
    const cont = document.getElementById('notasTablaContainer');
    if (cont) cont.innerHTML = '';
    actualizarSeleccionInfo();
}

const _fmtMonto = (n) => (typeof n === 'number')
    ? n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

/** Renderiza la tabla del picker (una fila por factura). */
function renderTablaNotas(facturas) {
    const cont = document.getElementById('notasTablaContainer');
    if (!cont) return;

    if (!facturas.length) {
        cont.innerHTML = '<p class="info-text">El Excel no tiene facturas para hacerles nota.</p>';
        actualizarSeleccionInfo();
        return;
    }

    const prefijo = modoNotaActivo === 'debito' ? 'ND' : 'NC';
    const filas = facturas.map(f => {
        const key = `${f.puntoVenta}||${f.comprobanteNumero}`;
        const totalAttr = (typeof f.total === 'number') ? f.total : '';
        return `<tr data-key="${_escaparHtml(key)}">
            <td class="col-check"><input type="checkbox" class="nota-check" data-key="${_escaparHtml(key)}"></td>
            <td>${_escaparHtml(f.puntoVenta)}</td>
            <td>${_escaparHtml(f.comprobanteNumero)}</td>
            <td>${_escaparHtml(f.fechaEmision)}</td>
            <td class="num">${_fmtMonto(f.total)}</td>
            <td>${_escaparHtml(f.cuitReceptor)}</td>
            <td>${_escaparHtml(f.razonSocialReceptor)}</td>
            <td class="col-item" title="${_escaparHtml((f.descripciones || []).join(' | '))}">${_escaparHtml(f.primerItem || '')}</td>
            <td><span class="nota-letra-badge">${prefijo} ${_escaparHtml(f.letra)}</span></td>
            <td><input type="number" step="0.01" min="0" class="nota-monto" data-key="${_escaparHtml(key)}" value="${totalAttr}" disabled></td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
        <table class="notas-tabla">
            <thead>
                <tr>
                    <th class="col-check"><input type="checkbox" id="notaCheckAll" title="Seleccionar todas"></th>
                    <th>P. Venta</th><th>N°</th><th>Fecha</th><th>Total</th><th>CUIT</th>
                    <th>Receptor</th><th>1er ítem</th><th>Nota</th><th>Monto nota</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>`;
    actualizarSeleccionInfo();
}

/** Tilda/destilda una fila: actualiza el estado y habilita su monto editable. */
function toggleNota(key, checked) {
    const f = facturasDelExcel.find(x => `${x.puntoVenta}||${x.comprobanteNumero}` === key);
    if (!f) return;
    const montoInput = document.querySelector(`.nota-monto[data-key="${key}"]`);
    if (checked) {
        notasSeleccionadas.set(key, { factura: f, montoOverride: (typeof f.total === 'number') ? f.total : null });
        if (montoInput) montoInput.disabled = false;
    } else {
        notasSeleccionadas.delete(key);
        if (montoInput) {
            montoInput.disabled = true;
            montoInput.value = (typeof f.total === 'number') ? f.total : '';
        }
    }
    actualizarSeleccionInfo();
}

function toggleTodasNotas(checked) {
    document.querySelectorAll('.nota-check').forEach(chk => {
        chk.checked = checked;
        toggleNota(chk.dataset.key, checked);
    });
}

function actualizarMontoNota(key, value) {
    const sel = notasSeleccionadas.get(key);
    if (sel) sel.montoOverride = (value === '' ? null : Number(value));
}

function actualizarSeleccionInfo() {
    const info = document.getElementById('notasSeleccionInfo');
    if (!info) return;
    const n = notasSeleccionadas.size;
    info.style.display = 'block';
    if (n === 0) {
        info.textContent = 'Ninguna factura seleccionada.';
    } else {
        const tipo = modoNotaActivo === 'debito' ? 'notas de débito' : 'notas de crédito';
        info.textContent = `${n} factura(s) seleccionada(s) para generar ${tipo}.`;
    }
}

// Lista de "facturas distintas": cada elemento es un cabezal propio + sus comprobantes.
// Forma: { datos: { datosComunes, facturas }, snapshot: {...} }
//   - datos:    lo que se manda al backend
//   - snapshot: valores crudos del form para poder re-editar la tarjeta
let grupos = [];
// Índice del grupo que se está editando (o null si se está cargando uno nuevo).
let grupoEnEdicion = null;

/**
 * Obtiene la fecha actual en formato DD/MM/YYYY
 */
function obtenerFechaActual() {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

/**
 * Inicializa el módulo de facturas tipificadas
 */
async function inicializarFacturasTipificadas() {
    console.log('🔵 Inicializando módulo de Facturas Tipificadas...');

    try {
        // Verificar que hay un usuario seleccionado
        if (!window.usuarioSeleccionado) {
            mostrarError('No hay un usuario seleccionado. Por favor, seleccione un usuario primero.');
            return;
        }

        // Mostrar información del usuario seleccionado
        mostrarInfoUsuario();

        // Inicializar selector de empresas/puntos de venta
        inicializarSelectorEmpresas();

        // Establecer tipo de contribuyente (readonly)
        establecerTipoContribuyente();

        // Poblar el select de tipo de comprobante según el emisor (B/C)
        poblarSelectTipoComprobante();

        // Inicializar event listeners del formulario
        inicializarEventListeners();

        // Sincronizar modo nota/factura según el valor inicial del select.
        onCambioTipoComprobante();

        // Inicializar datepickers (ya incluye establecer fechas por defecto)
        inicializarDatePickers();

        // Resetear la lista de facturas distintas al (re)abrir la vista
        grupos = [];
        grupoEnEdicion = null;
        renderGruposGuardados();

        // Agregar la primera factura
        agregarFactura();

        // Qué está haciendo, para la rueda (contrato de componentes/rueda).
        if (window.electronAPI?.facturaTipificada?.onFacturaTipificadaUpdate && !window._ruedaTipificadaEscuchando) {
            window._ruedaTipificadaEscuchando = true;
            window.electronAPI.facturaTipificada.onFacturaTipificadaUpdate((aviso) => {
                if (window.ruedaTrabajando) window.ruedaTrabajando.recibirAviso(aviso);
            });
        }

        console.log('✅ Módulo de Facturas Tipificadas iniciado correctamente');
    } catch (error) {
        console.error('❌ Error al inicializar módulo:', error);
        mostrarError('Error al inicializar el módulo: ' + error.message);
    }
}

/**
 * Muestra la información del usuario seleccionado.
 * El PDV NO va acá: tiene su propio selector más abajo en el formulario.
 */
function mostrarInfoUsuario() {
    const infoContainer = document.getElementById('infoUsuarioFacturaTipificada');
    if (!infoContainer || !window.usuarioSeleccionado) return;

    const usuario = window.usuarioSeleccionado;
    const nombreCompleto = usuario.nombre || 'Usuario sin nombre';
    const cuitCuil = usuario.cuit || usuario.cuil || 'Sin CUIT/CUIL';

    infoContainer.innerHTML = `
        <div class="info-usuario-card">
            <div class="info-usuario-contenido">
                <h3>👤 Cliente Seleccionado</h3>
                <p><strong>Nombre:</strong> ${nombreCompleto}</p>
                <p><strong>CUIT/CUIL:</strong> ${cuitCuil}</p>
                <p><strong>Tipo:</strong> ${usuario.tipoContribuyente || 'No especificado'}</p>
            </div>
        </div>
    `;

    console.log('✅ Info de usuario mostrada:', nombreCompleto);
}

/**
 * Inicializa el selector de empresas y el selector lazy de PDV.
 */
function inicializarSelectorEmpresas() {
    if (!window.usuarioSeleccionado) return;

    // Clonar para limpiar listeners de invocaciones anteriores
    // (esta función la llama también `cancelarFormulario`).
    ['empresaPuntoVenta', 'puntoDeVentaSelect', 'btnRefrescarPdv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.replaceWith(el.cloneNode(true));
    });

    const selectEmpresa = document.getElementById('empresaPuntoVenta');
    if (!selectEmpresa) return;

    const usuario = window.usuarioSeleccionado;
    // Modelo plano: el contribuyente ES la empresa. No hay cascada empresa→PDV;
    // hay UNA sola "empresa" = la razón social del contribuyente seleccionado.
    const razonSocial = usuario.razonSocial || usuario.nombre || '';

    selectEmpresa.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = razonSocial;
    opt.textContent = razonSocial || 'Sin razón social';
    selectEmpresa.appendChild(opt);
    selectEmpresa.disabled = true;   // nada que elegir: es el contribuyente

    // El botón Refrescar hacía re-scrape de PDV en el modelo embed. En el plano
    // los PDV salen del contribuyente cacheado; el refresh a nivel contribuyente
    // (empresa.analizarContribuyente) queda pendiente. Lo ocultamos.
    mostrarBtnRefrescarPdv(false);

    // Poblar PDV del contribuyente.
    manejarCambioEmpresa({ desdeUsuario: false });

    console.log('✅ Selector de empresas inicializado (modelo plano):', razonSocial);
}

/**
 * Puebla el selector de PDV con los del contribuyente (modelo plano), pedidos
 * por CUIT al backend (contribuyente:puntosDeVenta — sin claves). Se conserva la
 * firma `{ desdeUsuario }` porque `restaurarSnapshotFormulario` la reusa para
 * repoblar el selector tras restaurar un snapshot.
 */
async function manejarCambioEmpresa({ desdeUsuario } = {}) {  // eslint-disable-line no-unused-vars
    const usuario = window.usuarioSeleccionado;
    if (!usuario) return;

    ocultarPdvInfo();   // el aviso de un cliente/corrida anterior no sigue colgado
    resetPdvSelect('Cargando puntos de venta…');

    // Misma regla que Facturas y Mercado Pago (frontend_js/facturas/pdvOfrecibles.js).
    popularPdvSelect(await window.pdvOfrecibles(usuario.cuit), true);
}

/**
 * Puebla el select de PDV con los objetos {numero, descripcion}.
 * Si `preseleccionarPrimero` es true, marca el primer PDV.
 */
function popularPdvSelect(pdvs, preseleccionarPrimero) {
    const selectPdv = document.getElementById('puntoDeVentaSelect');
    if (!selectPdv) return;

    if (!Array.isArray(pdvs) || pdvs.length === 0) {
        selectPdv.innerHTML = '<option value="">— sin facturación habilitada —</option>';
        selectPdv.disabled = true;
        mostrarPdvInfo(
            '⚠️ Esta empresa no tiene facturación habilitada en AFIP. No hay PDV activos.',
            'error'
        );
        return;
    }

    selectPdv.innerHTML = '<option value="">Seleccione un punto de venta</option>';
    pdvs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.numero;
        opt.textContent = p.descripcion ? `${p.numero} — ${p.descripcion}` : p.numero;
        selectPdv.appendChild(opt);
    });
    selectPdv.disabled = false;

    if (preseleccionarPrimero && pdvs.length > 0) {
        selectPdv.value = pdvs[0].numero;
    }
}

function resetPdvSelect(placeholder) {
    const selectPdv = document.getElementById('puntoDeVentaSelect');
    if (!selectPdv) return;
    selectPdv.innerHTML = `<option value="">${placeholder}</option>`;
    selectPdv.disabled = true;
}

function mostrarBtnRefrescarPdv(visible) {
    const btn = document.getElementById('btnRefrescarPdv');
    if (btn) btn.style.display = visible ? '' : 'none';
}

function mostrarPdvInfo(texto, tipo) {
    const info = document.getElementById('pdvInfo');
    if (!info) return;
    info.textContent = texto;
    info.style.display = 'block';
    info.style.color = tipo === 'error' ? '#dc3545'
                      : tipo === 'aviso' ? '#d97706'
                      : tipo === 'loading' ? '#0066cc'
                      : '#28a745';
}

function ocultarPdvInfo() {
    const info = document.getElementById('pdvInfo');
    if (!info) return;
    info.style.display = 'none';
    info.textContent = '';
}

function formatearFechaPdv(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return iso;
    }
}

/**
 * Establece el tipo de contribuyente en el campo readonly
 */
function establecerTipoContribuyente() {
    if (!window.usuarioSeleccionado) return;

    const input = document.getElementById('tipoContribuyenteInfo');
    if (!input) return;

    const tipoContribuyente = window.usuarioSeleccionado.tipoContribuyente;

    // Sin tipo no hay lista de comprobantes (ver poblarSelectTipoComprobante):
    // en vez del "No especificado" mostramos un select obligatorio para elegirlo.
    const faltaTipo = !tipoContribuyente;
    const grupoInfo = document.getElementById('grupoTipoContribuyenteInfo');
    const grupoElegir = document.getElementById('grupoElegirTipoContribuyente');
    const selectElegir = document.getElementById('elegirTipoContribuyente');
    if (grupoInfo) grupoInfo.style.display = faltaTipo ? 'none' : '';
    if (grupoElegir) grupoElegir.style.display = faltaTipo ? '' : 'none';
    if (selectElegir) {
        selectElegir.required = faltaTipo; // bloquea el submit hasta elegir
        selectElegir.disabled = false;
        selectElegir.value = '';
        selectElegir.onchange = onElegirTipoContribuyente;
    }

    // Formatear el valor para mostrarlo de forma amigable
    let textoMostrar = tipoContribuyente;
    if (tipoContribuyente === 'B') {
        textoMostrar = 'B - Responsable Inscripto';
    } else if (tipoContribuyente === 'C') {
        textoMostrar = 'C - Monotributista';
    }

    input.value = textoMostrar || 'No especificado';
    console.log('✅ Tipo contribuyente establecido:', textoMostrar);
}

/**
 * El usuario eligió el tipo (B/C) de un cliente que no lo tenía: se guarda en el
 * cliente y se rearma la pantalla (lista de comprobantes incluida).
 */
async function onElegirTipoContribuyente(event) {
    const select = event.target;
    const tipo = select.value;
    const aviso = document.getElementById('avisoTipoContribuyente');
    const usuario = window.usuarioSeleccionado;
    if (!tipo || !usuario) return;

    select.disabled = true;
    try {
        const resp = await window.electronAPI.user.setTipoContribuyente(usuario.id, tipo);
        if (!resp || !resp.success) throw new Error((resp && resp.error) || 'No se pudo guardar el tipo.');

        // Se modifica el MISMO objeto (no se reemplaza): así también queda al día la
        // lista de clientes cacheada del selector, que apunta a este objeto.
        usuario.tipoContribuyente = resp.tipoContribuyente;

        establecerTipoContribuyente();
        poblarSelectTipoComprobante();
        onCambioTipoComprobante();
    } catch (e) {
        select.disabled = false;
        select.value = '';
        if (aviso) { aviso.textContent = '❌ ' + e.message; aviso.style.color = '#c0392b'; }
    }
}

/**
 * Establece las fechas actuales por defecto en todos los campos de fecha
 */
function establecerFechasPorDefecto() {
    const fechaActual = obtenerFechaActual();

    const camposFecha = [
        'fechaComprobanteTipificada',
        'fechaDesde',
        'fechaHasta',
        'fechaVtoPago'
    ];

    camposFecha.forEach(id => {
        const campo = document.getElementById(id);
        if (campo && !campo.value) {
            campo.value = fechaActual;
        }
    });

    console.log('✅ Fechas establecidas a:', fechaActual);
}

/**
 * Inicializa los event listeners del formulario
 */
function inicializarEventListeners() {
    // Mostrar/ocultar sección de fechas según tipo de actividad
    const tipoActividad = document.getElementById('tipoActividad');
    if (tipoActividad) {
        tipoActividad.addEventListener('change', (e) => {
            const seccionFechas = document.getElementById('seccionFechasServicio');
            if (seccionFechas) {
                seccionFechas.style.display = e.target.value === 'Servicio' ? 'block' : 'none';
            }
        });

        // Mostrar sección de fechas al cargar si "Servicio" está preseleccionado
        const seccionFechas = document.getElementById('seccionFechasServicio');
        if (seccionFechas && tipoActividad.value === 'Servicio') {
            seccionFechas.style.display = 'block';
        }
    }

    // Select de tipo de comprobante: enchufa modo nota (picker) o factura normal.
    const selectTipoComprobante = document.getElementById('tipoComprobante');
    if (selectTipoComprobante) {
        selectTipoComprobante.addEventListener('change', onCambioTipoComprobante);
    }

    // Picker de notas: botón "Extraer data" + delegación de la tabla.
    const btnExtraer = document.getElementById('btnExtraerData');
    if (btnExtraer) {
        btnExtraer.addEventListener('click', extraerDataNotas);
    }
    const btnBuscar = document.getElementById('btnBuscarExcelNota');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', elegirExcelManual);
    }
    const notasCont = document.getElementById('notasTablaContainer');
    if (notasCont) {
        notasCont.addEventListener('change', (e) => {
            if (e.target.id === 'notaCheckAll') {
                toggleTodasNotas(e.target.checked);
            } else if (e.target.classList.contains('nota-check')) {
                toggleNota(e.target.dataset.key, e.target.checked);
            }
        });
        notasCont.addEventListener('input', (e) => {
            if (e.target.classList.contains('nota-monto')) {
                actualizarMontoNota(e.target.dataset.key, e.target.value);
            }
        });
    }

    // Botón agregar factura
    const btnAgregarFactura = document.getElementById('btnAgregarFactura');
    if (btnAgregarFactura) {
        btnAgregarFactura.addEventListener('click', agregarFactura);
    }

    // Botón agregar factura distinta (otro cabezal)
    const btnAgregarFacturaDistinta = document.getElementById('btnAgregarFacturaDistinta');
    if (btnAgregarFacturaDistinta) {
        btnAgregarFacturaDistinta.addEventListener('click', guardarFacturaDistinta);
    }

    // Generar / Probar / ⏹ Cancelar, 🧹 Limpiar y ✖ Descartar: el lanzador.
    crearLanzador();

    // Enter dentro del form no debe recargar la página. Tampoco genera: emitir
    // comprobantes reales pasa siempre por el botón y su modal.
    const form = document.getElementById('formFacturaTipificada');
    if (form) {
        form.addEventListener('submit', (e) => e.preventDefault());
        // Cambiar un dato deja sin efecto "Generar las restantes". El switch del
        // lanzador y la caja de resultado están adentro del form: no cuentan.
        const alCambiar = (e) => {
            if (e.target.closest('#lanzadorTipificada, #areaResultados')) return;
            olvidarRestantes();
        };
        form.addEventListener('input', alCambiar);
        form.addEventListener('change', alCambiar);
    }
}

/**
 * Inicializa los calendarios con el componente común (componentes/calendario).
 */
function inicializarDatePickers() {
    const fechaActual = obtenerFechaActual();
    ['fechaComprobanteTipificada', 'fechaDesde', 'fechaHasta', 'fechaVtoPago'].forEach(id => {
        const elemento = document.getElementById(id);
        if (!elemento) {
            console.error(`❌ No se encontró el elemento #${id} en el DOM`);
            return;
        }
        elemento.value = fechaActual;
        // Sin calendario (no debería pasar: flatpickr ya es local) igual se puede tipear DD/MM/YYYY.
        crearCalendario(elemento, { formato: 'd/m/Y', inicial: fechaActual });
    });
}

/**
 * Agrega una nueva factura completa al formulario
 */
function agregarFactura() {
    contadorFacturas++;
    contadoresLineasPorFactura[contadorFacturas] = 0;

    const container = document.getElementById('facturasContainer');

    if (!container) return;

    const facturaHTML = `
        <div class="factura-item" data-factura="${contadorFacturas}">
            <div class="factura-header">
                <h4>📄 Factura #${contadorFacturas}</h4>
                ${contadorFacturas > 1 ? `<button type="button" class="btn-eliminar-factura" onclick="eliminarFactura(${contadorFacturas})">❌ Quitar Factura</button>` : ''}
            </div>

            <div class="lineas-container" id="lineasFactura${contadorFacturas}">
                <!-- Las líneas de esta factura se agregarán aquí -->
            </div>

            <button type="button" class="btn-agregar-linea" onclick="agregarLineaAFactura(${contadorFacturas})">
                ➕ Agregar Línea a esta Factura
            </button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', facturaHTML);

    // Agregar la primera línea automáticamente
    agregarLineaAFactura(contadorFacturas);

    // Actualizar contador en el botón
    actualizarContadorFacturas();

    console.log('✅ Factura #' + contadorFacturas + ' agregada');
}

/**
 * Agrega una línea de detalle a una factura específica
 */
function agregarLineaAFactura(numeroFactura) {
    if (!contadoresLineasPorFactura[numeroFactura]) {
        contadoresLineasPorFactura[numeroFactura] = 0;
    }

    contadoresLineasPorFactura[numeroFactura]++;
    const numeroLinea = contadoresLineasPorFactura[numeroFactura];
    const container = document.getElementById(`lineasFactura${numeroFactura}`);

    if (!container) return;

    const lineaHTML = `
        <div class="linea-detalle" data-factura="${numeroFactura}" data-linea="${numeroLinea}">
            <div class="linea-header">
                <h5>Línea #${numeroLinea}</h5>
                ${numeroLinea > 1 ? `<button type="button" class="btn-eliminar-linea" onclick="eliminarLineaDeFactura(${numeroFactura}, ${numeroLinea})">🗑</button>` : ''}
            </div>

            <div class="form-group">
                <label for="descripcion_f${numeroFactura}_l${numeroLinea}">Descripción del Producto/Servicio *</label>
                <textarea id="descripcion_f${numeroFactura}_l${numeroLinea}"
                          name="descripcion_f${numeroFactura}_l${numeroLinea}"
                          placeholder="Ej: Consultoría en sistemas - Diciembre 2025"
                          required></textarea>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="unidadMedida_f${numeroFactura}_l${numeroLinea}">Unidad de Medida *</label>
                    <select id="unidadMedida_f${numeroFactura}_l${numeroLinea}" name="unidadMedida_f${numeroFactura}_l${numeroLinea}" required>
                        <option value="7" style="color:var(--v-texto-2, #888);">seleccionar...</option>
                        <option value="1"> kilogramos</option>
                        <option value="2"> metros</option>
                        <option value="3"> metros cuadrados</option>
                        <option value="4"> metros cúbicos</option>
                        <option value="5"> litros</option>
                        <option value="6"> 1000 kWh</option>
                        <option value="7" selected> unidades</option>
                        <option value="8"> pares</option>
                        <option value="9"> docenas</option>
                        <option value="10"> quilates</option>
                        <option value="11"> millares</option>
                        <option value="14"> gramos</option>
                        <option value="15"> milimetros</option>
                        <option value="16"> mm cúbicos</option>
                        <option value="17"> kilómetros</option>
                        <option value="18"> hectolitros</option>
                        <option value="20"> centímetros</option>
                        <option value="25"> jgo. pqt. mazo naipes</option>
                        <option value="27"> cm cúbicos</option>
                        <option value="29"> toneladas</option>
                        <option value="30"> dam cúbicos</option>
                        <option value="31"> hm cúbicos</option>
                        <option value="32"> km cúbicos</option>
                        <option value="33"> microgramos</option>
                        <option value="34"> nanogramos</option>
                        <option value="35"> picogramos</option>
                        <option value="41"> miligramos</option>
                        <option value="47"> mililitros</option>
                        <option value="48"> curie</option>
                        <option value="49"> milicurie</option>
                        <option value="50"> microcurie</option>
                        <option value="51"> uiacthor</option>
                        <option value="52"> muiacthor</option>
                        <option value="53"> kg base</option>
                        <option value="54"> gruesa</option>
                        <option value="61"> kg bruto</option>
                        <option value="62"> uiactant</option>
                        <option value="63"> muiactant</option>
                        <option value="64"> uiactig</option>
                        <option value="65"> muiactig</option>
                        <option value="66"> kg activo</option>
                        <option value="67"> gramo activo</option>
                        <option value="68"> gramo base</option>
                        <option value="96"> packs</option>
                        <option value="98"> otras unidades</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="cantidad_f${numeroFactura}_l${numeroLinea}">Cantidad *</label>
                    <input type="number"
                           id="cantidad_f${numeroFactura}_l${numeroLinea}"
                           name="cantidad_f${numeroFactura}_l${numeroLinea}"
                           min="0.01"
                           step="0.01"
                           value="1"
                           required>
                </div>

                <div class="form-group">
                    <label for="precioUnitario_f${numeroFactura}_l${numeroLinea}">Precio Unitario ($) *</label>
                    <input type="number"
                           id="precioUnitario_f${numeroFactura}_l${numeroLinea}"
                           name="precioUnitario_f${numeroFactura}_l${numeroLinea}"
                           min="0"
                           step="0.01"
                           placeholder="0.00"
                           required>
                </div>
            </div>

            <div class="form-row" id="rowAlicuota_f${numeroFactura}_l${numeroLinea}" style="display: none;">
                <div class="form-group">
                    <label for="alicuotaIVA_f${numeroFactura}_l${numeroLinea}">Alícuota IVA</label>
                    <select id="alicuotaIVA_f${numeroFactura}_l${numeroLinea}" name="alicuotaIVA_f${numeroFactura}_l${numeroLinea}">
                        <option value="3">0%</option>
                        <option value="8">2.5%</option>
                        <option value="9">5%</option>
                        <option value="4">10.5%</option>
                        <option value="5" selected>21%</option>
                        <option value="6">27%</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', lineaHTML);

    // Actualizar visibilidad de alícuotas
    actualizarVisibilidadAlicuotas();

    console.log(`✅ Línea #${numeroLinea} agregada a Factura #${numeroFactura}`);
}

/**
 * Elimina una factura completa
 */
function eliminarFactura(numeroFactura) {
    const factura = document.querySelector(`.factura-item[data-factura="${numeroFactura}"]`);
    if (factura) {
        olvidarRestantes();
        factura.remove();
        delete contadoresLineasPorFactura[numeroFactura];
        actualizarContadorFacturas();
        console.log('✅ Factura #' + numeroFactura + ' eliminada');
    }
}

/**
 * Elimina una línea de una factura específica
 */
function eliminarLineaDeFactura(numeroFactura, numeroLinea) {
    const linea = document.querySelector(`.linea-detalle[data-factura="${numeroFactura}"][data-linea="${numeroLinea}"]`);
    if (linea) {
        olvidarRestantes();
        linea.remove();
        console.log(`✅ Línea #${numeroLinea} eliminada de Factura #${numeroFactura}`);
    }
}

/**
 * Actualiza el contador de comprobantes en el botón "Generar".
 * Cuenta los comprobantes ya guardados en facturas distintas + los del form actual.
 */
function actualizarContadorFacturas() {
    actualizarTextosLanzador();
}

/**
 * Actualiza la visibilidad de los campos de alícuota IVA
 */
function actualizarVisibilidadAlicuotas() {
    // Obtener el tipo de contribuyente del usuario seleccionado
    const tipoContribuyente = window.usuarioSeleccionado?.tipoContribuyente;
    const esResponsableInscripto = tipoContribuyente === 'B';

    // Mostrar/ocultar todos los campos de alícuota
    document.querySelectorAll('[id^="rowAlicuota"]').forEach(row => {
        row.style.display = esResponsableInscripto ? 'flex' : 'none';
    });
}

/**
 * Limpia el formulario y lo deja en su estado inicial (un comprobante en blanco,
 * fechas en hoy, selectores reinicializados). NO toca la lista de facturas
 * distintas ya guardadas.
 */
function limpiarFormulario() {
    emitidasRecien = 0;
    olvidarRestantes();
    document.getElementById('formFacturaTipificada').reset();
    document.getElementById('areaResultados').classList.add('contenido-oculto');
    lanzador?.refrescar(); // ✖ Descartar ya no tiene qué descartar

    // Limpiar comprobantes
    contadorFacturas = 0;
    contadoresLineasPorFactura = {};
    document.getElementById('facturasContainer').innerHTML = '';

    // Agregar primer comprobante
    agregarFactura();

    // Re-establecer fechas por defecto
    establecerFechasPorDefecto();

    // Re-inicializar selector de empresas y tipo contribuyente
    inicializarSelectorEmpresas();
    establecerTipoContribuyente();

    // form.reset() volvió el select a la 1ra opción: re-poblar para el default correcto
    poblarSelectTipoComprobante();
    onCambioTipoComprobante(); // re-sincroniza modo nota/factura (default = factura)
}

/**
 * Cancela el formulario y limpia TODO (incluida la lista de facturas distintas).
 */
async function cancelarFormulario() {
    const ok = await showConfirmModal({
        title: 'Limpiar formulario',
        icon: '🧹',
        confirmText: 'Limpiar',
        message: 'Se borran los datos cargados y las facturas distintas guardadas.\n\n¿Desea continuar?'
    });
    if (ok) {
        grupos = [];
        grupoEnEdicion = null;
        renderGruposGuardados();
        limpiarFormulario();
        irAlPrincipio();
    }
}

// ========================================
// LANZADOR (componentes/lanzadorAutomatizacion)
// ========================================
// acciones[0] = 🧾 Generar (real), acciones[1] = 🧪 Probar 1ra (sin confirmar).
// Facturas y notas NC/ND usan los mismos dos botones: preparar() arma el lote
// según el modo, ejecutar() lo corre. Mientras corre, el botón tocado es ⏹ Cancelar.
let lanzador = null;
// Comprobantes emitidos en la última corrida real con lo que hay cargado: si se
// vuelve a tocar Generar, el modal avisa que se emitirían otra vez.
let emitidasRecien = 0;
// Lo que quedó sin salir de la última corrida ({ total, lote }): mientras exista,
// el lanzador manda SOLO eso ("Generar las N restantes"). Se olvida al tocar el
// formulario: si cambian los datos, las restantes ya no son las mismas.
let restantes = null;

function crearLanzador() {
    const contenedor = document.getElementById('lanzadorTipificada');
    if (!contenedor || !window.lanzadorAutomatizacion) return;
    const rueda = {
        servicio: 'ARCA',
        subservicio: 'Factura Tipificada',
        mensaje: 'Iniciando sesión en AFIP…'
    };
    lanzador = window.lanzadorAutomatizacion.crear(contenedor, {
        acciones: [{
            texto: 'Generar 1 Factura(s)',
            tipo: 'principal',
            nota: 'Factura real en AFIP',
            preparar: () => prepararLote(),
            confirmar: (lote) => ({
                title: lote.nota ? 'Generar notas' : 'Generar facturas',
                icon: '🧾',
                confirmText: 'Emitir',
                message: lote.restantes
                    ? `Vas a emitir solo los ${lote.total} comprobante(s) que no salieron, REALES en AFIP.\n`
                        + 'Los emitidos y los dudosos no se vuelven a mandar.'
                    : `Vas a emitir ${lote.total} comprobante(s) REALES en AFIP.\n`
                        + 'Un comprobante emitido no se deshace.'
                        + (emitidasRecien
                            ? `\n\n⚠ Con estos datos ya se emitieron ${emitidasRecien} hace un momento: si seguís, se emiten otra vez.`
                            : '')
            }),
            confirmarCancelar: () => ({
                title: '¿Cancelar la generación?',
                message: 'Los comprobantes que ya se emitieron quedan emitidos en AFIP: cancelar no los borra.\n'
                    + 'Al terminar vas a ver cuáles salieron y vas a poder generar los que faltan.'
            }),
            rueda,
            ejecutar: (lote, { visible }) => correrLote(lote, false, visible)
        }, {
            texto: 'Probar 1ra factura',
            tipo: 'prueba',
            nota: 'Sin confirmar, con captura para verificar',
            preparar: () => prepararLote(),
            rueda: { ...rueda, mensaje: 'Iniciando sesión en AFIP (modo prueba)…' },
            ejecutar: (lote, { visible }) => correrLote(lote, true, visible)
        }],
        auxiliares: [{
            texto: 'Limpiar',
            ayuda: 'Borra los datos cargados y las facturas distintas guardadas',
            alHacer: cancelarFormulario
        }, {
            texto: 'Descartar',
            ayuda: 'Deja de lado el resultado y lo que quedó pendiente. No toca AFIP ni el formulario.',
            mostrar: () => !!restantes || hayPruebaALaVista(),
            alHacer: descartarPendiente
        }]
    });
    lanzador.habilitar(true);
    actualizarTextosLanzador();
}

// Texto de los botones según el modo (factura / nota) y la cantidad cargada.
function actualizarTextosLanzador() {
    if (!lanzador) return;
    if (restantes) {
        const n = restantes.total;
        const queEs = restantes.lote.nota ? 'nota' : 'factura';
        lanzador.cambiar(0, {
            texto: `Generar ${n === 1 ? 'la restante' : `las ${n} restantes`}`,
            nota: 'Las emitidas y dudosas no se mandan'
        });
        lanzador.cambiar(1, { texto: `Probar 1ra ${queEs} restante` });
        return;
    }
    lanzador.cambiar(0, { nota: 'Factura real en AFIP' });
    if (modoNotaActivo) {
        lanzador.cambiar(0, { texto: 'Generar Nota(s)' });
        lanzador.cambiar(1, { texto: 'Probar 1ra nota' });
    } else {
        lanzador.cambiar(0, { texto: `Generar ${contarComprobantes()} Factura(s)` });
        lanzador.cambiar(1, { texto: 'Probar 1ra factura' });
    }
}

function contarComprobantes() {
    const enForm = document.querySelectorAll('.factura-item').length;
    const enGrupos = grupos.reduce((sum, g) => sum + (g.datos.facturas?.length || 0), 0);
    return enForm + enGrupos;
}

// Lo que manda el lanzador: las restantes de la corrida anterior o el formulario.
// Copia: correrLote le pone modoTest a los grupos y no tiene que tocar `restantes`.
function prepararLote() {
    return restantes ? { ...clonar(restantes.lote), restantes: true } : armarLote();
}

function fijarRestantes(valor) {
    restantes = valor && valor.total > 0 ? valor : null;
    actualizarTextosLanzador();
}

function olvidarRestantes() {
    if (restantes) fijarRestantes(null);
}

function hayPruebaALaVista() {
    return !!document.querySelector('#areaResultados:not(.contenido-oculto) .resultado-modo-prueba');
}

// ✖ Descartar: se deja de lado lo que quedó a medio camino (resultado de la
// prueba o "Generar las restantes"). No toca AFIP ni el formulario.
function descartarPendiente() {
    document.getElementById('areaResultados')?.classList.add('contenido-oculto');
    olvidarRestantes();
    lanzador?.refrescar();
    irAlPrincipio();
}

// Para empezar de nuevo: la vista arriba del formulario y el foco en su 1er campo.
function irAlPrincipio() {
    const form = document.getElementById('formFacturaTipificada');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const primero = [...form.querySelectorAll('input, select, textarea')]
        .find(el => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null);
    primero?.focus({ preventScroll: true });
}

/**
 * Arma el lote a generar (validando). null = no se arranca (el motivo queda a la vista).
 *   facturas: { nota:false, grupos, enviados, total }
 *   notas:    { nota:true, notas, nombreEmpresa, fechaComprobante, total }
 */
function armarLote() {
    if (!window.usuarioSeleccionado) {
        mostrarError('No hay un usuario seleccionado');
        return null;
    }
    // En modo nota, la generación sale del picker (no del formulario manual).
    return modoNotaActivo ? armarLoteNotas() : armarLoteFacturas();
}

/**
 * Las facturas distintas ya guardadas + (si tiene datos) el form actual.
 */
function armarLoteFacturas() {
    const form = document.getElementById('formFacturaTipificada');

    // Lista final de facturas distintas a generar (clon de las guardadas).
    // `enviados` guarda cuál es cuál: el backend contesta por índice.
    const enviados = grupos.slice();
    const gruposParaEnviar = grupos.map(g => clonar(g.datos));

    // Incluir el formulario actual si el usuario dejó datos cargados.
    if (formularioTieneDatos()) {
        if (!form.reportValidity()) return null;
        gruposParaEnviar.push(recopilarDatosFormulario());
    }

    if (gruposParaEnviar.length === 0) {
        mostrarError('No hay facturas para generar. Completá el formulario o agregá una factura distinta.');
        return null;
    }
    const total = gruposParaEnviar.reduce((s, g) => s + (g.facturas?.length || 0), 0);
    return { nota: false, grupos: gruposParaEnviar, enviados, total };
}

async function correrLote(lote, modoTest, visible) {
    // Para los otros caminos que todavía lo leen (lo que se manda sale del lote).
    modoPruebaPedido = modoTest;
    if (lote.nota) await correrLoteNotas(lote, modoTest, visible);
    else await correrLoteFacturas(lote, modoTest, visible);
}

async function correrLoteFacturas(lote, modoTest, visible) {
    const { grupos: gruposParaEnviar, enviados } = lote;
    // Modo prueba: fuente de verdad = el botón que se tocó, aplicado a todos los grupos.
    gruposParaEnviar.forEach(g => { g.datosComunes.modoTest = modoTest; });

    try {
        console.log(`📤 Enviando ${gruposParaEnviar.length} factura(s) distinta(s), ${lote.total} comprobante(s) en total`);

        ocultarResultadoAnterior();

        // Enviar al backend a través de IPC (shape nuevo: { grupos }).
        const resultado = await window.electronAPI.facturaTipificada.generarLote({ grupos: gruposParaEnviar, visible });

        console.log('📥 Resultado recibido:', resultado);

        // Lote cortado por el PDV (otra letra o no habilitado): las facturas
        // distintas que ya salieron completas se sacan de la lista, así volver a
        // generar no las emite de nuevo.
        const cortado = !!(resultado.tipoCorregido || resultado.pdvNoHabilitado);
        const quitadas = cortado ? quitarGruposEmitidos(enviados, resultado.gruposEmitidos) : [];

        if (resultado.modoTest) {
            if (resultado.success) mostrarResultadoModoPrueba(resultado);
            else mostrarFalloPrueba(resultado);
        } else if (resultado.success && resultado.resultados) {
            const pendientes = cortado ? null : pendientesDeFacturas(gruposParaEnviar, resultado.resultados);
            emitidasRecien += cortado ? 0 : resultado.resultados.filter(r => r.success).length;
            mostrarResumenFinal(resultado.resultados, cortado
                ? 'El lote se cortó por el punto de venta: no se generó nada más después del error. ' +
                  (quitadas.length
                      ? `Las facturas distintas ${quitadas.join(', ')} ya salieron y se sacaron de la lista; las demás quedaron cargadas para volver a generar.`
                      : 'Lo que no salió quedó cargado para volver a generar.')
                : null, {
                total: lote.total,
                cortadoPor: resultado.cortadoPor,
                reintento: pendientes && pendientes.total > 0
                    ? { total: pendientes.total, lote: { nota: false, grupos: pendientes.grupos, enviados: [], total: pendientes.total } }
                    : null
            });
        } else {
            mostrarError(resultado.message || 'Error al generar las facturas');
        }

        // AFIP dijo de qué tipo es el PDV y el backend ya corrigió el cliente:
        // la pantalla se pone al día sin recargar ni volver a llenar nada.
        if (resultado.tipoCorregido) {
            await aplicarTipoCorregido(resultado.tipoCorregido);
        }
        // AFIP no habilita el PDV: se recarga el desplegable con los que ofrece.
        if (resultado.pdvNoHabilitado) {
            await aplicarPdvNoHabilitado(resultado.pdvNoHabilitado);
        }

    } catch (error) {
        console.error('❌ Error al generar facturas:', error);
        mostrarError('Error: ' + error.message);
    }
}

/**
 * Lo que hay que volver a mandar: los que fallaron (no las dudosas: pueden haber
 * salido) y los que no se llegaron a intentar porque el lote se cortó.
 * @returns {{grupos: Array, total: number}}
 */
function pendientesDeFacturas(gruposEnviados, resultados) {
    const porClave = new Map(resultados.map(r => [`${r.grupo}.${r.indiceEnGrupo}`, r]));
    const gruposPendientes = [];
    gruposEnviados.forEach((g, ig) => {
        const facturas = (g.facturas || []).filter((_, i) => {
            const r = porClave.get(`${ig}.${i}`);
            return !r || (!r.success && !r.dudosa);
        });
        if (facturas.length) gruposPendientes.push({ ...clonar(g), facturas: clonar(facturas) });
    });
    const total = gruposPendientes.reduce((s, g) => s + g.facturas.length, 0);
    return { grupos: gruposPendientes, total };
}

// Mismo comprobante en la otra letra (para no perder lo elegido al corregir el tipo).
const EQUIVALENTE_COMPROBANTE = {
    B: { '2': '19', '5': '25' },   // Factura C → Factura B, Recibo C → Recibo B
    C: { '19': '2', '25': '5' }
};

/**
 * Vuelta con `tipoCorregido` (AFIP indicó la letra del PDV y el backend corrigió el
 * cliente): se actualiza tipo, lista de comprobantes y PDV SIN tocar lo cargado
 * (receptor, líneas, montos), y se ajustan las facturas distintas ya guardadas.
 * @param {{puntoVenta: string, letra: 'B'|'C'}} detalle
 */
async function aplicarTipoCorregido({ puntoVenta, letra }) {
    const usuario = window.usuarioSeleccionado;
    if (!usuario || !OPCIONES_COMPROBANTE[letra]) return;

    const pdvElegido = _valorDe('puntoDeVentaSelect') || puntoVenta;
    const comprobanteAntes = _valorDe('tipoComprobante');

    // Mismo objeto (no se reemplaza): así queda al día también la lista cacheada del selector.
    usuario.tipoContribuyente = letra;
    establecerTipoContribuyente();
    poblarSelectTipoComprobante();
    const select = document.getElementById('tipoComprobante');
    const existe = (v) => select && Array.from(select.options).some(o => o.value === v);
    if (existe(comprobanteAntes)) _setVal('tipoComprobante', comprobanteAntes);   // ej. las notas
    else if (existe(EQUIVALENTE_COMPROBANTE[letra][comprobanteAntes])) _setVal('tipoComprobante', EQUIVALENTE_COMPROBANTE[letra][comprobanteAntes]);
    onCambioTipoComprobante();

    await manejarCambioEmpresa();
    _setVal('puntoDeVentaSelect', pdvElegido);

    // Facturas distintas ya guardadas: llevan el comprobante de la letra vieja.
    const aRevisar = [];
    grupos.forEach((g, i) => {
        const c = g.datos && g.datos.datosComunes;
        if (!c) return;
        c.tipoContribuyente = letra;
        const v = c.tipoComprobante;
        if (!v || v === VALOR_NOTA_CREDITO || v === VALOR_NOTA_DEBITO) return;
        if (OPCIONES_COMPROBANTE[letra].some(o => o.value === v)) return;
        const eq = EQUIVALENTE_COMPROBANTE[letra][v];
        if (eq) c.tipoComprobante = eq;
        else aRevisar.push(i + 1);
    });
    if (grupos.length) renderGruposGuardados();

    const nombre = letra === 'B' ? 'Responsable Inscripto (Factura B)' : 'Monotributo (Factura C)';
    mostrarPdvInfo(
        `⚠️ AFIP indica que el punto de venta ${puntoVenta} es de ${nombre}. Se corrigió el cliente: revisá y volvé a generar.` +
        (aRevisar.length ? ` Revisá el comprobante de la(s) factura(s) guardada(s) ${aRevisar.join(', ')}.` : ''),
        'aviso'
    );
    document.getElementById('formFacturaTipificada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Saca de `grupos` las facturas distintas que el backend emitió completas.
 * @param {Array} enviados          copia de `grupos` al momento de mandar el lote
 * @param {number[]} [indices]      índices (en `enviados`) emitidos; el form actual
 *                                  va último y no está en `enviados`: se ignora
 * @returns {number[]} números (1..N, como en las tarjetas) de las que se sacaron
 */
function quitarGruposEmitidos(enviados, indices) {
    const emitidos = (indices || []).filter(i => enviados[i]);
    if (emitidos.length === 0) return [];
    const sacar = new Set(emitidos.map(i => enviados[i]));
    const editado = grupoEnEdicion !== null ? grupos[grupoEnEdicion] : null;
    grupos = grupos.filter(g => !sacar.has(g));
    grupoEnEdicion = editado && grupos.includes(editado) ? grupos.indexOf(editado) : null;
    actualizarBotonFacturaDistinta();
    renderGruposGuardados();
    return emitidos.map(i => i + 1);
}

/**
 * Vuelta con `pdvNoHabilitado` (AFIP no ofrece ese PDV en Comprobantes en línea;
 * el backend ya guardó la lista): se recarga el desplegable con los que ofrece,
 * sin elegir ninguno, y SIN tocar lo cargado.
 * @param {{habilitados: string[], elegido: string}} detalle
 */
async function aplicarPdvNoHabilitado({ habilitados, elegido }) {
    const usuario = window.usuarioSeleccionado;
    if (!usuario) return;

    popularPdvSelect(await window.pdvOfrecibles(usuario.cuit, habilitados), false);

    // Facturas distintas guardadas con ese PDV: van a fallar igual.
    const aRevisar = [];
    grupos.forEach((g, i) => {
        if (g.datos && g.datos.datosComunes && g.datos.datosComunes.puntoVenta === elegido) aRevisar.push(i + 1);
    });

    mostrarPdvInfo(
        `⚠️ AFIP no habilita el punto de venta ${elegido} para facturar. Estos son los que ofrece hoy: elegí uno y volvé a generar.` +
        (aRevisar.length ? ` Cambiá también el punto de venta de la(s) factura(s) guardada(s) ${aRevisar.join(', ')}.` : ''),
        'aviso'
    );
    const select = document.getElementById('puntoDeVentaSelect');
    if (select) {
        select.scrollIntoView({ behavior: 'smooth', block: 'center' });
        select.focus();
    }
}

/**
 * Arma el lote de notas (NC/ND) con las facturas tildadas en el picker + su monto
 * (default total, editable), validando monto ≤ total. El backend arma cada nota
 * desde el Excel y la genera.
 */
function armarLoteNotas() {
    if (notasSeleccionadas.size === 0) {
        mostrarError('No seleccionaste ninguna factura para hacerle nota.');
        return null;
    }

    // Modelo plano: el contribuyente ES la empresa → su razón social.
    const usuario = window.usuarioSeleccionado;
    const nombreEmpresa = usuario.razonSocial || usuario.nombre || '';
    if (!nombreEmpresa) {
        mostrarError('Elegí la empresa / razón social.');
        return null;
    }

    const fechaComprobante = document.getElementById('fechaComprobanteTipificada')?.value || '';

    // Construir y validar el lote (monto > 0 y ≤ total original).
    const notas = [];
    for (const { factura, montoOverride } of notasSeleccionadas.values()) {
        const total = (typeof factura.total === 'number') ? factura.total : null;
        let monto = (montoOverride === '' ? null : montoOverride);
        if (monto != null) {
            monto = Number(monto);
            if (!(monto > 0)) {
                mostrarError(`Monto inválido en ${factura.puntoVenta}-${factura.comprobanteNumero}.`);
                return null;
            }
            if (total != null && monto > total + 0.01) {
                mostrarError(`El monto de ${factura.puntoVenta}-${factura.comprobanteNumero} ($${monto}) no puede superar el total original ($${total}).`);
                return null;
            }
        }
        notas.push({ factura, montoOverride: (monto != null ? monto : null) });
    }
    return { nota: true, notas, nombreEmpresa, fechaComprobante, total: notas.length };
}

async function correrLoteNotas(lote, modoTest, visible) {
    const { notas, nombreEmpresa, fechaComprobante } = lote;
    const usuario = window.usuarioSeleccionado;
    const payload = { usuario, nombreEmpresa, tipoNota: modoNotaActivo, fechaComprobante, modoTest, notas, visible };

    try {
        ocultarResultadoAnterior();
        const resultado = await window.electronAPI.notaCreditoDebito.generarNotas(payload);
        console.log('📥 Resultado notas:', resultado);

        if (resultado && resultado.modoTest) {
            if (resultado.success) mostrarResultadoModoPrueba(resultado);
            else mostrarFalloPrueba(resultado);
        } else if (resultado && resultado.success && resultado.resultados) {
            // Pendientes: las que fallaron (no las dudosas) y las que no se intentaron.
            const porIndice = new Map(resultado.resultados.map(r => [r.indice, r]));
            const pendientes = notas.filter((_, i) => {
                const r = porIndice.get(i);
                return !r || (!r.success && !r.dudosa);
            });
            emitidasRecien += resultado.resultados.filter(r => r.success).length;
            mostrarResumenFinal(resultado.resultados, null, {
                total: notas.length,
                cortadoPor: resultado.cortadoPor,
                reintento: pendientes.length
                    ? { total: pendientes.length, lote: { ...lote, notas: pendientes, total: pendientes.length } }
                    : null
            });
        } else {
            mostrarError((resultado && resultado.message) || 'Error al generar las notas');
        }
    } catch (error) {
        console.error('❌ Error al generar notas:', error);
        mostrarError('Error: ' + error.message);
    }
}

/**
 * Clona en profundidad un objeto serializable (mismos datos que viajan por IPC).
 */
function clonar(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Recopila los datos del formulario en el formato esperado por el backend
 * Retorna datos comunes y array de facturas
 */
function recopilarDatosFormulario() {
    const form = document.getElementById('formFacturaTipificada');
    const formData = new FormData(form);

    // Obtener usuario seleccionado
    const usuario = window.usuarioSeleccionado;

    // Modelo plano: el contribuyente ES la empresa → su razón social.
    const nombreEmpresa = usuario.razonSocial || usuario.nombre || '';

    // PDV elegido (numero como "00006")
    const puntoVenta = formData.get('puntoDeVenta') || '';

    console.log('📍 Empresa elegida:', nombreEmpresa);
    console.log('📍 Punto de venta:', puntoVenta);

    // Datos comunes (compartidos por todas las facturas)
    const datosComunes = {
        tipoActividad: formData.get('tipoActividad'),
        tipoContribuyente: usuario.tipoContribuyente,
        // Tipo de comprobante elegido por el usuario (value del select de AFIP).
        // Si el grupo está oculto (emisor sin opciones), viaja '' y el backend usa el default.
        tipoComprobante: formData.get('tipoComprobante') || '',
        fechaComprobante: formData.get('fechaComprobante'),
        puntoVenta: puntoVenta,
        nombreEmpresa: nombreEmpresa,

        // Fechas de servicio (si aplica)
        fechaDesde: formData.get('fechaDesde') || formData.get('fechaComprobante'),
        fechaHasta: formData.get('fechaHasta') || formData.get('fechaComprobante'),
        fechaVtoPago: formData.get('fechaVtoPago') || formData.get('fechaComprobante'),

        // Datos del receptor
        receptor: {
            tipoDocumento: parseInt(formData.get('tipoDocumento')),
            numeroDocumento: formData.get('numeroDocumento').replace(/\D/g, ''),
            condicionIVA: parseInt(formData.get('condicionIVA')),
            condicionesVenta: obtenerCondicionesVentaSeleccionadas(),
            nombreCliente: formData.get('nombreCliente') || ''
        },

        // Modo prueba (solo procesa 1ra factura sin confirmar)
        modoTest: modoPruebaPedido,

        // Las facturas normales no llevan comprobante asociado; las NC/ND se generan
        // por el picker de notas (otro flujo), no por este formulario.
        comprobanteAsociado: null,

        // Datos del usuario seleccionado
        usuarioSeleccionado: usuario
    };

    // Obtener todas las facturas
    const facturas = obtenerTodasLasFacturas();

    return {
        datosComunes,
        facturas
    };
}

/**
 * Obtiene las condiciones de venta seleccionadas
 */
function obtenerCondicionesVentaSeleccionadas() {
    const checkboxes = document.querySelectorAll('input[name="condicionVenta"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * Obtiene todas las facturas con sus líneas de detalle
 */
function obtenerTodasLasFacturas() {
    const facturas = [];
    const facturasDiv = document.querySelectorAll('.factura-item');
    const tipoContribuyente = window.usuarioSeleccionado?.tipoContribuyente;

    facturasDiv.forEach((facturaDiv) => {
        const numeroFactura = facturaDiv.getAttribute('data-factura');
        const lineasDetalle = [];

        // Obtener todas las líneas de esta factura
        const lineasDiv = facturaDiv.querySelectorAll('.linea-detalle');

        lineasDiv.forEach((lineaDiv) => {
            const numeroLinea = lineaDiv.getAttribute('data-linea');

            const selectUnidad = document.getElementById(`unidadMedida_f${numeroFactura}_l${numeroLinea}`);
            const linea = {
                descripcion: document.getElementById(`descripcion_f${numeroFactura}_l${numeroLinea}`)?.value || '',
                unidadMedida: selectUnidad?.selectedOptions[0]?.text.trim() || 'unidades',
                cantidad: parseFloat(document.getElementById(`cantidad_f${numeroFactura}_l${numeroLinea}`)?.value || 1),
                precioUnitario: parseFloat(document.getElementById(`precioUnitario_f${numeroFactura}_l${numeroLinea}`)?.value || 0)
            };

            // Agregar alícuota IVA si es tipo B
            if (tipoContribuyente === 'B') {
                linea.alicuotaIVA = parseInt(document.getElementById(`alicuotaIVA_f${numeroFactura}_l${numeroLinea}`)?.value || 5);
            }

            lineasDetalle.push(linea);
        });

        // Agregar factura con sus líneas
        facturas.push({
            numeroFactura: parseInt(numeroFactura),
            lineasDetalle: lineasDetalle
        });
    });

    console.log(`📊 Total de facturas a generar: ${facturas.length}`);
    return facturas;
}

// ============================================================
// FACTURAS DISTINTAS (cada una con su propio cabezal)
// ============================================================

/**
 * Indica si el formulario actual tiene al menos una línea con datos cargados
 * (descripción o precio). Sirve para decidir si guardarlo/enviarlo o ignorarlo.
 */
function formularioTieneDatos() {
    const facturas = obtenerTodasLasFacturas();
    return facturas.some(f =>
        f.lineasDetalle.some(l => (l.descripcion || '').trim() !== '' || l.precioUnitario > 0)
    );
}

/**
 * Guarda el formulario actual como una "factura distinta" (o reemplaza la que
 * se estaba editando) y limpia el formulario para cargar la siguiente.
 */
function guardarFacturaDistinta() {
    const form = document.getElementById('formFacturaTipificada');

    // Validación nativa del cabezal + líneas (required del HTML).
    if (!form.reportValidity()) return;

    if (!formularioTieneDatos()) {
        mostrarError('Cargá al menos una línea con descripción y precio antes de agregar una factura distinta.');
        return;
    }

    const entrada = {
        datos: recopilarDatosFormulario(),
        snapshot: capturarSnapshotFormulario()
    };

    if (grupoEnEdicion !== null) {
        grupos[grupoEnEdicion] = entrada;
        grupoEnEdicion = null;
    } else {
        grupos.push(entrada);
    }

    renderGruposGuardados();
    actualizarBotonFacturaDistinta();
    limpiarFormulario();

    // Arrastrar del form anterior los campos "boilerplate" para no recargarlos a mano.
    // Lo que cambia entre facturas (cliente, montos) queda en blanco.
    precargarCamposComunes(entrada.snapshot);

    const section = document.getElementById('facturasDistintasSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Copia al formulario (ya limpio) los campos que conviene arrastrar de la factura
 * anterior: fechas, condición de pago, condición frente al IVA y descripción.
 * Cliente y montos NO se copian (cambian en cada factura).
 */
function precargarCamposComunes(snap) {
    if (!snap || !snap.cabezal) return;
    const c = snap.cabezal;

    // Tipo de actividad: para que la sección de fechas de servicio quede visible igual.
    const selTipo = document.getElementById('tipoActividad');
    if (selTipo && c.tipoActividad) {
        selTipo.value = c.tipoActividad;
        selTipo.dispatchEvent(new Event('change'));
    }

    // Tipo de comprobante (arrastrar el elegido en la factura anterior).
    _setVal('tipoComprobante', c.tipoComprobante);

    // Fechas (comprobante + servicio).
    _setFecha('fechaComprobanteTipificada', c.fechaComprobante);
    _setFecha('fechaDesde', c.fechaDesde);
    _setFecha('fechaHasta', c.fechaHasta);
    _setFecha('fechaVtoPago', c.fechaVtoPago);

    // Condición frente al IVA.
    _setVal('condicionIVA', c.condicionIVA);

    // Condición de pago (condiciones de venta).
    document.querySelectorAll('input[name="condicionVenta"]').forEach((cb) => {
        cb.checked = (c.condicionesVenta || []).includes(cb.value);
    });

    // Descripción de la primera línea (el resto de la línea —cantidad/precio— queda en blanco).
    const primeraDescripcion = snap.comprobantes?.[0]?.lineas?.[0]?.descripcion || '';
    if (primeraDescripcion) _setVal('descripcion_f1_l1', primeraDescripcion);
}

/**
 * Captura los valores crudos del formulario para poder re-editar la tarjeta
 * después. Guarda valores de selects (índice de empresa, value de unidad/IVA)
 * que se pierden en el formato que va al backend.
 */
function capturarSnapshotFormulario() {
    const form = document.getElementById('formFacturaTipificada');
    const fd = new FormData(form);

    const cabezal = {
        tipoActividad: fd.get('tipoActividad') || '',
        tipoComprobante: fd.get('tipoComprobante') || '',
        empresaIndex: fd.get('empresaPuntoVenta') || '',
        puntoVenta: fd.get('puntoDeVenta') || '',
        fechaComprobante: fd.get('fechaComprobante') || '',
        fechaDesde: fd.get('fechaDesde') || '',
        fechaHasta: fd.get('fechaHasta') || '',
        fechaVtoPago: fd.get('fechaVtoPago') || '',
        tipoDocumento: fd.get('tipoDocumento') || '',
        numeroDocumento: fd.get('numeroDocumento') || '',
        condicionIVA: fd.get('condicionIVA') || '',
        nombreCliente: fd.get('nombreCliente') || '',
        condicionesVenta: obtenerCondicionesVentaSeleccionadas()
    };

    const comprobantes = [];
    document.querySelectorAll('.factura-item').forEach((div) => {
        const nf = div.getAttribute('data-factura');
        const lineas = [];
        div.querySelectorAll('.linea-detalle').forEach((ld) => {
            const nl = ld.getAttribute('data-linea');
            lineas.push({
                descripcion: _valorDe(`descripcion_f${nf}_l${nl}`),
                unidadMedida: _valorDe(`unidadMedida_f${nf}_l${nl}`),
                cantidad: _valorDe(`cantidad_f${nf}_l${nl}`),
                precioUnitario: _valorDe(`precioUnitario_f${nf}_l${nl}`),
                alicuotaIVA: _valorDe(`alicuotaIVA_f${nf}_l${nl}`)
            });
        });
        comprobantes.push({ lineas });
    });

    return { cabezal, comprobantes };
}

/**
 * Reconstruye el formulario a partir de un snapshot (para editar una tarjeta).
 */
async function restaurarSnapshotFormulario(snap) {
    limpiarFormulario(); // deja un comprobante con una línea en blanco

    const c = snap.cabezal;

    // Tipo de actividad (dispara visibilidad de la sección de fechas de servicio).
    const selTipo = document.getElementById('tipoActividad');
    if (selTipo) {
        selTipo.value = c.tipoActividad;
        selTipo.dispatchEvent(new Event('change'));
    }

    // Tipo de comprobante (el select ya fue repoblado por limpiarFormulario).
    _setVal('tipoComprobante', c.tipoComprobante);

    // Empresa + PDV: poblar desde caché, sin disparar scraping.
    const selEmpresa = document.getElementById('empresaPuntoVenta');
    if (selEmpresa && c.empresaIndex !== '') {
        selEmpresa.value = c.empresaIndex;
        await manejarCambioEmpresa({ desdeUsuario: false });
        _setVal('puntoDeVentaSelect', c.puntoVenta);
    }

    // Fechas (respetando flatpickr si está inicializado).
    _setFecha('fechaComprobanteTipificada', c.fechaComprobante);
    _setFecha('fechaDesde', c.fechaDesde);
    _setFecha('fechaHasta', c.fechaHasta);
    _setFecha('fechaVtoPago', c.fechaVtoPago);

    // Receptor.
    _setVal('tipoDocumento', c.tipoDocumento);
    _setVal('numeroDocumento', c.numeroDocumento);
    _setVal('condicionIVA', c.condicionIVA);
    _setVal('nombreCliente', c.nombreCliente);

    // Condiciones de venta.
    document.querySelectorAll('input[name="condicionVenta"]').forEach((cb) => {
        cb.checked = (c.condicionesVenta || []).includes(cb.value);
    });

    // Reconstruir comprobantes y líneas. limpiarFormulario ya dejó el #1 con 1 línea.
    const comprobantes = snap.comprobantes || [];
    comprobantes.forEach((comp, idxComp) => {
        if (idxComp > 0) agregarFactura();

        const facturaDiv = document.querySelectorAll('.factura-item')[idxComp];
        if (!facturaDiv) return;
        const numeroFactura = facturaDiv.getAttribute('data-factura');

        const lineas = comp.lineas || [];
        for (let l = 1; l < lineas.length; l++) {
            agregarLineaAFactura(parseInt(numeroFactura));
        }

        const lineasDiv = facturaDiv.querySelectorAll('.linea-detalle');
        lineas.forEach((linea, idxLinea) => {
            const ld = lineasDiv[idxLinea];
            if (!ld) return;
            const nl = ld.getAttribute('data-linea');
            _setVal(`descripcion_f${numeroFactura}_l${nl}`, linea.descripcion);
            _setVal(`unidadMedida_f${numeroFactura}_l${nl}`, linea.unidadMedida);
            _setVal(`cantidad_f${numeroFactura}_l${nl}`, linea.cantidad);
            _setVal(`precioUnitario_f${numeroFactura}_l${nl}`, linea.precioUnitario);
            _setVal(`alicuotaIVA_f${numeroFactura}_l${nl}`, linea.alicuotaIVA);
        });
    });

    actualizarVisibilidadAlicuotas();
    actualizarContadorFacturas();
}

/**
 * Carga una factura distinta guardada en el formulario para editarla.
 */
async function editarGrupo(indice) {
    const g = grupos[indice];
    if (!g) return;

    grupoEnEdicion = indice;
    olvidarRestantes();
    actualizarBotonFacturaDistinta();
    await restaurarSnapshotFormulario(g.snapshot);

    const cont = document.getElementById('formularioFacturaTipificada');
    if (cont) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Quita una factura distinta de la lista.
 */
function eliminarGrupo(indice) {
    if (!confirm('¿Quitar esta factura distinta de la lista?')) return;

    grupos.splice(indice, 1);
    olvidarRestantes();

    // Ajustar el índice en edición si corresponde.
    if (grupoEnEdicion === indice) {
        grupoEnEdicion = null;
        actualizarBotonFacturaDistinta();
    } else if (grupoEnEdicion !== null && indice < grupoEnEdicion) {
        grupoEnEdicion--;
    }

    renderGruposGuardados();
}

/**
 * Pinta las tarjetas de facturas distintas guardadas.
 */
function renderGruposGuardados() {
    const section = document.getElementById('facturasDistintasSection');
    const container = document.getElementById('facturasDistintasContainer');
    const contador = document.getElementById('contadorGrupos');
    if (!container) return;

    if (contador) contador.textContent = grupos.length;
    if (section) section.style.display = grupos.length > 0 ? 'block' : 'none';

    container.innerHTML = '';
    grupos.forEach((g, i) => {
        const dc = g.datos.datosComunes;
        const cliente = (dc.receptor?.nombreCliente || '').trim()
            || dc.receptor?.numeroDocumento || 'Sin cliente';
        const fecha = dc.fechaComprobante || '';
        const nComprobantes = g.datos.facturas?.length || 0;
        const total = calcularTotalGrupo(g.datos);
        const totalFmt = total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const editando = grupoEnEdicion === i;

        const card = document.createElement('div');
        card.className = 'grupo-card' + (editando ? ' grupo-card-editando' : '');
        card.innerHTML = `
            <div class="grupo-card-info">
                <strong>#${i + 1}</strong>
                <span class="grupo-cliente">${_escaparHtml(cliente)}</span>
                <span class="grupo-meta">${_escaparHtml(fecha)} · $${totalFmt} · ${nComprobantes} comprobante(s)${editando ? ' · ✏ editando…' : ''}</span>
            </div>
            <div class="grupo-card-acciones">
                <button type="button" class="btn-editar-grupo" onclick="editarGrupo(${i})">✏ Editar</button>
                <button type="button" class="btn-eliminar-grupo" onclick="eliminarGrupo(${i})">🗑</button>
            </div>
        `;
        container.appendChild(card);
    });

    actualizarContadorFacturas();
}

/**
 * Suma el total (cantidad × precio) de todos los comprobantes de una factura distinta.
 */
function calcularTotalGrupo(datos) {
    let total = 0;
    (datos.facturas || []).forEach(f => {
        (f.lineasDetalle || []).forEach(l => {
            total += (l.cantidad || 0) * (l.precioUnitario || 0);
        });
    });
    return total;
}

/**
 * Cambia el texto del botón según si se está agregando o editando.
 */
function actualizarBotonFacturaDistinta() {
    const btn = document.getElementById('btnAgregarFacturaDistinta');
    if (!btn) return;
    btn.textContent = grupoEnEdicion !== null
        ? '💾 Guardar cambios de la factura distinta'
        : '➕ Agregar factura distinta (otro cabezal)';
}

// --- helpers de bajo nivel ---

function _valorDe(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function _setVal(id, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.value = value;
}

function _setFecha(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el._flatpickr) {
        el._flatpickr.setDate(value, false);
    } else {
        el.value = value || '';
    }
}

function _escaparHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Muestra un mensaje de éxito
 */
function mostrarExito(resultado) {
    const areaResultados = document.getElementById('areaResultados');
    const mensajeResultado = document.getElementById('mensajeResultado');

    if (!areaResultados || !mensajeResultado) return;

    let html = `
        <div class="mensaje-exito">
            <h4>✅ Factura generada exitosamente</h4>
            <p>${resultado.message || 'La factura se generó correctamente'}</p>
    `;

    html += `</div>`;

    mensajeResultado.innerHTML = html;
    // PDF generado: componente común (componentes/archivoResultado)
    if (resultado.data?.pdfPath) {
        mensajeResultado.querySelector('.mensaje-exito').appendChild(
            window.archivoResultado.crearBloque(resultado.data.pdfPath, { titulo: 'PDF de la factura', etiquetaAbrir: 'Abrir PDF' })
        );
    }
    revelarResultado();
}

/**
 * Muestra un mensaje de error
 */
function mostrarError(mensaje) {
    const areaResultados = document.getElementById('areaResultados');
    const mensajeResultado = document.getElementById('mensajeResultado');

    if (!areaResultados || !mensajeResultado) return;

    mensajeResultado.innerHTML = `
        <div class="mensaje-error">
            <h4>❌ Error al generar factura</h4>
            <p>${mensaje}</p>
        </div>
    `;

    revelarResultado();
}

/**
 * Muestra el resultado y lleva la vista y el foco a su encabezado: se lee
 * bajando y abajo quedan los botones del lanzador.
 */
function revelarResultado() {
    const area = document.getElementById('areaResultados');
    if (!area) return;
    area.classList.remove('contenido-oculto');
    const titulo = area.querySelector('#mensajeResultado h4') || area.querySelector('h3');
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (titulo) {
        titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
    }
}

/**
 * Al arrancar un lote: el resultado de la corrida anterior ya no aplica.
 * (El avance se ve en la rueda.)
 */
function ocultarResultadoAnterior() {
    document.getElementById('areaResultados')?.classList.add('contenido-oculto');
}

/**
 * Muestra el resumen final de todas las facturas generadas
 */
/**
 * @param {Array} resultados
 * @param {string|null} nota
 * @param {object} [extra]
 * @param {number} [extra.total]       comprobantes del lote (los sin resultado no se intentaron)
 * @param {string|null} [extra.cortadoPor]  'cancelado' | 'cerrado'
 * @param {{total:number, lote:object}|null} [extra.reintento]  lo que falta mandar
 */
function mostrarResumenFinal(resultados, nota = null, extra = {}) {
    const areaResultados = document.getElementById('areaResultados');
    const mensajeResultado = document.getElementById('mensajeResultado');

    const exitosas = resultados.filter(r => r.success).length;
    const fallidas = resultados.filter(r => !r.success).length;
    const dudosas = resultados.filter(r => r.dudosa).length;
    const noIntentadas = Math.max(0, (extra.total || resultados.length) - resultados.length);
    const motivoCorte = extra.cortadoPor === 'cancelado' ? '⏹ Cancelado por el usuario'
        : extra.cortadoPor === 'cerrado' ? '⏹ Se cerró el navegador antes de terminar' : '';

    let html = `
        <div class="resumen-lote">
            <h4>📊 Resumen de Generación de Facturas</h4>
            ${motivoCorte ? `<p class="resumen-corte"><strong>${motivoCorte}</strong></p>` : ''}
            <p><strong>Total del lote:</strong> ${extra.total || resultados.length}</p>
            <p><strong>✅ Exitosas:</strong> ${exitosas}</p>
            <p><strong>❌ Fallidas:</strong> ${fallidas}</p>
            ${noIntentadas ? `<p><strong>⏸ No se intentaron:</strong> ${noIntentadas}</p>` : ''}
            ${dudosas ? `<p class="resumen-dudosa"><strong>⚠ ${dudosas} se cortaron mientras se confirmaban: no sabemos si AFIP las grabó. Revisalas en Mis Comprobantes; "Generar las restantes" NO las incluye, para no emitirlas dos veces.</strong></p>` : ''}
            ${nota ? `<p><strong>⚠️ ${nota}</strong></p>` : ''}
            <hr>
            <h5>Detalles:</h5>
            <ul class="lista-resultados">
    `;

    // Con varias facturas distintas se dice de cuál es cada comprobante
    // (número de tarjeta al momento de generar).
    const variosGrupos = new Set(resultados.map(r => r.grupo)).size > 1;
    const etiquetaResultado = (r, index) => variosGrupos && r.grupo !== undefined
        ? `Factura distinta ${r.grupo + 1} · comprobante #${r.numeroFactura}`
        : `Factura #${index + 1}`;

    resultados.forEach((resultado, index) => {
        if (resultado.success) {
            html += `
                <li class="resultado-exitoso">
                    ✅ ${etiquetaResultado(resultado, index)}
                    ${resultado.pdfPath ? `<div class="lugar-archivo" data-indice="${index}"></div>` : ''}
                </li>
            `;
        } else {
            const icono = resultado.dudosa ? '⚠' : resultado.cortado ? '⏹' : '❌';
            const texto = resultado.dudosa ? 'dudosa (se cortó confirmando)' : (resultado.message || resultado.error);
            html += `
                <li class="resultado-error">
                    ${icono} ${etiquetaResultado(resultado, index)}: ${texto}
                </li>
            `;
        }
    });

    html += `
            </ul>
        </div>
    `;

    mensajeResultado.innerHTML = html;
    // PDF de cada factura: un renglón del componente común (componentes/archivoResultado)
    mensajeResultado.querySelectorAll('.lugar-archivo').forEach(lugar => {
        const ruta = resultados[Number(lugar.dataset.indice)].pdfPath;
        lugar.appendChild(window.archivoResultado.crearFila(ruta, { etiquetaAbrir: 'Abrir PDF', etiquetaCarpeta: 'Carpeta' }));
    });
    // Lo que falló (no las dudosas) + lo que no se intentó: lo manda el lanzador.
    fijarRestantes(extra.reintento || null);
    if (restantes) {
        const n = restantes.total;
        const aviso = document.createElement('p');
        aviso.className = 'resumen-siguiente';
        aviso.textContent = `Para seguir, usá "Generar ${n === 1 ? 'la restante' : `las ${n} restantes`}" abajo: manda solo lo que no salió.`;
        mensajeResultado.querySelector('.resumen-lote').appendChild(aviso);
    }
    revelarResultado();
}

/**
 * La prueba no llegó a la captura: cancelada, navegador cerrado o error.
 */
function mostrarFalloPrueba(resultado) {
    if (resultado.error === 'CANCELADO' || resultado.error === 'NAVEGADOR_CERRADO') {
        const areaResultados = document.getElementById('areaResultados');
        const mensajeResultado = document.getElementById('mensajeResultado');
        if (!areaResultados || !mensajeResultado) return;
        mensajeResultado.innerHTML = `
            <div class="resumen-lote">
                <h4>⏹ Prueba ${resultado.error === 'CANCELADO' ? 'cancelada' : 'cortada: se cerró el navegador'}</h4>
                <p>No se emitió nada en AFIP.</p>
            </div>`;
        revelarResultado();
        return;
    }
    mostrarError(resultado.message || 'La prueba no se pudo completar.');
}

/**
 * Muestra el resultado del modo prueba
 */
function mostrarResultadoModoPrueba(resultado) {
    const areaResultados = document.getElementById('areaResultados');
    const mensajeResultado = document.getElementById('mensajeResultado');

    const html = `
        <div class="resultado-modo-prueba">
            <h4>🧪 Modo Prueba Completado</h4>
            <div class="mensaje-info">
                <p><strong>La factura NO fue confirmada.</strong></p>
                <p>Se ha generado una captura de pantalla para que puedas verificar los datos antes de generar la factura real.</p>
                <p>Revisa que:</p>
                <ul>
                    <li>La unidad de medida sea correcta</li>
                    <li>Los importes sean correctos</li>
                    <li>Los datos del receptor estén bien</li>
                    <li>Las fechas sean las esperadas</li>
                </ul>
            </div>
            <div class="acciones-modo-prueba">
                <p><strong>Si todo está correcto:</strong></p>
                <ol>
                    <li>Hacé clic en "Generar" (el botón azul): ese sí emite en AFIP</li>
                </ol>
            </div>
        </div>
    `;

    mensajeResultado.innerHTML = html;
    // Captura de la prueba: componente común (componentes/archivoResultado).
    // Va antes de "Si todo está correcto": primero se mira, después se decide.
    if (resultado.screenshotPath) {
        mensajeResultado.querySelector('.resultado-modo-prueba').insertBefore(
            window.archivoResultado.crearBloque(resultado.screenshotPath, { titulo: 'Captura de la prueba', etiquetaAbrir: 'Ver captura' }),
            mensajeResultado.querySelector('.acciones-modo-prueba')
        );
    }
    revelarResultado();

}

// Exponer funciones globalmente
window.inicializarFacturasTipificadas = inicializarFacturasTipificadas;
window.eliminarFactura = eliminarFactura;
window.eliminarLineaDeFactura = eliminarLineaDeFactura;
window.agregarLineaAFactura = agregarLineaAFactura;
window.mostrarInfoUsuario = mostrarInfoUsuario; // Para actualizar cuando se cambia de usuario
window.editarGrupo = editarGrupo;   // Facturas distintas: editar tarjeta
window.eliminarGrupo = eliminarGrupo; // Facturas distintas: quitar tarjeta

console.log('📦 Módulo facturaTipificada.js cargado');
