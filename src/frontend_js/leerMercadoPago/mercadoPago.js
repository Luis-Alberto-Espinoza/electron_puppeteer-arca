import { AuthManager, registrarManejadorPdv } from '../autenticacion/auth.js';
import { pdvOfrecibles } from '../facturas/pdvOfrecibles.js';
import { avisar } from '../facturas/facturas.js';

// Todo lo de esta pantalla se busca adentro de su div: Facturar usa las mismas
// clases (.btn-expandir) y no hay que tocar las suyas.
const enVista = (selector) => document.querySelector(`#leerMercadoPagoDiv ${selector}`);

function mostrarTablas(datos) {
    // Actualizar tabla de fechas (totales diarios)
    const tablaFechas = enVista('.table-box:first-child');
    if (tablaFechas) {
        let htmlFechas = `
            <div class="tabla-header">
                <h3 class="table-title">📅 Totales por Día (${datos.totalesDiarios.length} registros)</h3>
                <button class="btn-expandir" data-tabla="fechas">
                    <span class="texto-expandir">Expandir Tabla</span>
                    <span class="icono-expandir">▼</span>
                </button>
            </div>
        `;

        htmlFechas += '<div class="tabla-scroll tabla-colapsada" id="tabla-fechas-content">';
        htmlFechas += '<table class="tabla-datos">';
        htmlFechas += '<thead><tr><th>Fecha</th><th>Transferencias</th><th>Liquidaciones</th><th>Total</th></tr></thead>';
        htmlFechas += '<tbody>';

        datos.totalesDiarios.forEach(item => {
            htmlFechas += `
                <tr>
                    <td>${item.fecha}</td>
                    <td>${item.transferencias.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>${item.liquidaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td class="total-cell">${item.totalFormateado}</td>
                </tr>
            `;
        });

        htmlFechas += '</tbody></table></div>';
        tablaFechas.innerHTML = htmlFechas;
    }

    // Actualizar tabla de montos (totales mensuales)
    const tablaMontos = enVista('.table-box:last-child');
    if (tablaMontos) {
        let htmlMontos = `
            <div class="tabla-header">
                <h3 class="table-title">📈 Totales por Mes (${datos.totalesMensuales.length} registros)</h3>
                <button class="btn-expandir" data-tabla="montos">
                    <span class="texto-expandir">Expandir Tabla</span>
                    <span class="icono-expandir">▼</span>
                </button>
            </div>
        `;

        htmlMontos += '<div class="tabla-scroll tabla-colapsada" id="tabla-montos-content">';
        htmlMontos += '<table class="tabla-datos">';
        htmlMontos += '<thead><tr><th>Mes</th><th>Transferencias</th><th>Liquidaciones</th><th>Total</th></tr></thead>';
        htmlMontos += '<tbody>';

        datos.totalesMensuales.forEach(item => {
            htmlMontos += `
                <tr>
                    <td>${item.nombreMes}</td>
                    <td>${item.transferencias.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>${item.liquidaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td class="total-cell">${item.totalFormateado}</td>
                </tr>
            `;
        });

        htmlMontos += '</tbody></table></div>';
        tablaMontos.innerHTML = htmlMontos;
    }

    configurarBotonesExpandirTablas();
}


function configurarBotonesExpandirTablas() {
    const botonesExpandir = document.querySelectorAll('#leerMercadoPagoDiv .btn-expandir');

    botonesExpandir.forEach(boton => {
        boton.addEventListener('click', function () {
            const tipoTabla = this.getAttribute('data-tabla');
            const tablaContent = document.getElementById(`tabla-${tipoTabla}-content`);
            const textoExpandir = this.querySelector('.texto-expandir');
            const iconoExpandir = this.querySelector('.icono-expandir');

            if (tablaContent.classList.contains('tabla-colapsada')) {
                // Expandir tabla
                tablaContent.classList.remove('tabla-colapsada');
                tablaContent.classList.add('tabla-expandida');
                textoExpandir.textContent = 'Colapsar Tabla';
                iconoExpandir.textContent = '▲';
                this.classList.add('btn-activo');
            } else {
                // Colapsar tabla
                tablaContent.classList.remove('tabla-expandida');
                tablaContent.classList.add('tabla-colapsada');
                textoExpandir.textContent = 'Expandir Tabla';
                iconoExpandir.textContent = '▼';
                this.classList.remove('btn-activo');
            }
        });
    });
}


