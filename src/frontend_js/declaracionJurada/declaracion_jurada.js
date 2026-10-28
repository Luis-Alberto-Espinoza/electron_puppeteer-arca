/**
 * MÓDULO: Declaración Jurada — alta por "Nuevo" (modo prueba).
 * Elige cliente (componente SelectorUsuarios, igual que Factura) + CUIT / Organismo /
 * Formulario / Período, y dispara el flujo que llena el form hasta antes de Aceptar.
 *
 * Expone window.inicializarDeclaracionJurada (lo invoca el controlador al cargar).
 */

let selectorUsuariosDDJJ = null;
let clienteSeleccionado = null;    // objeto usuario completo
let archivoExcel = null;           // ruta del Excel elegido (preview)

// Retenciones/percepciones del F.5111 (deben matchear EXACTO la descripción de la fila
// en AFIP — paso_18 las busca por ese texto). El usuario asigna un .txt a las que quiera.
const TIPOS_RETENCION = [
    'Retenciones Sufridas',
    'Percepciones Aduaneras',
    'Percepciones',
    'Pagos a Cuenta',
    'Recaudaciones SIRCREB/SIRCUPA',
    'Otros Débitos',
    'Otros Créditos'
];
let retencionesArchivos = {};      // { [etiqueta]: rutaTxt }
let carpetaRetenciones = null;     // carpeta elegida a mano (pisa la del cliente en el auto-detect)
let ultimaCarga = null;            // datos de la última carga (para escribir los totales de AFIP al Excel)
let enCurso = false;               // hay una automatización corriendo (cargar o buscar): botones bloqueados
let corridaGraba = false;          // la carga en curso graba en AFIP (Cancelar pide confirmación)
let lanzadorCarga = null;          // Cargar ↔ Cancelar + Limpiar / Descartar (paso 3)
let lanzadorBuscar = null;         // Buscar borrador ↔ Cancelar (paso 2)

window.inicializarDeclaracionJurada = inicializarDeclaracionJurada;

function inicializarDeclaracionJurada() {
    console.log('🟢 Inicializando Declaración Jurada (modo prueba)...');

    if (typeof SelectorUsuarios === 'undefined') {
        console.warn('SelectorUsuarios aún no disponible — reintentando...');
        setTimeout(inicializarDeclaracionJurada, 100);
        return;
    }

    clienteSeleccionado = null;
    enCurso = false;
    archivoExcel = null;
    retencionesArchivos = {};
    carpetaRetenciones = null;
    montarRetenciones();
    pintarCarpetaRetenciones();

    crearLanzadores();

    // "Reemplazar borrador" solo tiene sentido si se graba: sin Grabar queda deshabilitado.
    const chkGrabar = document.getElementById('ddjj-grabar');
    if (chkGrabar) chkGrabar.addEventListener('change', actualizarOpcionesCorrida);
    const chkReemplazar = document.getElementById('ddjj-reemplazar-borrador');
    if (chkReemplazar) chkReemplazar.addEventListener('change', actualizarLabelBoton);
    actualizarOpcionesCorrida();

    // Período: mes + año (default: mes anterior, lo que se suele declarar).
    montarPeriodo();

    // Fecha de pago: por defecto HOY y no se puede elegir una fecha anterior (mínimo = hoy).
    // Calendario común: .value sigue en ISO (AAAA-MM-DD), en pantalla se ve dd/mm/aaaa.
    const inputFechaPago = document.getElementById('ddjj-fecha-pago');
    if (inputFechaPago) {
        crearCalendario(inputFechaPago, {
            formato: 'Y-m-d', ver: 'd/m/Y',
            inicial: inputFechaPago.value || 'hoy',
            minimo: 'today',
            obligatorio: true, mensajeObligatorio: 'La fecha de pago es requerida.'
        });
    }

    // Excel: elegir archivo + cambio de hoja → preview.
    const btnExcel = document.getElementById('ddjj-btn-excel');
    if (btnExcel) btnExcel.addEventListener('click', elegirExcel);
    const selHoja = document.getElementById('ddjj-hoja');
    if (selHoja) selHoja.addEventListener('change', previsualizarHoja);

    const btnAuto = document.getElementById('ddjj-btn-autodetectar');
    if (btnAuto) btnAuto.addEventListener('click', () => autodetectarRetenciones(false));
    const btnCarpeta = document.getElementById('ddjj-btn-carpeta-ret');
    if (btnCarpeta) btnCarpeta.addEventListener('click', elegirCarpetaRetenciones);

    // Rueda: ipcRenderer.on acumula listeners → se registra UNA vez para toda la app.
    if (!window.__ddjjListenerRegistrado && window.electronAPI.declaracionJurada.onUpdate) {
        window.electronAPI.declaracionJurada.onUpdate((aviso) => window.ruedaTrabajando && window.ruedaTrabajando.recibirAviso(aviso));
        window.__ddjjListenerRegistrado = true;
    }

    montarSelectorUsuarios();
}

// ---------- Excel: elegir, sugerir hoja, previsualizar ----------

