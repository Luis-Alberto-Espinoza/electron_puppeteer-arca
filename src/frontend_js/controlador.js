import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js';

/**
 * Oculta todos los submódulos al cambiar de módulo
 */
function ocultarSubmodulos() {
    // Oculta submódulos de AFIP
    ['facturasDiv', 'facturasTipificadasDiv', 'leerMercadoPagoDiv', 'libroIvaDiv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('contenido-oculto');
    });
    // Si tienes submódulos en ATM, agrégalos aquí
    // ['atmSubmodulo1', 'atmSubmodulo2'].forEach(...)
}

/**
 * Cierra y vacía los paneles on-demand de los módulos AFIP. Se llama al CAMBIAR
 * de cliente para que no quede pegado el dato del anterior. NO re-inicializa nada
 * (los listeners de los botones siguen vivos): al reabrir cada panel, su loader
 * on-demand hace fetch fresco y lo arma con el cliente actual.
 *
 * OJO: 'facturasDiv' NO se vacía. A diferencia de los otros, se carga UNA vez en
 * inicializarInterfazFacturas() y se alterna por display (no se re-fetchea al
 * reabrir), así que vaciarlo lo dejaría roto. Solo se oculta; su estado interno
 * (datosMasivos, formulario) necesita un reset propio que todavía no existe.
 */
function limpiarPanelesAfip() {
    // Paneles on-demand: se reconstruyen al reabrirse → vaciar es seguro.
    ['facturasTipificadasDiv', 'leerMercadoPagoDiv', 'libroIvaDiv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('contenido-oculto');
            el.innerHTML = '';
        }
    });
    // Facturas: solo ocultar (su contenido vive desde el init, no se re-fetchea).
    const facturas = document.getElementById('facturasDiv');
    if (facturas) facturas.style.display = 'none';
}

// ========================================
// VARIABLES GLOBALES
// ========================================
let usuarioSeleccionado = null; // Usuario actualmente seleccionado en la aplicación
let modulosAfipCargados = false; // Flag para evitar inicializar los módulos AFIP múltiples veces
let onUsuarioSeleccionado = null; // Callback para la acción a ejecutar después de seleccionar un usuario
let selectorListenerAgregado = false; // Flag para asegurar que el listener del selector se agregue solo una vez
let selectorUsuariosAfip = null; // Instancia del componente SelectorUsuarios para AFIP

// ========================================
// CONFIGURACIÓN CENTRALIZADA DE MÓDULOS
// ========================================
// Array que define todos los módulos principales con su botón, contenedor y función de carga
const MODULOS_PRINCIPALES = [
    {
        btn: 'btnEntrarAfip',
        modulo: 'homeAfipDiv',
        clave: 'afip',
        callback: cargarModuloHomeAfip
    },
    {
        btn: 'btnUsuarios',
        modulo: 'usuariosDiv',
        clave: 'clientes',
        callback: cargarModuloUsuarios
    },
    {
        btn: 'btnExtraerTablasPDF',
        modulo: 'extraerTablasPDFDiv',
        clave: 'pdf',
        callback: cargarModuloExtraerTablasPDF
    },
    {
        btn: 'btnEntrarATM',
        modulo: 'atmsDiv',
        clave: 'atm',
        callback: cargarModuloLoteATM
    }
];

// ========================================
// FUNCIONES CENTRALIZADAS DE NAVEGACIÓN
// ========================================

/**
 * Oculta todos los módulos principales y muestra solo el especificado
 * @param {string} idMostrar - ID del div que se debe mostrar
 */
function mostrarSoloModulo(idMostrar) {
    // Ocultar todos los módulos principales
    MODULOS_PRINCIPALES.forEach(({ modulo }) => {
        const elemento = document.getElementById(modulo);
        if (elemento) elemento.classList.add('contenido-oculto');
    });

    // Ocultar módulos secundarios (que no están en MODULOS_PRINCIPALES)
    ['generarVEPDiv', 'selectorUsuarioDiv', 'modulosAfipDiv', 'planesDePagoDiv', 'cuentaTributariaDiv', 'consultaComprobantesDiv', 'declaracionJuradaDiv', 'historialDiv', 'plantillasExcelDiv'].forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.classList.add('contenido-oculto');
    });

    ocultarSubmodulos(); // Oculta todos los submódulos

    // Mostrar el módulo solicitado
    const mostrar = document.getElementById(idMostrar);
    if (mostrar) mostrar.classList.remove('contenido-oculto');
}

/**
 * Inicializa todos los botones principales basándose en la configuración del array.
 * Cada botón ahora navega vía navegarVista(clave), que además recuerda la vista
 * activa para poder recargarla (botón "Recargar" del navbar / Ctrl+Shift+R).
 */
function inicializarBotonesPrincipales() {
    MODULOS_PRINCIPALES.forEach(({ btn, clave }) => {
        const boton = document.getElementById(btn);
        if (boton) {
            boton.addEventListener('click', () => navegarVista(clave));
        }
    });
}

// ========================================
// REGISTRO DE VISTAS NAVEGABLES (para navbar + recarga)
// ========================================
// Mapea una clave de vista a su contenedor + su loader. El loader es idempotente
// (limpia el div y vuelve a inyectar HTML/JS), así que re-ejecutarlo = recargar.
// Nota: las 4 vistas principales también figuran en MODULOS_PRINCIPALES (que se usa
// para la lógica de ocultar); acá las repetimos a propósito para tener UN registro
// único de navegación que incluya además los servicios AFIP.
const REGISTRO_VISTAS = {
    afip: { modulo: 'homeAfipDiv', cargar: cargarModuloHomeAfip },
    atm: { modulo: 'atmsDiv', cargar: cargarModuloLoteATM },
    clientes: { modulo: 'usuariosDiv', cargar: cargarModuloUsuarios },
    pdf: { modulo: 'extraerTablasPDFDiv', cargar: cargarModuloExtraerTablasPDF },
    vep: { modulo: 'generarVEPDiv', cargar: cargarModuloGenerarVEP },
    planesDePago: { modulo: 'planesDePagoDiv', cargar: cargarModuloPlanesDePago },
    cuentaTributaria: { modulo: 'cuentaTributariaDiv', cargar: cargarModuloCuentaTributaria },
    consultaComprobantes: { modulo: 'consultaComprobantesDiv', cargar: cargarModuloConsultaComprobantes },
    declaracionJurada: { modulo: 'declaracionJuradaDiv', cargar: cargarModuloDeclaracionJurada },
    historial: { modulo: 'historialDiv', cargar: cargarModuloHistorial },
    plantillasExcel: { modulo: 'plantillasExcelDiv', cargar: cargarModuloPlantillasExcel },
};

// Recuerda qué vista está activa para poder recargarla sin perder el contexto.
let vistaActual = null;

// Subservicio ATM pendiente de activar tras cargar la vista (lo setea navegarAtmSub).
let atmSubPendiente = null;

