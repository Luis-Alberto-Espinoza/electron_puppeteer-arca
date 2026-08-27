// rutasDatos.js — costura única para resolver DÓNDE viven los .json de la app.
//
// Antes cada store clavaba `path.join(app.getPath('userData'), '<archivo>')`. Ahora
// todos preguntan acá. El día que se cambie la ubicación (o se agregue SQLite), se toca
// SOLO este archivo.
//
// Orden de resolución (ver docs/rutaArchivos/prompt_centralizar_rutas.md):
//   1. Override del usuario: <userData>/config_datos.json → { carpetaDatos }.
//   2. Default portable: PORTABLE_EXECUTABLE_DIR/datos (al lado del .exe en el pen).
//   3. Fallback dev: app.getPath('userData')  ← Ubuntu de desarrollo no cambia en nada.
//
// TRAMPA del portable: en un build `target: portable` el .exe se autoextrae a un TEMP,
// así que __dirname / process.execPath / app.getPath('exe') apuntan al TEMP, NO al pen.
// El único camino confiable al lado del ejecutable es process.env.PORTABLE_EXECUTABLE_DIR
// (electron-builder la inyecta solo en el portable; en dev es undefined → cae al fallback).

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const NOMBRE_CONFIG = 'config_datos.json';

let carpetaCache = null;

/** Ruta del puntero de config. Vive SIEMPRE en userData (estable y escribible). */
function rutaConfig() {
    return path.join(app.getPath('userData'), NOMBRE_CONFIG);
}

/** Lee el override del usuario, o null si no hay / está roto. */
function leerOverride() {
    try {
        const parsed = JSON.parse(fs.readFileSync(rutaConfig(), 'utf8'));
        const c = parsed && typeof parsed.carpetaDatos === 'string' ? parsed.carpetaDatos.trim() : '';
        return c || null;
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[rutasDatos] config ilegible:', e.message);
        return null;
    }
}

/** ¿Se puede escribir en esta carpeta? Prueba real (crea y borra un archivo temporal). */
function esEscribible(carpeta) {
    try {
        fs.mkdirSync(carpeta, { recursive: true });
        const testigo = path.join(carpeta, `.w_${process.pid}.tmp`);
        fs.writeFileSync(testigo, '');
        fs.unlinkSync(testigo);
        return true;
    } catch {
        return false;
    }
}

/**
 * Resuelve la carpeta de datos (lazy + cacheada: no cambia durante la ejecución).
 * Asegura que la carpeta exista (mkdir -p) antes de devolverla.
 */
function getCarpetaDatos() {
    if (carpetaCache) return carpetaCache;

    let base = null;

    // 1) Override del usuario, si es válido y escribible.
    const override = leerOverride();
    if (override) {
        if (esEscribible(override)) base = override;
        else console.error('[rutasDatos] carpeta override no escribible, ignorada:', override);
    }

    // 2) Default portable: al lado del .exe (solo en build portable de Windows).
    if (!base && process.env.PORTABLE_EXECUTABLE_DIR) {
        base = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'datos');
    }

    // 3) Fallback dev / no-portable: userData (comportamiento histórico).
    if (!base) base = app.getPath('userData');

    fs.mkdirSync(base, { recursive: true });
    carpetaCache = base;
    return carpetaCache;
}

/** Ruta absoluta a un archivo de datos por nombre. Único punto de armado de rutas. */
function rutaDato(nombreArchivo) {
    return path.join(getCarpetaDatos(), nombreArchivo);
}

/**
 * Escritura ATÓMICA: escribe a un `.tmp` y hace rename sobre el destino. Un rename es
 * atómico dentro del mismo filesystem, así que sacar el pendrive a mitad de guardado NO
 * deja el .json corrupto: o queda el viejo entero, o el nuevo entero.
 */
function escribirAtomico(rutaDestino, contenido) {
    const tmp = `${rutaDestino}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, contenido, 'utf8');
    fs.renameSync(tmp, rutaDestino);
    return true;
}

/**
 * Persiste (o limpia con null) la carpeta elegida por el usuario y invalida la cache.
 * Valida escritura antes de aceptar. Devuelve { ok, carpeta } o { ok:false, error }.
 * OJO: el proceso ya tiene stores atados a la ruta vieja → conviene relaunch tras esto.
 */
function setCarpetaDatos(nuevaCarpeta) {
    if (nuevaCarpeta != null) {
        if (typeof nuevaCarpeta !== 'string' || !nuevaCarpeta.trim()) {
            return { ok: false, error: 'ruta_invalida' };
        }
        if (!esEscribible(nuevaCarpeta)) return { ok: false, error: 'no_escribible' };
    }
    try {
        const cfg = { carpetaDatos: nuevaCarpeta || undefined };
        escribirAtomico(rutaConfig(), JSON.stringify(cfg, null, 2));
        carpetaCache = null; // se re-resuelve al próximo getCarpetaDatos()
        return { ok: true, carpeta: nuevaCarpeta || null };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/** Info para la UI: dónde estamos parados y por qué. */
function getInfoDatos() {
    const carpeta = getCarpetaDatos();
    const override = leerOverride();
    return {
        carpeta,
        esOverride: !!override && carpeta === override,
        esPortable: !override && !!process.env.PORTABLE_EXECUTABLE_DIR,
        existe: fs.existsSync(carpeta),
        escribible: esEscribible(carpeta),
    };
}

module.exports = {
    getCarpetaDatos,
    rutaDato,
    escribirAtomico,
    setCarpetaDatos,
    getInfoDatos,
};
