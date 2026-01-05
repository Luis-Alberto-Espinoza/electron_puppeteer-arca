// Estado: almacena el periodo seleccionado para cada usuario (solo retenciones)
const periodosSeleccionados = {};

// Se adjuntará al objeto window para ser llamado desde controlador.js
window.inicializarModuloLoteATM = () => {
    console.log("Inicializando módulo de procesamiento por lote ATM...");

    // --- OBTENER ELEMENTOS DEL DOM ---
    const btnVolver = document.getElementById('btnVolverAtm');
    const btnLimpiarSeleccion = document.getElementById('btnLimpiarSeleccion');
    const btnConstanciasLote = document.getElementById('btnConstanciasLote');
    const btnPlanesPagoLote = document.getElementById('btnPlanesPagoLote');
    const btnTasaCeroLote = document.getElementById('btnTasaCeroLote');
    const btnRetencionesLote = document.getElementById('btnRetencionesLote');

    const resultadosContainer = document.getElementById('lote-resultados-container');
    const procesandoContainer = document.getElementById('lote-procesando-ahora');
    const finalizadosContainer = document.getElementById('lote-finalizados-container');
    const finalizadosDiv = document.getElementById('lote-finalizados');

    // Ocultar paneles inicialmente
    procesandoContainer.style.display = 'none';
    finalizadosContainer.style.display = 'none';

    // --- FUNCIÓN HELPER: GENERAR OPCIONES DE PERIODO ---
    function generarOpcionesPeriodo() {
        const opciones = [];
        const hoy = new Date();
        const mesActual = hoy.getMonth(); // 0-11
        const anioActual = hoy.getFullYear();

        // Generar los últimos 24 meses (2 años hacia atrás)
        for (let i = 0; i < 24; i++) {
            let mes = mesActual - i;
            let anio = anioActual;

            // Ajustar año si el mes es negativo
            while (mes < 0) {
                mes += 12;
                anio -= 1;
            }

            const mesStr = (mes + 1).toString().padStart(2, '0'); // Mes 1-12
            // Formato igual que en ATM: "12/2025"
            const periodoFormato = `${mesStr}/${anio}`;

            opciones.push({ valor: periodoFormato, nombre: periodoFormato });
        }

        return opciones;
    }

    // --- INSTANCIA DEL SELECTOR DE USUARIOS ---
    let selectorUsuarios = null;

    // Verificar que SelectorUsuarios esté disponible
    if (typeof SelectorUsuarios === 'undefined') {
        console.error('❌ SelectorUsuarios no está definido. Reintentando...');
        setTimeout(window.inicializarModuloLoteATM, 100);
        return;
    }

    // Crear instancia del selector de usuarios
    selectorUsuarios = new SelectorUsuarios('selector-usuarios-atm', {
        // ====== VALIDACIÓN Y FILTRADO DE CREDENCIALES ATM ======
        campoCredencial: 'claveATM',
        campoEstado: 'estado_atm',
        campoError: 'errorAtm',
        permitirInvalidos: false,
        permitirSinValidar: false,
        mensajeSinValidar: 'Debe validar las credenciales ATM primero en la sección Gestión de Cliente',

        // ====== CALLBACK DE SELECCIÓN ======
        onCambioSeleccion: (usuariosSeleccionados) => {
            actualizarBotonesAccion(usuariosSeleccionados);
        },

        // ====== COLUMNAS EXTRAS: ESTADO + PERIODO ======
        renderizarColumnasExtras: renderizarColumnasExtras,
        headersColumnasExtras: ['Estado', 'Periodo (Retenciones)']
    });

    console.log('✅ SelectorUsuarios inicializado para ATM');

    // --- FUNCIÓN PARA RENDERIZAR COLUMNAS EXTRAS ---
    function renderizarColumnasExtras(usuario) {
        let columnasHTML = '';

        // COLUMNA 1: ESTADO
        let badge = '';
        let cssClass = '';

        if (usuario.estado_atm === 'validado') {
            badge = '✅ Validado';
            cssClass = 'badge-validado';
        } else if (usuario.estado_atm === 'invalido') {
            badge = '❌ Inválido';
            cssClass = 'badge-invalido';
        } else {
            badge = '⚠️ Sin validar';
            cssClass = 'badge-sin-validar';
        }

        columnasHTML += `<td class="estado-cell"><span class="badge ${cssClass}">${badge}</span></td>`;

        // COLUMNA 2: PERIODO (solo para retenciones)
        const opcionesPeriodo = generarOpcionesPeriodo();
        const mesActual = opcionesPeriodo[0]?.valor || ''; // Primer elemento = mes actual

        // Si no hay periodo seleccionado, usar el mes actual por defecto
        if (!periodosSeleccionados[usuario.id]) {
            periodosSeleccionados[usuario.id] = mesActual;
        }

        const periodoSeleccionado = periodosSeleccionados[usuario.id];

        const optionsHTML = opcionesPeriodo.map(opcion => {
            const selected = opcion.valor === periodoSeleccionado ? 'selected' : '';
            return `<option value="${opcion.valor}" ${selected}>${opcion.nombre}</option>`;
        }).join('');

        columnasHTML += `
            <td class="periodo-cell">
                <select
                    class="periodo-selector"
                    data-usuario-id="${usuario.id}"
                    style="width: 100%; padding: 4px; font-size: 11px;">
                    ${optionsHTML}
                </select>
            </td>
        `;

        return columnasHTML;
    }

    // --- EVENT LISTENER PARA CAMBIOS EN SELECTOR DE PERIODO ---
    document.addEventListener('change', (event) => {
        if (event.target.classList.contains('periodo-selector')) {
            const usuarioId = event.target.dataset.usuarioId;
            const periodoSeleccionado = event.target.value;

            if (periodoSeleccionado) {
                periodosSeleccionados[usuarioId] = periodoSeleccionado;
                console.log(`📅 Periodo seleccionado para usuario ${usuarioId}: ${periodoSeleccionado}`);
            } else {
                delete periodosSeleccionados[usuarioId];
                console.log(`❌ Periodo eliminado para usuario ${usuarioId}`);
            }
        }
    });

    // --- FUNCIÓN PARA ACTUALIZAR BOTONES DE ACCIÓN ---
    function actualizarBotonesAccion(usuariosSeleccionados) {
        const haySeleccion = usuariosSeleccionados.length > 0;

        if (btnConstanciasLote) btnConstanciasLote.disabled = !haySeleccion;
        if (btnPlanesPagoLote) btnPlanesPagoLote.disabled = !haySeleccion;
        if (btnTasaCeroLote) btnTasaCeroLote.disabled = !haySeleccion;
        if (btnRetencionesLote) btnRetencionesLote.disabled = !haySeleccion;

        console.log(`🔵 ${usuariosSeleccionados.length} usuario(s) seleccionado(s)`);
    }

    // --- CONFIGURAR EVENT LISTENERS ---
    if (btnVolver) {
        btnVolver.addEventListener('click', () => {
            if (window.cargarModuloATM) window.cargarModuloATM();
        });
    }

    if (btnLimpiarSeleccion) {
        btnLimpiarSeleccion.addEventListener('click', () => {
            if (selectorUsuarios) {
                selectorUsuarios.limpiarSeleccion();
                console.log('✅ Selección limpiada');
            }
        });
    }

    // --- LÓGICA DE ACCIONES ---
    const iniciarProcesoLote = async (tipoAccion) => {
        if (!selectorUsuarios) {
            alert('Error: Selector de usuarios no inicializado');
            return;
        }

        const usuariosParaProcesar = selectorUsuarios.obtenerSeleccionados();

        if (usuariosParaProcesar.length === 0) {
            alert('Por favor, seleccione al menos un usuario.');
            return;
        }

        // VALIDACIÓN ESPECIAL PARA RETENCIONES: verificar que todos tengan periodo
        if (tipoAccion === 'descargaRetenciones') {
            const usuariosSinPeriodo = usuariosParaProcesar.filter(u => !periodosSeleccionados[u.id]);

            if (usuariosSinPeriodo.length > 0) {
                const nombresSinPeriodo = usuariosSinPeriodo.map(u => `${u.nombre || ''} ${u.apellido || ''}`.trim()).join('\n - ');
                alert(`❌ Error: Los siguientes usuarios no tienen periodo seleccionado:\n\n - ${nombresSinPeriodo}\n\nPor favor, seleccione un periodo para todos los usuarios antes de continuar.`);
                return;
            }

            // Agregar el periodo a cada usuario
            usuariosParaProcesar.forEach(u => {
                u.periodo = periodosSeleccionados[u.id];
            });
        }

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

    // --- LÓGICA DE TASA CERO ---
    const iniciarProcesoLoteTasaCero = async () => {
        if (!selectorUsuarios) {
            alert('Error: Selector de usuarios no inicializado');
            return;
        }

        const clientesParaProcesar = selectorUsuarios.obtenerSeleccionados();

        if (clientesParaProcesar.length === 0) {
            alert('Por favor, seleccione al menos un usuario.');
            return;
        }

        // VALIDACIÓN: verificar que todos tengan periodo seleccionado
        const usuariosSinPeriodo = clientesParaProcesar.filter(u => !periodosSeleccionados[u.id]);

        if (usuariosSinPeriodo.length > 0) {
            const nombresSinPeriodo = usuariosSinPeriodo.map(u => `${u.nombre || ''} ${u.apellido || ''}`.trim()).join('\n - ');
            alert(`❌ Error: Los siguientes usuarios no tienen periodo seleccionado:\n\n - ${nombresSinPeriodo}\n\nPor favor, seleccione un periodo para todos los usuarios antes de continuar.`);
            return;
        }

        // Agregar el periodo a cada cliente
        clientesParaProcesar.forEach(u => {
            u.periodo = periodosSeleccionados[u.id];
        });

        const nombresClientes = clientesParaProcesar.map(u => `${u.nombre || ''} ${u.apellido || ''}`.trim()).join('\n - ');

        const confirmacion = confirm(`Se iniciará el proceso de Tasa Cero para los siguientes ${clientesParaProcesar.length} cliente(s):\n\n - ${nombresClientes}\n\n¿Desea continuar?`);
        if (!confirmacion) return;

        procesandoContainer.innerHTML = '<h3>Procesando Cliente Actual:</h3>'; // Resetear y poner título
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
            // Llamar a la API de Tasa Cero con el periodo incluido
            await window.electronAPI.atm.iniciarLoteTasaCero({
                clientes: clientesParaProcesar
            });
        } catch (error) {
            procesandoContainer.innerHTML = `<div class="progreso-item status-error">Error de comunicación al iniciar Tasa Cero: ${error.message}</div>`;
        }
    };

    if (btnConstanciasLote) btnConstanciasLote.addEventListener('click', () => iniciarProcesoLote('constanciaFiscal'));
    if (btnPlanesPagoLote) btnPlanesPagoLote.addEventListener('click', () => iniciarProcesoLote('planDePago'));
    if (btnTasaCeroLote) btnTasaCeroLote.addEventListener('click', () => iniciarProcesoLoteTasaCero());
    if (btnRetencionesLote) btnRetencionesLote.addEventListener('click', () => iniciarProcesoLote('descargaRetenciones'));

    // Map to keep track of userDivs
    const userDivMap = new Map();

    // --- FUNCIÓN COMPARTIDA PARA MANEJAR ACTUALIZACIONES ---
    const manejarActualizacionProgreso = (datos) => {
        const { userId, clienteId, nombre, status, estado, mensaje, files = [], archivoPdf, downloadDir, resumen, periodo, caso } = datos;

        // Normalizar los nombres de campos (compatibilidad entre ATM y Tasa Cero)
        const idUsuario = userId || clienteId;
        const estadoFinal = status || estado;

        if (estadoFinal === 'general') return;
        if (estadoFinal === 'finalizado') {
            procesandoContainer.style.display = 'none';
            return;
        }

        let userDiv = userDivMap.get(idUsuario);
        if (!userDiv) {
            userDiv = document.createElement('div');
            userDiv.className = 'progreso-usuario';
            userDiv.setAttribute('data-userid', idUsuario);
            userDivMap.set(idUsuario, userDiv); // Store it in the map

            const userHeader = document.createElement('h4');
            userHeader.textContent = nombre;
            userDiv.appendChild(userHeader);

            // Add a container for messages to keep them separate from buttons
            const messageContainer = document.createElement('div');
            messageContainer.className = 'message-container';
            userDiv.appendChild(messageContainer);
        }

        const isFinalStatus = (estadoFinal === 'exito_final' || estadoFinal === 'error' || estadoFinal === 'exito');
        const messageContainer = userDiv.querySelector('.message-container');

        // Update the message
        console.log("==>>", mensaje)
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
            if (estadoFinal === 'error') {
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
            if (estadoFinal === 'exito_final' || estadoFinal === 'exito') {
                // Para Tasa Cero: archivoPdf es un string único, no un array
                const archivosParaMostrar = files.length > 0 ? files : (archivoPdf ? [archivoPdf] : []);
                if (resumen && Array.isArray(resumen) && resumen.length > 0) {
                    // 1. Calcular el Gran Total
                    const granTotal = resumen.reduce((sum, item) => {
                        const valorNumerico = parseFloat(item.total.replace(/\./g, '').replace(',', '.'));
                        return sum + (isNaN(valorNumerico) ? 0 : valorNumerico);
                    }, 0);

                    // 2. Construir el contenedor principal usando clases de CSS
                    const resumenContainer = document.createElement('div');
                    resumenContainer.className = 'resumen-deudas-container';

                    const resumenTitle = document.createElement('h6');
                    resumenTitle.textContent = 'Resumen de Deudas';
                    resumenContainer.appendChild(resumenTitle);

                    const resumenList = document.createElement('ul');
                    resumenList.className = 'list-group list-group-flush';

                    resumen.forEach(item => {
                        const listItem = document.createElement('li');
                        listItem.className = 'list-group-item';
                        listItem.innerHTML = `<span>${item.nombreTabla}</span><span class="badge">$ ${item.total}</span>`;
                        resumenList.appendChild(listItem);
                    });

                    resumenContainer.appendChild(resumenList);

                    // 3. Crear y añadir el elemento para el Gran Total usando clases de CSS
                    const totalElement = document.createElement('div');
                    totalElement.className = 'resumen-total';
                    totalElement.innerHTML = `<span>GRAN TOTAL</span><span>$ ${granTotal.toFixed(2).replace('.', ',')}</span>`;
                    resumenContainer.appendChild(totalElement);

                    userDiv.appendChild(resumenContainer);
                }

                if (downloadDir && archivosParaMostrar.length > 0) {
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
                    archivosParaMostrar.forEach(filePath => {
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
    };

    // --- LISTENERS DE PROGRESO ---
    // Listener para ATM general (Plan de Pago y Constancias)
    window.electronAPI.atm.onLoteUpdate((datos) => {
        manejarActualizacionProgreso(datos);
    });

    // Listener para Tasa Cero
    window.electronAPI.atm.onTasaCeroUpdate((datos) => {
        manejarActualizacionProgreso(datos);
    });

    console.log('✅ Módulo de lote ATM inicializado completamente');
};