async function elegirExcel() {
    try {
        const r = await window.electronAPI.declaracionJurada.elegirExcel();
        if (!r || r.canceled) return;
        if (!r.success) { setEstado('error', `❌ ${r.message || 'No se pudo abrir el Excel'}`); return; }

        archivoExcel = r.archivo;
        const nombre = r.archivo.split(/[\\/]/).pop();
        const lblNombre = document.getElementById('ddjj-excel-nombre');
        if (lblNombre) lblNombre.textContent = nombre;

        // Poblar hojas y auto-sugerir la del cliente.
        const selHoja = document.getElementById('ddjj-hoja');
        const wrap = document.getElementById('ddjj-hoja-wrap');
        selHoja.innerHTML = '';
        for (const h of (r.hojas || [])) {
            const o = document.createElement('option');
            o.value = h; o.textContent = h;
            selHoja.appendChild(o);
        }
        const sugerida = sugerirHoja(r.hojas || [], clienteSeleccionado);
        if (sugerida) selHoja.value = sugerida;
        if (wrap) wrap.style.display = 'block';

        previsualizarHoja();
    } catch (err) {
        console.error('❌ Error eligiendo Excel:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    }
}

/** Sugiere la hoja cuyo nombre mejor matchea el nombre del cliente. */
function sugerirHoja(hojas, usuario) {
    if (!usuario) return null;
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const nombreCliente = norm(`${usuario.nombre || ''} ${usuario.apellido || ''}`);
    let mejor = null, mejorScore = 0;
    for (const h of hojas) {
        const hn = norm(h);
        if (!hn) continue;
        let score = 0;
        if (nombreCliente.includes(hn) || hn.includes(nombreCliente)) score = 3;
        else score = hn.split(/\s+/).filter(t => t.length > 2 && nombreCliente.includes(t)).length;
        if (score > mejorScore) { mejorScore = score; mejor = h; }
    }
    return mejorScore > 0 ? mejor : null;
}

async function previsualizarHoja() {
    const cont = document.getElementById('ddjj-preview');
    if (!cont) return;
    const hoja = (document.getElementById('ddjj-hoja') || {}).value || '';
    const periodo = ((document.getElementById('ddjj-periodo') || {}).value || '').trim();

    if (!archivoExcel || !hoja) { cont.style.display = 'none'; return; }
    if (!/^\d{6}$/.test(periodo)) {
        cont.style.display = 'block';
        cont.innerHTML = '<span class="ddjj-prev-warn">Completá un período válido (mes y año) para ver los datos.</span>';
        return;
    }

    cont.style.display = 'block';
    cont.innerHTML = '<span class="ddjj-hint">Leyendo…</span>';
    try {
        const r = await window.electronAPI.declaracionJurada.parsearHoja({ archivo: archivoExcel, hoja, periodo });
        if (!r || !r.success) {
            cont.innerHTML = `<span class="ddjj-prev-warn">⚠️ ${r?.message || 'No se pudo parsear la hoja'}</span>`;
            return;
        }
        cont.innerHTML = renderPreview(r.modelo);
    } catch (err) {
        cont.innerHTML = `<span class="ddjj-prev-warn">⚠️ ${err?.message || err}</span>`;
    }
}

function fmtNum(n) {
    return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPreview(m) {
    const acts = (m.actividades || []).map(a =>
        `<li><b>${a.actividad || '(sin nombre)'}</b> — Base <b>$${fmtNum(a.base)}</b> · alíc ${(a.alicuota * 100).toFixed(2)}% · imp $${fmtNum(a.impuesto)}</li>`
    ).join('');
    const signo = m.aFavor ? 'a favor' : 'a pagar';
    return `
        <div class="ddjj-prev-head">📄 ${m.hoja} · ${m.mes} (${m.periodo})</div>
        <ul class="ddjj-prev-acts">${acts}</ul>
        <div class="ddjj-prev-grid">
            <span>Imp. determinado: <b>$${fmtNum(m.impuestoDeterminado)}</b></span>
            <span>Mínimo: $${fmtNum(m.minimo)}</span>
            <span>Retenciones: $${fmtNum(m.retenciones)}</span>
            <span>Percepciones: $${fmtNum(m.percepciones)}</span>
            <span>SIRCREB: $${fmtNum(m.sircreb)}</span>
            <span>SIRTAC: $${fmtNum(m.sirtac)}</span>
            <span>Saldo a favor ant.: $${fmtNum(m.safAnterior)}</span>
            <span>Saldo: <b>$${fmtNum(m.saldo)}</b> (${signo})</span>
        </div>`;
}

// ---------- Retenciones / percepciones (varios .txt por tipo + auto-detect) ----------
// retencionesArchivos = { [etiqueta]: [ruta, ruta, ...] }  (una fila admite varios archivos)

function clienteParaRuta() {
    if (!clienteSeleccionado) return null;
    return {
        cuit: clienteSeleccionado.cuit || clienteSeleccionado.cuil,
        nombre: clienteSeleccionado.nombre,
        apellido: clienteSeleccionado.apellido
    };
}

function montarRetenciones() {
    const cont = document.getElementById('ddjj-retenciones-lista');
    if (!cont) return;
    cont.innerHTML = '';
    TIPOS_RETENCION.forEach((etiqueta) => {
        const fila = document.createElement('div');
        fila.className = 'ddjj-ret-fila';
        fila.innerHTML = `
            <span class="ddjj-ret-nombre">${etiqueta}</span>
            <button type="button" class="ui-btn ui-btn--ghost ddjj-ret-elegir" data-ret="${etiqueta}">📂 Agregar .txt…</button>
            <span class="ddjj-ret-archivos" data-ret-archivos="${etiqueta}"></span>`;
        cont.appendChild(fila);
    });
    cont.querySelectorAll('.ddjj-ret-elegir').forEach(b =>
        b.addEventListener('click', () => elegirTxtRetencion(b.getAttribute('data-ret'))));
    TIPOS_RETENCION.forEach(pintarRetencion);
}

async function elegirTxtRetencion(etiqueta) {
    try {
        const r = await window.electronAPI.declaracionJurada.elegirTxt({ cliente: clienteParaRuta() });
        if (!r || r.canceled) return;
        if (!r.success) { setEstado('error', `❌ ${r.message || 'No se pudo abrir el archivo'}`); return; }
        (retencionesArchivos[etiqueta] = retencionesArchivos[etiqueta] || []).push(r.archivo);
        pintarRetencion(etiqueta);
        // Aviso temprano si el .txt elegido es de otro CUIT (igual lo frena la red de seguridad al cargar).
        const ajeno = (r.archivo.split(/[\\/]/).pop().match(/(\d{11})/) || [])[1];
        const cuitCli = String((clienteParaRuta() || {}).cuit || '').replace(/\D/g, '');
        if (cuitCli && ajeno && ajeno !== cuitCli) {
            setEstado('error', `🚨 ¡Ojo! Ese archivo es del CUIT ${ajeno}, distinto al del cliente. No vas a poder avanzar hasta quitarlo.`);
        }
    } catch (err) {
        console.error('❌ Error eligiendo .txt:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    }
}

function quitarTxtRetencion(etiqueta, idx) {
    const arr = retencionesArchivos[etiqueta] || [];
    arr.splice(idx, 1);
    if (!arr.length) delete retencionesArchivos[etiqueta];
    pintarRetencion(etiqueta);
}

function pintarRetencion(etiqueta) {
    const cont = document.querySelector(`[data-ret-archivos="${etiqueta}"]`);
    if (!cont) return;
    const rutas = retencionesArchivos[etiqueta] || [];
    if (!rutas.length) {
        cont.innerHTML = '<span class="ddjj-hint">—</span>';
        return;
    }
    cont.innerHTML = rutas.map((r, i) =>
        `<span class="ddjj-ret-chip">${r.split(/[\\/]/).pop()}<button type="button" class="ddjj-ret-quitar" data-ret="${etiqueta}" data-idx="${i}" title="Quitar">✕</button></span>`
    ).join('');
    cont.querySelectorAll('.ddjj-ret-quitar').forEach(b =>
        b.addEventListener('click', () => quitarTxtRetencion(b.getAttribute('data-ret'), Number(b.getAttribute('data-idx')))));
}

/** Devuelve los .txt asignados cuyo CUIT (en el nombre) NO es el del cliente actual. */
function retencionesDeOtroCuit() {
    const cuitCli = String((clienteParaRuta() || {}).cuit || '').replace(/\D/g, '');
    if (!cuitCli) return [];   // sin CUIT de referencia no podemos validar → no bloqueamos
    const ajenos = [];
    for (const rutas of Object.values(retencionesArchivos)) {
        for (const ruta of rutas) {
            const nombre = ruta.split(/[\\/]/).pop();
            const cuitArch = (nombre.match(/(\d{11})/) || [])[1] || null;
            if (cuitArch && cuitArch !== cuitCli) ajenos.push({ nombre, cuit: cuitArch });
        }
    }
    return ajenos;
}

/** Elegir una carpeta DISTINTA con los .txt (cuando no están en la del cliente). */
async function elegirCarpetaRetenciones() {
    try {
        const r = await window.electronAPI.declaracionJurada.elegirCarpetaRetenciones({ cliente: clienteParaRuta() });
        if (!r || r.canceled) return;
        if (!r.success) { setEstado('error', `❌ ${r.message || 'No se pudo elegir la carpeta'}`); return; }
        carpetaRetenciones = r.carpeta;
        pintarCarpetaRetenciones();
        // Re-escanear ya con la carpeta nueva (rescan limpio, como el botón Auto-detectar).
        autodetectarRetenciones(false);
    } catch (err) {
        console.error('❌ Error eligiendo carpeta:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    }
}

function pintarCarpetaRetenciones() {
    const info = document.getElementById('ddjj-carpeta-ret-info');
    if (!info) return;
    if (carpetaRetenciones) {
        info.textContent = `📁 Carpeta elegida: ${carpetaRetenciones}`;
        info.style.display = '';
    } else {
        info.textContent = '';
        info.style.display = 'none';
    }
}

/** Escanea la carpeta del cliente (o la elegida a mano) y pre-asigna los .txt del período. */
async function autodetectarRetenciones(auto = false) {
    if (!clienteSeleccionado) return;
    const periodo = ((document.getElementById('ddjj-periodo') || {}).value || '').trim();
    if (!/^\d{6}$/.test(periodo)) {
        if (!auto) setEstado('error', '❌ Completá el período (mes y año) para auto-detectar.');
        return;
    }
    try {
        const r = await window.electronAPI.declaracionJurada.sugerirRetenciones({
            cliente: clienteParaRuta(), periodo, carpeta: carpetaRetenciones || undefined
        });
        if (!r || !r.success) {
            if (!auto) setEstado('error', `❌ ${r?.message || 'No se pudo auto-detectar'}`);
            return;
        }
        const sug = r.sugerencias || {};
        // Auto-detect MANUAL (el usuario apretó el botón) = rescan limpio: borrar lo anterior
        // y quedar solo con lo detectado de este período. El silencioso (auto) no borra adrede.
        if (!auto) retencionesArchivos = {};
        for (const [etiqueta, rutas] of Object.entries(sug)) retencionesArchivos[etiqueta] = [...rutas];
        TIPOS_RETENCION.forEach(pintarRetencion);

        // ALARMA: la carpeta tiene .txt del período pero de OTRO cliente (CUIT distinto).
        const ajenos = r.ajenos || [];
        if (ajenos.length) {
            const cuits = [...new Set(ajenos.map(a => a.cuit))].join(', ');
            setEstado('error', `🚨 ¡Ojo! La carpeta tiene ${ajenos.length} archivo(s) de OTRO CUIT (${cuits}), distinto al del cliente. No los asigné. Revisá que sea la carpeta correcta.`);
            return;   // no pisar la alarma con el mensaje de éxito
        }

        const total = Object.values(sug).reduce((a, b) => a + b.length, 0);
        if (total) {
            let msg = `✨ Auto-detectados ${total} archivo(s) para ${periodo}.`;
            if (r.sinMapear && r.sinMapear.length) msg += ` ⚠️ ${r.sinMapear.length} sin mapear (revisalos a mano).`;
            setEstado('ok', msg);
        } else if (!auto) {
            setEstado('error', `No encontré .txt de ${periodo} en ${carpetaRetenciones ? 'la carpeta elegida' : 'la carpeta del cliente'}.`);
        }
    } catch (err) {
        console.error('❌ Error auto-detectando:', err);
        if (!auto) setEstado('error', `❌ ${err?.message || err}`);
    }
}

function montarSelectorUsuarios() {
    selectorUsuariosDDJJ = new SelectorUsuarios('ddjj-selector-usuarios', {
        mostrarTablaSeleccionados: false,

        // Modelo plano: el backend ya computó puedeOperar para 'afip' (acceso
        // propio o por representante). El representado aparece como fila propia.
        fuente: 'contribuyentes',
        servicio: 'afip',
        // Un cliente por vez: elegibles los de clave sin validar (usarlo la valida)
        // (filtro de habilitados + botón "Clave"; ver actualizarClave.js)
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selectorUsuariosDDJJ) : {}),

        onCambioSeleccion: (seleccionados) => {
            if (!seleccionados || seleccionados.length === 0) {
                clienteSeleccionado = null;
                ocultarConfig();
                return;
            }
            const usuario = seleccionados[seleccionados.length - 1];
            if (seleccionados.length > 1) {
                selectorUsuariosDDJJ.usuariosSeleccionados = [usuario];
                if (selectorUsuariosDDJJ.actualizarVista) selectorUsuariosDDJJ.actualizarVista();
            }
            clienteSeleccionado = usuario;
            mostrarConfig(usuario);
        }
    });
}

// ---------- Config (CUIT / Organismo / Formulario / Período) ----------

function mostrarConfig(usuario) {
    const config = document.getElementById('ddjj-config');
    if (config) config.style.display = 'block';
    // Un cliente por vez: elegido el cliente, el foco pasa a lo siguiente a completar (el período).
    if (config) config.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const periodo = document.getElementById('ddjj-periodo');
    if (periodo && periodo._flatpickr) periodo._flatpickr.altInput.focus({ preventScroll: true });
    poblarEmpresas(usuario);
    actualizarBotonCargar();
    // Cambió el cliente → arrancar de cero: borrar los .txt del cliente anterior (si no, se
    // quedaban "pegados") antes de auto-sugerir los de este.
    retencionesArchivos = {};
    TIPOS_RETENCION.forEach(pintarRetencion);
    // Auto-sugerir las retenciones del período (silencioso si no encuentra nada).
    autodetectarRetenciones(true);
}

function ocultarConfig() {
    const config = document.getElementById('ddjj-config');
    if (config) config.style.display = 'none';
    actualizarBotonCargar();
}

/**
 * Empresa objetivo a declarar. Modelo plano: el contribuyente ES la empresa, así
 * que hay UNA sola opción = su razón social (cada representado es su propia fila
 * en el selector, no una empresa anidada). El backend matchea la opción del
 * portal por razón social o por CUIT indistintamente.
 */
function obtenerEmpresasObjetivo(usuario) {
    const razon = (usuario.razonSocial || usuario.nombre || '').trim();
    if (razon) return [{ value: razon, label: razon }];

    // Fallback: solo el CUIT titular (sin razón social cargada).
    const cuit = usuario.cuit || usuario.cuil;
    return cuit ? [{ value: String(cuit), label: `${cuit} (titular)` }] : [];
}

function poblarEmpresas(usuario) {
    const sel = document.getElementById('ddjj-empresa');
    if (!sel) return;
    const opciones = obtenerEmpresasObjetivo(usuario);
    sel.innerHTML = '';
    if (opciones.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'Sin empresas (form directo)';
        sel.appendChild(o);
        return;
    }
    opciones.forEach((op, i) => {
        const o = document.createElement('option');
        o.value = op.value;
        o.textContent = op.label;
        if (i === 0) o.selected = true;
        sel.appendChild(o);
    });
}

// Cargar y Buscar abren AFIP los dos: mientras corre uno, el otro queda bloqueado.
function actualizarBotonCargar() {
    const habilitado = !enCurso && !!clienteSeleccionado;
    if (lanzadorCarga) lanzadorCarga.habilitar(habilitado);
    if (lanzadorBuscar) lanzadorBuscar.habilitar(habilitado);
}

function esGrabar() {
    const chk = document.getElementById('ddjj-grabar');
    return chk ? chk.checked : false;
}

function esReemplazar() {
    const chk = document.getElementById('ddjj-reemplazar-borrador');
    return esGrabar() && !!(chk && chk.checked);
}

function actualizarOpcionesCorrida() {
    const chk = document.getElementById('ddjj-reemplazar-borrador');
    if (chk) {
        chk.disabled = !esGrabar();
        if (chk.disabled) chk.checked = false;
    }
    actualizarLabelBoton();
}

function actualizarLabelBoton() {
    if (!lanzadorCarga) return;
    const texto = esReemplazar() ? 'Borrar, cargar y grabar'
        : esGrabar() ? 'Cargar y grabar borrador' : 'Simular carga';
    lanzadorCarga.cambiar(0, { texto });
}

// ---------- Lanzadores (componentes/lanzadorAutomatizacion) ----------
// Con el switch "Mostrar navegador" como todos: visible, el navegador queda abierto al
// terminar para seguir a mano; oculto, se cierra solo.

function crearLanzadores() {
    lanzadorCarga = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorDdjj'), {
        acciones: [{
            texto: 'Simular carga',
            preparar: prepararCarga,
            confirmar: confirmarCarga,
            // Si graba, lo que ya llegó a AFIP queda: se pregunta antes de cortar.
            confirmarCancelar: () => corridaGraba ? {
                title: 'Cancelar la carga',
                message: 'Si ya llegó a grabar, el borrador queda en AFIP (cancelar no lo deshace). Revisalo después con "Buscar borrador existente".\n\n¿Cancelar igual?'
            } : null,
            ejecutar: ejecutarCarga
        }],
        auxiliares: [{
            texto: 'Limpiar formulario',
            ayuda: 'Vuelve el paso 3 a como recién entrado (el cliente queda elegido)',
            alHacer: limpiarFormulario
        }, {
            texto: 'Descartar',
            ayuda: 'Saca el resultado de la pantalla',
            mostrar: hayResultadoALaVista,
            alHacer: descartarResultado
        }]
    });
    lanzadorBuscar = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorDdjjBuscar'), {
        acciones: [{
            texto: 'Buscar borrador existente',
            tipo: 'secundario',
            preparar: prepararBuscar,
            ejecutar: ejecutarBuscar
        }]
    });
    actualizarLabelBoton();
    actualizarBotonCargar();
}

// ---------- Disparo del flujo ----------

// Valida y arma la carga (null = no arranca). El modal lo pone el lanzador con confirmarCarga.
function prepararCarga() {
    if (!clienteSeleccionado) return null;

    const empresaObjetivo = (document.getElementById('ddjj-empresa') || {}).value || '';
    const organismo = (document.getElementById('ddjj-organismo') || {}).value || '';
    const formulario = (document.getElementById('ddjj-formulario') || {}).value || '';
    const periodo = ((document.getElementById('ddjj-periodo') || {}).value || '').trim();

    // Período y fecha de pago (requeridos): si faltan, el aviso sale debajo de cada calendario.
    const calPeriodo = (document.getElementById('ddjj-periodo') || {})._flatpickr;
    const calFechaPago = (document.getElementById('ddjj-fecha-pago') || {})._flatpickr;
    const periodoOk = calPeriodo ? calPeriodo.validar() : /^\d{6}$/.test(periodo);
    const fechaPagoOk = calFechaPago ? calFechaPago.validar() : true;
    if (!periodoOk || !fechaPagoOk) {
        setEstado('error', '❌ Revisá los campos marcados en rojo.');
        return null;
    }

    // Fecha de pago: el calendario da ISO (AAAA-MM-DD); AFIP la quiere DD/MM/AAAA.
    const fechaPagoISO = (document.getElementById('ddjj-fecha-pago') || {}).value || '';
    // No se puede pagar con fecha anterior a hoy (por si tipearon una fecha vieja a mano).
    const hoyISO = new Date().toLocaleDateString('en-CA');
    if (fechaPagoISO < hoyISO) {
        if (calFechaPago) calFechaPago.mostrarError('La fecha de pago no puede ser anterior a hoy.');
        setEstado('error', '❌ Revisá los campos marcados en rojo.');
        return null;
    }
    const fechaPago = isoADDMMAAAA(fechaPagoISO);   // 2026-04-15 → 15/04/2026

    // Red de seguridad: ningún .txt asignado puede ser de OTRO cliente (CUIT en el nombre).
    // Cubre tanto el auto-detect por carpeta como los agregados a mano. Si hay uno ajeno, NO avanza.
    const ajenos = retencionesDeOtroCuit();
    if (ajenos.length) {
        setEstado('error', `🚨 No puedo avanzar: hay ${ajenos.length} archivo(s) de retención de OTRO CUIT (${ajenos.map(a => a.nombre).join(', ')}). Quitalos o elegí la carpeta del cliente correcto.`);
        return null;
    }

    const cliente = {
        id: clienteSeleccionado.id,
        nombre: [clienteSeleccionado.nombre, clienteSeleccionado.apellido].filter(Boolean).join(' ').trim(),
        cuitLogin: clienteSeleccionado.cuit || clienteSeleccionado.cuil || ''
    };

    const grabar = esGrabar();
    const reemplazarBorrador = esReemplazar();
    const hoja = (document.getElementById('ddjj-hoja') || {}).value || '';
    const cantidadTxt = Object.values(retencionesArchivos).reduce((n, v) => n + (Array.isArray(v) ? v.length : (v ? 1 : 0)), 0);
    const mesAnio = `${periodo.slice(4)}/${periodo.slice(0, 4)}`;

    return {
        cliente, empresaObjetivo, organismo, formulario, periodo, fechaPago, grabar, reemplazarBorrador,
        hoja, cantidadTxt, mesAnio
    };
}

// Confirmación antes de lanzar (igual que los lotes): qué se va a hacer y si persiste.
function confirmarCarga({ cliente, empresaObjetivo, mesAnio, fechaPago, hoja, cantidadTxt, grabar, reemplazarBorrador }) {
    return {
        title: 'Declaración Jurada',
        message: `Cliente: ${cliente.nombre}\nEmpresa: ${empresaObjetivo || '—'}\nPeríodo: ${mesAnio} · Pago: ${fechaPago}`
            + `\nExcel: ${archivoExcel ? `${archivoExcel.split(/[\\/]/).pop()} (${hoja})` : 'sin Excel'}`
            + `\nRetenciones: ${cantidadTxt} archivo(s) .txt`
            + `\n\n${grabar ? '💾 Se GRABA el borrador en AFIP (persiste).' : '🧪 Simulación: carga todo pero no graba.'}`
            + (reemplazarBorrador ? `\n\n🗑️ ATENCIÓN: si ya hay un borrador de ${mesAnio}, se BORRA en AFIP y se carga de nuevo.` : ''),
        confirmBtnClass: reemplazarBorrador ? 'danger' : 'tono'
    };
}

async function ejecutarCarga({ cliente, empresaObjetivo, organismo, formulario, periodo, fechaPago, grabar, reemplazarBorrador }, { visible }) {
    setEstado('cargando', `⏳ ${grabar ? 'Cargar y GRABAR' : 'Simular carga (sin grabar)'}: login → Nuevo → cargar... (el captcha puede requerir tu intervención)`);
    ocultarResultado();
    enCurso = true;
    corridaGraba = grabar;
    actualizarBotonCargar();
    if (window.ruedaTrabajando) window.ruedaTrabajando.mostrar({
        servicio: 'ARCA', subservicio: 'Declaración Jurada', mensaje: 'Iniciando sesión en AFIP…'
    });

    try {
        const hojaExcel = (document.getElementById('ddjj-hoja') || {}).value || '';

        const r = await window.electronAPI.declaracionJurada.cargar({
            cliente, empresaObjetivo, organismo, formulario, periodo,
            retenciones: { ...retencionesArchivos },
            archivo: archivoExcel || null,   // Excel de liquidación (base/alícuota)
            hoja: hojaExcel || null,
            fechaPago,                        // DD/MM/AAAA → solapa Liquidación
            grabar,
            reemplazarBorrador,              // borrar el borrador existente y cargar de nuevo
            visible                          // switch "Mostrar navegador"
        });

        if (r && r.error === 'CANCELADO') {
            setEstado('cancelado', `⏹ Cancelado por el usuario.${grabar ? ' Si llegó a grabar, el borrador quedó en AFIP: revisalo con "Buscar borrador existente".' : ''}`);
            return;
        }
        if (!r || r.success === false) {
            setEstado('error', `❌ ${r?.message || 'Error desconocido'}`);
            return;
        }

        const st = r.aceptar && r.aceptar.status;
        const reemplazo = r.reemplazo;   // solo viene si se intentó borrar el borrador anterior
        let simulacionOk = false;
        if (reemplazo && !reemplazo.borrado) {
            setEstado('error', `⚠️ Había un BORRADOR y no se pudo borrar: ${reemplazo.motivo}. Revisalo con "Buscar borrador existente".`);
        } else if (st === 'borrador-existente') {
            setEstado('error', '⚠️ Ya existe un BORRADOR para ese período. Recuperalo con "Buscar borrador existente" o tildá "borrarlo y cargar de nuevo".');
        } else if (st === 'ya-presentado') {
            setEstado('error', '⚠️ Ese período ya está PRESENTADO en AFIP: para cambiarlo hay que hacer una rectificativa.');
        } else if (st === 'error') {
            setEstado('error', `❌ El portal rechazó el Aceptar: ${r.aceptar.mensaje || ''}`);
        } else if (r.grabar && r.grabar.grabado) {
            setEstado('ok', `✅ ${reemplazo ? 'Borrador anterior borrado. ' : ''}DDJJ cargada y GRABADA (borrador persistido). ${r.url || ''}`);
        } else {
            setEstado('ok', `🧪 ${reemplazo ? 'Borrador anterior borrado. ' : ''}DDJJ simulada (cargada, sin grabar — no persiste). ${r.url || ''}`);
            simulacionOk = true;
        }
        // Guardar lo necesario para escribir los totales de AFIP al Excel (botón en la caja).
        ultimaCarga = {
            archivo: archivoExcel || null,
            hoja: hojaExcel || null,
            periodo,
            deducciones: r.deducciones || null,
            retenciones: { ...retencionesArchivos }
        };
        mostrarResultado(r.resumen || JSON.stringify(r, null, 2));
        mostrarDeducciones(r.deducciones);
        if (simulacionOk && visible) mostrarPopupNavegador('Simulación terminada');

    } catch (err) {
        console.error('❌ Error en cargar DDJJ:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    } finally {
        if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
        enCurso = false;
        corridaGraba = false;
        actualizarBotonCargar();
    }
}

// ---------- Buscar borrador existente (recuperar) ----------

function prepararBuscar() {
    if (!clienteSeleccionado) return null;
    const empresaObjetivo = (document.getElementById('ddjj-empresa') || {}).value || '';
    const organismo = (document.getElementById('ddjj-organismo') || {}).value || '';
    const formulario = (document.getElementById('ddjj-formulario') || {}).value || '';
    const periodo = ((document.getElementById('ddjj-periodo') || {}).value || '').trim();

    const cliente = {
        id: clienteSeleccionado.id,
        nombre: [clienteSeleccionado.nombre, clienteSeleccionado.apellido].filter(Boolean).join(' ').trim(),
        cuitLogin: clienteSeleccionado.cuit || clienteSeleccionado.cuil || ''
    };

    const accion = (document.getElementById('ddjj-accion') || {}).value || 'editar';
    return { cliente, empresaObjetivo, organismo, formulario, periodo, accion };
}

async function ejecutarBuscar({ cliente, empresaObjetivo, organismo, formulario, periodo, accion }, { visible }) {
    setEstado('cargando', '⏳ Login → "Mis Aplicaciones Web" → Buscar borradores...');
    ocultarResultado();
    enCurso = true;
    actualizarBotonCargar();
    if (window.ruedaTrabajando) window.ruedaTrabajando.mostrar({
        servicio: 'ARCA', subservicio: 'Declaración Jurada · Buscar', mensaje: 'Iniciando sesión en AFIP…'
    });
    try {
        const r = await window.electronAPI.declaracionJurada.buscar({ cliente, empresaObjetivo, organismo, formulario, periodo, accion, visible });
        if (r && r.error === 'CANCELADO') {
            setEstado('cancelado', '⏹ Cancelado por el usuario.');
            return;
        }
        if (!r || r.success === false) {
            setEstado('error', `❌ ${r?.message || 'Error desconocido'}`);
            return;
        }
        const n = (r.resultados || []).length;
        if (n === 0) setEstado('error', `No encontré borradores para ${periodo || 'esos filtros'}.`);
        else if (n === 1 && r.accion && r.accion.ok) setEstado('ok', `✅ 1 resultado → "${accion}" aplicado (abierto en el navegador).`);
        else setEstado('ok', `✅ ${n} resultado(s). ${n > 1 ? 'Elegí de la lista (refiná filtros para auto-aplicar).' : ''}`);
        mostrarResultado(r.resumen || JSON.stringify(r, null, 2));
        // "Editar" recupera el borrador y deja el navegador abierto en el form → avisar al usuario.
        if (accion === 'editar' && n >= 1 && visible) mostrarPopupNavegador('Borrador abierto para editar');
    } catch (err) {
        console.error('❌ Error en buscar borrador:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    } finally {
        if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
        enCurso = false;
        actualizarBotonCargar();
    }
}

// ---------- Helpers ----------

/** "2026-04-15" (ISO del input date) → "15/04/2026" (lo que pide AFIP). */
function isoADDMMAAAA(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// ---------- Período (mes + año → AAAAMM oculto) ----------

function montarPeriodo() {
    const input = document.getElementById('ddjj-periodo');
    if (!input) return;
    const fp = crearCalendario(input, {
        modo: 'periodo', formato: 'Ym', ver: 'm/Y',
        inicial: input.value || periodoMesAnterior(),
        obligatorio: true,
        onChange: () => previsualizarHoja()
    });
    previsualizarHoja();
    if (!fp) return;

    // ↑ ↓ en el campo: mes siguiente / anterior (bajar de 1 pasa a 12 del año anterior).
    fp.altInput.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        moverMes(fp, e.key === 'ArrowUp' ? 1 : -1);
    });
}

function moverMes(fp, paso) {
    const actual = fp.selectedDates[0] || new Date();
    fp.setDate(new Date(actual.getFullYear(), actual.getMonth() + paso, 1), true);
}

function periodoMesAnterior() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}${mm}`;
}

/** Modal de aviso: la automatización terminó y el navegador queda a disposición (tiempo AFIP limitado). */
function mostrarPopupNavegador(titulo) {
    const prev = document.getElementById('ddjj-modal-overlay');
    if (prev) prev.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ddjj-modal-overlay';
    overlay.className = 'ddjj-modal-overlay modal-global'; // cuelga del body: el tema de la vista no le llega
    overlay.innerHTML = `
        <div class="ddjj-modal" role="dialog" aria-modal="true">
            <div class="ddjj-modal-icono">🌐</div>
            <h3 class="ddjj-modal-titulo">${titulo || 'El navegador quedó a tu disposición'}</h3>
            <p class="ddjj-modal-texto">
                La automatización terminó. El navegador de AFIP quedó <strong>abierto</strong> para que
                revises o completes a mano lo que haga falta.
            </p>
            <p class="ddjj-modal-texto ddjj-modal-warn">
                ⏱️ La sesión de AFIP dura un <strong>tiempo limitado</strong>: si la dejás inactiva
                mucho rato, vas a tener que volver a iniciar sesión.
            </p>
            <button type="button" class="ui-btn ui-btn--accion ddjj-modal-cerrar">Entendido</button>
        </div>`;
    document.body.appendChild(overlay);
    const cerrar = () => overlay.remove();
    overlay.querySelector('.ddjj-modal-cerrar').addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
}

function setEstado(clase, texto) {
    const el = document.getElementById('ddjj-estado');
    if (!el) return;
    el.className = `ddjj-estado ${clase}`;
    el.textContent = texto;
    el.style.display = 'block';
    // Que se vea: el cartel aparece abajo y sin esto nadie se entera (hay que scrollear).
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('ddjj-estado-resaltado');
    void el.offsetWidth;   // reinicia la animación si ya estaba
    el.classList.add('ddjj-estado-resaltado');
    if (lanzadorCarga) lanzadorCarga.refrescar();   // Descartar aparece
}

// El detalle técnico ya no se muestra en pantalla (caja negra oculta, pedido del usuario):
// queda en la consola y en el log del día del backend.
function mostrarResultado(texto) {
    console.log('[DDJJ] Resultado:\n' + texto);
}

function ocultarResultado() {
    const ded = document.getElementById('ddjj-deducciones');
    if (ded) ded.style.display = 'none';
}

// ---------- Auxiliares del lanzador: Descartar y Limpiar ----------

function hayResultadoALaVista() {
    return ['ddjj-estado', 'ddjj-deducciones'].some(id => {
        const el = document.getElementById(id);
        return el && el.style.display !== 'none';
    });
}

// Descartar: saca el cartel de estado y los totales de AFIP (el formulario queda como está).
function descartarResultado() {
    const estado = document.getElementById('ddjj-estado');
    if (estado) estado.style.display = 'none';
    ocultarResultado();
    ultimaCarga = null;
    if (lanzadorCarga) lanzadorCarga.refrescar();
}

// Limpiar: el paso 3 vuelve a como recién entrado. El cliente, la empresa y el paso 1
// quedan; el período vuelve al mes anterior y la fecha de pago a hoy.
async function limpiarFormulario() {
    const ok = await showConfirmModal({
        title: 'Limpiar formulario',
        icon: '🧹',
        message: 'Se borran el Excel, los .txt de retenciones y las opciones (Grabar / Reemplazar); el período vuelve al mes anterior y la fecha de pago a hoy. El cliente queda elegido.\n\n¿Desea continuar?',
        confirmText: 'Limpiar',
        confirmBtnClass: 'tono'
    });
    if (!ok) return;

    archivoExcel = null;
    const lblNombre = document.getElementById('ddjj-excel-nombre');
    if (lblNombre) lblNombre.textContent = 'Ningún archivo elegido';
    const selHoja = document.getElementById('ddjj-hoja');
    if (selHoja) selHoja.innerHTML = '';
    const wrap = document.getElementById('ddjj-hoja-wrap');
    if (wrap) wrap.style.display = 'none';
    const preview = document.getElementById('ddjj-preview');
    if (preview) preview.style.display = 'none';

    retencionesArchivos = {};
    carpetaRetenciones = null;
    TIPOS_RETENCION.forEach(pintarRetencion);
    pintarCarpetaRetenciones();

    const periodo = document.getElementById('ddjj-periodo');
    if (periodo && periodo._flatpickr) periodo._flatpickr.setDate(periodoMesAnterior(), false);
    const fechaPago = document.getElementById('ddjj-fecha-pago');
    if (fechaPago && fechaPago._flatpickr) fechaPago._flatpickr.setDate(new Date(), false);

    ['ddjj-grabar', 'ddjj-reemplazar-borrador'].forEach(id => {
        const chk = document.getElementById(id);
        if (chk) chk.checked = false;
    });
    actualizarOpcionesCorrida();
    descartarResultado();

    // A empezar de nuevo: arriba del formulario, con el foco en el período.
    const config = document.getElementById('ddjj-config');
    if (config) config.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (periodo && periodo._flatpickr) periodo._flatpickr.altInput.focus({ preventScroll: true });
}

/** Muestra los importes que AFIP calculó por deducción (Total de Deducciones destacado). */
function mostrarDeducciones(deducciones) {
    const cont = document.getElementById('ddjj-deducciones');
    if (!cont) return;
    if (!deducciones || !Object.keys(deducciones).length) {
        cont.style.display = 'none';
        return;
    }
    const fmt = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const entradas = Object.entries(deducciones);
    // El Total se muestra SIEMPRE (aunque dé 0); las demás filas en 0 son ruido → se ocultan.
    const totalEntry = entradas.find(([et]) => /total/i.test(et));
    const filasConImporte = entradas.filter(([et, v]) => !/total/i.test(et) && Number(v || 0) !== 0);

    const filas = filasConImporte.map(([etiqueta, valor]) =>
        `<div class="ddjj-ded-fila"><span>${etiqueta}</span><span>$ ${fmt(valor)}</span></div>`
    ).join('');
    const filaTotal = totalEntry
        ? `<div class="ddjj-ded-fila ddjj-ded-total"><span>${totalEntry[0]}</span><span>$ ${fmt(totalEntry[1])}</span></div>`
        : '';
    // Sin ninguna retención/percepción con importe: el Total puede igual ser ≠ 0 (saldo a favor
    // del período anterior), así que el aviso no puede decir "Total = 0" a ciegas.
    const totalConImporte = totalEntry && Number(totalEntry[1] || 0) !== 0;
    const aviso = filasConImporte.length
        ? 'Estos números los calculó AFIP a partir de los .txt importados (fuente de verdad).'
        : totalConImporte
            ? '⚠️ Ninguna retención ni percepción con importe: el Total sale del saldo a favor del período anterior (u otro concepto que no viene de los .txt).'
            : '⚠️ Ninguna retención ni percepción con importe (Total = 0).';

    // Botón para volcar estos totales al Excel (solo si la carga usó un Excel).
    const hayExcel = ultimaCarga && ultimaCarga.archivo;
    const btnExcel = hayExcel
        ? `<button type="button" id="ddjj-btn-escribir-excel" class="ui-btn ui-btn--ghost">📝 Escribir Excel con estos datos</button>`
        : '';

    cont.innerHTML = `
        <div class="ddjj-ded-head">🧮 Totales calculados por AFIP</div>
        ${filas}
        ${filaTotal}
        <p class="ddjj-hint">${aviso}</p>
        ${btnExcel}`;
    cont.style.display = 'block';
    if (lanzadorCarga) lanzadorCarga.refrescar();
    const b = document.getElementById('ddjj-btn-escribir-excel');
    if (b) b.addEventListener('click', () => escribirExcelConDeducciones(b));
    cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Escribe los totales que AFIP calculó en el mismo Excel que leímos (paso 2, opción del usuario). */
async function escribirExcelConDeducciones(btn) {
    if (!ultimaCarga || !ultimaCarga.archivo) {
        setEstado('error', '❌ No hay Excel asociado a esta carga.');
        return;
    }
    if (btn) btn.disabled = true;
    setEstado('cargando', '⏳ Escribiendo los totales de AFIP en el Excel…');
    try {
        const r = await window.electronAPI.declaracionJurada.escribirDeducciones(ultimaCarga);
        if (!r || !r.success) {
            setEstado('error', `❌ ${r?.message || 'No se pudo escribir el Excel'}`);
            return;
        }
        const nEsc = (r.escritos || []).length;
        const nOmit = (r.omitidos || []).length;
        if (nEsc) {
            let msg = `✅ Escribí ${nEsc} total(es) en el Excel (${r.formato}).`;
            if (nOmit) msg += ` ⚠️ ${nOmit} omitido(s) — mirá el detalle abajo.`;
            if (r.backup) msg += ` Backup: ${r.backup.split(/[\\/]/).pop()}`;
            setEstado('ok', msg);
        } else {
            setEstado('error', `⚠️ No escribí nada. ${nOmit ? 'Revisá el detalle abajo.' : ''}`);
        }
        if (r.resumen) mostrarResultado(r.resumen);
    } catch (err) {
        console.error('❌ Error escribiendo Excel:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    } finally {
        if (btn) btn.disabled = false;
    }
}
