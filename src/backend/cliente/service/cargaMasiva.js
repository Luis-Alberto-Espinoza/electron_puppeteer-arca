
const xlsx = require('xlsx');
const { getContribuyenteRepo } = require('../contribuyenteStore.js');
const { proyectarUsersJson } = require('../proyeccionUsersJson.js');
const { JsonStorage } = require('./storage.js');

/** Tipo por prefijo de CUIT (30/33/34 = jurídica) — misma regla que la migración. */
function inferirTipoPorCuit(cuit) {
    return ['30', '33', '34'].includes(String(cuit).slice(0, 2)) ? 'juridica' : 'fisica';
}

/**
 * Carga masiva de contribuyentes desde un Excel (modelo plano, write-side C4).
 * Hace upsert por CUIT vía el repo (`crear`/`actualizar`) y reproyecta users.json
 * para los flujos aún no migrados. El Excel NO trae representación → los altas
 * quedan como directos; la representación se asigna después en el CRUD.
 *
 * @param {Buffer} fileBuffer El buffer del archivo Excel.
 * @returns {Promise<object>} Resumen de la operación.
 */
async function procesarArchivoUsuarios(fileBuffer) {
    const repo = getContribuyenteRepo();
    const stats = {
        usuariosLeidos: 0,
        usuariosCreados: 0,
        usuariosActualizados: 0,
        errores: 0,
        listaErrores: []
    };
    const usuariosProcesados = [];

    try {
        // 1. Parsear el Excel.
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const usuariosDelExcel = xlsx.utils.sheet_to_json(sheet);
        stats.usuariosLeidos = usuariosDelExcel.length;
        if (stats.usuariosLeidos === 0) throw new Error('El archivo Excel está vacío.');

        // 2. Upsert por CUIT, fila por fila (una fila mala no corta el lote).
        for (const usuarioExcel of usuariosDelExcel) {
            const u = Object.keys(usuarioExcel).reduce((acc, key) => {
                acc[key.toLowerCase().trim()] = usuarioExcel[key];
                return acc;
            }, {});

            const cuitRaw = u.cuit || u.cuil;
            if (!cuitRaw) {
                stats.errores++;
                stats.listaErrores.push({ fila: usuarioExcel, error: 'La fila no contiene CUIT o CUIL.' });
                continue;
            }
            const cuit = String(cuitRaw).replace(/\D/g, '');
            if (cuit.length !== 11) {
                stats.errores++;
                stats.listaErrores.push({ fila: usuarioExcel, error: `CUIT/CUIL inválido (${cuit}).` });
                continue;
            }

            const nombre = u.nombre || null;
            const apellido = u.apellido || null;
            const claveAFIP = (u.claveafip || u['clave afip']) || null;
            const claveATM = (u.claveatm || u['clave atm']) || null;
            const tipoContribuyente = u.tipocontribuyente || null;
            const razonSocial = u.razonsocial || u['razon social']
                || [apellido, nombre].filter(Boolean).join(' ').trim()
                || nombre || '';

            try {
                const existente = await repo.getByCuit(cuit);
                if (existente) {
                    await repo.actualizar(cuit, {
                        nombre, apellido,
                        razonSocial: razonSocial || existente.razonSocial,
                        tipoContribuyente: tipoContribuyente || existente.tipoContribuyente,
                        // null = no vino en el Excel → conservar la existente.
                        claveAFIP: claveAFIP != null ? claveAFIP : existente.claveAFIP,
                        claveATM: claveATM != null ? claveATM : existente.claveATM
                    });
                    stats.usuariosActualizados++;
                } else {
                    await repo.crear({
                        cuit,
                        tipo: inferirTipoPorCuit(cuit),
                        razonSocial,
                        nombre, apellido,
                        tipoContribuyente,
                        claveAFIP, estado_afip: claveAFIP ? 'pendiente' : 'no_aplica',
                        claveATM, estado_atm: claveATM ? 'pendiente' : 'no_aplica',
                        representanteAfipCuit: null
                    });
                    stats.usuariosCreados++;
                }

                const guardado = await repo.getByCuit(cuit);
                usuariosProcesados.push({
                    id: guardado.id,
                    nombre: guardado.nombre || guardado.razonSocial,
                    apellido: guardado.apellido || '',
                    cuit,
                    tieneAFIP: !!claveAFIP,
                    tieneATM: !!claveATM
                });
            } catch (e) {
                stats.errores++;
                stats.listaErrores.push({ fila: usuarioExcel, error: e.message });
            }
        }

        // 3. Reproyectar users.json (puente) para los flujos no migrados.
        new JsonStorage().saveData(proyectarUsersJson(await repo.obtenerTodos()));

        return { success: true, ...stats, usuariosProcesados };

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
