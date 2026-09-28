
const xlsx = require('xlsx');
const { getContribuyenteRepo } = require('../contribuyenteStore.js');
const { gruposManager } = require('../grupos/gruposManager.js');

/** Tipo por prefijo de CUIT (30/33/34 = jurídica) — misma regla que la migración. */
function inferirTipoPorCuit(cuit) {
    return ['30', '33', '34'].includes(String(cuit).slice(0, 2)) ? 'juridica' : 'fisica';
}

/** Un valor "vacío" a los fines del fill-only: null, undefined o string en blanco. */
function vacio(v) {
    return v == null || String(v).trim() === '';
}

// Estados válidos (mismos que el repo). Se usan para RESTAURAR el estado desde un
// Excel de backup: el export los escribe, y al recrear un registro los devolvemos.
const ESTADOS_VALIDOS = new Set(['no_aplica', 'pendiente', 'validado', 'invalido', 'requiere_actualizacion', 'no_verificado']);

/** Lee un estado del Excel; devuelve null si viene vacío o no es un estado conocido. */
function estadoDesdeExcel(v) {
    if (vacio(v)) return null;
    const s = String(v).trim().toLowerCase();
    return ESTADOS_VALIDOS.has(s) ? s : null;
}

/** Normaliza el booleano `activo` que puede venir como boolean o como string. */
function activoDesdeExcel(v) {
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    return null;
}

/**
 * Lee la hoja opcional "PuntosDeVenta" (export con 2 hojas) y arma un mapa
 * cuit -> [puntos de venta crudos]. Si el workbook no la tiene, devuelve mapa vacío.
 */
function leerPuntosDeVenta(workbook) {
    const map = new Map();
    const hoja = workbook.Sheets['PuntosDeVenta'];
    if (!hoja) return map;

    for (const filaCruda of xlsx.utils.sheet_to_json(hoja)) {
        const f = Object.keys(filaCruda).reduce((acc, k) => {
            acc[k.toLowerCase().trim()] = filaCruda[k];
            return acc;
        }, {});
        const cuit = String(f.cuit ?? '').replace(/\D/g, '');
        if (cuit.length !== 11) continue;
        if (vacio(f.numero)) continue;   // un PDV sin número no sirve
        if (!map.has(cuit)) map.set(cuit, []);
        map.get(cuit).push({
            numero: f.numero,
            descripcion: f.descripcion ?? null,
            sistema: f.sistema ?? null,
            domicilio: f.domicilio ?? null,
            activo: activoDesdeExcel(f.activo)
        });
    }
    return map;
}

