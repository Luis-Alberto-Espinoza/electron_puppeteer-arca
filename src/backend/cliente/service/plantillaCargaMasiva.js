// `xlsx-js-style` es drop-in de `xlsx` (misma API json_to_sheet/book_new/write)
// pero además respeta la propiedad `.s` de estilo por celda. Usamos la MISMA
// paleta que el resto de los Excel de la app (resumenClienteExcel.js, etc.) para
// que el archivo exportado se vea igual a los reportes de los otros servicios.
const xlsx = require('xlsx-js-style');
const { nombreDe } = require('../resolverAcceso.js');

// --- Paleta compartida (idéntica a la de los reportes de planesDePago) ---
const COLOR_HEADER_BG    = { rgb: 'FF2C3E50' }; // azul oscuro corporativo
const COLOR_HEADER_FG    = { rgb: 'FFFFFFFF' };
const COLOR_READONLY_BG  = { rgb: 'FF7F8C8D' }; // gris pizarra: marca "solo lectura, no se importa"
const COLOR_ZEBRA_BG     = { rgb: 'FFF4F6F7' }; // fondo tenue para filas pares
const BORDE_FINO         = { style: 'thin', color: { rgb: 'FFCCCCCC' } };
const BORDES_DEFAULT     = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };

/**
 * Aplica estilos a una hoja ya poblada con `json_to_sheet`:
 *   - fila 0 = header (azul, o gris si la columna es de solo lectura),
 *   - filas de datos con bordes finos y zebra,
 *   - anchos de columna y autofiltro en el header.
 *
 * @param {Object} ws worksheet de xlsx-js-style
 * @param {string[]} headers encabezados en orden (define la cantidad de columnas)
 * @param {number} colsImportables cuántas columnas (desde la izquierda) entiende la
 *        importación; el resto se pinta gris para avisar que son solo lectura.
 * @param {number[]} [anchos] ancho por columna en caracteres (wch). Default 16.
 */
function estilizarHoja(ws, headers, colsImportables, anchos) {
    if (!ws || !ws['!ref']) return;
    const rango = xlsx.utils.decode_range(ws['!ref']);

    for (let r = rango.s.r; r <= rango.e.r; r++) {
        const esHeader = r === 0;
        const zebra = !esHeader && (r % 2 === 0);
        for (let c = rango.s.c; c <= rango.e.c; c++) {
            const addr = xlsx.utils.encode_cell({ r, c });
            // json_to_sheet omite celdas vacías; las creamos para que el borde
            // y el fondo se dibujen en toda la grilla (no quedan huecos blancos).
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            if (esHeader) {
                const readonly = c >= colsImportables;
                ws[addr].s = {
                    font: { bold: true, sz: 10, color: COLOR_HEADER_FG },
                    fill: { patternType: 'solid', fgColor: readonly ? COLOR_READONLY_BG : COLOR_HEADER_BG },
                    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                    border: BORDES_DEFAULT
                };
            } else {
                ws[addr].s = {
                    font: { sz: 10 },
                    fill: zebra ? { patternType: 'solid', fgColor: COLOR_ZEBRA_BG } : undefined,
                    alignment: { vertical: 'center' },
                    border: BORDES_DEFAULT
                };
            }
        }
    }

    ws['!cols'] = headers.map((_, i) => ({ wch: (anchos && anchos[i]) || 16 }));
    ws['!rows'] = [{ hpt: 22 }]; // header un poco más alto
    ws['!autofilter'] = { ref: xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) };
    // Nota: congelar el header (freeze panes) es feature de SheetJS Pro; la
    // build community de xlsx-js-style lo ignora al escribir, así que no se pone.
}

/**
 * Encabezados EXACTOS que entiende `cargaMasiva.js` (procesarArchivoUsuarios).
 * El orden acá es el que ve el usuario en el modelo. Si algún día el parser
 * acepta más columnas, se agregan también acá para que el modelo las traiga.
 * Solo `cuit` es obligatorio; el resto son opcionales.
 */
const ENCABEZADOS = ['cuit', 'nombre', 'apellido', 'razonSocial', 'estudio', 'tipoContribuyente', 'cuitRepresentante', 'claveAFIP', 'claveATM'];

/** Anchos (en caracteres) alineados 1:1 con ENCABEZADOS. */
const ANCHOS_PLANTILLA = [16, 14, 14, 24, 18, 14, 16, 16, 16];

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
 * @returns {Buffer} Buffer .xlsx listo para escribir a disco.
 */
function generarPlantillaClientes() {
    const ws = xlsx.utils.json_to_sheet([FILA_EJEMPLO], { header: ENCABEZADOS });
    estilizarHoja(ws, ENCABEZADOS, ENCABEZADOS.length, ANCHOS_PLANTILLA);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Clientes');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Columnas de SOLO LECTURA que se agregan al export para que sirva de reporte.
 * El importador las ignora (no están en ENCABEZADOS), así que el archivo exportado
 * se puede volver a importar sin que estas ensucien nada (round-trip).
 */
const ENCABEZADOS_EXPORT = [...ENCABEZADOS, 'estadoAFIP', 'estadoATM', 'representanteNombre', 'cantidadPDV', 'pdvActualizados'];
const ANCHOS_EXPORT = [...ANCHOS_PLANTILLA, 14, 14, 22, 12, 20];

/** Hoja 2 del export: un renglón por punto de venta, ligado por CUIT. */
const ENCABEZADOS_PDV = ['cuit', 'numero', 'descripcion', 'sistema', 'domicilio', 'activo'];
const ANCHOS_PDV = [16, 10, 26, 14, 26, 10];

/**
 * Genera el Excel con TODOS los contribuyentes (proceso inverso a la carga masiva).
 * Las primeras columnas son las mismas que entiende la importación (re-importable);
 * al final van columnas de estado para lectura humana. Incluye las claves en texto
 * plano (decisión del usuario: backup/round-trip).
 *
 * @param {Array<Object>} contribuyentes lista NORMALIZADA del repo (con claves)
 * @param {Array<{id:string,nombre:string}>} [grupos] registro de estudios, para
 *        escribir el NOMBRE del estudio en la columna `estudio` (round-trip).
 * @returns {Buffer} Buffer .xlsx
 */
function generarExcelContribuyentes(contribuyentes, grupos = []) {
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

    const wb = xlsx.utils.book_new();
    const wsClientes = xlsx.utils.json_to_sheet(filas, { header: ENCABEZADOS_EXPORT });
    // Las primeras ENCABEZADOS.length columnas son importables (header azul);
    // el resto son de solo lectura (header gris).
    estilizarHoja(wsClientes, ENCABEZADOS_EXPORT, ENCABEZADOS.length, ANCHOS_EXPORT);
    xlsx.utils.book_append_sheet(wb, wsClientes, 'Clientes');
    const wsPdv = xlsx.utils.json_to_sheet(filasPdv, { header: ENCABEZADOS_PDV });
    estilizarHoja(wsPdv, ENCABEZADOS_PDV, ENCABEZADOS_PDV.length, ANCHOS_PDV);
    xlsx.utils.book_append_sheet(wb, wsPdv, 'PuntosDeVenta');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generarPlantillaClientes, generarExcelContribuyentes, ENCABEZADOS };