/**
 * Navega a una vista por su clave: muestra su contenedor y ejecuta su loader.
 * @param {string} clave - clave en REGISTRO_VISTAS (ej: 'vep', 'atm', 'afip')
 */
function navegarVista(clave) {
    const vista = REGISTRO_VISTAS[clave];
    if (!vista) {
        console.warn('[controlador] Vista desconocida:', clave);
        return;
    }
    vistaActual = clave;
    mostrarSoloModulo(vista.modulo);
    vista.cargar();
}

/**
 * Recarga COMPLETA de la ventana (igual que Ctrl+Shift+R). Vuelve al inicio y
 * descarta todo el estado en memoria, a propósito: así se limpia el cliente/
 * servicio anterior que queda pegado. Mantiene el nombre que usa el navbar.
 */
function recargarVistaActual() {
    window.location.reload();
}

/**
 * Navega a la vista ATM y activa un subservicio puntual (constancias, planesPago,
 * tasaCero, retenciones). Lo usa el dropdown ATM del navbar.
 * @param {string} sub - valor de data-sub del botón del subservicio.
 */
function navegarAtmSub(sub) {
    atmSubPendiente = sub;
    navegarVista('atm');
}

// Exponer para el navbar (componente separado)
window.navegarVista = navegarVista;
window.recargarVistaActual = recargarVistaActual;
window.navegarAtmSub = navegarAtmSub;

// ========================================
// INICIALIZACIÓN PRINCIPAL
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarBotonesPrincipales(); // Inicializar toda la navegación centralizada

    // Inicializar el navbar (componente separado, expuesto en window por navbar.js)
    if (typeof window.initNavbar === 'function') {
        window.initNavbar();
    }

    // Listeners para eventos personalizados de los módulos.
    // Pasan por navegarVista para que quede registrada la vista activa (recargable).
    document.addEventListener('cargarModuloVEP', () => navegarVista('vep'));

    document.addEventListener('cargarModuloFactura', () => {
        // Flujo especial: selector de usuario previo (no es una vista del registro)
        mostrarSoloModulo('selectorUsuarioDiv');
        cargarModuloGenerarFactura();
    });

    document.addEventListener('volverHomeAfip', () => navegarVista('afip'));

    document.addEventListener('cargarModuloPlanesDePago', () => navegarVista('planesDePago'));

    document.addEventListener('cargarModuloCuentaTributaria', () => navegarVista('cuentaTributaria'));

    document.addEventListener('cargarModuloConsultaComprobantes', () => navegarVista('consultaComprobantes'));

    document.addEventListener('cargarModuloDeclaracionJurada', () => navegarVista('declaracionJurada'));
});

// ========================================
// CALLBACKS DE CARGA PARA CADA MÓDULO
// ========================================

/**
 * Muestra el selector de usuario y carga el componente dinámicamente
 */
