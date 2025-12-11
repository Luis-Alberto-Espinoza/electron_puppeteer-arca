/**
 * CONTROLADOR VEP
 * Lógica específica para generación de VEP
 */

// Definición de medios de pago
const MEDIOS_PAGO = [
    { id: 'pago_qr', nombre: 'Pago QR' },
    { id: 'pagar_link', nombre: 'Pagar Link' },
    { id: 'pago_mis_cuentas', nombre: 'Pago Mis Cuentas' },
    { id: 'interbanking', nombre: 'Interbanking' },
    { id: 'xn_group', nombre: 'XN Group' }
];

// Estado: almacena el medio de pago seleccionado para cada usuario
const mediosPagoSeleccionados = {};

// Instancia del selector de usuarios
let selectorUsuarios = null;

// Variables para el flujo de selección de períodos
let datosCapturados = null; // Datos capturados de períodos (para segunda pasada)
let periodosSeleccionados = []; // Períodos seleccionados por el usuario

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    inicializarVEP();
});

// Exponer función para ser llamada desde controlador principal
window.inicializarGenerarVEP = inicializarVEP;

function inicializarVEP() {
    console.log('🔵 Inicializando vista VEP...');

    // Verificar que SelectorUsuarios esté disponible
    if (typeof SelectorUsuarios === 'undefined') {
        console.error('❌ SelectorUsuarios no está definido. Reintentando en 100ms...');
        setTimeout(inicializarVEP, 100);
        return;
    }

    // Verificar que el contenedor exista
    const contenedor = document.getElementById('selector-usuarios-vep');
    if (!contenedor) {
        console.error('❌ No se encontró el contenedor selector-usuarios-vep');
        return;
    }

    console.log('✅ SelectorUsuarios disponible, creando instancia...');

    // Crear selector de usuarios con configuración específica de VEP
    selectorUsuarios = new SelectorUsuarios('selector-usuarios-vep', {

        // Callback cuando cambia la selección
        onCambioSeleccion: (usuariosSeleccionados) => {
            actualizarEstadoGeneracion(usuariosSeleccionados);
        },

        // Renderizar columnas de medios de pago
        renderizarColumnasExtras: (usuario, index) => {
            return MEDIOS_PAGO.map(medio => {
                const name = `medio-pago-${usuario.id}`;
                const id = `${medio.id}-${usuario.id}`;
                const estaSeleccionado = mediosPagoSeleccionados[usuario.id]?.id === medio.id;

                return `
                    <td class="medio-pago-cell">
                        <input
                            type="radio"
                            name="${name}"
                            id="${id}"
                            value="${medio.id}"
                            class="medio-pago-radio"
                            data-usuario-id="${usuario.id}"
                            data-medio-id="${medio.id}"
                            ${estaSeleccionado ? 'checked' : ''}
                        />
                    </td>
                `;
            }).join('');
        },

        // Headers para las columnas de medios de pago
        headersColumnasExtras: ['QR', 'Link', 'Cuentas', 'Inter', 'XN']
    });

    // Agregar eventos para los radio buttons
    agregarEventosMediosPago();

    // Evento botón generar
    const btnGenerar = document.getElementById('btn-generar-vep');
    if (btnGenerar) {
        btnGenerar.addEventListener('click', generarVEP);
    }

    // Evento botón volver
    const btnVolver = document.getElementById('btn-volver');
    if (btnVolver) {
        btnVolver.addEventListener('click', volverAlInicio);
    }

    console.log('✅ Vista VEP inicializada');
}

function agregarEventosMediosPago() {
    // Usar delegación de eventos en el contenedor
    const contenedor = document.getElementById('selector-usuarios-vep');

    if (contenedor) {
        contenedor.addEventListener('change', (e) => {
            if (e.target.classList.contains('medio-pago-radio')) {
                const usuarioId = e.target.dataset.usuarioId;
                const medioId = e.target.dataset.medioId;

                // Guardar selección
                const medio = MEDIOS_PAGO.find(m => m.id === medioId);
                mediosPagoSeleccionados[usuarioId] = medio;

                console.log(`✅ Usuario ${usuarioId} → ${medio.nombre}`);

                // Actualizar estado
                const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();
                actualizarEstadoGeneracion(usuariosSeleccionados);
            }
        });
    }
}

