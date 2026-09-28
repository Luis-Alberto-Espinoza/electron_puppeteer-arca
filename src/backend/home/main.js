const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
// comunicacionConFactura y facturaManager movidos a afip/factura/handlers.js
// comunicacionConLibroIVA movido a afip/libroIVA/handlers.js
const { screen } = require('electron'); // Necesitamos el módulo 'screen'
const fs = require('fs');

// vepManager movido a afip/vep/handlers.js
// consultaDeudaManager movido a afip/consultaDeuda/handlers.js
// manejarEventoATM movido a atm/handlers.js

// Importar los handlers de usuario modularizados
const setupUserHandlers = require('../cliente/handlers.js');
const setupGruposHandlers = require('../cliente/grupos/handlers.js');
const setupContribuyenteHandlers = require('../cliente/contribuyenteHandlers.js');
const setupMercadoPagoHandlers = require('../afip/extraerDemercadoPago/handlers.js');

// Importar handlers de AFIP por dominio
const setupFacturaHandlers = require('../afip/factura/handlers.js');
const setupVepHandlers = require('../afip/vep/handlers.js');
const setupConsultaDeudaHandlers = require('../afip/consultaDeuda/handlers.js');
const setupConsultaComprobantesHandlers = require('../afip/consultaComprobantes/handlers.js');
const setupNotaCreditoDebitoHandlers = require('../afip/notaCreditoDebito/handlers.js');
const setupEmpresaHandlers              = require('../afip/empresa/handlers.js');
const setupCuentaTributariaHandlers = require('../afip/cuentaTributaria/handlers.js');
const setupDeclaracionJuradaHandlers = require('../afip/declaracionJurada/handlers.js');
const setupLibroIvaHandlers = require('../afip/libroIVA/handlers.js');
const setupSesionAfipHandlers = require('../afip/sesion/handlers.js');

// Importar handlers de ATM por servicio
const setupConstanciaFiscalHandlers = require('../atm/constanciaFiscal/handlers.js');
const setupPlanDePagoHandlers = require('../atm/planDePago/handlers.js');
const setupRetencionesHandlers = require('../atm/retenciones/handlers.js');
const setupTasaCeroHandlers = require('../atm/tasaCero/handlers.js');
const setupListasATMHandlers = require('../atm/listas/handlers.js');
const setupSesionAtmHandlers = require('../atm/sesion/handlers.js');

// Importar handlers de Planes de Pago AFIP
const setupPlanesDePagoHandlers = require('../afip/planesDePago/handlers.js');
const setupListasPlanesPagoHandlers = require('../afip/planesDePago/handlers_listas.js');

// Historial de acciones (bitacora persistente, un solo usuario)
const setupHistorialHandlers = require('../historial/handlers.js');

// Plantillas Excel (transformar el Excel original de un cliente en el archivo que hace falta)
const setupPlantillasExcelHandlers = require('../plantillasExcel/handlers.js');

// Extraer Tablas PDF (motor copiado de tablas_pdf_a_csv)
const setupTablasPdfHandlers = require('../tablasPdf/handlers.js');

// Carpeta de datos (ver/cambiar dónde viven los .json) — Fase 2
const setupDatosHandlers = require('../comun/handlers.js');

// Importar la nueva función de carga masiva
const { procesarArchivoUsuarios } = require('../cliente/service/cargaMasiva.js');
const { generarPlantillaClientes, generarExcelContribuyentes } = require('../cliente/service/plantillaCargaMasiva.js');
const { getContribuyenteRepo } = require('../cliente/contribuyenteStore.js');
const { gruposManager } = require('../cliente/grupos/gruposManager.js');

// Lanzador de navegador y verificador de ATM para la validación manual
const { launchBrowserAndPage } = require('../puppeteer/archivos_comunes/navegador/browserLauncher');
const verificarCredencialesATM = require('../puppeteer/atm/flujosDeTareas/flujo_verificaCredenciales_atm');


// importar sistema de credenciales
const verificarYObtenerDatosAFIP = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales_AFIP');      

