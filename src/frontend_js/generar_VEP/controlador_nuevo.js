/**
 * CONTROLADOR VEP (Refactorizado)
 * Orquestador principal - delega responsabilidades a módulos
 */

// Importar módulos
import EstadoVEP from './modulos/estadoVEP.js';
import {
    renderizarTodosLosGrupos,
    limpiarTodosLosGrupos,
    mostrarSeccionResultados,
    ocultarSeccionResultados
} from './modulos/renderizadorResultados.js';
import {
    inicializarEventListeners as inicializarEventosPeriodos,
    recopilarSelecciones,
    validarSelecciones
} from './modulos/manejadorPeriodos.js';
import {
    renderizarArchivosDescargados,
    limpiarArchivos,
    ocultarSeccionArchivos
} from './modulos/renderizadorArchivos.js';

// Definición de medios de pago
const MEDIOS_PAGO = [
    { id: 'pago_qr', nombre: 'Pago QR' },
    { id: 'pagar_link', nombre: 'Pagar Link' },
    { id: 'pago_mis_cuentas', nombre: 'Pago Mis Cuentas' },
    { id: 'interbanking', nombre: 'Interbanking' },
    { id: 'xn_group', nombre: 'XN Group' }
];

// Estado local (solo UI del selector)
const mediosPagoSeleccionados = {};
let selectorUsuarios = null;

// ==============================================
// INICIALIZACIÓN
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
    inicializarVEP();
});

window.inicializarGenerarVEP = inicializarVEP;

function inicializarVEP() {
    console.log('🔵 Inicializando vista VEP...');

    if (typeof SelectorUsuarios === 'undefined') {
        console.error('❌ SelectorUsuarios no está definido. Reintentando...');
        setTimeout(inicializarVEP, 100);
        return;
    }

    const contenedor = document.getElementById('selector-usuarios-vep');
    if (!contenedor) {
        console.error('❌ No se encontró el contenedor selector-usuarios-vep');
        return;
    }

    // Crear selector de usuarios
    selectorUsuarios = new SelectorUsuarios('selector-usuarios-vep', {
        onCambioSeleccion: (usuariosSeleccionados) => {
            actualizarEstadoGeneracion(usuariosSeleccionados);
        },
        renderizarColumnasExtras: renderizarColumnasMediosPago,
        headersColumnasExtras: ['QR', 'Link', 'Cuentas', 'Inter', 'XN']
    });

    configurarEventListeners();

    console.log('✅ Vista VEP inicializada');
}

function renderizarColumnasMediosPago(usuario) {
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
}

// ==============================================
// EVENT LISTENERS
// ==============================================

function configurarEventListeners() {
    // Eventos de medios de pago
    const contenedor = document.getElementById('selector-usuarios-vep');
    if (contenedor) {
        contenedor.addEventListener('change', (e) => {
            if (e.target.classList.contains('medio-pago-radio')) {
                const usuarioId = e.target.dataset.usuarioId;
                const medioId = e.target.dataset.medioId;
                const medio = MEDIOS_PAGO.find(m => m.id === medioId);
                mediosPagoSeleccionados[usuarioId] = medio;

                const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();
                actualizarEstadoGeneracion(usuariosSeleccionados);
            }
        });
    }

    // Botón generar VEP
    const btnGenerar = document.getElementById('btn-generar-vep');
    if (btnGenerar) {
        btnGenerar.addEventListener('click', generarVEP);
    }

    // Botón volver
    const btnVolver = document.getElementById('btn-volver');
    if (btnVolver) {
        btnVolver.addEventListener('click', volverAlInicio);
    }

    // Botón confirmar selección (de períodos)
    const btnConfirmar = document.getElementById('btn-confirmar-seleccion');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', confirmarYContinuar);
    }

    // Botón cancelar todo
    const btnCancelar = document.getElementById('btn-cancelar-todo');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', cancelarTodo);
    }

    // Botón nuevo proceso VEP
    const btnNuevoProceso = document.getElementById('btn-nuevo-proceso-vep');
    if (btnNuevoProceso) {
        btnNuevoProceso.addEventListener('click', iniciarNuevoProceso);
    }
}

// ==============================================
// LÓGICA DE GENERACIÓN
// ==============================================

