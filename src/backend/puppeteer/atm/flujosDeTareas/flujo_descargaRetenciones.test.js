// Tests del recorrido del flujo de retenciones ATM.
// Correr: node --test src/backend/puppeteer/atm/flujosDeTareas/flujo_descargaRetenciones.test.js
//
// Lo que se cuida acá es el ORDEN del recorrido, que es de donde sale el ahorro de
// tiempo: un solo login, se navega el menú UNA vez por tipo de retención y adentro
// se recorren todos los periodos. Si alguien invierte los bucles, el programa
// vuelve a tardar lo mismo que ejecutarlo a mano una vez por mes.

const test = require('node:test');
const assert = require('node:assert');

const RUTA_FLUJO = require.resolve('./flujo_descargaRetenciones.js');

// Reemplaza un módulo en la caché de require por un stub.
function stubModulo(rutaRelativa, exports) {
    const filename = require.resolve(rutaRelativa);
    require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}

/**
 * Deja el flujo cargado con todas sus dependencias de navegador stubbeadas.
 * Devuelve el flujo y los registros de llamadas para revisar el recorrido.
 */
function cargarFlujoConStubs({ alDescargar } = {}) {
    const navegaciones = [];
    const descargas = [];

    stubModulo('../../archivos_comunes/navegador/browserLauncher.js', {
        launchBrowserAndPage: async () => ({
            browser: { close: async () => {} },
            page: { goto: async () => {}, reload: async () => {} }
        })
    });
    stubModulo('../codigoXpagina/login_atm.js', { loginATM: async () => {} });
    stubModulo('../codigoXpagina/home-oficinaVirtual.js', {
        entrarOficinaVirtual: async () => ({ reload: async () => {} })
    });
    stubModulo('../codigoXpagina/oficina_retenciones.js', {
        navegarARetenciones: async (page, submenuIndex) => { navegaciones.push(submenuIndex); }
    });
    stubModulo('../codigoXpagina/retenciones_generico.js', {
        descargarRetencionGenerico: async (config) => {
            descargas.push({ tipo: config.nombre, periodo: config.periodo, recargarAlFinal: config.recargarAlFinal });
            // alDescargar puede devolver un resultado propio para simular una
            // consulta incompleta; si no devuelve nada, sale la normal.
            const propio = alDescargar ? alDescargar(config) : null;
            return {
                success: true, tipo: config.nombre, registros: 1, archivosDescargados: 2,
                files: [`${config.periodo}.xls`, `${config.periodo}.txt`],
                downloadDir: '/descargas', mensaje: 'Éxito',
                ...(propio || {})
            };
        }
    });

    delete require.cache[RUTA_FLUJO];
    const { flujoDescargaRetenciones } = require(RUTA_FLUJO);

    return { flujoDescargaRetenciones, navegaciones, descargas };
}

// Las pausas del flujo (1 a 2 segundos) no aportan nada en un test con stubs.
async function sinEsperas(fn) {
    const setTimeoutReal = global.setTimeout;
    global.setTimeout = (cb, ms, ...args) => setTimeoutReal(cb, 0, ...args);
    try {
        return await fn();
    } finally {
        global.setTimeout = setTimeoutReal;
    }
}

const CREDENCIALES = { cuit: '20263147074', clave: 'secreta' };
const TIPOS = 5; // sub-servicios configurados en el flujo

test('recorre todos los periodos dentro de cada tipo, navegando una sola vez por tipo', async () => {
    const { flujoDescargaRetenciones, navegaciones, descargas } = cargarFlujoConStubs();

    const periodos = ['2025-07', '2025-08', '2025-09'];
    const resultado = await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas', () => {}, periodos)
    );

    assert.strictEqual(navegaciones.length, TIPOS, 'debe navegar el menú una vez por tipo');
    assert.deepStrictEqual(navegaciones, [3, 4, 5, 6, 7]);
    assert.strictEqual(descargas.length, TIPOS * periodos.length);

    // Primero se agotan los periodos del primer tipo y recién ahí se cambia de tipo
    assert.deepStrictEqual(
        descargas.slice(0, 3).map(d => d.periodo),
        periodos
    );
    assert.strictEqual(descargas[0].tipo, descargas[2].tipo);
    assert.notStrictEqual(descargas[3].tipo, descargas[0].tipo);

    assert.strictEqual(resultado.exito, true);
    assert.strictEqual(resultado.files.length, TIPOS * periodos.length * 2);
});

test('solo recarga la página en el último periodo de cada tipo', async () => {
    const { flujoDescargaRetenciones, descargas } = cargarFlujoConStubs();

    await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas', () => {}, ['2025-07', '2025-08', '2025-09'])
    );

    const recargas = descargas.map(d => d.recargarAlFinal);
    assert.deepStrictEqual(recargas.slice(0, 3), [false, false, true]);
    assert.strictEqual(recargas.filter(Boolean).length, TIPOS);
});

