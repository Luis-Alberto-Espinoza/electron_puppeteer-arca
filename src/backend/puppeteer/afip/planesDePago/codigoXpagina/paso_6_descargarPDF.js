/**
 * PASO 6: Generar PDF del detalle de pagos
 *
 * Recibe los datos ya extraídos por paso_5 (cuotasAgrupadas + totales + info plan).
 * Renderiza una tabla similar a la de AFIP: la cuota padre usa rowspan sobre las
 * celdas de Cuota N°, Capital y Estado; las sub-filas solo muestran los datos
 * de intereses y totales por vencimiento.
 */

const path = require('path');
const { getDownloadPath } = require('../../../../utils/fileManager.js');
const { launchBrowser } = require('../../../../puppeteer/archivos_comunes/navegador/browserLauncher.js');

async function ejecutar(datosTabla, infoPlan, usuario, cuitConsulta, downloadsPath) {
    let tempBrowser = null;

    try {
        const numeroPlan = infoPlan.numero || 'SinNumero';
        console.log(`  → Paso 6: Generando PDF del plan #${numeroPlan}...`);

        const nombreUsuario = usuario.nombre || 'sin_nombre';
        const downloadDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_afip');
        const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
        const fechaDescarga = new Date().toISOString().slice(0, 10);
        const finalFilename = `PlanDePago_${cuitLimpio}_Plan${numeroPlan}_${fechaDescarga}.pdf`;
        const destPath = path.join(downloadDir, finalFilename);

        const htmlReporte = generarHTMLReporte(datosTabla, infoPlan, cuitLimpio, fechaDescarga);

        console.log('  → Generando PDF en headless...');
        tempBrowser = await launchBrowser({ headless: 'new' });
        const tempPage = await tempBrowser.newPage();

        await tempPage.setContent(htmlReporte, { waitUntil: 'domcontentloaded' });

        await tempPage.pdf({
            path: destPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' }
        });

        await tempPage.close();

        console.log(`  ✅ PDF guardado: ${finalFilename}`);

        return {
            success: true,
            pdfPath: destPath,
            pdfNombre: finalFilename,
            downloadDir
        };

    } catch (error) {
        console.error('  ❌ Error en paso_6_descargarPDF:', error.message);
        return { success: false, message: error.message };
    } finally {
        if (tempBrowser) {
            try { await tempBrowser.close(); } catch (e) { /* ignorar */ }
        }
    }
}

