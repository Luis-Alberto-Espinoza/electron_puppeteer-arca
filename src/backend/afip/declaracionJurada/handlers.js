// afip/declaracionJurada/handlers.js
// Handlers IPC del servicio Declaración Jurada.
//
// Primer slice (modo prueba):
//   'declaracionJurada:probarAcceso'  → login + buscar "Mis Aplicaciones Web"
//                                        + volcar selectores del portal fenix.
//   payload: { cliente: { id, nombre, cuitLogin }, modoPrueba?: boolean }

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const declaracionJuradaManager = require('./declaracionJuradaManager.js');
const parsers = require('./parsers/index.js');   // despachador: auto-detecta formato 1 o 2
const escribirDeducciones = require('./escribirDeducciones.js');
const { getDownloadPath } = require('../../utils/fileManager.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

function obtenerCredenciales(userStorage, cliente) {
    const dataBD = userStorage.loadData();
    const u = dataBD.users.find(x => String(x.id) === String(cliente.id));
    if (!u) {
        throw new Error(`No se encontró el cliente ${cliente.nombre || cliente.id} en el storage`);
    }
    return {
        usuario: u.cuit || cliente.cuitLogin || cliente.cuit,
        contrasena: u.claveAFIP || u.clave
    };
}

function setupDeclaracionJuradaHandlers(ipcMain, userStorage, app) {

    ipcMain.handle('declaracionJurada:probarAcceso', async (event, datos) => {
        console.log('[DeclaracionJurada] probarAcceso recibido:', datos && datos.cliente && datos.cliente.id);
        try {
            const { cliente, modoPrueba = true } = datos || {};

            if (!cliente || !cliente.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario seleccionado.' };
            }

            const credenciales = obtenerCredenciales(userStorage, cliente);
            if (!credenciales.contrasena) {
                return { success: false, error: 'MISSING_CLAVE', message: 'El cliente no tiene clave AFIP cargada.' };
            }

            const downloadsPath = app.getPath('downloads');

            return await declaracionJuradaManager.iniciarProceso(
                URL_LOGIN_AFIP,
                credenciales,
                { cliente },
                'probarAcceso',
                downloadsPath,
                modoPrueba
            );

        } catch (error) {
            console.error('[DeclaracionJurada] Error en probarAcceso:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    // Alta de DDJJ por "Nuevo". Corre el flujo completo (Aceptar + cargar). Persiste SOLO
    // si grabar=true (Grabar). Sin grabar = simulación (Aceptar no persiste).
    // payload: { cliente, empresaObjetivo, organismo, formulario, periodo, retenciones, archivo, hoja, grabar }
    ipcMain.handle('declaracionJurada:cargar', async (event, datos) => {
        console.log('[DeclaracionJurada] cargar recibido:', datos && datos.cliente && datos.cliente.id);
        try {
            const { cliente, empresaObjetivo, organismo, formulario, periodo, retenciones, archivo, hoja, fechaPago, grabar = false } = datos || {};

            if (!cliente || !cliente.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario seleccionado.' };
            }
            if (!organismo) return { success: false, error: 'MISSING_ORGANISMO', message: 'Falta el Organismo.' };
            if (!formulario) return { success: false, error: 'MISSING_FORMULARIO', message: 'Falta el Formulario.' };
            if (!/^\d{6}$/.test(String(periodo || ''))) {
                return { success: false, error: 'BAD_PERIODO', message: 'Período inválido (formato AAAAMM, ej: 202605).' };
            }
            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(fechaPago || ''))) {
                return { success: false, error: 'BAD_FECHA_PAGO', message: 'Falta la fecha de pago (formato DD/MM/AAAA).' };
            }

            const credenciales = obtenerCredenciales(userStorage, cliente);
            if (!credenciales.contrasena) {
                return { success: false, error: 'MISSING_CLAVE', message: 'El cliente no tiene clave AFIP cargada.' };
            }

            // Excel → modelo canónico (base/alícuota). Opcional: si no hay Excel, el flujo
            // usa el hardcode. Si hay Excel pero no parsea, fallamos rápido (es plata).
            let modelo = null;
            if (archivo && hoja) {
                try {
                    modelo = parsers.parsear(archivo, hoja, periodo);
                } catch (e) {
                    return { success: false, error: 'PARSE_ERROR', message: `No se pudo leer el Excel (${hoja}/${periodo}): ${e.message}` };
                }
                // Se eligió Excel pero NO tiene actividades con base para ese período →
                // cortar acá (antes del login) en vez de dejar que el flujo caiga al hardcode
                // de prueba y cargue datos de otro cliente sin avisar. Es plata.
                if (!modelo.actividades || !modelo.actividades.length) {
                    return {
                        success: false, error: 'EXCEL_SIN_DATOS',
                        message: `El Excel (${hoja}) no tiene actividades con base para el período ${periodo}. Revisá que ese mes esté cargado en la planilla.`
                    };
                }
            }

            const downloadsPath = app.getPath('downloads');

            return await declaracionJuradaManager.iniciarProceso(
                URL_LOGIN_AFIP,
                credenciales,
                { cliente, empresaObjetivo, organismo, formulario, periodo, retenciones, modelo, fechaPago, grabar },
                'nuevo',
                downloadsPath,
                !grabar   // "modoPrueba" del manager = simulación (sin grabar) — solo afecta el log
            );

        } catch (error) {
            console.error('[DeclaracionJurada] Error en cargar:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    // Buscar borradores existentes (entra por "Buscar" en vez de "Nuevo").
    // payload: { cliente, empresaObjetivo, organismo, formulario, periodo }
    ipcMain.handle('declaracionJurada:buscar', async (event, datos) => {
        console.log('[DeclaracionJurada] buscar recibido:', datos && datos.cliente && datos.cliente.id);
        try {
            const { cliente, empresaObjetivo, organismo, formulario, periodo, accion } = datos || {};
            if (!cliente || !cliente.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario seleccionado.' };
            }
            const credenciales = obtenerCredenciales(userStorage, cliente);
            if (!credenciales.contrasena) {
                return { success: false, error: 'MISSING_CLAVE', message: 'El cliente no tiene clave AFIP cargada.' };
            }
            return await declaracionJuradaManager.iniciarProceso(
                URL_LOGIN_AFIP,
                credenciales,
                { cliente, empresaObjetivo, organismo, formulario, periodo, accion },
                'buscar',
                app.getPath('downloads'),
                true
            );
        } catch (error) {
            console.error('[DeclaracionJurada] Error en buscar:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    // Preview del Excel (Fase 1, sin portal): elegir archivo → listar hojas.
    ipcMain.handle('declaracionJurada:elegirExcel', async () => {
        try {
            const r = await dialog.showOpenDialog({
                title: 'Elegí el Excel de liquidación',
                properties: ['openFile'],
                filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
            });
            if (r.canceled || !r.filePaths || !r.filePaths.length) {
                return { success: false, canceled: true };
            }
            const archivo = r.filePaths[0];
            const hojas = parsers.listarHojas(archivo);
            return { success: true, archivo, hojas };
        } catch (error) {
            console.error('[DeclaracionJurada] Error en elegirExcel:', error);
            return { success: false, error: 'DIALOG_ERROR', message: error.message };
        }
    });

    // Elegir un .txt de retención/percepción (Plan B): devuelve la ruta del archivo.
    // Abre por DEFECTO en la carpeta donde la propia app descarga estos archivos del
    // cliente (archivos_atm/RetencionesYPercepciones), para no navegar de cero cada vez.
    ipcMain.handle('declaracionJurada:elegirTxt', async (event, datos) => {
        try {
            const cli = (datos && datos.cliente) || {};
            let defaultPath;
            if (cli.cuit || cli.nombre) {
                try {
                    const baseAtm = getDownloadPath(app.getPath('downloads'),
                        { cuit: cli.cuit, nombre: cli.nombre, apellido: cli.apellido }, 'archivos_atm');
                    const retDir = path.join(baseAtm, 'RetencionesYPercepciones');
                    defaultPath = fs.existsSync(retDir) ? retDir : baseAtm;
                } catch (_) { /* si falla el armado de ruta, abre donde Electron quiera */ }
            }

            const r = await dialog.showOpenDialog({
                title: 'Elegí el .txt de la retención/percepción',
                defaultPath,
                properties: ['openFile'],
                filters: [{ name: 'Texto', extensions: ['txt'] }, { name: 'Todos', extensions: ['*'] }]
            });
            if (r.canceled || !r.filePaths || !r.filePaths.length) {
                return { success: false, canceled: true };
            }
            return { success: true, archivo: r.filePaths[0] };
        } catch (error) {
            console.error('[DeclaracionJurada] Error en elegirTxt:', error);
            return { success: false, error: 'DIALOG_ERROR', message: error.message };
        }
    });

    // Elegir una carpeta DISTINTA donde el usuario tiene los .txt de retención/percepción
    // (caso: no están en archivos_atm/RetencionesYPercepciones del cliente). Devuelve la ruta;
    // el frontend la guarda y se la pasa a sugerirRetenciones para escanear ahí.
    ipcMain.handle('declaracionJurada:elegirCarpetaRetenciones', async (event, datos) => {
        try {
            const cli = (datos && datos.cliente) || {};
            let defaultPath;
            if (cli.cuit || cli.nombre) {
                try {
                    const baseAtm = getDownloadPath(app.getPath('downloads'),
                        { cuit: cli.cuit, nombre: cli.nombre, apellido: cli.apellido }, 'archivos_atm');
                    const retDir = path.join(baseAtm, 'RetencionesYPercepciones');
                    defaultPath = fs.existsSync(retDir) ? retDir : baseAtm;
                } catch (_) { /* si falla el armado de ruta, abre donde Electron quiera */ }
            }
            const r = await dialog.showOpenDialog({
                title: 'Elegí la carpeta con los .txt de retenciones/percepciones',
                defaultPath,
                properties: ['openDirectory']
            });
            if (r.canceled || !r.filePaths || !r.filePaths.length) {
                return { success: false, canceled: true };
            }
            return { success: true, carpeta: r.filePaths[0] };
        } catch (error) {
            console.error('[DeclaracionJurada] Error en elegirCarpetaRetenciones:', error);
            return { success: false, error: 'DIALOG_ERROR', message: error.message };
        }
    });

    // Auto-detectar los .txt de retención del cliente para un período: escanea una carpeta,
    // filtra por período y mapea cada archivo a su fila de AFIP por el régimen del nombre.
    // La carpeta es la del cliente (archivos_atm/RetencionesYPercepciones) por defecto, o la
    // que el usuario eligió a mano (datos.carpeta) si los archivos están en otro lado.
    // Devuelve { [etiqueta]: [rutas] } (sugerencia).
    ipcMain.handle('declaracionJurada:sugerirRetenciones', async (event, datos) => {
        try {
            const { cliente, periodo, carpeta } = datos || {};
            if (!/^\d{6}$/.test(String(periodo || ''))) {
                return { success: false, error: 'BAD_ARGS', message: 'Falta período válido.' };
            }
            let dir;
            if (carpeta && fs.existsSync(carpeta)) {
                dir = carpeta;                       // carpeta elegida a mano pisa el default
            } else {
                if (!cliente) {
                    return { success: false, error: 'BAD_ARGS', message: 'Falta cliente o carpeta.' };
                }
                const baseAtm = getDownloadPath(app.getPath('downloads'),
                    { cuit: cliente.cuit, nombre: cliente.nombre, apellido: cliente.apellido }, 'archivos_atm');
                dir = path.join(baseAtm, 'RetencionesYPercepciones');
            }
            if (!fs.existsSync(dir)) return { success: true, sugerencias: {}, carpeta: dir };

            const periodoGuion = `${periodo.slice(0, 4)}-${periodo.slice(4, 6)}`; // 202605 → 2026-05
            const archivos = fs.readdirSync(dir).filter(f => /\.txt$/i.test(f));

            // Régimen del nombre → fila de AFIP (mapeo confirmado con el usuario).
            const filaDe = (nombre) => {
                const n = nombre.toLowerCase();
                if (n.includes('sircreb') || n.includes('sircupa')) return 'Recaudaciones SIRCREB/SIRCUPA';
                if (n.includes('percepciones') && n.includes('sircar')) return 'Percepciones';
                if (n.includes('retenciones') && n.includes('sircar')) return 'Retenciones Sufridas';
                if (n.includes('sirtac')) return 'Retenciones Sufridas';
                return null;
            };

            // CUIT del cliente (solo dígitos) para detectar archivos de OTRO cliente en la carpeta.
            const cuitCliente = String((cliente && (cliente.cuit || cliente.cuil)) || '').replace(/\D/g, '');
            const cuitDe = (nombre) => (nombre.match(/(\d{11})/) || [])[1] || null; // CUIT al inicio del nombre

            const sugerencias = {};
            const sinMapear = [];
            const ajenos = [];   // .txt del período pero con CUIT de otro cliente → ALARMA, no se asignan
            for (const f of archivos) {
                // El período es el AAAA-MM que va ANTES de la fecha de descarga (AAAA-MM-DD).
                const m = f.match(/_(\d{4}-\d{2})_\d{4}-\d{2}-\d{2}/);
                if (!m || m[1] !== periodoGuion) continue;      // de otro período → ignorar
                const cuitArch = cuitDe(f);
                if (cuitCliente && cuitArch && cuitArch !== cuitCliente) {
                    ajenos.push({ archivo: f, cuit: cuitArch });
                    continue;                                   // de otro cliente → no asignar
                }
                const fila = filaDe(f);
                if (!fila) { sinMapear.push(f); continue; }
                (sugerencias[fila] = sugerencias[fila] || []).push(path.join(dir, f));
            }
            return { success: true, sugerencias, sinMapear, ajenos, carpeta: dir };
        } catch (error) {
            console.error('[DeclaracionJurada] Error en sugerirRetenciones:', error);
            return { success: false, error: 'SCAN_ERROR', message: error.message };
        }
    });

    // Escribir los totales que AFIP calculó en el MISMO Excel (paso 2). Opción del usuario (botón).
    // payload: { archivo, hoja, periodo, deducciones, retenciones, sobrescribir? }
    ipcMain.handle('declaracionJurada:escribirDeducciones', async (event, datos) => {
        try {
            return await escribirDeducciones.escribir(datos || {});
        } catch (error) {
            console.error('[DeclaracionJurada] Error en escribirDeducciones:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    // Parsear una hoja para el período dado → modelo canónico (para el preview).
    ipcMain.handle('declaracionJurada:parsearHoja', async (event, datos) => {
        try {
            const { archivo, hoja, periodo } = datos || {};
            if (!archivo || !hoja) {
                return { success: false, error: 'MISSING_ARGS', message: 'Falta archivo u hoja.' };
            }
            const modelo = parsers.parsear(archivo, hoja, periodo);
            return { success: true, modelo };
        } catch (error) {
            // Errores esperables (mes no encontrado, hoja sin columnas, etc.) → mensaje claro.
            return { success: false, error: 'PARSE_ERROR', message: error.message };
        }
    });
}

module.exports = setupDeclaracionJuradaHandlers;
