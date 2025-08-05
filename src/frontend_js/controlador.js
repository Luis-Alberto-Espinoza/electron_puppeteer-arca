import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js';
//import { indexFactura } from './facturas/index_01.js';

// ========================================
// VARIABLES GLOBALES
// ========================================
let archivoComprobanteSeleccionado = '';
let archivoAlicuotasSeleccionado = '';
let resultadoGlobal = null;

// ========================================
// INICIALIZACIÓN PRINCIPAL
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarInterfazFacturas();
    inicializarArchivosDesarrollo();
    inicializarEventListeners();
    inicializarMercadoPago();
    inicializarGestionUsuarios(); // Agregamos esta línea
});

// ========================================
// CONFIGURACIÓN DE ARCHIVOS PARA DESARROLLO
// ========================================
function inicializarArchivosDesarrollo() {
    // Selección automática de archivos para desarrollo
    archivoComprobanteSeleccionado = '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.TXT';
    archivoAlicuotasSeleccionado = '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt';

    // Para habilitar selección manual, comentar las líneas anteriores y descomentar estas:
    // archivoComprobanteSeleccionado = '';
    // archivoAlicuotasSeleccionado = '';
}

// ========================================
// INICIALIZACIÓN DE EVENT LISTENERS
// ========================================
function inicializarEventListeners() {
    inicializarEventosSeleccionArchivos();
    inicializarEventosProcesamientoLibroIVA();
    inicializarEventosModalEdicion();
    // inicializarMercadoPago();
}


// ========================================
// EVENTOS DE SELECCIÓN DE ARCHIVOS
// ========================================
function inicializarEventosSeleccionArchivos() {
    const seleccionarArchivoComprobanteBtn = document.getElementById('seleccionarArchivoComprobanteBtn');
    const seleccionarArchivoAlicuotasBtn = document.getElementById('seleccionarArchivoAlicuotasBtn');

    if (seleccionarArchivoComprobanteBtn) {
        seleccionarArchivoComprobanteBtn.addEventListener('click', manejarSeleccionArchivoComprobante);
    }

    if (seleccionarArchivoAlicuotasBtn) {
        seleccionarArchivoAlicuotasBtn.addEventListener('click', manejarSeleccionArchivoAlicuotas);
    }
}

async function manejarSeleccionArchivoComprobante() {
    const archivos = await window.electronAPI.seleccionarArchivos();
    if (archivos.length > 0) {
        archivoComprobanteSeleccionado = archivos[0];
        actualizarInfoArchivoComprobante(archivoComprobanteSeleccionado);
    }
}

async function manejarSeleccionArchivoAlicuotas() {
    const archivos = await window.electronAPI.seleccionarArchivos();
    if (archivos.length > 0) {
        archivoAlicuotasSeleccionado = archivos[0];
        actualizarInfoArchivoAlicuotas(archivoAlicuotasSeleccionado);
    }
}

function actualizarInfoArchivoComprobante(rutaArchivo) {
    const nombreElemento = document.getElementById('nombreArchivoComprobante');
    const rutaElemento = document.getElementById('rutaArchivoComprobante');

    if (nombreElemento && rutaElemento) {
        nombreElemento.innerText = `Nombre: ${rutaArchivo.split('/').pop()}`;
        rutaElemento.innerText = `Ruta: ${rutaArchivo}`;
    }
}

function actualizarInfoArchivoAlicuotas(rutaArchivo) {
    const nombreElemento = document.getElementById('nombreArchivoAlicuotas');
    const rutaElemento = document.getElementById('rutaArchivoAlicuotas');

    if (nombreElemento && rutaElemento) {
        nombreElemento.innerText = `Nombre: ${rutaArchivo.split('/').pop()}`;
        rutaElemento.innerText = `Ruta: ${rutaArchivo}`;
    }
}

