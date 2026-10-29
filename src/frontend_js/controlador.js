import { inicializarVistaFacturacion } from './facturas/interfazFacturas.js';
import { inicializarVistaMercadoPago } from './leerMercadoPago/mercadoPago.js';
// Deja window.pdvOfrecibles para Factura Tipificada (script clásico, no puede importar).
import './facturas/pdvOfrecibles.js';

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
    ['portadaDiv', 'generarVEPDiv', 'facturacionDiv', 'facturaTipificadaDiv', 'facturaExcelDiv', 'mercadoPagoDiv', 'planesDePagoDiv', 'datosRegistralesDiv', 'ddjjPendientesDiv', 'importarLibroIvaDiv', 'cuentaTributariaDiv', 'consultaComprobantesDiv', 'declaracionJuradaDiv', 'historialDiv', 'plantillasExcelDiv'].forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.classList.add('contenido-oculto');
    });

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
    facturacion: { modulo: 'facturacionDiv', cargar: cargarModuloFacturacion },
    facturaTipificada: { modulo: 'facturaTipificadaDiv', cargar: cargarModuloFacturaTipificada },
    facturaExcel: { modulo: 'facturaExcelDiv', cargar: cargarModuloFacturaExcel },
    mercadoPago: { modulo: 'mercadoPagoDiv', cargar: cargarModuloMercadoPago },
    planesDePago: { modulo: 'planesDePagoDiv', cargar: cargarModuloPlanesDePago },
    datosRegistrales: { modulo: 'datosRegistralesDiv', cargar: cargarModuloDatosRegistrales },
    ddjjPendientes: { modulo: 'ddjjPendientesDiv', cargar: cargarModuloDdjjPendientes },
    importarLibroIva: { modulo: 'importarLibroIvaDiv', cargar: cargarModuloImportarLibroIva },
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

    document.addEventListener('cargarModuloFactura', () => navegarVista('facturacion'));

    document.addEventListener('cargarModuloPlanesDePago', () => navegarVista('planesDePago'));

    document.addEventListener('cargarModuloCuentaTributaria', () => navegarVista('cuentaTributaria'));

    document.addEventListener('cargarModuloConsultaComprobantes', () => navegarVista('consultaComprobantes'));

    document.addEventListener('cargarModuloDeclaracionJurada', () => navegarVista('declaracionJurada'));

    document.addEventListener('cargarModuloDatosRegistrales', () => navegarVista('datosRegistrales'));

    document.addEventListener('cargarModuloDdjjPendientes', () => navegarVista('ddjjPendientes'));

    document.addEventListener('cargarModuloImportarLibroIva', () => navegarVista('importarLibroIva'));
});

// ========================================
// CALLBACKS DE CARGA PARA CADA MÓDULO
// ========================================

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

            // Cargar JS del componente genérico primero (una sola vez: la clase
            // queda declarada global y reinyectarlo tira "already been declared")
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
            console.log('✅ Script componente genérico listo');

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
 * Carga el módulo de Facturación (selector de cliente embebido; el formulario
 * aparece debajo al elegirlo). interfazFacturas.js es un módulo ES importado
 * arriba: no se re-inyecta, solo se inicializa la vista.
 */
async function cargarModuloFacturacion() {
    mostrarSoloModulo('facturacionDiv');
    const div = document.getElementById('facturacionDiv');
    if (!div) return;
    div.innerHTML = '';

    try {
        const htmlPath = '../facturas/factura.html';
        const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // 1. HTML
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        div.innerHTML = await response.text();

        // 2. CSS componente SelectorUsuarios
        if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = selectorCssPath;
            document.head.appendChild(l);
        }

        // 3. JS componente SelectorUsuarios
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

        // 4. Vista
        inicializarVistaFacturacion();

    } catch (error) {
        console.error('❌ Error cargando módulo Facturación:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de Facturación.</div>';
    }
}

/**
 * Carga el módulo de Facturas Tipificadas (selector de cliente embebido).
 * Mismo patrón que Declaración Jurada: HTML, CSS, SelectorUsuarios y el JS del módulo.
 */