function injectMercadoPagoCSS() {
    const cssFileId = 'mercado-pago-styles';
    if (document.getElementById(cssFileId)) {
        return; // Evita inyectar el CSS múltiples veces
    }

    const head = document.head;
    const link = document.createElement('link');

    link.id = cssFileId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = '../leerMercadoPago/mercadoPago.css'; // Ruta relativa desde index.html
    link.media = 'all';

    head.appendChild(link);
}

let selectorUsuariosMP = null;
let plantillaMP = '';  // HTML del formulario tal como vino de mercadoPago_leer.html
let authManager = null;  // lanzador de esta pantalla (uno por formulario armado)

/**
 * Entrada de la vista (la llama el controlador cada vez que se entra): arranca
 * sin cliente; el formulario se arma recién al elegir uno.
 */
export function inicializarVistaMercadoPago() {
    const div = document.getElementById('leerMercadoPagoDiv');
    if (!div) {
        console.error('No se encontró leerMercadoPagoDiv');
        return;
    }
    plantillaMP = div.innerHTML;
    div.innerHTML = '';
    div.classList.add('contenido-oculto');
    window.usuarioSeleccionado = null;
    montarSelectorUsuarios();
}

function montarSelectorUsuarios() {
    selectorUsuariosMP = new SelectorUsuarios('mp-selector-usuarios', {
        mostrarTablaSeleccionados: false,
        seleccionUnica: true,

        // Modelo plano: el backend ya computó puedeOperar para 'facturacion'
        // (acceso AFIP propio o por representante + ≥1 PDV).
        fuente: 'contribuyentes',
        servicio: 'facturacion',
        // Botón "Clave": la corrige y la verifica ahí mismo (trae también los puntos de venta).
        ...(window.opcionesClaveEnSelector
            ? window.opcionesClaveEnSelector('afip', () => selectorUsuariosMP, { verificar: 'facturacion' })
            : {}),

        onCambioSeleccion: (seleccionados) => elegirCliente(seleccionados[0] || null)
    });
}

// Cada cliente arranca con el formulario de cero (no arrastra datos del anterior).
// El mismo cliente otra vez (ej. tras corregir su clave) no borra lo cargado.
function elegirCliente(usuario) {
    const div = document.getElementById('leerMercadoPagoDiv');
    const mismoCliente = usuario && window.usuarioSeleccionado
        && String(usuario.id) === String(window.usuarioSeleccionado.id);
    window.usuarioSeleccionado = usuario;
    if (mismoCliente) return;
    div.classList.toggle('contenido-oculto', !usuario);
    if (usuario) armarFormulario();
    else div.innerHTML = '';
}

// Formulario de cero (el de mercadoPago_leer.html) para el cliente elegido.
function armarFormulario() {
    document.getElementById('leerMercadoPagoDiv').innerHTML = plantillaMP;
    injectMercadoPagoCSS();
    const fechaComprobanteMP = document.getElementById('fechaComprobanteMP');
    // Arranca con hoy, como en Facturar: AFIP la necesita sí o sí
    if (fechaComprobanteMP) crearCalendario(fechaComprobanteMP, { formato: 'd/m/Y', inicial: 'hoy' });
    configurarArchivo();

    authManager = new AuthManager();
    authManager.inicializar({
        contenedorId: 'lanzadorFacturaMP',
        pdvAnclaId: 'selectPuntoDeVentaMP',
        nombreServicio: 'Mercado Pago',
        servicio: 'mercadopago',
        limpiar: limpiarFormulario
    });

    // Recién con los PDV cargados se sabe qué campo está habilitado.
    inicializarUsuarioEmpresaMP().then(enfocarPrimerCampo);
}

