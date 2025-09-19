window.inicializarModuloATM = () => {
    const btnConstanciaFiscal = document.getElementById('btnConstanciaFiscal');
    const btnPlanDePago = document.getElementById('btnPlanDePago');
    
    // Contenedores de respuesta originales
    const respuestaConstanciaFiscal = document.getElementById('respuestaConstanciaFiscal');
    const respuestaPlanDePago = document.getElementById('respuestaPlanDePago');

    // Nuevos contenedores para resultados detallados de archivos
    const resultadosDetalladosConstancia = document.getElementById('resultadosDetalladosConstancia');
    const resultadosDetalladosPlanPago = document.getElementById('resultadosDetalladosPlanPago');

    if (!btnConstanciaFiscal || !btnPlanDePago) {
        console.error('Error: No se encontraron los botones para el módulo ATM.');
        return;
    }

    const handleAtmAction = async (evento, respuestaDiv, resultadosDetalladosDiv) => {
        if (!window.usuarioSeleccionado) {
            console.error('Acción ATM intentada sin usuario seleccionado.');
            respuestaDiv.innerHTML = '<div class="alert alert-danger">Error: Por favor, seleccione un usuario primero.</div>';
            return;
        }

        console.log(`Botón presionado: ${evento}`);
        console.log('Usuario seleccionado:', window.usuarioSeleccionado);

        // Limpiar resultados anteriores
        respuestaDiv.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Procesando...</span></div>';
        resultadosDetalladosDiv.innerHTML = '';

        try {
            const payload = {
                evento: evento,
                usuario: window.usuarioSeleccionado
            };

            const resultado = await window.electronAPI.ejecutarFlujoATM(payload);
            console.log("Resultado recibido del backend:", resultado);

            // Limpiar spinner
            respuestaDiv.innerHTML = '';

            if (resultado.success || resultado.exito) { // Acepta ambas nomenclaturas
                // --- Muestra el resumen de deudas si existe (para Constancia Fiscal) ---
                if (resultado.resumen && Array.isArray(resultado.resumen)) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-info';
                    const title = document.createElement('h5');
                    title.className = 'alert-heading';
                    title.textContent = resultado.mensaje || 'Resumen de Deuda';
                    alertDiv.appendChild(title);
                    
                    const list = document.createElement('ul');
                    list.className = 'list-group mt-3';
                    resultado.resumen.forEach(item => {
                        const listItem = document.createElement('li');
                        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                        listItem.textContent = item.nombreTabla;
                        const totalSpan = document.createElement('span');
                        totalSpan.className = 'badge bg-primary rounded-pill fs-6';
                        totalSpan.textContent = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.total);
                        listItem.appendChild(totalSpan);
                        list.appendChild(listItem);
                    });
                    alertDiv.appendChild(list);
                    respuestaDiv.appendChild(alertDiv);
                }

                // --- Muestra la sección de archivos descargados (A y B de tu solicitud) ---
                if (resultado.downloadDir && resultado.files && Array.isArray(resultado.files)) {
                    // A: Mostrar la ruta de la carpeta contenedora y el botón para abrirla
                    const dirWrapper = document.createElement('div');
                    dirWrapper.className = 'd-flex justify-content-between align-items-center alert alert-light p-2 mt-3';
                    
                    const dirPath = document.createElement('code');
                    dirPath.textContent = resultado.downloadDir;
                    dirWrapper.appendChild(dirPath);

                    const openDirBtn = document.createElement('button');
                    openDirBtn.textContent = 'Abrir Carpeta';
                    openDirBtn.className = 'btn btn-sm btn-outline-secondary ms-3';
                    openDirBtn.onclick = () => window.electronAPI.abrirDirectorio(resultado.downloadDir);
                    dirWrapper.appendChild(openDirBtn);
                    
                    resultadosDetalladosDiv.appendChild(dirWrapper);

                    // B: Listar los archivos descargados con su respectivo botón para abrirlos
                    const fileList = document.createElement('ul');
                    fileList.className = 'list-group mt-2';

                    resultado.files.forEach(filePath => {
                        const fileItem = document.createElement('li');
                        fileItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                        
                        const fileName = document.createElement('span');
                        fileName.textContent = filePath.split('/').pop().split('\\').pop(); // Funciona para rutas windows y linux
                        fileItem.appendChild(fileName);

                        const openFileBtn = document.createElement('button');
                        openFileBtn.textContent = 'Abrir Archivo';
                        openFileBtn.className = 'btn btn-sm btn-outline-success';
                        openFileBtn.onclick = () => window.electronAPI.abrirArchivo(filePath);
                        fileItem.appendChild(openFileBtn);

                        fileList.appendChild(fileItem);
                    });

                    resultadosDetalladosDiv.appendChild(fileList);
                }

            } else {
                respuestaDiv.innerHTML = `<div class="alert alert-danger">Error: ${resultado.mensaje || 'Ocurrió un error desconocido.'}</div>`;
            }
        } catch (error) {
            console.error(`Error en handleAtmAction para ${evento}:`, error);
            respuestaDiv.innerHTML = `<div class="alert alert-danger">Error de comunicación: ${error.message}</div>`;
        }
    };

    btnConstanciaFiscal.addEventListener('click', () => handleAtmAction('constanciaFiscal', respuestaConstanciaFiscal, resultadosDetalladosConstancia));
    btnPlanDePago.addEventListener('click', () => handleAtmAction('planDePago', respuestaPlanDePago, resultadosDetalladosPlanPago));

    console.log('Módulo ATM inicializado correctamente.');
};