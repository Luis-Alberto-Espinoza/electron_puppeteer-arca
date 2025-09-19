import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js';

/**
 * Oculta todos los submódulos al cambiar de módulo
 */
function ocultarSubmodulos() {
    // Oculta submódulos de AFIP
    ['facturasDiv', 'leerMercadoPagoDiv', 'libroIvaDiv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('contenido-oculto');
    });
    // Si tienes submódulos en ATM, agrégalos aquí
    // ['atmSubmodulo1', 'atmSubmodulo2'].forEach(...)
}

// ========================================
// VARIABLES GLOBALES
// ========================================
let usuarioSeleccionado = null; // Usuario actualmente seleccionado en la aplicación
let modulosAfipCargados = false; // Flag para evitar inicializar los módulos AFIP múltiples veces
let onUsuarioSeleccionado = null; // Callback para la acción a ejecutar después de seleccionar un usuario
let selectorListenerAgregado = false; // Flag para asegurar que el listener del selector se agregue solo una vez

// ========================================
// CONFIGURACIÓN CENTRALIZADA DE MÓDULOS
// ========================================
// Array que define todos los módulos principales con su botón, contenedor y función de carga
const MODULOS_PRINCIPALES = [
    {
        btn: 'btnEntrarAfip',
        modulo: 'selectorUsuarioDiv',
        callback: () => {
            onUsuarioSeleccionado = mostrarModulosAfip;
            mostrarSelectorUsuario();
        }
    },
    {
        btn: 'btnUsuarios',
        modulo: 'usuariosDiv',
        callback: cargarModuloUsuarios
    },
    {
        btn: 'btnExtraerTablasPDF',
        modulo: 'extraerTablasPDFDiv',
        callback: cargarModuloExtraerTablasPDF
    },
    {
        btn: 'btnEntrarATM',
        modulo: 'selectorUsuarioDiv',
        callback: () => {
            onUsuarioSeleccionado = cargarModuloATM;
            mostrarSelectorUsuario();
        }
    }
];

// ========================================
// FUNCIONES CENTRALIZADAS DE NAVEGACIÓN
// ========================================

/**
 * Oculta todos los módulos principales y muestra solo el especificado
 * @param {string} idMostrar - ID del div que se debe mostrar
 */
function mostrarSoloModulo(idMostrar) {
    // Ocultar todos los módulos principales
    MODULOS_PRINCIPALES.forEach(({ modulo }) => {
        const elemento = document.getElementById(modulo);
        if (elemento) elemento.classList.add('contenido-oculto');
    });

    ocultarSubmodulos(); // Oculta todos los submódulos

    // Mostrar el módulo solicitado
    const mostrar = document.getElementById(idMostrar);
    if (mostrar) mostrar.classList.remove('contenido-oculto');
}

/**
 * Inicializa todos los botones principales basándose en la configuración del array
 */
function inicializarBotonesPrincipales() {
    MODULOS_PRINCIPALES.forEach(({ btn, modulo, callback }) => {
        const boton = document.getElementById(btn);
        if (boton) {
            boton.addEventListener('click', () => {
                mostrarSoloModulo(modulo); // Mostrar el módulo correspondiente
                if (typeof callback === 'function') callback(); // Ejecutar función de carga específica
            });
        }
    });
}

// ========================================
// INICIALIZACIÓN PRINCIPAL
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarBotonesPrincipales(); // Inicializar toda la navegación centralizada
});

// ========================================
// CALLBACKS DE CARGA PARA CADA MÓDULO
// ========================================

/**
 * Muestra el selector de usuario y carga los usuarios disponibles
 */
function mostrarSelectorUsuario() {
    cargarUsuariosEnSelector(); // Cargar lista de usuarios en el select
}

/**
 * Carga el módulo de gestión de usuarios
 */
function cargarModuloUsuarios() {
    const usuariosDiv = document.getElementById('usuariosDiv');
    let usuarioCssLink = document.getElementById('usuario-css-link');

    if (usuariosDiv) {
        // Limpiar contenido anterior
        usuariosDiv.innerHTML = '';

        // Cargar HTML del módulo de usuarios
        fetch('../usuario/usuario.html')
            .then(response => response.text())
            .then(html => {
                usuariosDiv.innerHTML = html;

                // Cargar CSS del módulo si no está presente
                if (!usuarioCssLink) {
                    usuarioCssLink = document.createElement('link');
                    usuarioCssLink.rel = 'stylesheet';
                    usuarioCssLink.href = '../usuario/usuario.css';
                    usuarioCssLink.id = 'usuario-css-link';
                    document.head.appendChild(usuarioCssLink);
                }

                // Cargar JavaScript del módulo después de un breve delay
                setTimeout(() => {
                    // Remover script anterior para evitar duplicados
                    const oldScript = document.head.querySelector('script[src="../usuario/usuario.js"]');
                    if (oldScript) oldScript.remove();

                    // Agregar nuevo script
                    const script = document.createElement('script');
                    script.src = '../usuario/usuario.js';
                    script.defer = true;
                    script.onload = () => {
                        // Inicializar funcionalidad del módulo una vez cargado
                        if (window.inicializarUsuarioFrontend) {
                            window.inicializarUsuarioFrontend();
                        }
                    };
                    document.head.appendChild(script);
                }, 100);
            })
            .catch(error => {
                console.error('Error cargando módulo de usuarios:', error);
                usuariosDiv.innerHTML = `<p>Error: ${error.message}</p>`;
            });
    }
}