test('acepta un periodo suelto (formato viejo)', async () => {
    const { flujoDescargaRetenciones, descargas } = cargarFlujoConStubs();

    await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas', () => {}, '2025-07')
    );

    assert.strictEqual(descargas.length, TIPOS);
    assert.ok(descargas.every(d => d.periodo === '2025-07' && d.recargarAlFinal === true));
});

test('un periodo que falla no corta el resto del rango', async () => {
    let vecesQueFalla = 0;
    const { flujoDescargaRetenciones, descargas } = cargarFlujoConStubs({
        alDescargar: (config) => {
            // Falla siempre el mismo periodo del primer tipo (intento + reintento)
            if (config.periodo === '2025-08' && config.nombre === 'Retenciones SIRTAC I.B.') {
                vecesQueFalla++;
                throw new Error('timeout simulado');
            }
        }
    });

    const periodos = ['2025-07', '2025-08', '2025-09'];
    const resultado = await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas', () => {}, periodos)
    );

    assert.strictEqual(vecesQueFalla, 2, 'un intento más un reintento');
    // 15 descargas pedidas + 1 reintento del periodo que falla
    assert.strictEqual(descargas.length, TIPOS * periodos.length + 1);

    const fallidos = resultado.detalles.filter(d => d.error);
    assert.strictEqual(fallidos.length, 1);
    assert.strictEqual(fallidos[0].periodo, '2025-08');
    assert.strictEqual(resultado.exito, true);
});

test('sin periodos avisa en vez de seguir', async () => {
    const { flujoDescargaRetenciones } = cargarFlujoConStubs();
    await assert.rejects(
        () => flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas', () => {}, []),
        /ningún periodo/
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// La cuenta dura: ATM entrega 2 archivos por cada consulta que informo
// registros. Si la suma no da, el usuario TIENE que enterarse: el bug original
// fue un Excel que no bajo con un cartel de exito en pantalla.
// ─────────────────────────────────────────────────────────────────────────────

test('avisa cuando ATM informo registros y falto un archivo', async () => {
    let primera = true;
    const { flujoDescargaRetenciones } = cargarFlujoConStubs({
        alDescargar: (config) => {
            if (!primera) return null;
            primera = false;
            // Esta consulta tuvo registros pero solo entrego el DIU.
            return {
                success: false, registros: 2468, archivosDescargados: 1,
                files: [`${config.periodo}.txt`],
                mensaje: 'No se pudo descargar: Excel (ATM no entrego el Excel en 1240s)'
            };
        }
    });

    const avisos = [];
    const resultado = await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas',
            (tipo, mensaje) => avisos.push({ tipo, mensaje }), ['2025-07'])
    );

    assert.strictEqual(resultado.descargaIncompleta, true);
    assert.strictEqual(resultado.archivosFaltantes, 1);
    assert.strictEqual(resultado.archivosEsperados, TIPOS * 2);
    assert.match(resultado.mensaje, /INCOMPLETA/);

    const alerta = avisos.find(a => a.tipo === 'error' && /FALTAN 1 archivo/.test(a.mensaje));
    assert.ok(alerta, `tenia que llegar un aviso de faltante. Avisos: ${JSON.stringify(avisos)}`);

    const exitoso = avisos.find(a => a.tipo === 'exito');
    assert.ok(!exitoso, 'no puede decir "proceso completado" si faltan archivos');
});

test('no avisa nada raro cuando la cuenta cierra', async () => {
    const { flujoDescargaRetenciones } = cargarFlujoConStubs();

    const avisos = [];
    const resultado = await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas',
            (tipo, mensaje) => avisos.push({ tipo, mensaje }), ['2025-07'])
    );

    assert.strictEqual(resultado.descargaIncompleta, false);
    assert.strictEqual(resultado.archivosFaltantes, 0);
    assert.ok(avisos.some(a => a.tipo === 'exito'), 'tiene que cerrar con el aviso de exito');
    assert.ok(!avisos.some(a => /FALTAN/.test(a.mensaje)), 'no puede inventar faltantes');
});

test('las consultas sin registros no cuentan para los archivos esperados', async () => {
    const { flujoDescargaRetenciones } = cargarFlujoConStubs({
        alDescargar: () => ({ registros: 0, archivosDescargados: 0, files: [], mensaje: 'Sin registros' })
    });

    const avisos = [];
    const resultado = await sinEsperas(() =>
        flujoDescargaRetenciones(CREDENCIALES, 'CLIENTE', '/descargas',
            (tipo, mensaje) => avisos.push({ tipo, mensaje }), ['2025-07'])
    );

    assert.strictEqual(resultado.archivosEsperados, 0);
    assert.strictEqual(resultado.descargaIncompleta, false);
    assert.ok(!avisos.some(a => a.tipo === 'error'), 'un mes sin registros no es un error');
});
