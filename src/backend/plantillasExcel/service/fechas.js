// plantillasExcel/service/fechas.js
// Fechas cargadas a mano, sin saber de antemano el orden día/mes. Lógica pura.
//
// Lo que pasa en la realidad (visto en los Excel de Landes): el Excel de quien
// carga está en mes/día. Si escribe "1/8/26" queriendo 1 de agosto, Excel guarda
// una fecha REAL pero invertida (8 de enero); si escribe "13/8/26" no la puede
// convertir (no hay mes 13) y queda como TEXTO. En otro archivo escribe "9/1/26"
// y la fecha queda bien. Por eso:
//  - Cada fecha leída se guarda "cruda" (los dos números tal cual) con su origen:
//    'excel' (Excel ya la convirtió) o 'texto'.
//  - Cada origen puede venir derecho o invertido, independiente del otro.
//  - Se prueban las combinaciones y gana la que deja al archivo en UN mes (el
//    archivo es mensual y los días varían). Si dos lecturas distintas empatan,
//    es ambiguo: se avisa, nunca se adivina.

// Sin tildes para comparar; con tildes para los mensajes.
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIAS_TEXTO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ORIENTACIONES = ['normal', 'invertida'];

function sinTildes(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Serial de Excel (sistema 1900) -> fecha UTC.
function desdeSerial(n) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

function anioDeTexto(t) {
    if (t.length === 2) return { anio: 2000 + Number(t) };
    const n = Number(t);
    if (t.length === 4 && n >= 1990 && n <= 2100) return { anio: n };
    return { anio: null, anioRaro: t };   // ej. "20206": error de tipeo
}

/**
 * Lee una fecha "cruda" de una celda o de un título ("Miércoles 5/7/2026").
 * u/v son los dos primeros números TAL CUAL: para un texto, en el orden escrito;
 * para una fecha de Excel, (día, mes) según la guardó Excel.
 * @param {*} valor  valor plano de la celda
 * @returns {null | { origen: 'excel'|'texto', u: number, v: number, anio: number|null,
 *   anioRaro?: string, diaSemana?: number, texto: string }}
 */
function leerFechaCruda(valor) {
    if (valor === null || valor === undefined) return null;
    let fecha = null;
    if (valor instanceof Date) fecha = valor;
    else if (typeof valor === 'number' && valor > 20000 && valor < 80000) fecha = desdeSerial(valor);
    if (fecha) {
        if (Number.isNaN(fecha.getTime())) return null;
        return {
            origen: 'excel',
            u: fecha.getUTCDate(),
            v: fecha.getUTCMonth() + 1,
            anio: fecha.getUTCFullYear(),
            texto: fecha.toISOString().slice(0, 10)
        };
    }
    if (typeof valor !== 'string') return null;

    const texto = valor.trim();
    const m = /^(?:([a-záéíóúü]+)[\s,]+)?(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,5})$/i.exec(texto);
    if (!m) return null;
    const cruda = { origen: 'texto', u: Number(m[2]), v: Number(m[3]), ...anioDeTexto(m[4]), texto };
    if (m[1]) {
        const i = DIAS.indexOf(sinTildes(m[1]));
        if (i < 0) return null;              // una palabra que no es un día: no es fecha
        cruda.diaSemana = i;
    }
    return cruda;
}