/**
 * Carga el módulo de extracción de tablas PDF
 */
async function cargarModuloExtraerTablasPDF() {
    const extraerTablasPDFDiv = document.getElementById('extraerTablasPDFDiv');

    if (extraerTablasPDFDiv) {
        // Limpiar contenido anterior para evitar elementos duplicados
        extraerTablasPDFDiv.innerHTML = '';

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../extraerTablasPdf_F/tablasPDF.html';
            const cssPath = '../extraerTablasPdf_F/tablasPDF.css';
            const jsPath = '../extraerTablasPdf_F/tablasPDF.js';

            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            const html = await response.text();
            extraerTablasPDFDiv.innerHTML = html;

            // Cargar CSS solo si no está presente
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
            }

            // Cargar JavaScript e inicializar funcionalidad
            const script = document.createElement('script');
            script.src = jsPath;
            script.defer = true;
            script.onload = () => {
                // Inicializar eventos del módulo una vez cargado
                if (window.inicializarEventosExtraerTablasPDF) {
                    window.inicializarEventosExtraerTablasPDF();
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo de extracción PDF:', error);
            extraerTablasPDFDiv.innerHTML = '<div style="color:red;">Error cargando el módulo de extracción de tablas PDF.</div>';
        }
    }
}

/**
 * Carga el módulo ATM
 */
async function cargarModuloATM() {
    mostrarSoloModulo('atmsDiv'); // Asegurarse de que el contenedor ATM esté visible
    const atmsDiv = document.getElementById('atmsDiv');

    if (atmsDiv) {
        // Limpiar contenido anterior para evitar elementos duplicados
        atmsDiv.innerHTML = '';

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../ATM_f/ATM_vistas/atm.html';
            const cssPath = '../ATM_f/ATM_vistas/atm.css';
            const jsPath = '../ATM_f/ATM_vistas/atm.js';

            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            const html = await response.text();
            atmsDiv.innerHTML = html;

            // Cargar CSS solo si no está presente
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
            }

            // Cargar JavaScript e inicializar funcionalidad
            const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
            if (oldScript) oldScript.remove();

            const script = document.createElement('script');
            script.src = jsPath;
            script.defer = true;
            script.onload = () => {
                // Inicializar eventos del módulo una vez cargado
                if (window.inicializarModuloATM) {
                    window.inicializarModuloATM();
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo ATM:', error);
            atmsDiv.innerHTML = '<div style="color:red;">Error cargando el módulo ATM.</div>';
        }
    }
}

// ========================================
// GESTIÓN DE USUARIOS
// ========================================

/**
 * Capitaliza la primera letra de cada palabra en una cadena
 * @param {string} nombre - Nombre a capitalizar
 * @returns {string} Nombre capitalizado
 */
