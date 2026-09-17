/**
 * Tests de la espera post-"Consultar" de retenciones ATM.
 *
 * Los escenarios son tiempos medidos en vivo contra ATM (CUIT 30711438781,
 * periodo 2026-08). El caso que importa es "Percepciones SIRCAR": el label
 * tardaba 5188ms y el codigo viejo, que cortaba a los 4000ms, lo reportaba
 * como cero registros y se salteaba la descarga sin avisar.
 *
 * El frame es falso: devuelve lo que habia en pantalla segun el reloj, asi que
 * se puede correr sin navegador ni conexion a ATM.
 */

const test = require('node:test');
const assert = require('node:assert');

const { esperarRespuestaConsulta } = require('./retenciones_generico.js');

const SIN_CONSULTA_PREVIA = { habia: true, texto: '', huellaGrilla: '0||' };

/**
 * Arma un frame falso a partir de una linea de tiempo.
 * @param {Array<{desde: number, estado: Object}>} linea - tramos ordenados
 */
function frameFalso(linea) {
    const t0 = Date.now();
    return {
        evaluate: async () => {
            const t = Date.now() - t0;
            let actual = linea[0].estado;
            for (const tramo of linea) {
                if (t >= tramo.desde) actual = tramo.estado;
            }
            return {
                modalDetectado: false, modalMensaje: '', refrescado: false,
                cantidad: 0, ocupado: false, tieneNumero: false, debug: '',
                ...actual
            };
        }
    };
}

const vacio = { ocupado: false, tieneNumero: false, debug: 'cantidad:""' };
const trabajando = { ocupado: true, tieneNumero: false, debug: 'cantidad:"" ocupado:true' };
const conDatos = (n) => ({ ocupado: false, tieneNumero: true, cantidad: n, refrescado: true, debug: `cantidad:"${n}"` });
const conModal = (msg) => ({ modalDetectado: true, modalMensaje: msg });

test('Percepciones SIRCAR: el label tarda 5188ms y NO se reporta como cero', async () => {
    const frame = frameFalso([
        { desde: 0, estado: vacio },
        { desde: 260, estado: trabajando },
        { desde: 5188, estado: conDatos(35) }
    ]);

    const r = await esperarRespuestaConsulta(frame, SIN_CONSULTA_PREVIA, 30000);

    assert.strictEqual(r.cantidad, 35, 'tiene que leer los 35 registros, no 0');
    assert.strictEqual(r.indeterminado, false);
    assert.strictEqual(r.modalDetectado, false);
});

test('Retenciones SIRCAR: el caso que zafaba por 400ms sigue andando', async () => {
    const frame = frameFalso([
        { desde: 0, estado: vacio },
        { desde: 259, estado: trabajando },
        { desde: 3593, estado: conDatos(11) }
    ]);

    const r = await esperarRespuestaConsulta(frame, SIN_CONSULTA_PREVIA, 30000);

    assert.strictEqual(r.cantidad, 11);
    assert.strictEqual(r.indeterminado, false);
});

test('sin registros: el modal a 265ms se detecta y sale rapido', async () => {
    const frame = frameFalso([
        { desde: 0, estado: vacio },
        { desde: 265, estado: conModal('No se encontraron Retenciones') }
    ]);

    const inicio = Date.now();
    const r = await esperarRespuestaConsulta(frame, SIN_CONSULTA_PREVIA, 30000);
    const tardo = Date.now() - inicio;

    assert.strictEqual(r.modalDetectado, true);
    assert.strictEqual(r.indeterminado, false);
    assert.match(r.modalMensaje, /No se encontraron/);
    assert.ok(tardo < 2000, `no puede tardar 30s cuando no hay registros (tardo ${tardo}ms)`);
});

test('ATM que nunca responde: da indeterminado, NO cero registros', async () => {
    const frame = frameFalso([
        { desde: 0, estado: vacio },
        { desde: 260, estado: trabajando }
    ]);

    const r = await esperarRespuestaConsulta(frame, SIN_CONSULTA_PREVIA, 2000);

    assert.strictEqual(r.indeterminado, true, 'esto es lo que hace que el llamador tire error');
    assert.strictEqual(r.modalDetectado, false);
});

test('no decide con el numero viejo mientras ZK sigue trabajando', async () => {
    // El label muestra 11 (consulta anterior) y recien a 3000ms llega el 35 nuevo.
    const previo = { habia: true, texto: '11', huellaGrilla: '11|a|b' };
    const frame = frameFalso([
        { desde: 0, estado: { ocupado: true, tieneNumero: true, cantidad: 11, refrescado: false } },
        { desde: 3000, estado: conDatos(35) }
    ]);

    const r = await esperarRespuestaConsulta(frame, previo, 30000);

    assert.strictEqual(r.cantidad, 35, 'no puede quedarse con el 11 del periodo anterior');
});

test('respuesta mas rapida que el muestreo: la gracia evita el falso error', async () => {
    // Mismo periodo consultado dos veces: nunca se ve zk trabajando y el numero
    // no cambia. Tras la gracia se acepta lo que hay en pantalla.
    const previo = { habia: true, texto: '11', huellaGrilla: '11|a|b' };
    const frame = frameFalso([
        { desde: 0, estado: { ocupado: false, tieneNumero: true, cantidad: 11, refrescado: false } }
    ]);

    const r = await esperarRespuestaConsulta(frame, previo, 30000);

    assert.strictEqual(r.cantidad, 11);
    assert.strictEqual(r.indeterminado, false, 'no tiene que fallar por no ver actividad');
});
