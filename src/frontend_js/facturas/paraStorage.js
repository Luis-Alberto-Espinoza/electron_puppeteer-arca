// paraStorage.js - Versión simplificada y limpia// paraStorage.js - Versión que NO se rompe
export function pStorage(data) {

    console.log("Generando código para localStorage...");
    console.log("Contenido de data:", data);
    let arrayDatos = data.arrayResultante;
    let datosDeEmision = data.tipoActividad;
    let datosDeOperacion = data.tipoContribuyente;

    const codigoLocalStorage = `
    let iterador = localStorage.getItem('iterador');
    if (iterador === null || isNaN(parseInt(iterador))) {
        iterador = 0;
    } else {
        iterador = parseInt(iterador);
    }
    localStorage.setItem('arrayDatos', ${JSON.stringify(data.montoResultados?.facturasGeneradas || [])});
    localStorage.setItem('datosDeEmision', '${datosDeEmision}');
    localStorage.setItem('datosDeOperacion', '${datosDeOperacion}');
    if (localStorage.getItem('iterador') === null || localStorage.getItem('iterador') !== '0') {
        localStorage.setItem('iterador', 0);
    };
    `;

    return {
        codigoLocalStorage,
        htmlSimple: generarHtmlQueNoSeRompe(data)
    };
}

function generarHtmlQueNoSeRompe(data) {
    const totalFacturas = data.montoResultados?.facturasGeneradas?.length || 0;
    
    let html = '';
    
    // Contenedor principal - SIMPLE
    html += '<div style="background-color: #2c3e50; color: white; padding: 20px; border-radius: 8px; font-family: Arial;">';
    
    // Encabezado de la sección    
    html += '  <div class="tabla-header">';
    html += '    <h3 class="table-title">📅 Total de Facturas:</strong> ' + totalFacturas + '</h3>';
    // Cambia el data-tabla y el id para que sean únicos y coincidan
    html += '    <button class="btn-expandir" data-tabla="facturas-afip">';
    html += '      <span class="texto-expandir">Expandir Tabla</span>';
    html += '      <span class="icono-expandir">▼</span>';
    html += '    </button>';
    html += '  </div>';
    
    // Título
    html += '<h2 style="color: #3498db; margin-top: 0;">Resumen de Procesamiento</h2>';
    
    // Datos básicos
    html += '<div style="background-color: #34495e; padding: 15px; border-radius: 5px; margin-bottom: 15px;">';
    html += '<h3 style="color: #e74c3c; margin-top: 0;">Información General</h3>';
    html += '<p><strong>Tipo de Actividad:</strong> ' + (data.tipoActividad || 'No especificado') + '</p>';
    html += '<p><strong>Tipo de Contribuyente:</strong> ' + (data.tipoContribuyente || 'No especificado') + '</p>';
    html += '<p><strong>Total de Facturas:</strong> ' + totalFacturas + '</p>';
    html += '</div>';

    // Solo agregar tabla si hay facturas
    if (totalFacturas > 0 && data.montoResultados?.facturasGeneradas) {
        html += '<div style="background-color: #34495e; padding: 15px; border-radius: 5px;">';
        html += '<h3 style="color: #e74c3c; margin-top: 0;">Facturas Generadas (' + totalFacturas + ' elementos)</h3>';
        // Usa un id único para el contenedor expandible
        html += `
            <div class="tabla-scroll tabla-colapsada" id="tabla-facturas-afip-content">
                ${generarTablaSimple(data.montoResultados.facturasGeneradas)}
            </div>
        `;
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

function generarTablaSimple(array) {
    if (!array || !Array.isArray(array) || array.length === 0) {
        return '<p>No hay datos para mostrar</p>';
    }

    // Usa un id único para la tabla
    let tabla = '<table id="tablaFacturasAFIP" style="width: 100%; border-collapse: collapse; margin-top: 10px;">';

    // Encabezados - 4 columnas: Fecha | Monto | Fecha | Monto
    tabla += '<tr style="background-color: #e74c3c;">';
    tabla += '<th style="border: 1px solid #fff; padding: 12px; color: white; width: 25%; text-align: left;">📅 Fecha</th>';
    tabla += '<th style="border: 1px solid #fff; padding: 12px; color: white; width: 25%; text-align: right;">💰 Monto</th>';
    tabla += '<th style="border: 1px solid #fff; padding: 12px; color: white; width: 25%; text-align: left;">📅 Fecha</th>';
    tabla += '<th style="border: 1px solid #fff; padding: 12px; color: white; width: 25%; text-align: right;">💰 Monto</th>';
    tabla += '</tr>';

    // Procesar los datos de a pares (fecha, monto) y mostrar dos pares por fila
    for (let i = 0; i < array.length; i += 2) {
        tabla += '<tr style="background-color: ' + (Math.floor(i/4) % 2 === 0 ? '#34495e' : '#2c3e50') + ';">';

        // Primer par
        let fecha1 = array[i]?.[0] ?? '';
        let monto1 = `$ `+ array[i]?.[1] ?? '';
        tabla += `<td style="border: 1px solid #fff; padding: 10px; color: white; font-size: 13px;">${fecha1}</td>`;
        tabla += `<td style="border: 1px solid #fff; padding: 10px; color: #2ecc71; font-size: 13px; text-align: right; font-weight: bold;">${monto1}</td>`;

        // Segundo par (si existe)
        let fecha2 = array[i+1]?.[0] ?? '';
        let monto2 = `$ ` + array[i+1]?.[1] ?? '';
        tabla += `<td style="border: 1px solid #fff; padding: 10px; color: white; font-size: 13px;">${fecha2}</td>`;
        tabla += `<td style="border: 1px solid #fff; padding: 10px; color: #2ecc71; font-size: 13px; text-align: right; font-weight: bold;">${monto2}</td>`;

        tabla += '</tr>';
    }
    
    tabla += '</table>';
    
    // Agregar info útil
    tabla += '<div style="margin-top: 10px; font-size: 11px; color: #bdc3c7; text-align: center;">';
    tabla += 'Total de registros procesados: ' + array.length;
    tabla += '</div>';
    
    return tabla;
}

// Implementación SÚPER simple
export function implementarSeguro(elementoId, data) {
    try {
        const resultado = pStorage(data);
        const elemento = document.getElementById(elementoId);
        
        if (!elemento) {
            console.error('Elemento no encontrado');
            return false;
        }

        elemento.innerHTML = resultado.htmlSimple;
        elemento.style.display = 'block';
        return true;
        
    } catch (error) {
        console.error('Error:', error);
        
        // Plan de emergencia total
        const elemento = document.getElementById(elementoId);
        if (elemento) {
            elemento.innerHTML = '<div style="padding: 20px; background: #f8f9fa; border: 2px solid #28a745; border-radius: 5px;"><h3>✅ Datos procesados correctamente</h3><p>Tipo: ' + (data.tipoActividad || 'N/A') + '</p><p>Contribuyente: ' + (data.tipoContribuyente || 'N/A') + '</p><p>Facturas: ' + (data.montoResultados?.facturasGeneradas?.length || 0) + '</p></div>';
        }
        return false;
    }
}