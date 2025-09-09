// Paso 1: Manejar el evento del botón
window.inicializarEventosExtraerTablasPDF = function() {
    const btnSeleccionarPDF = document.getElementById('selectPdf_extraerTabla_Btn');
    const btnProcesarPDF = document.getElementById('processPdf_extraerTablas_Btn');
    const pdfPathInput = document.getElementById('pdfPathInput');
    const statusMessage = document.getElementById('statusMessage');
    const csvPathDiv = document.createElement('div');
    csvPathDiv.id = 'csvPathDiv';
    csvPathDiv.style.marginTop = '10px';
    statusMessage.parentNode.appendChild(csvPathDiv);

    let rutaSeleccionada = '';
    let rutaCsvGenerado = '';

    // Debug: muestra si los elementos existen o no
    console.log('tablasPDF.js: Iniciando eventos para extraer tablas de PDF');
    console.log('btnSeleccionarPDF:', btnSeleccionarPDF);
    console.log('btnProcesarPDF:', btnProcesarPDF);
    console.log('pdfPathInput:', pdfPathInput);
    console.log('statusMessage:', statusMessage);

    if (!btnSeleccionarPDF || !btnProcesarPDF || !pdfPathInput || !statusMessage) {
        console.error('Faltan elementos del DOM para inicializar eventos de extraerTablasPDF');
        return;
    }

    btnSeleccionarPDF.addEventListener('click', async () => {
        console.log('Botón de seleccionar PDF clickeado');
        statusMessage.textContent = '';
        pdfPathInput.value = '';
        btnProcesarPDF.disabled = true;

        try {
            console.log('Llamando a seleccionarArchivo de electronAPI');
            // Usa el canal extraerTablasPDF
            const archivosSeleccionados = await window.electronAPI.extraerTablasPDF.seleccionarArchivo();
            if (archivosSeleccionados && archivosSeleccionados.length > 0) {
                console.log('Archivos seleccionados:', archivosSeleccionados);
                rutaSeleccionada = archivosSeleccionados[0];
                pdfPathInput.value = rutaSeleccionada;
                btnProcesarPDF.disabled = false;
                // Mostrar en consola del navegador
                console.log('Ruta seleccionada:', rutaSeleccionada);
            } else {
                statusMessage.textContent = 'No se seleccionó ningún archivo.';
            }
        } catch (err) {
            statusMessage.textContent = 'Error al seleccionar archivo: ' + err.message;
        }
    });

    btnProcesarPDF.addEventListener('click', async () => {
        if (!rutaSeleccionada) {
            statusMessage.textContent = 'Selecciona un archivo PDF primero.';
            return;
        }
        statusMessage.textContent = 'Procesando PDF...';
        btnProcesarPDF.disabled = true;
        csvPathDiv.innerHTML = '';

        try {
            // Usa el canal extraerTablasPDF
            const resultado = await window.electronAPI.extraerTablasPDF.procesarArchivo(rutaSeleccionada);

            if (resultado && resultado.success) {
                statusMessage.textContent = '¡PDF procesado exitosamente!';
                if (resultado.csvPath) {
                    rutaCsvGenerado = resultado.csvPath;
                    // Mostrar la ruta y el botón para abrir
                    csvPathDiv.innerHTML = `
                        <span>Archivo CSV generado:</span>
                        <input type="text" value="${rutaCsvGenerado}" readonly style="width:60%;margin:5px;">
                        <button id="abrirCsvBtn" style="margin-left:10px;">Abrir CSV</button>
                    `;
                    document.getElementById('abrirCsvBtn').onclick = () => {
                        window.electronAPI.abrirArchivo(rutaCsvGenerado);
                    };
                }
            } else {
                statusMessage.textContent = 'Error al procesar el PDF: ' + (resultado && resultado.error && resultado.error.message ? resultado.error.message : 'Error desconocido');
            }
        } catch (err) {
            statusMessage.textContent = 'Error inesperado: ' + err.message;
        } finally {
            btnProcesarPDF.disabled = false;
        }
    });
};
console.log('tablasPDF.js cargado');