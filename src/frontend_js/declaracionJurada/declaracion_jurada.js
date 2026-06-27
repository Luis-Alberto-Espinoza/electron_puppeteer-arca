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

window.inicializarDeclaracionJurada = inicializarDeclaracionJurada;

function inicializarDeclaracionJurada() {
    console.log('🟢 Inicializando Declaración Jurada (modo prueba)...');

    if (typeof SelectorUsuarios === 'undefined') {
        console.warn('SelectorUsuarios aún no disponible — reintentando...');
        setTimeout(inicializarDeclaracionJurada, 100);
        return;
    }

    clienteSeleccionado = null;
    archivoExcel = null;
    retencionesArchivos = {};
    carpetaRetenciones = null;
    montarRetenciones();
    pintarCarpetaRetenciones();

    const btnCargar = document.getElementById('ddjj-btn-cargar');
    const btnVolver = document.getElementById('ddjj-btn-volver');

    if (btnVolver) {
        btnVolver.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('volverHomeAfip'));
        });
    }
    if (btnCargar) {
        btnCargar.addEventListener('click', () => cargarDDJJ(btnCargar));
    }

    const btnBuscar = document.getElementById('ddjj-btn-buscar');
    if (btnBuscar) btnBuscar.addEventListener('click', () => buscarBorrador(btnBuscar));

    const chkGrabar = document.getElementById('ddjj-grabar');
    if (chkGrabar) {
        chkGrabar.addEventListener('change', actualizarLabelBoton);
    }
    actualizarLabelBoton();

    // Default del período: mes anterior (lo que se suele declarar).
    const inputPeriodo = document.getElementById('ddjj-periodo');
    if (inputPeriodo && !inputPeriodo.value) inputPeriodo.value = periodoMesAnterior();
    if (inputPeriodo) inputPeriodo.addEventListener('input', previsualizarHoja);

    // Fecha de pago: por defecto HOY y no se puede elegir una fecha anterior (min = hoy).
    const inputFechaPago = document.getElementById('ddjj-fecha-pago');
    if (inputFechaPago) {
        const hoyISO = new Date().toLocaleDateString('en-CA');   // AAAA-MM-DD en hora local
        inputFechaPago.min = hoyISO;
        if (!inputFechaPago.value) inputFechaPago.value = hoyISO;
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

    const btnToggleLog = document.getElementById('ddjj-resultado-toggle');
    if (btnToggleLog) btnToggleLog.addEventListener('click', toggleLog);

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
        cont.innerHTML = '<span class="ddjj-prev-warn">Completá un período válido (AAAAMM) para ver los datos.</span>';
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
            <button type="button" class="ddjj-btn-sec ddjj-ret-elegir" data-ret="${etiqueta}">📂 Agregar .txt…</button>
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
        if (!auto) setEstado('error', '❌ Completá el período (AAAAMM) para auto-detectar.');
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

function actualizarBotonCargar() {
    const btn = document.getElementById('ddjj-btn-cargar');
    if (btn) btn.disabled = !clienteSeleccionado;
    const btnB = document.getElementById('ddjj-btn-buscar');
    if (btnB) btnB.disabled = !clienteSeleccionado;
}

function esGrabar() {
    const chk = document.getElementById('ddjj-grabar');
    return chk ? chk.checked : false;
}

function actualizarLabelBoton() {
    const btn = document.getElementById('ddjj-btn-cargar');
    if (btn) btn.textContent = esGrabar() ? '✅ Cargar y GRABAR (persiste)' : '🧪 Simular carga (sin grabar)';
}

// ---------- Disparo del flujo ----------

async function cargarDDJJ(btnCargar) {
    if (!clienteSeleccionado) return;

    const empresaObjetivo = (document.getElementById('ddjj-empresa') || {}).value || '';
    const organismo = (document.getElementById('ddjj-organismo') || {}).value || '';
    const formulario = (document.getElementById('ddjj-formulario') || {}).value || '';
    const periodo = ((document.getElementById('ddjj-periodo') || {}).value || '').trim();

    if (!/^\d{6}$/.test(periodo)) {
        setEstado('error', '❌ Período inválido. Usá el formato AAAAMM (ej. 202605).');
        return;
    }

    // Fecha de pago (requerida): el <input type=date> da ISO (AAAA-MM-DD); AFIP la quiere DD/MM/AAAA.
    const fechaPagoISO = (document.getElementById('ddjj-fecha-pago') || {}).value || '';
    if (!fechaPagoISO) {
        setEstado('error', '❌ La fecha de pago es requerida (elegila en el calendario).');
        return;
    }
    // No se puede pagar con fecha anterior a hoy (por si tipearon una fecha vieja a mano).
    const hoyISO = new Date().toLocaleDateString('en-CA');
    if (fechaPagoISO < hoyISO) {
        setEstado('error', '❌ La fecha de pago no puede ser anterior a hoy.');
        return;
    }
    const fechaPago = isoADDMMAAAA(fechaPagoISO);   // 2026-04-15 → 15/04/2026

    // Red de seguridad: ningún .txt asignado puede ser de OTRO cliente (CUIT en el nombre).
    // Cubre tanto el auto-detect por carpeta como los agregados a mano. Si hay uno ajeno, NO avanza.
    const ajenos = retencionesDeOtroCuit();
    if (ajenos.length) {
        setEstado('error', `🚨 No puedo avanzar: hay ${ajenos.length} archivo(s) de retención de OTRO CUIT (${ajenos.map(a => a.nombre).join(', ')}). Quitalos o elegí la carpeta del cliente correcto.`);
        return;
    }

    const cliente = {
        id: clienteSeleccionado.id,
        nombre: [clienteSeleccionado.nombre, clienteSeleccionado.apellido].filter(Boolean).join(' ').trim(),
        cuitLogin: clienteSeleccionado.cuit || clienteSeleccionado.cuil || ''
    };

    const grabar = esGrabar();
    setEstado('cargando', `⏳ ${grabar ? 'Cargar y GRABAR' : 'Simular carga (sin grabar)'}: login → Nuevo → cargar... (el captcha puede requerir tu intervención)`);
    ocultarResultado();
    if (btnCargar) btnCargar.disabled = true;

    try {
        const hojaExcel = (document.getElementById('ddjj-hoja') || {}).value || '';

        const r = await window.electronAPI.declaracionJurada.cargar({
            cliente, empresaObjetivo, organismo, formulario, periodo,
            retenciones: { ...retencionesArchivos },
            archivo: archivoExcel || null,   // Excel de liquidación (base/alícuota)
            hoja: hojaExcel || null,
            fechaPago,                        // DD/MM/AAAA → solapa Liquidación
            grabar
        });

        if (!r || r.success === false) {
            setEstado('error', `❌ ${r?.message || 'Error desconocido'}`);
            return;
        }

        const st = r.aceptar && r.aceptar.status;
        let simulacionOk = false;
        if (st === 'borrador-existente') {
            setEstado('error', '⚠️ Ya existe un BORRADOR para ese período. Recuperalo con "🔎 Buscar borrador".');
        } else if (st === 'error') {
            setEstado('error', `❌ El portal rechazó el Aceptar: ${r.aceptar.mensaje || ''}`);
        } else if (r.grabar && r.grabar.grabado) {
            setEstado('ok', `✅ DDJJ cargada y GRABADA (borrador persistido). ${r.url || ''}`);
        } else {
            setEstado('ok', `🧪 DDJJ simulada (cargada, sin grabar — no persiste). ${r.url || ''}`);
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
        if (simulacionOk) mostrarPopupNavegador('Simulación terminada');

    } catch (err) {
        console.error('❌ Error en cargar DDJJ:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    } finally {
        actualizarBotonCargar();
    }
}

// ---------- Buscar borrador existente (recuperar) ----------

async function buscarBorrador(btn) {
    if (!clienteSeleccionado) return;
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

    setEstado('cargando', '⏳ Login → "Mis Aplicaciones Web" → Buscar borradores...');
    ocultarResultado();
    if (btn) btn.disabled = true;
    try {
        const r = await window.electronAPI.declaracionJurada.buscar({ cliente, empresaObjetivo, organismo, formulario, periodo, accion });
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
        if (accion === 'editar' && n >= 1) mostrarPopupNavegador('Borrador abierto para editar');
    } catch (err) {
        console.error('❌ Error en buscar borrador:', err);
        setEstado('error', `❌ ${err?.message || err}`);
    } finally {
        actualizarBotonCargar();
    }
}

// ---------- Helpers ----------

/** "2026-04-15" (ISO del input date) → "15/04/2026" (lo que pide AFIP). */
function isoADDMMAAAA(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
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
    overlay.className = 'ddjj-modal-overlay';
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
            <button type="button" class="ddjj-btn-probar ddjj-modal-cerrar">Entendido</button>
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
}

function mostrarResultado(texto) {
    const cont = document.getElementById('ddjj-resultado');
    const pre = document.getElementById('ddjj-resultado-pre');
    if (pre) pre.textContent = texto;
    if (cont) cont.style.display = 'block';
    // Resultado nuevo → arranca MINIMIZADO por defecto (se expande con el botón).
    if (pre) pre.classList.add('colapsado');
    const btn = document.getElementById('ddjj-resultado-toggle');
    if (btn) btn.textContent = '➕ Expandir';
}

function ocultarResultado() {
    const cont = document.getElementById('ddjj-resultado');
    if (cont) cont.style.display = 'none';
    const ded = document.getElementById('ddjj-deducciones');
    if (ded) ded.style.display = 'none';
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
    // Si no hubo ninguna deducción con importe, avisamos que los archivos igual se procesaron.
    const aviso = filasConImporte.length
        ? 'Estos números los calculó AFIP a partir de los .txt importados (fuente de verdad).'
        : '⚠️ Los archivos se procesaron, pero AFIP no arrojó deducciones con importe (Total = 0).';

    // Botón para volcar estos totales al Excel (solo si la carga usó un Excel).
    const hayExcel = ultimaCarga && ultimaCarga.archivo;
    const btnExcel = hayExcel
        ? `<button type="button" id="ddjj-btn-escribir-excel" class="ddjj-btn-sec">📝 Escribir Excel con estos datos</button>`
        : '';

    cont.innerHTML = `
        <div class="ddjj-ded-head">🧮 Totales calculados por AFIP</div>
        ${filas}
        ${filaTotal}
        <p class="ddjj-hint">${aviso}</p>
        ${btnExcel}`;
    cont.style.display = 'block';
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

/** Minimiza/expande la caja del log (a veces no se quiere ver todo). */
function toggleLog() {
    const pre = document.getElementById('ddjj-resultado-pre');
    const btn = document.getElementById('ddjj-resultado-toggle');
    if (!pre) return;
    const colapsado = pre.classList.toggle('colapsado');
    if (btn) btn.textContent = colapsado ? '➕ Expandir' : '➖ Minimizar';
}