// ========================================
// EVENTOS DE PROCESAMIENTO LIBRO IVA
// ========================================
function inicializarEventosProcesamientoLibroIVA() {
    const procesarLibroIvaBtn = document.getElementById('procesarLibroIvaBtn');
    const modificarSegunInforme = document.getElementById('modificarSegunInforme');

    if (procesarLibroIvaBtn) {
        procesarLibroIvaBtn.addEventListener('click', manejarProcesamientoLibroIVA);
    }

    if (modificarSegunInforme) {
        modificarSegunInforme.addEventListener('click', manejarModificacionSegunInforme);
    }
}

async function manejarProcesamientoLibroIVA(event) {
    event.preventDefault();

    if (!validarArchivosSeleccionados()) {
        return;
    }

    const data = obtenerDatosFormularioLibroIVA();
    console.log("Datos enviados desde el frontend:", data);
    window.electronAPI.procesarLibroIva(data);
}

async function manejarModificacionSegunInforme(event) {
    event.preventDefault();

    const data = obtenerDatosFormularioLibroIVA();
    data.case = 'modificarSegunInforme';
    console.log("Datos enviados para modificar según informe:", data);
    window.electronAPI.modificarSegunInforme(data);
}

function validarArchivosSeleccionados() {
    if (!archivoComprobanteSeleccionado || !archivoAlicuotasSeleccionado) {
        alert("Debe seleccionar ambos archivos.");
        return false;
    }
    return true;
}

function obtenerDatosFormularioLibroIVA() {
    const libroIvaForm = document.getElementById('libroIvaForm');
    const libroIvaData = new FormData(libroIvaForm);
    const data = Object.fromEntries(libroIvaData.entries());
    data.archivos = [archivoComprobanteSeleccionado, archivoAlicuotasSeleccionado];
    return data;
}

// ========================================
// LISTENER DE RESULTADOS
// ========================================
function inicializarListenerResultados() {
    window.electronAPI.onLibroIvaProcesado((event, resultado) => {
        resultadoGlobal = resultado;
        mostrarResultadoAnalisis(resultado);
        mostrarLineasExcedidas(resultado);
        mostrarBotonModificarInforme();
    });
}

function mostrarResultadoAnalisis(resultado) {
    console.log("Resultado recibido en el frontend:", resultado);
    const resultadoDiv = document.getElementById('resultado');

    if (resultadoDiv) {
        resultadoDiv.innerHTML = generarHTMLResultado(resultado);
    }
}

function generarHTMLResultado(resultado) {
    const diferencias = resultado.data.informe.diferencias;
    const segundaDiferencia = diferencias.length > 1 ? diferencias[1] : null;

    return `
        <h3>Resultado del Análisis</h3>
        <p>${resultado.message}</p>
        <pre>${resultado.data.message}</pre>
        <pre>${resultado.data.informe.mensaje}</pre>
        <p>Informe:</p>
        <pre>CANTIDAD DE DIFERENCIAS: ${diferencias.length}</pre>
        <br>
        ${segundaDiferencia ? `
        <pre>Se muestra como Ejemplo la segunda diferencia</pre>
        <pre>Comprobante numero: ${parseInt(segundaDiferencia.numero)}</pre>
        <pre>Importe en Alicuota: ${segundaDiferencia.importeAlicuota}</pre>
        <pre>Importe en Comprobante: ${segundaDiferencia.importeComprobante}</pre>
        <pre>Diferencia: ${segundaDiferencia.diferencia}</pre>
        ` : ''}
    `;
}

function mostrarLineasExcedidas(resultado) {
    const lineasExcedidas = resultado.data.informe.lineasExcedidas;
    console.log("mira aca ", lineasExcedidas[0]);

    if (lineasExcedidas.length > 0) {
        mostrarInformacionLineasExcedidas(lineasExcedidas[0]);
        mostrarBotonEditarLineas();
    }
}

