console.log('CARGANDO SCRIPT usuario.js...');

window.currentEditingUser = window.currentEditingUser || null;

// Variable global para empresas disponibles
window.empresasCliente = [];

// Variables globales para rastrear si las credenciales fueron verificadas
window.verificacionRealizada = {
    afip: false,
    atm: false
};

// Variable global para almacenar todos los usuarios
window.allUsers = [];

// Variable global para usuarios procesados en carga masiva (para verificación posterior)
window.usuariosCargaMasiva = [];

// NOTA: La función showConfirmModal() está definida en /utils/confirmModal.js
// y se carga automáticamente de forma global. Usala directamente con:
// const confirmed = await showConfirmModal({ message: '...' });

// Función para mostrar alertas
// ===== Modelo plano: helpers de CRUD =====

// Tipo por prefijo de CUIT (30/33/34 = jurídica) — misma regla que la migración.
function inferirTipoPorCuit(cuit, cuil) {
    const base = String(cuit || cuil || '');
    return ['30', '33', '34'].includes(base.slice(0, 2)) ? 'juridica' : 'fisica';
}

// Llena un <select> de "Representante AFIP" con los contribuyentes que tienen
// clave AFIP propia (los únicos que pueden representar). Excluye al propio cuit.
async function cargarOpcionesRepresentante(selectId, selectedCuit, excludeCuit) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    let candidatos = [];
    try {
        const r = await window.electronAPI.user.listCrud();
        if (r && r.success) {
            candidatos = (r.contribuyentes || [])
                .filter(c => c.tieneClaveAFIP && String(c.cuit) !== String(excludeCuit || ''));
        }
    } catch (e) {
        console.error('[representante] no se pudo cargar la lista:', e);
    }
    candidatos.sort((a, b) => (a.razonSocial || '').localeCompare(b.razonSocial || ''));
    sel.innerHTML = '<option value="">— Opera solo (sin representante) —</option>';
    for (const c of candidatos) {
        const opt = document.createElement('option');
        opt.value = c.cuit;
        opt.textContent = `${c.razonSocial || c.nombre || c.cuit} (${c.cuit})`;
        if (selectedCuit && String(selectedCuit) === String(c.cuit)) opt.selected = true;
        sel.appendChild(opt);
    }
}

// Un representado entra POR su representante → no tiene clave AFIP propia. Si hay
// representante elegido, deshabilitamos y limpiamos el campo Clave AFIP (evita el
// footgun de cargar ambos; el backend igual fuerza el invariante al guardar).
function sincronizarClaveAfipConRepresentante(selId, claveInputId) {
    const sel = document.getElementById(selId);
    const clave = document.getElementById(claveInputId);
    if (!sel || !clave) return;
    const aplicar = () => {
        if (sel.value) {
            clave.value = '';
            clave.disabled = true;
            clave.placeholder = 'Entra por su representante (sin clave propia)';
        } else {
            clave.disabled = false;
            clave.placeholder = 'Clave de AFIP';
        }
    };
    sel.onchange = aplicar;   // asignación = idempotente, no duplica listeners
    aplicar();
}

// ===================== ESTUDIOS / GRUPOS =====================
// Cache local de estudios (para pintar selects y badges sin ir al backend por fila).
window.gruposCache = window.gruposCache || [];
// Estudio seleccionado en el filtro de la lista ('' = todos, '__none__' = sin estudio).
window.grupoFiltroActual = window.grupoFiltroActual || '';

async function refrescarGruposCache() {
    try {
        const r = await window.electronAPI.grupos.listar();
        window.gruposCache = (r && r.success) ? (r.grupos || []) : [];
    } catch (e) {
        console.error('[grupos] no se pudo listar:', e);
        window.gruposCache = [];
    }
    return window.gruposCache;
}

function grupoPorId(id) {
    if (!id) return null;
    return window.gruposCache.find(g => g.id === id) || null;
}

// Llena un <select> de estudios desde la cache. comoFiltro=true → primera opción
// "Todos" + "Sin estudio"; si no, "— Sin estudio —" (para el form de alta/edición).
function llenarSelectGrupos(selectId, selectedId, { comoFiltro = false } = {}) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    if (comoFiltro) {
        sel.innerHTML = '<option value="">Todos los estudios</option><option value="__none__">— Sin estudio —</option>';
    } else {
        sel.innerHTML = '<option value="">— Sin estudio —</option>';
    }
    for (const g of window.gruposCache) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.nombre;
        if (selectedId && selectedId === g.id) opt.selected = true;
        sel.appendChild(opt);
    }
    // Mantener la selección del filtro aunque el grupo ya no exista (queda en '').
    if (selectedId && !comoFiltro && !window.gruposCache.some(g => g.id === selectedId)) {
        sel.value = '';
    }
}

// Escape mínimo para meter el nombre del estudio en HTML (atributo y texto).
function escaparHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// ===================== FIN ESTUDIOS / GRUPOS =====================

function showAlert(message, type = 'success') {
    const alert = document.getElementById('alert');
    const alertMessage = document.getElementById('alertMessage');

    alert.className = `alert alert-${type}`;
    alertMessage.textContent = message;
    alert.classList.remove('hidden');

    // Es un toast fijo (position:fixed): ya aparece dentro de la pantalla, no hace
    // falta scrollear hacia él. No se oculta solo: el usuario lo cierra con la X.
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
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
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
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            selectedStates.set(cb.dataset.userId, cb.checked);
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
            document.querySelectorAll('.user-checkbox').forEach(cb => {
                const wasChecked = selectedStates.get(cb.dataset.userId);
                if (wasChecked !== undefined) {
                    cb.checked = wasChecked;
                }
            });
            console.log('📌 Checkboxes restaurados');
            // Los tildes se restauraron DESPUÉS del render, así que los botones de
            // lote quedaron contando sobre una selección vacía: hay que reetiquetarlos.
            actualizarBotonesLote();

            // Liberar el flag después de restaurar
            isReordering = false;
        });
    } catch (error) {
        console.error('❌ Error en reordenamiento:', error);
        isReordering = false;
    }
}

// ========== FIN FUNCIÓN DE REORDENAMIENTO AUTOMÁTICO ==========

