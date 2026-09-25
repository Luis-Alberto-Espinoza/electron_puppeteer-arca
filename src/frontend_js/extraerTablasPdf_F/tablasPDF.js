// Extraer Tablas PDF — lógica de la vista.
//
// Viene de tablas_pdf_a_csv (src/frontend/index.js), adaptado a esta app:
//  - window.api.*  →  window.electronAPI.extraerTablasPDF.* (ver preload.js).
//  - Sin DOMContentLoaded: controlador.js inyecta el HTML, carga este script y
//    en su onload llama a window.inicializarEventosExtraerTablasPDF(), que
//    arranca las tres partes (individual, lote y cambio de modo).
//  - El "modo grupo" marca el contenedor .tpdf (no <body>), para no teñir el
//    resto de la app.
// Este script se vuelve a ejecutar cada vez que se abre la vista: por eso solo
// asigna funciones en window (nada de const/let de nivel superior).

window.inicializarEventosExtraerTablasPDF = function() {
    const api = window.electronAPI.extraerTablasPDF;

    const btnSeleccionarPDF = document.getElementById('selectPdf_extraerTabla_Btn');
    const btnProcesarPDF = document.getElementById('processPdf_extraerTablas_Btn');
    const pdfPathInput = document.getElementById('pdfPathInput');
    const statusMessage = document.getElementById('statusMessage');

    if (!btnSeleccionarPDF || !btnProcesarPDF || !pdfPathInput || !statusMessage) {
        console.error('Faltan elementos del DOM para inicializar eventos de extraerTablasPDF');
        return;
    }

    const csvPathDiv = document.createElement('div');
    csvPathDiv.id = 'csvPathDiv';
    csvPathDiv.style.marginTop = '10px';
    statusMessage.parentNode.appendChild(csvPathDiv);

    let rutaSeleccionada = '';

    btnSeleccionarPDF.addEventListener('click', async () => {
        statusMessage.textContent = '';
        pdfPathInput.value = '';
        btnProcesarPDF.disabled = true;

        try {
            const archivoSeleccionado = await api.seleccionarArchivo();
            if (archivoSeleccionado) {
                rutaSeleccionada = archivoSeleccionado;
                pdfPathInput.value = rutaSeleccionada;
                btnProcesarPDF.disabled = false;
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
        csvPathDiv.innerHTML = ''; // Limpiar el div de ruta anterior

        try {
            const resultado = await api.procesarArchivo(rutaSeleccionada);

            if (resultado && resultado.exito) {
                statusMessage.textContent = '¡PDF procesado exitosamente!';
                if (resultado.rutaExcel) {
                    const rutaExcelGenerado = resultado.rutaExcel;
                    csvPathDiv.innerHTML = `
                        <span>Archivo Excel generado:</span>
                        <input type="text" value="${rutaExcelGenerado}" readonly style="width:60%;margin:5px;">
                        <button id="abrirCsvBtn" style="margin-left:10px;">Abrir Archivo</button>
                    `;
                    document.getElementById('abrirCsvBtn').onclick = () => {
                        api.abrirArchivo(rutaExcelGenerado);
                    };
                }
            } else {
                statusMessage.textContent = 'Error al procesar el PDF: ' + (resultado && resultado.error ? resultado.error : 'Error desconocido');
            }
        } catch (err) {
            statusMessage.textContent = 'Error inesperado: ' + err.message;
        } finally {
            btnProcesarPDF.disabled = false;
        }
    });

    window.inicializarEventosProcesoPorLotes();
    window.inicializarCambioDeModoTablasPDF();
};

// --- Lógica para el procesamiento por grupo ---
window.inicializarEventosProcesoPorLotes = function() {
    const api = window.electronAPI.extraerTablasPDF;

    const selectFolderBtn = document.getElementById('selectFolderBtn');
    const processFolderBtn = document.getElementById('processFolderBtn');
    const folderPathInput = document.getElementById('folderPathInput');
    const batchProgressContainer = document.getElementById('batchProgressContainer');
    const batchStatusMessage = document.getElementById('batchStatusMessage');
    const batchResultsDiv = document.getElementById('batchResultsDiv');

    let selectedFolderPath = '';

    selectFolderBtn.addEventListener('click', async () => {
        try {
            const folderPath = await api.seleccionarCarpeta();
            if (folderPath) {
                selectedFolderPath = folderPath;
                folderPathInput.value = selectedFolderPath;
                processFolderBtn.disabled = false;
                batchResultsDiv.innerHTML = '';
                batchProgressContainer.style.display = 'none';
            }
        } catch (err) {
            batchStatusMessage.textContent = 'Error al seleccionar carpeta: ' + err.message;
            batchProgressContainer.style.display = 'block';
        }
    });

    processFolderBtn.addEventListener('click', async () => {
        if (!selectedFolderPath) {
            alert('Por favor, selecciona una carpeta primero.');
            return;
        }

        selectFolderBtn.disabled = true;
        processFolderBtn.disabled = true;
        batchResultsDiv.innerHTML = '';
        batchProgressContainer.style.display = 'block';
        batchStatusMessage.textContent = 'Procesando archivos, por favor espere...';

        try {
            const response = await api.procesarCarpeta(selectedFolderPath);

            if (response && response.results) {
                const totalFiles = response.results.length;
                const successCount = response.results.filter(r => r.success).length;

                // Ocultar el spinner y mostrar mensaje de finalización
                batchProgressContainer.style.display = 'none';

                response.results.forEach(result => {
                    const resultElement = document.createElement('div');
                    resultElement.className = 'batch-result-item';

                    let html = `<strong>${result.fileName}:</strong> `;
                    if (result.success && result.outputPath) {
                        html += `<span class="status-success">✓ Éxito</span>
                                 <button class="open-file-btn" data-path="${result.outputPath}">Abrir Archivo</button>`;
                    } else {
                        html += `<span class="status-error">✗ Error: ${result.error || 'Desconocido'}</span>`;
                    }
                    resultElement.innerHTML = html;
                    batchResultsDiv.appendChild(resultElement);
                });

                // Agregar mensaje final al inicio de los resultados
                const summaryElement = document.createElement('div');
                summaryElement.className = 'batch-summary';
                summaryElement.textContent = `Procesamiento completado: ${successCount} de ${totalFiles} archivos convertidos exitosamente`;
                batchResultsDiv.insertBefore(summaryElement, batchResultsDiv.firstChild);

            } else {
                throw new Error((response && response.message) || 'La respuesta del backend no fue la esperada.');
            }

        } catch (err) {
            batchStatusMessage.textContent = 'Error en el proceso por grupo: ' + err.message;
        } finally {
            selectFolderBtn.disabled = false;
            processFolderBtn.disabled = false;
        }
    });

    // Usar delegación de eventos para los botones "Abrir"
    batchResultsDiv.addEventListener('click', (event) => {
        if (event.target.classList.contains('open-file-btn')) {
            const filePath = event.target.getAttribute('data-path');
            if (filePath) {
                api.abrirArchivo(filePath);
            }
        }
    });
};

// --- Lógica para el cambio de modo ---
window.inicializarCambioDeModoTablasPDF = function() {
    const contenedor = document.querySelector('#extraerTablasPDFDiv .tpdf');
    const singleFileSection = document.getElementById('singleFileSection');
    const batchSection = document.getElementById('batchSection');
    const switchToBatchBtn = document.getElementById('switchToBatchBtn');
    const switchToSingleBtn = document.getElementById('switchToSingleBtn');

    switchToBatchBtn.addEventListener('click', () => {
        singleFileSection.style.display = 'none';
        batchSection.style.display = 'block';
        switchToBatchBtn.style.display = 'none';
        switchToSingleBtn.style.display = 'block';
        if (contenedor) contenedor.classList.add('tpdf--lote'); // Tema del modo grupo
    });

    switchToSingleBtn.addEventListener('click', () => {
        batchSection.style.display = 'none';
        singleFileSection.style.display = 'block';
        switchToSingleBtn.style.display = 'none';
        switchToBatchBtn.style.display = 'block';
        if (contenedor) contenedor.classList.remove('tpdf--lote');
    });
};