// Elegido el cliente, se sigue en el formulario (no en el selector).
function enfocarPrimerCampo() {
    const campo = enVista(':is(select, input:not([type=hidden])):not(:disabled)');
    if (campo) campo.focus();
}

// Auxiliar "Limpiar" del lanzador: mismo cliente, formulario de cero.
async function limpiarFormulario() {
    const ok = await showConfirmModal({
        title: 'Limpiar formulario',
        icon: '🧹',
        confirmText: 'Limpiar',
        message: 'Se borran los datos cargados, el archivo elegido y lo procesado. El cliente queda elegido.\n\n¿Desea continuar?'
    });
    if (ok) armarFormulario();
}

function configurarArchivo() {
    const btnSeleccionarArchivo = document.getElementById('btn-seleccionar-archivo');
    const rutaSeleccionadaInput = document.getElementById('ruta-seleccionada-input');
    const btnProcesarArchivo = document.getElementById('btn-procesar-archivo');

    // Elegir el PDF: aparece la ruta y el botón Procesar
    btnSeleccionarArchivo.addEventListener('click', async () => {
        try {
            const archivos = await window.electronAPI.mercadoPago.seleccionarArchivo();
            const archivoSeleccionado = archivos && archivos[0];
            if (!archivoSeleccionado || archivoSeleccionado.trim() === '') return;   // cerró el diálogo
            rutaSeleccionadaInput.value = archivoSeleccionado;
            document.getElementById('ruta-seleccionada-container').classList.remove('hidden');
            btnProcesarArchivo.classList.remove('hidden');
        } catch (error) {
            console.error('Error al seleccionar archivo:', error);
            avisar('Error al seleccionar archivo: ' + error.message, 'No se pudo elegir el archivo');
        }
    });

    // Procesar = leer el PDF + calcular las facturas; si sale bien aparece el lanzador
    btnProcesarArchivo.addEventListener('click', async () => {
        btnProcesarArchivo.textContent = 'Procesando...';
        btnProcesarArchivo.disabled = true;
        try {
            await procesar(rutaSeleccionadaInput.value);
        } catch (error) {
            console.error('Error al procesar archivo:', error);
            dejarSinCalculo();
            avisar('Error al procesar archivo: ' + error.message, 'No se pudo procesar');
        } finally {
            btnProcesarArchivo.textContent = 'Procesar';
            btnProcesarArchivo.disabled = false;
        }
    });
}

// El lanzador se ve solo con algo para facturar (si algo falla, no queda el cálculo anterior).
function dejarSinCalculo() {
    authManager.cargarCalculo(null);
    document.getElementById('lanzadorFacturaMP').classList.add('contenido-oculto');
    document.getElementById('avisosMP').innerHTML = '';
    enVista('#tablas-container').classList.add('hidden');
}

async function procesar(ruta) {
    const radioActividad = enVista('input[name="ActividadMP"]:checked');
    const fechaComprobante = (document.getElementById('fechaComprobanteMP').value || '').trim();
    const errores = [];
    if (!ruta || ruta.trim() === '') errores.push('Elegí el resumen de Mercado Pago.');
    if (!fechaComprobante) errores.push('Elegí la fecha del comprobante.');
    if (!radioActividad) errores.push('Debe seleccionar un tipo de Actividad.');
    if (errores.length > 0) {
        avisar(errores.join('\n'));
        return;
    }

    dejarSinCalculo();
    const resultado = await window.electronAPI.mercadoPago.procesarArchivo(ruta);
    if (!resultado.success) {
        console.error('Error en el procesamiento:', resultado.error);
        mostrarError(resultado);
        return;
    }
    mostrarResultados(resultado, fechaComprobante);
    enVista('#resultados-container').classList.remove('hidden');
    enVista('#tablas-container').classList.remove('hidden');

    const datosDiarios = datosDiariosDe(resultado);
    const usuario = window.usuarioSeleccionado || {};
    const selectPdvMP = document.getElementById('selectPuntoDeVentaMP');
    const calculo = await window.electronAPI.factura.calcular({
        modulo: 'mercadopago',
        Actividad: radioActividad.value,
        tipoContribuyente: usuario.tipoContribuyente || 'C',
        datos: datosDiarios,
        fechaComprobante,
        metodoIngreso: 'masivo',
        servicio: 'factura',
        empresaElegida: document.getElementById('selectEmpresaDisponibleMP').value,
        puntoVenta: selectPdvMP && selectPdvMP.value ? selectPdvMP.value : null,
        usuario
    });
    if (!calculo.success) {
        avisar(calculo.error);
        return;
    }

    const avisos = [avisoEntradas(resultado.estadisticas.controlEntradas), avisoFechas(datosDiarios, fechaComprobante)].filter(Boolean);
    document.getElementById('avisosMP').innerHTML = `
        <div class="success-message">
            <p><strong>✅ Datos listos para facturación:</strong> ${datosDiarios.length} registros procesados</p>
        </div>
        ${avisos.map(a => `<div class="aviso-fechas-mp">⚠ ${a}</div>`).join('')}
    `;
    authManager.cargarCalculo(calculo.paquete, avisos.join('\n\n⚠ ') || null);
    document.getElementById('lanzadorFacturaMP').classList.remove('contenido-oculto');
}

