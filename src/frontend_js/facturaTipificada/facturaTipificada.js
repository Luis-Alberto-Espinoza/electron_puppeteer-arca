/**
 * Módulo de Facturas Tipificadas
 * Permite generar múltiples facturas con datos específicos del cliente
 */

let contadorFacturas = 0;
let contadoresLineasPorFactura = {}; // { facturaId: contadorLineas }

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

        // Inicializar event listeners del formulario
        inicializarEventListeners();

        // Inicializar datepickers (ya incluye establecer fechas por defecto)
        inicializarDatePickers();

        // Resetear la lista de facturas distintas al (re)abrir la vista
        grupos = [];
        grupoEnEdicion = null;
        renderGruposGuardados();

        // Agregar la primera factura
        agregarFactura();

        // Configurar listener para eventos de progreso
        if (window.electronAPI && window.electronAPI.facturaTipificada && window.electronAPI.facturaTipificada.onProgreso) {
            window.electronAPI.facturaTipificada.onProgreso((datos) => {
                console.log('🔄 Progreso recibido:', datos);

                // Actualizar barra de progreso
                if (datos.actual && datos.total) {
                    actualizarBarraProgreso(datos.actual, datos.total);
                }

                // Actualizar estado del item
                if (datos.numeroFactura && datos.status) {
                    actualizarItemProgreso(datos.numeroFactura, datos.status, datos.mensaje || datos.descripcion);
                }
            });
            console.log('✅ Listener de progreso configurado');
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
    const selectPdv = document.getElementById('puntoDeVentaSelect');
    const btnRefrescar = document.getElementById('btnRefrescarPdv');
    if (!selectEmpresa) return;

    const usuario = window.usuarioSeleccionado;
    const empresas = Array.isArray(usuario?.empresas)
        ? usuario.empresas.map(e => e.razonSocial).filter(Boolean)
        : [];

    if (empresas.length === 0) {
        console.warn('⚠ No hay empresas disponibles para el cliente');
        selectEmpresa.innerHTML = '<option value="">No hay empresas disponibles</option>';
        resetPdvSelect('Sin empresa');
        return;
    }

    selectEmpresa.innerHTML = '<option value="">Seleccionar...</option>';
    empresas.forEach((razonSocial, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = razonSocial;
        if (index === 0) opt.selected = true;
        selectEmpresa.appendChild(opt);
    });

    // Listener de empresa: cambio manual del usuario → auto-fetch si no hay cache.
    selectEmpresa.addEventListener('change', () => manejarCambioEmpresa({ desdeUsuario: true }));

    // Listener de refrescar.
    if (btnRefrescar) {
        btnRefrescar.addEventListener('click', async () => {
            const indice = parseInt(selectEmpresa.value, 10);
            const empresa = (usuario.empresas || [])[indice];
            if (!empresa) return;
            await descubrirYPopularPdv(usuario.id, empresa.razonSocial, indice);
        });
    }

    // Disparar inicialización con la empresa preseleccionada — sin auto-fetch
    // para no costar 20-40s de Puppeteer en cada apertura del formulario.
    manejarCambioEmpresa({ desdeUsuario: false });

    console.log('✅ Selector de empresas inicializado con', empresas.length, 'empresa(s)');
}

/**
 * Maneja un cambio del select de empresa.
 * - Si hay PDV cacheados: poblar selector al instante.
 * - Si NO hay cache y el cambio vino del usuario: disparar scraping lazy.
 * - Si NO hay cache y es el init: dejar el botón Refrescar visible y avisar.
 */
async function manejarCambioEmpresa({ desdeUsuario }) {
    const selectEmpresa = document.getElementById('empresaPuntoVenta');
    const usuario = window.usuarioSeleccionado;
    if (!selectEmpresa || !usuario) return;

    const indice = parseInt(selectEmpresa.value, 10);
    const empresa = Number.isInteger(indice) ? (usuario.empresas || [])[indice] : null;

    if (!empresa) {
        resetPdvSelect('Seleccione una empresa');
        mostrarBtnRefrescarPdv(false);
        ocultarPdvInfo();
        return;
    }

    const tieneCache = Array.isArray(empresa.puntosDeVenta)
        && empresa.puntosDeVenta.length > 0
        && empresa.puntosDeVentaActualizados;

    if (tieneCache) {
        popularPdvSelect(empresa.puntosDeVenta, true);
        mostrarBtnRefrescarPdv(true);
        mostrarPdvInfo(
            `Cargados desde caché — ${empresa.puntosDeVenta.length} PDV (actualizado ${formatearFechaPdv(empresa.puntosDeVentaActualizados)})`,
            'idle'
        );
        return;
    }

    if (desdeUsuario) {
        // Mismo patrón que consulta_comprobantes: cache miss en cambio manual → scrape.
        await descubrirYPopularPdv(usuario.id, empresa.razonSocial, indice);
        return;
    }

    // Init sin cache: no auto-scrape, dejarle al usuario el botón Refrescar.
    resetPdvSelect('Sin PDV cacheados — haga clic en Refrescar');
    mostrarBtnRefrescarPdv(true);
    mostrarPdvInfo('Esta empresa no tiene PDV cacheados. Use 🔄 Refrescar para descubrirlos desde AFIP.', 'loading');
}

