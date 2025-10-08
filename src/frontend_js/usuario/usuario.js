console.log('CARGANDO SCRIPT usuario.js...');

window.currentEditingUser = window.currentEditingUser || null;

// Variable global para empresas disponibles
window.empresasDisponible = [];

// Función para mostrar alertas
function showAlert(message, type = 'success') {
    const alert = document.getElementById('alert');
    const alertMessage = document.getElementById('alertMessage');

    alert.className = `alert alert-${type}`;
    alertMessage.textContent = message;
    alert.classList.remove('hidden');

    setTimeout(() => {
        alert.classList.add('hidden');
    }, 3000);
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
            mostrarPuntosDeVenta(response.puntosDeVentaArray);
            
            if (response.success) {
                btnCrearUsuario.style.display = '';
                showAlert('Credenciales validadas correctamente.', 'success');
            } else {
                showAlert(response.error || 'Credenciales inválidas. Intenta nuevamente.', 'error');
            }
        } catch (error) {
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
            nombre, claveAFIP, claveATM, cuit, cuil, tipoContribuyente, apellido,
            empresasDisponible: window.empresasDisponible || []
        });

        if (result.success) {
            showAlert(`Usuario "${nombre}" creado exitosamente!`);
            document.getElementById('nombre').value = '';
            document.getElementById('claveAFIP').value = '';
            document.getElementById('claveATM').value = '';
            document.getElementById('cuit').value = '';
            document.getElementById('cuil').value = '';
            document.getElementById('tipoContribuyente').value = '';
            document.getElementById('apellido').value = '';
            await loadUsers();
        } else {
            showAlert(result.error || 'Error al crear usuario', 'error');
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
            displayUsers(result.users);
        } else {
            showAlert(result.error || 'Error al cargar usuarios', 'error');
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
    if (!users || users.length === 0) {
        usersList.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>No hay usuarios registrados</p></div>`;
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

    usersList.innerHTML = bulkActionsHeader + usersHTML;
}

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
    document.getElementById('editForm').classList.remove('hidden');
    document.getElementById('editForm').scrollIntoView({ behavior: 'smooth' });
}

// Eliminar usuario
async function deleteUser(id, nombre) {
    if (!confirm(`¿Estás seguro que deseas eliminar al usuario "${nombre}"?`)) {
        return;
    }
    try {
        setLoading('loadLoading', true);
        const result = await window.electronAPI.user.delete(id);
        if (result.success) {
            showAlert(`Usuario "${nombre}" eliminado exitosamente!`);
            await loadUsers();
        } else {
            showAlert(result.error || 'Error al eliminar usuario', 'error');
        }
    } catch (error) {
        console.error('Error al eliminar:', error);
        showAlert('Error de comunicación con el backend', 'error');
    } finally {
        setLoading('loadLoading', false);
    }
}

// Actualizar usuario
async function updateUser() {
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

    const claveCambio = claveAFIP !== window.currentEditingUser.claveAFIP;
    const cuitCambio = cuit !== window.currentEditingUser.cuit;
    const cuilCambio = cuil !== window.currentEditingUser.cuil;

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

        let result;
        if (claveCambio || cuitCambio || cuilCambio) {
            result = await window.electronAPI.user.verifyAndUpdate(userData);
        } else {
            result = await window.electronAPI.user.update(userData);
        }

        if (result.success) {
            showAlert(`Usuario "${nombre}" actualizado exitosamente!`);
            cancelEdit();
            await loadUsers();
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
function cancelEdit() {
    window.currentEditingUser = null;
    document.getElementById('editForm').classList.add('hidden');
    document.getElementById('editNombre').value = '';
    document.getElementById('editClaveAFIP').value = '';
    document.getElementById('editClaveATM').value = '';
}

function inicializarUsuarioFrontend() {
    const usersList = document.getElementById('usersList');

    usersList.addEventListener('click', async (event) => {
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

            setLoading('loadLoading', true);
            try {
                const result = await window.electronAPI.user.verifyBatch({ verificationJobs });
                if (result.success) {
                    showAlert(`Verificación completada. Validados: ${result.stats.validados}, Fallos: ${result.stats.con_fallos}.`);
                    
                    // Refrescar el usuario seleccionado en memoria si fue actualizado
                    if (result.updatedUsers && window.usuarioSeleccionado) {
                        const updatedCurrentUser = result.updatedUsers.find(u => String(u.id) === String(window.usuarioSeleccionado.id));
                        if (updatedCurrentUser) {
                            console.log('Refrescando el usuario seleccionado en memoria...');
                            window.usuarioSeleccionado = updatedCurrentUser;
                        }
                    }
                } else {
                    showAlert(result.error || 'Error en la verificación masiva.', 'error');
                }
            } catch (error) {
                showAlert(`Error de comunicación: ${error.message}`, 'error');
            } finally {
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
        console.error('Error cargando usuarios:', error);
        showAlert('Error cargando la lista de usuarios', 'error');
    });
    inicializarCargaMasiva();
    inicializarVerificarCredenciales();
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
