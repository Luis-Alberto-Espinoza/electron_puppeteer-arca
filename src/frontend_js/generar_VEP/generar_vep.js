/**
 * Módulo para generar VEP (Volante Electrónico de Pago)
 * Gestiona la interfaz de selección de usuario y medio de pago
 */

// Medios de pago disponibles
const MEDIOS_PAGO = [
    { id: 'pago_qr', nombre: 'Pago QR' },
    { id: 'pagar_link', nombre: 'Pagar Link' },
    { id: 'pago_mis_cuentas', nombre: 'Pago Mis Cuentas' },
    { id: 'interbanking', nombre: 'Interbanking' },
    { id: 'xn_group', nombre: 'XN Group Latin America' }
];

// Variables globales del módulo
let usuariosSeleccionados = []; // Array de objetos {usuario, medioPago}
let datosCapturados = null; // Datos capturados de períodos (para segunda pasada)
let periodosSeleccionados = []; // Períodos seleccionados por el usuario

/**
 * Inicializa el módulo de generar VEP
 */
async function inicializarGenerarVEP() {
    console.log('Inicializando módulo Generar VEP...');

    // Esperar un momento para asegurar que el DOM esté completamente cargado
    setTimeout(async () => {
        console.log('Configurando event listeners...');
        configurarEventListeners();

        console.log('Cargando usuarios en la tabla...');
        await cargarUsuariosEnTabla();
    }, 100);
}

/**
 * Configura los event listeners de los botones
 */
function configurarEventListeners() {
    const btnProcesar = document.getElementById('btnGenerarVEPProcesar');
    const btnVolver = document.getElementById('btnVolverHomeAfip');
    const btnConfirmarPeriodos = document.getElementById('btnConfirmarPeriodos');
    const btnCancelarPeriodos = document.getElementById('btnCancelarPeriodos');

    if (btnProcesar) {
        btnProcesar.addEventListener('click', procesarGeneracionVEP);
    }

    if (btnVolver) {
        btnVolver.addEventListener('click', volverHomeAfip);
    }

    if (btnConfirmarPeriodos) {
        btnConfirmarPeriodos.addEventListener('click', confirmarSeleccionPeriodos);
    }

    if (btnCancelarPeriodos) {
        btnCancelarPeriodos.addEventListener('click', cerrarModalSeleccionPeriodos);
    }
}

/**
 * Carga todos los usuarios en la tabla
 */