/**
 * Llama al backend para descubrir PDV vía Puppeteer y los cachea en el modelo en memoria.
 * @param {number|string} usuarioId
 * @param {string} razonSocial
 * @param {number} indiceEmpresa  índice de la empresa dentro de usuario.empresas[]
 */
async function descubrirYPopularPdv(usuarioId, razonSocial, indiceEmpresa) {
    const selectPdv = document.getElementById('puntoDeVentaSelect');
    const btnRefrescar = document.getElementById('btnRefrescarPdv');
    const usuario = window.usuarioSeleccionado;

    if (selectPdv) {
        selectPdv.innerHTML = '<option value="">Descubriendo puntos de venta…</option>';
        selectPdv.disabled = true;
    }
    if (btnRefrescar) btnRefrescar.disabled = true;
    mostrarBtnRefrescarPdv(true);
    mostrarPdvInfo('Conectando a AFIP para leer los puntos de venta — puede demorar 20–40s', 'loading');

    try {
        // Usamos el flujo ABM unificado (analizarEmpresa) en vez del viejo
        // descubrirPuntosDeVenta. Mismo backend que analizarCliente: una sola
        // fuente de verdad para los PDV operables (Factura en Línea + check).
        const res = await window.electronAPI.empresa.analizarEmpresa({
            usuarioId,
            razonSocial
        });

        if (!res || !res.success) {
            resetPdvSelect('Error al descubrir PDV');
            mostrarPdvInfo(res?.message || 'Error al descubrir puntos de venta', 'error');
            if (btnRefrescar) btnRefrescar.disabled = false;
            return;
        }

        // Refrescar cache local en el usuario en memoria.
        const empresa = (usuario?.empresas || [])[indiceEmpresa];
        if (empresa) {
            empresa.puntosDeVenta = res.data.puntosDeVenta;
            empresa.puntosDeVentaActualizados = res.data.puntosDeVentaActualizados;
        }

        const pdvs = Array.isArray(res.data.puntosDeVenta) ? res.data.puntosDeVenta : [];
        popularPdvSelect(pdvs, true);

        if (pdvs.length > 0) {
            mostrarPdvInfo(`Actualizado ahora — ${pdvs.length} PDV encontrado(s)`, 'idle');
        }
        if (btnRefrescar) btnRefrescar.disabled = false;
    } catch (e) {
        console.error('❌ Error descubriendo PDV:', e);
        resetPdvSelect('Error al descubrir PDV');
        mostrarPdvInfo(e.message || 'Error inesperado', 'error');
        if (btnRefrescar) btnRefrescar.disabled = false;
    }
}

/**
 * Filtro defensivo para selects de PDV en frontend.
 * Si el PDV tiene un `sistema` declarado (vino del ABM), exigir que sea
 * "Factura en Linea - Responsable Inscripto". Si no tiene sistema (vino del
 * fallback Comprobantes en Línea), dejar pasar.
 * Cubre datos viejos del JSON guardados antes del filtrado en backend.
 *
 * NO se exige `activo === true`: por consulta con contador, la columna
 * "Usado" del ABM no es bloqueante — un PDV puede estar habilitado para
 * Factura en Línea aunque todavía no se haya emitido nunca desde ahí.
 */
function _esPdvOperable(p) {
    if (!p || !p.numero) return false;
    if (p.sistema) {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return norm(p.sistema) === 'factura en linea - responsable inscripto';
    }
    return true;
}

/**
 * Puebla el select de PDV con los objetos {numero, descripcion}.
 * Si `preseleccionarPrimero` es true, marca el primer PDV.
 */
