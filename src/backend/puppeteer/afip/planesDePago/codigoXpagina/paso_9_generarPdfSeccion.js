/**
 * PASO 9: Generar el PDF de una sección del plan (Plan de Pago /
 * Obligaciones Impositivas / Obligaciones Previsionales)
 *
 * Recibe el modelo genérico de paso_8 y lo dibuja en HTML propio → page.pdf()
 * en un headless temporal (patrón paso_6). Las celdas de mergeCols se unen
 * verticalmente dentro de cada bloque (el rowspan de AFIP: cuota + capital).
 * El Excel NO se arma acá: va en el Excel por plan (afip/planesDePago/excelPlan.js).
 */

const path = require('path');
const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');
const { launchBrowser } = require('../../../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { parseNumero } = require('../../../../afip/planesDePago/datosResumenBuilder.js');
const { armarSubtitulo } = require('../../../../afip/planesDePago/excelPlan.js');

async function ejecutar(modelo, seccion, plan, cuitConsulta, downloadsPath) {
    const numeroPlan = plan.numero || 'SinNumero';
    console.log(`  → Paso 9: Generando PDF de "${seccion.etiqueta}" del plan #${numeroPlan}...`);

    const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuitConsulta, '', 'archivos_afip');
    const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
    const fechaDescarga = new Date().toISOString().slice(0, 10);
    const base = `${seccion.prefijo}_${cuitLimpio}_Plan${numeroPlan}_${fechaDescarga}`;
    const titulo = `${seccion.etiqueta} - Plan N° ${numeroPlan}`;
    const subtitulo = armarSubtitulo(modelo.cabecera, cuitLimpio, fechaDescarga);

    const resultado = { success: false, downloadDir, pdf: null };

    let tempBrowser = null;
    try {
        const pdfNombre = `${base}.pdf`;
        const pdfPath = path.join(downloadDir, pdfNombre);
        tempBrowser = await launchBrowser({ headless: 'new' });
        const tempPage = await tempBrowser.newPage();
        await tempPage.setContent(generarHTML(modelo, titulo, subtitulo), { waitUntil: 'domcontentloaded' });
        await tempPage.pdf({
            path: pdfPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '12mm', bottom: '12mm', left: '8mm', right: '8mm' }
        });
        resultado.pdf = { path: pdfPath, nombre: pdfNombre };
        console.log(`  ✅ PDF guardado: ${pdfNombre}`);
    } catch (error) {
        console.error('  ❌ Error generando PDF (paso_9):', error.message);
    } finally {
        if (tempBrowser) { try { await tempBrowser.close(); } catch (_) {} }
    }

    resultado.success = !!resultado.pdf;
    return resultado;
}

// Montos con formato AR uniforme (AFIP a veces manda "1068960,07" sin miles). "-" queda igual.
const formatearMonto = (v) => (v === '' || v === '-') ? v
    : parseNumero(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function generarHTML(modelo, titulo, subtitulo) {
    const { columnas, bloques, mergeCols } = modelo;

    const thead = `<tr>${columnas.map(c => `<th>${escapar(c.titulo)}</th>`).join('')}</tr>`;

    let datos = 0;
    const tbody = bloques.map(bloque => {
        const clase = bloque.total ? 'fila-totales' : (datos++ % 2 === 0 ? 'fila-par' : 'fila-impar');
        const rowspan = bloque.filas.length;
        return bloque.filas.map((fila, i) => {
            const celdas = fila.map((valor, c) => {
                const unida = mergeCols.includes(c) && rowspan > 1;
                if (unida && i > 0) return '';
                const attrs = [
                    unida ? `rowspan="${rowspan}"` : '',
                    `class="${columnas[c] && columnas[c].numero ? 'num' : 'txt'}${unida ? ' unida' : ''}"`
                ].join(' ');
                const texto = columnas[c] && columnas[c].numero ? formatearMonto(valor) : valor;
                return `<td ${attrs}>${escapar(texto)}</td>`;
            }).join('');
            return `<tr class="${clase}${i > 0 ? ' sub-fila' : ''}">${celdas}</tr>`;
        }).join('');
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #333; font-size: 9px; }
        .header { text-align: center; padding: 6px 0 8px; border-bottom: 2px solid #2c3e50; margin-bottom: 10px; }
        .header h1 { margin: 0; font-size: 14px; color: #2c3e50; }
        .header p { margin: 4px 0 0; font-size: 10px; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { background: #2c3e50; color: white; padding: 4px 5px; font-size: 8px; text-align: center; border: 1px solid #34495e; }
        td { padding: 3px 5px; font-size: 8px; border: 1px solid #ddd; }
        td.num { text-align: right; white-space: nowrap; }
        td.txt { text-align: center; }
        td.unida { vertical-align: middle; }
        .fila-par { background: #ffffff; }
        .fila-impar { background: #f5f5f5; }
        .sub-fila td { color: #555; }
        .fila-totales { background: #d9edf7; font-weight: bold; color: #31708f; }
        .footer { margin-top: 10px; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #ddd; padding-top: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapar(titulo)}</h1>
        <p>${escapar(subtitulo)}</p>
    </div>
    <table>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
    </table>
    <div class="footer">Generado automáticamente | Mis Facilidades - AFIP | ${datos} fila(s)</div>
</body>
</html>`;
}

module.exports = { ejecutar };
