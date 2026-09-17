const { test } = require('node:test');
const assert = require('node:assert');
const { esperarDescarga, estimarGeneracionMs, techoDescargaMs } = require('./descarga_espera.js');

/**
 * Reloj virtual: dormir() adelanta el tiempo en vez de esperarlo, asi los
 * escenarios de 7 minutos corren en milisegundos.
 */
function relojFalso() {
    let t = 0;
    return { ahora: () => t, dormir: async (ms) => { t += ms; } };
}

/** Observador de mentira: una funcion que, dado el tiempo, devuelve la foto. */
function observadorFalso(reloj, guion) {
    return { foto: () => guion(reloj.ahora()) };
}

const NADA = { pestanasNacidas: 0, pestanasVivas: 0, descargas: [] };
const GENERANDO = { pestanasNacidas: 1, pestanasVivas: 1, descargas: [] };
const bajando = (recibidos) => ({
    pestanasNacidas: 1, pestanasVivas: 0,
    descargas: [{ nombre: 'excel.xls', estado: 'inProgress', recibidos, totales: 441344 }]
});
const LISTO = {
    pestanasNacidas: 1, pestanasVivas: 0,
    descargas: [{ nombre: 'excel.xls', estado: 'completed', recibidos: 441344, totales: 441344 }]
};

test('el caso real: ATM genera 400s y recien ahi entrega', async () => {
    const reloj = relojFalso();
    const obs = observadorFalso(reloj, (t) => (t < 400000 ? GENERANDO : LISTO));

    const r = await esperarDescarga({ observador: obs, techoMs: techoDescargaMs(2468), queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.nombre, 'excel.xls');
    assert.ok(r.ms >= 400000 && r.ms < 401000, `esperaba ~400s, dio ${r.ms}`);
});

test('el caso chico sale enseguida y no paga el techo', async () => {
    const reloj = relojFalso();
    const obs = observadorFalso(reloj, (t) => (t < 1200 ? GENERANDO : LISTO));

    const r = await esperarDescarga({ observador: obs, techoMs: techoDescargaMs(3), queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, true);
    assert.ok(r.ms < 2000, `esperaba menos de 2s, dio ${r.ms}`);
});

test('si el click no abre ninguna pestana, falla rapido y lo dice', async () => {
    const reloj = relojFalso();
    const obs = observadorFalso(reloj, () => NADA);

    const r = await esperarDescarga({ observador: obs, techoMs: 600000, queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, false);
    assert.match(r.motivo, /no abrio ninguna pestana/);
    assert.ok(r.ms < 20000, `tenia que fallar rapido, tardo ${r.ms}`);
});

test('si ATM cierra la pestana con las manos vacias, no lo toma como exito', async () => {
    const reloj = relojFalso();
    const obs = observadorFalso(reloj, (t) => (t < 30000 ? GENERANDO : { pestanasNacidas: 1, pestanasVivas: 0, descargas: [] }));

    const r = await esperarDescarga({ observador: obs, techoMs: 600000, queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, false);
    assert.match(r.motivo, /sin entregar el archivo/);
});

test('la rendija: la pestana muere unos ms DESPUES de avisar la descarga', async () => {
    const reloj = relojFalso();
    // Pestana ya muerta pero la descarga existe: no puede declararla perdida.
    const obs = observadorFalso(reloj, (t) => (t < 1000 ? bajando(1000) : LISTO));

    const r = await esperarDescarga({ observador: obs, techoMs: 600000, queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, true);
});

test('una descarga que se queda sin recibir un byte se corta por inactividad', async () => {
    const reloj = relojFalso();
    const obs = observadorFalso(reloj, () => bajando(1000)); // siempre los mismos bytes

    const r = await esperarDescarga({ observador: obs, techoMs: 600000, queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, false);
    assert.match(r.motivo, /sin recibir un byte/);
});

test('el techo corta si ATM genera para siempre', async () => {
    const reloj = relojFalso();
    const obs = observadorFalso(reloj, () => GENERANDO);

    const r = await esperarDescarga({ observador: obs, techoMs: 60000, queEs: 'Excel', reloj });

    assert.strictEqual(r.ok, false);
    assert.match(r.motivo, /techo de seguridad/);
    assert.ok(r.ms >= 60000 && r.ms < 61000);
});

test('la estimacion pega contra lo medido en ATM', () => {
    // 3 registros tardaron ~1,2s; 21 ~5,5s; 2468 ~409s.
    assert.ok(Math.abs(estimarGeneracionMs(3) - 1200) < 1500);
    assert.ok(Math.abs(estimarGeneracionMs(21) - 5500) < 2000);
    assert.ok(Math.abs(estimarGeneracionMs(2468) - 409000) < 15000);
});

test('el techo siempre queda por encima de lo medido, con aire', () => {
    assert.ok(techoDescargaMs(3) >= 60000);
    assert.ok(techoDescargaMs(2468) > 409000 * 2, 'el grande necesita mucho aire');
    assert.strictEqual(techoDescargaMs(10 ** 6), 30 * 60 * 1000, 'nunca mas de 30 minutos');
});