function capitalizarNombre(nombre) {
    if (!nombre) return '';

    const nombreEnMinusculas = nombre.toLowerCase();
    return nombreEnMinusculas.split(' ').map(palabra => {
        if (palabra.length === 0) return '';
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');
}

/**
 * Carga todos los usuarios en el selector y configura el evento de selección
 */
async function cargarUsuariosEnSelector() {
    const selectUsuarios = document.getElementById('selectUsuariosSelector');
    if (!selectUsuarios) return;

    try {
        selectUsuarios.innerHTML = '<option value="">Cargando usuarios...</option>';
        selectUsuarios.disabled = true;

        const result = await window.electronAPI.user.getAll();

        if (result.success && Array.isArray(result.users)) {
            selectUsuarios.innerHTML = '<option value="">Seleccione un usuario</option>';

            result.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;

                const nombreCapitalizado = capitalizarNombre(user.nombre);
                const apellidoCapitalizado = user.apellido ? ` ${capitalizarNombre(user.apellido)}` : '';
                option.textContent = `${nombreCapitalizado}${apellidoCapitalizado}`.trim();

                // Store all data, including new keys, in the dataset
                option.dataset.cuit = user.cuit || '';
                option.dataset.cuil = user.cuil || '';
                option.dataset.tipoContribuyente = user.tipoContribuyente || '';
                option.dataset.claveAFIP = user.claveAFIP || user.clave || ''; // Fallback to old 'clave'
                option.dataset.claveATM = user.claveATM || '';
                option.dataset.nombre = user.nombre || '';
                option.dataset.apellido = user.apellido || '';
                option.dataset.empresasDisponibles = JSON.stringify(user.empresasDisponible || []);

                selectUsuarios.appendChild(option);
            });

            selectUsuarios.disabled = false;
        } else {
            selectUsuarios.innerHTML = '<option value="">No se encontraron usuarios</option>';
        }

        if (!selectorListenerAgregado) {
            selectUsuarios.addEventListener('change', (e) => {
                if (e.target.value) {
                    const selectedOption = selectUsuarios.options[selectUsuarios.selectedIndex];

                    // Reconstruct the full user object from the dataset
                    const usuarioCompleto = {
                        id: selectedOption.value,
                        nombre: selectedOption.textContent,
                        cuit: selectedOption.dataset.cuit,
                        cuil: selectedOption.dataset.cuil,
                        claveAFIP: selectedOption.dataset.claveAFIP, // Read new key
                        claveATM: selectedOption.dataset.claveATM,   // Read new key
                        tipoContribuyente: selectedOption.dataset.tipoContribuyente,
                        nombreSolo: selectedOption.dataset.nombre,
                        apellido: selectedOption.dataset.apellido,
                        empresasDisponibles: selectedOption.dataset.empresasDisponibles ?
                            JSON.parse(selectedOption.dataset.empresasDisponibles) : []
                    };

                    seleccionarUsuario(usuarioCompleto);
                }
            });
            selectorListenerAgregado = true;
        }

    } catch (error) {
        console.error('Error cargando usuarios:', error);
        selectUsuarios.innerHTML = '<option value="">Error cargando usuarios</option>';
        selectUsuarios.disabled = false;
    }
}

/**
 * Establece el usuario seleccionado y muestra los módulos AFIP
 * @param {Object} usuarioCompleto - Objeto con todos los datos del usuario
 */
function seleccionarUsuario(usuarioCompleto) {
    // Guardar usuario en variables globales
    usuarioSeleccionado = usuarioCompleto;
    window.usuarioSeleccionado = usuarioSeleccionado; // Para compatibilidad con otros módulos

    // Ejecutar el callback definido al entrar al selector de usuario (AFIP o ATM)
    if (typeof onUsuarioSeleccionado === 'function') {
        onUsuarioSeleccionado();
    }
}

/**
 * Muestra la interface de módulos AFIP y oculta el selector de usuario
 */
function mostrarModulosAfip() {
    mostrarSoloModulo('modulosAfipDiv'); // Usar la función centralizada para mostrar el módulo

    // Inicializar módulos AFIP solo la primera vez
    if (!modulosAfipCargados) {
        inicializarModulosAfip();
        modulosAfipCargados = true;
    }

    mostrarUsuarioSeleccionado(); // Mostrar información del usuario activo
}

/**
 * Muestra la información del usuario seleccionado con opción para cambiarlo
 */
function mostrarUsuarioSeleccionado() {
    const infoUsuarioDiv = document.getElementById('infoUsuarioSeleccionado');
    if (infoUsuarioDiv && usuarioSeleccionado) {
        const nombreCapitalizado = capitalizarNombre(usuarioSeleccionado.nombre);

        infoUsuarioDiv.innerHTML = `
            <div class="usuario-seleccionado">
                <span>Usuario activo: <strong>${nombreCapitalizado}</strong></span>
                <button id="btnCambiarUsuario" class="btn-secundario">Cambiar Usuario</button>
            </div>
        `;

        // Configurar botón para cambiar usuario
        const btnCambiarUsuario = document.getElementById('btnCambiarUsuario');
        if (btnCambiarUsuario) {
            btnCambiarUsuario.addEventListener('click', () => {
                mostrarSelectorUsuario();
            });
        }
    }
}

// ========================================
// INICIALIZACIÓN DE MÓDULOS AFIP
// ========================================

/**
 * Inicializa todos los módulos específicos de AFIP
 */
function inicializarModulosAfip() {
    inicializarInterfazFacturas(); // Módulo de facturas
    inicializarMercadoPago();      // Módulo de MercadoPago
    inicializarLibroIVA();         // Módulo de Libro IVA
}

/**
 * Inicializa todos los módulos específicos de ATM
 */
