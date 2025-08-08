import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js';

// ========================================
// VARIABLES GLOBALES
// ========================================
let usuarioSeleccionado = null;
let modulosAfipCargados = false;

// ========================================
// INICIALIZACIÓN PRINCIPAL
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarInterfazPrincipal();
    inicializarGestionUsuarios();
});

// ========================================
// INTERFAZ PRINCIPAL - FLUJO DE NAVEGACIÓN
// ========================================
function inicializarInterfazPrincipal() {
    const btnEntrarAfip = document.getElementById('btnEntrarAfip');
    const btnGestionUsuarios = document.getElementById('btnUsuarios');
    const selectorUsuarioDiv = document.getElementById('selectorUsuarioDiv');
    const modulosAfipDiv = document.getElementById('modulosAfipDiv');
    
    // Botón Entrar AFIP
    if (btnEntrarAfip) {
        btnEntrarAfip.addEventListener('click', () => {
            mostrarSelectorUsuario();
        });
    }
}

function mostrarSelectorUsuario() {
    // Ocultar todos los módulos principales
    ocultarTodosLosModulos();
    
    const selectorUsuarioDiv = document.getElementById('selectorUsuarioDiv');
    if (selectorUsuarioDiv) {
        selectorUsuarioDiv.classList.remove('contenido-oculto');
        cargarUsuariosEnSelector();
    }
}

function ocultarTodosLosModulos() {
    const modulos = [
        'modulosAfipDiv',
        'usuariosDiv',
        'selectorUsuarioDiv'
    ];
    
    modulos.forEach(moduloId => {
        const elemento = document.getElementById(moduloId);
        if (elemento) {
            elemento.classList.add('contenido-oculto');
        }
    });
}

