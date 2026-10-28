import { mercadoPagoFacturas } from '../facturas/facturas.js';
import { AuthManager, registrarManejadorPdv } from '../autenticacion/auth.js';
import { pdvOfrecibles } from '../facturas/pdvOfrecibles.js';

function mostrarTablas(datos) {
    // Actualizar tabla de fechas (totales diarios)
    const tablaFechas = document.querySelector('.table-box:first-child');
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
    const tablaMontos = document.querySelector('.table-box:last-child');
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
    const botonesExpandir = document.querySelectorAll('.btn-expandir');

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

// Función adicional para mostrar detalles de transferencias si es necesario
function mostrarDetalleTransferencias(transferencias) {
    console.log('Transferencias detalladas:', transferencias);
    // Esta función se puede expandir para mostrar una tabla detallada de todas las transferencias
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
    div.innerHTML = usuario ? plantillaMP : '';
    div.classList.toggle('contenido-oculto', !usuario);
    if (!usuario) return;
    initializeMercadoPago();
    inicializarUsuarioEmpresaActividadMP();
    const fechaComprobanteMP = document.getElementById('fechaComprobanteMP');
    if (fechaComprobanteMP) crearCalendario(fechaComprobanteMP, { formato: 'd/m/Y', inicial: null });
}

function initializeMercadoPago() {
    injectMercadoPagoCSS(); // <-- Inyectar el CSS específico del módulo
    try {
        // Pequeña pausa para asegurar que el DOM esté listo
        setTimeout(() => {
            const btnSeleccionarArchivo = document.getElementById('btn-seleccionar-archivo');
            const rutaSeleccionadaContainer = document.getElementById('ruta-seleccionada-container');
            const rutaSeleccionadaInput = document.getElementById('ruta-seleccionada-input');
            const btnProcesarArchivo = document.getElementById('btn-procesar-archivo');
            const resultadosContainer = document.getElementById('resultados-container');
            const tablasContainer = document.getElementById('tablas-container');

            // Verificar que los elementos existen
            if (!btnSeleccionarArchivo) {
                console.error('No se encontró el botón seleccionar archivo');
                return;
            }

            // PASO 1: Inicializar interfaz - Solo mostrar botón de seleccionar archivo
            inicializarInterfaz();

            // PASO 2: Event listener para seleccionar archivo
            btnSeleccionarArchivo.addEventListener('click', async () => {
                try {
                    // Verificar si window.electronAPI.mercadoPago existe
                    if (!window.electronAPI || !window.electronAPI.mercadoPago) {
                        console.error('MercadoPago API no está disponible');
                        alert('Error: API de MercadoPago no disponible');
                        return;
                    }

                    const archivos = await window.electronAPI.mercadoPago.seleccionarArchivo();

                    if (archivos && archivos.length > 0) {
                        const archivoSeleccionado = archivos[0];

                        // Verificar que la ruta no esté vacía
                        if (!archivoSeleccionado || archivoSeleccionado.trim() === '') {
                            console.error('La ruta del archivo está vacía');
                            alert('Error: La ruta del archivo está vacía');
                            return;
                        }

                        // MOSTRAR PASO 2: Archivo seleccionado + botón procesar
                        rutaSeleccionadaInput.value = archivoSeleccionado;
                        mostrarPaso2_ArchivoSeleccionado();

                    } else {
                        alert('No se seleccionó ningún archivo');
                    }
                } catch (error) {
                    console.error('Error al seleccionar archivo:', error);
                    alert('Error al seleccionar archivo: ' + error.message);
                }
            });

            // PASO 3: Event listener para procesar archivo
            btnProcesarArchivo.addEventListener('click', async () => {
                const ruta = rutaSeleccionadaInput.value;

                if (!ruta || ruta.trim() === '') {
                    console.error('No hay archivo seleccionado o ruta vacía');
                    alert('No hay archivo seleccionado');
                    return;
                }

                try {
                    // Verificar APIs disponibles
                    if (!window.electronAPI?.mercadoPago?.procesarArchivo) {
                        console.error('Función procesarArchivo de MercadoPago no disponible');
                        alert('Error: Función de procesamiento no disponible');
                        return;
                    }

                    // Mostrar indicador de carga
                    btnProcesarArchivo.textContent = 'Procesando...';
                    btnProcesarArchivo.disabled = true;

                    const resultado = await window.electronAPI.mercadoPago.procesarArchivo(ruta);

                    if (resultado.success) {
                        // MOSTRAR PASO 3: Resultados + botones de autenticación
                        mostrarPaso3_ResultadosYAutenticacion(resultado);
                    } else {
                        console.error('Error en el procesamiento:', resultado.error);
                        mostrarError(resultado);
                    }

                } catch (error) {
                    console.error('Error al procesar archivo:', error);
                    alert('Error al procesar archivo: ' + error.message);
                } finally {
                    // Restaurar botón
                    btnProcesarArchivo.textContent = 'Procesar Archivo';
                    btnProcesarArchivo.disabled = false;
                }
            });

        }, 100); // Pequeña pausa de 100ms

    } catch (error) {
        console.error('Error en la inicialización de MercadoPago:', error);
    }
}

// ========================================
// FUNCIONES PARA MOSTRAR PASOS PROGRESIVAMENTE
// ========================================

function inicializarInterfaz() {

    // Ocultar todos los elementos excepto el botón de seleccionar archivo
    const elementosAOcultar = [
        'ruta-seleccionada-container',
        'btn-procesar-archivo',
        'resultados-container',
        'tablas-container',
        'hacerFactura',
        'botones-container'
    ];

    elementosAOcultar.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.classList.add('hidden');
        } else {
            console.warn(`Elemento ${id} no encontrado`);
        }
    });

    // Limpiar contenido de las tablas para que no muestren títulos vacíos
    limpiarTablas();
}

