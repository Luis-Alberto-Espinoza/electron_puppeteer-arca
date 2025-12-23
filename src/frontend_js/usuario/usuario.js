console.log('CARGANDO SCRIPT usuario.js...');

window.currentEditingUser = window.currentEditingUser || null;

// Variable global para empresas disponibles
window.empresasDisponible = [];

// Variables globales para rastrear si las credenciales fueron verificadas
window.verificacionRealizada = {
    afip: false,
    atm: false
};

// Variable global para almacenar todos los usuarios
window.allUsers = [];

// Función para mostrar alertas
function showAlert(message, type = 'success') {
    const alert = document.getElementById('alert');
    const alertMessage = document.getElementById('alertMessage');

    alert.className = `alert alert-${type}`;
    alertMessage.textContent = message;
    alert.classList.remove('hidden');

    // Auto-scroll al alert con un pequeño delay
    setTimeout(() => {
        alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

    // ❌ Ya NO se oculta automáticamente - el usuario debe cerrarlo manualmente
}

// Función para cerrar el alert manualmente
function closeAlert() {
    const alert = document.getElementById('alert');
    alert.classList.add('hidden');
}

// Inicializar el botón de cerrar alert
function initializeAlertCloseButton() {
    const btnCloseAlert = document.getElementById('btnCloseAlert');
    if (btnCloseAlert) {
        btnCloseAlert.addEventListener('click', closeAlert);
    }
}

// Función para mostrar/ocultar loading
function setLoading(elementId, show) {
    const loading = document.getElementById(elementId);
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

// ========== FUNCIONES DEL PANEL DE PROGRESO ==========

// Mostrar panel de progreso y llevar foco
function showProgressPanel(total) {
    const panel = document.getElementById('progressPanel');

    // Resetear valores
    resetProgressPanel();

    // Actualizar contador total
    document.getElementById('progressCounter').textContent = `0 / ${total} usuarios`;

    // Mostrar panel
    panel.classList.remove('hidden');

    // Scroll automático al panel con un pequeño delay para que se vea la animación
    setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Actualizar progreso del panel
function updateProgress(current, total, validados, fallos) {
    const percentage = Math.round((current / total) * 100);

    // Actualizar barra de progreso
    document.getElementById('progressBar').style.width = `${percentage}%`;

    // Actualizar contador
    document.getElementById('progressCounter').textContent = `${current} / ${total} usuarios`;

    // Actualizar estadísticas
    document.getElementById('statValidados').textContent = validados;
    document.getElementById('statFallos').textContent = fallos;
}

// Ocultar panel con resumen final
function hideProgressPanel(validados, fallos, delay = 5000) {
    const panel = document.getElementById('progressPanel');
    const title = panel.querySelector('.progress-title');
    const processingStatus = panel.querySelector('.stat-processing');

    // Cambiar a mensaje final
    title.textContent = '✅ Verificación completada';
    processingStatus.style.display = 'none';

    // Ocultar después del delay
    setTimeout(() => {
        panel.classList.add('hidden');
        resetProgressPanel();
    }, delay);
}

// Resetear panel a estado inicial
function resetProgressPanel() {
    const panel = document.getElementById('progressPanel');
    const title = panel.querySelector('.progress-title');
    const processingStatus = panel.querySelector('.stat-processing');

    // Resetear textos
    title.textContent = 'Verificando credenciales...';
    document.getElementById('progressCounter').textContent = '0 / 0 usuarios';

    // Resetear barra
    document.getElementById('progressBar').style.width = '0%';

    // Resetear estadísticas
    document.getElementById('statValidados').textContent = '0';
    document.getElementById('statFallos').textContent = '0';

    // Mostrar estado de procesando
    if (processingStatus) {
        processingStatus.style.display = 'flex';
    }
}

// ========== FIN FUNCIONES DEL PANEL DE PROGRESO ==========

// ========== FUNCIONES DEL PANEL DE RESULTADOS PERSISTENTE ==========

// Variable global para guardar timestamp de verificación
let verificationTimestamp = null;
let timestampUpdateInterval = null;

/**
 * Calcula el tiempo transcurrido desde un timestamp y retorna texto legible
 * @param {Date} timestamp - Fecha/hora de la verificación
 * @returns {string} Texto formateado ("Hace 5 minutos", etc.)
 */
function getRelativeTime(timestamp) {
    const now = new Date();
    const diffMs = now - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Hace unos momentos';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
}

/**
 * Actualiza el timestamp relativo cada minuto
 */
function startTimestampUpdater() {
    // Limpiar intervalo anterior si existe
    if (timestampUpdateInterval) {
        clearInterval(timestampUpdateInterval);
    }

    // Actualizar cada 30 segundos
    timestampUpdateInterval = setInterval(() => {
        if (verificationTimestamp) {
            const timestampElement = document.getElementById('resultsTimestamp');
            if (timestampElement) {
                timestampElement.textContent = getRelativeTime(verificationTimestamp);
            }
        }
    }, 30000); // 30 segundos
}

/**
 * Muestra el panel de resultados con los datos de la verificación
 * @param {Object} results - Objeto con resultados { successCount, failedCount, details: [...] }
 */
function showResultsPanel(results) {
    console.log('📋 [showResultsPanel] Mostrando panel con datos:', results);

    const panel = document.getElementById('resultsPanel');
    const summarySuccess = document.getElementById('summarySuccess');
    const summaryFailed = document.getElementById('summaryFailed');
    const detailsList = document.getElementById('resultsDetailsList');
    const timestampElement = document.getElementById('resultsTimestamp');

    // Guardar timestamp actual
    verificationTimestamp = new Date();

    // Actualizar resumen
    summarySuccess.textContent = results.successCount || 0;
    summaryFailed.textContent = results.failedCount || 0;

    // Actualizar timestamp
    timestampElement.textContent = getRelativeTime(verificationTimestamp);
    startTimestampUpdater();

    // Limpiar lista de detalles
    detailsList.innerHTML = '';

    console.log('📋 [showResultsPanel] results.details:', results.details);
    console.log('📋 [showResultsPanel] results.details.length:', results.details?.length);

    // Poblar detalles si existen
    if (results.details && results.details.length > 0) {
        console.log('📋 [showResultsPanel] Poblando detalles...');

        // Agrupar por usuario
        const userGroups = {};
        results.details.forEach((detail, index) => {
            console.log(`📋 [showResultsPanel] Detalle ${index}:`, detail);

            const userId = detail.userId;
            if (!userGroups[userId]) {
                userGroups[userId] = {
                    userName: detail.userName || 'Usuario',
                    services: []
                };
            }

            userGroups[userId].services.push({
                service: detail.service,
                success: detail.success,
                error: detail.error
            });
        });

        console.log('📋 [showResultsPanel] Grupos de usuarios:', userGroups);

        // Renderizar agrupado por usuario
        Object.entries(userGroups).forEach(([userId, userData]) => {
            // Determinar si todo fue exitoso o hubo algún fallo
            const allSuccess = userData.services.every(s => s.success);
            const allFailed = userData.services.every(s => !s.success);

            let groupClass = 'result-mixed';
            let groupIcon = '⚠️';

            if (allSuccess) {
                groupClass = 'result-success';
                groupIcon = '✅';
            } else if (allFailed) {
                groupClass = 'result-failed';
                groupIcon = '❌';
            }

            // Crear HTML del grupo de usuario
            let userGroupHTML = `
                <div class="result-user-group ${groupClass}">
                    <div class="result-user-header">
                        <span class="result-item-icon">${groupIcon}</span>
                        <span class="result-item-name">${userData.userName}</span>
                    </div>
                    <div class="result-user-services">
            `;

            // Agregar cada servicio
            userData.services.forEach(service => {
                const serviceIcon = service.success ? '✅' : '❌';
                const statusText = service.success ? 'Validado' : (service.error || 'Falló');
                const serviceClass = service.success ? 'service-success' : 'service-failed';

                userGroupHTML += `
                    <div class="result-service-item ${serviceClass}">
                        <span class="service-bullet">└─</span>
                        <span class="service-icon">${serviceIcon}</span>
                        <span class="service-name">${service.service?.toUpperCase() || 'N/A'}</span>
                        <span class="service-status">${statusText}</span>
                    </div>
                `;
            });

            userGroupHTML += `
                    </div>
                </div>
            `;

            detailsList.innerHTML += userGroupHTML;
        });

        console.log('📋 [showResultsPanel] HTML generado:', detailsList.innerHTML);
    } else {
        console.warn('⚠️ [showResultsPanel] No hay detalles para mostrar o el array está vacío');
    }

    // Mostrar panel con scroll automático hacia el panel de resultados
    panel.classList.remove('hidden');
    setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

/**
 * Cierra el panel de resultados
 */
function closeResultsPanel() {
    const panel = document.getElementById('resultsPanel');
    const details = document.getElementById('resultsDetails');
    const toggleIcon = document.getElementById('toggleIcon');

    // Ocultar panel
    panel.classList.add('hidden');

    // Resetear estado de detalles (cerrarlos)
    details.classList.add('hidden');
    toggleIcon.classList.remove('rotated');

    // Detener actualizador de timestamp
    if (timestampUpdateInterval) {
        clearInterval(timestampUpdateInterval);
        timestampUpdateInterval = null;
    }

    verificationTimestamp = null;
}

/**
 * Alterna la visibilidad de los detalles
 */
function toggleResultsDetails() {
    const details = document.getElementById('resultsDetails');
    const toggleIcon = document.getElementById('toggleIcon');
    const btnToggle = document.getElementById('btnToggleDetails');

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        toggleIcon.classList.add('rotated');
        btnToggle.innerHTML = '<span id="toggleIcon" class="rotated">▼</span> Ocultar detalles';
    } else {
        details.classList.add('hidden');
        toggleIcon.classList.remove('rotated');
        btnToggle.innerHTML = '<span id="toggleIcon">▼</span> Ver detalles';
    }
}

/**
 * Inicializa los event listeners del panel de resultados
 */
function initializeResultsPanel() {
    // Botón cerrar
    const btnClose = document.getElementById('btnCloseResults');
    if (btnClose) {
        btnClose.addEventListener('click', closeResultsPanel);
    }

    // Botón toggle detalles
    const btnToggle = document.getElementById('btnToggleDetails');
    if (btnToggle) {
        btnToggle.addEventListener('click', toggleResultsDetails);
    }
}

// ========== FIN FUNCIONES DEL PANEL DE RESULTADOS PERSISTENTE ==========

// ========== FUNCIONES DE FEEDBACK VISUAL POR FILA ==========

// Marcar fila como "verificando"
function markRowAsVerifying(userId, services) {
    const row = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (!row) return;

    // Cambiar color de fondo
    row.classList.add('row-verifying');

    // Agregar badge "Verificando" al nombre
    const userName = row.querySelector('.user-name');
    if (userName && !userName.querySelector('.verification-badge')) {
        const badge = document.createElement('span');
        badge.className = 'verification-badge badge-verifying';
        badge.innerHTML = '🔄 Verificando...';
        userName.appendChild(badge);
    }
}

// Marcar fila como "éxito"
function markRowAsSuccess(userId) {
    const row = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (!row) return;

    // Remover estado anterior
    row.classList.remove('row-verifying');
    row.classList.add('row-success');

    // Actualizar badge
    const badge = row.querySelector('.verification-badge');
    if (badge) {
        badge.className = 'verification-badge badge-success';
        badge.innerHTML = '✅ Verificado';
        // Remover badge después de 3 segundos
        setTimeout(() => {
            badge.remove();
            row.classList.remove('row-success');
        }, 3000);
    }
}

// Marcar fila como "error"
function markRowAsFailed(userId) {
    const row = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (!row) return;

    // Remover estado anterior
    row.classList.remove('row-verifying');
    row.classList.add('row-failed');

    // Actualizar badge
    const badge = row.querySelector('.verification-badge');
    if (badge) {
        badge.className = 'verification-badge badge-failed';
        badge.innerHTML = '❌ Falló';
        // Remover badge después de 3 segundos
        setTimeout(() => {
            badge.remove();
            row.classList.remove('row-failed');
        }, 3000);
    }
}

// Limpiar estados de verificación al hacer clic en otra parte
function clearVerificationStates() {
    document.querySelectorAll('.row-verifying, .row-success, .row-failed').forEach(row => {
        row.classList.remove('row-verifying', 'row-success', 'row-failed');
    });
    document.querySelectorAll('.verification-badge').forEach(badge => {
        badge.remove();
    });
}

// ========== FIN FUNCIONES DE FEEDBACK VISUAL POR FILA ==========

// ========== FUNCIÓN DE REORDENAMIENTO AUTOMÁTICO ==========

// Flag para prevenir re-renders simultáneos
let isReordering = false;

/**
 * Obtiene los IDs de usuarios con checkboxes seleccionados
 * @returns {Set<string>} Set de IDs de usuarios seleccionados
 */
function getSelectedUserIds() {
    const selectedCheckboxes = document.querySelectorAll('.service-checkbox:checked');
    const selectedUserIds = new Set();
    selectedCheckboxes.forEach(checkbox => {
        selectedUserIds.add(checkbox.dataset.userId);
    });
    return selectedUserIds;
}

/**
 * Aplica reordenamiento a un array de usuarios poniendo primero los seleccionados
 * @param {Array} users - Array de usuarios a reordenar
 * @returns {Array} Array reordenado
 */
function applySelectionOrder(users) {
    const selectedUserIds = getSelectedUserIds();

    // Si no hay seleccionados, retornar sin cambios
    if (selectedUserIds.size === 0) {
        return users;
    }

    // Separar usuarios en dos grupos: seleccionados y no seleccionados
    const selectedUsers = [];
    const unselectedUsers = [];

    users.forEach(user => {
        if (selectedUserIds.has(String(user.id))) {
            selectedUsers.push(user);
        } else {
            unselectedUsers.push(user);
        }
    });

    // Combinar: primero seleccionados, luego no seleccionados
    return [...selectedUsers, ...unselectedUsers];
}

/**
 * Reordena la lista de usuarios poniendo primero los que tienen checkboxes seleccionados
 */
function reorderUsersBySelection() {
    // Prevenir re-renders simultáneos
    if (isReordering) {
        console.log('⏸️ Reordenamiento ya en progreso, ignorando...');
        return;
    }

    isReordering = true;

    try {
        // Capturar estado ANTES de re-renderizar
        const selectedUserIds = getSelectedUserIds();
        const selectedStates = new Map();

        // Guardar estado de TODOS los checkboxes
        document.querySelectorAll('.service-checkbox').forEach(cb => {
            const key = `${cb.dataset.userId}-${cb.dataset.service}`;
            selectedStates.set(key, cb.checked);
        });

        console.log('📌 Usuarios seleccionados:', Array.from(selectedUserIds));

        let usersToDisplay;

        // Si no hay seleccionados, mostrar orden original
        if (selectedUserIds.size === 0) {
            console.log('📌 No hay seleccionados, volviendo a orden original');
            usersToDisplay = window.allUsers;
        } else {
            // Aplicar reordenamiento
            usersToDisplay = applySelectionOrder(window.allUsers);
            console.log('📌 Lista reordenada:', {
                seleccionados: selectedUserIds.size,
                total: usersToDisplay.length
            });
        }

        // Renderizar lista (reordenada o normal)
        displayUsers(usersToDisplay);

        // Restaurar el estado EXACTO de todos los checkboxes
        // Usamos requestAnimationFrame para asegurar que el DOM esté listo
        requestAnimationFrame(() => {
            document.querySelectorAll('.service-checkbox').forEach(cb => {
                const key = `${cb.dataset.userId}-${cb.dataset.service}`;
                const wasChecked = selectedStates.get(key);
                if (wasChecked !== undefined) {
                    cb.checked = wasChecked;
                }
            });
            console.log('📌 Checkboxes restaurados');

            // Liberar el flag después de restaurar
            isReordering = false;
        });
    } catch (error) {
        console.error('❌ Error en reordenamiento:', error);
        isReordering = false;
    }
}

// ========== FIN FUNCIÓN DE REORDENAMIENTO AUTOMÁTICO ==========

function inicializarVerificarCredenciales() {
    const btnVerificarCredenciales = document.getElementById('btnVerificarCredenciales');
    if (!btnVerificarCredenciales) return;

    btnVerificarCredenciales.addEventListener('click', async function (e) {
        e.preventDefault();
        const btnCrearUsuario = document.getElementById('btnCrearUsuario');
        const verificarLoading = document.getElementById('verificarLoading');

        btnVerificarCredenciales.style.display = 'none';
        btnCrearUsuario.style.display = 'none';
        verificarLoading.classList.remove('hidden');
        verificarLoading.innerHTML = '<span class="spinner"></span><span class="loader-text">Verificando...</span>';

        const credenciales = {
            claveAFIP: document.getElementById('claveAFIP').value.trim(),
            claveATM: document.getElementById('claveATM').value.trim(),
            cuit: document.getElementById('cuit').value.trim(),
            cuil: document.getElementById('cuil').value.trim(),
        };

        if (!credenciales.cuit && !credenciales.cuil) {
            showAlert('Debes ingresar un CUIT o CUIL para verificar.', 'error');
            verificarLoading.classList.add('hidden');
            btnVerificarCredenciales.style.display = '';
            return;
        }

        try {
            const response = await window.electronAPI.user.verifyOnCreate(credenciales);
            window.empresasDisponible = response.puntosDeVentaArray || [];
            window.cuitAsociados = response.cuitAsociados || [];
            mostrarPuntosDeVenta(response.puntosDeVentaArray);

            if (response.success) {
                // Marcar qué servicios fueron verificados exitosamente usando la info detallada
                if (response.verificaciones) {
                    window.verificacionRealizada.afip = response.verificaciones.afip?.exitoso || false;
                    window.verificacionRealizada.atm = response.verificaciones.atm?.exitoso || false;
                } else {
                    // Fallback para compatibilidad
                    if (credenciales.claveAFIP) {
                        window.verificacionRealizada.afip = true;
                    }
                    if (credenciales.claveATM) {
                        window.verificacionRealizada.atm = true;
                    }
                }

                btnCrearUsuario.style.display = '';

                // Mensaje detallado
                let mensaje = 'Verificación completada.';
                const exitosos = [];
                const fallidos = [];

                if (response.verificaciones?.afip?.exitoso) exitosos.push('AFIP');
                if (response.verificaciones?.atm?.exitoso) exitosos.push('ATM');
                if (response.verificaciones?.afip?.intentado && !response.verificaciones?.afip?.exitoso) {
                    fallidos.push('AFIP');
                }
                if (response.verificaciones?.atm?.intentado && !response.verificaciones?.atm?.exitoso) {
                    fallidos.push('ATM');
                }

                if (exitosos.length > 0) {
                    mensaje += ` ✅ ${exitosos.join(', ')} validado(s).`;
                }
                if (fallidos.length > 0) {
                    mensaje += ` ⚠️ ${fallidos.join(', ')} falló/fallaron.`;
                }

                showAlert(mensaje, exitosos.length > 0 ? 'success' : 'warning');
            } else {
                // Fallo total
                window.verificacionRealizada.afip = false;
                window.verificacionRealizada.atm = false;
                window.cuitAsociados = [];
                showAlert(response.error || 'Credenciales inválidas. Intenta nuevamente.', 'error');
            }
        } catch (error) {
            window.verificacionRealizada.afip = false;
            window.verificacionRealizada.atm = false;
            window.cuitAsociados = [];
            showAlert(`Error de comunicación: ${error.message}`, 'error');
        } finally {
            verificarLoading.classList.add('hidden');
            btnVerificarCredenciales.style.display = '';
        }
    });
}

// Crear usuario
async function createUser() {
    try {
        const nombre = document.getElementById('nombre').value.trim();
        const claveAFIP = document.getElementById('claveAFIP').value.trim();
        const claveATM = document.getElementById('claveATM').value.trim();
        const cuit = document.getElementById('cuit').value.trim();
        const cuil = document.getElementById('cuil').value.trim();
        const tipoContribuyente = document.getElementById('tipoContribuyente').value;
        const apellido = document.getElementById('apellido').value.trim();

        if (!nombre ) {
            showAlert('Por favor completa nombre', 'error');
            return;
        }
        if (!cuit && !cuil) {
            showAlert('Debes ingresar CUIT o CUIL', 'error');
            return;
        }
        if (cuit && (cuit.length !== 11 || !/^\d+$/.test(cuit))) {
            showAlert('CUIT debe tener exactamente 11 números', 'error');
            return;
        }
        if (cuil && (cuil.length !== 11 || !/^\d+$/.test(cuil))) {
            showAlert('CUIL debe tener exactamente 11 números', 'error');
            return;
        }

        if (claveAFIP) {
            if (tipoContribuyente !== "C" && tipoContribuyente !== "B") {
                showAlert('Selecciona el tipo de contribuyente', 'error');
                return;
            }
        }
        if (!window.electronAPI || !window.electronAPI.user) {
            console.error('electronAPI.user no está disponible');
            showAlert('Error de configuración de la aplicación', 'error');
            return;
        }

        const result = await window.electronAPI.user.create({
            nombre,
            claveAFIP,
            claveATM,
            cuit,
            cuil,
            tipoContribuyente,
            apellido,
            empresasDisponible: window.empresasDisponible || [],
            cuitAsociados: window.cuitAsociados || [],
            verificadoAFIP: window.verificacionRealizada.afip,  // ✅ Pasar flag de verificación
            verificadoATM: window.verificacionRealizada.atm     // ✅ Pasar flag de verificación
        });

        if (result.success) {
            showAlert(`Cliente "${nombre}" creado exitosamente!`);
            document.getElementById('nombre').value = '';
            document.getElementById('claveAFIP').value = '';
            document.getElementById('claveATM').value = '';
            document.getElementById('cuit').value = '';
            document.getElementById('cuil').value = '';
            document.getElementById('tipoContribuyente').value = '';
            document.getElementById('apellido').value = '';

            // Resetear flags de verificación después de crear
            window.verificacionRealizada.afip = false;
            window.verificacionRealizada.atm = false;
            window.empresasDisponible = [];
            window.cuitAsociados = [];

            // Cerrar formulario y recargar lista
            document.getElementById('createSection').classList.add('hidden');
            await loadUsers();
        } else {
            showAlert(result.error || 'Error al crear cliente', 'error');
        }
    } catch (error) {
        console.error('Error completo:', error);
        showAlert('Error de comunicación con el backend: ' + error.message, 'error');
    }
}

// Cargar usuarios
async function loadUsers() {
    setLoading('loadLoading', true);
    try {
        const result = await window.electronAPI.user.getAll();
        if (result.success) {
            window.allUsers = result.users || [];
            displayUsers(window.allUsers);
            updateSearchCount(window.allUsers.length, window.allUsers.length);
        } else {
            showAlert(result.error || 'Error al cargar clientes', 'error');
        }
    } catch (error) {
        console.error('❌ Frontend Error:', error);
        showAlert('Error de comunicación con el backend', 'error');
    } finally {
        setLoading('loadLoading', false);
    }
}

function renderStatus(status) {
    switch (status) {
        case 'validado':
            return '<span class="status-badge status-validado">✔ Validado</span>';
        case 'invalido':
            return '<span class="status-badge status-invalido">✖ Inválido</span>';
        case 'requiere_actualizacion':
            return '<span class="status-badge status-advertencia">⚠️ Actualizar</span>';
        case 'pendiente':
            return '<span class="status-badge status-pendiente">⌛ Pendiente</span>';
        default:
            return '<span class="status-badge status-default">- N/A</span>';
    }
}

const SERVICIOS = ['afip', 'atm'];

// Mostrar usuarios en la lista
function displayUsers(users) {
    const usersList = document.getElementById('usersList');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');

    if (!users || users.length === 0) {
        usersList.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>No hay clientes registrados</p></div>`;
        bulkActionsContainer.innerHTML = ''; // Ocultar bulk actions cuando no hay usuarios
        return;
    }

    const selectAllCheckboxes = SERVICIOS.map(s => `
        <label>
            <input type="checkbox" id="selectAll-${s}" class="select-all-service-checkbox" data-service="${s}">
            <span>Sel. todo ${s.toUpperCase()}</span>
        </label>
    `).join('');

    const bulkActionsHeader = `
        <div class="user-item bulk-actions-header">
            <div class="bulk-actions-controls">
                ${selectAllCheckboxes}
                <button class="btn btn-primary" id="btnVerificarSeleccionados">Verificar Seleccionados</button>
            </div>
        </div>
    `;

    // Renderizar bulk actions en su contenedor fijo
    bulkActionsContainer.innerHTML = bulkActionsHeader;

    const usersHTML = users.map(user => {
        const servicesHTML = SERVICIOS.map(service => {
            const status = user[`estado_${service}`] || 'no_aplica';
            const hasKey = !!user[`clave${service.toUpperCase()}`];
            const isCheckable = hasKey && status !== 'validado';

            return `
                <div class="service-status">
                    <label>
                        <input 
                            type="checkbox" 
                            class="service-checkbox" 
                            data-user-id="${user.id}" 
                            data-service="${service}" 
                            ${isCheckable ? '' : 'disabled'}
                        >
                        <span>${service.toUpperCase()}:</span>
                    </label>
                    ${renderStatus(status)}
                </div>
            `;
        }).join('');

        return `
            <div class="user-item" data-user-id="${user.id}">
                <div class="user-info">
                    <div class="user-name">👤 ${user.nombre} ${user.apellido || ''}</div>
                    <div class="user-details">🆔 CUIT/L: ${user.cuit || user.cuil || 'N/A'}</div>
                </div>
                <div class="user-status">
                    ${servicesHTML}
                </div>
                <div class="user-actions">
                    <button class="btn btn-edit" onclick="window.editUser('${user.id}', '${user.nombre}', '${user.claveAFIP || ''}', '${user.claveATM || ''}', '${user.cuit || ''}', '${user.cuil || ''}', '${user.tipoContribuyente || ''}', '${user.apellido || ''}')">✏️ Editar</button>
                    <button class="btn btn-delete" onclick="window.deleteUser('${user.id}', '${user.nombre}')">🗑️ Eliminar</button>
                </div>
            </div>
        `;
    }).join('');

    usersList.innerHTML = usersHTML;
}

// ========== FUNCIONES DE BÚSQUEDA ==========

// Actualizar contador de resultados
function updateSearchCount(showing, total) {
    const countElement = document.getElementById('searchResultsCount');
    if (countElement) {
        if (showing === total) {
            countElement.textContent = `Mostrando ${total} cliente(s)`;
        } else {
            countElement.textContent = `Mostrando ${showing} de ${total} cliente(s)`;
        }
    }
}

// Filtrar usuarios según texto de búsqueda
function filterUsers(searchText) {
    const search = searchText.toLowerCase().trim();

    let usersToDisplay;

    if (!search) {
        // Sin búsqueda, mostrar todos
        usersToDisplay = window.allUsers;
    } else {
        // Filtrar usuarios
        usersToDisplay = window.allUsers.filter(user => {
            const nombre = (user.nombre || '').toLowerCase();
            const apellido = (user.apellido || '').toLowerCase();
            const cuit = String(user.cuit || '');
            const cuil = String(user.cuil || '');
            const nombreCompleto = `${nombre} ${apellido}`;

            return nombreCompleto.includes(search) ||
                   nombre.includes(search) ||
                   apellido.includes(search) ||
                   cuit.includes(search) ||
                   cuil.includes(search);
        });
    }

    // Aplicar reordenamiento por selección si hay checkboxes marcados
    const reorderedUsers = applySelectionOrder(usersToDisplay);

    // Mostrar usuarios (filtrados y reordenados)
    displayUsers(reorderedUsers);
    updateSearchCount(reorderedUsers.length, window.allUsers.length);

    // Restaurar checkboxes seleccionados después de renderizar
    const selectedUserIds = getSelectedUserIds();
    if (selectedUserIds.size > 0) {
        setTimeout(() => {
            selectedUserIds.forEach(userId => {
                const checkboxes = document.querySelectorAll(`.service-checkbox[data-user-id="${userId}"]`);
                checkboxes.forEach(cb => {
                    cb.checked = true;
                });
            });
        }, 50);
    }
}

// Limpiar búsqueda
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    filterUsers('');
}

// Inicializar eventos de búsqueda
function initializeSearchEvents() {
    const searchInput = document.getElementById('searchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterUsers(e.target.value);
        });

        // Focus automático al presionar Ctrl+F o Cmd+F
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        });
    }

    if (btnClearSearch) {
        btnClearSearch.addEventListener('click', clearSearch);
    }
}

// ========== FIN FUNCIONES DE BÚSQUEDA ==========

// ========== FUNCIONES DE NAVEGACIÓN ==========

// Función para mostrar/ocultar secciones
window.toggleSection = function(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('hidden');

        // Si se abre "Crear", cerrar "Editar" y viceversa
        if (sectionId === 'createSection' && !section.classList.contains('hidden')) {
            document.getElementById('editForm')?.classList.add('hidden');
            document.getElementById('bulkUploadSection')?.classList.add('hidden');
            // Scroll suave a la sección
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (sectionId === 'editForm' && !section.classList.contains('hidden')) {
            document.getElementById('createSection')?.classList.add('hidden');
            document.getElementById('bulkUploadSection')?.classList.add('hidden');
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (sectionId === 'bulkUploadSection' && !section.classList.contains('hidden')) {
            document.getElementById('createSection')?.classList.add('hidden');
            document.getElementById('editForm')?.classList.add('hidden');
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// ========== FIN FUNCIONES DE NAVEGACIÓN ==========

// Editar usuario
window.editUser = function (id, nombre, claveAFIP, claveATM, cuit, cuil, tipoContribuyente, apellido) {
    window.currentEditingUser = { id, nombre, claveAFIP, claveATM, cuit, cuil, tipoContribuyente, apellido };

    document.getElementById('editNombre').value = nombre;
    document.getElementById('editClaveAFIP').value = claveAFIP;
    document.getElementById('editClaveATM').value = claveATM;
    document.getElementById('editCuit').value = cuit;
    document.getElementById('editCuil').value = cuil;
    document.getElementById('editTipoContribuyente').value = tipoContribuyente;
    document.getElementById('editApellido').value = apellido;

    // ✨ Ocultar la sección de usuarios mientras se edita
    const usersSection = document.querySelector('.users-section');
    if (usersSection) {
        usersSection.classList.add('hidden');
    }

    document.getElementById('editForm').classList.remove('hidden');
    document.getElementById('editForm').scrollIntoView({ behavior: 'smooth' });
}

// Eliminar cliente
window.deleteUser = async function(id, nombre) {
    if (!confirm(`¿Estás seguro que deseas eliminar al cliente "${nombre}"?`)) {
        return;
    }
    try {
        setLoading('loadLoading', true);
        const result = await window.electronAPI.user.delete(id);
        if (result.success) {
            showAlert(`Cliente "${nombre}" eliminado exitosamente!`);
            await loadUsers();
        } else {
            showAlert(result.error || 'Error al eliminar cliente', 'error');
        }
    } catch (error) {
        console.error('Error al eliminar:', error);
        showAlert('Error de comunicación con el backend', 'error');
    } finally {
        setLoading('loadLoading', false);
    }
}

// Actualizar usuario
window.updateUser = async function() {
    if (!window.currentEditingUser) {
        console.error('No hay usuario seleccionado para editar');
        return;
    }

    const nombre = document.getElementById('editNombre').value.trim();
    const claveAFIP = document.getElementById('editClaveAFIP').value.trim();
    const claveATM = document.getElementById('editClaveATM').value.trim();
    const cuit = document.getElementById('editCuit').value.trim();
    const cuil = document.getElementById('editCuil').value.trim();
    const tipoContribuyente = document.getElementById('editTipoContribuyente').value;
    const apellido = document.getElementById('editApellido').value.trim();

    // if (!nombre || !claveAFIP) {
    //     showAlert('Por favor completa nombre y Clave AFIP', 'error');
    //     return;
    // }
    if (!cuit && !cuil) {
        showAlert('Debes ingresar CUIT o CUIL', 'error');
        return;
    }
    if (cuit && (cuit.length !== 11 || !/^\d+$/.test(cuit))) {
        showAlert('CUIT debe tener exactamente 11 números', 'error');
        return;
    }
    if (cuil && (cuil.length !== 11 || !/^\d+$/.test(cuil))) {
        showAlert('CUIL debe tener exactamente 11 números', 'error');
        return;
    }
    if (tipoContribuyente !== "B" && tipoContribuyente !== "C") {
        showAlert('Selecciona el tipo de contribuyente', 'error');
        return;
    }

    try {
        setLoading('updateLoading', true);

        const userData = {
            id: window.currentEditingUser.id,
            nombre,
            claveAFIP,
            claveATM,
            cuit,
            cuil,
            tipoContribuyente,
            apellido
        };

        // Siempre usar el handler 'update' que ya existe en el backend
        // Si cambiaron las credenciales, el backend automáticamente las marcará como 'pendiente'
        const result = await window.electronAPI.user.update(userData);

        if (result.success) {
            showAlert(`Usuario "${nombre}" actualizado exitosamente!`);
            cancelEdit();
            await loadUsers();

            // ✨ Mostrar nuevamente la sección de usuarios después de actualizar
            const usersSection = document.querySelector('.users-section');
            if (usersSection) {
                usersSection.classList.remove('hidden');
                setTimeout(() => {
                    usersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        } else {
            showAlert(result.error || 'Error al actualizar usuario', 'error');
        }
    } catch (error) {
        console.error('Error al actualizar:', error);
        showAlert('Error de comunicación con el backend', 'error');
    } finally {
        setLoading('updateLoading', false);
    }
}

// Cancelar edición
window.cancelEdit = function() {
    window.currentEditingUser = null;
    document.getElementById('editForm').classList.add('hidden');
    document.getElementById('editNombre').value = '';
    document.getElementById('editClaveAFIP').value = '';
    document.getElementById('editClaveATM').value = '';

    // ✨ Mostrar nuevamente la sección de usuarios al cancelar
    const usersSection = document.querySelector('.users-section');
    if (usersSection) {
        usersSection.classList.remove('hidden');
        setTimeout(() => {
            usersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

function inicializarUsuarioFrontend() {
    const usersList = document.getElementById('usersList');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');

    // Event listener para los controles de bulk actions (ahora en contenedor separado)
    bulkActionsContainer.addEventListener('click', async (event) => {
        const target = event.target;

        // --- Verificación en lote ---
        if (target.matches('#btnVerificarSeleccionados')) {
            const verificationJobs = Array.from(usersList.querySelectorAll('.service-checkbox:checked'))
                .map(cb => ({ userId: cb.dataset.userId, service: cb.dataset.service }));

            if (verificationJobs.length === 0) {
                showAlert('No hay servicios seleccionados para verificar.', 'warning');
                return;
            }

            if (!confirm(`¿Iniciar la verificación para los ${verificationJobs.length} servicios seleccionados?`)) return;

            // ✨ AGRUPAR SELECCIONADOS AL INICIO DE LA TABLA
            reorderUsersBySelection();

            // Agrupar por userId para contar usuarios únicos
            const uniqueUserIds = [...new Set(verificationJobs.map(j => j.userId))];
            const totalUsers = uniqueUserIds.length;

            // Mostrar panel de progreso
            showProgressPanel(totalUsers);

            // Deshabilitar botón durante el proceso
            target.disabled = true;
            target.style.opacity = '0.5';
            target.style.cursor = 'not-allowed';

            // Variables para tracking
            let currentStats = { validados: 0, con_fallos: 0 };
            const verificationDetails = []; // Array para guardar detalles de cada verificación

            // Listener para eventos de progreso en tiempo real
            const progressHandler = (progressData) => {
                console.log('Progreso recibido:', progressData);

                // Actualizar panel de progreso
                updateProgress(
                    progressData.processed,
                    progressData.total,
                    progressData.stats.validados,
                    progressData.stats.con_fallos
                );

                currentStats = progressData.stats;

                // Actualizar feedback visual por fila
                if (progressData.status === 'processing') {
                    markRowAsVerifying(progressData.userId, progressData.services);
                } else if (progressData.status === 'success' || progressData.status === 'failed' || progressData.status === 'error') {
                    // Guardar detalles de la verificación
                    const isSuccess = progressData.status === 'success';

                    // DEBUG: Ver qué datos llegan
                    console.log('🔍 [DEBUG] progressData completo:', progressData);
                    console.log('🔍 [DEBUG] progressData.services:', progressData.services);
                    console.log('🔍 [DEBUG] progressData.results:', progressData.results);

                    // Determinar servicio verificado
                    const services = progressData.services || [];

                    // Si services es un array vacío o no existe, usar un fallback
                    if (services.length === 0) {
                        console.warn('⚠️ No hay servicios en progressData, agregando detalle sin servicio específico');
                        verificationDetails.push({
                            userId: progressData.userId,
                            userName: progressData.userName || 'Usuario',
                            service: 'N/A',
                            success: isSuccess,
                            error: isSuccess ? null : (progressData.error || 'Error desconocido')
                        });
                    } else {
                        // Agregar cada servicio con su error específico
                        services.forEach(service => {
                            let errorMessage = null;

                            // Obtener el error específico del resultado del servicio
                            if (!isSuccess && progressData.results) {
                                const serviceResult = progressData.results[service];
                                if (serviceResult && serviceResult.error) {
                                    errorMessage = serviceResult.error;
                                }
                            }

                            // Si no hay error específico, usar el genérico
                            if (!isSuccess && !errorMessage) {
                                errorMessage = progressData.error || 'Error desconocido';
                            }

                            verificationDetails.push({
                                userId: progressData.userId,
                                userName: progressData.userName || 'Usuario',
                                service: service,
                                success: isSuccess,
                                error: errorMessage
                            });
                        });
                    }

                    console.log('🔍 [DEBUG] verificationDetails actualizado:', verificationDetails);

                    // Actualizar visual
                    if (isSuccess) {
                        markRowAsSuccess(progressData.userId);
                    } else {
                        markRowAsFailed(progressData.userId);
                    }
                }
            };

            // Suscribirse a eventos de progreso
            window.electronAPI.user.onVerificationProgress(progressHandler);

            try {
                const result = await window.electronAPI.user.verifyBatch({ verificationJobs });

                if (result.success) {
                    const validados = result.stats.validados || 0;
                    const fallos = result.stats.con_fallos || 0;

                    // Actualizar panel con resultados finales
                    updateProgress(totalUsers, totalUsers, validados, fallos);

                    // Mostrar mensaje de éxito
                    showAlert(`Verificación completada. Validados: ${validados}, Fallos: ${fallos}.`);

                    // Ocultar panel de progreso después de 5 segundos
                    hideProgressPanel(validados, fallos);

                    // ✨ MOSTRAR PANEL DE RESULTADOS PERSISTENTE
                    showResultsPanel({
                        successCount: validados,
                        failedCount: fallos,
                        details: verificationDetails
                    });

                    // Refrescar el usuario seleccionado en memoria si fue actualizado
                    if (result.updatedUsers && window.usuarioSeleccionado) {
                        const updatedCurrentUser = result.updatedUsers.find(u => String(u.id) === String(window.usuarioSeleccionado.id));
                        if (updatedCurrentUser) {
                            console.log('Refrescando el usuario seleccionado en memoria...');
                            window.usuarioSeleccionado = updatedCurrentUser;
                        }
                    }
                } else {
                    // Error en la verificación
                    hideProgressPanel(0, 0, 3000);
                    showAlert(result.error || 'Error en la verificación masiva.', 'error');

                    // Mostrar panel de resultados con error si hay detalles
                    if (verificationDetails.length > 0) {
                        showResultsPanel({
                            successCount: 0,
                            failedCount: verificationDetails.length,
                            details: verificationDetails
                        });
                    }
                }
            } catch (error) {
                // Error de comunicación
                hideProgressPanel(0, 0, 3000);
                showAlert(`Error de comunicación: ${error.message}`, 'error');

                // Mostrar panel de resultados con error si hay detalles parciales
                if (verificationDetails.length > 0) {
                    const successCount = verificationDetails.filter(d => d.success).length;
                    const failedCount = verificationDetails.filter(d => !d.success).length;
                    showResultsPanel({
                        successCount,
                        failedCount,
                        details: verificationDetails
                    });
                }
            } finally {
                // Re-habilitar botón
                target.disabled = false;
                target.style.opacity = '1';
                target.style.cursor = 'pointer';

                // Recargar lista de usuarios
                await loadUsers();
            }
        }

        // --- Checkbox "Seleccionar Todo por Servicio" ---
        if (target.matches('.select-all-service-checkbox')) {
            const service = target.dataset.service;
            const isChecked = target.checked;
            usersList.querySelectorAll(`.service-checkbox[data-service="${service}"]:not(:disabled)`).forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        }
    });

    // --- Eventos existentes ---
    document.getElementById('btnCrearUsuario')?.addEventListener('click', createUser);
    document.getElementById('btnRecargarLista')?.addEventListener('click', loadUsers);

    // Carga inicial y otros inicializadores
    loadUsers().catch(error => {
        console.error('Error cargando clientes:', error);
        showAlert('Error cargando la lista de clientes', 'error');
    });
    inicializarCargaMasiva();
    inicializarVerificarCredenciales();
    initializeSearchEvents();
    initializeResultsPanel();
    initializeAlertCloseButton();

    // Limpiar estados de verificación al hacer clic en cualquier parte (excepto en filas)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-item') && !e.target.closest('#btnVerificarSeleccionados')) {
            clearVerificationStates();
        }
    });

    // ❌ REORDENAMIENTO AUTOMÁTICO DESACTIVADO
    // El reordenamiento ahora se dispara solo al presionar "Verificar Seleccionados"
    // esto evita que la lista se reorganice constantemente mientras el usuario selecciona checkboxes

    // usersList.addEventListener('change', (e) => {
    //     if (e.target.matches('.service-checkbox')) {
    //         const wasChecked = e.target.checked;
    //         console.log('📌 Checkbox individual cambiado:', wasChecked ? 'SELECCIONADO' : 'DES-SELECCIONADO');
    //         setTimeout(() => {
    //             reorderUsersBySelection();
    //         }, 50);
    //     }
    // });

    // bulkActionsContainer.addEventListener('change', (e) => {
    //     if (e.target.matches('.select-all-service-checkbox')) {
    //         console.log('📌 Checkbox "Seleccionar Todo" cambiado, reordenando lista...');
    //         setTimeout(() => {
    //             reorderUsersBySelection();
    //         }, 100);
    //     }
    // });

    // ========== INICIALIZAR BOTONES MOSTRAR/OCULTAR CONTRASEÑA ==========
    initializePasswordToggleButtons();
}

// ========== FUNCIONALIDAD MOSTRAR/OCULTAR CONTRASEÑA ==========
function initializePasswordToggleButtons() {
    // Usar delegación de eventos en el documento para capturar botones dinámicos
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-toggle-password')) {
            const button = e.target.closest('.btn-toggle-password');
            const targetId = button.dataset.target;
            const input = document.getElementById(targetId);

            if (input) {
                togglePasswordVisibility(input, button);
            }
        }
    });
}

function togglePasswordVisibility(input, button) {
    if (input.type === 'password') {
        // Mostrar contraseña
        input.type = 'text';
        button.classList.add('active');
        button.textContent = '🙈'; // Cambiar a ojo cerrado cuando está visible
    } else {
        // Ocultar contraseña
        input.type = 'password';
        button.classList.remove('active');
        button.textContent = '👁️'; // Volver a ojo abierto cuando está oculta
    }
}

window.inicializarUsuarioFrontend = inicializarUsuarioFrontend;

// --- Lógica para Carga Masiva ---
function inicializarCargaMasiva() {
    // Usamos delegación de eventos en el documento
    document.addEventListener('click', async (event) => {
        // Si el elemento clickeado no es nuestro botón (o algo dentro de él), no hacemos nada
        if (!event.target.closest('#btnCargarExcel')) {
            return;
        }

        console.log('¡Clic en btnCargarExcel detectado por delegación de eventos!');

        const excelFile = document.getElementById('excelFile');
        const uploadStatus = document.getElementById('uploadStatus');
        const uploadLoading = document.getElementById('uploadLoading');

        if (excelFile.files.length === 0) {
            showAlert('Por favor, selecciona un archivo de Excel primero.', 'error');
            return;
        }

        const file = excelFile.files[0];
        const reader = new FileReader();

        reader.onload = async (e) => {
            const fileBuffer = e.target.result;
            const uploadButton = document.getElementById('btnCargarExcel');
            const buttonText = document.getElementById('btnCargarExcelText');

            // Iniciar estado de carga
            uploadLoading.classList.remove('hidden');
            buttonText.classList.add('hidden');
            uploadButton.disabled = true;
            uploadStatus.classList.add('hidden');
            uploadStatus.textContent = '';

            // Usar setTimeout para dar tiempo al navegador a renderizar los cambios
            setTimeout(async () => {
                try {
                    const result = await window.electronAPI.cargarUsuariosMasivo(fileBuffer);

                    if (result.success) {
                        let message = `<div class="result-summary">✅ Proceso completado: Leídos: ${result.usuariosLeidos}, Creados: ${result.usuariosCreados}, Actualizados: ${result.usuariosActualizados}.</div>`;

                        // Sección para usuarios que requieren actualización de clave
                        if (result.usuariosParaActualizar && result.usuariosParaActualizar.length > 0) {
                            message += `<span class="result-section-title warning">⚠️ Acciones Requeridas:</span><ul>`;
                            result.usuariosParaActualizar.forEach(u => {
                                message += `<li><b>${u.nombre}</b> (CUIT: ${u.cuit}) - Actualizar clave de: <b>${u.servicios}</b></li>`;
                            });
                            message += `</ul>`;
                        }

                        // Sección para usuarios con credenciales inválidas
                        if (result.usuariosConFallos && result.usuariosConFallos.length > 0) {
                            message += `<span class="result-section-title error-title">❌ Credenciales con Fallos:</span><ul>`;
                            result.usuariosConFallos.forEach(u => {
                                message += `<li><b>${u.nombre}</b> (CUIT: ${u.cuit}) - Fallo en: <b>${u.fallos}</b></li>`;
                            });
                            message += `</ul>`;
                        }

                        uploadStatus.innerHTML = message;
                        uploadStatus.className = 'status-message success';
                    } else {
                        if (result.errores > 1) {
                            errorMessage += ` (y ${result.errores - 1} más errores)`;
                        }
                        uploadStatus.innerHTML = errorMessage;
                        uploadStatus.className = 'status-message error';
                    }

                } catch (error) {
                    console.error('Error en la comunicación de carga masiva:', error);
                    uploadStatus.textContent = 'Error fatal de comunicación con el proceso principal.';
                    uploadStatus.className = 'status-message error';
                } finally {
                    // Restaurar estado del botón
                    uploadLoading.classList.add('hidden');
                    buttonText.classList.remove('hidden');
                    uploadButton.disabled = false;
                    uploadStatus.classList.remove('hidden');
                    excelFile.value = ''; // Limpiar el input de archivo
                }
            }, 50); // 50ms es un buen valor para asegurar el re-dibujado
        };

        reader.onerror = (error) => {
            console.error("Error leyendo el archivo:", error);
            showAlert('Error al leer el archivo seleccionado.', 'error');
        };

        reader.readAsArrayBuffer(file);
    });
}

function mostrarPuntosDeVenta(puntosDeVentaArray) {
    const contenedor = document.getElementById('elegirEmpresa');
    if (!contenedor) {
        console.warn('No se encontró el div elegirEmpresa');
        return;
    }
    if (Array.isArray(puntosDeVentaArray) && puntosDeVentaArray.length > 0) {
        contenedor.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold;">Puntos de Venta encontrados:</div>
            <ul style="margin:0; padding-left: 18px;">
                ${puntosDeVentaArray.map(nombre => `<li>${nombre}</li>`).join('')}
            </ul>
        `;
    } else {
        contenedor.innerHTML = '';
    }
}