async function cargarUsuariosEnTabla() {
    console.log('cargarUsuariosEnTabla() - Iniciando...');
    const cuerpoTabla = document.getElementById('cuerpoTablaVEP');

    if (!cuerpoTabla) {
        console.error('No se encontró el elemento cuerpoTablaVEP');
        return;
    }

    console.log('cuerpoTabla encontrado:', cuerpoTabla);

    try {
        console.log('Verificando window.electronAPI:', window.electronAPI);

        // Obtener usuarios desde la base de datos usando el API de Electron
        const result = await window.electronAPI.user.getAll();

        console.log('Resultado de getAll():', result);

        if (result.success && Array.isArray(result.users) && result.users.length > 0) {
            console.log('Usuarios recibidos:', result.users.length);
            cuerpoTabla.innerHTML = ''; // Limpiar contenido previo

            result.users.forEach((usuario, index) => {
                console.log(`Creando fila para usuario ${index}:`, usuario);
                const fila = crearFilaUsuario(usuario);
                cuerpoTabla.appendChild(fila);
            });

            console.log(`✅ ${result.users.length} usuarios cargados en la tabla VEP`);
        } else {
            console.warn('No hay usuarios o resultado no válido:', result);
            cuerpoTabla.innerHTML = `
                <tr>
                    <td colspan="7" class="cargando-usuarios">
                        No se encontraron usuarios en el sistema
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('❌ Error cargando usuarios:', error);
        cuerpoTabla.innerHTML = `
            <tr>
                <td colspan="7" class="cargando-usuarios" style="color: red;">
                    Error al cargar usuarios: ${error.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Crea una fila de la tabla para un usuario
 * @param {Object} usuario - Datos del usuario
 * @returns {HTMLTableRowElement} Fila de la tabla
 */
function crearFilaUsuario(usuario) {
    const fila = document.createElement('tr');
    fila.dataset.usuarioId = usuario.id;
    fila.dataset.usuarioNombre = `${usuario.nombre} ${usuario.apellido || ''}`.trim();
    fila.dataset.usuarioCuit = usuario.cuit || '';

    // Columna: Nombre del usuario
    const celdaNombre = document.createElement('td');
    const nombreCompleto = `${usuario.nombre} ${usuario.apellido || ''}`.trim();
    celdaNombre.textContent = capitalizarTexto(nombreCompleto);
    fila.appendChild(celdaNombre);

    // Columna: CUIT
    const celdaCuit = document.createElement('td');
    celdaCuit.textContent = formatearCUIT(usuario.cuit || 'N/A');
    fila.appendChild(celdaCuit);

    // Columnas: Medios de pago (checkboxes)
    MEDIOS_PAGO.forEach((medio, index) => {
        const celdaMedioPago = document.createElement('td');

        const labelCheckbox = document.createElement('label');
        labelCheckbox.className = 'checkbox-medio-pago';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = `medio_pago_${usuario.id}`;
        checkbox.value = medio.id;
        checkbox.dataset.medioNombre = medio.nombre;

        // Event listener para manejar selección única
        checkbox.addEventListener('change', (e) => {
            manejarSeleccionMedioPago(e, fila);
        });

        labelCheckbox.appendChild(checkbox);
        celdaMedioPago.appendChild(labelCheckbox);
        fila.appendChild(celdaMedioPago);
    });

    return fila;
}

/**
 * Maneja la selección de medio de pago (solo uno por fila)
 * @param {Event} event - Evento del checkbox
 * @param {HTMLTableRowElement} fila - Fila de la tabla
 */
function manejarSeleccionMedioPago(event, fila) {
    const checkboxSeleccionado = event.target;
    const usuarioId = fila.dataset.usuarioId;
    const usuarioNombre = fila.dataset.usuarioNombre;
    const usuarioCuit = fila.dataset.usuarioCuit;

    if (checkboxSeleccionado.checked) {
        // Desmarcar todos los demás checkboxes de la misma fila
        const checkboxesFila = fila.querySelectorAll('input[type="checkbox"]');
        checkboxesFila.forEach(cb => {
            if (cb !== checkboxSeleccionado) {
                cb.checked = false;
            }
        });

        // Marcar la fila como seleccionada
        fila.classList.add('seleccionado');

        // Eliminar selección previa de este usuario (si existe)
        usuariosSeleccionados = usuariosSeleccionados.filter(item => item.usuario.id !== usuarioId);

        // Agregar nueva selección
        usuariosSeleccionados.push({
            usuario: {
                id: usuarioId,
                nombre: usuarioNombre,
                cuit: usuarioCuit
            },
            medioPago: {
                id: checkboxSeleccionado.value,
                nombre: checkboxSeleccionado.dataset.medioNombre
            }
        });

        console.log('✅ Usuario agregado. Total seleccionados:', usuariosSeleccionados.length);
        console.log('Lista completa:', usuariosSeleccionados);
    } else {
        // Si se desmarca, eliminar de la lista
        usuariosSeleccionados = usuariosSeleccionados.filter(item => item.usuario.id !== usuarioId);
        fila.classList.remove('seleccionado');
        console.log('❌ Usuario removido. Total seleccionados:', usuariosSeleccionados.length);
    }

    // Habilitar/deshabilitar botón de procesar
    actualizarEstadoBotonProcesar();
    actualizarContadorSeleccionados();
}

/**
 * Actualiza el estado del botón "Generar VEP"
 */
function actualizarEstadoBotonProcesar() {
    const btnProcesar = document.getElementById('btnGenerarVEPProcesar');

    if (btnProcesar) {
        btnProcesar.disabled = usuariosSeleccionados.length === 0;

        // Actualizar texto del botón
        if (usuariosSeleccionados.length > 0) {
            btnProcesar.textContent = `Generar VEP (${usuariosSeleccionados.length})`;
        } else {
            btnProcesar.textContent = 'Generar VEP';
        }
    }
}

/**
 * Actualiza el contador de usuarios seleccionados
 */
function actualizarContadorSeleccionados() {
    const mensajeDiv = document.getElementById('mensajeEstadoVEP');

    if (mensajeDiv && usuariosSeleccionados.length > 0) {
        mensajeDiv.className = 'mensaje-estado info';
        mensajeDiv.textContent = `${usuariosSeleccionados.length} usuario(s) seleccionado(s)`;
    } else if (mensajeDiv) {
        mensajeDiv.className = 'mensaje-estado oculto';
    }
}

/**
 * Procesa la generación del VEP
 */
async function procesarGeneracionVEP() {
    if (usuariosSeleccionados.length === 0) {
        mostrarMensaje('Debe seleccionar al menos un usuario con su medio de pago', 'error');
        return;
    }

    const cantidadUsuarios = usuariosSeleccionados.length;
    mostrarMensaje(`Procesando ${cantidadUsuarios} VEP(s)...`, 'info');

    try {
        console.log('📋 Generando VEP para los siguientes usuarios:');
        console.table(usuariosSeleccionados.map(item => ({
            Usuario: item.usuario.nombre,
            CUIT: item.usuario.cuit,
            MedioPago: item.medioPago.nombre
        })));

        // Enviar al backend a través del preload.js
        const resultado = await window.electronAPI.vep.generar({
            usuarios: usuariosSeleccionados,
            periodosSeleccionados: periodosSeleccionados.length > 0 ? periodosSeleccionados : null
        });

        console.log('✅ Respuesta del backend:', resultado);

        // CASO 1: Requiere selección de períodos (primera pasada)
        if (resultado.requiereSeleccion) {
            console.log('🔵 FRONTEND: Requiere selección de períodos');
            datosCapturados = resultado;
            mostrarModalSeleccionPeriodos(resultado.periodos);
            return;
        }

        // CASO 2: Proceso completo (segunda pasada o sin necesidad de selección)
        if (resultado.success) {
            mostrarMensaje(`✅ VEP generado exitosamente para ${cantidadUsuarios} usuario(s)`, 'exito');

            // Limpiar selecciones después del éxito
            limpiarSelecciones();
            cerrarModalSeleccionPeriodos();
        } else {
            mostrarMensaje(`❌ Error: ${resultado.message || 'Error desconocido'}`, 'error');
        }

    } catch (error) {
        console.error('❌ Error generando VEP:', error);
        mostrarMensaje(`Error al generar VEP: ${error.message}`, 'error');
    }
}

/**
 * Limpia todas las selecciones de la tabla
 */
function limpiarSelecciones() {
    // Limpiar array
    usuariosSeleccionados = [];

    // Desmarcar todos los checkboxes y quitar estilos
    const todasLasFilas = document.querySelectorAll('#cuerpoTablaVEP tr');
    todasLasFilas.forEach(fila => {
        fila.classList.remove('seleccionado');
        const checkboxes = fila.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    });

    // Actualizar UI
    actualizarEstadoBotonProcesar();
    actualizarContadorSeleccionados();

    console.log('🧹 Selecciones limpiadas');
}

/**
 * Vuelve a la vista Home AFIP
 */
function volverHomeAfip() {
    const evento = new CustomEvent('volverHomeAfip');
    document.dispatchEvent(evento);
}

/**
 * Muestra un mensaje de estado al usuario
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - Tipo de mensaje: 'exito', 'error', 'info'
 */
function mostrarMensaje(mensaje, tipo) {
    const divMensaje = document.getElementById('mensajeEstadoVEP');

    if (divMensaje) {
        divMensaje.textContent = mensaje;
        divMensaje.className = `mensaje-estado ${tipo}`;

        // Auto-ocultar después de 5 segundos para mensajes de éxito
        if (tipo === 'exito') {
            setTimeout(() => {
                divMensaje.classList.add('oculto');
            }, 5000);
        }
    }
}

/**
 * Capitaliza la primera letra de cada palabra
 * @param {string} texto - Texto a capitalizar
 * @returns {string} Texto capitalizado
 */
function capitalizarTexto(texto) {
    if (!texto) return '';

    return texto.toLowerCase().split(' ').map(palabra => {
        if (palabra.length === 0) return '';
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');
}

/**
 * Formatea un CUIT con guiones
 * @param {string|number} cuit - CUIT sin formato
 * @returns {string} CUIT formateado (XX-XXXXXXXX-X)
 */
function formatearCUIT(cuit) {
    if (!cuit || cuit === 'N/A') return 'N/A';

    // Convertir a string si es un número
    const cuitStr = String(cuit);

    // Eliminar caracteres no numéricos
    const soloNumeros = cuitStr.replace(/\D/g, '');

    if (soloNumeros.length === 11) {
        return `${soloNumeros.slice(0, 2)}-${soloNumeros.slice(2, 10)}-${soloNumeros.slice(10)}`;
    }

    return cuitStr;
}

/**
 * Muestra el modal de selección de períodos
 * @param {Array} periodos - Array de períodos capturados
 */
function mostrarModalSeleccionPeriodos(periodos) {
    console.log('Mostrando modal de selección de períodos:', periodos);

    const modal = document.getElementById('modalSeleccionPeriodos');
    if (!modal) {
        console.error('No se encontró el modal de selección de períodos');
        return;
    }

    // Renderizar la tabla de períodos
    const tbody = document.getElementById('cuerpoTablaPeriodos');
    tbody.innerHTML = '';

    periodos.forEach(periodo => {
        // Fila del período (con checkbox)
        const filaPeriodo = document.createElement('tr');
        filaPeriodo.className = 'fila-periodo';

        const celdaCheckbox = document.createElement('td');
        celdaCheckbox.rowSpan = periodo.filas.length + 1;
        celdaCheckbox.className = 'celda-checkbox';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = periodo.periodo;
        checkbox.className = 'checkbox-periodo';
        checkbox.id = `periodo_${periodo.periodo.replace('/', '_')}`;

        checkbox.addEventListener('change', (e) => {
            manejarSeleccionPeriodo(e.target);
        });

        celdaCheckbox.appendChild(checkbox);
        filaPeriodo.appendChild(celdaCheckbox);

        const celdaPeriodo = document.createElement('td');
        celdaPeriodo.textContent = periodo.periodo;
        celdaPeriodo.className = 'celda-periodo-titulo';
        celdaPeriodo.colSpan = 3;
        filaPeriodo.appendChild(celdaPeriodo);

        tbody.appendChild(filaPeriodo);

        // Filas de detalle (impuestos)
        periodo.filas.forEach(fila => {
            const filaDetalle = document.createElement('tr');
            filaDetalle.className = 'fila-detalle';

            const celdaImpuesto = document.createElement('td');
            celdaImpuesto.textContent = fila.impuesto;
            celdaImpuesto.className = 'celda-impuesto';
            filaDetalle.appendChild(celdaImpuesto);

            const celdaCategoria = document.createElement('td');
            celdaCategoria.textContent = fila.categoria;
            celdaCategoria.className = 'celda-categoria';
            filaDetalle.appendChild(celdaCategoria);

            const celdaImporte = document.createElement('td');
            celdaImporte.textContent = `$ ${fila.importe}`;
            celdaImporte.className = 'celda-importe';
            filaDetalle.appendChild(celdaImporte);

            tbody.appendChild(filaDetalle);
        });
    });

    // Mostrar modal
    modal.style.display = 'flex';
}

/**
 * Maneja la selección/deselección de un período
 * @param {HTMLInputElement} checkbox - Checkbox del período
 */
function manejarSeleccionPeriodo(checkbox) {
    const periodo = checkbox.value;

    if (checkbox.checked) {
        if (!periodosSeleccionados.includes(periodo)) {
            periodosSeleccionados.push(periodo);
        }
    } else {
        periodosSeleccionados = periodosSeleccionados.filter(p => p !== periodo);
    }

    console.log('Períodos seleccionados:', periodosSeleccionados);

    // Actualizar estado del botón confirmar
    const btnConfirmar = document.getElementById('btnConfirmarPeriodos');
    if (btnConfirmar) {
        btnConfirmar.disabled = periodosSeleccionados.length === 0;
    }
}

/**
 * Cierra el modal de selección de períodos
 */
function cerrarModalSeleccionPeriodos() {
    const modal = document.getElementById('modalSeleccionPeriodos');
    if (modal) {
        modal.style.display = 'none';
    }

    // Resetear selección
    periodosSeleccionados = [];
    datosCapturados = null;
}

/**
 * Confirma la selección de períodos y continúa con el proceso
 */
async function confirmarSeleccionPeriodos() {
    if (periodosSeleccionados.length === 0) {
        mostrarMensaje('Debe seleccionar al menos un período', 'error');
        return;
    }

    console.log('Confirmando períodos seleccionados:', periodosSeleccionados);

    // Cerrar modal
    const modal = document.getElementById('modalSeleccionPeriodos');
    if (modal) {
        modal.style.display = 'none';
    }

    // Llamar nuevamente al proceso con los períodos seleccionados
    mostrarMensaje(`Procesando VEP con ${periodosSeleccionados.length} período(s) seleccionado(s)...`, 'info');

    // Volver a llamar a procesarGeneracionVEP (ahora con periodosSeleccionados lleno)
    await procesarGeneracionVEP();
}

// Exponer la función de inicialización globalmente
window.inicializarGenerarVEP = inicializarGenerarVEP;
