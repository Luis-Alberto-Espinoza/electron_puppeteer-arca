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
// funcion para verificar credenciales
function inicializarVerificarCredenciales() {
    const btnVerificarCredenciales = document.getElementById('btnVerificarCredenciales');
    const btnCrearUsuario = document.getElementById('btnCrearUsuario');
    const verificarLoading = document.getElementById('verificarLoading');

    if (btnVerificarCredenciales) {
        btnVerificarCredenciales.addEventListener('click', async function(e) {
            e.preventDefault();

            btnVerificarCredenciales.style.display = 'none';
            btnCrearUsuario.style.display = 'none';
            verificarLoading.classList.remove('hidden');
            verificarLoading.innerHTML = '<span class="spinner"></span><span class="loader-text">Verificando...</span>';

            const clave = document.getElementById('claveAFIP').value.trim();
            const cuit = document.getElementById('cuit').value.trim();
            const cuil = document.getElementById('cuil').value.trim();

            const pruebaCredenciales = { clave, cuit, cuil };

            let response = {};
            let resultado = false;
            try {
                response = await window.electronAPI.user.verifyCredentials(pruebaCredenciales);
                window.empresasDisponible = response.puntosDeVentaArray || [];
                mostrarPuntosDeVenta(response.puntosDeVentaArray);
                resultado = !!response.success;
            } catch (error) {
                resultado = false;
            }

            verificarLoading.classList.add('hidden');
            verificarLoading.innerHTML = '';
            btnVerificarCredenciales.style.display = '';
            btnCrearUsuario.style.display = resultado ? '' : 'none';

            const alertDiv = document.getElementById('alert');
            const alertMsg = document.getElementById('alertMessage');
            if (!resultado) {
                alertMsg.textContent = response.error || 'Credenciales inválidas. Intenta nuevamente.';
                alertDiv.classList.remove('hidden');
                setTimeout(() => alertDiv.classList.add('hidden'), 3000);
            } else {
                alertDiv.classList.add('hidden');
            }
        });
    }
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

        if (!nombre || !claveAFIP) {
            showAlert('Por favor completa nombre y Clave AFIP', 'error');
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
        const claveAFIP = user.claveAFIP || user.clave || '';
        const claveATM = user.claveATM || '';
        return `
            <div class="user-item">
                <div class="user-info">
                    <div class="user-name">👤 ${user.nombre}</div>
                    <div class="user-details">
                        🔑 Clave AFIP: ${claveAFIP ? '*'.repeat(claveAFIP.length) : 'N/A'}<br>
                        🔑 Clave ATM: ${claveATM ? '*'.repeat(claveATM.length) : 'N/A'}<br>
                        🆔 CUIT: ${user.cuit || ''}<br>
                        🆔 CUIL: ${user.cuil || ''}<br>
                        🏷️ Tipo Contribuyente: ${user.tipoContribuyente || ''}
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn btn-edit" onclick="window.editUser('${user.id}', '${user.nombre}', '${claveAFIP}', '${claveATM}', '${user.cuit || ''}', '${user.cuil || ''}', '${user.tipoContribuyente || ''}', '${user.apellido || ''}')">
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

    if (!nombre || !claveAFIP) {
        showAlert('Por favor completa nombre y Clave AFIP', 'error');
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
    const btnCrear = document.getElementById('btnCrearUsuario');
    const btnRecargar = document.getElementById('btnRecargarLista');
    const claveInput = document.getElementById('claveAFIP');
    const editClaveInput = document.getElementById('editClaveAFIP');
    const btnVerificarCredenciales = document.getElementById('btnVerificarCredenciales');

    if (btnVerificarCredenciales) {
        btnVerificarCredenciales.addEventListener('click', (e) => {
          e.preventDefault();
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

    loadUsers().catch(error => {
        console.error('Error cargando usuarios:', error);
        showAlert('Error cargando la lista de usuarios', 'error');
    });
}

window.inicializarUsuarioFrontend = inicializarUsuarioFrontend;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        inicializarUsuarioFrontend();
    }, 100);
});

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
