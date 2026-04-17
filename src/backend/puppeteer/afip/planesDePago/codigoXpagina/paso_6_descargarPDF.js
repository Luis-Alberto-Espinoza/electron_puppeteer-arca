/**
 * PASO 6: Generar PDF del detalle de pagos
 *
 * Recibe los datos ya extraídos por paso_5 (encabezados + filas) y la info
 * del plan desde la página. Genera un PDF formateado como reporte
 * usando un navegador headless temporal.
 *
 * No depende del botón "Imprimir" (que solo abre chrome://print/).
 */

const path = require('path');
const { getDownloadPath } = require('../../../../utils/fileManager.js');
const { launchBrowser } = require('../../../../puppeteer/archivos_comunes/navegador/browserLauncher.js');

/**
 * @param {Object} datosTabla - { pagos: [...], encabezados: [...] } de paso_5
 * @param {Object} infoPlan - Datos del plan (numero, cuotas, tipo, etc.)
 * @param {Object} usuario - Datos del representante
 * @param {string} cuitConsulta - CUIT consultado
 * @param {string} downloadsPath - Ruta base de descargas
 */
async function ejecutar(datosTabla, infoPlan, usuario, cuitConsulta, downloadsPath) {
    let tempBrowser = null;

    try {
        const numeroPlan = infoPlan.numero || 'SinNumero';
        console.log(`  → Paso 6: Generando PDF del plan #${numeroPlan}...`);

        // 1. Preparar directorio y nombre de archivo
        const nombreUsuario = usuario.nombre || 'sin_nombre';
        const downloadDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_afip');
        const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
        const fechaDescarga = new Date().toISOString().slice(0, 10);
        const finalFilename = `PlanDePago_${cuitLimpio}_Plan${numeroPlan}_${fechaDescarga}.pdf`;
        const destPath = path.join(downloadDir, finalFilename);

        // 2. Construir HTML del reporte
        const htmlReporte = generarHTMLReporte(datosTabla, infoPlan, cuitLimpio, fechaDescarga);

        // 3. Generar PDF en navegador headless temporal
        console.log('  → Generando PDF en headless...');
        tempBrowser = await launchBrowser({ headless: 'new' });
        const tempPage = await tempBrowser.newPage();

        await tempPage.setContent(htmlReporte, { waitUntil: 'domcontentloaded' });

        await tempPage.pdf({
            path: destPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '10mm',
                right: '10mm'
            }
        });

        await tempPage.close();

        console.log(`  ✅ PDF guardado: ${finalFilename}`);
        console.log(`     Ruta: ${destPath}`);

        return {
            success: true,
            pdfPath: destPath,
            pdfNombre: finalFilename,
            downloadDir
        };

    } catch (error) {
        console.error('  ❌ Error en paso_6_descargarPDF:', error.message);
        return {
            success: false,
            message: error.message
        };
    } finally {
        if (tempBrowser) {
            try { await tempBrowser.close(); } catch (e) { /* ignorar */ }
        }
    }
}

/**
 * Genera HTML formateado como reporte para convertir a PDF
 */
function generarHTMLReporte(datosTabla, infoPlan, cuit, fecha) {
    const { encabezados, pagos } = datosTabla;

    // Info del plan en el encabezado
    const infoPlanItems = [];
    if (infoPlan.presentacion) infoPlanItems.push(`Presentación: ${infoPlan.presentacion}`);
    if (infoPlan.cuotas) infoPlanItems.push(`Cuotas: ${infoPlan.cuotas}`);
    if (infoPlan.tipo) infoPlanItems.push(`Tipo: ${infoPlan.tipo}`);
    if (infoPlan.consolidado) infoPlanItems.push(`Consolidado: $${infoPlan.consolidado}`);
    if (infoPlan.situacion) infoPlanItems.push(`Situación: ${infoPlan.situacion}`);

    const infoPlanHTML = infoPlanItems.length > 0
        ? `<p style="margin:5px 0 0; font-size:10px; color:#555;">${infoPlanItems.join(' | ')}</p>`
        : '';

    // Tabla de pagos
    const thHTML = (encabezados || []).map(h =>
        `<th>${h}</th>`
    ).join('');

    const trHTML = (pagos || []).map((pago, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#f5f5f5';
        const valores = [
            pago.cuotaNro, pago.capital, pago.interesFinanciero,
            pago.interesResarcitorio, pago.total, pago.fechaVencimiento,
            pago.pago, pago.estadoCuota
        ];
        const tds = valores.map(v => `<td>${v || ''}</td>`).join('');
        return `<tr style="background:${bg};">${tds}</tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            font-size: 10px;
        }
        .header {
            text-align: center;
            padding: 8px 0 10px;
            border-bottom: 2px solid #2c3e50;
            margin-bottom: 12px;
        }
        .header h1 {
            margin: 0;
            font-size: 15px;
            color: #2c3e50;
        }
        .header .subtitulo {
            margin: 4px 0 0;
            font-size: 11px;
            color: #666;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #2c3e50;
            color: white;
            padding: 5px 6px;
            font-size: 9px;
            text-align: center;
            border: 1px solid #34495e;
            white-space: nowrap;
        }
        td {
            padding: 4px 6px;
            font-size: 9px;
            text-align: center;
            border: 1px solid #ddd;
        }
        .footer {
            margin-top: 12px;
            text-align: center;
            font-size: 8px;
            color: #999;
            border-top: 1px solid #ddd;
            padding-top: 6px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Detalle de Pagos - Plan N° ${infoPlan.numero || ''}</h1>
        <p class="subtitulo">CUIT: ${cuit} | Fecha de consulta: ${fecha}</p>
        ${infoPlanHTML}
    </div>

    <table>
        <thead><tr>${thHTML}</tr></thead>
        <tbody>${trHTML}</tbody>
    </table>

    <div class="footer">
        Generado automáticamente | Mis Facilidades - AFIP | ${pagos ? pagos.length : 0} cuota(s)
    </div>
</body>
</html>`;
}

module.exports = { ejecutar };