async function generarVEP() {
    const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();

    if (usuariosSeleccionados.length === 0) {
        mostrarMensaje('error', 'No hay usuarios seleccionados');
        return;
    }

    const faltantes = usuariosSeleccionados.filter(u => !mediosPagoSeleccionados[u.id]);
    if (faltantes.length > 0) {
        mostrarMensaje('error', `${faltantes.length} usuario(s) sin medio de pago`);
        return;
    }

    const confirmacion = confirm(
        `¿Generar VEP para ${usuariosSeleccionados.length} usuario(s)?`
    );

    if (!confirmacion) return;

    // Preparar datos
    const payload = {
        usuarios: usuariosSeleccionados.map(u => ({
            usuario: {
                id: u.id,
                nombre: u.nombre,
                cuit: u.cuit || u.cuil
            },
            medioPago: mediosPagoSeleccionados[u.id]
        }))
    };

    // Guardar para segunda pasada
    EstadoVEP.usuariosOriginales = payload.usuarios;

    console.log('📤 Enviando solicitud VEP (primera pasada):', payload);

    try {
        mostrarProgreso(true);

        const api = window.electronAPI || window.api;
        const resultado = await api.vep.generar(payload);

        mostrarProgreso(false);

        console.log('📥 Resultado VEP:', resultado);

        if (resultado.requiereSeleccion) {
            // Primera pasada: Mostrar resultados agrupados
            manejarResultadosPrimeraPasada(resultado);
        } else if (resultado.success) {
            // Todo procesado automáticamente - Mostrar archivos descargados
            if (resultado.procesadosAuto && resultado.procesadosAuto.length > 0) {
                renderizarArchivosDescargados(resultado.procesadosAuto);
                limpiarSelecciones();
            } else {
                mostrarMensaje('success', `VEP generado exitosamente`);
                limpiarSelecciones();
            }
        } else {
            mostrarMensaje('error', `Error: ${resultado.message || 'Error desconocido'}`);
        }

    } catch (error) {
        console.error('❌ Error generando VEP:', error);
        mostrarProgreso(false);
        mostrarMensaje('error', `Error: ${error.message}`);
    }
}

function manejarResultadosPrimeraPasada(resultado) {
    console.log('🔵 Manejando resultados de primera pasada...');

    // Actualizar estado
    EstadoVEP.setResultados(resultado);

    // Renderizar todos los grupos
    renderizarTodosLosGrupos();

    // Inicializar eventos de períodos
    inicializarEventosPeriodos();

    console.log('✅ Resultados renderizados');
}

async function confirmarYContinuar() {
    console.log('✅ Confirmando selección de períodos...');

    // Validar selecciones
    const validacion = validarSelecciones();

    if (!validacion.valido) {
        mostrarMensaje('error', validacion.mensaje);
        return;
    }

    // Recopilar selecciones
    const { periodosSeleccionados, clientesExcluidos } = recopilarSelecciones();

    console.log('📋 Períodos seleccionados:', periodosSeleccionados);
    console.log('🚫 Clientes excluidos:', clientesExcluidos);

    // Preparar payload para segunda pasada
    const payload = {
        usuarios: EstadoVEP.usuariosOriginales,
        periodosSeleccionados: periodosSeleccionados
    };

    console.log('📤 Enviando solicitud VEP (segunda pasada):', payload);

    try {
        mostrarProgreso(true);

        const api = window.electronAPI || window.api;
        const resultado = await api.vep.generar(payload);

        mostrarProgreso(false);

        console.log('📥 Resultado segunda pasada:', resultado);

        if (resultado.success) {
            // Mostrar archivos descargados
            if (resultado.resultados && resultado.resultados.length > 0) {
                const exitosos = resultado.resultados.filter(r => r.status === 'success');
                if (exitosos.length > 0) {
                    renderizarArchivosDescargados(exitosos);
                } else {
                    mostrarMensaje('success', 'VEP generado exitosamente');
                }
            } else {
                mostrarMensaje('success', 'VEP generado exitosamente');
            }

            limpiarSelecciones();
            limpiarTodosLosGrupos();
            EstadoVEP.reset();
        } else {
            mostrarMensaje('error', `Error: ${resultado.message}`);
        }

    } catch (error) {
        console.error('❌ Error en segunda pasada:', error);
        mostrarProgreso(false);
        mostrarMensaje('error', `Error: ${error.message}`);
    }
}

function cancelarTodo() {
    const confirmacion = confirm('¿Cancelar el proceso? Se perderán las selecciones.');

    if (!confirmacion) return;

    limpiarTodosLosGrupos();
    EstadoVEP.reset();
    limpiarSelecciones();

    console.log('❌ Proceso cancelado');
}

// ==============================================
// UTILIDADES
// ==============================================

function actualizarEstadoGeneracion(usuariosSeleccionados) {
    const totalUsuarios = usuariosSeleccionados.length;
    const usuariosConMedio = usuariosSeleccionados.filter(
        u => mediosPagoSeleccionados[u.id]
    ).length;
    const faltantes = totalUsuarios - usuariosConMedio;

    // Actualizar contador
    const contadorBtn = document.getElementById('contador-usuarios');
    if (contadorBtn) {
        contadorBtn.textContent = totalUsuarios;
    }

    // Actualizar validación
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

    // Marcar filas sin medio
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

    // Habilitar/deshabilitar botón
    const btnGenerar = document.getElementById('btn-generar-vep');
    if (btnGenerar) {
        btnGenerar.disabled = totalUsuarios === 0 || faltantes > 0;
    }
}

function limpiarSelecciones() {
    selectorUsuarios.limpiarSeleccion();
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

    setTimeout(() => {
        notificacion.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notificacion.remove(), 300);
    }, 5000);
}

function volverAlInicio() {
    limpiarSelecciones();
    limpiarTodosLosGrupos();
    limpiarArchivos();
    EstadoVEP.reset();
    window.location.href = '../home_AFIP/home_afip.html';
}

function iniciarNuevoProceso() {
    limpiarSelecciones();
    limpiarTodosLosGrupos();
    limpiarArchivos();
    ocultarSeccionArchivos();
    EstadoVEP.reset();

    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });

    console.log('🔄 Iniciando nuevo proceso VEP');
}

// Estilos para animaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);
