// afip/facturaExcel/handlers.js
// Facturar desde Excel: bajar el modelo, elegir el Excel y leerlo (vista previa).
// Emitir NO pasa por acá: la vista manda los grupos a facturaTipificada:generarLote
// (mismo motor que Factura Tipificada: un login, varias facturas, reintento).

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { leerExcelFacturas } = require('./service/leerExcelFacturas.js');
const { generarModeloExcel } = require('./service/modeloExcel.js');

const hoyTexto = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

function setupFacturaExcelHandlers(ipcMain, mainWindow, dialog, app) {
    const repo = getContribuyenteRepo();

    // El tipo del emisor (B/C) sale del cliente GUARDADO, no del front.
    async function tipoDelEmisor(cuit) {
        const c = cuit ? await repo.getByCuit(String(cuit)) : null;
        return c ? c.tipoContribuyente : null;
    }

    // facturaExcel:bajarModelo({ cuit }) → { success, ruta } | { success:false, cancelado:true }
    ipcMain.handle('facturaExcel:bajarModelo', async (event, { cuit } = {}) => {
        try {
            const tipo = await tipoDelEmisor(cuit);
            if (tipo !== 'B' && tipo !== 'C') {
                return { success: false, message: 'El cliente no tiene tipo de contribuyente (B o C): cargalo en Clientes.' };
            }
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Guardar el modelo de Excel de facturas',
                defaultPath: path.join(app.getPath('downloads'), `modelo_facturas_${tipo}.xlsx`),
                filters: [{ name: 'Excel', extensions: ['xlsx'] }],
            });
            if (canceled || !filePath) return { success: false, cancelado: true };
            fs.writeFileSync(filePath, await generarModeloExcel(tipo));
            return { success: true, ruta: filePath };
        } catch (error) {
            console.error('[Facturar desde Excel] Error al generar el modelo:', error);
            return { success: false, message: error.message };
        }
    });

    // facturaExcel:elegirExcel() → ruta | null (cerró el diálogo)
    ipcMain.handle('facturaExcel:elegirExcel', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Elegir el Excel de facturas',
            properties: ['openFile'],
            filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        });
        return canceled || !filePaths.length ? null : filePaths[0];
    });

    // facturaExcel:leer({ ruta, cuit }) → { success, facturas, errores }
    ipcMain.handle('facturaExcel:leer', async (event, { ruta, cuit } = {}) => {
        try {
            // Archivo de ENTRADA al log del día (ver nombreNuevoFlujo.md §11).
            console.log(`[Facturar desde Excel] Archivo de entrada: ${ruta}`);
            if (!ruta || !fs.existsSync(ruta)) return { success: false, message: 'El Excel no existe.' };
            if (!ruta.toLowerCase().endsWith('.xlsx')) return { success: false, message: 'Tiene que ser un Excel .xlsx.' };

            const libro = new ExcelJS.Workbook();
            await libro.xlsx.readFile(ruta);
            const { facturas, errores } = leerExcelFacturas(libro, { tipoEmisor: await tipoDelEmisor(cuit), hoy: hoyTexto() });
            console.log(`[Facturar desde Excel] ${facturas.length} factura(s) leída(s), ${errores.length} error(es).`);
            return { success: true, facturas, errores };
        } catch (error) {
            console.error('[Facturar desde Excel] Error al leer el Excel:', error);
            return { success: false, message: `No se pudo leer el Excel: ${error.message}` };
        }
    });
}

module.exports = setupFacturaExcelHandlers;
