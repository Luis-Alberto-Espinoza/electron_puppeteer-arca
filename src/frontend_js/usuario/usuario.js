window.currentEditingUser = window.currentEditingUser || null;

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
// funcion para verificar credenciales
function inicializarVerificarCredenciales() {


    console.log("btnVerificarCredenciales", btnVerificarCredenciales);
    if (btnVerificarCredenciales) {
            try {
                console.log("llegue al evento");
                const nombre = document.getElementById('nombre').value.trim();
                const clave = document.getElementById('clave').value.trim();
                const cuit = document.getElementById('cuit').value.trim();
                const cuil = document.getElementById('cuil').value.trim();
                const tipoContribuyente = document.getElementById('tipoContribuyente').value;
                const apellido = document.getElementById('apellido').value.trim();

                const pruebaCredenciales = {
                    clave,
                    cuit,
                    cuil
                };

                //necesito enviar pruebaCredenciales a el preload.js habrir un canal exclucivo para reslver solo verificacion de credenciales y sus respuestas
                window.electronAPI.user.verifyCredentials(pruebaCredenciales)
                    .then(response => {
                        console.log('Respuesta de verificación de credenciales:', response);
                        // Mostrar el retornoCredenciales en consola o usarlo como desees
                        console.log('Retorno de verificación de credenciales:', response.retornoCredenciales);
                        mostrarRetornoCredenciales(response.retornoCredenciales); // Mostrar en HTML
                        if (response.success) {
                            showAlert('Credenciales verificadas exitosamente', 'success');
                        } else {
                            showAlert(response.error || 'Error al verificar credenciales', 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error al verificar credenciales:', error);
                        showAlert('Error de comunicación con el backend al verificar credenciales', 'error');
                    });

                // Aquí puedes agregar la lógica para verificar credenciales con backend si lo necesitas
                console.log('Credenciales a verificar:', pruebaCredenciales);
                showAlert('Credenciales preparadas para verificación', 'success');
            } catch (error) {
                console.error('Error verificando credenciales:', error);
                showAlert('Error de comunicación con el backend al verificar credenciales', 'error');
            }
    }
}

// Crear usuario
async function createUser() {
    try {
        const nombre = document.getElementById('nombre').value.trim();
        const clave = document.getElementById('clave').value.trim();
        const cuit = document.getElementById('cuit').value.trim();
        const cuil = document.getElementById('cuil').value.trim();
        const tipoContribuyente = document.getElementById('tipoContribuyente').value;
        const apellido = document.getElementById('apellido').value.trim();

        // Validaciones
        if (!nombre || !clave) {
            showAlert('Por favor completa todos los campos obligatorios', 'error');
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
        if (tipoContribuyente !== "C" && tipoContribuyente !== "B") {
            showAlert('Selecciona el tipo de contribuyente', 'error');
            return;
        }

        if (!window.electronAPI) {
            console.error('electronAPI no está disponible');
            showAlert('Error de configuración de la aplicación', 'error');
            return;
        }

        if (!window.electronAPI.user) {
            console.error('electronAPI.user no está disponible');
            showAlert('Error de configuración de la API', 'error');
            return;
        }

        const result = await window.electronAPI.user.create({ nombre, clave, cuit, cuil, tipoContribuyente, apellido });
        console.log('Resultado de crear usuario:', result);

        if (result.success) {
            showAlert(`Usuario "${nombre}" creado exitosamente!`);
            document.getElementById('nombre').value = '';
            document.getElementById('clave').value = '';
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
        console.log('📖 Frontend: Solicitando lista de usuarios');

        const result = await window.electronAPI.user.getAll();

        console.log('📨 Frontend: Lista recibida:', result);

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

// Mostrar usuarios en la lista
function displayUsers(users) {
    const usersList = document.getElementById('usersList');

    if (!users || users.length === 0) {
        usersList.innerHTML = `
            <div class="empty-state">
                <div class="icon">📋</div>
                <p>No hay usuarios registrados</p>
            </div>
        `;
        return;
    }

    const usersHTML = users.map(user => {
        return `
            <div class="user-item">
                <div class="user-info">
                    <div class="user-name">👤 ${user.nombre}</div>
                    <div class="user-details">
                        🔑 Clave: ${'*'.repeat(user.clave.length)}<br>
                        🆔 CUIT: ${user.cuit || ''}<br>
                        🆔 CUIL: ${user.cuil || ''}<br>
                        🏷️ Tipo Contribuyente: ${user.tipoContribuyente || ''}
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn btn-edit" onclick="window.editUser('${user.id}', '${user.nombre}', '${user.clave}', '${user.cuit || ''}', '${user.cuil || ''}', '${user.tipoContribuyente || ''}', '${user.apellido || ''}')">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-delete" onclick="window.deleteUser('${user.id}', '${user.nombre}')">
                        🗑️ Eliminar
                    </button>
                </div>
            </div>
        `;
    }).join('');

    usersList.innerHTML = usersHTML;
}

// Editar usuario
window.editUser = function (id, nombre, clave, cuit, cuil, tipoContribuyente, apellido) {
    window.currentEditingUser = { id, nombre, clave, cuit, cuil, tipoContribuyente, apellido };

    document.getElementById('editNombre').value = nombre;
    document.getElementById('editClave').value = clave;
    document.getElementById('editCuit').value = cuit;
    document.getElementById('editCuil').value = cuil;
    document.getElementById('editTipoContribuyente').value = tipoContribuyente;
    document.getElementById('editApellido').value = apellido;
    document.getElementById('editForm').classList.remove('hidden');
    document.getElementById('editForm').scrollIntoView({ behavior: 'smooth' });
}

// Eliminar usuario
async function deleteUser(id, nombre) {
    console.log('Intentando eliminar usuario:', { id, nombre });

    if (!confirm(`¿Estás seguro que deseas eliminar al usuario "${nombre}"?`)) {
        return;
    }

    try {
        setLoading('loadLoading', true);
        const result = await window.electronAPI.user.delete(id);
        console.log('Resultado de eliminar:', result);

        if (result.success) {
            showAlert(`Usuario "${nombre}" eliminado exitosamente!`);
            await loadUsers(); // Recargar lista después de eliminar
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
    const clave = document.getElementById('editClave').value.trim();
    const cuit = document.getElementById('editCuit').value.trim();
    const cuil = document.getElementById('editCuil').value.trim();
    const tipoContribuyente = document.getElementById('editTipoContribuyente').value;
    const apellido = document.getElementById('editApellido').value.trim();

    // Validaciones
    if (!nombre || !clave) {
        showAlert('Por favor completa todos los campos obligatorios', 'error');
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
    if (tipoContribuyente !== "A" && tipoContribuyente !== "B") {
        showAlert('Selecciona el tipo de contribuyente', 'error');
        return;
    }

    try {
        setLoading('updateLoading', true);
        const result = await window.electronAPI.user.update({
            id: window.currentEditingUser.id,
            nombre,
            clave,
            cuit,
            cuil,
            tipoContribuyente,
            apellido
        });

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
    document.getElementById('editClave').value = '';
}

function inicializarUsuarioFrontend() {
    console.log('Inicializando eventos de usuario (llamado manualmente)');
    const btnCrear = document.getElementById('btnCrearUsuario');
    const btnRecargar = document.getElementById('btnRecargarLista');
    const claveInput = document.getElementById('clave');
    const editClaveInput = document.getElementById('editClave');
    const btnVerificarCredenciales = document.getElementById('btnVerificarCredenciales');

    if (btnVerificarCredenciales) {
        btnVerificarCredenciales.addEventListener('click', (e) => {
          e.preventDefault();
          console.log("llegue al evento_00000");
         inicializarVerificarCredenciales();
        });
    }
    if (btnCrear) {
        btnCrear.addEventListener('click', (e) => {
            e.preventDefault();
            createUser();
        });
    }

    if (btnRecargar) {
        btnRecargar.addEventListener('click', loadUsers);
    }

    if (claveInput) {
        claveInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createUser();
            }
        });
    }

    if (editClaveInput) {
        editClaveInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                updateUser();
            }
        });
    }

    // Cargar usuarios inicialmente
    loadUsers().catch(error => {
        console.error('Error cargando usuarios:', error);
        showAlert('Error cargando la lista de usuarios', 'error');
    });
}

// Exportar la función para que el controlador la pueda llamar
window.inicializarUsuarioFrontend = inicializarUsuarioFrontend;

// Inicializar eventos cuando el contenido se carga
document.addEventListener('DOMContentLoaded', () => {
    console.log('Inicializando eventos de usuario');

    // Esperar a que el HTML esté realmente en el DOM
    setTimeout(() => {
        const btnCrear = document.getElementById('btnCrearUsuario');
        const btnRecargar = document.getElementById('btnRecargarLista');
        const claveInput = document.getElementById('clave');
        const editClaveInput = document.getElementById('editClave');

        if (btnCrear) {
            btnCrear.addEventListener('click', (e) => {
                e.preventDefault();
                createUser();
            });
        }

        if (btnRecargar) {
            btnRecargar.addEventListener('click', loadUsers);
        }

        if (claveInput) {
            claveInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    createUser();
                }
            });
        }

        if (editClaveInput) {
            editClaveInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    updateUser();
                }
            });
        }

        inicializarVerificarCredenciales();

        // Cargar usuarios inicialmente
        loadUsers().catch(error => {
            console.error('Error cargando usuarios:', error);
            showAlert('Error cargando la lista de usuarios', 'error');
        });
    }, 100); // Espera 100ms para asegurar que el HTML esté en el DOM
});

// Mostrar nombres de retornoCredenciales en filas
function mostrarRetornoCredenciales(array) {
    const container = document.getElementById('retornoCredencialesContainer');
    if (!container) return;
    container.innerHTML = ''; // Limpiar antes de mostrar

    if (Array.isArray(array) && array.length > 0) {
        array.forEach(item => {
            // Si el item es string, mostrarlo directamente; si es objeto, mostrar propiedad 'nombre'
            const nombre = typeof item === 'string' ? item : (item.nombre || '');
            const row = document.createElement('div');
            row.className = 'retorno-row';
            row.textContent = nombre;
            container.appendChild(row);
        });
    } else {
        container.innerHTML = '<div class="retorno-row">No hay datos para mostrar</div>';
    }
}