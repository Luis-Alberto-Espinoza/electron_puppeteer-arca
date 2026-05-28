/**
 * Módulo de Facturas Tipificadas
 * Permite generar múltiples facturas con datos específicos del cliente
 */

let contadorFacturas = 0;
let contadoresLineasPorFactura = {}; // { facturaId: contadorLineas }

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

    // Botón cancelar
    const btnCancelar = document.getElementById('btnCancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', cancelarFormulario);
    }

    // Submit del formulario
    const form = document.getElementById('formFacturaTipificada');
    if (form) {
        form.addEventListener('submit', manejarEnvioFormulario);
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
 * Actualiza el contador de facturas en el botón
 */
function actualizarContadorFacturas() {
    const facturas = document.querySelectorAll('.factura-item');
    const contador = document.getElementById('contadorFacturas');
    if (contador) {
        contador.textContent = facturas.length;
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
 * Cancela el formulario y limpia los datos
 */
function cancelarFormulario() {
    if (confirm('¿Está seguro que desea cancelar? Se perderán los datos ingresados.')) {
        document.getElementById('formFacturaTipificada').reset();
        document.getElementById('areaResultados').classList.add('contenido-oculto');
        document.getElementById('areaProgreso').classList.add('contenido-oculto');

        // Limpiar facturas
        contadorFacturas = 0;
        contadoresLineasPorFactura = {};
        document.getElementById('facturasContainer').innerHTML = '';

        // Agregar primera factura
        agregarFactura();

        // Re-establecer fechas por defecto
        establecerFechasPorDefecto();

        // Re-inicializar selector de empresas y tipo contribuyente
        inicializarSelectorEmpresas();
        establecerTipoContribuyente();
    }
}

/**
 * Maneja el envío del formulario
 */
async function manejarEnvioFormulario(e) {
    e.preventDefault();

    if (!window.usuarioSeleccionado) {
        mostrarError('No hay un usuario seleccionado');
        return;
    }

    try {
        // Deshabilitar botón de envío
        const btnGenerar = document.getElementById('btnGenerar');
        btnGenerar.disabled = true;
        btnGenerar.innerHTML = '<span class="loading-spinner"></span> Generando...';

        // Recopilar datos del formulario
        const datos = recopilarDatosFormulario();

        console.log('📤 Enviando datos al backend:', datos);

        // Mostrar área de progreso
        mostrarAreaProgreso(datos.facturas.length);

        // Agregar items de progreso para cada factura
        datos.facturas.forEach(factura => {
            const primeraLinea = factura.lineasDetalle[0];
            const descripcion = primeraLinea?.descripcion || 'Sin descripción';
            agregarItemProgreso(factura.numeroFactura, descripcion);
        });

        // Enviar al backend a través de IPC
        const resultado = await window.electronAPI.facturaTipificada.generarLote(datos);

        console.log('📥 Resultado recibido:', resultado);

        // Mostrar resumen final
        if (resultado.success) {
            if (resultado.modoTest) {
                // Modo prueba - mostrar mensaje especial
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
        // Rehabilitar botón
        const btnGenerar = document.getElementById('btnGenerar');
        btnGenerar.disabled = false;
        const totalFacturas = document.querySelectorAll('.factura-item').length;
        btnGenerar.innerHTML = `🧾 Generar <span id="contadorFacturas">${totalFacturas}</span> Factura(s)`;
    }
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

console.log('📦 Módulo facturaTipificada.js cargado');