// Totales diarios del resumen → [{ fecha: 'dd/mm/aaaa', monto }] redondeado a centavos.
function datosDiariosDe(resultado) {
    return resultado.datos.totalesDiarios.map(item => {
        item.totalFormateado = item.total.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        item.total = parseFloat(item.totalFormateado.replace(/\./g, '').replace(/,/g, '.'));
        return {
            fecha: item.fecha.replace(/-/g, '/'),
            monto: item.total
        };
    });
}

// No frena nada: avisa si lo leído no da lo mismo que las "Entradas" del encabezado
// del resumen (hay movimientos de un tipo que el lector no reconoce, o de más).
function avisoEntradas(control) {
    if (!control || control.coincide) return null;
    return `El resumen dice Entradas ${control.entradasPdfFormateado} y el lector sumó otra cosa `
        + `(diferencia ${control.diferenciaFormateado}). Puede haber movimientos que no se reconocieron: `
        + 'revisá el resumen antes de facturar.';
}

// "27/10/2026" → "10/2026"; otra cosa → null
function mesDe(fecha) {
    const m = String(fecha || '').trim().match(/^\d{1,2}[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? `${m[1].padStart(2, '0')}/${m[2]}` : null;
}

// No frena nada: avisa si las ventas del resumen no son del mes de la fecha del
// comprobante (ej. resumen de agosto facturado con fecha de octubre).
function avisoFechas(datosDiarios, fechaComprobante) {
    const mesComprobante = mesDe(fechaComprobante);
    const mesesVentas = [...new Set(datosDiarios.map(d => mesDe(d.fecha)).filter(Boolean))];
    const distintos = mesesVentas.filter(m => m !== mesComprobante);
    if (!mesComprobante || distintos.length === 0) return null;
    return `Las ventas del resumen son de ${mesesVentas.join(', ')} y la fecha del comprobante es ${fechaComprobante}. `
        + 'Revisá que sea el período que querés facturar.';
}

// Usuario activo, empresa (modelo plano: el contribuyente ES la empresa) y sus PDV.
function inicializarUsuarioEmpresaMP() {
    const usuario = window.usuarioSeleccionado;
    const usuarioMP = document.getElementById('selectUsuariosMP');
    if (usuario && usuarioMP) {
        const nombreCapitalizado = usuario.nombre
            ? usuario.nombre.charAt(0).toUpperCase() + usuario.nombre.slice(1).toLowerCase()
            : 'Sin nombre';
        usuarioMP.textContent = nombreCapitalizado;
        usuarioMP.style.background = '#e9e9e9';
        usuarioMP.style.color = '#222';
        usuarioMP.style.padding = '4px 8px';
        usuarioMP.style.fontWeight = 'bold';
    }

    // Una sola opción = su razón social (no hay cascada empresa→PDV).
    const selectEmpresaMP = document.getElementById('selectEmpresaDisponibleMP');
    if (!selectEmpresaMP || !usuario) return Promise.resolve();
    const razonSocial = usuario.razonSocial || usuario.nombre || '';
    selectEmpresaMP.innerHTML = '';
    const option = document.createElement('option');
    option.value = razonSocial;
    option.textContent = razonSocial || 'Sin razón social';
    selectEmpresaMP.appendChild(option);
    selectEmpresaMP.disabled = true;   // nada que elegir: es el contribuyente
    return popularPuntosDeVentaMP(usuario.cuit);
}

/**
 * Pobla el <select id="selectPuntoDeVentaMP"> con los PDV que se pueden ofrecer
 * (misma regla que Facturas y Tipificada: ver pdvOfrecibles.js).
 * @param {string} cuit
 * @param {string[]|null} [habilitadosForzados] lista recién devuelta por AFIP
 */
async function popularPuntosDeVentaMP(cuit, habilitadosForzados = null) {
    const selectPdv = document.getElementById('selectPuntoDeVentaMP');
    if (!selectPdv) return;

    if (!habilitadosForzados) mostrarAvisoPdvMP(null);
    selectPdv.innerHTML = '<option value="">Cargando puntos de venta…</option>';
    selectPdv.disabled = true;

    const pdvs = await pdvOfrecibles(cuit, habilitadosForzados);

    selectPdv.innerHTML = '';

    if (pdvs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— sin puntos de venta —';
        selectPdv.appendChild(opt);
        selectPdv.disabled = true;
        return;
    }

    pdvs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.numero;
        opt.textContent = p.descripcion ? `${p.numero} — ${p.descripcion}` : p.numero;
        selectPdv.appendChild(opt);
    });
    selectPdv.disabled = false;
    selectPdv.selectedIndex = 0;

    selectPdv.onchange = () => mostrarAvisoPdvMP(null);
}

