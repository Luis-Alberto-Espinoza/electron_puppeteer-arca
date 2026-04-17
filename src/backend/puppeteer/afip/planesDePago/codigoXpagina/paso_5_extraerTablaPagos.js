/**
 * PASO 5: Extraer datos de la tabla de pagos
 *
 * En detalle_pagos.aspx, extrae todos los datos de la tabla #tableDetallePagos.
 * Esta tabla NO tiene paginación (se renderiza completa como HTML largo).
 *
 * Columnas: Cuota N° | Capital($) | Interés Financiero($) | Interés Resarcitorio($) |
 *           Total($) | Fecha Venc. | Pago | Estado de Cuota
 */

async function ejecutar(page) {
    console.log('  → Paso 5: Extrayendo datos de la tabla de pagos...');

    // Esperar la tabla
    await page.waitForSelector('#tableDetallePagos', { timeout: 10000 });

    const resultado = await page.evaluate(() => {
        const tabla = document.getElementById('tableDetallePagos');
        if (!tabla) return { filas: [], encabezados: [] };

        // Extraer encabezados
        const ths = tabla.querySelectorAll('thead th');
        const encabezados = Array.from(ths).map(th => th.textContent.trim());

        // Extraer todas las filas (no hay paginación en esta tabla)
        const trs = tabla.querySelectorAll('tbody tr');
        const filas = Array.from(trs).map(fila => {
            const celdas = fila.querySelectorAll('td');
            return {
                cuotaNro: celdas[0] ? celdas[0].textContent.trim() : '',
                capital: celdas[1] ? celdas[1].textContent.trim() : '',
                interesFinanciero: celdas[2] ? celdas[2].textContent.trim() : '',
                interesResarcitorio: celdas[3] ? celdas[3].textContent.trim() : '',
                total: celdas[4] ? celdas[4].textContent.trim() : '',
                fechaVencimiento: celdas[5] ? celdas[5].textContent.trim() : '',
                pago: celdas[6] ? celdas[6].textContent.trim() : '',
                estadoCuota: celdas[7] ? celdas[7].textContent.trim() : ''
            };
        });

        return { filas, encabezados };
    });

    console.log(`  ✅ Extraídas ${resultado.filas.length} fila(s) de la tabla de pagos.`);

    return {
        success: true,
        pagos: resultado.filas,
        encabezados: resultado.encabezados,
        totalFilas: resultado.filas.length
    };
}

module.exports = { ejecutar };
