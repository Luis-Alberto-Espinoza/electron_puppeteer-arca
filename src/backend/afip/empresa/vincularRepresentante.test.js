// Tests del vínculo automático empresa → representante que hace el barrido.
// Correr: node --test src/backend/afip/empresa/vincularRepresentante.test.js
//
// Contexto: si AFIP nos mostró una empresa entrando con la clave de otro CUIT, la
// representación existe en el organismo. Antes eso solo se guardaba al CREAR la fila;
// las empresas ya dadas de alta había que vincularlas a mano con el select.

const test = require('node:test');
const assert = require('node:assert');
const { vincularConRepresentante } = require('./empresaManager.js');
const { crearContribuyenteRepo } = require('../../cliente/contribuyenteRepo.js');

const REP = '20263147074';

test('vincula una empresa que no tenía representante', () => {
    const fila = { cuit: '30708867094', razonSocial: 'LAS AMARILLAS S.A.', representanteAfipCuit: null };
    assert.deepStrictEqual(
        vincularConRepresentante(fila, REP),
        { representanteAfipCuit: REP }
    );
});

test('no se representa a sí misma cuando la empresa ES el login', () => {
    const fila = { cuit: REP, razonSocial: 'SANTONI MARIANO HUGO', representanteAfipCuit: null };
    assert.deepStrictEqual(vincularConRepresentante(fila, REP), {});
});

test('no reescribe si ya estaba vinculada al mismo representante', () => {
    const fila = { cuit: '30714109282', razonSocial: 'VASA S.A.', representanteAfipCuit: REP };
    assert.deepStrictEqual(vincularConRepresentante(fila, REP), {});
});

test('acepta el CUIT como número o string indistintamente', () => {
    const fila = { cuit: 30714109282, razonSocial: 'VASA S.A.', representanteAfipCuit: Number(REP) };
    assert.deepStrictEqual(vincularConRepresentante(fila, Number(REP)), {});
});

test('reasigna si el login que la vio es OTRO representante', () => {
    const fila = { cuit: '30714109282', razonSocial: 'VASA S.A.', representanteAfipCuit: '20266865458' };
    assert.deepStrictEqual(
        vincularConRepresentante(fila, REP),
        { representanteAfipCuit: REP }
    );
});

// El efecto destructivo es una decisión tomada, no un accidente: este test lo fija
// para que si alguien cambia la invariante se entere acá y no en producción.
test('DESTRUCTIVO: vincular borra la clave AFIP propia y resetea su estado', async () => {
    let datos = [
        {
            id: 1, cuit: '30714899461', tipo: 'juridica', razonSocial: 'AGROGLOBAL MENDOZA SA',
            claveAFIP: 'claveBuena', estado_afip: 'validado', representanteAfipCuit: null,
            claveATM: 'estudio210', estado_atm: 'validado', grupoId: 'g_mrxmz1x2qurs'
        }
    ];
    const repo = crearContribuyenteRepo({
        cargar: () => JSON.parse(JSON.stringify(datos)),
        guardar: (l) => { datos = JSON.parse(JSON.stringify(l)); }
    });

    const previo = await repo.getByCuit('30714899461');
    assert.strictEqual(previo.claveAFIP, 'claveBuena');

    await repo.actualizar('30714899461', vincularConRepresentante(previo, REP));

    const despues = await repo.getByCuit('30714899461');
    assert.strictEqual(despues.representanteAfipCuit, REP);
    assert.strictEqual(despues.claveAFIP, null, 'la clave propia se borra por la invariante');
    assert.strictEqual(despues.estado_afip, 'no_aplica');
    // Lo de ATM y el estudio NO se toca: el barrido es de AFIP.
    assert.strictEqual(despues.claveATM, 'estudio210');
    assert.strictEqual(despues.estado_atm, 'validado');
    assert.strictEqual(despues.grupoId, 'g_mrxmz1x2qurs');
});

test('tras vincular, el resolver entra con la clave del representante', async () => {
    let datos = [
        { id: 1, cuit: REP, tipo: 'fisica', razonSocial: 'SANTONI MARIANO HUGO', claveAFIP: 'claveRep', estado_afip: 'validado' },
        { id: 2, cuit: '30714109282', tipo: 'juridica', razonSocial: 'VASA S.A.', claveAFIP: 'claveVieja', estado_afip: 'validado' }
    ];
    const repo = crearContribuyenteRepo({
        cargar: () => JSON.parse(JSON.stringify(datos)),
        guardar: (l) => { datos = JSON.parse(JSON.stringify(l)); }
    });

    const previo = await repo.getByCuit('30714109282');
    await repo.actualizar('30714109282', vincularConRepresentante(previo, REP));

    const acceso = await repo.resolverAcceso('30714109282', 'afip');
    assert.strictEqual(acceso.loginCuit, REP);
    assert.strictEqual(acceso.loginClave, 'claveRep');
    assert.strictEqual(acceso.objetivoCuit, '30714109282');
    assert.strictEqual(acceso.requiereElegirEmpresa, true);
});
