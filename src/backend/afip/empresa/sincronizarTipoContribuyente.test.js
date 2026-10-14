// Tests del tipo de contribuyente deducido del sistema de los PDV.
// Correr: node --test src/backend/afip/empresa/sincronizarTipoContribuyente.test.js
//
// Por qué importa: sin tipo (B/C) la facturación simple no sabe qué comprobante
// emitir y abortaba adentro de AFIP (caso real: BUIGUES NOELIA ALEJANDRA, monotributista
// con tipoContribuyente vacío). El dato ya estaba en el `sistema` de sus PDV.

const test = require('node:test');
const assert = require('node:assert');
const { sincronizarTipoContribuyente } = require('./empresaManager.js');
const { tipoContribuyenteDesdePuntosDeVenta } = require('../../cliente/model.js');
const { normalizarContribuyente } = require('../../cliente/contribuyenteRepo.js');

const MONO = { numero: '00008', sistema: 'Factura en Linea - Monotributo' };
const RI = { numero: '00002', sistema: 'Factura en Linea - Responsable Inscripto' };
const SIN_SISTEMA = { numero: '00003', sistema: null };

test('todos Monotributo → C; todos RI → B', () => {
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta([MONO, { ...MONO, numero: '00009' }]), 'C');
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta([RI]), 'B');
});

test('tolera mayúsculas y espacios de más en el sistema', () => {
    assert.strictEqual(
        tipoContribuyenteDesdePuntosDeVenta([{ numero: '00001', sistema: '  FACTURA EN LINEA  -  MONOTRIBUTO ' }]),
        'C'
    );
});

test('PDV mezclados (cambio de categoría) → null: no adivina', () => {
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta([MONO, RI]), null);
});

test('sin sistema o sin PDV → null; los PDV sin sistema no cuentan', () => {
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta([SIN_SISTEMA]), null);
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta([]), null);
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta(undefined), null);
    assert.strictEqual(tipoContribuyenteDesdePuntosDeVenta([SIN_SISTEMA, MONO]), 'C');
});

test('análisis: completa el tipo vacío', () => {
    const fila = { cuit: '24306881619', tipoContribuyente: null };
    assert.deepStrictEqual(sincronizarTipoContribuyente(fila, [MONO]), { tipoContribuyente: 'C' });
});

test('análisis: gana AFIP aunque se haya cargado otro a mano', () => {
    const fila = { cuit: '24306881619', tipoContribuyente: 'B' };
    assert.deepStrictEqual(sincronizarTipoContribuyente(fila, [MONO]), { tipoContribuyente: 'C' });
});

test('análisis: no toca si ya coincide o si los PDV no definen tipo', () => {
    assert.deepStrictEqual(sincronizarTipoContribuyente({ cuit: '1', tipoContribuyente: 'C' }, [MONO]), {});
    assert.deepStrictEqual(sincronizarTipoContribuyente({ cuit: '1', tipoContribuyente: 'B' }, [MONO, RI]), {});
    assert.deepStrictEqual(sincronizarTipoContribuyente({ cuit: '1', tipoContribuyente: 'B' }, [SIN_SISTEMA]), {});
});

test('al leer: cliente ya analizado con tipo vacío lo deduce de sus PDV guardados', () => {
    const c = normalizarContribuyente({ cuit: '24306881619', razonSocial: 'BUIGUES NOELIA ALEJANDRA', puntosDeVenta: [MONO] });
    assert.strictEqual(c.tipoContribuyente, 'C');
});

test('al leer: un tipo cargado no se pisa (eso lo decide el análisis, que lo loguea)', () => {
    const c = normalizarContribuyente({ cuit: '24306881619', razonSocial: 'X', tipoContribuyente: 'B', puntosDeVenta: [MONO] });
    assert.strictEqual(c.tipoContribuyente, 'B');
});

test('PDV habilitados por Comprobantes en línea: se normalizan y sobreviven a la lectura', () => {
    const c = normalizarContribuyente({
        cuit: '24306881619', razonSocial: 'X',
        pdvHabilitadosFacturacion: { numeros: ['3', '00008'], fecha: '2026-10-09T15:00:00.000Z' }
    });
    assert.deepStrictEqual(c.pdvHabilitadosFacturacion, { numeros: ['00003', '00008'], fecha: '2026-10-09T15:00:00.000Z' });
    assert.strictEqual(normalizarContribuyente({ cuit: '1', razonSocial: 'X' }).pdvHabilitadosFacturacion, null);
});
