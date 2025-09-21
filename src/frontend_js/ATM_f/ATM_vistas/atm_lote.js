// Se adjuntará al objeto window para ser llamado desde controlador.js
window.inicializarModuloLoteATM = () => {
    console.log("Inicializando módulo de procesamiento por lote ATM...");

    // --- OBTENER ELEMENTOS DEL DOM ---
    const btnVolver = document.getElementById('btnVolverAtm');
    const listaUsuariosDiv = document.getElementById('listaUsuariosLote');
    const btnSeleccionarTodos = document.getElementById('btnSeleccionarTodos');
    const btnDeseleccionarTodos = document.getElementById('btnDeseleccionarTodos');
    const btnConstanciasLote = document.getElementById('btnConstanciasLote');
    const btnPlanesPagoLote = document.getElementById('btnPlanesPagoLote');

    const resultadosContainer = document.getElementById('lote-resultados-container');
    const procesandoContainer = document.getElementById('lote-procesando-ahora');
    const finalizadosContainer = document.getElementById('lote-finalizados-container');
    const finalizadosDiv = document.getElementById('lote-finalizados');

    // Ocultar paneles inicialmente
    procesandoContainer.style.display = 'none';
    finalizadosContainer.style.display = 'none';

    // --- FUNCIÓN PARA CARGAR USUARIOS ---
    const cargarYMostrarUsuarios = async () => {
        if (!listaUsuariosDiv) return;
        listaUsuariosDiv.innerHTML = '<p>Cargando usuarios...</p>';
        try {
            const result = await window.electronAPI.user.getAll();
            if (result.success && result.users.length > 0) {
                listaUsuariosDiv.innerHTML = '';
                result.users.forEach(user => {
                    const nombreCompleto = `${user.nombre || ''} ${user.apellido || ''}`.trim();
                    const userElement = document.createElement('div');
                    userElement.className = 'usuario-item';
                    userElement.innerHTML = `
                        <input type="checkbox" id="user-${user.id}" data-userid="${user.id}">
                        <label for="user-${user.id}">${nombreCompleto} (Cuit: ${user.cuit})</label>
                    `;
                    userElement.querySelector('input')._userData = user;
                    listaUsuariosDiv.appendChild(userElement);
                });
            } else {
                listaUsuariosDiv.innerHTML = '<p class="text-danger">No se encontraron usuarios.</p>';
            }
        } catch (error) {
            console.error('Error al cargar usuarios:', error);
            listaUsuariosDiv.innerHTML = `<p class="text-danger">Error al cargar usuarios: ${error.message}</p>`;
        }
    };

    // --- CONFIGURAR EVENT LISTENERS ---
    if (btnVolver) btnVolver.addEventListener('click', () => { if (window.cargarModuloATM) window.cargarModuloATM(); });
    if (btnSeleccionarTodos) btnSeleccionarTodos.addEventListener('click', () => listaUsuariosDiv.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = true));
    if (btnDeseleccionarTodos) btnDeseleccionarTodos.addEventListener('click', () => listaUsuariosDiv.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false));

    // --- LÓGICA DE ACCIONES ---
    const iniciarProcesoLote = async (tipoAccion) => {
        const checkboxesSeleccionados = listaUsuariosDiv.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxesSeleccionados.length === 0) {
            alert('Por favor, seleccione al menos un usuario.');
            return;
        }
        const usuariosParaProcesar = Array.from(checkboxesSeleccionados).map(chk => chk._userData);
        const nombresUsuarios = usuariosParaProcesar.map(u => `${u.nombre || ''} ${u.apellido || ''}`.trim()).join('\n - ');

        const confirmacion = confirm(`Se iniciará el proceso '${tipoAccion}' para los siguientes ${usuariosParaProcesar.length} usuarios:\n\n - ${nombresUsuarios}\n\n¿Desea continuar?`);
        if (!confirmacion) return;

        procesandoContainer.innerHTML = '<h3>Procesando Usuario Actual:</h3>'; // Resetear y poner título
        finalizadosDiv.innerHTML = '';
        procesandoContainer.style.display = 'block';
        finalizadosContainer.style.display = 'none';

        // Auto-scroll a los resultados
        setTimeout(() => {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);

        try {
            await window.electronAPI.atm.iniciarLote({ tipoAccion, usuarios: usuariosParaProcesar });
        } catch (error) {
            procesandoContainer.innerHTML = `<div class="progreso-item status-error">Error de comunicación al iniciar el lote: ${error.message}</div>`;
        }
    };

    if (btnConstanciasLote) btnConstanciasLote.addEventListener('click', () => iniciarProcesoLote('constanciaFiscal'));
    if (btnPlanesPagoLote) btnPlanesPagoLote.addEventListener('click', () => iniciarProcesoLote('planDePago'));

    // Map to keep track of userDivs
    const userDivMap = new Map();

    // --- LISTENER DE PROGRESO ---
    window.electronAPI.atm.onLoteUpdate((datos) => {
        const { userId, nombre, status, mensaje, files = [], downloadDir, resumen } = datos;

        if (status === 'general') return;
        if (status === 'finalizado') {
            procesandoContainer.style.display = 'none';
            return;
        }

        let userDiv = userDivMap.get(userId);
        if (!userDiv) {
            userDiv = document.createElement('div');
            userDiv.className = 'progreso-usuario';
            userDiv.setAttribute('data-userid', userId);
            userDivMap.set(userId, userDiv); // Store it in the map

            const userHeader = document.createElement('h4');
            userHeader.textContent = nombre;
            userDiv.appendChild(userHeader);

            // Add a container for messages to keep them separate from buttons
            const messageContainer = document.createElement('div');
            messageContainer.className = 'message-container';
            userDiv.appendChild(messageContainer);
        }

        const isFinalStatus = (status === 'exito_final' || status === 'error');
        const messageContainer = userDiv.querySelector('.message-container');

        // Update the message
        messageContainer.innerHTML = `<div class="progreso-item">[${new Date().toLocaleTimeString()}] ${mensaje}</div>`;

        // Mover entre paneles
        if (isFinalStatus) {
            finalizadosContainer.style.display = 'block';
            finalizadosDiv.appendChild(userDiv);
            // Remove from procesandoContainer if it was there
            if (procesandoContainer.contains(userDiv)) {
                procesandoContainer.removeChild(userDiv);
            }
            // Hide procesandoContainer if empty
            if (procesandoContainer.children.length <= 1) { // Only the H3 title
                procesandoContainer.style.display = 'none';
            }

            // Add badge
            let badge = '';
            if (status === 'error') {
                badge = '<span class="badge bg-danger">FALLO</span>';
            } else {
                const fileCount = files.length;
                let badgeText = '';
                if (fileCount === 0) {
                    badgeText = 'Sin archivos';
                } else if (fileCount === 1) {
                    badgeText = '1 archivo';
                } else {
                    badgeText = `${fileCount} archivos`;
                }
                badge = `<span class="badge bg-success">Éxito - ${badgeText}</span>`;
            }
            userDiv.querySelector('h4').innerHTML = `${nombre} ${badge}`;

            // Add buttons and summary if success final with files
            if (status === 'exito_final') {
                if (resumen) { /* ... código de resumen ... */ }
                if (downloadDir && files && Array.isArray(files) && files.length > 0) {
                    const dirWrapper = document.createElement('div');
                    dirWrapper.className = 'lote-dir-container d-flex justify-content-between align-items-center';

                    // Crear y añadir el elemento para la ruta (esto faltaba)
                    const dirPath = document.createElement('code');
                    dirPath.textContent = downloadDir;
                    dirWrapper.appendChild(dirPath);

                    const openDirBtn = document.createElement('button');
                    openDirBtn.textContent = 'Abrir Carpeta'; // Corregir error de tipeo
                    openDirBtn.className = 'btn btn-sm lote-btn-abrir-carpeta';
                    openDirBtn.onclick = () => window.electronAPI.abrirDirectorio(downloadDir);
                    dirWrapper.appendChild(openDirBtn);
                    
                    userDiv.appendChild(dirWrapper);

                    const fileList = document.createElement('ul');
                    fileList.className = 'list-group mt-1';
                    files.forEach(filePath => {
                        const fileItem = document.createElement('li');
                        fileItem.className = 'list-group-item bg-transparent text-light d-flex justify-content-between align-items-center p-1';
                        const fileName = document.createElement('span');
                        fileName.textContent = filePath.split('/').pop().split('\\').pop();
                        fileName.style.marginRight = '15px';
                        fileItem.appendChild(fileName);
                        const openFileBtn = document.createElement('button');
                        openFileBtn.textContent = 'Abrir Archivo';
                        openFileBtn.className = 'btn btn-sm lote-btn-abrir-archivo';
                        openFileBtn.onclick = () => window.electronAPI.abrirArchivo(filePath);
                        fileItem.appendChild(openFileBtn);
                        fileList.appendChild(fileItem);
                    });
                    // The original code had contentWrapper.appendChild(fileList); here.
                    // Same issue as above. Appending to userDiv.
                    userDiv.appendChild(fileList);
                }
            }
        } else {
            procesandoContainer.style.display = 'block';
            // Append userDiv to procesandoContainer if it's not already there
            if (!procesandoContainer.contains(userDiv)) {
                procesandoContainer.appendChild(userDiv);
            }
        }
    });

    cargarYMostrarUsuarios();
};