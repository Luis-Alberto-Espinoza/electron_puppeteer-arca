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
let selectorUsuariosAfip = null; // Instancia del componente SelectorUsuarios para AFIP

// ========================================
// CONFIGURACIÓN CENTRALIZADA DE MÓDULOS
// ========================================
// Array que define todos los módulos principales con su botón, contenedor y función de carga
const MODULOS_PRINCIPALES = [
    {
        btn: 'btnEntrarAfip',
        modulo: 'homeAfipDiv',
        callback: cargarModuloHomeAfip
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
        modulo: 'atmsDiv',
        callback: cargarModuloLoteATM
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

    // Ocultar módulos secundarios (que no están en MODULOS_PRINCIPALES)
    ['generarVEPDiv', 'selectorUsuarioDiv', 'modulosAfipDiv'].forEach(id => {
        const elemento = document.getElementById(id);
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

    // Listeners para eventos personalizados de los módulos
    document.addEventListener('cargarModuloVEP', () => {
        cargarModuloGenerarVEP();
    });

    document.addEventListener('cargarModuloFactura', () => {
        mostrarSoloModulo('selectorUsuarioDiv');
        cargarModuloGenerarFactura();
    });

    document.addEventListener('volverHomeAfip', () => {
        mostrarSoloModulo('homeAfipDiv');
        cargarModuloHomeAfip();
    });
});

// ========================================
// CALLBACKS DE CARGA PARA CADA MÓDULO
// ========================================

/**
 * Muestra el selector de usuario y carga el componente dinámicamente
 */
async function mostrarSelectorUsuario() {
    const selectorDiv = document.getElementById('selectorUsuarioDiv');

    if (!selectorDiv) {
        console.error('❌ No se encontró selectorUsuarioDiv');
        return;
    }

    // Mostrar el div
    mostrarSoloModulo('selectorUsuarioDiv');

    // Si ya está inyectado, no volver a inyectar
    if (selectorUsuariosAfip) {
        console.log('✅ Selector ya existe, reutilizando...');
        return;
    }

    try {
        console.log('🔵 Inyectando componente selectorUsuarios...');

        // 1. INYECTAR HTML
        selectorDiv.innerHTML = `
            <div class="selector-usuario">
                <h2>Seleccione el Cliente con el que trabajará</h2>
                <div id="selector-usuarios-afip"></div>
                <p style="color: #666; font-size: 14px; margin-top: 10px;">
                    Una vez seleccionado el cliente, podrá acceder a los módulos de Facturas y MercadoPago
                </p>
            </div>
        `;

        // 2. CARGAR CSS del componente (si no está cargado)
        const cssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
        if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = cssPath;
            document.head.appendChild(cssLink);
            console.log('✅ CSS del componente cargado');
        }

        // 3. CARGAR JS del componente (si no está cargado)
        const jsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';
        if (!document.head.querySelector(`script[src="${jsPath}"]`)) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = jsPath;
                script.onload = () => {
                    console.log('✅ JS del componente cargado');
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ Error cargando JS del componente');
                    reject(new Error('Error cargando selectorUsuarios.js'));
                };
                document.head.appendChild(script);
            });
        }

        // Pequeño delay para asegurar que SelectorUsuarios esté disponible
        await new Promise(resolve => setTimeout(resolve, 100));

        // 4. CREAR INSTANCIA del componente
        if (typeof SelectorUsuarios === 'undefined') {
            throw new Error('SelectorUsuarios no está definido');
        }

        selectorUsuariosAfip = new SelectorUsuarios('selector-usuarios-afip', {
            // Ocultar tabla de seleccionados (solo selección simple, avanza automático)
            mostrarTablaSeleccionados: false,

            // ====== VALIDACIÓN Y FILTRADO DE CREDENCIALES AFIP ======
            campoCredencial: 'claveAFIP',
            campoEstado: 'estado_afip',
            campoError: 'errorAfip',
            permitirInvalidos: false,
            permitirSinValidar: false,
            mensajeSinValidar: 'Debe validar las credenciales primero en la sección Gestión de Cliente',

            onCambioSeleccion: (usuariosSeleccionados) => {
                // Solo permitir 1 usuario
                if (usuariosSeleccionados.length > 0) {
                    const usuario = usuariosSeleccionados[0];

                    // Limitar a 1 solo
                    if (usuariosSeleccionados.length > 1) {
                        selectorUsuariosAfip.usuariosSeleccionados = [usuario];
                        selectorUsuariosAfip.actualizarVista();
                    }

                    // Llamar a la función existente (avanza a Facturas automáticamente)
                    seleccionarUsuario(usuario);
                }
            }
        });

        console.log('✅ Selector de usuarios cargado correctamente');

    } catch (error) {
        console.error('❌ Error cargando selector de usuarios:', error);
        selectorDiv.innerHTML = `
            <div style="color:red; padding: 20px;">
                <h3>Error cargando el selector de usuarios</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
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
 * Carga el módulo de procesamiento por lotes de ATM
 */
async function cargarModuloLoteATM() {
    mostrarSoloModulo('atmsDiv'); // Reutilizamos el mismo contenedor principal
    const atmsDiv = document.getElementById('atmsDiv');

    if (atmsDiv) {
        atmsDiv.innerHTML = ''; // Limpiar contenido anterior

        try {
            // Rutas del componente genérico SelectorUsuarios
            const selectorUsuariosCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
            const selectorUsuariosJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

            // Rutas de los archivos de lote ATM
            const htmlPath = '../ATM_f/ATM_vistas/atm_lote.html';
            const cssPath = '../ATM_f/ATM_vistas/atm_lote.css';
            const jsPath = '../ATM_f/ATM_vistas/atm_lote.js';

            // 1. Cargar CSS del componente SelectorUsuarios (si no está cargado)
            if (!document.head.querySelector(`link[href="${selectorUsuariosCssPath}"]`)) {
                const selectorCssLink = document.createElement('link');
                selectorCssLink.rel = 'stylesheet';
                selectorCssLink.href = selectorUsuariosCssPath;
                document.head.appendChild(selectorCssLink);
            }

            // 2. Cargar HTML del módulo lote
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            const html = await response.text();
            atmsDiv.innerHTML = html;

            // 3. Cargar CSS del módulo lote
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
            }

            // 4. Cargar JS del componente SelectorUsuarios primero
            const cargarSelectorUsuariosScript = () => {
                return new Promise((resolve, reject) => {
                    // Verificar si ya está cargado
                    if (typeof SelectorUsuarios !== 'undefined') {
                        resolve();
                        return;
                    }

                    const oldSelectorScript = document.head.querySelector(`script[src="${selectorUsuariosJsPath}"]`);
                    if (oldSelectorScript) oldSelectorScript.remove();

                    const selectorScript = document.createElement('script');
                    selectorScript.src = selectorUsuariosJsPath;
                    selectorScript.defer = true;
                    selectorScript.onload = () => resolve();
                    selectorScript.onerror = () => reject(new Error('Error al cargar SelectorUsuarios.js'));
                    document.head.appendChild(selectorScript);
                });
            };

            // 5. Luego cargar JS del módulo lote
            await cargarSelectorUsuariosScript();

            const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
            if (oldScript) oldScript.remove();

            const script = document.createElement('script');
            script.src = jsPath;
            script.defer = true;
            script.onload = () => {
                if (window.inicializarModuloLoteATM) {
                    window.inicializarModuloLoteATM();
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo de lote ATM:', error);
            atmsDiv.innerHTML = '<div style="color:red;">Error cargando el módulo de lotes ATM.</div>';
        }
    }
}
// Exponer la función globalmente para que pueda ser llamada desde otros scripts
window.cargarModuloLoteATM = cargarModuloLoteATM;

/**
 * Carga el módulo Home AFIP (menú de servicios AFIP)
 */
async function cargarModuloHomeAfip() {
    const homeAfipDiv = document.getElementById('homeAfipDiv');

    if (homeAfipDiv) {
        homeAfipDiv.innerHTML = ''; // Limpiar contenido anterior

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../home_AFIP/home_afip.html';
            const cssPath = '../home_AFIP/home_afip.css';
            const jsPath = '../home_AFIP/home_afip.js';

            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            const html = await response.text();
            homeAfipDiv.innerHTML = html;

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
                if (window.inicializarHomeAfip) {
                    window.inicializarHomeAfip();
                }
            };
            document.head.appendChild(script);

        } catch (error) {
            console.error('Error cargando módulo Home AFIP:', error);
            homeAfipDiv.innerHTML = '<div style="color:red;">Error cargando el módulo Home AFIP.</div>';
        }
    }
}

/**
 * Carga el módulo de Generar VEP (Volante Electrónico de Pago)
 */
async function cargarModuloGenerarVEP() {
    console.log('🔵 cargarModuloGenerarVEP() - Iniciando...');
    mostrarSoloModulo('generarVEPDiv');
    const generarVEPDiv = document.getElementById('generarVEPDiv');

    if (generarVEPDiv) {
        generarVEPDiv.innerHTML = ''; // Limpiar contenido anterior

        try {
            // Rutas de los archivos del módulo
            const htmlPath = '../generar_VEP/generar_vep.html';
            const cssPath = '../generar_VEP/generar_vep.css';
            const jsPath = '../generar_VEP/generar_vep.js';

            // Rutas del componente genérico
            const selectorCssPath = '../componentes/selectorUsuarios/selectorUsuarios.css';
            const selectorJsPath = '../componentes/selectorUsuarios/selectorUsuarios.js';

            console.log('🔵 Cargando HTML desde:', htmlPath);
            // Cargar HTML del módulo
            const response = await fetch(htmlPath);
            if (!response.ok) throw new Error(`Error al cargar ${htmlPath}`);
            const html = await response.text();
            generarVEPDiv.innerHTML = html;
            console.log('✅ HTML cargado correctamente');

            // Cargar CSS del componente genérico
            if (!document.head.querySelector(`link[href="${selectorCssPath}"]`)) {
                const selectorCssLink = document.createElement('link');
                selectorCssLink.rel = 'stylesheet';
                selectorCssLink.href = selectorCssPath;
                document.head.appendChild(selectorCssLink);
                console.log('✅ CSS componente genérico cargado');
            }

            // Cargar CSS específico de VEP
            if (!document.head.querySelector(`link[href="${cssPath}"]`)) {
                const cssLink = document.createElement('link');
                cssLink.rel = 'stylesheet';
                cssLink.href = cssPath;
                document.head.appendChild(cssLink);
                console.log('✅ CSS VEP cargado');
            }

            // Cargar JS del componente genérico primero
            const oldSelectorScript = document.head.querySelector(`script[src="${selectorJsPath}"]`);
            if (oldSelectorScript) oldSelectorScript.remove();

            const selectorScript = document.createElement('script');
            selectorScript.src = selectorJsPath;
            selectorScript.defer = true;
            selectorScript.onload = () => {
                console.log('✅ Script componente genérico cargado');

                // AHORA cargar el controlador de VEP como módulo ES6 (después de que el genérico esté listo)
                const oldScript = document.head.querySelector(`script[src="${jsPath}"]`);
                if (oldScript) oldScript.remove();

                const script = document.createElement('script');
                script.type = 'module'; // ES6 modules
                script.src = jsPath;
                script.onload = () => {
                    console.log('✅ Módulo controlador VEP cargado. Verificando window.inicializarGenerarVEP...');
                    if (window.inicializarGenerarVEP) {
                        console.log('✅ Llamando a inicializarGenerarVEP()');
                        window.inicializarGenerarVEP();
                    } else {
                        console.error('❌ window.inicializarGenerarVEP no está definida');
                    }
                };
                document.head.appendChild(script);
            };
            document.head.appendChild(selectorScript);

        } catch (error) {
            console.error('❌ Error cargando módulo Generar VEP:', error);
            generarVEPDiv.innerHTML = '<div style="color:red;">Error cargando el módulo Generar VEP.</div>';
        }
    } else {
        console.error('❌ No se encontró el elemento generarVEPDiv');
    }
}

/**
 * Carga el módulo de Generar Factura (selector de usuario existente)
 */
function cargarModuloGenerarFactura() {
    onUsuarioSeleccionado = mostrarModulosAfip;
    mostrarSelectorUsuario();
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
 * ⚠️ FUNCIÓN OBSOLETA - Ya no se usa
 * Reemplazada por el componente SelectorUsuarios que se inyecta dinámicamente
 * en mostrarSelectorUsuario()
 *
 * Se mantiene comentada como referencia histórica.
 */
/*
async function cargarUsuariosEnSelector() {
    const selectUsuarios = document.getElementById('selectUsuariosSelector');
    if (!selectUsuarios) return;

    try {
        selectUsuarios.innerHTML = '<option value="">Cargando usuarios...</option>';
        selectUsuarios.disabled = true;

        const result = await window.electronAPI.user.getAll();

        if (result.success && Array.isArray(result.users)) {
            // Filtrar usuarios para que solo muestre aquellos con clave de AFIP
            const usuariosAFIP = result.users.filter(user => (user.claveAFIP && user.claveAFIP.trim() !== '') || (user.clave && user.clave.trim() !== ''));

            if (usuariosAFIP.length > 0) {
                selectUsuarios.innerHTML = '<option value="">Seleccione un usuario</option>';
                usuariosAFIP.forEach(user => {
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
                    option.dataset.empresasDisponibles = JSON.stringify(user.puntosDeVenta || []);

                    selectUsuarios.appendChild(option);
                });
            } else {
                selectUsuarios.innerHTML = '<option value="">No hay usuarios con clave de AFIP</option>';
            }

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
*/

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