function esFechaValida(anio, mes, dia) {
    if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return false;
    if (anio === null) return true;   // año mal tipeado: se valida después con el del archivo
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Lectura de una fecha cruda con una orientación. normal = u es el día.
 * @returns {{ anio: number|null, mes: number, dia: number } | null}  null si no existe
 */
function interpretar(cruda, orientacion) {
    const dia = orientacion === 'normal' ? cruda.u : cruda.v;
    const mes = orientacion === 'normal' ? cruda.v : cruda.u;
    if (!esFechaValida(cruda.anio, mes, dia)) return null;
    return { anio: cruda.anio, mes, dia };
}

function diaDeLaSemana(f) {
    return new Date(Date.UTC(f.anio, f.mes - 1, f.dia)).getUTCDay();
}

function claveFecha(f) {
    return `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;
}

function textoFecha(f) {
    return `${String(f.dia).padStart(2, '0')}/${String(f.mes).padStart(2, '0')}/${f.anio}`;
}

function aDate(f) {
    return new Date(Date.UTC(f.anio, f.mes - 1, f.dia));
}

// El valor más repetido de una lista (y cuántas veces), o null si empatan.
function moda(valores) {
    const cuenta = new Map();
    for (const v of valores) cuenta.set(v, (cuenta.get(v) || 0) + 1);
    let mejor = null;
    let empate = false;
    for (const [v, n] of cuenta) {
        if (!mejor || n > mejor.n) { mejor = { valor: v, n }; empate = false; }
        else if (n === mejor.n) empate = true;
    }
    return mejor && !empate ? mejor : null;
}

/**
 * Deduce cómo leer las fechas del archivo: una orientación por origen y el mes.
 * Gana la combinación que deja más fechas en un mismo mes. Si otra combinación da
 * fechas DISTINTAS con el mismo puntaje, es ambiguo.
 *
 * @param {Array<object>} crudas  una por bloque/día (ver leerFechaCruda)
 * @returns {{ ok: true, orientaciones: Object<string,string>, anio: number, mes: number }
 *         | { ok: false, mensaje: string }}
 */
function deducirMes(crudas) {
    if (!crudas.length) return { ok: false, mensaje: 'No se encontró ninguna fecha.' };
    const origenes = [...new Set(crudas.map(c => c.origen))];

    // Todas las combinaciones de orientación por origen (a lo sumo 4).
    let combinaciones = [{}];
    for (const o of origenes) {
        combinaciones = combinaciones.flatMap(c => ORIENTACIONES.map(or => ({ ...c, [o]: or })));
    }

    const resultados = combinaciones.map((orientaciones) => {
        const fechas = crudas.map(c => interpretar(c, orientaciones[c.origen]));
        const meses = fechas.filter(Boolean).map(f => f.mes);
        const m = moda(meses);
        return {
            orientaciones,
            mes: m ? m.valor : null,
            puntaje: m ? m.n : 0,
            firma: fechas.map(f => (f ? `${f.dia}/${f.mes}` : '-')).join(','),
            fechas
        };
    }).filter(r => r.mes !== null).sort((a, b) => b.puntaje - a.puntaje);

    if (!resultados.length) {
        return { ok: false, mensaje: 'No se pudo deducir el mes: las fechas no forman un mes reconocible.' };
    }
    const [mejor] = resultados;
    const rival = resultados.find(r => r.puntaje === mejor.puntaje && r.firma !== mejor.firma);
    if (rival) {
        const ej = crudas[0].texto;
        return {
            ok: false,
            mensaje: `Las fechas son ambiguas: se pueden leer como día/mes o como mes/día (ej. "${ej}") `
                + 'y las dos lecturas tienen sentido. Escribí al menos una fecha con día mayor a 12 '
                + 'o revisá el archivo.'
        };
    }

    // Año: el más repetido entre las fechas que caen en el mes elegido.
    const anios = mejor.fechas.filter(f => f && f.mes === mejor.mes && f.anio !== null).map(f => f.anio);
    const a = moda(anios);
    if (!a) return { ok: false, mensaje: 'No se pudo deducir el año de las fechas.' };
    return { ok: true, orientaciones: mejor.orientaciones, anio: a.valor, mes: mejor.mes };
}

/**
 * Resuelve la fecha de cada bloque (en el orden del archivo) con lo deducido.
 * Una fecha fuera del mes (o con el año mal tipeado) se corrige SOLO si las pistas
 * coinciden: el mismo número de día cae entre la fecha del bloque anterior y la
 * del siguiente, y si el título dice el día de la semana, también coincide.
 * Si no, es un error y no se genera nada.
 *
 * @param {Array<object>} crudas
 * @param {{ orientaciones, anio, mes }} deduccion
 * @returns {Array<{ fecha: object|null, correccion?: string, aviso?: string, error?: string }>}
 */
function resolverFechas(crudas, deduccion) {
    const { orientaciones, anio, mes } = deduccion;
    const lecturas = crudas.map(c => interpretar(c, orientaciones[c.origen]));
    const enElMes = lecturas.map(f => !!(f && f.mes === mes && f.anio === anio));

    const vecina = (i, paso) => {
        for (let j = i + paso; j >= 0 && j < crudas.length; j += paso) {
            if (enElMes[j]) return lecturas[j];
        }
        return null;
    };

    return crudas.map((c, i) => {
        const nombreDia = c.diaSemana !== undefined ? DIAS_TEXTO[c.diaSemana] : null;
        if (enElMes[i]) {
            const f = lecturas[i];
            const r = { fecha: f };
            if (nombreDia && diaDeLaSemana(f) !== c.diaSemana) {
                r.aviso = `"${c.texto}" dice ${nombreDia} pero el ${textoFecha(f)} es `
                    + `${DIAS_TEXTO[diaDeLaSemana(f)]}. Se tomó la fecha ${textoFecha(f)}.`;
            }
            return r;
        }

        // Fuera del mes: mismo número de día, mes y año del archivo.
        const dia = lecturas[i] ? lecturas[i].dia : (orientaciones[c.origen] === 'normal' ? c.u : c.v);
        const candidata = { anio, mes, dia };
        const antes = vecina(i, -1);
        const despues = vecina(i, +1);
        const k = claveFecha(candidata);
        const pistas = [];
        let cierra = esFechaValida(anio, mes, dia);
        if (cierra && antes) cierra = claveFecha(antes) < k;
        if (cierra && despues) cierra = k < claveFecha(despues);
        if (cierra && antes && despues) pistas.push(`entre el ${textoFecha(antes)} y el ${textoFecha(despues)}`);
        else if (cierra && antes) pistas.push(`después del ${textoFecha(antes)}`);
        else if (cierra && despues) pistas.push(`antes del ${textoFecha(despues)}`);
        if (cierra && nombreDia) {
            cierra = diaDeLaSemana(candidata) === c.diaSemana;
            if (cierra) pistas.unshift(nombreDia);
        }
        if (cierra && !antes && !despues && !nombreDia) cierra = false; // sin ninguna pista

        if (!cierra) {
            return {
                fecha: null,
                error: `La fecha "${c.texto}" no corresponde al mes del archivo `
                    + `(${String(mes).padStart(2, '0')}/${anio}) y no se puede corregir con seguridad. `
                    + 'Corregila en el Excel y volvé a procesar.'
            };
        }
        return {
            fecha: candidata,
            correccion: `"${c.texto}" no corresponde al mes del archivo; se tomó el `
                + `${textoFecha(candidata)} (${pistas.join(', ')}).`
        };
    });
}

module.exports = {
    DIAS,
    DIAS_TEXTO,
    leerFechaCruda,
    interpretar,
    deducirMes,
    resolverFechas,
    moda,
    diaDeLaSemana,
    claveFecha,
    textoFecha,
    aDate,
    esFechaValida
};
