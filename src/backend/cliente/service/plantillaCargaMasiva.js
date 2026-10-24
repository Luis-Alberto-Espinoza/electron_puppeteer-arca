// ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js), igual que
// el resto de los Excel de la app. El archivo se vuelve a importar con `xlsx`
// (cargaMasiva.js, sheet_to_json): el encabezado tiene que quedar en la fila 1.
const ExcelJS = require('exceljs');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');
const { nombreDe } = require('../resolverAcceso.js');

// Gris pizarra: marca las columnas "solo lectura, no se importa".
const FILL_SOLO_LECTURA = estilos.relleno(estilos.COLORES.neutroTexto);

/**
 * Agrega una hoja con encabezado en la fila 1 y las filas debajo, con el estilo común.
 * Las columnas desde `colsImportables` en adelante llevan el encabezado gris.
 *
 * @param {ExcelJS.Workbook} wb
 * @param {string} nombre nombre de la hoja
 * @param {string[]} headers encabezados en orden
 * @param {Array<Object>} filas objetos con esas claves
 * @param {number} colsImportables cuántas columnas (desde la izquierda) entiende la importación
 */
function agregarHoja(wb, nombre, headers, filas, colsImportables) {
    const hoja = wb.addWorksheet(nombre);
    hoja.addRow(headers);
    filas.forEach(f => hoja.addRow(headers.map(h => f[h])));
    estilos.estilizarTabla(hoja);
    for (let c = colsImportables + 1; c <= headers.length; c++) {
        hoja.getRow(1).getCell(c).fill = FILL_SOLO_LECTURA;
    }
    return hoja;
}

/**
 * Encabezados EXACTOS que entiende `cargaMasiva.js` (procesarArchivoUsuarios).
 * El orden acá es el que ve el usuario en el modelo. Si algún día el parser
 * acepta más columnas, se agregan también acá para que el modelo las traiga.
 * Solo `cuit` es obligatorio; el resto son opcionales.
 */
const ENCABEZADOS = ['cuit', 'nombre', 'apellido', 'razonSocial', 'estudio', 'tipoContribuyente', 'cuitRepresentante', 'claveAFIP', 'claveATM'];

/** Una fila de ejemplo (comentada como tal) para que se vea el formato esperado. */
const FILA_EJEMPLO = {
    cuit: '20-12345678-9',
    nombre: 'Juan',
    apellido: 'Pérez',
    razonSocial: '',                // si se deja vacío, se arma con apellido + nombre
    estudio: 'Estudio Pérez',       // nombre del estudio/grupo. Si no existe, se crea al
                                    // importar. Vacío = sin estudio. Independiente del representante.
    tipoContribuyente: 'C',         // A | B | C | M
    cuitRepresentante: '',          // CUIT de quien lo representa en AFIP; vacío = opera solo.
                                    // Si se completa, el contribuyente queda sin clave AFIP
                                    // propia (entra por el representante); su clave ATM se conserva.
    claveAFIP: '',
    claveATM: ''
};

/**
 * Genera el buffer del Excel modelo para la carga masiva de clientes.
 * Los encabezados quedan SIEMPRE en la primera fila de la primera hoja, que es
 * justo lo que `sheet_to_json` necesita (ver bug del título arriba del header).
 *
 * @returns {Promise<Buffer>} Buffer .xlsx listo para escribir a disco.
 */
async function generarPlantillaClientes() {
    const wb = new ExcelJS.Workbook();
    agregarHoja(wb, 'Clientes', ENCABEZADOS, [FILA_EJEMPLO], ENCABEZADOS.length);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Columnas de SOLO LECTURA que se agregan al export para que sirva de reporte.
 * El importador las ignora (no están en ENCABEZADOS), así que el archivo exportado
 * se puede volver a importar sin que estas ensucien nada (round-trip).
 */
const ENCABEZADOS_EXPORT = [...ENCABEZADOS, 'estadoAFIP', 'estadoATM', 'representanteNombre', 'cantidadPDV', 'pdvActualizados'];

/** Hoja 2 del export: un renglón por punto de venta, ligado por CUIT. */
const ENCABEZADOS_PDV = ['cuit', 'numero', 'descripcion', 'sistema', 'domicilio', 'activo'];

/**
 * Genera el Excel con TODOS los contribuyentes (proceso inverso a la carga masiva).
 * Las primeras columnas son las mismas que entiende la importación (re-importable);
 * al final van columnas de estado para lectura humana. Incluye las claves en texto
 * plano (decisión del usuario: backup/round-trip).
 *
 * @param {Array<Object>} contribuyentes lista NORMALIZADA del repo (con claves)
 * @param {Array<{id:string,nombre:string}>} [grupos] registro de estudios, para
 *        escribir el NOMBRE del estudio en la columna `estudio` (round-trip).
 * @returns {Promise<Buffer>} Buffer .xlsx
 */
async function generarExcelContribuyentes(contribuyentes, grupos = []) {
    const lista = Array.isArray(contribuyentes) ? contribuyentes : [];
    // Índice CUIT → contribuyente, para resolver el nombre del representante.
    const porCuit = new Map(lista.map(c => [String(c.cuit), c]));
    // Índice grupoId → nombre del estudio (para la columna `estudio`).
    const nombreGrupo = new Map((Array.isArray(grupos) ? grupos : []).map(g => [g.id, g.nombre]));

    const filas = lista.map(c => {
        const rep = c.representanteAfipCuit ? porCuit.get(String(c.representanteAfipCuit)) : null;
        return {
            cuit: c.cuit || '',
            nombre: c.nombre || '',
            apellido: c.apellido || '',
            razonSocial: c.razonSocial || '',
            estudio: (c.grupoId && nombreGrupo.get(c.grupoId)) || '',
            tipoContribuyente: c.tipoContribuyente || '',
            cuitRepresentante: c.representanteAfipCuit || '',
            claveAFIP: c.claveAFIP || '',
            claveATM: c.claveATM || '',
            // --- solo lectura ---
            estadoAFIP: c.estado_afip || '',
            estadoATM: c.estado_atm || '',
            representanteNombre: rep ? nombreDe(rep) : '',
            cantidadPDV: Array.isArray(c.puntosDeVenta) ? c.puntosDeVenta.length : 0,
            // Timestamp que marca "analizado": se re-importa junto con los PDV de la hoja 2.
            pdvActualizados: c.puntosDeVentaActualizados || ''
        };
    });

    // Hoja 2: un renglón por punto de venta. El restore la lee y liga por CUIT.
    const filasPdv = [];
    for (const c of lista) {
        const pdvs = Array.isArray(c.puntosDeVenta) ? c.puntosDeVenta : [];
        for (const p of pdvs) {
            filasPdv.push({
                cuit: c.cuit || '',
                numero: p.numero || '',
                descripcion: p.descripcion || '',
                sistema: p.sistema || '',
                domicilio: p.domicilio || '',
                // boolean real (no string) para que sheet_to_json lo devuelva como boolean.
                activo: typeof p.activo === 'boolean' ? p.activo : ''
            });
        }
    }

    const wb = new ExcelJS.Workbook();
    // Las primeras ENCABEZADOS.length columnas son importables (header violeta);
    // el resto son de solo lectura (header gris).
    agregarHoja(wb, 'Clientes', ENCABEZADOS_EXPORT, filas, ENCABEZADOS.length);
    agregarHoja(wb, 'PuntosDeVenta', ENCABEZADOS_PDV, filasPdv, ENCABEZADOS_PDV.length);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { generarPlantillaClientes, generarExcelContribuyentes, ENCABEZADOS };