function mostrarInformacionLineasExcedidas(primeraLineaExcedida) {
    const lineasExcedidasDiv = document.getElementById('lineasExcedidas');

    if (lineasExcedidasDiv) {
        lineasExcedidasDiv.innerHTML = `
            <h3>Lineas Excedidas</h3>
            <pre>El número de linea en el archivo es: ${primeraLineaExcedida.numeroLinea}</pre>
            <pre>La cantidad de caracteres normal es de 267 y esta linea tiene un total de: ${primeraLineaExcedida.longitud}</pre>
            <pre>este es el contenido de la linea completa</pre>
            <pre>${primeraLineaExcedida.contenido}</pre>
        `;
    }
}

function mostrarBotonEditarLineas() {
    const btnEditarLineasExcedidas = document.getElementById('btnEditarLineasExcedidas');
    if (btnEditarLineasExcedidas) {
        btnEditarLineasExcedidas.style.display = 'block';
    }
}

function mostrarBotonModificarInforme() {
    const modificarSegunInformeDiv = document.getElementById('modificarSegunInformeDiv');
    if (modificarSegunInformeDiv) {
        modificarSegunInformeDiv.style.display = 'block';
    }
}

// ========================================
// EVENTOS DEL MODAL DE EDICIÓN
// ========================================
function inicializarEventosModalEdicion() {
    const btnEditarLineasExcedidas = document.getElementById('btnEditarLineasExcedidas');
    const btnGuardarEdicion = document.getElementById('btnGuardarEdicion');
    const btnCerrarModal = document.getElementById('btnCerrarModal');

    if (btnEditarLineasExcedidas) {
        btnEditarLineasExcedidas.addEventListener('click', manejarAbrirModalEdicion);
    }

    if (btnGuardarEdicion) {
        btnGuardarEdicion.addEventListener('click', manejarGuardarEdicion);
    }

    if (btnCerrarModal) {
        btnCerrarModal.addEventListener('click', cerrarModalEdicion);
    }
}

function manejarAbrirModalEdicion() {
    if (resultadoGlobal && resultadoGlobal.data.informe.lineasExcedidas.length > 0) {
        abrirModalEdicion(resultadoGlobal.data.informe.lineasExcedidas[0]);
    }
}

function manejarGuardarEdicion() {
    const lineaEditada = document.getElementById('txtLineaEdicion').value;
    console.log("Línea editada:", lineaEditada);
    cerrarModalEdicion();
}

// ========================================
// FUNCIONES DEL MODAL DE EDICIÓN
// ========================================
function abrirModalEdicion(lineaExcedida) {
    const modal = document.getElementById('modalEdicion');
    const modalFondo = document.getElementById('modalFondo');
    const txtLinea = document.getElementById('txtLineaEdicion');
    const modalMensaje = document.getElementById('modalMensaje');

    modalMensaje.innerHTML = `
        <strong>Número de línea:</strong> ${lineaExcedida.numeroLinea}<br>
        <strong>Longitud:</strong> ${lineaExcedida.longitud}<br>
        <strong>Caracteres esperados:</strong> 267
    `;
}

function cerrarModalEdicion() {
    const modal = document.getElementById('modalEdicion');
    const modalFondo = document.getElementById('modalFondo');

    if (modal) {
        modal.style.display = 'none';
    }

    if (modalFondo) {
        modalFondo.style.display = 'none';
    }
}


// INICIALIZAR MERCADO PAGO
function getBasePath() {
    // Obtener la ruta del archivo actual
    const currentScript = document.currentScript || document.querySelector('script[src*="controlador"]');
    if (currentScript && currentScript.src) {
        const scriptPath = currentScript.src;
        return scriptPath.substring(0, scriptPath.lastIndexOf('/') + 1);
    }
    // Fallback
    return window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
}
function inicializarMercadoPago() {
    const btnLectorMP = document.getElementById('btnLectorMP');
    const lectorMPDiv = document.getElementById('leerMercadoPagoDiv');

    if (btnLectorMP && lectorMPDiv) {
        btnLectorMP.addEventListener('click', async () => {
            try {
                // Toggle de visibilidad
                if (!lectorMPDiv.classList.contains('contenido-oculto')) {
                    lectorMPDiv.classList.add('contenido-oculto');
                    return;
                }

                // Cargar el contenido
                const basePath = getBasePath();
                const htmlPath = basePath + './leerMercadoPago/mercadoPago_leer.html';
                const response = await fetch(htmlPath);
                const html = await response.text();

                // Actualizar el contenido
                lectorMPDiv.innerHTML = html;
                lectorMPDiv.classList.remove('contenido-oculto');

                // CARGAR MANUALMENTE EL SCRIPT
                const script = document.createElement('script');
                script.type = 'module';
                script.src = basePath + './leerMercadoPago/mercadoPago.js';

                // Agregar el script al head o al div
                document.head.appendChild(script);

                // O si prefieres agregarlo al div:
                // lectorMPDiv.appendChild(script);

            } catch (error) {
                console.error('Error:', error);
                lectorMPDiv.innerHTML = '<p>Error cargando el componente</p>';
            }
        });
    }
}