function actualizarEstadoGeneracion(usuariosSeleccionados) {
    const totalUsuarios = usuariosSeleccionados.length;
    const usuariosConMedio = usuariosSeleccionados.filter(
        u => mediosPagoSeleccionados[u.id]
    ).length;
    const faltantes = totalUsuarios - usuariosConMedio;

    // Actualizar contador en botón
    const contadorBtn = document.getElementById('contador-usuarios');
    if (contadorBtn) {
        contadorBtn.textContent = totalUsuarios;
    }

    // Actualizar contador de validación
    if (totalUsuarios > 0) {
        const esCompleto = faltantes === 0;
        const htmlContador = `
            <span class="${esCompleto ? 'completo' : 'incompleto'}">
                ${usuariosConMedio}/${totalUsuarios} ${esCompleto ? '✓' : ''}
            </span>
        `;
        selectorUsuarios.actualizarContadorValidacion(htmlContador);
    } else {
        selectorUsuarios.actualizarContadorValidacion('');
    }

    // Marcar filas sin medio de pago con borde rojo
    usuariosSeleccionados.forEach(usuario => {
        const sinMedio = !mediosPagoSeleccionados[usuario.id];
        selectorUsuarios.marcarFilaSinMedioPago(usuario.id, sinMedio);
    });

    // Mostrar/ocultar advertencia
    const advertencia = document.getElementById('advertencia-medios');
    const textoAdvertencia = document.getElementById('texto-advertencia');

    if (faltantes > 0) {
        advertencia.style.display = 'flex';
        textoAdvertencia.textContent = `${faltantes} usuario(s) sin medio de pago asignado`;
    } else {
        advertencia.style.display = 'none';
    }

    // Habilitar/deshabilitar botón generar
    const btnGenerar = document.getElementById('btn-generar-vep');
    if (btnGenerar) {
        btnGenerar.disabled = totalUsuarios === 0 || faltantes > 0;
    }
}

async function generarVEP() {
    const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();

    if (usuariosSeleccionados.length === 0) {
        mostrarMensaje('error', 'No hay usuarios seleccionados');
        return;
    }

    // Validar que todos tengan medio de pago
    const faltantes = usuariosSeleccionados.filter(u => !mediosPagoSeleccionados[u.id]);
    if (faltantes.length > 0) {
        mostrarMensaje('error', `${faltantes.length} usuario(s) sin medio de pago`);
        return;
    }

    // Confirmar
    const confirmacion = confirm(
        `¿Generar VEP para ${usuariosSeleccionados.length} usuario(s)?`
    );

    if (!confirmacion) return;

    // Preparar datos para el backend
    const payload = {
        usuarios: usuariosSeleccionados.map(u => ({
            usuario: {
                id: u.id,
                nombre: u.nombre,
                cuit: u.cuit || u.cuil
            },
            medioPago: mediosPagoSeleccionados[u.id]
        })),
        periodosSeleccionados: periodosSeleccionados.length > 0 ? periodosSeleccionados : null
    };

    console.log('📤 Enviando solicitud VEP:', payload);

    try {
        // Mostrar modal de progreso
        mostrarProgreso(true);

        // Llamar al backend (usar electronAPI como con user.getAll)
        const api = window.electronAPI || window.api;
        if (!api || !api.vep || !api.vep.generar) {
            throw new Error('API de VEP no disponible');
        }

        const resultado = await api.vep.generar(payload);

        console.log('📥 Resultado VEP:', resultado);

        // Ocultar progreso
        mostrarProgreso(false);

        // CASO 1: Requiere selección de períodos (primera pasada)
        if (resultado.requiereSeleccion) {
            console.log('🔵 FRONTEND: Requiere selección de períodos');
            datosCapturados = resultado;
            mostrarModalSeleccionPeriodos(resultado.periodos);
            return;
        }

        // CASO 2: Proceso completo (segunda pasada o sin necesidad de selección)
        if (resultado.success) {
            mostrarMensaje('success', `VEP generado exitosamente para ${resultado.exitosos || 0} usuario(s)`);

            // Limpiar selecciones
            selectorUsuarios.limpiarSeleccion();
            limpiarMediosPago();
            cerrarModalSeleccionPeriodos();

            // TODO: Mostrar vista de resultados (próxima tarea)
        } else {
            mostrarMensaje('error', `Error: ${resultado.message || 'Error desconocido'}`);
        }

    } catch (error) {
        console.error('❌ Error generando VEP:', error);
        mostrarProgreso(false);
        mostrarMensaje('error', `Error: ${error.message}`);
    }
}

