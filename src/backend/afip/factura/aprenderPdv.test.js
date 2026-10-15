// Tests de lo que el paso 0 enseña de los PDV y del corte del lote de Tipificada.
// Correr: node --test src/backend/afip/factura/aprenderPdv.test.js
//
// Por qué importa: si AFIP no habilita el PDV elegido (o es de otra letra), el
// usuario tiene que poder corregirlo sin salir del formulario, y en Tipificada
// volver a generar no puede re-emitir las facturas que ya salieron.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { aprenderPdvHabilitados, aprenderTipoDelPdv } = require('./aprenderPdv.js');

function repoFalso(clientes = {}) {
    const actualizaciones = [];
    return {
        actualizaciones,
        async getByCuit(cuit) { return clientes[cuit] || null; },
        async actualizar(cuit, cambios) {
            actualizaciones.push({ cuit, cambios });
            if (clientes[cuit]) Object.assign(clientes[cuit], cambios);
        }
    };
}

// ---------- aprenderPdvHabilitados ----------

test('sin lista del paso 0 (falló antes, ej. login) → no guarda ni marca', async () => {
    const repo = repoFalso();
    const resultado = { success: false };
    assert.strictEqual(await aprenderPdvHabilitados('20', resultado, { puntoVenta: '00005' }, repo), null);
    assert.strictEqual(await aprenderPdvHabilitados('20', resultado, null, repo), null);
    assert.strictEqual(repo.actualizaciones.length, 0);
    assert.strictEqual(resultado.codigo, undefined);
});

test('PDV elegido NO habilitado → guarda la lista y marca PDV_NO_HABILITADO', async () => {
    const repo = repoFalso();
    const resultado = { success: false, message: 'no está habilitado' };
    const datos = { puntoVenta: '5', pdvHabilitadosAfip: ['00003', '00004'] };
    const marcado = await aprenderPdvHabilitados('20', resultado, datos, repo);

    assert.deepStrictEqual(marcado, { habilitados: ['00003', '00004'], elegido: '00005' });
    assert.strictEqual(resultado.codigo, 'PDV_NO_HABILITADO');
    assert.deepStrictEqual(resultado.pdvHabilitados, ['00003', '00004']);
    assert.strictEqual(resultado.pdvElegido, '00005');
    assert.strictEqual(repo.actualizaciones.length, 1);
    assert.deepStrictEqual(repo.actualizaciones[0].cambios.pdvHabilitadosFacturacion.numeros, ['00003', '00004']);
});

test('PDV elegido habilitado → guarda la lista pero NO marca (falló por otra cosa)', async () => {
    const repo = repoFalso();
    const resultado = { success: false };
    const datos = { puntoVenta: '00003', pdvHabilitadosAfip: ['00003', '00004'] };
    assert.strictEqual(await aprenderPdvHabilitados('20', resultado, datos, repo), null);
    assert.strictEqual(resultado.codigo, undefined);
    assert.strictEqual(repo.actualizaciones.length, 1);
});

test('factura OK → solo guarda la lista', async () => {
    const repo = repoFalso();
    const resultado = { success: true };
    const datos = { puntoVenta: '00003', pdvHabilitadosAfip: ['00003'] };
    assert.strictEqual(await aprenderPdvHabilitados('20', resultado, datos, repo), null);
    assert.strictEqual(resultado.codigo, undefined);
    assert.strictEqual(repo.actualizaciones.length, 1);
});

test('si no se puede guardar en el cliente, igual marca (el front no se queda con el error)', async () => {
    const repo = { async actualizar() { throw new Error('disco lleno'); } };
    const resultado = { success: false };
    const datos = { puntoVenta: '00005', pdvHabilitadosAfip: ['00003'] };
    const original = console.warn;
    console.warn = () => {};
    try {
        assert.ok(await aprenderPdvHabilitados('20', resultado, datos, repo));
    } finally {
        console.warn = original;
    }
    assert.strictEqual(resultado.codigo, 'PDV_NO_HABILITADO');
});

// ---------- aprenderTipoDelPdv ----------

test('TIPO_PDV_DISTINTO adentro de data.resultados (forma de Tipificada) → corrige PDV y cliente', async () => {
    const cliente = {
        cuit: '27',
        tipoContribuyente: 'C',
        puntosDeVenta: [{ numero: '00002', sistema: 'Factura en Linea - Monotributo' }]
    };
    const repo = repoFalso({ 27: cliente });
    const resultado = {
        success: false,
        data: { resultados: [{ success: false, codigo: 'TIPO_PDV_DISTINTO', detalle: { puntoVenta: '2', letra: 'B' } }] }
    };
    const original = console.log;
    console.log = () => {};
    let detalle;
    try {
        detalle = await aprenderTipoDelPdv('27', resultado, repo);
    } finally {
        console.log = original;
    }

    assert.deepStrictEqual(detalle, { puntoVenta: '00002', letra: 'B' });
    assert.strictEqual(resultado.codigo, 'TIPO_PDV_DISTINTO');
    assert.strictEqual(cliente.tipoContribuyente, 'B');
    assert.strictEqual(cliente.puntosDeVenta[0].sistema, 'Factura en Linea - Responsable Inscripto');
});

test('sin código TIPO_PDV_DISTINTO → no toca nada', async () => {
    const repo = repoFalso({ 27: { cuit: '27', puntosDeVenta: [] } });
    assert.strictEqual(await aprenderTipoDelPdv('27', { success: false, message: 'otra cosa' }, repo), null);
    assert.strictEqual(repo.actualizaciones.length, 0);
});

// ---------- Lote de Tipificada: corte por PDV no habilitado ----------
// Se cargan los handlers con el manager de facturación, el repo y el historial
// falsos (sin Electron ni navegador).