function popularPdvSelect(pdvs, preseleccionarPrimero) {
    const selectPdv = document.getElementById('puntoDeVentaSelect');
    if (!selectPdv) return;

    // Filtro defensivo por si el JSON tiene datos viejos sin filtrar.
    pdvs = Array.isArray(pdvs) ? pdvs.filter(_esPdvOperable) : [];

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

    // Checkbox de carpeta personalizada
    const checkboxCarpeta = document.getElementById('usarCarpetaPersonalizada');
    if (checkboxCarpeta) {
        checkboxCarpeta.addEventListener('change', (e) => {
            const grupoCarpeta = document.getElementById('grupoCarpetaPDF');
            if (grupoCarpeta) {
                grupoCarpeta.style.display = e.target.checked ? 'block' : 'none';
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

    // Botón cancelar
    const btnCancelar = document.getElementById('btnCancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', cancelarFormulario);
    }

    // Botón generar (no es submit: validamos a mano para no bloquear cuando
    // ya hay facturas distintas guardadas y el form quedó en blanco).
    const btnGenerar = document.getElementById('btnGenerar');
    if (btnGenerar) {
        btnGenerar.addEventListener('click', manejarGenerar);
    }

    // Enter dentro del form no debe recargar la página: lo enrutamos a generar.
    const form = document.getElementById('formFacturaTipificada');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            manejarGenerar();
        });
    }
}

/**
 * Inicializa los datepickers usando flatpickr
 */
function inicializarDatePickers() {
    const fechaActual = obtenerFechaActual();

    const camposFecha = [
        'fechaComprobanteTipificada',
        'fechaDesde',
        'fechaHasta',
        'fechaVtoPago'
    ];

    // Función para intentar inicializar flatpickr
    const intentarInicializarFlatpickr = (intentos = 0, maxIntentos = 10) => {
        console.log(`🔍 [Intento ${intentos + 1}/${maxIntentos}] Verificando flatpickr...`);
        console.log(`🔍 typeof flatpickr: ${typeof flatpickr}`);

        if (typeof flatpickr !== 'undefined') {
            console.log('✅ flatpickr está disponible, inicializando calendarios...');

            // flatpickr está disponible, inicializar
            camposFecha.forEach((id, index) => {
                const elemento = document.getElementById(id);
                console.log(`🔍 Buscando elemento #${id}:`, elemento ? 'ENCONTRADO' : 'NO ENCONTRADO');

                if (elemento) {
                    console.log(`🔍 Elemento #${id} - readOnly: ${elemento.readOnly}, disabled: ${elemento.disabled}`);
                    console.log(`🔍 Elemento #${id} - parentElement:`, elemento.parentElement);

                    // Verificar si ya tiene flatpickr inicializado
                    if (elemento._flatpickr) {
                        console.log(`⚠ #${id} ya tiene flatpickr, destruyendo instancia anterior...`);
                        elemento._flatpickr.destroy();
                    }

                    // Primero establecer el valor por defecto
                    elemento.value = fechaActual;

                    try {
                        // Luego inicializar flatpickr con ese valor
                        const fp = flatpickr(elemento, {
                            dateFormat: "d/m/Y",
                            locale: "es",
                            defaultDate: fechaActual,
                            allowInput: true
                        });

                        console.log(`✅ Datepicker inicializado correctamente en #${id}`);
                        console.log(`🔍 Instancia flatpickr #${id}:`, fp);
                    } catch (error) {
                        console.error(`❌ Error al inicializar flatpickr en #${id}:`, error);
                    }
                } else {
                    console.error(`❌ No se encontró el elemento #${id} en el DOM`);
                }
            });
            console.log('✅ Proceso de inicialización completado. Fecha:', fechaActual);
        } else if (intentos < maxIntentos) {
            // flatpickr no está disponible aún, reintentar
            console.log(`⏳ flatpickr no disponible, reintentando en 300ms...`);
            setTimeout(() => {
                intentarInicializarFlatpickr(intentos + 1, maxIntentos);
            }, 300); // Reintentar cada 300ms
        } else {
            // flatpickr no se cargó después de múltiples intentos
            console.error('❌ flatpickr no está disponible después de', maxIntentos, 'intentos');
            console.error('❌ Asegúrate de que flatpickr esté incluido en el HTML principal');

            // Establecer valores por defecto en los inputs
            camposFecha.forEach(id => {
                const elemento = document.getElementById(id);
                if (elemento) {
                    elemento.value = fechaActual;
                }
            });

            // Mostrar alerta al usuario
            alert('El calendario no se pudo cargar. Puedes ingresar fechas manualmente en formato DD/MM/YYYY');
        }
    };

    // Iniciar el proceso de inicialización
    intentarInicializarFlatpickr();
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
                        <option value="7" style="color:#888;">seleccionar...</option>
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
        linea.remove();
        console.log(`✅ Línea #${numeroLinea} eliminada de Factura #${numeroFactura}`);
    }
}