function mostrarPaso2_ArchivoSeleccionado() {

    // Mostrar la ruta seleccionada y el botón procesar
    const rutaContainer = document.getElementById('ruta-seleccionada-container');
    const btnProcesar = document.getElementById('btn-procesar-archivo');

    if (rutaContainer) {
        rutaContainer.classList.remove('hidden');
    }

    if (btnProcesar) {
        btnProcesar.classList.remove('hidden');
    }
}

function mostrarPaso3_ResultadosYAutenticacion(resultado) {

    // Mostrar resultados
    mostrarResultados(resultado);

    // Mostrar containers de resultados y tablas
    const resultadosContainer = document.getElementById('resultados-container');
    const tablasContainer = document.getElementById('tablas-container');

    if (resultadosContainer) {
        resultadosContainer.classList.remove('hidden');
    }

    if (tablasContainer) {
        tablasContainer.classList.remove('hidden');
    }

    // Mostrar botón "Hacer Factura" y preparar datos
    mostrarBotonHacerFactura(resultado);
}

function mostrarBotonHacerFactura(resultado) {

    const hacerFacturaContainer = document.getElementById('hacerFactura');
    if (!hacerFacturaContainer) {
        console.error('No se encontró el contenedor hacerFactura');
        return;
    }
    hacerFacturaContainer.classList.remove('hidden');
    hacerFacturaContainer.innerHTML = `
        <button id="btn-hacer-factura" class="btn-hacer-factura">
            Hacer Factura
        </button>
    `;
    let datosDiarios = [];
    resultado.datos.totalesDiarios.forEach(item => {
        item.totalFormateado = item.total.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        item.total = parseFloat(item.totalFormateado.replace(/\./g, '').replace(/,/g, '.'));
        datosDiarios.push({
            fecha: item.fecha.replace(/-/g, '/'),
            monto: item.total
        });
    });

    const btnHacerFactura = document.getElementById('btn-hacer-factura');
    if (btnHacerFactura) {
        btnHacerFactura.addEventListener('click', () => {
            const selectEmpresa = document.getElementById('selectEmpresaDisponibleMP');
            const empresaElegida = selectEmpresa ? selectEmpresa.value : '';

            const selectPdvMP = document.getElementById('selectPuntoDeVentaMP');
            const puntoVenta = selectPdvMP && selectPdvMP.value ? selectPdvMP.value : null;

            const radioActividad = document.querySelector('input[name="ActividadMP"]:checked');
            const actividadElegida = radioActividad ? radioActividad.value : 'Servicio';

            const usuarioSeleccionado = window.usuarioSeleccionado || {};

            const fechaComprobanteInput = document.getElementById('fechaComprobanteMP');
            let fechaComprobante = '';
            if (fechaComprobanteInput && fechaComprobanteInput.value) {
                fechaComprobante = fechaComprobanteInput.value;
            }

            window.fechaComprobanteMP = fechaComprobante;

            const datosParaEnviar = {
                modulo: 'mercadopago',
                Actividad: actividadElegida,
                tipoContribuyente: usuarioSeleccionado.tipoContribuyente || 'C',
                datos: datosDiarios,
                fechaComprobante,
                metodoIngreso: 'masivo',
                servicio: "factura",
                empresaElegida,
                puntoVenta,
                usuario: usuarioSeleccionado
            };
            mercadoPagoFacturas(datosParaEnviar);
            mostrarPaso4_BotonesAutenticacion(datosDiarios, avisoFechas(datosDiarios, fechaComprobante));
        });
    }
}