function generarHTMLReporte(datosTabla, infoPlan, cuit, fecha) {
    const { cuotasAgrupadas, totales } = datosTabla;

    // Info del plan en el encabezado
    const infoPlanItems = [];
    if (infoPlan.presentacion) infoPlanItems.push(`Presentación: ${infoPlan.presentacion}`);
    if (infoPlan.cuotas) infoPlanItems.push(`Cuotas: ${infoPlan.cuotas}`);
    if (infoPlan.tipo) infoPlanItems.push(`Tipo: ${infoPlan.tipo}`);
    if (infoPlan.consolidado) infoPlanItems.push(`Consolidado: $${infoPlan.consolidado}`);
    if (infoPlan.situacion) infoPlanItems.push(`Situación: ${infoPlan.situacion}`);

    const infoPlanHTML = infoPlanItems.length > 0
        ? `<p class="info-plan">${infoPlanItems.join(' | ')}</p>`
        : '';

    const encabezadosHTML = `
        <tr>
            <th>Cuota N°</th>
            <th>Capital ($)</th>
            <th>Interés Financiero ($)</th>
            <th>Interés Resarcitorio ($)</th>
            <th>Total ($)</th>
            <th>Fecha Venc.</th>
            <th>Pago</th>
            <th>Estado de Cuota</th>
        </tr>
    `;

    const cuerpoHTML = (cuotasAgrupadas || []).map((cuota, idx) => {
        const bgClass = idx % 2 === 0 ? 'fila-par' : 'fila-impar';
        const estadoClass = cuota.estaImpaga ? 'estado-impaga' :
                            cuota.fueCancelada ? 'estado-cancelada' : '';

        const intentos = cuota.intentos || [];
        const rowspan = intentos.length || 1;

        // Primera fila (con rowspan en CuotaNro, Capital, Estado)
        const primerIntento = intentos[0] || {};
        const pagoCell = renderizarCeldaPago(primerIntento);

        let filaPrincipal = `
            <tr class="${bgClass}">
                <td rowspan="${rowspan}" class="col-cuota">${cuota.cuotaNro || ''}</td>
                <td rowspan="${rowspan}" class="col-capital">${cuota.capital || ''}</td>
                <td>${primerIntento.interesFinanciero || ''}</td>
                <td>${primerIntento.interesResarcitorio || ''}</td>
                <td>${primerIntento.total || ''}</td>
                <td>${primerIntento.fecha || ''}</td>
                <td>${pagoCell}</td>
                <td rowspan="${rowspan}" class="col-estado ${estadoClass}">${cuota.estado || ''}</td>
            </tr>
        `;

        // Sub-filas (intentos siguientes)
        const subFilas = intentos.slice(1).map(intento => {
            const pago = renderizarCeldaPago(intento);
            return `
                <tr class="${bgClass} sub-fila">
                    <td>${intento.interesFinanciero || ''}</td>
                    <td>${intento.interesResarcitorio || ''}</td>
                    <td>${intento.total || ''}</td>
                    <td>${intento.fecha || ''}</td>
                    <td>${pago}</td>
                </tr>
            `;
        }).join('');

        return filaPrincipal + subFilas;
    }).join('');

    // Fila de totales
    let filaTotalesHTML = '';
    if (totales) {
        filaTotalesHTML = `
            <tr class="fila-totales">
                <td>Total Pagado:</td>
                <td>$ ${totales.capitalPagado || '0,00'}</td>
                <td>$ ${totales.interesFinancieroPagado || '0,00'}</td>
                <td>$ ${totales.moraPagada || '0,00'}</td>
                <td>$ ${totales.totalPagado || '0,00'}</td>
                <td colspan="3"></td>
            </tr>
        `;
    }

    const cantCuotas = (cuotasAgrupadas || []).length;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0; padding: 0; color: #333; font-size: 10px;
        }
        .header {
            text-align: center; padding: 8px 0 10px;
            border-bottom: 2px solid #2c3e50; margin-bottom: 12px;
        }
        .header h1 { margin: 0; font-size: 15px; color: #2c3e50; }
        .header .subtitulo { margin: 4px 0 0; font-size: 11px; color: #666; }
        .info-plan { margin: 5px 0 0; font-size: 10px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th {
            background: #2c3e50; color: white; padding: 5px 6px;
            font-size: 9px; text-align: center;
            border: 1px solid #34495e; white-space: nowrap;
        }
        td {
            padding: 4px 6px; font-size: 9px; text-align: right;
            border: 1px solid #ddd;
        }
        .col-cuota, .col-estado { text-align: center; vertical-align: middle; }
        .col-capital { vertical-align: middle; }
        .sub-fila td { font-size: 9px; color: #555; }
        .fila-par { background: #ffffff; }
        .fila-impar { background: #f5f5f5; }
        .estado-impaga { background: #f8d7da !important; color: #a94442; font-weight: bold; }
        .estado-cancelada { background: #dff0d8 !important; color: #3c763d; }
        .fila-totales {
            background: #d9edf7 !important;
            font-weight: bold; color: #31708f;
        }
        .fila-totales td { text-align: center; }
        .motivo-fallido {
            color: #a94442; font-style: italic; font-size: 8px;
        }
        .motivo-pagado {
            color: #3c763d; font-weight: bold;
        }
        .footer {
            margin-top: 12px; text-align: center; font-size: 8px; color: #999;
            border-top: 1px solid #ddd; padding-top: 6px;
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
        <thead>${encabezadosHTML}</thead>
        <tbody>
            ${cuerpoHTML}
            ${filaTotalesHTML}
        </tbody>
    </table>

    <div class="footer">
        Generado automáticamente | Mis Facilidades - AFIP | ${cantCuotas} cuota(s)
    </div>
</body>
</html>`;
}

function renderizarCeldaPago(intento) {
    if (!intento) return '';
    if (intento.fuePagado) {
        return '<span class="motivo-pagado">Pago</span>';
    }
    if (intento.fueFallido && intento.motivo) {
        return `<span class="motivo-fallido">${intento.motivo}</span>`;
    }
    return intento.motivoTexto || '';
}

module.exports = { ejecutar };
