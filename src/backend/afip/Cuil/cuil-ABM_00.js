const fs = require('fs');
const path = require('path');


const rutaArchivoComprobante = path.join(__dirname, 'copiasDos', 'LIBRO_IVA_DIGITAL_Comprobante_CBTE 30717267024-2025010.txt');
const rutaCuitGuardados = path.join(__dirname, 'copias', 'cuit_validados.txt');

function actualizarCuitGuardados() {
    let cuitNombre = {};
    let cuitNombreExistente = {};

    try {
        // Leer archivo existente si existe
        if (fs.existsSync(rutaCuitGuardados)) {
            const archivoExistente = fs.readFileSync(rutaCuitGuardados, 'utf8');
            archivoExistente.split('\n').forEach(linea => {
                const [cuit, nombre] = linea.split(',');
                if (cuit && nombre) {
                    cuitNombreExistente[cuit] = nombre;
                }
            });
        }

        // Leer archivo de comprobantes
        const archivoComprobantes = fs.readFileSync(rutaArchivoComprobante, 'utf8');

        // Procesar archivo de comprobantes
        archivoComprobantes.split('\n').forEach(linea => {
            if (linea.trim() === '') return;

            const cuit = linea.substring(59, 78).trim();
            const nombre = linea.substring(79, 108).trim();

            if (cuit && nombre && !cuitNombreExistente[cuit]) {
                cuitNombre[cuit] = nombre;
            }
        });

        // Combinar y escribir
        const cuitNombreCombinado = { ...cuitNombreExistente, ...cuitNombre };
        const lineasResultado = Object.entries(cuitNombreCombinado).map(([cuit, nombre]) => `${cuit},${nombre}`);
        fs.writeFileSync(rutaCuitGuardados, lineasResultado.join('\n'), 'utf8');

        console.log(`Se han guardado ${lineasResultado.length} registros únicos en ${rutaCuitGuardados}`);

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        console.log('Error al procesar archivos. Consulta la consola para más detalles.');
    }
}


/**
 * 
 * @param {
 * } rutaArchivo 
 * @returns 
 */
   
function leerCuitNombresValidados(rutaArchivo) {
    try {
        const archivoCuitNombresValidados = fs.readFileSync(rutaArchivo, 'utf8');
        const cuitNombres = {}; // Usamos un objeto para almacenar los datos

        archivoCuitNombresValidados.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías

            const [cuit, nombre] = linea.split(','); // Dividir la línea por la coma
            if (cuit && nombre) {
                cuitNombres[cuit] = nombre; // Almacenar en el objeto
            }
        });

        return cuitNombres; // Retornar el objeto con los datos

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        return null; // O puedes lanzar una excepción si prefieres
    }
}

function validarCuil() {
    try {
        const cuitNombresValidados = leerCuitNombresValidados(rutaCuitGuardados);
        const archivoComprobantes = fs.readFileSync(rutaArchivoComprobante, 'utf8');

        const coincidencias = [];

        archivoComprobantes.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías

            const cuit = linea.substring(59, 78).trim();
            const nombre = linea.substring(79, 108).trim();

            if (cuitNombresValidados[cuit] || Object.values(cuitNombresValidados).includes(nombre)) {
                coincidencias.push({ cuit, nombre, lineaCompleta: linea });
            }
        });

        console.log(`Se encontraron ${coincidencias.length} coincidencias:`);
        coincidencias.forEach(coincidencia => {
            console.log(`CUIT: ${coincidencia.cuit}, Nombre: ${coincidencia.nombre}`);
        });

        return coincidencias;

    } catch (error) {
        console.error('Error al validar CUIT:', error);
        return [];
    }
}

// Exportar las funciones para que puedan ser utilizadas desde otro archivo
module.exports = { actualizarCuitGuardados, leerCuitNombresValidados, validarCuil };

// Ejemplo de uso (puedes comentar esta parte si solo quieres la función)
actualizarCuitGuardados();
validarCuil();