function inicializarModulosATM() {
    // Aquí puedes inicializar los módulos específicos de ATM
    // Por ejemplo: inicializarInterfazATM(), inicializarReportesATM(), etc.
    console.log('Inicializando módulos ATM...');
    // inicializarInterfazATM();
    // inicializarReportesATM(); 
    // inicializarConfiguracionATM();
}

/**
 * Obtiene la ruta base del script actual para cargar recursos relativos
 * @returns {string} Ruta base
 */
function obtenerRutaBase() {
    const scriptActual = document.currentScript || document.querySelector('script[src*="controlador"]');
    if (scriptActual && scriptActual.src) {
        const rutaScript = scriptActual.src;
        return rutaScript.substring(0, rutaScript.lastIndexOf('/') + 1);
    }
    return window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
}

/**
 * Inicializa el módulo de MercadoPago con carga dinámica
 */
function inicializarMercadoPago() {
    const btnLectorMP = document.getElementById('btnLectorMP');
    const lectorMPDiv = document.getElementById('leerMercadoPagoDiv');

    if (btnLectorMP && lectorMPDiv) {
        btnLectorMP.addEventListener('click', async () => {
            try {
                // Toggle: si ya está visible, ocultarlo
                if (!lectorMPDiv.classList.contains('contenido-oculto')) {
                    lectorMPDiv.classList.add('contenido-oculto');
                    return;
                }

                // Cargar contenido del módulo
                const rutaBase = obtenerRutaBase();
                const htmlPath = rutaBase + './leerMercadoPago/mercadoPago_leer.html';
                const response = await fetch(htmlPath);
                const html = await response.text();

                // Insertar HTML y mostrar módulo
                lectorMPDiv.innerHTML = html;
                lectorMPDiv.classList.remove('contenido-oculto');

                // Cargar JavaScript del módulo
                const script = document.createElement('script');
                script.type = 'module';
                script.src = rutaBase + './leerMercadoPago/mercadoPago.js';

                script.onload = () => {
                    // Configurar usuario una vez cargado el script
                    if (window.configurarUsuarioMercadoPago && window.usuarioSeleccionado) {
                        window.configurarUsuarioMercadoPago(window.usuarioSeleccionado);
                    }

                    // Inicializar selector de fechas si está disponible
                    const fechaComprobanteMP = document.getElementById('fechaComprobanteMP');
                    if (fechaComprobanteMP && typeof flatpickr !== 'undefined') {
                        flatpickr(fechaComprobanteMP, {
                            mode: "single",
                            dateFormat: "d/m/Y"
                        });
                    }
                };

                document.head.appendChild(script);

            } catch (error) {
                console.error('Error cargando módulo MercadoPago:', error);
                lectorMPDiv.innerHTML = '<p>Error cargando el componente</p>';
            }
        });
    }
}

/**
 * Inicializa el módulo de Libro IVA con carga dinámica
 */
function inicializarLibroIVA() {
    const btnLibroIVA = document.getElementById('btnLibroIVA');
    const libroIvaDiv = document.getElementById('libroIvaDiv');

    if (btnLibroIVA && libroIvaDiv) {
        btnLibroIVA.addEventListener('click', async () => {
            try {
                // Toggle: si ya está visible, ocultarlo y limpiar
                if (!libroIvaDiv.classList.contains('contenido-oculto')) {
                    libroIvaDiv.classList.add('contenido-oculto');
                    libroIvaDiv.innerHTML = '';
                    return;
                }

                // Cargar HTML del módulo
                const response = await fetch('../libroIVA/libroIVA.html');
                const html = await response.text();
                libroIvaDiv.innerHTML = html;
                libroIvaDiv.classList.remove('contenido-oculto');

                // Cargar JavaScript del módulo si no está presente
                const scriptPath = '../libroIVA/inicializarLibroIVA.js';
                if (!document.head.querySelector(`script[src="${scriptPath}"]`)) {
                    const script = document.createElement('script');
                    script.src = scriptPath;
                    script.defer = true;
                    document.head.appendChild(script);
                }

            } catch (error) {
                console.error('Error cargando módulo Libro IVA:', error);
                libroIvaDiv.innerHTML = '<p>Error cargando el componente Libro IVA</p>';
            }
        });
    }
}

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

/**
 * Obtiene el usuario actualmente seleccionado
 * @returns {Object|null} Usuario seleccionado o null
 */
function obtenerUsuarioSeleccionado() {
    return usuarioSeleccionado;
}

/**
 * Obtiene lista completa de usuarios desde la base de datos
 * @returns {Array} Array de usuarios formateados
 */
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
                datosOriginales: user // Mantener datos originales por compatibilidad
            }));
        }
        return [];
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        return [];
    }
}

// Exportar funciones para uso en otros módulos
window.obtenerUsuarioSeleccionado = obtenerUsuarioSeleccionado;