async function cargarUsuariosEnSelector() {
    const selectUsuarios = document.getElementById('selectUsuariosSelector');
    if (!selectUsuarios) return;
    
    try {
        // Mostrar estado de carga
        selectUsuarios.innerHTML = '<option value="">Cargando usuarios...</option>';
        selectUsuarios.disabled = true;
        
        // Obtener usuarios usando tu función existente
        const result = await window.electronAPI.user.getAll();
        
        if (result.success && Array.isArray(result.users)) {
            // Limpiar opciones existentes
            selectUsuarios.innerHTML = '<option value="">Seleccione un usuario</option>';
            
            // Agregar usuarios con todos los datos necesarios
            result.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.nombre} ${user.apellido || ''}`.trim();
                
                // Agregar todos los datos como dataset para uso posterior
                option.dataset.cuit = user.cuit || '';
                option.dataset.cuil = user.cuil || '';
                option.dataset.tipoContribuyente = user.tipoContribuyente || '';
                option.dataset.clave = user.clave || '';
                option.dataset.nombre = user.nombre || '';
                option.dataset.apellido = user.apellido || '';
                
                selectUsuarios.appendChild(option);
            });
            
            selectUsuarios.disabled = false;
        } else {
            selectUsuarios.innerHTML = '<option value="">No se encontraron usuarios</option>';
        }
        
        // Event listener para la selección
        selectUsuarios.addEventListener('change', (e) => {
            if (e.target.value) {
                const selectedOption = selectUsuarios.options[selectUsuarios.selectedIndex];
                const usuarioCompleto = {
                    id: selectedOption.value,
                    nombre: selectedOption.textContent,
                    cuit: selectedOption.dataset.cuit,
                    cuil: selectedOption.dataset.cuil,
                    clave: selectedOption.dataset.clave,
                    tipoContribuyente: selectedOption.dataset.tipoContribuyente,
                    nombreSolo: selectedOption.dataset.nombre,
                    apellido: selectedOption.dataset.apellido
                };
                seleccionarUsuario(usuarioCompleto);
            }
        }, { once: true }); // Solo agregar el listener una vez
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        selectUsuarios.innerHTML = '<option value="">Error cargando usuarios</option>';
        selectUsuarios.disabled = false;
    }
}

function seleccionarUsuario(usuarioCompleto) {
    usuarioSeleccionado = usuarioCompleto;
    
    // Guardar en variable global para compatibilidad con tu código existente
    window.usuarioSeleccionado = usuarioSeleccionado;
    
    // Mostrar los módulos AFIP
    mostrarModulosAfip();
}

function mostrarModulosAfip() {
    // Ocultar selector de usuario
    const selectorUsuarioDiv = document.getElementById('selectorUsuarioDiv');
    if (selectorUsuarioDiv) {
        selectorUsuarioDiv.classList.add('contenido-oculto');
    }
    
    // Mostrar módulos AFIP
    const modulosAfipDiv = document.getElementById('modulosAfipDiv');
    if (modulosAfipDiv) {
        modulosAfipDiv.classList.remove('contenido-oculto');
        
        // Si no se han inicializado los módulos AFIP, hacerlo ahora
        if (!modulosAfipCargados) {
            inicializarModulosAfip();
            modulosAfipCargados = true;
        }
        
        // Mostrar información del usuario seleccionado
        mostrarUsuarioSeleccionado();
    }
}

function mostrarUsuarioSeleccionado() {
    const infoUsuarioDiv = document.getElementById('infoUsuarioSeleccionado');
    if (infoUsuarioDiv && usuarioSeleccionado) {
        infoUsuarioDiv.innerHTML = `
            <div class="usuario-seleccionado">
                <span>Usuario activo: <strong>${usuarioSeleccionado.nombre}</strong></span>
                <button id="btnCambiarUsuario" class="btn-secundario">Cambiar Usuario</button>
            </div>
        `;
        
        // Agregar funcionalidad para cambiar usuario
        const btnCambiarUsuario = document.getElementById('btnCambiarUsuario');
        if (btnCambiarUsuario) {
            btnCambiarUsuario.addEventListener('click', () => {
                mostrarSelectorUsuario();
            });
        }
    }
}

// ========================================
// INICIALIZAR MÓDULOS AFIP
// ========================================
function inicializarModulosAfip() {
    inicializarInterfazFacturas();
    inicializarMercadoPago();
    
    // Configurar los selectores de usuario en los módulos
    configurarUsuarioEnModulos();
}

function configurarUsuarioEnModulos() {
    // Para el módulo de facturas
    const selectUsuariosFacturas = document.getElementById('selectUsuarios');
    if (selectUsuariosFacturas && usuarioSeleccionado) {
        // Crear opción para el usuario seleccionado con todos los datos
        const option = document.createElement('option');
        option.value = usuarioSeleccionado.id;
        option.textContent = usuarioSeleccionado.nombre;
        option.selected = true;
        
        // Agregar todos los datasets necesarios
        option.dataset.cuit = usuarioSeleccionado.cuit || '';
        option.dataset.cuil = usuarioSeleccionado.cuil || '';
        option.dataset.tipoContribuyente = usuarioSeleccionado.tipoContribuyente || '';
        option.dataset.clave = usuarioSeleccionado.clave || '';
        
        selectUsuariosFacturas.innerHTML = '';
        selectUsuariosFacturas.appendChild(option);
        selectUsuariosFacturas.disabled = true; // Opcional: deshabilitarlo para evitar cambios
        
        // Actualizar tipo de contribuyente automáticamente si existe
        if (usuarioSeleccionado.tipoContribuyente) {
            const tipoContribuyenteRadio = document.querySelector(`input[name="tipoContribuyente"][value="${usuarioSeleccionado.tipoContribuyente}"]`);
            if (tipoContribuyenteRadio) {
                tipoContribuyenteRadio.checked = true;
            }
        }
    }
}

// ========================================
// FUNCIÓN PARA OBTENER USUARIO SELECCIONADO
// ========================================
function obtenerUsuarioSeleccionado() {
    return usuarioSeleccionado;
}

// Exportar la función para que otros módulos puedan acceder al usuario
window.obtenerUsuarioSeleccionado = obtenerUsuarioSeleccionado;

// ========================================
// INICIALIZAR MERCADO PAGO (Modificado)
// ========================================
function getBasePath() {
    const currentScript = document.currentScript || document.querySelector('script[src*="controlador"]');
    if (currentScript && currentScript.src) {
        const scriptPath = currentScript.src;
        return scriptPath.substring(0, scriptPath.lastIndexOf('/') + 1);
    }
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

                // Pasar información del usuario al módulo MercadoPago
                script.onload = () => {
                    // Si el módulo MercadoPago tiene una función para recibir usuario
                    if (window.configurarUsuarioMercadoPago && usuarioSeleccionado) {
                        window.configurarUsuarioMercadoPago(usuarioSeleccionado);
                    }
                };

                document.head.appendChild(script);

            } catch (error) {
                console.error('Error:', error);
                lectorMPDiv.innerHTML = '<p>Error cargando el componente</p>';
            }
        });
    }
}

// ========================================
// GESTION DE USUARIOS (Sin cambios)
// ========================================
function inicializarGestionUsuarios() {
    const btnUsuarios = document.getElementById('btnUsuarios');
    const usuariosDiv = document.getElementById('usuariosDiv');
    let usuarioCssLink = null;

    if (btnUsuarios && usuariosDiv) {
        btnUsuarios.addEventListener('click', async () => {
            try {
                // Si el módulo está abierto, ocultar y quitar estilos
                if (!usuariosDiv.classList.contains('contenido-oculto')) {
                    usuariosDiv.classList.add('contenido-oculto');
                    usuariosDiv.innerHTML = '';
                    if (usuarioCssLink) {
                        usuarioCssLink.remove();
                        usuarioCssLink = null;
                    }
                    return;
                }

                // Ocultar otros módulos
                ocultarTodosLosModulos();
                
                usuariosDiv.innerHTML = '';
                const response = await fetch('../usuario/usuario.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const html = await response.text();
                usuariosDiv.innerHTML = html;
                usuariosDiv.classList.remove('contenido-oculto');

                // Agregar el CSS de usuario solo si no está presente
                if (!usuarioCssLink) {
                    usuarioCssLink = document.createElement('link');
                    usuarioCssLink.rel = 'stylesheet';
                    usuarioCssLink.href = '../usuario/usuario.css';
                    usuarioCssLink.id = 'usuario-css-link';
                    document.head.appendChild(usuarioCssLink);
                }

                setTimeout(() => {
                    // Elimina cualquier script previo de usuario.js
                    const oldScript = document.head.querySelector('script[src="../usuario/usuario.js"]');
                    if (oldScript) oldScript.remove();

                    // Carga usuario.js desde el head
                    const script = document.createElement('script');
                    script.src = '../usuario/usuario.js';
                    script.defer = true;
                    script.onload = () => {
                        if (window.inicializarUsuarioFrontend) {
                            window.inicializarUsuarioFrontend();
                        }
                    };
                    document.head.appendChild(script);
                }, 100);

            } catch (error) {
                console.error('Error:', error);
                usuariosDiv.innerHTML = `<p>Error: ${error.message}</p>`;
            }
        });
    }
}

// ========================================
// FUNCIÓN AUXILIAR PARA OBTENER USUARIOS
// ========================================
async function obtenerUsuarios() {
    try {
        const result = await window.electronAPI.user.getAll();
        if (result.success && Array.isArray(result.users)) {
            return result.users.map(user => ({
                id: user.id,
                nombre: `${user.nombre} ${user.apellido || ''}`.trim(),
                cuit: user.cuit || '',
                cuil: user.cuil || '',
                tipoContribuyente: user.tipoContribuyente || '',
                clave: user.clave || '',
                // Mantener datos originales por si se necesitan
                datosOriginales: user
            }));
        }
        return [];
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        return [];
    }
}