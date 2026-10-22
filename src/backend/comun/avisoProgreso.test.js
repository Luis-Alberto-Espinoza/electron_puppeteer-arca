const { test } = require('node:test');
const assert = require('node:assert');
const { crearAvisoProgreso } = require('./avisoProgreso.js');

test('aviso de cliente: contrato completo y el nombre NO va en el mensaje', () => {
    const avisos = [];
    const aviso = crearAvisoProgreso(a => avisos.push(a), 3);
    const avisarCliente = aviso.paraCliente({ id: 7, cuit: '30718985699', nombre: 'LANDES S. A. S.' });

    avisarCliente('info', 'Iniciando sesión en ATM...');

    assert.deepStrictEqual(avisos[0], {
        tipo: 'progreso', id: 7, cuit: '30718985699', nombre: 'LANDES S. A. S.',
        estado: 'info', mensaje: 'Iniciando sesión en ATM...', procesados: 0, total: 3
    });
});

test('procesados avanza solo con clienteTerminado (no con los "error"/"exito" de mitad de camino)', () => {
    const avisos = [];
    const aviso = crearAvisoProgreso(a => avisos.push(a), 2);

    const primero = aviso.paraCliente({ id: 1, nombre: 'A' });
    primero('error', 'Retención X: no se pudo abrir');   // el flujo sigue después de esto
    primero('exito_final', 'Listo');
    aviso.clienteTerminado();
    aviso.paraCliente({ id: 2, nombre: 'B' })('info', 'Arrancando');
    aviso.clienteTerminado();
    aviso.clienteTerminado();                             // de más: no pasa del total

    assert.deepStrictEqual(avisos.map(a => a.procesados), [0, 0, 1]);
    aviso.finalizado('Fin');
    assert.strictEqual(avisos.at(-1).procesados, 2);
    assert.strictEqual(avisos.at(-1).tipo, 'finalizado');
});

test('datos extra: pisan estado y mensaje (como antes), pero no el cliente ni el contador', () => {
    const avisos = [];
    const aviso = crearAvisoProgreso(a => avisos.push(a), 1);
    aviso.paraCliente({ id: 1, cuit: '20111111112', nombre: 'A' })('exito_final', 'genérico', {
        mensaje: 'Constancia fiscal procesada (sin deuda).',
        files: ['/x.pdf'], id: 999, nombre: 'otro', total: 50
    });

    const a = avisos[0];
    assert.strictEqual(a.mensaje, 'Constancia fiscal procesada (sin deuda).');
    assert.deepStrictEqual(a.files, ['/x.pdf']);
    assert.strictEqual(a.id, 1);
    assert.strictEqual(a.nombre, 'A');
    assert.strictEqual(a.total, 1);
});

test('si mandar el aviso explota, el servicio sigue', () => {
    const aviso = crearAvisoProgreso(() => { throw new Error('ventana cerrada'); }, 1);
    const errorOriginal = console.error;
    console.error = () => {};
    try {
        assert.doesNotThrow(() => aviso.paraCliente({ id: 1 })('info', 'hola'));
        assert.doesNotThrow(() => aviso.general('hola'));
    } finally {
        console.error = errorOriginal;
    }
});
