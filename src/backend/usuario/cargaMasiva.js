
const xlsx = require('xlsx');
const { JsonStorage } = require('./usuario.js');
const { launchBrowserAndPage } = require('../puppeteer/browserLauncher');
const { gestionarValidacion } = require('../puppeteer/verificacionManager.js');

/**
 * Procesa un archivo Excel para la carga masiva de usuarios, validando
 * las credenciales a través de un manejador central.
 *
 * @param {Buffer} fileBuffer El buffer del archivo Excel.
 * @returns {Promise<object>} Un objeto con el resumen de la operación.
 */
async function procesarArchivoUsuarios(fileBuffer) {
    const storage = new JsonStorage();
    const stats = {
        usuariosLeidos: 0,
        usuariosCreados: 0,
        usuariosActualizados: 0,
        errores: 0,
        listaErrores: []
    };
    const usuariosAProcesar = [];

    try {
        // 1. Cargar y parsear el archivo Excel
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const usuariosDelExcel = xlsx.utils.sheet_to_json(sheet);
        console.log("Datos leídos del Excel:", usuariosDelExcel);

        stats.usuariosLeidos = usuariosDelExcel.length;
        if (stats.usuariosLeidos === 0) throw new Error("El archivo Excel está vacío.");

        // 2. Cargar usuarios existentes y preparar para procesamiento
        const data = storage.loadData();
        const usuariosExistentes = data.users || [];

        // 3. Iterar, crear/actualizar usuarios y recolectarlos para procesar
        for (const usuarioExcel of usuariosDelExcel) {
            const usuarioNormalizado = Object.keys(usuarioExcel).reduce((acc, key) => {
                acc[key.toLowerCase().trim()] = usuarioExcel[key];
                return acc;
            }, {});

            const cuit = usuarioNormalizado.cuit || usuarioNormalizado.cuil;
            if (!cuit) {
                stats.errores++;
                stats.listaErrores.push({ fila: usuarioExcel, error: "La fila no contiene CUIT o CUIL." });
                continue;
            }

            const cuitStr = String(cuit).replace(/\-/g, '');
            const claveAFIP = usuarioNormalizado.claveafip || usuarioNormalizado['clave afip'];
            const claveATM = usuarioNormalizado.claveatm || usuarioNormalizado['clave atm'];
            
            const indiceUsuarioExistente = usuariosExistentes.findIndex(u => (u.cuit && String(u.cuit).replace(/\-/g, '') === cuitStr));

            let usuarioParaProcesar;
            if (indiceUsuarioExistente !== -1) {
                usuarioParaProcesar = usuariosExistentes[indiceUsuarioExistente];
                usuarioParaProcesar.claveAFIP = claveAFIP !== undefined ? claveAFIP : usuarioParaProcesar.claveAFIP;
                usuarioParaProcesar.claveATM = claveATM !== undefined ? claveATM : usuarioParaProcesar.claveATM;
                usuarioParaProcesar.nombre = usuarioNormalizado.nombre || usuarioParaProcesar.nombre;
                usuarioParaProcesar.apellido = usuarioNormalizado.apellido || usuarioParaProcesar.apellido;
                stats.usuariosActualizados++;
            } else {
                usuarioParaProcesar = {
                    id: storage.generateId(),
                    nombre: usuarioNormalizado.nombre || null,
                    apellido: usuarioNormalizado.apellido || null,
                    cuit: cuit,
                    cuil: cuit,
                    tipoContribuyente: usuarioNormalizado.tipocontribuyente || null,
                    claveAFIP: claveAFIP,
                    claveATM: claveATM,
                    fechaCreacion: new Date().toISOString(),
                    claveAfipRequiereActualizacion: false,
                };
                usuariosExistentes.push(usuarioParaProcesar);
                stats.usuariosCreados++;
            }
            usuariosAProcesar.push(usuarioParaProcesar);
        }

        // 4. Validación en lote a través del manejador central
        if (usuariosAProcesar.length > 0) {
            console.log(`Iniciando procesamiento en lote para ${usuariosAProcesar.length} usuarios.`);
            const { browser, page } = await launchBrowserAndPage({ headless: false });

            for (const usuario of usuariosAProcesar) {
                await gestionarValidacion(browser, usuario);
            }

            await browser.close();
            console.log("Procesamiento en lote finalizado.");
        }

        // 5. Recopilar usuarios para el reporte final
        const usuariosParaActualizar = [];
        const usuariosConFallos = [];

        for (const u of usuariosAProcesar) {
            const serviciosParaActualizar = [];
            if (u.claveAfipRequiereActualizacion) {
                serviciosParaActualizar.push('AFIP');
            }
            if (u.claveAtmRequiereActualizacion) {
                serviciosParaActualizar.push('ATM');
            }

            if (serviciosParaActualizar.length > 0) {
                usuariosParaActualizar.push({ nombre: u.nombre, cuit: u.cuit, servicios: serviciosParaActualizar.join(', ') });
            }

            const fallos = [];
            if (u.claveAFIP && !u.claveAfipValida && !u.claveAfipRequiereActualizacion) {
                fallos.push('AFIP');
            }
            if (u.claveATM && !u.claveAtmValida && !u.claveAtmRequiereActualizacion) {
                // Gracias a los cambios, claveAtmInvalida nos da la certeza.
                if (u.claveAtmInvalida) {
                    fallos.push('ATM (Inválida)');
                } else {
                    fallos.push('ATM (Error)');
                }
            }

            if (fallos.length > 0) {
                usuariosConFallos.push({ nombre: u.nombre, cuit: u.cuit, fallos: fallos.join(', ') });
            }
        }

        // 6. Guardar datos actualizados
        storage.saveData({ users: usuariosExistentes });
        return { success: true, ...stats, usuariosParaActualizar, usuariosConFallos };

    } catch (error) {
        console.error('Error en la carga masiva:', error);
        return { 
            success: false, 
            ...stats, 
            errores: stats.errores + 1, 
            listaErrores: [...stats.listaErrores, { fila: 'General', error: error.message }] 
        };
    }
}

module.exports = { procesarArchivoUsuarios };