/**
 * Carga masiva de contribuyentes desde un Excel (modelo plano, write-side C4).
 * Hace upsert por CUIT vía el repo (`crear`/`actualizar`).
 *
 * Representación: SÍ se lee del Excel (columna cuitRepresentante). Un representado
 * queda ligado a su representante y —por el invariante del normalizador— sin clave
 * AFIP propia; su clave ATM, en cambio, se conserva.
 *
 * Política de actualización = FILL-ONLY: para una fila que YA existe, solo se
 * completan los campos que están vacíos en el programa. Nunca se pisa un valor ya
 * cargado, así re-subir el Excel jamás borra una corrección hecha adentro ni resetea
 * una validación. (Para cambiar una clave existente, se edita en el CRUD, no acá.)
 *
 * Estado (validado/pendiente/…): se RESTAURA desde el Excel pero SOLO al crear un
 * registro (caso backup: borraste todo y re-subís). En un registro que ya existe no
 * se toca, igual que las claves. Es una afirmación del archivo, no un rechequeo: la
 * clave real lo corrige cuando operás o analizás.
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
        usuariosSinCambios: 0,
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

        // Hoja opcional de puntos de venta (backups exportados). Vacía si no está.
        const pdvPorCuit = leerPuntosDeVenta(workbook);

        // Resuelve el NOMBRE de estudio (columna `estudio`) a un grupoId, creándolo
        // la primera vez que aparece. Cacheado por nombre para no re-leer grupos.json
        // por fila (y para que "Estudio A" repetido no dispare N find-or-create).
        const grupoIdCache = new Map();
        function resolverGrupoId(nombreEstudio) {
            if (vacio(nombreEstudio)) return null;
            const clave = String(nombreEstudio).trim().toLowerCase();
            if (grupoIdCache.has(clave)) return grupoIdCache.get(clave);
            let id = null;
            try {
                const g = gruposManager.obtenerOCrearPorNombre(nombreEstudio);
                id = g ? g.id : null;
            } catch (e) {
                console.error('[cargaMasiva] no se pudo resolver estudio:', nombreEstudio, e.message);
            }
            grupoIdCache.set(clave, id);
            return id;
        }

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

            // Representante AFIP: aceptamos varios nombres de columna. Se limpia a 11
            // dígitos; si no es válido queda null (opera solo). La auto-referencia
            // (representante == uno mismo) la anula el normalizador del repo.
            const repRaw = u.cuitrepresentante || u['cuit representante']
                || u.representanteafipcuit || u.representante || null;
            const repDigits = repRaw != null ? String(repRaw).replace(/\D/g, '') : '';
            const representanteAfipCuit = repDigits.length === 11 ? repDigits : null;

            // Estudio/grupo: viene por NOMBRE en la columna `estudio` (o `grupo`).
            // Se resuelve a grupoId, creando el estudio si no existía.
            const grupoId = resolverGrupoId(u.estudio || u.grupo);

            // Estado desde el Excel (para restaurar un backup exportado). Solo se usa al
            // CREAR un registro; en uno existente NO se pisa (misma regla fill-only).
            const estadoAfipExcel = estadoDesdeExcel(u.estadoafip || u['estado afip'] || u.estado_afip);
            const estadoAtmExcel = estadoDesdeExcel(u.estadoatm || u['estado atm'] || u.estado_atm);

            try {
                const existente = await repo.getByCuit(cuit);
                if (existente) {
                    // FILL-ONLY: solo completamos lo que está vacío en el programa.
                    // Un campo que ya tiene valor NO se toca (ni la validación se resetea).
                    const cambios = {};
                    if (vacio(existente.nombre) && !vacio(nombre)) cambios.nombre = nombre;
                    if (vacio(existente.apellido) && !vacio(apellido)) cambios.apellido = apellido;
                    if (vacio(existente.razonSocial) && !vacio(razonSocial)) cambios.razonSocial = razonSocial;
                    if (vacio(existente.tipoContribuyente) && !vacio(tipoContribuyente)) cambios.tipoContribuyente = tipoContribuyente;
                    if (vacio(existente.claveAFIP) && !vacio(claveAFIP)) cambios.claveAFIP = claveAFIP;
                    if (vacio(existente.claveATM) && !vacio(claveATM)) cambios.claveATM = claveATM;
                    if (vacio(existente.representanteAfipCuit) && representanteAfipCuit) cambios.representanteAfipCuit = representanteAfipCuit;
                    if (vacio(existente.grupoId) && grupoId) cambios.grupoId = grupoId;

                    if (Object.keys(cambios).length > 0) {
                        await repo.actualizar(cuit, cambios);
                        stats.usuariosActualizados++;
                    } else {
                        // Ya estaba todo cargado: no hay nada que completar.
                        stats.usuariosSinCambios++;
                    }
                } else {
                    // PDV desde la hoja 2 (si el backup los trae). Restaurarlos también
                    // devuelve la marca de "analizado" vía puntosDeVentaActualizados.
                    const pdvRestore = pdvPorCuit.get(cuit) || [];
                    const datosPdv = pdvRestore.length > 0
                        ? {
                            puntosDeVenta: pdvRestore,
                            puntosDeVentaActualizados: (!vacio(u.pdvactualizados) && String(u.pdvactualizados)) || new Date().toISOString()
                        }
                        : {};

                    await repo.crear({
                        cuit,
                        tipo: inferirTipoPorCuit(cuit),
                        razonSocial,
                        nombre, apellido,
                        tipoContribuyente,
                        // Guarda 1: el estado sigue a la clave. Sin clave AFIP → no_aplica,
                        // aunque el Excel diga "validado" (no se puede validar lo que no hay).
                        // Guarda 2 (en el normalizador del repo): un representado se fuerza a
                        // no_aplica, así que restaurar su AFIP no rompe el invariante; su
                        // validez vive en la fila del representante.
                        claveAFIP, estado_afip: claveAFIP ? (estadoAfipExcel || 'pendiente') : 'no_aplica',
                        claveATM, estado_atm: claveATM ? (estadoAtmExcel || 'pendiente') : 'no_aplica',
                        representanteAfipCuit,
                        grupoId,
                        ...datosPdv
                    });
                    stats.usuariosCreados++;
                }

                // Leemos lo GUARDADO (ya normalizado): un representado pudo perder la
                // clave AFIP del Excel por el invariante, así que tieneAFIP refleja la
                // realidad persistida, no lo que decía la fila.
                const guardado = await repo.getByCuit(cuit);
                usuariosProcesados.push({
                    id: guardado.id,
                    nombre: guardado.nombre || guardado.razonSocial,
                    apellido: guardado.apellido || '',
                    cuit,
                    tieneAFIP: !!guardado.claveAFIP,
                    tieneATM: !!guardado.claveATM
                });
            } catch (e) {
                stats.errores++;
                stats.listaErrores.push({ fila: usuarioExcel, error: e.message });
            }
        }

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