function cargarHandlersConFalsos({ iniciarProceso, cliente }) {
    const dir = __dirname;
    const falsos = {
        [path.join(dir, 'facturaManagerUnificado.js')]: { iniciarProceso },
        [path.join(dir, 'service', 'procesarFactura.js')]: { procesarDatosFactura: () => ({}) },
        [path.join(dir, '..', '..', 'historial', 'historialRepo.js')]: {
            historialRepo: { registrar() {}, clienteDesdeUsuario: () => null }
        },
        [path.join(dir, '..', '..', 'cliente', 'contribuyenteStore.js')]: {
            getContribuyenteRepo: () => ({
                async resolverAcceso() { return { loginCuit: '20', loginClave: 'x', objetivoNombre: 'BUIGUES' }; },
                async getByCuit() { return cliente; },
                async actualizar(cuit, cambios) { Object.assign(cliente, cambios); }
            })
        }
    };
    const guardados = {};
    for (const [ruta, exp] of Object.entries(falsos)) {
        guardados[ruta] = require.cache[ruta];
        require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: exp };
    }
    const rutasReales = ['handlers.js', 'aprenderPdv.js'].map(f => path.join(dir, f));
    rutasReales.forEach(r => delete require.cache[r]);

    const handlers = {};
    const ipcMain = { on: () => {}, handle: (canal, fn) => { handlers[canal] = fn; } };
    require('./handlers.js')(ipcMain, null);

    // Se restaura el cache para no ensuciar otros tests.
    for (const [ruta, previo] of Object.entries(guardados)) {
        if (previo) require.cache[ruta] = previo; else delete require.cache[ruta];
    }
    rutasReales.forEach(r => delete require.cache[r]);
    return handlers;
}

function grupo(puntoVenta, cantidad) {
    return {
        datosComunes: { puntoVenta, usuarioSeleccionado: { cuit: '27', nombre: 'BUIGUES' } },
        facturas: Array.from({ length: cantidad }, (_, i) => ({ lineasDetalle: [{ descripcion: `item ${i + 1}` }] }))
    };
}

async function correrLote(grupos, pdvAfip, modoTest = false) {
    const llamadas = [];
    const iniciarProceso = async (url, cred, datos) => {
        llamadas.push(datos.puntoVenta);
        datos.pdvHabilitadosAfip = pdvAfip;   // lo que hace el paso 0
        return pdvAfip.includes(datos.puntoVenta)
            ? { success: true, message: 'ok', data: { resultados: [{ pdfPath: `/f${llamadas.length}.pdf` }] } }
            : { success: false, message: `El punto de venta ${datos.puntoVenta} no está habilitado` };
    };
    const cliente = { cuit: '27', puntosDeVenta: [] };
    const handlers = cargarHandlersConFalsos({ iniciarProceso, cliente });
    if (modoTest) grupos[0].datosComunes.modoTest = true;
    const evento = { sender: { send() {} } };

    const silencio = ['log', 'warn', 'error'].map(m => [m, console[m]]);
    silencio.forEach(([m]) => { console[m] = () => {}; });
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => realSetTimeout(fn, 0);   // sin las pausas de 2 s
    try {
        const resultado = await handlers['facturaTipificada:generarLote'](evento, { grupos });
        return { resultado, llamadas, cliente };
    } finally {
        global.setTimeout = realSetTimeout;
        silencio.forEach(([m, f]) => { console[m] = f; });
    }
}

test('lote: grupo 1 sale entero, grupo 2 con PDV no habilitado → corta en su 1ª factura', async () => {
    const { resultado, llamadas, cliente } = await correrLote(
        [grupo('00003', 2), grupo('00005', 3), grupo('00003', 1)],
        ['00003', '00004']
    );

    // 2 del grupo 1 + 1 intento del grupo 2; el grupo 3 ni se intenta.
    assert.deepStrictEqual(llamadas, ['00003', '00003', '00005']);
    assert.deepStrictEqual(resultado.pdvNoHabilitado, { habilitados: ['00003', '00004'], elegido: '00005' });
    assert.deepStrictEqual(resultado.gruposEmitidos, [0]);
    assert.deepStrictEqual(resultado.resultados.map(r => [r.grupo, r.success]), [[0, true], [0, true], [1, false]]);
    assert.deepStrictEqual(cliente.pdvHabilitadosFacturacion.numeros, ['00003', '00004']);
});

test('lote: PDV no habilitado en el 1er grupo → nada emitido, un solo intento', async () => {
    const { resultado, llamadas } = await correrLote([grupo('00005', 3), grupo('00003', 1)], ['00003']);
    assert.deepStrictEqual(llamadas, ['00005']);
    assert.deepStrictEqual(resultado.gruposEmitidos, []);
    assert.strictEqual(resultado.pdvNoHabilitado.elegido, '00005');
});

test('lote sin problemas de PDV → todo emitido, sin corte', async () => {
    const { resultado, llamadas } = await correrLote([grupo('00003', 2), grupo('00004', 1)], ['00003', '00004']);
    assert.strictEqual(llamadas.length, 3);
    assert.strictEqual(resultado.pdvNoHabilitado, null);
    assert.deepStrictEqual(resultado.gruposEmitidos, [0, 1]);
});

test('lote en modo prueba con PDV no habilitado → devuelve pdvNoHabilitado', async () => {
    const { resultado, llamadas } = await correrLote([grupo('00005', 2)], ['00003'], true);
    assert.deepStrictEqual(llamadas, ['00005']);
    assert.strictEqual(resultado.success, false);
    assert.strictEqual(resultado.modoTest, true);
    assert.strictEqual(resultado.pdvNoHabilitado.elegido, '00005');
});