/**
 * Actualiza el contador de comprobantes en el botón "Generar".
 * Cuenta los comprobantes ya guardados en facturas distintas + los del form actual.
 */
function actualizarContadorFacturas() {
    const enForm = document.querySelectorAll('.factura-item').length;
    const enGrupos = grupos.reduce((sum, g) => sum + (g.datos.facturas?.length || 0), 0);
    const contador = document.getElementById('contadorFacturas');
    if (contador) {
        contador.textContent = enForm + enGrupos;
    }
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
    document.getElementById('formFacturaTipificada').reset();
    document.getElementById('areaResultados').classList.add('contenido-oculto');
    document.getElementById('areaProgreso').classList.add('contenido-oculto');

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
}

/**
 * Cancela el formulario y limpia TODO (incluida la lista de facturas distintas).
 */
function cancelarFormulario() {
    if (confirm('¿Está seguro que desea cancelar? Se perderán los datos ingresados.')) {
        grupos = [];
        grupoEnEdicion = null;
        renderGruposGuardados();
        limpiarFormulario();
    }
}

/**
 * Genera todas las facturas: las distintas ya guardadas + (si tiene datos) el form actual.
 */
async function manejarGenerar() {
    if (!window.usuarioSeleccionado) {
        mostrarError('No hay un usuario seleccionado');
        return;
    }

    const form = document.getElementById('formFacturaTipificada');

    // Lista final de facturas distintas a generar (clon de las guardadas).
    const gruposParaEnviar = grupos.map(g => clonar(g.datos));

    // Incluir el formulario actual si el usuario dejó datos cargados.
    if (formularioTieneDatos()) {
        if (!form.reportValidity()) return;
        gruposParaEnviar.push(recopilarDatosFormulario());
    }

    if (gruposParaEnviar.length === 0) {
        mostrarError('No hay facturas para generar. Completá el formulario o agregá una factura distinta.');
        return;
    }

    // Modo prueba: fuente de verdad = el checkbox actual, aplicado a todos los grupos.
    const modoTest = document.getElementById('modoPrueba')?.checked || false;
    gruposParaEnviar.forEach(g => { g.datosComunes.modoTest = modoTest; });

    const btnGenerar = document.getElementById('btnGenerar');

    try {
        btnGenerar.disabled = true;
        btnGenerar.innerHTML = '<span class="loading-spinner"></span> Generando...';

        // Total de comprobantes sumando todos los grupos.
        const totalComprobantes = gruposParaEnviar.reduce((s, g) => s + (g.facturas?.length || 0), 0);

        console.log(`📤 Enviando ${gruposParaEnviar.length} factura(s) distinta(s), ${totalComprobantes} comprobante(s) en total`);

        mostrarAreaProgreso(totalComprobantes);

        // Crear items de progreso con índice global 1..N (coincide con el backend).
        let indiceGlobal = 0;
        gruposParaEnviar.forEach(g => {
            const cliente = (g.datosComunes.receptor?.nombreCliente || '').trim()
                || g.datosComunes.receptor?.numeroDocumento || 'Cliente';
            (g.facturas || []).forEach(f => {
                indiceGlobal++;
                const desc = f.lineasDetalle[0]?.descripcion || 'Sin descripción';
                agregarItemProgreso(indiceGlobal, `${cliente} — ${desc}`);
            });
        });

        // Enviar al backend a través de IPC (shape nuevo: { grupos }).
        const resultado = await window.electronAPI.facturaTipificada.generarLote({ grupos: gruposParaEnviar });

        console.log('📥 Resultado recibido:', resultado);

        if (resultado.success) {
            if (resultado.modoTest) {
                mostrarResultadoModoPrueba(resultado);
            } else if (resultado.resultados) {
                mostrarResumenFinal(resultado.resultados);
            }
        } else {
            mostrarError(resultado.message || 'Error al generar las facturas');
        }

    } catch (error) {
        console.error('❌ Error al generar facturas:', error);
        mostrarError('Error: ' + error.message);
    } finally {
        btnGenerar.disabled = false;
        const total = document.querySelectorAll('.factura-item').length
            + grupos.reduce((s, g) => s + (g.datos.facturas?.length || 0), 0);
        btnGenerar.innerHTML = `🧾 Generar <span id="contadorFacturas">${total}</span> Factura(s)`;
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

    // Empresa elegida (índice) → razón social
    const indiceEmpresaSeleccionada = parseInt(formData.get('empresaPuntoVenta'), 10);
    const empresaElegida = Number.isInteger(indiceEmpresaSeleccionada)
        ? (usuario?.empresas || [])[indiceEmpresaSeleccionada]
        : null;
    const nombreEmpresa = empresaElegida?.razonSocial || '';

    // PDV elegido (numero como "00006")
    const puntoVenta = formData.get('puntoDeVenta') || '';

    console.log('📍 Empresa elegida:', nombreEmpresa);
    console.log('📍 Punto de venta:', puntoVenta);

    // Datos comunes (compartidos por todas las facturas)
    const datosComunes = {
        tipoActividad: formData.get('tipoActividad'),
        tipoContribuyente: usuario.tipoContribuyente,
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

        // Opciones adicionales
        carpetaPDF: formData.get('usarCarpetaPersonalizada') === 'on'
            ? formData.get('carpetaPDF')
            : null,

        // Modo prueba (solo procesa 1ra factura sin confirmar)
        modoTest: document.getElementById('modoPrueba')?.checked || false,

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
        condicionesVenta: obtenerCondicionesVentaSeleccionadas(),
        usarCarpetaPersonalizada: fd.get('usarCarpetaPersonalizada') === 'on',
        carpetaPDF: fd.get('carpetaPDF') || ''
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

    // Carpeta personalizada.
    const chkCarpeta = document.getElementById('usarCarpetaPersonalizada');
    if (chkCarpeta) {
        chkCarpeta.checked = !!c.usarCarpetaPersonalizada;
        chkCarpeta.dispatchEvent(new Event('change'));
    }
    _setVal('carpetaPDF', c.carpetaPDF);

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

    if (resultado.data?.pdfPath) {
        html += `
            <p><strong>PDF guardado en:</strong><br>
            <code>${resultado.data.pdfPath}</code></p>
            <button type="button" onclick="abrirCarpetaPDF('${resultado.data.pdfPath}')" class="btn-secundario">
                📁 Abrir carpeta del PDF
            </button>
        `;
    }

    html += `</div>`;

    mensajeResultado.innerHTML = html;
    areaResultados.classList.remove('contenido-oculto');

    // Scroll hacia resultados
    areaResultados.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    areaResultados.classList.remove('contenido-oculto');
    areaResultados.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Abre la carpeta donde se guardó el PDF
 */
function abrirCarpetaPDF(rutaPDF) {
    if (window.electronAPI && window.electronAPI.abrirDirectorio) {
        const carpeta = rutaPDF.substring(0, rutaPDF.lastIndexOf('/'));
        window.electronAPI.abrirDirectorio(carpeta);
    } else {
        alert('Carpeta: ' + rutaPDF);
    }
}

/**
 * Muestra el área de progreso e inicializa la lista
 */
function mostrarAreaProgreso(totalFacturas) {
    const areaProgreso = document.getElementById('areaProgreso');
    const areaResultados = document.getElementById('areaResultados');

    if (areaResultados) {
        areaResultados.classList.add('contenido-oculto');
    }

    if (areaProgreso) {
        document.getElementById('progresoTotal').textContent = totalFacturas;
        document.getElementById('progresoActual').textContent = '0';
        document.getElementById('barraProgresoFill').style.width = '0%';
        document.getElementById('listaProgresoFacturas').innerHTML = '';

        areaProgreso.classList.remove('contenido-oculto');
        areaProgreso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Actualiza la barra de progreso general
 */
function actualizarBarraProgreso(actual, total) {
    document.getElementById('progresoActual').textContent = actual;
    const porcentaje = (actual / total) * 100;
    document.getElementById('barraProgresoFill').style.width = porcentaje + '%';
}

/**
 * Agrega un item de factura a la lista de progreso
 */
function agregarItemProgreso(numeroFactura, descripcion) {
    const lista = document.getElementById('listaProgresoFacturas');
    const itemHTML = `
        <div class="item-progreso" id="progreso_f${numeroFactura}">
            <span class="icono-estado">⏸️</span>
            <span class="texto-factura">Factura #${numeroFactura}: ${descripcion}</span>
            <span class="estado-texto">Pendiente</span>
        </div>
    `;
    lista.insertAdjacentHTML('beforeend', itemHTML);
}

/**
 * Actualiza el estado de un item de progreso
 */
function actualizarItemProgreso(numeroFactura, estado, mensaje = '') {
    const item = document.getElementById(`progreso_f${numeroFactura}`);
    if (!item) return;

    const icono = item.querySelector('.icono-estado');
    const estadoTexto = item.querySelector('.estado-texto');

    switch (estado) {
        case 'en_progreso':
            icono.textContent = '⏳';
            estadoTexto.textContent = 'Generando...';
            estadoTexto.style.color = '#0066cc';
            break;
        case 'completada':
            icono.textContent = '✅';
            estadoTexto.textContent = 'Completada';
            estadoTexto.style.color = '#28a745';
            if (mensaje) {
                estadoTexto.textContent += ` - ${mensaje}`;
            }
            break;
        case 'error':
            icono.textContent = '❌';
            estadoTexto.textContent = `Error: ${mensaje}`;
            estadoTexto.style.color = '#dc3545';
            break;
    }
}

/**
 * Muestra el resumen final de todas las facturas generadas
 */
function mostrarResumenFinal(resultados) {
    const areaProgreso = document.getElementById('areaProgreso');
    const areaResultados = document.getElementById('areaResultados');
    const mensajeResultado = document.getElementById('mensajeResultado');

    if (areaProgreso) {
        areaProgreso.classList.add('contenido-oculto');
    }

    const exitosas = resultados.filter(r => r.success).length;
    const fallidas = resultados.filter(r => !r.success).length;

    let html = `
        <div class="resumen-lote">
            <h4>📊 Resumen de Generación de Facturas</h4>
            <p><strong>Total procesadas:</strong> ${resultados.length}</p>
            <p><strong>✅ Exitosas:</strong> ${exitosas}</p>
            <p><strong>❌ Fallidas:</strong> ${fallidas}</p>
            <hr>
            <h5>Detalles:</h5>
            <ul class="lista-resultados">
    `;

    resultados.forEach((resultado, index) => {
        if (resultado.success) {
            html += `
                <li class="resultado-exitoso">
                    ✅ Factura #${index + 1}
                    ${resultado.pdfPath ? `<br><small>PDF: ${resultado.pdfPath}</small>` : ''}
                </li>
            `;
        } else {
            html += `
                <li class="resultado-error">
                    ❌ Factura #${index + 1}: ${resultado.message || resultado.error}
                </li>
            `;
        }
    });

    html += `
            </ul>
        </div>
    `;

    mensajeResultado.innerHTML = html;
    areaResultados.classList.remove('contenido-oculto');
    areaResultados.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Muestra el resultado del modo prueba
 */
function mostrarResultadoModoPrueba(resultado) {
    const areaProgreso = document.getElementById('areaProgreso');
    const areaResultados = document.getElementById('areaResultados');
    const mensajeResultado = document.getElementById('mensajeResultado');

    if (areaProgreso) {
        areaProgreso.classList.add('contenido-oculto');
    }

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
                    <li>Desmarca la opción "Modo Prueba"</li>
                    <li>Haz clic en "Generar Factura(s)" nuevamente</li>
                </ol>
            </div>
            ${resultado.screenshotPath ? `
                <p class="ruta-captura"><small>Captura guardada en: ${resultado.screenshotPath}</small></p>
            ` : ''}
        </div>
    `;

    mensajeResultado.innerHTML = html;
    areaResultados.classList.remove('contenido-oculto');
    areaResultados.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Desmarcar el checkbox de modo prueba para la siguiente ejecución
    const checkboxModoPrueba = document.getElementById('modoPrueba');
    if (checkboxModoPrueba) {
        checkboxModoPrueba.checked = false;
    }
}

// Exponer funciones globalmente
window.inicializarFacturasTipificadas = inicializarFacturasTipificadas;
window.eliminarFactura = eliminarFactura;
window.eliminarLineaDeFactura = eliminarLineaDeFactura;
window.agregarLineaAFactura = agregarLineaAFactura;
window.abrirCarpetaPDF = abrirCarpetaPDF;
window.mostrarInfoUsuario = mostrarInfoUsuario; // Para actualizar cuando se cambia de usuario
window.editarGrupo = editarGrupo;   // Facturas distintas: editar tarjeta
window.eliminarGrupo = eliminarGrupo; // Facturas distintas: quitar tarjeta

console.log('📦 Módulo facturaTipificada.js cargado');