// Aviso dentro del formulario, pegado al desplegable de PDV (null = sacarlo).
// Misma clase que el de Facturas.
function mostrarAvisoPdvMP(texto) {
    const contenedor = document.getElementById('puntoDeVentaMPContainer');
    if (!contenedor) return;
    let aviso = document.getElementById('avisoPdvMP');
    if (!texto) {
        if (aviso) aviso.remove();
        contenedor.classList.remove('pdv-a-revisar');
        return;
    }
    if (!aviso) {
        aviso = document.createElement('p');
        aviso.id = 'avisoPdvMP';
        aviso.className = 'aviso-pdv-factura';
        contenedor.prepend(aviso);
    }
    aviso.textContent = texto;
    contenedor.classList.add('pdv-a-revisar');
}

function llevarAlPdvMP() {
    const selectPdv = document.getElementById('selectPuntoDeVentaMP');
    if (selectPdv) {
        selectPdv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        selectPdv.focus();
    }
}

/**
 * Vuelta del paso 0 con PDV_NO_HABILITADO: se recarga el desplegable con lo que
 * AFIP ofreció y se pide elegir otro. Lo leído de Mercado Pago no se toca.
 */
async function mostrarPdvHabilitadosMP(habilitados, elegido) {
    const usuario = window.usuarioSeleccionado;
    if (!usuario) return;
    await popularPuntosDeVentaMP(usuario.cuit, habilitados);
    mostrarAvisoPdvMP(
        `AFIP no habilita ${elegido ? `el punto de venta ${elegido}` : 'ese punto de venta'} para facturar. ` +
        'Estos son los que ofrece hoy: elegí uno y volvé a generar.'
    );
    llevarAlPdvMP();
}

/**
 * Vuelta con TIPO_PDV_DISTINTO: el backend ya corrigió el sistema del PDV y el tipo
 * del cliente (MP no manda letra: el back usa la del PDV), así que reintentar con
 * el mismo PDV ya sale con la letra correcta. Se recarga y se avisa.
 */