async function cargarModuloFacturaTipificada() {
    mostrarSoloModulo('facturaTipificadaDiv');
    const div = document.getElementById('facturaTipificadaDiv');
    if (!div) return;
    div.innerHTML = '';

    try {
        const htmlPath = '../facturaTipificada/facturaTipificada.html';
        const cssPath = '../facturaTipificada/facturaTipificada.css';
        const jsPath = '../facturaTipificada/facturaTipificada.js';
        const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // 1. HTML
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        div.innerHTML = await response.text();

        // 2. CSS del módulo y del componente SelectorUsuarios
        [cssPath, selectorCssPath].forEach(href => {
            if (document.head.querySelector(`link[href="${href}"]`)) return;
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            document.head.appendChild(l);
        });

        // 3. JS componente SelectorUsuarios (asegurar carga antes del módulo)
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

        // 4. JS del módulo (re-cargar siempre para que la inicialización corra cada vez)
        const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
        if (oldScript) oldScript.remove();
        const script = document.createElement('script');
        script.src = jsPath;
        script.defer = true;
        script.onload = () => {
            if (typeof window.inicializarVistaTipificada === 'function') {
                window.inicializarVistaTipificada();
            } else {
                console.error('❌ window.inicializarVistaTipificada no está definida');
            }
        };
        document.head.appendChild(script);

    } catch (error) {
        console.error('❌ Error cargando módulo Facturas Tipificadas:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de Facturas Tipificadas.</div>';
    }
}

/**
 * Carga Facturar desde Excel (selector de cliente embebido). Mismo patrón que
 * Facturas Tipificadas: HTML, CSS, SelectorUsuarios y el JS del módulo.
 */
async function cargarModuloFacturaExcel() {
    mostrarSoloModulo('facturaExcelDiv');
    const div = document.getElementById('facturaExcelDiv');
    if (!div) return;
    div.innerHTML = '';

    try {
        const base = '../facturaExcel/facturaExcel';
        const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        const response = await fetch(`${base}.html`);
        if (!response.ok) throw new Error(`Error al cargar ${base}.html`);
        div.innerHTML = await response.text();

        [`${base}.css`, '../componentes/selectorUsuarios/selectorUsuarios.css'].forEach(href => {
            if (document.head.querySelector(`link[href="${href}"]`)) return;
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            document.head.appendChild(l);
        });

        await new Promise((resolve, reject) => {
            if (typeof SelectorUsuarios !== 'undefined') return resolve();
            const s = document.createElement('script');
            s.src = selectorJsPath;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Error cargando selectorUsuarios.js'));
            document.head.appendChild(s);
        });

        // Re-cargar siempre: el módulo se arma de cero en cada entrada.
        document.head.querySelector(`script[src="${base}.js"]`)?.remove();
        const script = document.createElement('script');
        script.src = `${base}.js`;
        script.onload = () => window.inicializarVistaFacturaExcel();
        document.head.appendChild(script);
    } catch (error) {
        console.error('❌ Error cargando Facturar desde Excel:', error);
        div.innerHTML = '<div style="color:red;">Error cargando Facturar desde Excel.</div>';
    }
}

/**
 * Carga el módulo Lector Mercado Pago (selector de cliente embebido).
 * mercadoPago.js es un módulo ES importado arriba (igual que Facturación).
 */
async function cargarModuloMercadoPago() {
    mostrarSoloModulo('mercadoPagoDiv');
    const div = document.getElementById('mercadoPagoDiv');
    if (!div) return;
    div.innerHTML = '';

    try {
        const htmlPath = '../leerMercadoPago/mercadoPago_leer.html';
        const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

        // 1. HTML
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
        div.innerHTML = await response.text();

        // 2. CSS componente SelectorUsuarios (el del módulo lo inyecta mercadoPago.js)
        if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = selectorCssPath;
            document.head.appendChild(l);
        }

        // 3. JS componente SelectorUsuarios
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

        // 4. Vista
        inicializarVistaMercadoPago();

    } catch (error) {
        console.error('❌ Error cargando módulo Mercado Pago:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de Mercado Pago.</div>';
    }
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
 * Carga el módulo de Datos registrales (selector de contribuyentes embebido).
 * Mismo patrón que Planes de Pago: CSS+JS del SelectorUsuarios, luego HTML/CSS/JS del módulo.
 */
async function cargarModuloDatosRegistrales() {
    mostrarSoloModulo('datosRegistralesDiv');
    const div = document.getElementById('datosRegistralesDiv');
    if (!div) return;
    div.innerHTML = '';

    const agregarCss = (href) => {
        if (document.head.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    };
    const cargarScript = (src, { recargar = false } = {}) => new Promise((resolve, reject) => {
        const viejo = document.head.querySelector(`script[src="${src}"]`);
        if (viejo && !recargar) { resolve(); return; }
        if (viejo) viejo.remove();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Error al cargar ${src}`));
        document.head.appendChild(script);
    });

    try {
        agregarCss('../componentes/selectorUsuarios/selectorUsuarios.css');
        agregarCss('../datosRegistrales/datos_registrales.css');

        const response = await fetch('../datosRegistrales/datos_registrales.html');
        if (!response.ok) throw new Error('Error al cargar datos_registrales.html');
        div.innerHTML = await response.text();

        if (typeof SelectorUsuarios === 'undefined') {
            await cargarScript('../componentes/selectorUsuarios/selectorUsuarios.js');
        }
        await cargarScript('../datosRegistrales/datos_registrales.js', { recargar: true });
        if (window.inicializarModuloDatosRegistrales) window.inicializarModuloDatosRegistrales();
    } catch (error) {
        console.error('Error cargando módulo Datos registrales:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de Datos registrales.</div>';
    }
}

/**
 * Carga el módulo de DDJJ pendientes (selector de contribuyentes embebido).
 * Mismo patrón que Planes de Pago: CSS+JS del SelectorUsuarios, luego HTML/CSS/JS del módulo.
 */
async function cargarModuloDdjjPendientes() {
    mostrarSoloModulo('ddjjPendientesDiv');
    const div = document.getElementById('ddjjPendientesDiv');
    if (!div) return;
    div.innerHTML = '';

    const agregarCss = (href) => {
        if (document.head.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    };
    const cargarScript = (src, { recargar = false } = {}) => new Promise((resolve, reject) => {
        const viejo = document.head.querySelector(`script[src="${src}"]`);
        if (viejo && !recargar) { resolve(); return; }
        if (viejo) viejo.remove();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Error al cargar ${src}`));
        document.head.appendChild(script);
    });

    try {
        agregarCss('../componentes/selectorUsuarios/selectorUsuarios.css');
        agregarCss('../ddjjPendientes/ddjj_pendientes.css');

        const response = await fetch('../ddjjPendientes/ddjj_pendientes.html');
        if (!response.ok) throw new Error('Error al cargar ddjj_pendientes.html');
        div.innerHTML = await response.text();

        if (typeof SelectorUsuarios === 'undefined') {
            await cargarScript('../componentes/selectorUsuarios/selectorUsuarios.js');
        }
        await cargarScript('../ddjjPendientes/ddjj_pendientes.js', { recargar: true });
        if (window.inicializarModuloDdjjPendientes) window.inicializarModuloDdjjPendientes();
    } catch (error) {
        console.error('Error cargando módulo DDJJ pendientes:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de DDJJ pendientes.</div>';
    }
}

/**
 * Carga el módulo de Importar Libro IVA (selector de contribuyentes embebido).
 * Mismo patrón que Planes de Pago: CSS+JS del SelectorUsuarios, luego HTML/CSS/JS del módulo.
 */
async function cargarModuloImportarLibroIva() {
    mostrarSoloModulo('importarLibroIvaDiv');
    const div = document.getElementById('importarLibroIvaDiv');
    if (!div) return;
    div.innerHTML = '';

    const agregarCss = (href) => {
        if (document.head.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    };
    const cargarScript = (src, { recargar = false } = {}) => new Promise((resolve, reject) => {
        const viejo = document.head.querySelector(`script[src="${src}"]`);
        if (viejo && !recargar) { resolve(); return; }
        if (viejo) viejo.remove();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Error al cargar ${src}`));
        document.head.appendChild(script);
    });

    try {
        agregarCss('../componentes/selectorUsuarios/selectorUsuarios.css');
        agregarCss('../importarLibroIva/importar_libro_iva.css');

        const response = await fetch('../importarLibroIva/importar_libro_iva.html');
        if (!response.ok) throw new Error('Error al cargar importar_libro_iva.html');
        div.innerHTML = await response.text();

        if (typeof SelectorUsuarios === 'undefined') {
            await cargarScript('../componentes/selectorUsuarios/selectorUsuarios.js');
        }
        await cargarScript('../importarLibroIva/importar_libro_iva.js', { recargar: true });
        if (window.inicializarModuloImportarLibroIva) window.inicializarModuloImportarLibroIva();
    } catch (error) {
        console.error('Error cargando módulo Portal IVA:', error);
        div.innerHTML = '<div style="color:red;">Error cargando el módulo de Portal IVA.</div>';
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
// FUNCIONES DE UTILIDAD
// ========================================

/**
 * Obtiene el usuario actualmente seleccionado
 * @returns {Object|null} Usuario seleccionado o null
 */
function obtenerUsuarioSeleccionado() {
    return window.usuarioSeleccionado || null;
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