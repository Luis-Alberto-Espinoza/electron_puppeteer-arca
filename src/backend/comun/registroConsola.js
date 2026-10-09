// registroConsola.js — copia a archivo todo lo que sale por console.* del proceso main.
//
// Envuelve console.log/info/warn/error/debug: la terminal sigue igual que siempre y
// además cada línea va a <carpeta de datos>/logs/AAAA-MM-DD.log (un archivo por día).
// Cada línea: "14:32:05 [ERROR] mensaje" (sin fecha: ya la dice el nombre del archivo).
// Etapa 1 de "Logs de uso" (docs/FALTANTES.md §3). La consola del front queda afuera.
//
// Regla de oro: si el archivo falla, la app NO se entera. Se sigue solo en terminal.

const fs = require('fs');
const path = require('path');
const util = require('util');

const DIAS_A_GUARDAR = 30;
const METODOS = ['log', 'info', 'warn', 'error', 'debug'];

// Campos sensibles: `clave: x`, `claveAFIP: 'x'`, `"password":"x"`, `contraseña=x`...
// El lookahead (?![\wñ]) evita que "claveroja:" matchee y funciona con la ñ final.
// No se tapan null/undefined/true/false: no son secretos y ayudan a diagnosticar.
const RE_CLAVE = /((?:clave(?:AFIP|ATM|Fiscal)?|contrase[nñ]a|password)(?![\wñ])["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|[^\s,;}\]]+)/gi;

function taparClaves(texto) {
    return texto.replace(RE_CLAVE, (todo, prefijo, valor) =>
        /^(null|undefined|true|false)$/.test(valor) ? todo : `${prefijo}'***'`);
}

const dos = (n) => String(n).padStart(2, '0');
const fechaDia = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const hora = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;

/** Borra los .log con nombre de fecha más viejos que `dias`. Nunca tira error. */
function borrarViejos(carpeta, dias, ahora = new Date()) {
    const limite = new Date(ahora);
    limite.setDate(limite.getDate() - dias);
    const corte = fechaDia(limite);
    try {
        for (const archivo of fs.readdirSync(carpeta)) {
            const m = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(archivo);
            // Comparar 'AAAA-MM-DD' como texto ordena igual que por fecha.
            if (m && m[1] < corte) {
                try { fs.unlinkSync(path.join(carpeta, archivo)); } catch { /* sigue */ }
            }
        }
    } catch { /* carpeta ilegible: no importa */ }
}

/**
 * Activa el registro. `carpeta` = dónde van los .log (se crea si falta).
 * `reloj` solo existe para poder probar el cambio de día sin esperar a medianoche.
 * Devuelve { carpeta, cerrar } — cerrar() restaura console y cierra el archivo.
 */
function iniciarRegistroConsola(carpeta, { reloj = () => new Date() } = {}) {
    try {
        fs.mkdirSync(carpeta, { recursive: true });
    } catch {
        return { carpeta: null, cerrar() {} }; // sin carpeta → solo terminal
    }
    borrarViejos(carpeta, DIAS_A_GUARDAR, reloj());

    let stream = null;
    let diaActual = null;
    let roto = false; // tras un error de escritura dejamos de intentar

    function streamDelDia(dia) {
        if (dia === diaActual && stream) return stream;
        if (stream) stream.end();
        diaActual = dia;
        stream = fs.createWriteStream(path.join(carpeta, `${dia}.log`), { flags: 'a' });
        stream.on('error', () => { roto = true; }); // async: no se puede atrapar con try
        return stream;
    }

    function escribir(nivel, args) {
        if (roto) return;
        try {
            const ahora = reloj();
            const texto = taparClaves(util.format(...args));
            streamDelDia(fechaDia(ahora)).write(`${hora(ahora)} [${nivel}] ${texto}\n`);
        } catch {
            roto = true;
        }
    }

    const originales = {};
    for (const metodo of METODOS) {
        originales[metodo] = console[metodo];
        const nivel = metodo === 'log' ? 'INFO' : metodo.toUpperCase();
        console[metodo] = (...args) => {
            originales[metodo].apply(console, args); // terminal: igual que antes
            escribir(nivel, args);
        };
    }

    return {
        carpeta,
        cerrar() {
            Object.assign(console, originales);
            if (stream) stream.end();
            stream = null;
        },
    };
}

module.exports = { iniciarRegistroConsola, taparClaves, borrarViejos };