async function mostrarTipoCorregidoMP(detalle) {
    const usuario = window.usuarioSeleccionado;
    if (!usuario || !detalle) return;
    usuario.tipoContribuyente = detalle.letra;
    const selectPdv = document.getElementById('selectPuntoDeVentaMP');
    const elegido = selectPdv ? selectPdv.value : null;
    await popularPuntosDeVentaMP(usuario.cuit);
    if (selectPdv && elegido && Array.from(selectPdv.options).some(o => o.value === elegido)) {
        selectPdv.value = elegido;
    }
    const nombre = detalle.letra === 'B' ? 'Responsable Inscripto' : 'Monotributo';
    mostrarAvisoPdvMP(
        `AFIP indica que el punto de venta ${detalle.puntoVenta} es de ${nombre} ` +
        `(Factura ${detalle.letra}). Se corrigió el cliente: revisá y volvé a generar.`
    );
    llevarAlPdvMP();
}

// Vuelta del paso 0 con aviso de PDV (auth.js la reparte a la pantalla visible).
registrarManejadorPdv('selectPuntoDeVentaMP', {
    noHabilitado: mostrarPdvHabilitadosMP,
    tipoCorregido: mostrarTipoCorregidoMP
});

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function mostrarError(resultado) {
    const resultadosContainer = enVista('#resultados-container');
    if (resultadosContainer) {
        resultadosContainer.classList.remove('hidden');

        const resultBox = enVista('.result-box');
        if (resultBox) {
            resultBox.innerHTML = `
                <div class="error-message">
                    <h4>Error al procesar el archivo</h4>
                    <p><strong>Mensaje:</strong> ${resultado.error?.message || 'Error desconocido'}</p>
                    <p><strong>Archivo:</strong> ${resultado.archivo}</p>
                </div>
            `;
        }
    }
}

function mostrarResultados(resultado, fechaComprobante) {
    console.log("Resultado completo:", resultado);

    const resultBox = enVista('.result-box');
    if (!resultBox) {
        console.error('No se encontró .result-box');
        return;
    }

    // Mostrar resultados exitosos
    const datos = resultado.datos;
    const estadisticas = resultado.estadisticas;
    const empresa = document.getElementById('selectEmpresaDisponibleMP').value;

    resultBox.innerHTML = `
        <div class="resultado-exitoso">
            <h4>✅ Archivo procesado exitosamente</h4>
            <div class="info-basica">
                <p><strong>Archivo:</strong> ${resultado.archivo}</p>
                <p><strong>Procesado:</strong> ${new Date(resultado.procesadoEn).toLocaleString('es-AR')}</p>
            </div>

            <div class="resumen-general">
                <h5>📊 Resumen General</h5>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <span class="label">Empresa Elegida:</span>
                        <span class="value">${empresa}</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Fecha de Comprobante:</span>
                        <span class="value">${fechaComprobante}</span>
                    </div>
                    <br>
                    <div class="resumen-item">
                        <span class="label">Total Transferencias:</span>
                        <span class="value">${datos.resumenGeneral.transferenciasRecibidas.totalFormateado}</span>
                        <span class="count">(${datos.resumenGeneral.transferenciasRecibidas.cantidad} transferencias)</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Total Liquidaciones:</span>
                        <span class="value">${datos.resumenGeneral.liquidaciones.totalFormateado}</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Total Rendimientos:</span>
                        <span class="value">${datos.resumenGeneral.rendimientos.totalFormateado}</span>
                    </div>
                    <div class="resumen-item total-general">
                        <span class="label">💰 TOTAL GENERAL:</span>
                        <span class="value-big">${datos.resumenGeneral.totalGeneral.totalFormateado}</span>
                    </div>
                </div>
            </div>
            <div class="estadisticas">
                <h5>📈 Estadísticas</h5>
                <p><strong>Período:</strong> ${estadisticas.rangoFechas.desde} a ${estadisticas.rangoFechas.hasta}</p>
                <p><strong>Total días:</strong> ${estadisticas.totalDias} | <strong>Total meses:</strong> ${estadisticas.totalMeses}</p>
            </div>
        </div>
    `;

    // Actualizar las tablas
    mostrarTablas(datos);
}