// Función para mostrar alertas dentro del formulario de verificación
function showVerificationAlert(message, type = 'success') {
    const alert = document.getElementById('verificacionAlert');
    const alertMessage = document.getElementById('verificacionAlertMessage');

    alert.className = `alert alert-${type}`;
    alertMessage.textContent = message;
    alert.classList.remove('hidden');

    // Auto-scroll al alert con un pequeño delay
    setTimeout(() => {
        alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Función para cerrar el alert de verificación
function closeVerificationAlert() {
    const alert = document.getElementById('verificacionAlert');
    alert.classList.add('hidden');
}

function inicializarVerificarCredenciales() {
    const btnVerificarCredenciales = document.getElementById('btnVerificarCredenciales');
    if (!btnVerificarCredenciales) return;

    // Inicializar botón de cerrar alert de verificación
    const btnCloseVerificacionAlert = document.getElementById('btnCloseVerificacionAlert');
    if (btnCloseVerificacionAlert) {
        btnCloseVerificacionAlert.addEventListener('click', closeVerificationAlert);
    }

    btnVerificarCredenciales.addEventListener('click', async function (e) {
        e.preventDefault();
        const btnCrearUsuario = document.getElementById('btnCrearUsuario');
        const verificarLoading = document.getElementById('verificarLoading');

        // Ocultar alerta previa si existe
        closeVerificationAlert();

        btnVerificarCredenciales.style.display = 'none';
        btnCrearUsuario.style.display = 'none';
        verificarLoading.classList.remove('hidden');
        verificarLoading.innerHTML = '<span class="spinner"></span><span class="loader-text">Verificando...</span>';

        const credenciales = {
            claveAFIP: document.getElementById('claveAFIP').value.trim(),
            claveATM: document.getElementById('claveATM').value.trim(),
            cuit: document.getElementById('cuit').value.trim(),
            cuil: document.getElementById('cuil').value.trim(),
            // Modo lite: solo validar credenciales. El scraping de empresas y PDV
            // se hace después con el botón "Analizar cliente" en la edición.
            soloLogin: true,
        };

        if (!credenciales.cuit && !credenciales.cuil) {
            showVerificationAlert('Debes ingresar un CUIT o CUIL para verificar.', 'error');
            verificarLoading.classList.add('hidden');
            btnVerificarCredenciales.style.display = '';
            return;
        }

        try {
            const response = await window.electronAPI.user.verifyOnCreate(credenciales);
            // En modo lite no vienen empresas. Quedan vacías hasta "Analizar cliente".
            window.empresasCliente = [];
            window.cuitAsociados = [];
            mostrarPendienteDeAnalisis();

            // Autocompletar el nombre con el titular leído en el login (AFIP/ATM).
            // Solo si el campo está vacío, para no pisar lo que el usuario haya tipeado.
            if (response && response.nombreDetectado) {
                const nombreInput = document.getElementById('nombre');
                if (nombreInput && !nombreInput.value.trim()) {
                    nombreInput.value = response.nombreDetectado;
                }
            }

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

                // Mensaje detallado (modo lite: las credenciales andan, pero todavía
                // no scrapeamos empresas; eso pasa al apretar "Analizar cliente").
                let mensaje = 'Credenciales verificadas.';
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
                    mensaje += ` ✅ ${exitosos.join(', ')} válido(s).`;
                }
                if (fallidos.length > 0) {
                    mensaje += ` ⚠️ ${fallidos.join(', ')} falló/fallaron.`;
                }
                mensaje += ' Podés crear el cliente y luego analizarlo para traer empresas y puntos de venta.';

                showVerificationAlert(mensaje, exitosos.length > 0 ? 'success' : 'warning');
            } else {
                // Fallo total
                window.verificacionRealizada.afip = false;
                window.verificacionRealizada.atm = false;
                window.cuitAsociados = [];
                showVerificationAlert(response.error || 'Credenciales inválidas. Intenta nuevamente.', 'error');
            }
        } catch (error) {
            window.verificacionRealizada.afip = false;
            window.verificacionRealizada.atm = false;
            window.cuitAsociados = [];
            showVerificationAlert(`Error de comunicación: ${error.message}`, 'error');
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

        // El nombre YA NO es obligatorio al guardar: se completa solo cuando se prueba
        // la clave/analiza (ahí se abre el navegador y se lee el titular de AFIP/ATM).
        // Si el login falla y nunca se pudo leer, el cliente queda sin nombre hasta que
        // lo edites a mano.
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

        // Modelo plano: armar la fila del contribuyente.
        const razonSocialInput = document.getElementById('razonSocial').value.trim();
        const representanteAfipCuit = document.getElementById('representanteAfip').value || null;
        const grupoId = document.getElementById('grupo').value || null;
        const tipo = inferirTipoPorCuit(cuit, cuil);
        // razonSocial siempre presente; en física la derivamos del nombre si está vacía.
        const razonSocial = razonSocialInput || [apellido, nombre].filter(Boolean).join(' ').trim() || nombre;

        const result = await window.electronAPI.user.create({
            tipo,
            razonSocial,
            nombre,
            apellido,
            cuit,
            cuil,
            tipoContribuyente,
            claveAFIP,
            claveATM,
            representanteAfipCuit,
            grupoId,
            verificadoAFIP: window.verificacionRealizada.afip,  // flag de verificación
            verificadoATM: window.verificacionRealizada.atm     // flag de verificación
        });

        if (result.success) {
            const etiqueta = nombre || razonSocial || cuit || cuil;
            const tieneClave = !!(claveAFIP || claveATM);
            // Si hay clave, el alert de "creado" se lo dejamos a la verificación
            // (que avisa OK/fallo). Sin clave, avisamos el alta acá y listo.
            if (!tieneClave) {
                showAlert(`Cliente ${etiqueta ? `"${etiqueta}" ` : ''}creado exitosamente!`);
            }
            document.getElementById('nombre').value = '';
            document.getElementById('claveAFIP').value = '';
            document.getElementById('claveATM').value = '';
            document.getElementById('cuit').value = '';
            document.getElementById('cuil').value = '';
            document.getElementById('tipoContribuyente').value = '';
            document.getElementById('apellido').value = '';
            document.getElementById('razonSocial').value = '';
            document.getElementById('representanteAfip').value = '';

            // Resetear flags de verificación después de crear
            window.verificacionRealizada.afip = false;
            window.verificacionRealizada.atm = false;
            window.empresasCliente = [];
            window.cuitAsociados = [];

            // Cerrar formulario y recargar lista
            document.getElementById('createSection').classList.add('hidden');
            await loadUsers();

            // Flujo unificado: al guardar probamos la clave automáticamente y
            // llevamos el foco al cliente recién creado (antes eran 2 pasos manuales
            // aparte en la lista). Ojo: esto abre un navegador y hace login real,
            // así que "Guardar" ahora tarda lo que tarde la verificación.
            const creado = (window.allUsers || []).find(u =>
                (cuit && String(u.cuit) === String(cuit)) ||
                (cuil && String(u.cuil) === String(cuil))
            );
            if (creado) {
                if (tieneClave) {
                    // probarClaveDesdeListado verifica, recarga la lista y avisa el
                    // resultado (OK / con fallo) con su propio alert.
                    await window.probarClaveDesdeListado(creado.id);
                }
                focusUserRow(creado.id);
            }
        } else {
            showAlert(result.error || 'Error al crear cliente', 'error');
        }
    } catch (error) {
        console.error('Error completo:', error);
        showAlert('Error de comunicación con el backend: ' + error.message, 'error');
    }
}

/**
 * Lleva el foco visual a la fila de un cliente: hace scroll hasta ella y la
 * resalta un momento. Se usa después de crear un cliente para que el operador
 * lo ubique enseguida en la lista.
 */
function focusUserRow(userId) {
    const row = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('highlight');
    setTimeout(() => row.classList.remove('highlight'), 4000);
}

// Cargar usuarios
async function loadUsers() {
    setLoading('loadLoading', true);
    try {
        // getAll = proyección users.json (shape rico para la fila). listCrud = repo
        // plano, ÚNICA fuente de grupoId (no viaja en la proyección: es CRUD-only).
        const [result, crud] = await Promise.all([
            window.electronAPI.user.getAll(),
            window.electronAPI.user.listCrud()
        ]);
        await refrescarGruposCache();
        if (result.success) {
            window.allUsers = result.users || [];
            // Pegar grupoId por id (fresco de contribuyentes.json).
            if (crud && crud.success) {
                const grupoPorUser = new Map((crud.contribuyentes || []).map(c => [String(c.id), c.grupoId || null]));
                window.allUsers.forEach(u => { u.grupoId = grupoPorUser.get(String(u.id)) ?? null; });
            }
            // Poblar el select del alta y el filtro de la lista con los estudios.
            llenarSelectGrupos('grupo', document.getElementById('grupo')?.value || '');
            llenarSelectGrupos('grupoFiltro', window.grupoFiltroActual || '', { comoFiltro: true });
            // filterUsers aplica el filtro de estudio + el texto actual (si los hay);
            // con ambos vacíos muestra todo, igual que antes.
            filterUsers(textoBusquedaActual());
            // Mantener fresca la lista de representantes del form de alta.
            cargarOpcionesRepresentante('representanteAfip', null, null)
                .then(() => sincronizarClaveAfipConRepresentante('representanteAfip', 'claveAFIP'));
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
        case 'no_verificado':
            // No se pudo comprobar (ej. captcha de AFIP). NO es inválido: reintentar.
            return '<span class="status-badge status-advertencia">🧩 No verificado</span>';
        case 'pendiente':
            return '<span class="status-badge status-pendiente">⌛ Pendiente</span>';
        default:
            return '<span class="status-badge status-default">- N/A</span>';
    }
}

const SERVICIOS = ['afip', 'atm'];

// Estados en los que reintentar el login sería tirar un intento a la basura: ya
// sabemos que esa credencial no entra. Se arreglan en Editar, y al cambiar la clave
// el repo devuelve el estado a 'pendiente' solo → vuelven al lote sin hacer nada.
const ESTADOS_AFIP_NO_REINTENTABLES = ['invalido', 'requiere_actualizacion'];

/**
 * Estado AFIP que realmente aplica a un cliente. Un representado entra con la clave
 * de SU representante, así que el estado que vale es el de él: el propio lo fuerza
 * el normalizador a 'no_aplica' (invariante: representado sin clave propia).
 */
function estadoAfipEfectivo(u) {
    if (!u.claveAFIP && u.representanteAfipCuit) return u.estadoAfipRepresentante || 'pendiente';
    return u.estado_afip || 'pendiente';
}

/**
 * ¿Este cliente es candidato al análisis por lote?
 *
 * Ya NO exige `estado_afip === 'validado'`. Desde que `analizarContribuyente` sella
 * el estado de la credencial con el resultado de su propio login, analizar VALIDA
 * de paso: pedir una validación previa obligaba a dos pasadas (dos logins contra
 * AFIP) para averiguar exactamente lo mismo.
 *
 * Solo pedimos que exista un camino de acceso (clave propia o representante) y que
 * no sepamos de antemano que la credencial está mal.
 */
function esCandidatoAAnalisis(u) {
    if (!u.claveAFIP && !u.representanteAfipCuit) return false;
    return !ESTADOS_AFIP_NO_REINTENTABLES.includes(estadoAfipEfectivo(u));
}

/**
 * Sobre qué clientes debe actuar una acción por lote.
 *
 * Regla ÚNICA para todos los botones de la barra: si hay filas tildadas, la acción
 * se limita a ellas; si no hay ninguna, aplica a todos los candidatos. Antes cada
 * botón hacía la suya (🔑 miraba los tildes, 🔍 y 🔄 los ignoraban y arrasaban con
 * la lista entera), así que el checkbox significaba cosas distintas según a cuál le
 * pegaras — y la selección se perdía en silencio.
 *
 * @param {Array} candidatos ya filtrados por el criterio propio de la acción
 * @returns {{lista: Array, huboSeleccion: boolean}}
 */
function objetivoDelLote(candidatos) {
    const ids = getSelectedUserIds();
    if (ids.size === 0) return { lista: candidatos, huboSeleccion: false };
    return { lista: candidatos.filter(u => ids.has(String(u.id))), huboSeleccion: true };
}

/**
 * Recorta una lista traída del backend a lo que hay EN PANTALLA.
 *
 * Hace falta porque las acciones de lote releen todos los clientes con `user.getAll()`
 * (para trabajar con datos frescos), pero el contador del botón cuenta lo mostrado.
 * Sin esto, con una búsqueda activa el botón diría "(3)" y el lote se comería los 109
 * de la base — la misma clase de sorpresa que tener la selección ignorada.
 */
function soloVisibles(users) {
    const visibles = new Set((window.usuariosMostrados || []).map(u => String(u.id)));
    if (visibles.size === 0) return users;   // sin referencia de pantalla, no recortamos
    return users.filter(u => visibles.has(String(u.id)));
}

/** Config de los dos botones de lote (el 🔑 se maneja aparte, ya leía la selección). */
const BOTONES_LOTE = [
    {
        id: 'btnAnalizarLote',
        filtro: u => esCandidatoAAnalisis(u) && u.analizado_afip !== true,
        etiqueta: n => `🔍 Analizar pendientes (${n})`,
        etiquetaSeleccion: n => `🔍 Analizar seleccionados (${n})`,
        title: 'Entra a AFIP, trae empresas y puntos de venta. El login valida la clave de paso.',
        titleVacio: 'Ninguno de los clientes seleccionados está pendiente de análisis.'
    },
    {
        id: 'btnReanalizarTodos',
        filtro: u => esCandidatoAAnalisis(u) && u.analizado_afip === true,
        etiqueta: n => `🔄 Refrescar todas (${n})`,
        etiquetaSeleccion: n => `🔄 Refrescar seleccionadas (${n})`,
        title: 'Vuelve a traer empresas y PDV de los ya analizados. Puede tardar bastante.',
        titleVacio: 'Ninguno de los clientes seleccionados fue analizado todavía.'
    }
];

/**
 * Sincroniza texto/estado de los botones de lote con la selección actual, para que
 * el botón diga sobre cuántos va a actuar ANTES de que lo aprieten:
 * "Analizar pendientes (12)" sin selección → "Analizar seleccionados (3)" con ella.
 */
function actualizarBotonesLote() {
    const users = window.usuariosMostrados || [];

    for (const cfg of BOTONES_LOTE) {
        const btn = document.getElementById(cfg.id);
        if (!btn) continue;

        const candidatos = users.filter(cfg.filtro);
        // Sin candidatos en toda la lista, el botón no tiene razón de existir.
        // (display en vez del atributo `hidden`: los .btn traen display propio del
        // sistema de diseño y le ganarían a `hidden`).
        if (candidatos.length === 0) { btn.style.display = 'none'; continue; }

        const { lista, huboSeleccion } = objetivoDelLote(candidatos);
        btn.style.display = '';
        btn.textContent = huboSeleccion
            ? cfg.etiquetaSeleccion(lista.length)
            : cfg.etiqueta(candidatos.length);

        // Tildaste filas pero ninguna aplica: lo mostramos APAGADO con el motivo, en
        // vez de esconderlo — desaparecer justo después de tildar parece un bug.
        btn.disabled = huboSeleccion && lista.length === 0;
        btn.title = btn.disabled ? cfg.titleVacio : cfg.title;
    }
}

// La fila separa DOS ejes que antes compartían un mismo botón (y confundían):
//   • PROBAR credenciales → login liviano, AFIP y/o ATM (renderControlProbar)
//   • ANALIZAR            → scraping pesado, solo AFIP     (renderControlAnalizar)
// Cada uno es su propio control; el usuario ya no adivina qué hace el 🔑 según el estado.

/** Servicios con clave PROPIA cargada que se pueden probar en esta fila. */
function serviciosProbables(user) {
    const s = [];
    if (user.claveAFIP) s.push('afip');   // representado sin clave propia no entra: su AFIP se prueba desde el representante
    if (user.claveATM) s.push('atm');
    return s;
}

/**
 * Control "Probar credenciales" de la fila (split button).
 *   - 0 claves propias → nada (un representado sin ATM no tiene qué probar acá).
 *   - 1 clave          → botón directo "🔑 Probar AFIP" / "🔑 Probar ATM".
 *   - 2 claves         → botón que al CLICK prueba AMBAS (caso común, un solo click);
 *                        al pasar el mouse o darle foco (Tab) se despliega para elegir
 *                        una sola. El desplegar/ocultar es 100% CSS (:hover/:focus-within),
 *                        no hay toggle por click ni click-afuera que mantener.
 * Si el AFIP propio está fallado, se tiñe de rojo (mismo aviso que el viejo 🔁),
 * pero el verbo sigue siendo "Probar": la urgencia es color, no otro botón.
 */
function renderControlProbar(user) {
    const servicios = serviciosProbables(user);
    if (servicios.length === 0) return '';

    const afipFallado = user.claveAFIP && ['invalido', 'requiere_actualizacion'].includes(user.estado_afip);
    const urgente = afipFallado ? ' menu-probar--urgente' : '';

    // Una sola clave: botón directo, sin desplegable (un menú de una opción molesta).
    if (servicios.length === 1) {
        const svc = servicios[0];
        const etiqueta = svc === 'afip' ? 'Probar AFIP' : 'Probar ATM';
        return `<button class="btn-accion-afip${urgente}" data-probar="${svc}" data-user-id="${user.id}" title="${etiqueta}: login liviano para validar la clave.">🔑</button>`;
    }

    // Dos claves: split button. El disparador prueba AMBAS; el flyout (hover/foco) ofrece
    // una sola. Todos son [data-probar] → el mismo handler los cubre.
    return `
        <div class="menu-probar${urgente}" data-user-id="${user.id}">
            <button class="btn-accion-afip menu-probar-toggle" data-probar="afip,atm" data-user-id="${user.id}" title="Probar ambas (AFIP y ATM). Pasá el mouse o Tab para elegir una.">🔑 ▾</button>
            <div class="menu-probar-lista">
                <button data-probar="afip" data-user-id="${user.id}">Solo AFIP</button>
                <button data-probar="atm" data-user-id="${user.id}">Solo ATM</button>
            </div>
        </div>`;
}

/**
 * Control "Analizar" de la fila (eje AFIP pesado). Solo aparece si hay acceso AFIP
 * (clave propia o representante). El 🔄 "Refrescar" es el mismo verbo, ya analizado.
 */
function renderControlAnalizar(user, nombreSafe) {
    const tieneAccesoAfip = !!user.claveAFIP || !!user.representanteAfipCuit;
    if (!tieneAccesoAfip) return '';

    if (user.analizado_afip === true) {
        return `<button class="btn btn-actualizar" data-analizar data-user-id="${user.id}" data-nombre="${nombreSafe}" title="Refrescar: vuelve a traer empresas y puntos de venta.">🔄</button>`;
    }
    return `<button class="btn-accion-afip btn-accion-traer" data-analizar data-user-id="${user.id}" data-nombre="${nombreSafe}" title="Analizar: entra a AFIP y trae empresas y puntos de venta. Valida la clave de paso.">🔍</button>`;
}

// Mostrar usuarios en la lista
function displayUsers(users) {
    const usersList = document.getElementById('usersList');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');

    // Lo que está EN PANTALLA (puede ser un subconjunto de allUsers si hay búsqueda).
    // Los botones de lote cuentan sobre esto, no sobre la lista completa: si filtraste,
    // el lote tiene que operar sobre lo que ves.
    window.usuariosMostrados = users || [];

    if (!users || users.length === 0) {
        usersList.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>No hay clientes registrados</p></div>`;
        bulkActionsContainer.innerHTML = ''; // Ocultar bulk actions cuando no hay usuarios
        return;
    }

    // Un solo checkbox por cliente para el lote. El lote prueba todas las claves
    // cargadas del cliente (más simple que un checkbox por servicio).
    const selectAllCheckbox = `
        <button class="btn btn-seleccion" id="selectAllUsers">☑️ Seleccionar todos</button>
    `;

    // Los botones de lote se renderizan SIEMPRE y vacíos: su texto, su visibilidad y
    // su estado los decide `actualizarBotonesLote()` según la selección, que cambia
    // sin re-renderizar la lista. Si los pintáramos condicionalmente acá, un botón
    // que aparece recién al tildar no existiría en el DOM para poder actualizarlo.
    const bulkActionsHeader = `
        <div class="user-item bulk-actions-header">
            <div class="bulk-actions-controls">
                ${selectAllCheckbox}
                <div class="menu-probar menu-probar--barra">
                    <button class="btn btn-primary" id="btnVerificarSeleccionados" data-probar-lote="afip,atm" title="Probar AFIP y ATM de los seleccionados. Pasá el mouse o Tab para elegir un solo servicio.">🔑 Probar seleccionadas ▾</button>
                    <div class="menu-probar-lista">
                        <button data-probar-lote="afip">Solo AFIP</button>
                        <button data-probar-lote="atm">Solo ATM</button>
                    </div>
                </div>
                <button class="btn btn-warning" id="btnAnalizarLote" style="display:none"></button>
                <button class="btn btn-info" id="btnReanalizarTodos" style="display:none"></button>
            </div>
        </div>
    `;

    // Renderizar bulk actions en su contenedor fijo
    bulkActionsContainer.innerHTML = bulkActionsHeader;

    const usersHTML = users.map(user => {
        // Chips de estado (solo lectura) por servicio que tenga clave cargada.
        const chips = SERVICIOS.map(service => {
            const hasKey = !!user[`clave${service.toUpperCase()}`];
            // AFIP sin clave propia pero con representante: opera con la clave de él.
            // No es "sin clave", así que mostramos el acceso heredado y su estado.
            if (!hasKey && service === 'afip' && user.representanteAfipCuit) {
                const repNombre = user.representanteAfipNombre || 'su representante';
                const estadoRep = user.estadoAfipRepresentante || 'pendiente';
                return `<div class="service-status"><span>AFIP:</span> ${renderStatus(estadoRep)} <span class="badge-representado" title="Entra a AFIP con la clave de ${repNombre}">↳</span></div>`;
            }
            if (!hasKey) {
                return `<div class="service-status"><span>${service.toUpperCase()}:</span> <span class="status-badge status-default">— sin clave</span></div>`;
            }
            const status = user[`estado_${service}`] || 'pendiente';
            return `<div class="service-status"><span>${service.toUpperCase()}:</span> ${renderStatus(status)}</div>`;
        }).join('');

        // Dos controles separados: Probar (credenciales) y Analizar (empresas/PDV).
        // nombreSafe va como atributo HTML → escapamos comillas dobles también (un
        // apellido con " rompía el render con el escape viejo de solo comilla simple).
        const nombreSafe = (user.nombre || '').replace(/"/g, '&quot;');
        const controlProbar = renderControlProbar(user);
        const controlAnalizar = renderControlAnalizar(user, nombreSafe);

        // Badge del estudio (si pertenece a uno). El color viene del registro de grupos.
        const grupo = grupoPorId(user.grupoId);
        const badgeEstudio = grupo
            ? `<div class="badge-estudio" style="--badge-color:${escaparHtml(grupo.color || '#888')}" title="Estudio: ${escaparHtml(grupo.nombre)}">🏢 ${escaparHtml(grupo.nombre)}</div>`
            : '';

        return `
            <div class="user-item" data-user-id="${user.id}">
                <label class="user-select">
                    <input type="checkbox" class="user-checkbox" data-user-id="${user.id}">
                </label>
                <div class="user-info">
                    <div class="user-name" title="${user.nombre || ''} ${user.apellido || ''}">👤 ${user.nombre} ${user.apellido || ''}</div>
                    <div class="user-details">🆔 CUIT/L: ${user.cuit || user.cuil || 'N/A'}</div>
                    ${badgeEstudio}
                </div>
                <div class="user-status">
                    ${chips}
                </div>
                <div class="user-actions">
                    ${controlProbar}
                    ${controlAnalizar}
                    <button class="btn btn-edit" title="Editar cliente" onclick="window.editUser('${user.id}', '${user.nombre}', '${user.claveAFIP || ''}', '${user.claveATM || ''}', '${user.cuit || ''}', '${user.cuil || ''}', '${user.tipoContribuyente || ''}', '${user.apellido || ''}', ${user.analizado_afip === true})">✏️</button>
                    <button class="btn btn-delete" title="Eliminar cliente" onclick="window.deleteUser('${user.id}', '${user.nombre}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');

    usersList.innerHTML = usersHTML;

    // Después de pintar las filas: los checkboxes ya existen, así que los botones de
    // lote pueden leer la selección y decir a cuántos van a alcanzar.
    actualizarBotonesLote();
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

// Texto que hay ahora mismo en el buscador (para re-aplicar filtros tras recargar).
function textoBusquedaActual() {
    const s = document.getElementById('searchInput');
    return s ? s.value : '';
}

// Filtrar usuarios: primero por estudio (pre-filtro), después por texto. Se combinan
// con AND — buscar "perez" dentro del "Estudio A" devuelve los Pérez de ese estudio.
function filterUsers(searchText) {
    const search = (searchText || '').toLowerCase().trim();
    const grupoSel = window.grupoFiltroActual || '';

    // 1) Pre-filtro por estudio. '' = todos; '__none__' = sin estudio; id = ese estudio.
    let base = window.allUsers || [];
    if (grupoSel === '__none__') base = base.filter(u => !u.grupoId);
    else if (grupoSel) base = base.filter(u => u.grupoId === grupoSel);

    // 2) Filtro por texto sobre el subconjunto ya recortado.
    let usersToDisplay;
    if (!search) {
        usersToDisplay = base;
    } else {
        usersToDisplay = base.filter(user => {
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
                const checkboxes = document.querySelectorAll(`.user-checkbox[data-user-id="${userId}"]`);
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

    // Filtro por estudio: recuerda la elección y re-aplica junto al texto actual.
    const grupoFiltro = document.getElementById('grupoFiltro');
    if (grupoFiltro) {
        grupoFiltro.addEventListener('change', (e) => {
            window.grupoFiltroActual = e.target.value;
            filterUsers(textoBusquedaActual());
        });
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

            // ✅ RESETEAR COMPLETAMENTE EL FORMULARIO DE CREACIÓN
            resetCreateForm();

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

// Función para resetear el formulario de creación
function resetCreateForm() {
    // Limpiar todos los campos del formulario
    document.getElementById('nombre').value = '';
    document.getElementById('apellido').value = '';
    document.getElementById('cuit').value = '';
    document.getElementById('cuil').value = '';
    document.getElementById('tipoContribuyente').value = '';
    document.getElementById('claveAFIP').value = '';
    document.getElementById('claveATM').value = '';

    // Re-habilitar todos los inputs por si quedaron deshabilitados
    document.getElementById('nombre').disabled = false;
    document.getElementById('apellido').disabled = false;
    document.getElementById('cuit').disabled = false;
    document.getElementById('cuil').disabled = false;
    document.getElementById('tipoContribuyente').disabled = false;
    document.getElementById('claveAFIP').disabled = false;
    document.getElementById('claveATM').disabled = false;

    // Resetear estados de verificación
    window.verificacionRealizada.afip = false;
    window.verificacionRealizada.atm = false;
    window.empresasCliente = [];
    window.cuitAsociados = [];

    // El botón Guardar está siempre visible (sin candado): no depende de probar la clave.
    const btnCrear = document.getElementById('btnCrearUsuario');
    if (btnCrear) {
        btnCrear.style.display = '';
    }

    // Asegurar que los inputs de contraseña estén en modo password
    document.getElementById('claveAFIP').type = 'password';
    document.getElementById('claveATM').type = 'password';

    // Resetear botones de toggle password
    document.querySelectorAll('.btn-toggle-password').forEach(btn => {
        btn.classList.remove('active');
        btn.textContent = '👁️';
    });

    console.log('✅ Formulario de creación reseteado completamente');
}

// ========== FIN FUNCIONES DE NAVEGACIÓN ==========

// Escapes mínimos para inyectar texto/valores en el editor de empresas.
function _escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _escAttr(s) {
    return _escHtml(s).replace(/"/g, '&quot;');
}

/**
 * Renderiza el editor de empresas representadas dentro del form de edición.
 * Una fila por empresa: razón social (label) + CUIT + clave ATM editables.
 * Los PDV no se tocan acá (los preserva el backend al fusionar).
 */
function renderEditorEmpresas(empresas) {
    const cont = document.getElementById('editEmpresasEditor');
    if (!cont) return;
    const lista = Array.isArray(empresas) ? empresas : [];

    if (lista.length === 0) {
        cont.innerHTML = `<div style="padding:10px 12px;background:#fff8e1;border:1px solid #f0ad4e;border-radius:6px;color:#b26a00;font-size:13px;">
            ⏳ Este cliente no tiene empresas cargadas. Apretá <em>"Analizar Cliente"</em> para traerlas desde AFIP, y después cargales el CUIT y la clave ATM.
        </div>`;
        return;
    }

    const filas = lista.map(e => {
        const rs = (e && e.razonSocial) || '';
        const cuit = (e && e.cuit) || '';
        const claveATM = (e && e.claveATM) || '';
        return `
        <div class="empresa-edit-row" data-razon="${_escAttr(rs)}" style="display:grid;grid-template-columns:1fr 160px 1fr;gap:10px;align-items:end;padding:8px 10px;border-bottom:1px solid #e3ecf6;">
            <div style="font-weight:600;color:#1f3a5f;align-self:center;">${_escHtml(rs)}</div>
            <label style="font-size:12px;color:#555;">CUIT empresa
                <input type="text" class="emp-cuit" maxlength="11" value="${_escAttr(cuit)}" placeholder="11 dígitos" style="width:100%;margin-top:2px;">
            </label>
            <label style="font-size:12px;color:#555;">Clave ATM
                <input type="text" class="emp-claveatm" value="${_escAttr(claveATM)}" placeholder="Clave ATM de la empresa" style="width:100%;margin-top:2px;">
            </label>
        </div>`;
    }).join('');

    cont.innerHTML = `
        <div style="font-weight:700;color:#1f3a5f;margin-bottom:2px;">🏢 Empresas representadas</div>
        <div style="font-size:12px;color:#555;margin-bottom:8px;">El CUIT y la clave ATM son <strong>de la empresa</strong>: ATM entra con el CUIT de la empresa, no con el del representante.</div>
        <div style="background:#f3f7fc;border:1px solid #c9dbef;border-radius:8px;overflow:hidden;">${filas}</div>`;
}

/**
 * Junta lo cargado en el editor de empresas. Devuelve `undefined` si no hay
 * editor renderizado (así el backend no toca las empresas existentes).
 */
function collectEmpresasDelEditor() {
    const rows = document.querySelectorAll('#editEmpresasEditor .empresa-edit-row');
    if (rows.length === 0) return undefined;
    return Array.from(rows).map(row => ({
        razonSocial: row.getAttribute('data-razon') || '',
        cuit: (row.querySelector('.emp-cuit')?.value || '').trim(),
        claveATM: (row.querySelector('.emp-claveatm')?.value || '').trim()
    }));
}

// Editar usuario
window.editUser = async function (id, nombre, claveAFIP, claveATM, cuit, cuil, tipoContribuyente, apellido, analizadoAfip) {
    window.currentEditingUser = { id, nombre, claveAFIP, claveATM, cuit, cuil, tipoContribuyente, apellido, analizado_afip: analizadoAfip === true, empresas: [] };

    document.getElementById('editNombre').value = nombre;
    document.getElementById('editClaveAFIP').value = claveAFIP;
    document.getElementById('editClaveATM').value = claveATM;
    document.getElementById('editCuit').value = cuit;
    document.getElementById('editCuil').value = cuil;
    document.getElementById('editTipoContribuyente').value = tipoContribuyente;
    document.getElementById('editApellido').value = apellido;

    actualizarEstadoAnalisisEnEdicion();

    // Modelo plano: traer el contribuyente completo para razón social + representante + estudio.
    let razonSocial = '';
    let representanteAfipCuit = null;
    let grupoId = null;
    try {
        const resp = await window.electronAPI.user.getById(id);
        if (resp && resp.success && resp.user) {
            razonSocial = resp.user.razonSocial || '';
            representanteAfipCuit = resp.user.representanteAfipCuit || null;
            grupoId = resp.user.grupoId || null;
        }
    } catch (err) {
        console.error('[editUser] no se pudo traer el contribuyente:', err);
    }
    document.getElementById('editRazonSocial').value = razonSocial;
    await cargarOpcionesRepresentante('editRepresentanteAfip', representanteAfipCuit, cuit);
    sincronizarClaveAfipConRepresentante('editRepresentanteAfip', 'editClaveAFIP');
    // Estudio: refrescamos la cache por si se creó uno recién en el modal de gestión.
    await refrescarGruposCache();
    llenarSelectGrupos('editGrupo', grupoId || '');

    // El editor de empresas embebido se jubiló: la representación ahora es el
    // dropdown "Representante AFIP". Limpiamos el contenedor por si quedó algo.
    const editorEmp = document.getElementById('editEmpresasEditor');
    if (editorEmp) editorEmp.innerHTML = '';

    // ✨ Ocultar la sección de usuarios mientras se edita
    const usersSection = document.querySelector('.users-section');
    if (usersSection) {
        usersSection.classList.add('hidden');
    }

    document.getElementById('editForm').classList.remove('hidden');
    document.getElementById('editForm').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Actualiza el cartel "#editEstadoAnalisis" según el flag analizado_afip del cliente actual.
 */
function actualizarEstadoAnalisisEnEdicion() {
    const cont = document.getElementById('editEstadoAnalisis');
    if (!cont) return;
    const analizado = !!(window.currentEditingUser && window.currentEditingUser.analizado_afip);
    if (analizado) {
        cont.innerHTML = `<span style="color:#2e7d32;">✅ Cliente analizado.</span> Empresas y puntos de venta están en caché.`;
    } else {
        cont.innerHTML = `<span style="color:#b26a00;">⏳ Cliente sin analizar.</span> Apretá <em>"Analizar Cliente"</em> para traer empresas y puntos de venta desde AFIP.`;
    }
}

/**
 * Dispara el análisis completo del cliente: login AFIP, lista empresas,
 * scrapea PDV detallados (ABM) de cada una y persiste en `cliente.empresas`.
 * Setea `analizado_afip=true` si al menos una empresa fue procesada con éxito.
 */
window.analizarCliente = async function () {
    if (!window.currentEditingUser || !window.currentEditingUser.id) {
        showAlert('No hay un cliente en edición.', 'error');
        return;
    }

    const btn = document.getElementById('btnAnalizarCliente');
    const loading = document.getElementById('analizarLoading');

    if (btn) btn.disabled = true;
    if (loading) {
        loading.classList.remove('hidden');
        loading.innerHTML = '<span class="spinner"></span><span class="loader-text">Analizando...</span>';
    }

    try {
        // Modelo plano: analiza ESTE contribuyente (login por resolverAcceso) y
        // guarda sus PDV en contribuyentes.json.
        const response = await window.electronAPI.empresa.analizarContribuyente({
            cuit: window.currentEditingUser.cuit
        });

        if (response.success) {
            const pdvs = (response.data && response.data.puntosDeVenta) || [];
            window.currentEditingUser.analizado_afip = true;
            actualizarEstadoAnalisisEnEdicion();
            showAlert(`✅ Análisis completado: ${pdvs.length} punto(s) de venta para ${response.data.razonSocial}.`, 'success');
            if (typeof loadUsers === 'function') await loadUsers();
        } else {
            showAlert(`❌ Análisis falló: ${response.message || response.error || 'error desconocido'}`, 'error');
        }
    } catch (error) {
        console.error('[Analizar cliente] error:', error);
        showAlert(`Error de comunicación: ${error.message}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.classList.add('hidden');
    }
};

// Eliminar cliente
window.deleteUser = async function(id, nombre) {
    // Mostrar modal de confirmación personalizado (NO usa confirm() nativo que causa problemas de foco)
    const confirmed = await showConfirmModal({
        title: 'Eliminar Cliente',
        message: `¿Estás seguro que deseas eliminar al cliente "${nombre}"?`,
        icon: '🗑️',
        confirmText: 'Sí, eliminar',
        cancelText: 'No, cancelar',
        confirmBtnClass: 'danger'
    });

    if (!confirmed) {
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

        // Modelo plano: fila del contribuyente. cuit es la PK (no se edita acá).
        const razonSocialInput = document.getElementById('editRazonSocial').value.trim();
        const representanteAfipCuit = document.getElementById('editRepresentanteAfip').value || null;
        const grupoId = document.getElementById('editGrupo').value || null;
        const razonSocial = razonSocialInput || [apellido, nombre].filter(Boolean).join(' ').trim() || nombre;

        const userData = {
            id: window.currentEditingUser.id,
            tipo: inferirTipoPorCuit(cuit, cuil),
            razonSocial,
            nombre,
            apellido,
            cuit,
            cuil,
            tipoContribuyente,
            claveAFIP,
            claveATM,
            representanteAfipCuit,
            grupoId
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
    const editorEmpresas = document.getElementById('editEmpresasEditor');
    if (editorEmpresas) editorEmpresas.innerHTML = '';

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

        // --- Análisis por lote (los tildados; si no hay tildes, todos los pendientes) ---
        if (target.matches('#btnAnalizarLote')) {
            await analizarPorLote();
            return;
        }

        // --- Re-análisis por lote (los tildados; si no hay tildes, todos los analizados) ---
        if (target.matches('#btnReanalizarTodos')) {
            await reanalizarTodos();
            return;
        }

        // --- Verificación en lote (split: click=ambas, flyout=Solo AFIP / Solo ATM) ---
        const btnLote = target.closest('[data-probar-lote]');
        if (btnLote) {
            await ejecutarProbarLote(btnLote.dataset.probarLote.split(','));
            return;
        }

        // --- Botón "Seleccionar todos" (toggle) ---
        const btnSelAll = target.closest('#selectAllUsers');
        if (btnSelAll) {
            const checkboxes = Array.from(usersList.querySelectorAll('.user-checkbox:not(:disabled)'));
            const todosMarcados = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            const nuevoEstado = !todosMarcados;   // si ya están todos, deselecciona; si no, selecciona
            checkboxes.forEach(cb => { cb.checked = nuevoEstado; });
            btnSelAll.classList.toggle('activo', nuevoEstado);
            btnSelAll.textContent = nuevoEstado ? '☑️ Quitar selección' : '☑️ Seleccionar todos';
            actualizarBotonesLote();
        }
    });

    // Cualquier cambio de selección reetiqueta los botones de lote ("Analizar
    // pendientes (12)" ⇄ "Analizar seleccionados (3)"). Va delegado en la lista para
    // que siga andando después de cada re-render.
    usersList.addEventListener('change', (e) => {
        if (e.target.matches('.user-checkbox')) actualizarBotonesLote();
    });

    // Acciones de fila por delegación (Probar / Analizar). Antes iban por onclick
    // inline; se migran a data-* para no meter claves ni nombres sin escapar en el
    // HTML, y para que un solo listener cubra todas las filas. El abrir/cerrar del
    // menú "Probar" es CSS puro (:hover/:focus-within), así que acá solo hay acciones.
    usersList.addEventListener('click', (e) => {
        // Disparador "Probar ambas", "Solo AFIP" o "Solo ATM": todos llevan data-probar.
        const btnProbar = e.target.closest('[data-probar]');
        if (btnProbar) {
            window.probarClaveDesdeListado(btnProbar.dataset.userId, btnProbar.dataset.probar.split(','));
            return;
        }

        // Botón "Analizar" / "Refrescar".
        const btnAnalizar = e.target.closest('[data-analizar]');
        if (btnAnalizar) {
            window.analizarClienteDesdeListado(btnAnalizar.dataset.userId, btnAnalizar.dataset.nombre || '');
            return;
        }

        // Clic en el nombre/CUIT (.user-info) marca/desmarca el checkbox de esa fila:
        // cómodo para seleccionar sin apuntar al cuadradito.
        const info = e.target.closest('.user-info');
        if (info) {
            const cb = info.closest('.user-item[data-user-id]')?.querySelector('.user-checkbox');
            if (!cb || cb.disabled) return;
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    // --- Eventos existentes ---
    document.getElementById('btnCrearUsuario')?.addEventListener('click', createUser);
    document.getElementById('btnRecargarLista')?.addEventListener('click', loadUsers);

    // El modal de gestión de estudios avisa por evento cuando crea/renombra/elimina:
    // recargamos para reflejar nombres, badges y selects (y limpiar los que se fueron).
    document.addEventListener('grupos:cambiado', () => {
        loadUsers().catch(err => console.error('[grupos] recarga tras cambio falló:', err));
    });

    // Exportar todos los clientes a Excel (proceso inverso a la carga masiva).
    document.getElementById('btnExportarClientes')?.addEventListener('click', async () => {
        try {
            // Respeta el filtro de estudio: exporta solo el estudio elegido (o todos).
            const grupoId = window.grupoFiltroActual || null;
            const res = await window.electronAPI.exportarClientesExcel({ grupoId });
            if (res.success) {
                const grupo = grupoPorId(grupoId);
                const alcance = grupoId === '__none__' ? ' (sin estudio)'
                    : grupo ? ` del estudio "${grupo.nombre}"` : '';
                showAlert(`Exportados ${res.total} cliente(s)${alcance} a:\n${res.filePath}\n\nOjo: el archivo incluye las claves en texto plano. Guardalo con cuidado.`, 'success');
            } else if (!res.canceled) {
                showAlert(`No se pudo exportar: ${res.error || 'error desconocido'}`, 'error');
            }
        } catch (err) {
            showAlert(`Error al exportar: ${err.message}`, 'error');
        }
    });

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

// ========== VERIFICACIÓN DE USUARIOS CARGADOS MASIVAMENTE ==========

/**
 * Verifica las credenciales de los usuarios que fueron cargados desde el Excel
 */
async function verificarUsuariosCargados() {
    const usuarios = window.usuariosCargaMasiva || [];

    if (usuarios.length === 0) {
        showAlert('No hay usuarios para verificar.', 'warning');
        return;
    }

    // Filtrar solo usuarios con credenciales
    const usuariosVerificables = usuarios.filter(u => u.tieneAFIP || u.tieneATM);

    if (usuariosVerificables.length === 0) {
        showAlert('Ninguno de los usuarios cargados tiene credenciales para verificar.', 'warning');
        return;
    }

    // Construir los jobs de verificación
    const verificationJobs = [];
    usuariosVerificables.forEach(u => {
        if (u.tieneAFIP) {
            verificationJobs.push({ userId: u.id, service: 'afip' });
        }
        if (u.tieneATM) {
            verificationJobs.push({ userId: u.id, service: 'atm' });
        }
    });

    // Confirmar antes de proceder
    const confirmed = await showConfirmModal({
        title: 'Verificar Credenciales',
        message: `¿Iniciar la verificación de ${verificationJobs.length} servicio(s) para ${usuariosVerificables.length} usuario(s)?`,
        icon: '🔐',
        confirmText: 'Sí, verificar',
        cancelText: 'Cancelar',
        confirmBtnClass: 'primary'
    });

    if (!confirmed) return;

    // Obtener referencia al botón y deshabilitarlo
    const btnVerificar = document.getElementById('btnVerificarCargados');
    if (btnVerificar) {
        btnVerificar.disabled = true;
        btnVerificar.innerHTML = '<span class="spinner"></span> Verificando...';
    }

    // Mostrar panel de progreso
    const totalUsers = usuariosVerificables.length;
    showProgressPanel(totalUsers);

    // Variables para tracking
    const verificationDetails = [];

    // Listener para eventos de progreso
    const progressHandler = (progressData) => {
        console.log('Progreso verificación carga masiva:', progressData);

        updateProgress(
            progressData.processed,
            progressData.total,
            progressData.stats.validados,
            progressData.stats.con_fallos
        );

        if (progressData.status === 'processing') {
            markRowAsVerifying(progressData.userId, progressData.services);
        } else if (progressData.status === 'success' || progressData.status === 'failed' || progressData.status === 'error') {
            const isSuccess = progressData.status === 'success';
            const services = progressData.services || [];

            services.forEach(service => {
                let errorMessage = null;
                if (!isSuccess && progressData.results) {
                    const serviceResult = progressData.results[service];
                    if (serviceResult && serviceResult.error) {
                        errorMessage = serviceResult.error;
                    }
                }
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

            updateProgress(totalUsers, totalUsers, validados, fallos);
            showAlert(`Verificación completada. Validados: ${validados}, Fallos: ${fallos}.`);
            hideProgressPanel(validados, fallos);

            showResultsPanel({
                successCount: validados,
                failedCount: fallos,
                details: verificationDetails
            });
        } else {
            hideProgressPanel(0, 0, 3000);
            showAlert(result.error || 'Error en la verificación.', 'error');

            if (verificationDetails.length > 0) {
                showResultsPanel({
                    successCount: 0,
                    failedCount: verificationDetails.length,
                    details: verificationDetails
                });
            }
        }
    } catch (error) {
        hideProgressPanel(0, 0, 3000);
        showAlert(`Error de comunicación: ${error.message}`, 'error');

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
        // Limpiar usuarios de carga masiva
        window.usuariosCargaMasiva = [];

        // Ocultar el botón (ya no es relevante)
        if (btnVerificar) {
            btnVerificar.style.display = 'none';
        }

        // Recargar lista de usuarios
        await loadUsers();
    }
}

// ========== FIN VERIFICACIÓN DE USUARIOS CARGADOS MASIVAMENTE ==========

window.inicializarUsuarioFrontend = inicializarUsuarioFrontend;

// --- Lógica para Carga Masiva ---
function inicializarCargaMasiva() {
    // Usamos delegación de eventos en el documento
    document.addEventListener('click', async (event) => {
        // Manejar click en botón "Verificar usuarios cargados"
        if (event.target.closest('#btnVerificarCargados')) {
            event.preventDefault();
            await verificarUsuariosCargados();
            return;
        }

        // Manejar click en botón "Descargar modelo"
        if (event.target.closest('#btnDescargarModelo')) {
            event.preventDefault();
            try {
                const res = await window.electronAPI.descargarPlantillaClientes();
                if (res.success) {
                    showAlert(`Modelo guardado en:\n${res.filePath}`, 'success');
                } else if (!res.canceled) {
                    showAlert(`No se pudo generar el modelo: ${res.error || 'error desconocido'}`, 'error');
                }
            } catch (err) {
                showAlert(`Error al descargar el modelo: ${err.message}`, 'error');
            }
            return;
        }

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
                        // Guardar usuarios procesados para verificación posterior
                        window.usuariosCargaMasiva = result.usuariosProcesados || [];

                        // Contar cuántos usuarios tienen credenciales verificables
                        const usuariosVerificables = window.usuariosCargaMasiva.filter(u => u.tieneAFIP || u.tieneATM);
                        const totalServicios = window.usuariosCargaMasiva.reduce((acc, u) => {
                            return acc + (u.tieneAFIP ? 1 : 0) + (u.tieneATM ? 1 : 0);
                        }, 0);

                        const errores = result.errores || 0;
                        // Si hubo errores, el encabezado no debe fingir éxito total.
                        const icono = errores > 0 ? '⚠️' : '✅';
                        // "Sin cambios": ya estaban con todo cargado (fill-only no tocó nada).
                        const sinCambios = result.usuariosSinCambios || 0;
                        const sinCambiosTxt = sinCambios > 0 ? `, Sin cambios: ${sinCambios}` : '';
                        let message = `<div class="result-summary">${icono} Proceso terminado: Leídos: ${result.usuariosLeidos}, Creados: ${result.usuariosCreados}, Actualizados: ${result.usuariosActualizados}${sinCambiosTxt}, Con error: ${errores}.</div>`;

                        // Detalle de las filas que fallaron (antes quedaban ocultas).
                        if (errores > 0 && Array.isArray(result.listaErrores) && result.listaErrores.length > 0) {
                            const MAX = 10;
                            message += `<span class="result-section-title error-title">❌ Filas con error (${errores}):</span><ul>`;
                            result.listaErrores.slice(0, MAX).forEach(e => {
                                // e.fila puede ser la fila cruda (objeto) o 'General'; mostramos el CUIT si lo hay.
                                const ref = e.fila && typeof e.fila === 'object'
                                    ? (e.fila.cuit || e.fila.cuil || JSON.stringify(e.fila).slice(0, 60))
                                    : e.fila;
                                message += `<li><b>${ref}</b> — ${e.error}</li>`;
                            });
                            if (result.listaErrores.length > MAX) {
                                message += `<li>… y ${result.listaErrores.length - MAX} más</li>`;
                            }
                            message += `</ul>`;
                        }

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

                        // Botón para verificar usuarios cargados (solo si hay servicios verificables)
                        if (usuariosVerificables.length > 0) {
                            message += `
                                <div class="verificar-cargados-container" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
                                    <p style="margin-bottom: 10px; color: #555;">
                                        Se encontraron <strong>${usuariosVerificables.length}</strong> usuario(s) con <strong>${totalServicios}</strong> servicio(s) para verificar.
                                    </p>
                                    <button id="btnVerificarCargados" class="btn btn-primary" style="width: 100%;">
                                        🔐 Verificar credenciales de usuarios cargados
                                    </button>
                                </div>
                            `;
                        }

                        uploadStatus.innerHTML = message;
                        uploadStatus.className = errores > 0 ? 'status-message warning' : 'status-message success';
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

function mostrarEmpresas(empresasArray) {
    const contenedor = document.getElementById('elegirEmpresa');
    if (!contenedor) {
        console.warn('No se encontró el div elegirEmpresa');
        return;
    }
    // Acepta array de strings (razones sociales) o array de objetos Empresa.
    const razones = (Array.isArray(empresasArray) ? empresasArray : [])
        .map(e => typeof e === 'string' ? e : (e && e.razonSocial))
        .filter(Boolean);
    if (razones.length > 0) {
        contenedor.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold;">Empresas asociadas a este CUIT:</div>
            <ul style="margin:0; padding-left: 18px;">
                ${razones.map(nombre => `<li>${nombre}</li>`).join('')}
            </ul>
        `;
    } else {
        contenedor.innerHTML = '';
    }
}

/**
 * Mensaje informativo cuando se hace verificación lite (sin scraping de empresas).
 * El usuario sabe que el cliente todavía no está "analizado".
 */
function mostrarPendienteDeAnalisis() {
    const contenedor = document.getElementById('elegirEmpresa');
    if (!contenedor) return;
    contenedor.innerHTML = `
        <div style="padding: 10px; background:#fff8e1; border-left: 3px solid #f0ad4e; font-size: 13px;">
            ⏳ <strong>Análisis pendiente.</strong> Las credenciales son válidas pero todavía no scrapeamos empresas ni puntos de venta.
            Después de crear el cliente, entrá a la edición y apretá <em>"Analizar cliente"</em> para completar los datos.
        </div>
    `;
}

/**
 * Modal overlay para mostrar el progreso del análisis (individual o por lote).
 * Devuelve un controlador con .actualizar(actual, mensaje, stats) y .cerrar().
 */
function mostrarModalProgreso(total) {
    const overlay = document.createElement('div');
    overlay.id = 'modalProgresoAnalisis';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:white;padding:30px;border-radius:8px;min-width:420px;max-width:640px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 10px 0;">🔍 Analizando ${total === 1 ? 'cliente' : `${total} clientes`}</h3>
            <div id="modalProgresoTexto" style="margin:15px 0;font-size:14px;color:#444;">Preparando...</div>
            <div style="background:#eee;border-radius:4px;height:18px;overflow:hidden;">
                <div id="modalProgresoBarra" style="background:linear-gradient(90deg,#28a745,#20c997);height:100%;width:0%;transition:width .3s;"></div>
            </div>
            <div id="modalProgresoStats" style="margin-top:15px;font-size:13px;color:#666;"></div>
            <div style="margin-top:10px;font-size:11px;color:#999;">El proceso no se puede cancelar a mitad. Se agrupa por credencial: un login por clave AFIP.</div>
        </div>
    `;
    document.body.appendChild(overlay);

    return {
        // totalOverride: el lote agrupa por credencial, así que el total real (nº de
        // logins) recién se conoce cuando llega el primer progreso. Permitimos pisarlo.
        actualizar(actual, mensaje, stats, totalOverride) {
            const tot = totalOverride || total;
            const t = document.getElementById('modalProgresoTexto');
            const b = document.getElementById('modalProgresoBarra');
            const s = document.getElementById('modalProgresoStats');
            if (t) t.textContent = `${actual}/${tot}: ${mensaje}`;
            if (b) b.style.width = `${Math.round((actual / tot) * 100)}%`;
            if (s && stats) s.innerHTML = `✅ ${stats.exitosos} &nbsp;&nbsp; ❌ ${stats.fallidos}`;
        },
        cerrar() {
            overlay.remove();
        }
    };
}

/**
 * Prueba credenciales de un cliente desde el listado. Login liviano, sin scraping.
 *
 * @param {string|number} userId
 * @param {string[]} [servicios] Qué servicios probar: ['afip'], ['atm'] o ambos.
 *        Si se omite, prueba TODAS las claves cargadas (comportamiento histórico).
 *        Poder pedir ['atm'] solo es lo que permite validar ATM sin loguear AFIP.
 */
window.probarClaveDesdeListado = async function (userId, servicios) {
    const u = (window.allUsers || []).find(x => String(x.id) === String(userId));
    if (!u) { showAlert('No se encontró el cliente.', 'error'); return; }

    // Filtro: solo servicios pedidos Y con clave cargada (pedir 'afip' sin clave AFIP
    // no tiene sentido). Sin `servicios` → todas las que tenga.
    const pedidos = Array.isArray(servicios) ? servicios : ['afip', 'atm'];
    const jobs = [];
    if (pedidos.includes('afip') && u.claveAFIP) jobs.push({ userId: u.id, service: 'afip' });
    if (pedidos.includes('atm') && u.claveATM) jobs.push({ userId: u.id, service: 'atm' });
    if (jobs.length === 0) {
        showAlert('Este cliente no tiene esa clave cargada para probar. Editalo y cargala.', 'warning');
        return;
    }

    const display = `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.cuit || u.id;
    markRowAsVerifying(userId, jobs.map(j => j.service));

    try {
        const result = await window.electronAPI.user.verifyBatch({ verificationJobs: jobs });
        if (result.success) {
            const v = result.stats?.validados || 0;
            const f = result.stats?.con_fallos || 0;
            showAlert(`Prueba de ${display}: ${v} OK, ${f} con fallo.`, f === 0 ? 'success' : 'warning');
        } else {
            showAlert(result.error || `No se pudo probar la clave de ${display}.`, 'error');
        }
    } catch (err) {
        showAlert(`Error probando ${display}: ${err.message}`, 'error');
    } finally {
        await loadUsers();
    }
};

/**
 * Dispara el análisis de un solo cliente desde el botón inline del listado.
 * (sin abrir el formulario de edición).
 */
window.analizarClienteDesdeListado = async function (userId, nombre) {
    const display = nombre || `cliente ${userId}`;
    // Modelo plano: analizar por CUIT. El cuit está en la fila ya cargada.
    const u = (window.allUsers || []).find(x => String(x.id) === String(userId));
    const cuit = u && u.cuit;
    if (!cuit) { showAlert(`No se encontró el CUIT de ${display}.`, 'error'); return; }

    const progreso = mostrarModalProgreso(1);
    progreso.actualizar(1, display, { exitosos: 0, fallidos: 0 });

    try {
        const response = await window.electronAPI.empresa.analizarContribuyente({ cuit });
        progreso.cerrar();
        if (response.success) {
            const pdvs = (response.data && response.data.puntosDeVenta) || [];
            showAlert(`✅ ${display}: ${pdvs.length} punto(s) de venta.`, 'success');
        } else {
            showAlert(`❌ ${display}: ${response.message || response.error || 'falló'}`, 'error');
        }
    } catch (err) {
        progreso.cerrar();
        showAlert(`Error analizando ${display}: ${err.message}`, 'error');
    } finally {
        if (typeof loadUsers === 'function') await loadUsers();
    }
};

/**
 * Prueba credenciales de los clientes SELECCIONADOS para el/los servicio(s) pedidos.
 * Es el motor detrás del split button "Probar seleccionadas": click en el principal
 * → ['afip','atm']; "Solo AFIP"/"Solo ATM" → un único servicio.
 *
 * Caso borde central: pedir un servicio que algún (o ningún) seleccionado no tiene.
 * Un job se arma SOLO cuando el servicio pedido coincide con una clave cargada, así
 * que "probar ATM" sobre clientes sin ATM no genera un login destinado a fallar:
 *   - nadie del grupo tiene la clave → no se prueba nada, se avisa y se corta.
 *   - algunos la tienen → se prueban esos y se informa cuántos se saltearon.
 *
 * @param {string[]} servicios p.ej. ['atm'] o ['afip','atm']
 */
async function ejecutarProbarLote(servicios) {
    const usersList = document.getElementById('usersList');
    const btnMain = document.getElementById('btnVerificarSeleccionados');

    const seleccionados = Array.from(usersList.querySelectorAll('.user-checkbox:checked'))
        .map(cb => (window.allUsers || []).find(u => String(u.id) === String(cb.dataset.userId)))
        .filter(Boolean);

    if (seleccionados.length === 0) {
        showAlert('No hay clientes seleccionados. Tildá al menos uno.', 'warning');
        return;
    }

    // Un job por (servicio pedido ∩ clave cargada). `aportaron` = quiénes tienen algo
    // que probar; el resto se saltea sin generar un login condenado a fallar.
    const verificationJobs = [];
    const aportaron = new Set();
    seleccionados.forEach(u => {
        if (servicios.includes('afip') && u.claveAFIP) { verificationJobs.push({ userId: u.id, service: 'afip' }); aportaron.add(String(u.id)); }
        if (servicios.includes('atm') && u.claveATM) { verificationJobs.push({ userId: u.id, service: 'atm' }); aportaron.add(String(u.id)); }
    });

    const nombreSvc = servicios.length === 1 ? servicios[0].toUpperCase() : 'AFIP y ATM';

    // Caso borde: pediste un servicio y NINGÚN seleccionado tiene esa clave.
    if (verificationJobs.length === 0) {
        showAlert(`Ninguno de los ${seleccionados.length} cliente(s) seleccionado(s) tiene clave ${nombreSvc} cargada. No hay nada que probar.`, 'warning');
        return;
    }

    // Algunos seleccionados no tienen la clave pedida: se prueban los que sí, con aviso.
    const salteados = seleccionados.length - aportaron.size;
    let msg = `¿Probar ${servicios.length === 1 ? 'la clave ' + nombreSvc : 'las claves ' + nombreSvc} de ${aportaron.size} cliente(s) seleccionado(s)?`;
    if (salteados > 0) msg += `\n\n${salteados} seleccionado(s) no tiene(n) clave ${nombreSvc} y se saltea(n).`;
    if (!confirm(msg)) return;

    reorderUsersBySelection();

    const totalUsers = aportaron.size;
    showProgressPanel(totalUsers);

    // Deshabilitamos el botón PRINCIPAL (no el ítem clickeado): es el que queda visible.
    if (btnMain) { btnMain.disabled = true; btnMain.style.opacity = '0.5'; btnMain.style.cursor = 'not-allowed'; }

    const verificationDetails = [];

    const progressHandler = (progressData) => {
        updateProgress(progressData.processed, progressData.total, progressData.stats.validados, progressData.stats.con_fallos);

        if (progressData.status === 'processing') {
            markRowAsVerifying(progressData.userId, progressData.services);
        } else if (progressData.status === 'success' || progressData.status === 'failed' || progressData.status === 'error') {
            const isSuccess = progressData.status === 'success';
            const services = progressData.services || [];

            if (services.length === 0) {
                verificationDetails.push({
                    userId: progressData.userId,
                    userName: progressData.userName || 'Usuario',
                    service: 'N/A',
                    success: isSuccess,
                    error: isSuccess ? null : (progressData.error || 'Error desconocido')
                });
            } else {
                services.forEach(service => {
                    let errorMessage = null;
                    if (!isSuccess && progressData.results) {
                        const serviceResult = progressData.results[service];
                        if (serviceResult && serviceResult.error) errorMessage = serviceResult.error;
                    }
                    if (!isSuccess && !errorMessage) errorMessage = progressData.error || 'Error desconocido';
                    verificationDetails.push({
                        userId: progressData.userId,
                        userName: progressData.userName || 'Usuario',
                        service,
                        success: isSuccess,
                        error: errorMessage
                    });
                });
            }

            if (isSuccess) markRowAsSuccess(progressData.userId);
            else markRowAsFailed(progressData.userId);
        }
    };

    window.electronAPI.user.onVerificationProgress(progressHandler);

    try {
        const result = await window.electronAPI.user.verifyBatch({ verificationJobs });

        if (result.success) {
            const validados = result.stats.validados || 0;
            const fallos = result.stats.con_fallos || 0;
            updateProgress(totalUsers, totalUsers, validados, fallos);
            showAlert(`Verificación completada. Validados: ${validados}, Fallos: ${fallos}.`);
            hideProgressPanel(validados, fallos);
            showResultsPanel({ successCount: validados, failedCount: fallos, details: verificationDetails });

            if (result.updatedUsers && window.usuarioSeleccionado) {
                const updatedCurrentUser = result.updatedUsers.find(u => String(u.id) === String(window.usuarioSeleccionado.id));
                if (updatedCurrentUser) window.usuarioSeleccionado = updatedCurrentUser;
            }
        } else {
            hideProgressPanel(0, 0, 3000);
            showAlert(result.error || 'Error en la verificación masiva.', 'error');
            if (verificationDetails.length > 0) {
                showResultsPanel({ successCount: 0, failedCount: verificationDetails.length, details: verificationDetails });
            }
        }
    } catch (error) {
        hideProgressPanel(0, 0, 3000);
        showAlert(`Error de comunicación: ${error.message}`, 'error');
        if (verificationDetails.length > 0) {
            const successCount = verificationDetails.filter(d => d.success).length;
            const failedCount = verificationDetails.filter(d => !d.success).length;
            showResultsPanel({ successCount, failedCount, details: verificationDetails });
        }
    } finally {
        if (btnMain) { btnMain.disabled = false; btnMain.style.opacity = '1'; btnMain.style.cursor = 'pointer'; }
        await loadUsers();
    }
}

// Progreso del lote de análisis. onAnalizarLoteProgreso usa ipcRenderer.on, que NO
// se puede desuscribir desde el renderer → registramos UN solo listener permanente
// que delega en el handler del lote en curso. Al terminar, se pone en null y los
// eventos rezagados se ignoran (no ensucian un modal ya cerrado).
let _handlerProgresoLote = null;
let _suscritoProgresoLote = false;
function usarHandlerProgresoLote(handler) {
    _handlerProgresoLote = handler;
    if (_suscritoProgresoLote) return;
    _suscritoProgresoLote = true;
    window.electronAPI.empresa.onAnalizarLoteProgreso((data) => {
        if (_handlerProgresoLote) _handlerProgresoLote(data);
    });
}

/**
 * Analiza una lista de clientes vía `empresa:analizarLote` (UN login por credencial).
 * El loop y el agrupamiento viven en el backend; acá solo confirmamos, mostramos el
 * progreso por grupo (login) y resumimos. Helper de "Analizar pendientes" y "Refrescar".
 *
 * @param {Array} clientes
 * @param {{icono:string, mensajeConfirmacion:string, textoConfirmar:string}} opciones
 */
async function procesarLoteAnalisis(clientes, opciones) {
    if (clientes.length === 0) {
        return showAlert('No hay clientes que procesar.', 'info');
    }

    const confirmed = await showConfirmModal({
        title: 'Análisis por lote',
        message: opciones.mensajeConfirmacion,
        icon: opciones.icono,
        confirmText: opciones.textoConfirmar,
        cancelText: 'Cancelar'
    });
    if (!confirmed) return;

    const cuits = clientes.map(c => c.cuit).filter(Boolean);
    const progreso = mostrarModalProgreso(clientes.length);
    progreso.actualizar(0, 'Agrupando por credencial…', { exitosos: 0, fallidos: 0 });

    let ok = 0;
    let fallo = 0;
    const resumen = [];

    // Progreso POR GRUPO (login): el backend nos manda el índice y el total real de
    // logins, más los contribuyentes que cubre cada uno.
    usarHandlerProgresoLote((p) => {
        const cubre = `login ${p.loginCuit} · ${p.targets.length} contribuyente(s)`;
        if (p.status === 'processing') {
            progreso.actualizar(p.indice - 1, `Entrando: ${cubre}…`, { exitosos: ok, fallidos: fallo }, p.total);
        } else if (p.status === 'ok') {
            ok++;
            resumen.push(`✅ ${cubre}: ${p.message || 'OK'}`);
            progreso.actualizar(p.indice, `Listo: ${cubre}`, { exitosos: ok, fallidos: fallo }, p.total);
        } else { // 'fallo' | 'error'
            fallo++;
            resumen.push(`❌ ${cubre}: ${p.message || p.error || 'falló'}`);
            progreso.actualizar(p.indice, `Falló: ${cubre}`, { exitosos: ok, fallidos: fallo }, p.total);
        }
    });

    try {
        const res = await window.electronAPI.empresa.analizarLote(cuits);
        progreso.cerrar();
        if (typeof loadUsers === 'function') await loadUsers();

        const sin = (res.sinAcceso || []).length;
        const gruposOk = res.gruposOk || 0;
        const totalGrupos = res.totalGrupos || 0;
        const cabecera =
            `Lote terminado: ${gruposOk}/${totalGrupos} login(s) OK` +
            (sin ? `, ${sin} contribuyente(s) sin acceso AFIP (salteado(s))` : '') +
            `.\n(${cuits.length} contribuyente(s) resueltos con ${totalGrupos} login(s)).`;
        const tipo = (gruposOk > 0 && fallo === 0 && !sin) ? 'success' : (gruposOk > 0 ? 'warning' : 'error');
        showAlert(`${cabecera}\n\n${resumen.join('\n')}`, tipo);
    } catch (err) {
        progreso.cerrar();
        if (typeof loadUsers === 'function') await loadUsers();
        showAlert(`Error en el lote: ${err.message}`, 'error');
    } finally {
        usarHandlerProgresoLote(null);   // ignora eventos rezagados
    }
}

/**
 * Análisis por lote: itera todos los clientes con AFIP validado + sin analizar.
 */
async function analizarPorLote() {
    const result = await window.electronAPI.user.getAll();
    if (!result.success) {
        return showAlert('No se pudo cargar la lista de clientes.', 'error');
    }
    const candidatos = soloVisibles(result.users || []).filter(u => esCandidatoAAnalisis(u) && u.analizado_afip !== true);
    const { lista: pendientes, huboSeleccion } = objetivoDelLote(candidatos);
    if (pendientes.length === 0) {
        return showAlert(
            huboSeleccion
                ? 'Ninguno de los clientes seleccionados está pendiente de análisis.'
                : 'No hay clientes pendientes de análisis.',
            'info'
        );
    }
    await procesarLoteAnalisis(pendientes, {
        icono: '🔍',
        textoConfirmar: 'Sí, analizar',
        mensajeConfirmacion:
            `Vas a analizar ${pendientes.length} cliente(s)` +
            `${huboSeleccion ? ' de los que seleccionaste' : ' (toda la lista: no hay ninguno tildado)'}.\n\n` +
            'Se agrupan por credencial: un solo login por clave AFIP trae a todos sus ' +
            'representados de una. El login valida la clave de paso, así que no hace ' +
            'falta probarlas antes.\n\n' +
            'Si son muchas credenciales distintas puede tardar.\n\n¿Continuar?'
    });
}

/**
 * Re-análisis por lote: itera todos los clientes con AFIP validado YA analizados.
 * Pisa los datos de empresas/PDV con el scraping fresco.
 */
async function reanalizarTodos() {
    const result = await window.electronAPI.user.getAll();
    if (!result.success) {
        return showAlert('No se pudo cargar la lista de clientes.', 'error');
    }
    const candidatos = soloVisibles(result.users || []).filter(u => esCandidatoAAnalisis(u) && u.analizado_afip === true);
    const { lista: analizados, huboSeleccion } = objetivoDelLote(candidatos);
    if (analizados.length === 0) {
        return showAlert(
            huboSeleccion
                ? 'Ninguno de los clientes seleccionados fue analizado todavía.'
                : 'No hay clientes analizados para refrescar.',
            'info'
        );
    }
    await procesarLoteAnalisis(analizados, {
        icono: '🔄',
        textoConfirmar: huboSeleccion ? 'Sí, re-analizar' : 'Sí, re-analizar TODOS',
        mensajeConfirmacion:
            `Vas a RE-ANALIZAR ${analizados.length} cliente(s) ya analizados` +
            `${huboSeleccion ? ' de los que seleccionaste' : ' (toda la lista: no hay ninguno tildado)'}.\n\n` +
            'Se agrupan por credencial (un login por clave AFIP), pero cada login scrapea ' +
            'todas sus empresas: con muchas credenciales puede tardar bastante.\n\n' +
            'Los datos de empresas y puntos de venta se reemplazan por el scraping fresco.\n\n¿Continuar?'
    });
}