let mainWindow;
let puppeteerWindow;
// Variables de factura movidas a afip/factura/handlers.js:
// resultadoCodigo, usuarioSeleccionado, empresaElegida, ultimaEmpresaElegida

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Dimensiones basadas en tus medidas actuales, llevadas a estándar
    const windowWidth = 800;   // Tu ancho actual (mínimo)
    const windowHeight = 650;   // Tu alto actual

    // Centrar la ventana
    const x = Math.floor((width - windowWidth) / 2);
    const y = Math.floor((height - windowHeight) / 2);

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: x,
        y: y,
        minWidth: 600,     // Más estrecha si es necesario  
        minHeight: 400,
        resizable: true,   // Permitir redimensionar si es necesario
        webPreferences: {
            preload: path.join(__dirname, '../../../preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: false,  // Cambiado a false para permitir require
            experimentalFeatures: false
        }
    });

    mainWindow.loadFile('src/frontend_js/home/index.html');

    // Ctrl+Shift+R: recarga COMPLETA de la ventana (vuelve al inicio y descarta
    // todo el estado en memoria). Es a propósito: sirve para limpiar el cliente/
    // servicio anterior que queda "pegado". Lo hacemos explícito con
    // reloadIgnoringCache para no depender del acelerador del menú nativo.
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.control && input.shift && input.code === 'KeyR') {
            event.preventDefault();
            mainWindow.webContents.reloadIgnoringCache();
        }
    });

    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.show();

        // COMENTADO: DevTools deshabilitadas para producción
        // mainWindow.webContents.openDevTools({ mode: 'right' });

        // Devolver el foco a la aplicación principal
        setTimeout(() => {
            mainWindow.focus();
            mainWindow.webContents.focus();

            setTimeout(() => {
                mainWindow.show();
                mainWindow.focus();
            }, 100);
        }, 300);
    });
}

function createPuppeteerWindow() {
    console.log('Intentando crear ventana de Puppeteer...');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const puppeteerWindow = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        frame: true,
        fullscreen: false,
        show: false,
        title: 'AFIP - Automatización',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            devTools: false
        }
    });

    // Cambia la ruta a absoluta si es necesario
    const puppeteerHtmlPath = path.join(__dirname, '../../frontend_js/puppeteer/index.html');
    console.log('Cargando archivo HTML de Puppeteer:', puppeteerHtmlPath);
    puppeteerWindow.loadFile(puppeteerHtmlPath);

    puppeteerWindow.once('ready-to-show', () => {
        puppeteerWindow.show();
        console.log('Ventana de Puppeteer mostrada');
    });

    puppeteerWindow.on('closed', () => {
        console.log('✅ Ventana de Puppeteer cerrada correctamente');
        puppeteerWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('puppeteer-window-closed');
        }
    });

    puppeteerWindow.on('close', (event) => {
        console.log('🔄 Cerrando ventana de Puppeteer...');
    });

    return puppeteerWindow;
}