async function mostrarSelectorUsuario() {
    const selectorDiv = document.getElementById('selectorUsuarioDiv');

    if (!selectorDiv) {
        console.error('❌ No se encontró selectorUsuarioDiv');
        return;
    }

    // Mostrar el div
    mostrarSoloModulo('selectorUsuarioDiv');

    // Si ya está inyectado, solo mostrar y recargar usuarios
    if (selectorUsuariosAfip) {
        // recargar() también vuelve a pintar la lista (cargarUsuarios solo traía los datos,
        // y la lista seguía mostrando los estados viejos).
        await selectorUsuariosAfip.recargar();
        return;
    }

    try {
        console.log('🔵 Inyectando componente selectorUsuarios...');

        // 1. INYECTAR HTML
        selectorDiv.innerHTML = `
            <div class="selector-usuario">
                <h2>Seleccione el Cliente para Facturar</h2>
                <div id="selector-usuarios-afip"></div>
                <p style="color: var(--v-texto-2, #666); font-size: 14px; margin-top: 10px;">
                    Una vez seleccionado el cliente, podrá acceder a los módulos de Facturas y MercadoPago
                </p>
            </div>
        `;

        // 2. CARGAR CSS del componente (si no está cargado)
        const cssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = cssPath;
            document.head.appendChild(cssLink);
            console.log('✅ CSS del componente cargado');
        }

        // 3. CARGAR JS del componente (si no está cargado)
        const jsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';
        if (!document.head.querySelector(`script[src="${jsPath}"]`)) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = jsPath;
                script.onload = () => {
                    console.log('✅ JS del componente cargado');
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ Error cargando JS del componente');
                    reject(new Error('Error cargando selectorUsuarios.js'));
                };
                document.head.appendChild(script);
            });
        }

        // Pequeño delay para asegurar que SelectorUsuarios esté disponible
        await new Promise(resolve => setTimeout(resolve, 100));

        // 4. CREAR INSTANCIA del componente
        if (typeof SelectorUsuarios === 'undefined') {
            throw new Error('SelectorUsuarios no está definido');
        }

        selectorUsuariosAfip = new SelectorUsuarios('selector-usuarios-afip', {
            // Ocultar tabla de seleccionados (solo selección simple, avanza automático)
            mostrarTablaSeleccionados: false,

            // ====== MODELO PLANO ======
            // El backend ya computó puedeOperar/motivoNoOpera para 'facturacion'
            // (acceso AFIP propio o por representante + ≥1 PDV). El representado
            // (El Papi) aparece como fila propia. NO se usan campoCredencial/
            // campoEstado/requiereAnalisis: eso era del objeto gordo legacy.
            fuente: 'contribuyentes',
            servicio: 'facturacion',

            // Igual que el lanzador: por default solo los habilitados; la casilla muestra el
            // resto. Los de clave sin validar se pueden elegir (se valida al facturar) y el botón
            // "Clave" la corrige y la verifica ahí mismo (trae también los puntos de venta). Facturación usa la clave AFIP (la del
            // representante, si es representado). Ver actualizarClave.js.
            ...(window.opcionesClaveEnSelector
                ? window.opcionesClaveEnSelector('afip', () => selectorUsuariosAfip,
                    { verificar: 'facturacion' })   // login + trae los puntos de venta
                : {}),

            onCambioSeleccion: (usuariosSeleccionados) => {
                // Solo permitir 1 usuario - tomar el ÚLTIMO (el recién clickeado)
                if (usuariosSeleccionados.length > 0) {
                    // Tomar el último usuario (el que acabamos de seleccionar)
                    const usuario = usuariosSeleccionados[usuariosSeleccionados.length - 1];

                    // Limitar a 1 solo - mantener solo el último
                    if (usuariosSeleccionados.length > 1) {
                        selectorUsuariosAfip.usuariosSeleccionados = [usuario];
                        selectorUsuariosAfip.actualizarVista();
                    }

                    // Llamar a la función existente (avanza a Facturas automáticamente)
                    seleccionarUsuario(usuario);
                }
            }
        });

        console.log('✅ Selector de usuarios cargado correctamente');

    } catch (error) {
        console.error('❌ Error cargando selector de usuarios:', error);
        selectorDiv.innerHTML = `
            <div style="color:red; padding: 20px;">
                <h3>Error cargando el selector de usuarios</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

/**
 * Carga el módulo de gestión de usuarios
 */
function cargarModuloUsuarios() {
    const usuariosDiv = document.getElementById('usuariosDiv');
    if (!usuariosDiv) return;

    // Garantiza que el CSS del módulo esté REALMENTE cargado antes de renderizar.
    // Antes se agregaba el <link> async y se renderizaba con un setTimeout(100)
    // adivinado: en arranque en frío la grilla se calculaba con el CSS a medio
    // aplicar y la columna del nombre colapsaba a 0 (solo se veía el emoji hasta
    // hacer resize). Esperar el onload elimina esa carrera.
    const asegurarCssCargado = () => new Promise((resolve) => {
        const existente = document.getElementById('usuario-css-link');
        if (existente) return resolve();  // ya se cargó en una navegación previa
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '../usuario/usuario.css';
        link.id = 'usuario-css-link';
        link.addEventListener('load', resolve);
        link.addEventListener('error', resolve);  // no bloquear la vista si falla
        document.head.appendChild(link);
    });

    usuariosDiv.innerHTML = '';

    Promise.all([
        fetch('../usuario/usuario.html').then(r => r.text()),
        asegurarCssCargado()
    ])
        .then(([html]) => {
            usuariosDiv.innerHTML = html;

            // Inicializar/renderar recién cuando el contenedor YA está visible y con
            // el layout resuelto: el doble requestAnimationFrame garantiza un pase de
            // layout completo al tamaño final, así la grilla mide el ancho real (no 0)
            // y el nombre nunca aparece vacío al arrancar.
            const arrancar = () => {
                // usuario.js es un SCRIPT CLÁSICO: re-ejecutarlo redeclara sus
                // `let`/`const` de nivel superior → "Identifier already declared" y
                // aborta TODO el script. Por eso se carga UNA sola vez; en reentradas
                // solo re-inicializamos (el HTML ya se re-inyectó arriba).
                if (window.inicializarUsuarioFrontend) {
                    window.inicializarUsuarioFrontend();
                    return;
                }
                const script = document.createElement('script');
                script.src = '../usuario/usuario.js';
                script.defer = true;
                script.onload = () => {
                    if (window.inicializarUsuarioFrontend) {
                        window.inicializarUsuarioFrontend();
                    }
                };
                document.head.appendChild(script);
            };
            requestAnimationFrame(() => requestAnimationFrame(arrancar));
        })
        .catch(error => {
            console.error('Error cargando módulo de usuarios:', error);
            usuariosDiv.innerHTML = `<p>Error: ${error.message}</p>`;
        });
}

/**
 * Carga el módulo de extracción de tablas PDF
 */
async function cargarModuloExtraerTablasPDF() {
    const extraerTablasPDFDiv = document.getElementById('extraerTablasPDFDiv');

    if (extraerTablasPDFDiv) {
        // Limpiar contenido anterior para evitar elementos duplicados
        extraerTablasPDFDiv.innerHTML = '';

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../extraerTablasPdf_F/tablasPDF.html';
            const cssPath = '../extraerTablasPdf_F/tablasPDF.css';
            const jsPath = '../extraerTablasPdf_F/tablasPDF.js';

            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            const html = await response.text();
            extraerTablasPDFDiv.innerHTML = html;

            // Cargar CSS solo si no está presente
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
            }

            // Cargar JavaScript e inicializar funcionalidad
            const script = document.createElement('script');
            script.src = jsPath;
            script.defer = true;
            script.onload = () => {
                // Inicializar eventos del módulo una vez cargado
                if (window.inicializarEventosExtraerTablasPDF) {
                    window.inicializarEventosExtraerTablasPDF();
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo de extracción PDF:', error);
            extraerTablasPDFDiv.innerHTML = '<div style="color:red;">Error cargando el módulo de extracción de tablas PDF.</div>';
        }
    }
}

/**
 * Carga el módulo de procesamiento por lotes de ATM
 */
async function cargarModuloLoteATM() {
    mostrarSoloModulo('atmsDiv'); // Reutilizamos el mismo contenedor principal
    const atmsDiv = document.getElementById('atmsDiv');

    if (atmsDiv) {
        atmsDiv.innerHTML = ''; // Limpiar contenido anterior

        try {
            // Rutas del componente genérico SelectorUsuarios
            const selectorUsuariosCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
            const selectorUsuariosJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

            // Rutas de los archivos de lote ATM
            const htmlPath = '../ATM_f/ATM_vistas/atm_lote.html';
            const cssPath = '../ATM_f/ATM_vistas/atm_lote.css';
            const jsPath = '../ATM_f/ATM_vistas/atm_lote.js';

            // 1. Cargar CSS del componente SelectorUsuarios (si no está cargado)
            if (!document.head.querySelector(`link[href="${selectorUsuariosCssPath}"]`)) {
                const selectorCssLink = document.createElement('link');
                selectorCssLink.rel = 'stylesheet';
                selectorCssLink.href = selectorUsuariosCssPath;
                document.head.appendChild(selectorCssLink);
            }

            // 2. Cargar HTML del módulo lote
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            const html = await response.text();
            atmsDiv.innerHTML = html;

            // 3. Cargar CSS del módulo lote
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
            }

            // 4. Cargar JS del componente SelectorUsuarios primero
            const cargarSelectorUsuariosScript = () => {
                return new Promise((resolve, reject) => {
                    // Verificar si ya está cargado
                    if (typeof SelectorUsuarios !== 'undefined') {
                        resolve();
                        return;
                    }

                    const oldSelectorScript = document.head.querySelector(`script[src="${selectorUsuariosJsPath}"]`);
                    if (oldSelectorScript) oldSelectorScript.remove();

                    const selectorScript = document.createElement('script');
                    selectorScript.src = selectorUsuariosJsPath;
                    selectorScript.defer = true;
                    selectorScript.onload = () => resolve();
                    selectorScript.onerror = () => reject(new Error('Error al cargar SelectorUsuarios.js'));
                    document.head.appendChild(selectorScript);
                });
            };

            // 5. Luego cargar JS del módulo lote
            await cargarSelectorUsuariosScript();

            const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
            if (oldScript) oldScript.remove();

            const script = document.createElement('script');
            script.src = jsPath;
            script.defer = true;
            script.onload = () => {
                if (window.inicializarModuloLoteATM) {
                    window.inicializarModuloLoteATM();
                }
                // Si se navegó a un subservicio puntual desde el navbar, activarlo
                // simulando el click en su botón (la lógica vive dentro del módulo).
                if (atmSubPendiente) {
                    const btnSub = document.querySelector(`.btn-sub[data-sub="${atmSubPendiente}"]`);
                    if (btnSub) btnSub.click();
                    atmSubPendiente = null;
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo de lote ATM:', error);
            atmsDiv.innerHTML = '<div style="color:red;">Error cargando el módulo de lotes ATM.</div>';
        }
    }
}
// Exponer la función globalmente para que pueda ser llamada desde otros scripts
window.cargarModuloLoteATM = cargarModuloLoteATM;

/**
 * Carga el módulo Home AFIP (menú de servicios AFIP)
 */
async function cargarModuloHomeAfip() {
    const homeAfipDiv = document.getElementById('homeAfipDiv');

    if (homeAfipDiv) {
        homeAfipDiv.innerHTML = ''; // Limpiar contenido anterior

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../home_AFIP/home_afip.html';
            const cssPath = '../home_AFIP/home_afip.css';
            const jsPath = '../home_AFIP/home_afip.js';

            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            const html = await response.text();
            homeAfipDiv.innerHTML = html;

            // Cargar CSS solo si no está presente
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
            }

            // Cargar JavaScript e inicializar funcionalidad
            const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
            if (oldScript) oldScript.remove();

            const script = document.createElement('script');
            script.src = jsPath;
            script.defer = true;
            script.onload = () => {
                if (window.inicializarHomeAfip) {
                    window.inicializarHomeAfip();
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo Home AFIP:', error);
            homeAfipDiv.innerHTML = '<div style="color:red;">Error cargando el módulo Home AFIP.</div>';
        }
    }
}

/**
 * Carga el módulo de Generar VEP (Volante Electrónico de Pago)
 */
async function cargarModuloGenerarVEP() {
    console.log('🔵 cargarModuloGenerarVEP() - Iniciando...');
    mostrarSoloModulo('generarVEPDiv');
    const generarVEPDiv = document.getElementById('generarVEPDiv');

    if (generarVEPDiv) {
        generarVEPDiv.innerHTML = ''; // Limpiar contenido anterior

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../generar_VEP/generar_vep.html';
            const cssPath = '../generar_VEP/generar_vep.css';
            const jsPath = '../generar_VEP/generar_vep.js';

            // Rutas del componente genérico
            const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
            const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

            console.log('🔵 Cargando HTML desde:', htmlPath);
            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            let html = await response.text();

            // Crear un contenedor temporal para parsear el HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Eliminar todos los <link> de CSS del HTML (se cargan dinámicamente)
            tempDiv.querySelectorAll('link[rel="stylesheet"]').forEach(link => link.remove());

            // Insertar el HTML limpio
            generarVEPDiv.innerHTML = tempDiv.innerHTML;
            console.log('✅ HTML cargado correctamente');

            // Cargar CSS del componente genérico
            if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
                const selectorCssLink = document.createElement('link');
                selectorCssLink.rel = 'stylesheet';
                selectorCssLink.href = selectorCssPath;
                document.head.appendChild(selectorCssLink);
                console.log('✅ CSS componente genérico cargado');
            }

            // Cargar CSS específico de VEP
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
                console.log('✅ CSS VEP cargado');
            }

            // Cargar JS del componente genérico primero
            const oldSelectorScript = document.head.querySelector(`script[src="${selectorJsPath}"]`);
            if (oldSelectorScript) oldSelectorScript.remove();

            const selectorScript = document.createElement('script');
            selectorScript.src = selectorJsPath;
            selectorScript.defer = true;
            selectorScript.onload = () => {
                console.log('✅ Script componente genérico cargado');

                // AHORA cargar el controlador de VEP como módulo ES6 (después de que el genérico esté listo)
                const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
                if (oldScript) oldScript.remove();

                const script = document.createElement('script');
                script.type = 'module'; // ES6 modules
                script.src = jsPath;
                script.onload = () => {
                    console.log('✅ Módulo controlador VEP cargado. Verificando window.inicializarGenerarVEP...');
                    if (window.inicializarGenerarVEP) {
                        console.log('✅ Llamando a inicializarGenerarVEP()');
                        window.inicializarGenerarVEP();
                    } else {
                        console.error('❌ window.inicializarGenerarVEP no está definida');
                    }
                };
                document.head.appendChild(script);
            };
            document.head.appendChild(selectorScript);

        } catch (error) {
            console.error('❌ Error cargando módulo Generar VEP:', error);
            generarVEPDiv.innerHTML = '<div style="color:red;">Error cargando el módulo Generar VEP.</div>';
        }
    } else {
        console.error('❌ No se encontró el elemento generarVEPDiv');
    }
}

/**
 * Carga el módulo de Historial de acciones (bitácora, solo lectura).
 * No usa selector de usuario ni componentes genéricos: HTML + CSS + JS plano.
 */
async function cargarModuloHistorial() {
    mostrarSoloModulo('historialDiv');
    const historialDiv = document.getElementById('historialDiv');
    if (!historialDiv) {
        console.error('❌ No se encontró historialDiv');
        return;
    }

    historialDiv.innerHTML = ''; // limpiar contenido anterior (loader idempotente)

    try {
        const htmlPath = '../historial/historial.html';
        const jsPath = '../historial/historial.js';

        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        const html = await response.text();

        // El CSS va por <link> dentro del HTML; lo dejamos, el navegador no lo duplica.
        historialDiv.innerHTML = html;

        // (Re)cargar el JS y luego inicializar.
        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.src = jsPath;
        script.onload = () => {
            if (window.inicializarHistorial) {
                window.inicializarHistorial();
            } else {
                console.error('❌ window.inicializarHistorial no está definida');
            }
        };
        document.head.appendChild(script);
    } catch (error) {
        console.error('❌ Error cargando módulo Historial:', error);
        historialDiv.innerHTML = '<div style="color:red;">Error cargando el Historial.</div>';
    }
}

/**
 * Carga el módulo Plantillas Excel (un botón por plantilla; cada una transforma el
 * Excel original de un cliente en un archivo nuevo). HTML + CSS + JS plano.
 */
async function cargarModuloPlantillasExcel() {
    mostrarSoloModulo('plantillasExcelDiv');
    const div = document.getElementById('plantillasExcelDiv');
    if (!div) {
        console.error('❌ No se encontró plantillasExcelDiv');
        return;
    }

    div.innerHTML = ''; // loader idempotente

    try {
        const htmlPath = '../plantillasExcel/plantillasExcel.html';
        const jsPath = '../plantillasExcel/plantillasExcel.js';

        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        div.innerHTML = await response.text();

        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.src = jsPath;
        script.onload = () => {
            if (window.inicializarPlantillasExcel) {
                window.inicializarPlantillasExcel();
            } else {
                console.error('❌ window.inicializarPlantillasExcel no está definida');
            }
        };
        document.head.appendChild(script);
    } catch (error) {
        console.error('❌ Error cargando módulo Plantillas Excel:', error);
        div.innerHTML = '<div style="color:red;">Error cargando Plantillas Excel.</div>';
    }
}

/**
 * Carga el módulo de Generar Factura (selector de usuario existente)
 */
function cargarModuloGenerarFactura() {
    onUsuarioSeleccionado = mostrarModulosAfip;
    mostrarSelectorUsuario();
}

/**
 * Carga el módulo de Planes de Pago (directo, sin selector previo)
 * El selector multi-usuario está embebido en la vista
 */
async function cargarModuloPlanesDePago() {
    mostrarSoloModulo('planesDePagoDiv');
    const planesDePagoDiv = document.getElementById('planesDePagoDiv');

    if (!planesDePagoDiv) return;

    planesDePagoDiv.innerHTML = '';

    try {
        // Rutas del componente genérico SelectorUsuarios
        const selectorUsuariosCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorUsuariosJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // Rutas de los archivos del módulo
        const htmlPath = '../planesDePago/planes_de_pago.html';
        const cssPath = '../planesDePago/planes_de_pago.css';
        const jsPath = '../planesDePago/planes_de_pago.js';

        // 1. Cargar CSS del componente SelectorUsuarios
        if (!document.head.querySelector(`link[href="${selectorUsuariosCssPath}"]`)) {
            const selectorCssLink = document.createElement('link');
            selectorCssLink.rel = 'stylesheet';
            selectorCssLink.href = selectorUsuariosCssPath;
            document.head.appendChild(selectorCssLink);
        }

        // 2. Cargar HTML del módulo
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        const html = await response.text();
        planesDePagoDiv.innerHTML = html;

        // 3. Cargar CSS del módulo
        if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = cssPath;
            document.head.appendChild(cssLink);
        }

        // 4. Cargar JS del componente SelectorUsuarios primero
        const cargarSelectorUsuariosScript = () => {
            return new Promise((resolve, reject) => {
                if (typeof SelectorUsuarios !== 'undefined') {
                    resolve();
                    return;
                }

                const oldSelectorScript = document.head.querySelector(`script[src="${selectorUsuariosJsPath}"]`);
                if (oldSelectorScript) oldSelectorScript.remove();

                const selectorScript = document.createElement('script');
                selectorScript.src = selectorUsuariosJsPath;
                selectorScript.defer = true;
                selectorScript.onload = () => resolve();
                selectorScript.onerror = () => reject(new Error('Error al cargar SelectorUsuarios.js'));
                document.head.appendChild(selectorScript);
            });
        };

        await cargarSelectorUsuariosScript();

        // 5. Cargar JS del módulo
        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.src = jsPath;
        script.defer = true;
        script.onload = () => {
            if (window.inicializarModuloPlanesDePago) {
                window.inicializarModuloPlanesDePago();
            }
        };
        document.head.appendChild(script);

    } catch (error) {
        console.error('Error cargando módulo Planes de Pago:', error);
        planesDePagoDiv.innerHTML = '<div style="color:red;">Error cargando el módulo de Planes de Pago.</div>';
    }
}

/**
 * Carga el módulo de Cuenta Tributaria (SCT)
 * Mismo patrón que VEP: HTML + CSS + componente SelectorUsuarios + módulo ES6.
 */
async function cargarModuloCuentaTributaria() {
    console.log('🟢 cargarModuloCuentaTributaria() - Iniciando...');
    mostrarSoloModulo('cuentaTributariaDiv');
    const ctDiv = document.getElementById('cuentaTributariaDiv');
    if (!ctDiv) {
        console.error('❌ No se encontró cuentaTributariaDiv');
        return;
    }

    ctDiv.innerHTML = '';

    try {
        const htmlPath = '../cuentaTributaria/cuentaTributaria.html';
        const cssPath = '../cuentaTributaria/cuentaTributaria.css';
        const jsPath = '../cuentaTributaria/cuentaTributaria.js';

        const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // 1. HTML
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        const html = await response.text();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.remove());
        ctDiv.innerHTML = tempDiv.innerHTML;

        // 2. CSS componente genérico
        if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = selectorCssPath;
            document.head.appendChild(l);
        }

        // 3. CSS específico CT
        if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = cssPath;
            document.head.appendChild(l);
        }

        // 4. JS componente genérico (asegurar carga)
        await new Promise((resolve, reject) => {
            if (typeof SelectorUsuarios !== 'undefined') return resolve();
            const old = document.head.querySelector(`script[src="${selectorJsPath}"]`);
            if (old) old.remove();
            const s = document.createElement('script');
            s.src = selectorJsPath;
            s.defer = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Error cargando selectorUsuarios.js'));
            document.head.appendChild(s);
        });

        // 5. JS controlador CT (módulo ES6)
        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();
        const script = document.createElement('script');
        script.type = 'module';
        script.src = jsPath;
        script.onload = () => {
            if (window.inicializarCuentaTributaria) {
                window.inicializarCuentaTributaria();
            } else {
                console.error('❌ window.inicializarCuentaTributaria no está definida');
            }
        };
        document.head.appendChild(script);

    } catch (error) {
        console.error('❌ Error cargando módulo Cuenta Tributaria:', error);
        ctDiv.innerHTML = '<div style="color:red;">Error cargando el módulo Cuenta Tributaria.</div>';
    }
}

/**
 * Carga el módulo de Declaración Jurada.
 * Primer slice (modo prueba): <select> simple de usuario + botón "Probar acceso".
 * No usa SelectorUsuarios ni ES modules — JS plano con window.inicializarDeclaracionJurada.
 */
async function cargarModuloDeclaracionJurada() {
    console.log('🟢 cargarModuloDeclaracionJurada() - Iniciando...');
    mostrarSoloModulo('declaracionJuradaDiv');
    const div = document.getElementById('declaracionJuradaDiv');
    if (!div) {
        console.error('❌ No se encontró declaracionJuradaDiv');
        return;
    }
    div.innerHTML = '';

    try {
        const htmlPath = '../declaracionJurada/declaracion_jurada.html';
        const cssPath = '../declaracionJurada/declaracion_jurada.css';
        const jsPath = '../declaracionJurada/declaracion_jurada.js';

        // 1. HTML
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        const html = await response.text();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.remove());
        div.innerHTML = tempDiv.innerHTML;

        const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // 2. CSS componente SelectorUsuarios (mismo que usa Factura)
        if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = selectorCssPath;
            document.head.appendChild(l);
        }

        // 3. CSS específico DDJJ
        if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = cssPath;
            document.head.appendChild(l);
        }

        // 4. JS componente SelectorUsuarios (asegurar carga antes del módulo)
        await new Promise((resolve, reject) => {
            if (typeof SelectorUsuarios !== 'undefined') return resolve();
            const old = document.head.querySelector(`script[src="${selectorJsPath}"]`);
            if (old) old.remove();
            const s = document.createElement('script');
            s.src = selectorJsPath;
            s.defer = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Error cargando selectorUsuarios.js'));
            document.head.appendChild(s);
        });

        // 5. JS del módulo DDJJ (re-cargar siempre para que la inicialización corra cada vez)
        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();
        const script = document.createElement('script');
        script.src = jsPath;
        script.defer = true;
        script.onload = () => {
            if (typeof window.inicializarDeclaracionJurada === 'function') {
                window.inicializarDeclaracionJurada();
            } else {
                console.error('❌ window.inicializarDeclaracionJurada no está definida');
            }
        };
        document.head.appendChild(script);

    } catch (error) {
        console.error('❌ Error cargando módulo Declaración Jurada:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo Declaración Jurada.</div>';
    }
}

/**
 * Carga el módulo de Consulta de Comprobantes Emitidos.
 * No usa SelectorUsuarios: el módulo trae su propio <select> simple.
 */
async function cargarModuloConsultaComprobantes() {
    mostrarSoloModulo('consultaComprobantesDiv');
    const div = document.getElementById('consultaComprobantesDiv');
    if (!div) {
        console.error('❌ No se encontró consultaComprobantesDiv');
        return;
    }

    div.innerHTML = '';

    try {
        const htmlPath = '../consultaComprobantes/consulta_comprobantes.html';
        const cssPath  = '../consultaComprobantes/consulta_comprobantes.css';
        const jsPath   = '../consultaComprobantes/consulta_comprobantes.js';

        // Rutas del componente genérico SelectorUsuarios (buscador de clientes)
        const selectorUsuariosCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorUsuariosJsPath  = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // 1. HTML
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        const html = await response.text();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.remove());
        div.innerHTML = tempDiv.innerHTML;

        // 2. CSS
        if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = cssPath;
            document.head.appendChild(l);
        }

        // 2b. CSS del componente SelectorUsuarios
        if (!document.head.querySelector(`link[href="${selectorUsuariosCssPath}"]`)) {
            const selectorCssLink = document.createElement('link');
            selectorCssLink.rel = 'stylesheet';
            selectorCssLink.href = selectorUsuariosCssPath;
            document.head.appendChild(selectorCssLink);
        }

        // 2c. Cargar JS del componente SelectorUsuarios primero, para que
        //     inicializarConsultaComprobantes() tenga la clase disponible.
        await new Promise((resolve, reject) => {
            if (typeof SelectorUsuarios !== 'undefined') {
                resolve();
                return;
            }
            const oldSelectorScript = document.head.querySelector(`script[src="${selectorUsuariosJsPath}"]`);
            if (oldSelectorScript) oldSelectorScript.remove();

            const selectorScript = document.createElement('script');
            selectorScript.src = selectorUsuariosJsPath;
            selectorScript.defer = true;
            selectorScript.onload = () => resolve();
            selectorScript.onerror = () => reject(new Error('Error al cargar SelectorUsuarios.js'));
            document.head.appendChild(selectorScript);
        });

        // 3. JS
        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();
        const script = document.createElement('script');
        script.src = jsPath;
        script.defer = true;
        script.onload = () => {
            if (typeof window.inicializarConsultaComprobantes === 'function') {
                window.inicializarConsultaComprobantes();
            } else {
                console.error('❌ window.inicializarConsultaComprobantes no está definida');
            }
        };
        document.head.appendChild(script);

    } catch (error) {
        console.error('❌ Error cargando módulo Consulta de Comprobantes:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de Consulta de Comprobantes.</div>';
    }
}


// ========================================
// GESTIÓN DE USUARIOS
// ========================================

/**
 * Capitaliza la primera letra de cada palabra en una cadena
 * @param {string} nombre - Nombre a capitalizar
 * @returns {string} Nombre capitalizado
 */
function capitalizarNombre(nombre) {
    if (!nombre) return '';

    const nombreEnMinusculas = nombre.toLowerCase();
    return nombreEnMinusculas.split(' ').map(palabra => {
        if (palabra.length === 0) return '';
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');
}

/**
 * ⚠️ FUNCIÓN OBSOLETA - Ya no se usa
 * Reemplazada por el componente SelectorUsuarios que se inyecta dinámicamente
 * en mostrarSelectorUsuario()
 *
 * Se mantiene comentada como referencia histórica.
 */
/*
async function cargarUsuariosEnSelector() {
    const selectUsuarios = document.getElementById('selectUsuariosSelector');
    if (!selectUsuarios) return;

    try {
        selectUsuarios.innerHTML = '<option value="">Cargando usuarios...</option>';
        selectUsuarios.disabled = true;

        const result = await window.electronAPI.user.getAll();

        if (result.success && Array.isArray(result.users)) {
            // Filtrar usuarios para que solo muestre aquellos con clave de AFIP
            const usuariosAFIP = result.users.filter(user => (user.claveAFIP && user.claveAFIP.trim() !== '') || (user.clave && user.clave.trim() !== ''));

            if (usuariosAFIP.length > 0) {
                selectUsuarios.innerHTML = '<option value="">Seleccione un usuario</option>';
                usuariosAFIP.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;

                    const nombreCapitalizado = capitalizarNombre(user.nombre);
                    const apellidoCapitalizado = user.apellido ? ` ${capitalizarNombre(user.apellido)}` : '';
                    option.textContent = `${nombreCapitalizado}${apellidoCapitalizado}`.trim();

                    // Store all data, including new keys, in the dataset
                    option.dataset.cuit = user.cuit || '';
                    option.dataset.cuil = user.cuil || '';
                    option.dataset.tipoContribuyente = user.tipoContribuyente || '';
                    option.dataset.claveAFIP = user.claveAFIP || user.clave || ''; // Fallback to old 'clave'
                    option.dataset.claveATM = user.claveATM || '';
                    option.dataset.nombre = user.nombre || '';
                    option.dataset.apellido = user.apellido || '';
                    option.dataset.empresasDisponibles = JSON.stringify(user.puntosDeVenta || []);

                    selectUsuarios.appendChild(option);
                });
            } else {
                selectUsuarios.innerHTML = '<option value="">No hay usuarios con clave de AFIP</option>';
            }

            selectUsuarios.disabled = false;
        } else {
            selectUsuarios.innerHTML = '<option value="">No se encontraron usuarios</option>';
        }

        if (!selectorListenerAgregado) {
            selectUsuarios.addEventListener('change', (e) => {
                if (e.target.value) {
                    const selectedOption = selectUsuarios.options[selectUsuarios.selectedIndex];
                    // Reconstruct the full user object from the dataset
                    const usuarioCompleto = {
                        id: selectedOption.value,
                        nombre: selectedOption.textContent,
                        cuit: selectedOption.dataset.cuit,
                        cuil: selectedOption.dataset.cuil,
                        claveAFIP: selectedOption.dataset.claveAFIP, // Read new key
                        claveATM: selectedOption.dataset.claveATM,   // Read new key
                        tipoContribuyente: selectedOption.dataset.tipoContribuyente,
                        nombreSolo: selectedOption.dataset.nombre,
                        apellido: selectedOption.dataset.apellido,
                        empresasDisponibles: selectedOption.dataset.empresasDisponibles ?
                            JSON.parse(selectedOption.dataset.empresasDisponibles) : []
                    };

                    seleccionarUsuario(usuarioCompleto);
                }
            });
            selectorListenerAgregado = true;
        }

    } catch (error) {
        console.error('Error cargando usuarios:', error);
        selectUsuarios.innerHTML = '<option value="">Error cargando usuarios</option>';
        selectUsuarios.disabled = false;
    }
}
*/

/**
 * Establece el usuario seleccionado y muestra los módulos AFIP
 * @param {Object} usuarioCompleto - Objeto con todos los datos del usuario
 */
function seleccionarUsuario(usuarioCompleto) {
    // Detectar si realmente CAMBIÓ el cliente (id distinto al anterior). La 1ra
    // selección (idAnterior === null) no cuenta como cambio: no hay nada que limpiar.
    const idAnterior = usuarioSeleccionado ? String(usuarioSeleccionado.id) : null;
    const idNuevo = usuarioCompleto ? String(usuarioCompleto.id) : null;
    const cambioDeCliente = idAnterior !== null && idAnterior !== idNuevo;

    // Guardar usuario en variables globales
    usuarioSeleccionado = usuarioCompleto;
    window.usuarioSeleccionado = usuarioSeleccionado; // Para compatibilidad con otros módulos

    // Si cambió de cliente, cerrar/vaciar los paneles AFIP para no arrastrar datos
    // del cliente anterior (se reconstruyen al reabrirlos con el cliente nuevo).
    if (cambioDeCliente) {
        limpiarPanelesAfip();
    }

    // Ejecutar el callback definido al entrar al selector de usuario (AFIP o ATM)
    if (typeof onUsuarioSeleccionado === 'function') {
        onUsuarioSeleccionado();
    }

    // Actualizar la información del usuario mostrada
    actualizarUIConNuevoUsuario();
}

/**
 * Muestra la interface de módulos AFIP y oculta el selector de usuario
 */
function mostrarModulosAfip() {
    mostrarSoloModulo('modulosAfipDiv'); // Usar la función centralizada para mostrar el módulo

    // Inicializar módulos AFIP solo la primera vez
    if (!modulosAfipCargados) {
        inicializarModulosAfip();
        modulosAfipCargados = true;
    }

    mostrarUsuarioSeleccionado(); // Mostrar información del usuario activo
}

/**
 * Actualiza la UI de todos los módulos con el nuevo usuario seleccionado
 */
function actualizarUIConNuevoUsuario() {
    // Actualizar badge de usuario activo
    mostrarUsuarioSeleccionado();

    // Reflejar el usuario activo en el navbar
    if (typeof window.actualizarNavbarUsuario === 'function' && usuarioSeleccionado) {
        window.actualizarNavbarUsuario(capitalizarNombre(usuarioSeleccionado.nombre));
    }

    // Actualizar módulo de facturas si está cargado
    if (typeof window.configurarUsuarioEnFacturas === 'function') {
        window.configurarUsuarioEnFacturas();
    }

    if (typeof window.configurarEmpresasDisponibles === 'function') {
        window.configurarEmpresasDisponibles();
    }

    // Actualizar módulo de facturas tipificadas si está cargado
    if (typeof window.mostrarInfoUsuario === 'function') {
        window.mostrarInfoUsuario();
    }

    // Actualizar módulo de MercadoPago si está cargado
    if (window.configurarUsuarioMercadoPago && typeof window.configurarUsuarioMercadoPago === 'function') {
        window.configurarUsuarioMercadoPago(window.usuarioSeleccionado);
    }
}

/**
 * Muestra la información del usuario seleccionado con opción para cambiarlo
 */
function mostrarUsuarioSeleccionado() {
    const infoUsuarioDiv = document.getElementById('infoUsuarioSeleccionado');

    if (infoUsuarioDiv && usuarioSeleccionado) {
        const nombreCapitalizado = capitalizarNombre(usuarioSeleccionado.nombre);

        infoUsuarioDiv.innerHTML = `
            <div class="usuario-seleccionado">
                <span>Usuario activo: <strong>${nombreCapitalizado}</strong></span>
                <button id="btnCambiarUsuario" class="btn-secundario">Cambiar Usuario</button>
            </div>
        `;

        // Configurar botón para cambiar usuario
        const btnCambiarUsuario = document.getElementById('btnCambiarUsuario');
        if (btnCambiarUsuario) {
            btnCambiarUsuario.addEventListener('click', () => {
                mostrarSelectorUsuario();
            });
        }
    }
}

// ========================================
// INICIALIZACIÓN DE MÓDULOS AFIP
// ========================================

/**
 * Inicializa todos los módulos específicos de AFIP
 */
function inicializarModulosAfip() {
    inicializarInterfazFacturas(); // Módulo de facturas
    inicializarFacturasTipificadasModulo(); // Módulo de facturas tipificadas
    inicializarMercadoPago();      // Módulo de MercadoPago
    inicializarLibroIVA();         // Módulo de Libro IVA
}

/**
 * Inicializa todos los módulos específicos de ATM
 */
function inicializarModulosATM() {
    // Aquí puedes inicializar los módulos específicos de ATM
    // Por ejemplo: inicializarInterfazATM(), inicializarReportesATM(), etc.
    console.log('Inicializando módulos ATM...');
    // inicializarInterfazATM();
    // inicializarReportesATM(); 
    // inicializarConfiguracionATM();
}

/**
 * Obtiene la ruta base del script actual para cargar recursos relativos
 * @returns {string} Ruta base
 */
function obtenerRutaBase() {
    const scriptActual = document.currentScript || document.querySelector('script[src*="controlador"]');
    if (scriptActual && scriptActual.src) {
        const rutaScript = scriptActual.src;
        return rutaScript.substring(0, rutaScript.lastIndexOf('/') + 1);
    }
    return window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
}

/**
 * Inicializa el módulo de MercadoPago con carga dinámica
 */
function inicializarMercadoPago() {
    const btnLectorMP = document.getElementById('btnLectorMP');
    const lectorMPDiv = document.getElementById('leerMercadoPagoDiv');

    if (btnLectorMP && lectorMPDiv) {
        btnLectorMP.addEventListener('click', async () => {
            try {
                // Toggle: si ya está visible, ocultarlo
                if (!lectorMPDiv.classList.contains('contenido-oculto')) {
                    lectorMPDiv.classList.add('contenido-oculto');
                    return;
                }

                // Cargar contenido del módulo
                const rutaBase = obtenerRutaBase();
                const htmlPath = rutaBase + './leerMercadoPago/mercadoPago_leer.html';
                const response = await fetch(htmlPath);
                const html = await response.text();

                // Insertar HTML y mostrar módulo
                lectorMPDiv.innerHTML = html;
                lectorMPDiv.classList.remove('contenido-oculto');

                // Cargar JavaScript del módulo
                const script = document.createElement('script');
                script.type = 'module';
                script.src = rutaBase + './leerMercadoPago/mercadoPago.js';

                script.onload = () => {
                    // Configurar usuario una vez cargado el script
                    if (window.configurarUsuarioMercadoPago && window.usuarioSeleccionado) {
                        window.configurarUsuarioMercadoPago(window.usuarioSeleccionado);
                    }

                    // Inicializar selector de fechas si está disponible
                    const fechaComprobanteMP = document.getElementById('fechaComprobanteMP');
                    if (fechaComprobanteMP && typeof flatpickr !== 'undefined') {
                        flatpickr(fechaComprobanteMP, {
                            mode: "single",
                            dateFormat: "d/m/Y"
                        });
                    }
                };

                document.head.appendChild(script);

            } catch (error) {
                console.error('Error cargando módulo MercadoPago:', error);
                lectorMPDiv.innerHTML = '<p>Error cargando el componente</p>';
            }
        });
    }
}

/**
 * Inicializa el módulo de Libro IVA con carga dinámica
 */
function inicializarLibroIVA() {
    const btnLibroIVA = document.getElementById('btnLibroIVA');
    const libroIvaDiv = document.getElementById('libroIvaDiv');

    if (btnLibroIVA && libroIvaDiv) {
        btnLibroIVA.addEventListener('click', async () => {
            try {
                // Toggle: si ya está visible, ocultarlo y limpiar
                if (!libroIvaDiv.classList.contains('contenido-oculto')) {
                    libroIvaDiv.classList.add('contenido-oculto');
                    libroIvaDiv.innerHTML = '';
                    return;
                }

                // Cargar HTML del módulo
                const response = await fetch('../libroIVA/libroIVA.html');
                const html = await response.text();
                libroIvaDiv.innerHTML = html;
                libroIvaDiv.classList.remove('contenido-oculto');

                // Cargar JavaScript del módulo si no está presente
                const scriptPath = '../libroIVA/inicializarLibroIVA.js';
                if (!document.head.querySelector(`script[src="${scriptPath}"]`)) {
                    const script = document.createElement('script');
                    script.src = scriptPath;
                    script.defer = true;
                    document.head.appendChild(script);
                }

            } catch (error) {
                console.error('Error cargando módulo Libro IVA:', error);
                libroIvaDiv.innerHTML = '<p>Error cargando el componente Libro IVA</p>';
            }
        });
    }
}

/**
 * Inicializa el módulo de Facturas Tipificadas con carga dinámica
 */
function inicializarFacturasTipificadasModulo() {
    const btnFacturasTipificadas = document.getElementById('btnFacturasTipificadas');
    const facturasTipificadasDiv = document.getElementById('facturasTipificadasDiv');

    if (btnFacturasTipificadas && facturasTipificadasDiv) {
        btnFacturasTipificadas.addEventListener('click', async () => {
            try {
                // Toggle: si ya está visible, ocultarlo y limpiar
                if (!facturasTipificadasDiv.classList.contains('contenido-oculto')) {
                    facturasTipificadasDiv.classList.add('contenido-oculto');
                    facturasTipificadasDiv.innerHTML = '';
                    return;
                }

                // Ocultar otros submódulos
                ocultarSubmodulos();

                // Cargar HTML del módulo
                const htmlPath = '../facturaTipificada/facturaTipificada.html';
                const response = await fetch(htmlPath);
                if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
                const html = await response.text();
                facturasTipificadasDiv.innerHTML = html;
                facturasTipificadasDiv.classList.remove('contenido-oculto');

                // Cargar CSS del módulo si no está presente
                const cssPath = '../facturaTipificada/facturaTipificada.css';
                if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                    const cssLink = document.createElement('link');
                    cssLink.rel = 'stylesheet';
                    cssLink.href = cssPath;
                    document.head.appendChild(cssLink);
                    console.log('✅ CSS de Facturas Tipificadas cargado');
                }

                // Cargar CSS del componente SelectorUsuarios si no está presente
                const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
                if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
                    const selectorCssLink = document.createElement('link');
                    selectorCssLink.rel = 'stylesheet';
                    selectorCssLink.href = selectorCssPath;
                    document.head.appendChild(selectorCssLink);
                    console.log('✅ CSS de SelectorUsuarios cargado');
                }

                // Cargar JS del componente SelectorUsuarios primero
                const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';
                const cargarSelectorScript = () => {
                    return new Promise((resolve, reject) => {
                        // Verificar si ya está cargado
                        if (typeof SelectorUsuarios !== 'undefined') {
                            resolve();
                            return;
                        }

                        const oldSelectorScript = document.head.querySelector(`script[src="${selectorJsPath}"]`);
                        if (oldSelectorScript) oldSelectorScript.remove();

                        const selectorScript = document.createElement('script');
                        selectorScript.src = selectorJsPath;
                        selectorScript.defer = true;
                        selectorScript.onload = () => {
                            console.log('✅ SelectorUsuarios.js cargado');
                            resolve();
                        };
                        selectorScript.onerror = () => reject(new Error('Error al cargar SelectorUsuarios.js'));
                        document.head.appendChild(selectorScript);
                    });
                };

                await cargarSelectorScript();

                // Cargar JavaScript del módulo
                const jsPath = '../facturaTipificada/facturaTipificada.js';
                const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
                if (oldScript) oldScript.remove();

                const script = document.createElement('script');
                script.src = jsPath;
                script.defer = true;
                script.onload = () => {
                    console.log('✅ facturaTipificada.js cargado');
                    // Inicializar el módulo
                    if (window.inicializarFacturasTipificadas) {
                        window.inicializarFacturasTipificadas();
                    } else {
                        console.error('❌ window.inicializarFacturasTipificadas no está definida');
                    }
                };
                document.head.appendChild(script);

            } catch (error) {
                console.error('❌ Error cargando módulo Facturas Tipificadas:', error);
                facturasTipificadasDiv.innerHTML = '<div style="color:red;">Error cargando el módulo de Facturas Tipificadas.</div>';
            }
        });
    }
}

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

/**
 * Obtiene el usuario actualmente seleccionado
 * @returns {Object|null} Usuario seleccionado o null
 */
function obtenerUsuarioSeleccionado() {
    return usuarioSeleccionado;
}

/**
 * Obtiene lista completa de usuarios desde la base de datos
 * @returns {Array} Array de usuarios formateados
 */
async function obtenerUsuarios() {
    try {
        const result = await window.electronAPI.user.getAll();
        if (result.success && Array.isArray(result.users)) {
            return result.users.map(user => ({
                id: user.id,
                nombre: `${user.nombre} ${user.apellido || ''}`.trim(),
                cuit: user.cuit || '',
                cuil: user.cuil || '',
                tipoContribuyente: user.tipoContribuyente || '',
                clave: user.clave || '',
                datosOriginales: user // Mantener datos originales por compatibilidad
            }));
        }
        return [];
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        return [];
    }
}

// Exportar funciones para uso en otros módulos
window.obtenerUsuarioSeleccionado = obtenerUsuarioSeleccionado;