// "27/10/2026" → "10/2026"; otra cosa → null
function mesDe(fecha) {
    const m = String(fecha || '').trim().match(/^\d{1,2}[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? `${m[1].padStart(2, '0')}/${m[2]}` : null;
}

// No frena nada: avisa si las ventas del resumen no son del mes de la fecha del
// comprobante (ej. resumen de agosto facturado con fecha de octubre).
function avisoFechas(datosDiarios, fechaComprobante) {
    if (!fechaComprobante) {
        return 'No elegiste la fecha del comprobante.';
    }
    const mesComprobante = mesDe(fechaComprobante);
    const mesesVentas = [...new Set(datosDiarios.map(d => mesDe(d.fecha)).filter(Boolean))];
    const distintos = mesesVentas.filter(m => m !== mesComprobante);
    if (!mesComprobante || distintos.length === 0) return null;
    return `Las ventas del resumen son de ${mesesVentas.join(', ')} y la fecha del comprobante es ${fechaComprobante}. `
        + 'Revisá que sea el período que querés facturar.';
}

function mostrarPaso4_BotonesAutenticacion(datosDiarios, aviso) {

    const botonesContainer = document.getElementById('botones-container');
    if (!botonesContainer) {
        console.error('No se encontró el contenedor botones-container');
        return;
    }

    botonesContainer.classList.remove('hidden');
    botonesContainer.innerHTML = `
        <div class="success-message">
            <p><strong>✅ Datos listos para facturación:</strong> ${datosDiarios.length} registros procesados</p>
        </div>
        ${aviso ? `<div class="aviso-fechas-mp">⚠ ${aviso}</div>` : ''}
        <div id="lanzadorFacturaMP"></div>
    `;

    const authManager = new AuthManager();
    authManager.inicializar({
        contenedorId: 'lanzadorFacturaMP',
        pdvAnclaId: 'selectPuntoDeVentaMP',
        nombreServicio: 'Mercado Pago',
        servicio: 'mercadopago',
        avisoAlEmitir: aviso
    });
}

// === NUEVO: Inicialización de usuario, empresa y actividad para MercadoPago ===
function inicializarUsuarioEmpresaActividadMP() {
    // Usuario activo
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

    // Empresas disponibles — modelo plano: el contribuyente ES la empresa.
    // Una sola opción = su razón social (no hay cascada empresa→PDV).
    const selectEmpresaMP = document.getElementById('selectEmpresaDisponibleMP');
    if (selectEmpresaMP && usuario) {
        const razonSocial = usuario.razonSocial || usuario.nombre || '';
        selectEmpresaMP.innerHTML = '';
        const option = document.createElement('option');
        option.value = razonSocial;
        option.textContent = razonSocial || 'Sin razón social';
        selectEmpresaMP.appendChild(option);
        selectEmpresaMP.disabled = true;   // nada que elegir: es el contribuyente
        window.empresaElegidaMP = razonSocial;
        popularPuntosDeVentaMP(usuario.cuit);
    }

    // Tipo de actividad
    const actividadRadios = document.querySelectorAll('input[name="ActividadMP"]');
    window.actividadElegidaMP = null;
    actividadRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                window.actividadElegidaMP = radio.value;
            }
        });
    });
    // Si hay uno seleccionado por defecto
    const checkedRadio = Array.from(actividadRadios).find(r => r.checked);
    if (checkedRadio) {
        window.actividadElegidaMP = checkedRadio.value;
    }
}

// Asegura que la inicialización se ejecute también después de cargar el HTML dinámicamente
window.configurarUsuarioMercadoPago = inicializarUsuarioEmpresaActividadMP;

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
        window.puntoVentaElegidoMP = '';
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
    window.puntoVentaElegidoMP = selectPdv.value;

    selectPdv.onchange = () => {
        window.puntoVentaElegidoMP = selectPdv.value;
        mostrarAvisoPdvMP(null);
    };
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
        window.puntoVentaElegidoMP = elegido;
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

function limpiarTablas() {
    // Limpiar el contenido de las tablas para que no muestren títulos vacíos
    const tablaFechas = document.querySelector('.table-box:first-child');
    const tablaMontos = document.querySelector('.table-box:last-child');

    if (tablaFechas) {
        tablaFechas.innerHTML = '';
    }

    if (tablaMontos) {
        tablaMontos.innerHTML = '';
    }

    // Remover event listeners existentes si los hay
    const botonesExpandirExistentes = document.querySelectorAll('.btn-expandir');
    botonesExpandirExistentes.forEach(boton => {
        boton.removeEventListener('click', configurarBotonesExpandirTablas);
    });
}

function mostrarError(resultado) {
    const resultadosContainer = document.getElementById('resultados-container');
    if (resultadosContainer) {
        resultadosContainer.classList.remove('hidden');

        const resultBox = document.querySelector('.result-box');
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

function mostrarResultados(resultado) {
    console.log("Resultado completo:", resultado);

    const resultBox = document.querySelector('.result-box');
    if (!resultBox) {
        console.error('No se encontró .result-box');
        return;
    }

    if (!resultado.success) {
        mostrarError(resultado);
        return;
    }

    // Mostrar resultados exitosos
    const datos = resultado.datos;
    const estadisticas = resultado.estadisticas;

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
                        <span class="value">${window.empresaElegidaMP || ''}</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Fecha de Comprobante:</span>
                        <span class="value">${window.fechaComprobanteMP.value || ''}</span>
                    </div>
                    <br>
                    <div class="resumen-item">
                        <span class="label">Total Transferencias:</span>
                        <span class="value">${datos.resumenGeneral.transferenciasRecibidas.totalFormateado}</span>
                        <span class="count">(${datos.resumenGeneral.transferenciasRecibidas.cantidad} transferencias)</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Total Transferencias Recibidas:</span>
                        <span class="value">${datos.resumenGeneral.transferenciasRecibidas.totalFormateado}</span>
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