function limpiarMediosPago() {
    // Limpiar objeto de medios seleccionados
    Object.keys(mediosPagoSeleccionados).forEach(key => {
        delete mediosPagoSeleccionados[key];
    });
}

function mostrarProgreso(mostrar) {
    const modal = document.getElementById('modal-progreso');
    if (modal) {
        modal.style.display = mostrar ? 'flex' : 'none';
    }
}

function mostrarMensaje(tipo, mensaje) {
    // Crear elemento de notificación
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion notificacion-${tipo}`;
    notificacion.textContent = mensaje;

    notificacion.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background: ${tipo === 'success' ? '#10b981' : '#ef4444'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;

    document.body.appendChild(notificacion);

    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
        notificacion.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notificacion.remove(), 300);
    }, 5000);
}

function volverAlInicio() {
    // Limpiar estado
    selectorUsuarios.limpiarSeleccion();
    limpiarMediosPago();

    // Navegar al home (ajustar según tu estructura)
    window.location.href = '../home_AFIP/home_afip.html';
}

// Listener para actualizaciones desde el backend
const api = window.electronAPI || window.api;
if (api && api.vep && api.vep.onVEPUpdate) {
    api.vep.onVEPUpdate((datos) => {
        console.log('📨 Update VEP:', datos);

        const textoProgreso = document.getElementById('progreso-texto');
        if (textoProgreso) {
            textoProgreso.textContent = `Procesando ${datos.usuario || ''}... (${datos.procesados}/${datos.total})`;
        }

        const progresoFill = document.getElementById('progreso-fill');
        if (progresoFill && datos.total) {
            const porcentaje = (datos.procesados / datos.total) * 100;
            progresoFill.style.width = `${porcentaje}%`;
        }
    });
}

/**
 * Muestra el modal de selección de períodos
 * @param {Array} periodos - Array de períodos capturados
 */
function mostrarModalSeleccionPeriodos(periodos) {
    console.log('🔵 Mostrando modal de selección de períodos:', periodos);

    const modal = document.getElementById('modalSeleccionPeriodos');
    if (!modal) {
        console.error('❌ No se encontró el modal de selección de períodos');
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

    // Configurar event listeners para botones del modal
    const btnConfirmar = document.getElementById('btnConfirmarPeriodos');
    const btnCancelar = document.getElementById('btnCancelarPeriodos');

    if (btnConfirmar) {
        btnConfirmar.onclick = confirmarSeleccionPeriodos;
        btnConfirmar.disabled = true; // Inicialmente deshabilitado
    }

    if (btnCancelar) {
        btnCancelar.onclick = cerrarModalSeleccionPeriodos;
    }

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
        mostrarMensaje('error', 'Debe seleccionar al menos un período');
        return;
    }

    console.log('✅ Confirmando períodos seleccionados:', periodosSeleccionados);

    // Cerrar modal
    const modal = document.getElementById('modalSeleccionPeriodos');
    if (modal) {
        modal.style.display = 'none';
    }

    // Llamar nuevamente al proceso con los períodos seleccionados
    mostrarMensaje('success', `Procesando VEP con ${periodosSeleccionados.length} período(s)...`);

    // Volver a llamar a generarVEP (ahora con periodosSeleccionados lleno)
    await generarVEP();
}

// Estilos para animaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