function createImageWindow(imagePath) {
    const imageWindow = new BrowserWindow({
        width: 300,
        height: 400,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    imageWindow.loadFile(imagePath);

    // Manejar cierre de ventana de imagen
    imageWindow.on('closed', () => {
        console.log('Ventana de imagen cerrada');
    });
}

// Agregar el handle para IPC
ipcMain.handle('show-screenshot', async (event, imagePath) => {
    createImageWindow(imagePath);
});

// Función para obtener la ventana de Puppeteer (para usar en facturaManager)
function getPuppeteerWindow() {
    return puppeteerWindow;
}

// Exportar la función si facturaManager la necesita
module.exports = { getPuppeteerWindow };

function setupIpcListeners() {
    // Handlers de factura movidos a: afip/factura/handlers.js
    // Handlers de libroIVA movidos a: afip/libroIVA/handlers.js

    ipcMain.on('procesar-pdf', async (event, filePath) => {
        try {
            const resultados = `Resultados del procesamiento de ${filePath}`;

            event.reply('resultados-pdf', { success: true, resultados });
        } catch (error) {
            console.error('Error al procesar el PDF:', error);
            event.reply('resultados-pdf', { success: false, error: error.message });
        }
    });

    ipcMain.on('exportar-resultados', async (event, resultados) => {
        try {
            event.reply('resultados-exportados', { success: true, message: 'Resultados exportados correctamente' });
        } catch (error) {
            console.error('Error al exportar resultados:', error);
            event.reply('resultados-exportados', { success: false, error: error.message });
        }
    });

    // Handler exclusivo para verificación de credenciales
    ipcMain.handle('user:verifyCredentials', async (event, credenciales) => {
        let browser;
        console.log('[Verificación Manual] Iniciando para CUIT:', credenciales.cuit || credenciales.cuil);

        try {
            const { browser: b, page } = await launchBrowserAndPage({ headless: true });
            browser = b;

            let finalResult = {
                success: false, // Será true si CUALQUIER credencial es válida
                empresas: [],
                empresasDisponible: [], // alias retrocompat
                cuitAsociados: [],
                error: null
            };

            // --- Verificación AFIP ---
            if (credenciales.claveAFIP) {
                console.log('[Verificación Manual] Verificando credenciales de AFIP...');
                const afipResult = await verificarYObtenerDatosAFIP(page, credenciales);
                if (afipResult.success) {
                    finalResult.success = true;
                    const empresas = afipResult.data.empresasArray || [];
                    finalResult.empresas = empresas;
                    finalResult.empresasDisponible = empresas; // alias retrocompat
                    finalResult.cuitAsociados = afipResult.data.cuitAsociados || [];
                    console.log('[Verificación Manual] AFIP: Éxito.');
                } else {
                    finalResult.error = afipResult.error || 'Credenciales AFIP inválidas.';
                    console.log('[Verificación Manual] AFIP: Fallo.');
                }
            }

            // --- Verificación ATM ---
            if (credenciales.claveATM) {
                console.log('[Verificación Manual] Verificando credenciales de ATM...');
                const atmPage = await browser.newPage();
                const cuit = credenciales.cuit || credenciales.cuil;
                const atmResult = await verificarCredencialesATM(atmPage, cuit, credenciales.claveATM);
                await atmPage.close();

                if (atmResult.success) {
                    finalResult.success = true; // Si ATM es válido, el resultado general es un éxito
                    console.log('[Verificación Manual] ATM: Éxito.');
                } else if (!finalResult.success) { // Solo registrar error de ATM si AFIP no fue exitoso o no se probó
                    finalResult.error = atmResult.message || 'Credenciales ATM inválidas.';
                    console.log('[Verificación Manual] ATM: Fallo.');
                }
            }

            console.log('[Verificación Manual] Verificación completada. Resultado:', finalResult);
            return finalResult;

        } catch (error) {
            console.error('❌ Error catastrófico en la verificación manual:', error);
            return { success: false, error: error.message || 'Error inesperado en la verificación.' };
        } finally {
            if (browser) {
                await browser.close();
                console.log('[Verificación Manual] Navegador cerrado.');
            }
        }
    });

    ipcMain.handle('abrir-archivo', async (_event, rutaArchivo) => {
        try {
            await shell.openPath(rutaArchivo);
            return true;
        } catch (err) {
            return false;
        }
    });

    ipcMain.handle('shell:open-directory', async (event, path) => {
        try {
            // showItemInFolder funciona tanto para archivos como para carpetas
            // - Archivo: abre la carpeta contenedora y selecciona el archivo
            // - Carpeta: abre la carpeta (comportamiento según el SO)
            shell.showItemInFolder(path);
            return { success: true };
        } catch (error) {
            console.error(`Failed to show item in folder: ${path}`, error);
            return { success: false, error: error.message };
        }
    });
}

// Main app initialization
app.whenReady().then(async () => {
    try {
        console.log('🚀 Iniciando aplicación...');

        // Create window
        createWindow();
        console.log('✅ Ventana creada');

        // Setup handlers and listeners
        setupUserHandlers(ipcMain, mainWindow, dialog);
        setupGruposHandlers(ipcMain);
        setupContribuyenteHandlers(ipcMain); // modelo plano (listar, sin claves)
        setupDatosHandlers(ipcMain, app, dialog); // carpeta de datos (Fase 2)
        setupMercadoPagoHandlers(ipcMain, mainWindow, dialog);
        setupFacturaHandlers(ipcMain, mainWindow);
        setupVepHandlers(ipcMain, mainWindow, app);
        setupConsultaDeudaHandlers(ipcMain, app);
        setupConsultaComprobantesHandlers(ipcMain, app);
        setupNotaCreditoDebitoHandlers(ipcMain, app);
        setupEmpresaHandlers(ipcMain);
        setupCuentaTributariaHandlers(ipcMain, mainWindow, app);
        setupDeclaracionJuradaHandlers(ipcMain, app);
        setupLibroIvaHandlers(ipcMain);
        setupSesionAfipHandlers(ipcMain); // usa contribuyenteRepo (resolverAcceso)

        // Handlers de ATM por servicio
        setupConstanciaFiscalHandlers(ipcMain, mainWindow, app);
        setupPlanDePagoHandlers(ipcMain, mainWindow, app);
        setupRetencionesHandlers(ipcMain, mainWindow, app);
        setupTasaCeroHandlers(ipcMain, mainWindow, app);
        setupListasATMHandlers(ipcMain);
        setupSesionAtmHandlers(ipcMain); // usa contribuyenteRepo (resolverAcceso)

        // Handlers de Planes de Pago AFIP
        setupPlanesDePagoHandlers(ipcMain, mainWindow, app);
        setupListasPlanesPagoHandlers(ipcMain);

        setupHistorialHandlers(ipcMain); // bitacora de acciones (solo lectura desde el front)
        setupPlantillasExcelHandlers(ipcMain, mainWindow, dialog); // plantillas Excel (elegir archivo + procesar)
        setupTablasPdfHandlers(ipcMain, mainWindow, dialog); // herramienta Extraer Tablas PDF (motor copiado del hermano)

        // Handler para descargar el Excel modelo de carga masiva
        ipcMain.handle('descargar-plantilla-clientes', async () => {
            try {
                const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
                    title: 'Guardar modelo de carga de clientes',
                    defaultPath: 'modelo_carga_clientes.xlsx',
                    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
                });
                if (canceled || !filePath) return { success: false, canceled: true };

                fs.writeFileSync(filePath, generarPlantillaClientes());
                return { success: true, filePath };
            } catch (error) {
                console.error('Error generando el modelo de carga:', error);
                return { success: false, error: error.message };
            }
        });

        // Exportar clientes a Excel (proceso inverso a la carga masiva). Respeta el
        // filtro de estudio: si el frontend manda un grupoId, exporta SOLO ese estudio
        // (o los sin estudio con '__none__'); sin grupoId, exporta todos.
        // Va por el repo (no por contribuyente:listar) porque el archivo incluye las
        // claves, y listar las oculta a propósito.
        ipcMain.handle('exportar-clientes-excel', async (event, opciones = {}) => {
            try {
                const grupoId = opciones && opciones.grupoId ? opciones.grupoId : null;
                const grupos = gruposManager.listar();

                // Recorte por estudio + etiqueta para el nombre del archivo.
                const repo = getContribuyenteRepo();
                let contribuyentes = await repo.obtenerTodos();
                let etiqueta = '';
                if (grupoId === '__none__') {
                    contribuyentes = contribuyentes.filter(c => !c.grupoId);
                    etiqueta = 'SinEstudio';
                } else if (grupoId) {
                    contribuyentes = contribuyentes.filter(c => c.grupoId === grupoId);
                    const g = grupos.find(x => x.id === grupoId);
                    etiqueta = (g ? g.nombre : 'Estudio').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
                }

                const fecha = new Date().toISOString().slice(0, 10);
                const nombreArchivo = etiqueta
                    ? `clientes_${etiqueta}_${fecha}.xlsx`
                    : `clientes_${fecha}.xlsx`;
                const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
                    title: 'Exportar clientes a Excel',
                    defaultPath: nombreArchivo,
                    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
                });
                if (canceled || !filePath) return { success: false, canceled: true };

                fs.writeFileSync(filePath, generarExcelContribuyentes(contribuyentes, grupos));
                return { success: true, filePath, total: contribuyentes.length };
            } catch (error) {
                console.error('Error exportando clientes a Excel:', error);
                return { success: false, error: error.message };
            }
        });

        // Handler para la carga masiva de usuarios desde Excel
        ipcMain.handle('cargar-usuarios-masivo', async (event, fileBuffer) => {
            console.log(`[Debug Backend] IPC 'cargar-usuarios-masivo' recibido con datos.`);
            try {
                const resultado = await procesarArchivoUsuarios(fileBuffer);
                return resultado;
            } catch (error) {
                console.error('Error en el proceso de carga masiva (main.js):', error);
                return { 
                    success: false, 
                    errores: 1,
                    listaErrores: [{ fila: 'General', error: error.message }] 
                };
            }
        });

        setupIpcListeners(); // <--- asegúrate de que esta línea se ejecuta
    } catch (error) {
        console.error('❌ Error en inicialización:', error);
    }
});

// App event listeners

// Handler de VEP movido a: afip/vep/handlers.js
// Handler de consultaDeuda movido a: afip/consultaDeuda/handlers.js

// Handlers de facturas tipificadas y facturaCliente movidos a: afip/factura/handlers.js

// NOTE: El bloque de handlers de factura fue eliminado de aqui.
// Ver afip/factura/handlers.js para los handlers:
// - facturaTipificada:generar
// - facturaTipificada:generarLote
// - facturaCliente:generar

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