// Agregar esta nueva función
function inicializarGestionUsuarios() {
    const btnUsuarios = document.getElementById('btnUsuarios');
    const usuariosDiv = document.getElementById('usuariosDiv');

    if (btnUsuarios && usuariosDiv) {
        btnUsuarios.addEventListener('click', async () => {
            try {
                if (!usuariosDiv.classList.contains('contenido-oculto')) {
                    usuariosDiv.classList.add('contenido-oculto');
                    return;
                }

                console.log('🔄 Cargando componente de usuarios...');
                const response = await fetch('../usuario/usuario.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const html = await response.text();
                console.log('✅ HTML cargado correctamente');

                usuariosDiv.innerHTML = html;
                usuariosDiv.classList.remove('contenido-oculto');

                // Definir primero las funciones globales para editar y eliminar
                const globalFunctions = `
                    // Hacer las funciones disponibles globalmente
                    window.editUser = function(id, nombre, clave) {
                        currentEditingUser = { id, nombre, clave };
                        
                        document.getElementById('editNombre').value = nombre;
                        document.getElementById('editClave').value = clave;
                        document.getElementById('editForm').classList.remove('hidden');
                        
                        document.getElementById('editForm').scrollIntoView({ behavior: 'smooth' });
                    };

                    window.deleteUser = async function(id, nombre) {
                        if (!confirm('¿Estás seguro que deseas eliminar al usuario "' + nombre + '"?')) {
                            return;
                        }

                        try {
                            const result = await window.electronAPI.user.delete(id);
                            if (result.success) {
                                showAlert('Usuario "' + nombre + '" eliminado exitosamente!');
                                loadUsers();
                            } else {
                                showAlert(result.error || 'Error al eliminar usuario', 'error');
                            }
                        } catch (error) {
                            console.error('Error:', error);
                            showAlert('Error de comunicación con el backend', 'error');
                        }
                    };

                    // Función auxiliar para actualizar usuario
                    window.updateUser = async function() {
                        if (!currentEditingUser) return;

                        const nombre = document.getElementById('editNombre').value.trim();
                        const clave = document.getElementById('editClave').value.trim();

                        if (!nombre || !clave) {
                            showAlert('Por favor completa todos los campos', 'error');
                            return;
                        }

                        try {
                            setLoading('updateLoading', true);
                            const result = await window.electronAPI.user.update({
                                id: currentEditingUser.id,
                                nombre,
                                clave
                            });

                            if (result.success) {
                                showAlert('Usuario "' + nombre + '" actualizado exitosamente!');
                                document.getElementById('editForm').classList.add('hidden');
                                loadUsers();
                            } else {
                                showAlert(result.error || 'Error al actualizar usuario', 'error');
                            }
                        } catch (error) {
                            console.error('Error:', error);
                            showAlert('Error de comunicación con el backend', 'error');
                        } finally {
                            setLoading('updateLoading', false);
                        }
                    };
                `;

                // Inyectar primero las funciones globales
                const globalScript = document.createElement('script');
                globalScript.textContent = globalFunctions;
                document.head.appendChild(globalScript);

                // Definir primero las funciones auxiliares
                const helperFunctions = `
                    // Función para mostrar alertas
                    function showAlert(message, type = 'success') {
                        const alert = document.getElementById('alert');
                        const alertMessage = document.getElementById('alertMessage');
                        
                        alert.className = 'alert alert-' + type;
                        alertMessage.textContent = message;
                        alert.classList.remove('hidden');
                        
                        setTimeout(() => {
                            alert.classList.add('hidden');
                        }, 3000);
                    }

                    // Función para mostrar/ocultar loading
                    function setLoading(elementId, show) {
                        const loading = document.getElementById(elementId);
                        if (loading) {
                            loading.classList.toggle('hidden', !show);
                        }
                    }

                    // Función para mostrar usuarios
                    function displayUsers(users) {
                        const usersList = document.getElementById('usersList');
                        
                        if (!users || users.length === 0) {
                            usersList.innerHTML = \`
                                <div class="empty-state">
                                    <div class="icon">📋</div>
                                    <p>No hay usuarios registrados</p>
                                </div>
                            \`;
                            return;
                        }

                        const usersHTML = users.map(user => {
                            return \`
                                <div class="user-item">
                                    <div class="user-info">
                                        <div class="user-name">👤 \${user.nombre}</div>
                                        <div class="user-details">
                                            🔑 Clave: \${'*'.repeat(user.clave.length)}
                                        </div>
                                    </div>
                                    <div class="user-actions">
                                        <button class="btn btn-edit" onclick="editUser('\${user.id}')">
                                            ✏️ Editar
                                        </button>
                                        <button class="btn btn-delete" onclick="deleteUser('\${user.id}')">
                                            🗑️ Eliminar
                                        </button>
                                    </div>
                                </div>
                            \`;
                        }).join('');

                        usersList.innerHTML = usersHTML;
                    }
                `;

                // Luego definir las funciones principales
                const mainFunctions = `
                    // Cargar usuarios
                    async function loadUsers() {
                        try {
                            setLoading('loadLoading', true);
                            console.log('📖 Solicitando lista de usuarios...');
                            const result = await window.electronAPI.user.getAll();
                            
                            if (result.success) {
                                displayUsers(result.users);
                            } else {
                                showAlert(result.error || 'Error al cargar usuarios', 'error');
                            }
                        } catch (error) {
                            console.error('Error:', error);
                            showAlert('Error de comunicación', 'error');
                        } finally {
                            setLoading('loadLoading', false);
                        }
                    }

                    // Crear usuario
                    async function createUser() {
                        const nombre = document.getElementById('nombre').value.trim();
                        const clave = document.getElementById('clave').value.trim();

                        if (!nombre || !clave) {
                            showAlert('Complete todos los campos', 'error');
                            return;
                        }

                        try {
                            setLoading('createLoading', true);
                            const result = await window.electronAPI.user.create({ nombre, clave });
                            
                            if (result.success) {
                                showAlert('Usuario creado exitosamente');
                                document.getElementById('nombre').value = '';
                                document.getElementById('clave').value = '';
                                await loadUsers();
                            } else {
                                showAlert(result.error || 'Error al crear usuario', 'error');
                            }
                        } catch (error) {
                            console.error('Error:', error);
                            showAlert('Error de comunicación', 'error');
                        } finally {
                            setLoading('createLoading', false);
                        }
                    }

                    // Inicializar eventos
                    document.getElementById('btnCrearUsuario').addEventListener('click', createUser);
                    document.getElementById('btnRecargarLista').addEventListener('click', loadUsers);
                    
                    // Cargar usuarios inicialmente
                    loadUsers();
                `;

                // Inyectar el código en orden
                const helperScript = document.createElement('script');
                helperScript.textContent = helperFunctions;
                usuariosDiv.appendChild(helperScript);

                const mainScript = document.createElement('script');
                mainScript.textContent = mainFunctions;
                usuariosDiv.appendChild(mainScript);

            } catch (error) {
                console.error('Error:', error);
                usuariosDiv.innerHTML = `<p>Error: ${error.message}</p>`;
            }
        });
    }
}