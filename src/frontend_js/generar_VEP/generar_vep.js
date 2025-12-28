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

// Estado: almacena el CUIT seleccionado para usuarios con múltiples CUITs
const cuitsSeleccionados = {};

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
        // ====== VALIDACIÓN Y FILTRADO DE CREDENCIALES AFIP ======
        campoCredencial: 'claveAFIP',
        campoEstado: 'estado_afip',
        campoError: 'errorAfip',
        permitirInvalidos: false,
        permitirSinValidar: false,
        mensajeSinValidar: 'Debe validar las credenciales primero en la sección Gestión de Cliente',

        // Ocultar columna CUIT por defecto (usaremos "CUIT a Usar")
        mostrarColumnaCUIT: false,

        onCambioSeleccion: (usuariosSeleccionados) => {
            actualizarEstadoGeneracion(usuariosSeleccionados);

            // Si estamos en modo consulta deuda, actualizar formularios y ocultar medios de pago
            if (moduloActivo === 'consultar-deuda') {
                renderizarFormulariosDeuda();
                // Asegurar que las columnas de medios de pago estén ocultas después de re-renderizar
                setTimeout(() => ocultarColumnasMediosPago(), 50);
            }
        },
        renderizarColumnasExtras: renderizarColumnasMediosPago,
        headersColumnasExtras: [
            'CUIT a Usar',
            '<img src="../generar_VEP/assets/pago_qr.gif" alt="QR" class="img-medio-pago" /><br>QR',
            '<img src="../generar_VEP/assets/pagar_link.gif" alt="Link" class="img-medio-pago" /><br>Link',
            '<img src="../generar_VEP/assets/mis_cuentas.gif" alt="Cuentas" class="img-medio-pago" /><br>Cuentas',
            '<img src="../generar_VEP/assets/interbanking.gif" alt="Inter" class="img-medio-pago" /><br>Inter',
            '<img src="../generar_VEP/assets/xn_group.gif" alt="XN" class="img-medio-pago" /><br>XN'
        ]
    });

    configurarEventListeners();

    console.log('✅ Vista VEP inicializada');
}

function renderizarColumnasMediosPago(usuario) {
    // Si estamos en modo consulta de deuda, no renderizar columnas de medios de pago
    if (moduloActivo === 'consultar-deuda') {
        return '';
    }

    let columnasHTML = '';

    // COLUMNA 1: CUIT a Usar (muestra el CUIT que se usará para generar el VEP)
    const cuitAsociados = usuario.cuitAsociados || [];
    const tieneCuitsAsociados = cuitAsociados.length > 1;

    if (tieneCuitsAsociados) {
        // Usuario con múltiples CUITs: mostrar selector de radio buttons
        const cuitSeleccionado = cuitsSeleccionados[usuario.id];
        const opciones = cuitAsociados.map(cuit => {
            const esElPrincipal = cuit === usuario.cuit;
            const checked = cuitSeleccionado === cuit ? 'checked' : '';

            return `
                <label class="cuit-radio-label" style="display: block; margin: 2px 0; font-size: 11px;">
                    <input
                        type="radio"
                        name="cuit-${usuario.id}"
                        value="${cuit}"
                        class="cuit-radio"
                        data-usuario-id="${usuario.id}"
                        ${checked}
                        style="margin-right: 4px;"
                    />
                    ${cuit}${esElPrincipal ? ' (Principal)' : ''}
                </label>
            `;
        }).join('');

        columnasHTML += `
            <td class="cuit-selector-cell" style="padding: 4px 8px; vertical-align: top;">
                ${opciones}
            </td>
        `;
    } else {
        // Usuario con un solo CUIT: simplemente mostrarlo
        const cuitAMostrar = usuario.cuit || usuario.cuil || 'N/A';
        columnasHTML += `
            <td class="cuit-selector-cell" style="text-align: center; padding: 8px; font-family: monospace; font-size: 12px;">
                ${cuitAMostrar}
            </td>
        `;
    }

    // COLUMNAS 2-6: Medios de pago
    const tieneCuitRequerido = !tieneCuitsAsociados || cuitsSeleccionados[usuario.id];

    MEDIOS_PAGO.forEach(medio => {
        const name = `medio-pago-${usuario.id}`;
        const id = `${medio.id}-${usuario.id}`;
        const estaSeleccionado = mediosPagoSeleccionados[usuario.id]?.id === medio.id;
        const disabled = !tieneCuitRequerido ? 'disabled' : '';

        columnasHTML += `
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
                    ${disabled}
                />
            </td>
        `;
    });

    return columnasHTML;
}

// ==============================================
// EVENT LISTENERS
// ==============================================

function configurarEventListeners() {
    // Tabs de navegación entre módulos
    const tabConsultarDeuda = document.getElementById('tab-consultar-deuda');
    const tabGenerarVEP = document.getElementById('tab-generar-vep');

    if (tabConsultarDeuda) {
        tabConsultarDeuda.addEventListener('click', () => cambiarModulo('consultar-deuda'));
    }

    if (tabGenerarVEP) {
        tabGenerarVEP.addEventListener('click', () => cambiarModulo('generar-vep'));
    }

    // Eventos de medios de pago y CUITs
    const contenedor = document.getElementById('selector-usuarios-vep');
    if (contenedor) {
        contenedor.addEventListener('change', (e) => {
            // Event listener para selección de CUIT
            if (e.target.classList.contains('cuit-radio')) {
                const usuarioId = e.target.dataset.usuarioId;
                const cuitSeleccionado = e.target.value;

                // Guardar CUIT seleccionado
                cuitsSeleccionados[usuarioId] = cuitSeleccionado;

                console.log(`✅ Usuario ${usuarioId} → CUIT seleccionado: ${cuitSeleccionado}`);

                // Habilitar medios de pago para este usuario sin re-renderizar todo
                const filaUsuario = document.querySelector(`.tabla-seleccionados tbody tr[data-usuario-id="${usuarioId}"]`);
                if (filaUsuario) {
                    const radiosMedioPago = filaUsuario.querySelectorAll('.medio-pago-radio');
                    radiosMedioPago.forEach(radio => {
                        radio.disabled = false;
                    });
                }

                // Actualizar estado
                const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();
                actualizarEstadoGeneracion(usuariosSeleccionados);
            }

            // Event listener para selección de medio de pago
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

    // Botón volver desde consulta de deuda
    const btnVolverDeuda = document.getElementById('btn-volver-deuda');
    if (btnVolverDeuda) {
        btnVolverDeuda.addEventListener('click', volverAlInicio);
    }

    // Botón ejecutar consulta de deuda
    const btnEjecutarDeuda = document.getElementById('btn-ejecutar-consulta-deuda');
    if (btnEjecutarDeuda) {
        btnEjecutarDeuda.addEventListener('click', ejecutarConsultaDeuda);
    }

    // Botón nueva consulta de deuda
    const btnNuevaConsultaDeuda = document.getElementById('btn-nueva-consulta-deuda');
    if (btnNuevaConsultaDeuda) {
        btnNuevaConsultaDeuda.addEventListener('click', iniciarNuevaConsultaDeuda);
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

    // VALIDACIÓN 1: Verificar que usuarios con múltiples CUITs tengan uno seleccionado
    const usuariosSinCuit = usuariosSeleccionados.filter(u => {
        const cuitAsociados = u.cuitAsociados || [];
        const tieneCuitsAsociados = cuitAsociados.length > 1;
        return tieneCuitsAsociados && !cuitsSeleccionados[u.id];
    });

    if (usuariosSinCuit.length > 0) {
        const nombresUsuarios = usuariosSinCuit.map(u => u.nombre).join(', ');
        mostrarMensaje('error',
            `⚠️ Debe seleccionar un CUIT para continuar.\n\n` +
            `Usuario(s) sin CUIT seleccionado: ${nombresUsuarios}\n\n` +
            `Por favor, seleccione un CUIT en la columna "CUIT a Usar" de la tabla de usuarios seleccionados.`
        );
        return;
    }

    // VALIDACIÓN 2: Verificar que todos tengan medio de pago
    const faltantesMedio = usuariosSeleccionados.filter(u => !mediosPagoSeleccionados[u.id]);
    if (faltantesMedio.length > 0) {
        const nombresUsuarios = faltantesMedio.map(u => u.nombre).join(', ');
        mostrarMensaje('error',
            `⚠️ Debe seleccionar un medio de pago para continuar.\n\n` +
            `Cliente(s) sin medio de pago: ${nombresUsuarios}\n\n` +
            `Por favor, seleccione un medio de pago (QR, Link, etc.) en la tabla.`
        );
        return;
    }

    const confirmacion = confirm(
        `¿Generar VEP para ${usuariosSeleccionados.length} cliente(s)?`
    );

    if (!confirmacion) return;

    // Preparar datos
    const payload = {
        usuarios: usuariosSeleccionados.map(u => {
            const cuitAsociados = u.cuitAsociados || [];
            const tieneCuitsAsociados = cuitAsociados.length > 1;

            // Usar CUIT seleccionado si existe, sino usar el CUIT principal
            const cuitAUsar = tieneCuitsAsociados && cuitsSeleccionados[u.id]
                ? cuitsSeleccionados[u.id]
                : (u.cuit || u.cuil);

            return {
                usuario: {
                    id: u.id,
                    nombre: u.nombre,
                    cuit: cuitAUsar  // ← CUIT seleccionado por el usuario
                },
                medioPago: mediosPagoSeleccionados[u.id]
            };
        }),
        periodosSeleccionados: EstadoVEP.periodosSeleccionados.length > 0
            ? EstadoVEP.periodosSeleccionados
            : null
    };

    // Guardar para segunda pasada si es necesario
    EstadoVEP.usuariosOriginales = payload.usuarios;

    console.log('📤 Enviando solicitud VEP (primera pasada):', payload);

    try {
        mostrarProgreso(true);

        const api = window.electronAPI || window.api;
        const resultado = await api.vep.generar(payload);

        mostrarProgreso(false);

        console.log('📥 Resultado VEP:', resultado);

        if (resultado.requiereSeleccion) {
            // Primera pasada: Mostrar resultados agrupados CON períodos para seleccionar
            manejarResultadosPrimeraPasada(resultado);
        } else if (resultado.success) {
            // Todo procesado automáticamente - SIEMPRE mostrar vista de resultados
            const tieneErrores = resultado.errores && resultado.errores.length > 0;
            const tieneProcesados = resultado.procesadosAuto && resultado.procesadosAuto.length > 0;

            if (tieneErrores || tieneProcesados) {
                // Mostrar interfaz de resultados persistente (NO popup temporal)
                console.log('📊 Mostrando resultados persistentes (sin requerir selección)');

                // Actualizar estado con los resultados
                EstadoVEP.setResultados({
                    procesadosAuto: resultado.procesadosAuto || [],
                    requierenSeleccion: [], // No hay períodos para seleccionar
                    errores: resultado.errores || []
                });

                // Renderizar todos los grupos (procesados y errores)
                renderizarTodosLosGrupos();

                // Renderizar archivos descargados
                if (resultado.procesadosAuto && resultado.procesadosAuto.length > 0) {
                    renderizarArchivosDescargados(resultado.procesadosAuto);
                }

                // Mostrar notificación según el resultado
                if (tieneErrores && !tieneProcesados) {
                    mostrarMensaje('error', `❌ ${resultado.errores.length} usuario(s) con errores. Revise los detalles abajo.`);
                } else if (tieneErrores && tieneProcesados) {
                    mostrarMensaje('warning', `⚠️ ${resultado.procesadosAuto.length} exitosos, ${resultado.errores.length} con errores`);
                } else if (tieneProcesados) {
                    mostrarMensaje('success', `✅ ${resultado.procesadosAuto.length} VEP generado(s) exitosamente`);
                }

                // Scroll automático a la sección de resultados
                scrollAResultados();

                // Ocultar el botón de "Confirmar y Continuar" ya que no hay nada que confirmar
                const btnConfirmar = document.getElementById('btn-confirmar-seleccion');
                if (btnConfirmar) {
                    btnConfirmar.style.display = 'none';
                }

                // Mostrar botón para iniciar nuevo proceso
                const seccionResultados = document.getElementById('seccion-resultados');
                if (seccionResultados) {
                    // Agregar botón de nuevo proceso al final de resultados si no existe
                    let btnNuevo = document.getElementById('btn-nuevo-proceso-desde-resultados');
                    if (!btnNuevo) {
                        const accionesDiv = seccionResultados.querySelector('.resultados-acciones');
                        if (accionesDiv) {
                            btnNuevo = document.createElement('button');
                            btnNuevo.id = 'btn-nuevo-proceso-desde-resultados';
                            btnNuevo.className = 'btn-confirmar';
                            btnNuevo.textContent = '✓ Iniciar Nuevo Proceso';
                            btnNuevo.style.display = 'inline-block';
                            btnNuevo.addEventListener('click', iniciarNuevoProceso);
                            accionesDiv.insertBefore(btnNuevo, accionesDiv.firstChild);
                        }
                    } else {
                        btnNuevo.style.display = 'inline-block';
                    }
                }

                limpiarSelecciones();
            } else {
                // Caso extremadamente raro: success pero sin procesados ni errores
                // (sinDeuda se maneja en el grupo de procesados)
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

    // Scroll automático a la sección de resultados
    scrollAResultados();

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
            // Segunda pasada completada - Mostrar resultados persistentes
            if (resultado.resultados && resultado.resultados.length > 0) {
                const exitosos = resultado.resultados.filter(r => r.status === 'success');
                const conErrores = resultado.resultados.filter(r => r.status === 'error');

                console.log('📊 Segunda pasada: Mostrando resultados persistentes');

                // Limpiar grupos anteriores
                limpiarTodosLosGrupos();

                // Actualizar estado con resultados finales
                EstadoVEP.setResultados({
                    procesadosAuto: exitosos.map(e => ({
                        usuario: e.usuario,
                        medioPago: e.medioPago,
                        pdfDescargado: e.pdfDescargado
                    })),
                    requierenSeleccion: [], // Ya no hay nada que seleccionar
                    errores: conErrores.map(e => ({
                        usuario: e.usuario,
                        medioPago: e.medioPago,
                        error: e.error
                    }))
                });

                // Renderizar todos los grupos
                renderizarTodosLosGrupos();

                // Renderizar archivos descargados
                if (exitosos.length > 0) {
                    const archivosDescargados = exitosos.map(e => ({
                        usuario: e.usuario,
                        pdfDescargado: e.pdfDescargado
                    }));
                    renderizarArchivosDescargados(archivosDescargados);
                }

                // Mostrar notificación según el resultado
                if (conErrores.length > 0 && exitosos.length === 0) {
                    mostrarMensaje('error', `❌ ${conErrores.length} usuario(s) con errores. Revise los detalles abajo.`);
                } else if (conErrores.length > 0 && exitosos.length > 0) {
                    mostrarMensaje('warning', `⚠️ ${exitosos.length} exitosos, ${conErrores.length} con errores`);
                } else if (exitosos.length > 0) {
                    mostrarMensaje('success', `✅ ${exitosos.length} VEP generado(s) exitosamente`);
                }

                // Scroll automático a la sección de resultados
                scrollAResultados();

                // Ocultar botones de confirmación
                const btnConfirmar = document.getElementById('btn-confirmar-seleccion');
                if (btnConfirmar) {
                    btnConfirmar.style.display = 'none';
                }

                // Mostrar botón de nuevo proceso
                const seccionResultados = document.getElementById('seccion-resultados');
                if (seccionResultados) {
                    let btnNuevo = document.getElementById('btn-nuevo-proceso-desde-resultados');
                    if (!btnNuevo) {
                        const accionesDiv = seccionResultados.querySelector('.resultados-acciones');
                        if (accionesDiv) {
                            btnNuevo = document.createElement('button');
                            btnNuevo.id = 'btn-nuevo-proceso-desde-resultados';
                            btnNuevo.className = 'btn-confirmar';
                            btnNuevo.textContent = '✓ Iniciar Nuevo Proceso';
                            btnNuevo.style.display = 'inline-block';
                            btnNuevo.addEventListener('click', iniciarNuevoProceso);
                            accionesDiv.insertBefore(btnNuevo, accionesDiv.firstChild);
                        }
                    } else {
                        btnNuevo.style.display = 'inline-block';
                    }
                }

                limpiarSelecciones();
            } else {
                // Caso sin procesados ni errores (sinDeuda se maneja en el grupo de procesados)
                mostrarMensaje('success', 'VEP generado exitosamente');
                limpiarSelecciones();
                limpiarTodosLosGrupos();
                EstadoVEP.reset();
            }
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

    // Validar CUIT seleccionado (para usuarios con múltiples CUITs)
    const usuariosSinCuit = usuariosSeleccionados.filter(u => {
        const cuitAsociados = u.cuitAsociados || [];
        const tieneCuitsAsociados = cuitAsociados.length > 1;
        return tieneCuitsAsociados && !cuitsSeleccionados[u.id];
    });

    // Validar medio de pago seleccionado
    const usuariosConMedio = usuariosSeleccionados.filter(
        u => mediosPagoSeleccionados[u.id]
    ).length;

    const faltantesCuit = usuariosSinCuit.length;
    const faltantesMedio = totalUsuarios - usuariosConMedio;
    const faltantes = faltantesCuit + faltantesMedio;

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
        let mensaje = '';
        if (faltantesCuit > 0 && faltantesMedio > 0) {
            mensaje = `${faltantesCuit} usuario(s) sin CUIT seleccionado, ${faltantesMedio} sin medio de pago`;
        } else if (faltantesCuit > 0) {
            mensaje = `${faltantesCuit} cliente(s) sin CUIT seleccionado`;
        } else {
            mensaje = `${faltantesMedio} cliente(s) sin medio de pago asignado`;
        }
        textoAdvertencia.textContent = mensaje;
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

/**
 * Hace scroll suave hacia la sección de resultados
 */
function scrollAResultados() {
    // Pequeño delay para asegurar que el contenido esté renderizado
    setTimeout(() => {
        const seccionResultados = document.getElementById('seccion-resultados');
        if (seccionResultados) {
            seccionResultados.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
                inline: 'nearest'
            });
            console.log('📜 Scroll automático a resultados');
        }
    }, 300); // 300ms para asegurar que el DOM esté actualizado
}

function mostrarMensaje(tipo, mensaje) {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion notificacion-${tipo}`;
    notificacion.textContent = mensaje;

    // Colores según el tipo
    const colores = {
        'success': '#10b981',  // Verde
        'error': '#ef4444',    // Rojo
        'warning': '#f59e0b',  // Naranja/Amarillo
        'info': '#3b82f6'      // Azul (para mensajes informativos como "sin deuda")
    };

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
        background: ${colores[tipo] || '#6b7280'};
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

    // Ocultar el botón de nuevo proceso que se crea dinámicamente
    const btnNuevo = document.getElementById('btn-nuevo-proceso-desde-resultados');
    if (btnNuevo) {
        btnNuevo.style.display = 'none';
    }

    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });

    console.log('🔄 Iniciando nuevo proceso VEP');
}

// ==============================================
// MÓDULO: CONSULTAR DEUDA
// ==============================================

let moduloActivo = 'generar-vep'; // Estado del módulo activo
const formulariosPorCliente = {}; // Almacena los datos del formulario por cliente

/**
 * Cambia entre los módulos de Generar VEP y Consultar Deuda
 */
function cambiarModulo(modulo) {
    moduloActivo = modulo;

    // Obtener elementos
    const tabConsultarDeuda = document.getElementById('tab-consultar-deuda');
    const tabGenerarVEP = document.getElementById('tab-generar-vep');
    const moduloGenerarVEP = document.getElementById('modulo-generar-vep');
    const moduloConsultarDeuda = document.getElementById('modulo-consultar-deuda');
    const descripcionGenerarVEP = document.getElementById('descripcion-generar-vep');
    const descripcionConsultarDeuda = document.getElementById('descripcion-consultar-deuda');

    if (modulo === 'consultar-deuda') {
        // Activar módulo consultar deuda
        tabConsultarDeuda.classList.add('tab-activo');
        tabGenerarVEP.classList.remove('tab-activo');
        moduloGenerarVEP.style.display = 'none';
        moduloConsultarDeuda.style.display = 'block';
        descripcionGenerarVEP.style.display = 'none';
        descripcionConsultarDeuda.style.display = 'block';

        // Ocultar columnas de medios de pago (con delay para asegurar que la tabla esté renderizada)
        setTimeout(() => ocultarColumnasMediosPago(), 50);

        // Renderizar formularios para usuarios seleccionados
        renderizarFormulariosDeuda();
    } else {
        // Activar módulo generar VEP
        tabConsultarDeuda.classList.remove('tab-activo');
        tabGenerarVEP.classList.add('tab-activo');
        moduloGenerarVEP.style.display = 'block';
        moduloConsultarDeuda.style.display = 'none';
        descripcionGenerarVEP.style.display = 'block';
        descripcionConsultarDeuda.style.display = 'none';

        // Mostrar columnas de medios de pago
        mostrarColumnasMediosPago();
    }

    console.log(`🔄 Módulo cambiado a: ${modulo}`);
}

/**
 * Oculta las columnas de medios de pago en la tabla
 */
function ocultarColumnasMediosPago() {
    // Ocultar headers de medios de pago (columnas 3-8: CUIT a Usar + 5 medios)
    const tabla = document.querySelector('.tabla-seleccionados');
    if (!tabla) return;

    // Ocultar headers
    const headers = tabla.querySelectorAll('thead th');
    for (let i = 2; i < headers.length; i++) { // Desde columna 2 en adelante (después de checkbox y usuario)
        headers[i].style.display = 'none';
    }

    // Ocultar celdas de datos
    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach(fila => {
        const celdas = fila.querySelectorAll('td');
        for (let i = 2; i < celdas.length; i++) { // Desde columna 2 en adelante
            celdas[i].style.display = 'none';
        }
    });
}

/**
 * Muestra las columnas de medios de pago en la tabla
 */
function mostrarColumnasMediosPago() {
    const tabla = document.querySelector('.tabla-seleccionados');
    if (!tabla) return;

    // Mostrar headers
    const headers = tabla.querySelectorAll('thead th');
    for (let i = 2; i < headers.length; i++) {
        headers[i].style.display = '';
    }

    // Mostrar celdas de datos
    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach(fila => {
        const celdas = fila.querySelectorAll('td');
        for (let i = 2; i < celdas.length; i++) {
            celdas[i].style.display = '';
        }
    });
}

/**
 * Renderiza los formularios de deuda para cada cliente seleccionado
 */
function renderizarFormulariosDeuda() {
    const contenedor = document.getElementById('contenedor-formularios-deuda');
    const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();

    if (usuariosSeleccionados.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <p style="font-size: 16px; margin-bottom: 8px;">No hay clientes seleccionados</p>
                <p style="font-size: 14px;">Seleccione clientes desde la tabla superior</p>
            </div>
        `;
        actualizarEstadoConsultaDeuda(0);
        return;
    }

    // Obtener fecha actual para defaults
    const hoy = new Date();
    const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
    const anioActual = hoy.getFullYear();
    const diaActual = String(hoy.getDate()).padStart(2, '0');

    // Formato para inputs nativos: YYYY-MM para type="month", YYYY-MM-DD para type="date"
    const periodoDesdeDefault = '2022-01';
    const periodoHastaDefault = `${anioActual}-${mesActual}`;
    const fechaCalculoDefault = `${anioActual}-${mesActual}-${diaActual}`;

    // Renderizar cards
    contenedor.innerHTML = usuariosSeleccionados.map(usuario => {
        const cuitAMostrar = usuario.cuit || usuario.cuil || 'N/A';
        const datosGuardados = formulariosPorCliente[usuario.id] || {};

        return `
            <div class="card-formulario-deuda" data-usuario-id="${usuario.id}">
                <div class="card-header-deuda">
                    <div class="cliente-info-deuda">
                        <div class="cliente-datos-deuda">
                            <span class="cliente-nombre-deuda">${usuario.nombre}</span>
                            <span class="cliente-cuit-deuda">${cuitAMostrar}</span>
                        </div>
                    </div>
                </div>
                <div class="card-body-deuda">
                    <div class="formulario-periodos-deuda">
                        <div class="campo-formulario-deuda">
                            <label for="desde-${usuario.id}">Período Desde</label>
                            <input
                                type="month"
                                id="desde-${usuario.id}"
                                data-usuario-id="${usuario.id}"
                                data-campo="desde"
                                value="${datosGuardados.desde || periodoDesdeDefault}"
                                min="2022-01"
                                max="${periodoHastaDefault}"
                                class="input-periodo-deuda"
                            />
                            <span class="mensaje-error-campo">Seleccione un período válido</span>
                        </div>

                        <div class="campo-formulario-deuda">
                            <label for="hasta-${usuario.id}">Período Hasta</label>
                            <input
                                type="month"
                                id="hasta-${usuario.id}"
                                data-usuario-id="${usuario.id}"
                                data-campo="hasta"
                                value="${datosGuardados.hasta || periodoHastaDefault}"
                                min="2022-01"
                                max="${periodoHastaDefault}"
                                class="input-periodo-deuda"
                            />
                            <span class="mensaje-error-campo">Seleccione un período válido</span>
                        </div>

                        <div class="campo-formulario-deuda">
                            <label for="fecha-${usuario.id}">Fecha de Cálculo</label>
                            <input
                                type="date"
                                id="fecha-${usuario.id}"
                                data-usuario-id="${usuario.id}"
                                data-campo="fecha"
                                value="${datosGuardados.fecha || fechaCalculoDefault}"
                                class="input-fecha-deuda"
                            />
                            <span class="mensaje-error-campo">Seleccione una fecha válida (hoy o posterior)</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Agregar event listeners para validación en tiempo real
    contenedor.querySelectorAll('.input-periodo-deuda, .input-fecha-deuda').forEach(input => {
        input.addEventListener('input', validarCampoDeuda);
        input.addEventListener('blur', guardarDatosFormularioDeuda);

        // Abrir el calendario al hacer clic en cualquier parte del input
        input.addEventListener('click', (e) => {
            try {
                // showPicker() abre el selector de fecha/mes nativo del navegador
                if (input.showPicker) {
                    input.showPicker();
                }
            } catch (error) {
                // Fallback: algunos navegadores no soportan showPicker aún
                // El input ya tiene focus por el click, lo cual abre el picker en la mayoría de navegadores
            }
        });
    });

    actualizarEstadoConsultaDeuda(usuariosSeleccionados.length);
}

/**
 * Valida un campo de período o fecha
 */
function validarCampoDeuda(e) {
    const input = e.target;
    const valor = input.value.trim();
    const esPeriodo = input.classList.contains('input-periodo-deuda');

    let esValido = false;

    if (esPeriodo) {
        // Para type="month": formato YYYY-MM
        // El navegador ya valida el formato automáticamente
        if (valor) {
            const [anio, mes] = valor.split('-').map(Number);
            const anioMin = 2022;
            const hoy = new Date();
            const mesActual = hoy.getMonth() + 1;
            const anioActual = hoy.getFullYear();

            // Validar rango de años
            if (anio >= anioMin && anio <= anioActual) {
                // Si es el año actual, validar que el mes no sea futuro
                if (anio === anioActual && mes <= mesActual) {
                    esValido = true;
                } else if (anio < anioActual) {
                    esValido = true;
                }
            }
        }
    } else {
        // Para type="date": formato YYYY-MM-DD
        // El navegador ya valida el formato automáticamente
        if (valor) {
            // Crear fecha desde el valor del input (YYYY-MM-DD)
            const [anio, mes, dia] = valor.split('-').map(Number);
            const fechaSeleccionada = new Date(anio, mes - 1, dia);
            const hoy = new Date();

            // Normalizar ambas fechas a medianoche para comparar solo día/mes/año
            fechaSeleccionada.setHours(0, 0, 0, 0);
            hoy.setHours(0, 0, 0, 0);

            // Validar que la fecha no sea pasada (debe ser hoy o futura)
            if (fechaSeleccionada >= hoy) {
                esValido = true;
            }
        }
    }

    // Aplicar estilos
    if (esValido || !valor) {
        input.classList.remove('error');
    } else {
        input.classList.add('error');
    }

    return esValido;
}

/**
 * Guarda los datos del formulario de un cliente
 */
function guardarDatosFormularioDeuda(e) {
    const input = e.target;
    const usuarioId = input.dataset.usuarioId;
    const campo = input.dataset.campo;
    const valor = input.value.trim();

    if (!formulariosPorCliente[usuarioId]) {
        formulariosPorCliente[usuarioId] = {};
    }

    formulariosPorCliente[usuarioId][campo] = valor;
}

/**
 * Actualiza el estado del botón de consulta de deuda
 */
function actualizarEstadoConsultaDeuda(totalUsuarios) {
    const contadorBtn = document.getElementById('contador-usuarios-deuda');
    const btnEjecutar = document.getElementById('btn-ejecutar-consulta-deuda');

    if (contadorBtn) {
        contadorBtn.textContent = totalUsuarios;
    }

    if (btnEjecutar) {
        btnEjecutar.disabled = totalUsuarios === 0;
    }
}

/**
 * Ejecuta la consulta de deuda para los clientes seleccionados
 */
async function ejecutarConsultaDeuda() {
    const usuariosSeleccionados = selectorUsuarios.obtenerSeleccionados();

    if (usuariosSeleccionados.length === 0) {
        mostrarMensaje('error', 'No hay usuarios seleccionados');
        return;
    }

    // Validar todos los formularios
    let todosValidos = true;
    const inputs = document.querySelectorAll('.input-periodo-deuda, .input-fecha-deuda');

    inputs.forEach(input => {
        const evento = { target: input };
        if (!validarCampoDeuda(evento)) {
            todosValidos = false;
        }
    });

    if (!todosValidos) {
        mostrarMensaje('error', 'Por favor corrija los errores en los formularios antes de continuar');
        return;
    }

    // Preparar payload (leyendo valores directamente del DOM)
    const payload = usuariosSeleccionados.map(u => {
        const cuitAUsar = u.cuit || u.cuil;

        // Leer valores directamente de los inputs en lugar del objeto guardado
        const inputDesde = document.getElementById(`desde-${u.id}`);
        const inputHasta = document.getElementById(`hasta-${u.id}`);
        const inputFecha = document.getElementById(`fecha-${u.id}`);

        // Convertir formatos de inputs nativos al formato esperado por el backend
        // type="month" devuelve "YYYY-MM", backend espera "MM/AAAA"
        // type="date" devuelve "YYYY-MM-DD", backend espera "DD/MM/AAAA"
        const convertirPeriodo = (valorMonth) => {
            if (!valorMonth) return '';
            const [anio, mes] = valorMonth.split('-');
            return `${mes}/${anio}`;
        };

        const convertirFecha = (valorDate) => {
            if (!valorDate) return '';
            const [anio, mes, dia] = valorDate.split('-');
            return `${dia}/${mes}/${anio}`;
        };

        return {
            usuario: {
                id: u.id,
                nombre: u.nombre,
                cuit: cuitAUsar,
                clave: u.claveAFIP
            },
            periodoDesde: convertirPeriodo(inputDesde ? inputDesde.value.trim() : ''),
            periodoHasta: convertirPeriodo(inputHasta ? inputHasta.value.trim() : ''),
            fechaCalculo: convertirFecha(inputFecha ? inputFecha.value.trim() : '')
        };
    });

    console.log('📤 Enviando solicitud de consulta de deuda:', payload);

    const confirmacion = confirm(
        `¿Consultar deuda para ${usuariosSeleccionados.length} cliente(s)?`
    );

    if (!confirmacion) return;

    try {
        mostrarProgreso(true);

        const api = window.electronAPI || window.api;
        const resultado = await api.consultaDeuda.consultar(payload);

        mostrarProgreso(false);

        console.log('📥 Resultado consulta deuda:', resultado);

        if (resultado.success) {
            mostrarResultadosConsultaDeuda(resultado.resultados);
            mostrarMensaje('success', `✅ ${resultado.resultados.length} consulta(s) completada(s)`);
        } else {
            mostrarMensaje('error', `Error: ${resultado.message || 'Error desconocido'}`);
        }

    } catch (error) {
        console.error('❌ Error consultando deuda:', error);
        mostrarProgreso(false);
        mostrarMensaje('error', `Error: ${error.message}`);
    }
}

/**
 * Muestra los resultados de la consulta de deuda
 */
function mostrarResultadosConsultaDeuda(resultados) {
    const seccionResultados = document.getElementById('seccion-resultados-deuda');
    const listaArchivos = document.getElementById('lista-archivos-deuda');

    // Renderizar archivos
    listaArchivos.innerHTML = resultados.map(r => {
        if (r.status === 'success') {
            return `
                <div class="archivo-item">
                    <div class="archivo-info">
                        <span class="archivo-icono">📊</span>
                        <div class="archivo-detalles">
                            <div class="archivo-usuario">${r.usuario.nombre}</div>
                            <div class="archivo-nombre">${r.archivoExcel}</div>
                        </div>
                    </div>
                    <div class="archivo-acciones">
                        <button class="btn-abrir-archivo" onclick="abrirArchivoDeuda('${r.rutaCompleta}')" title="Abrir archivo Excel">
                            📄 Abrir
                        </button>
                        <button class="btn-abrir-carpeta" onclick="abrirCarpetaDeuda('${r.rutaCompleta}')" title="Abrir carpeta que contiene el archivo">
                            📁 Ver Carpeta
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="archivo-item" style="border-left-color: #ef4444;">
                    <div class="archivo-info">
                        <span class="archivo-icono">❌</span>
                        <div class="archivo-detalles">
                            <div class="archivo-usuario">${r.usuario.nombre}</div>
                            <div class="archivo-nombre" style="color: #ef4444;">${r.error}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');

    // Mostrar sección
    seccionResultados.style.display = 'block';

    // Scroll a resultados
    setTimeout(() => {
        seccionResultados.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 300);
}

/**
 * Abre un archivo de deuda descargado
 */
async function abrirArchivoDeuda(rutaArchivo) {
    try {
        const api = window.electronAPI || window.api;
        await api.abrirArchivo(rutaArchivo);
    } catch (error) {
        console.error('❌ Error abriendo archivo:', error);
        mostrarMensaje('error', `Error al abrir archivo: ${error.message}`);
    }
}

/**
 * Abre la carpeta que contiene el archivo de deuda
 */
async function abrirCarpetaDeuda(rutaArchivo) {
    try {
        const api = window.electronAPI || window.api;
        await api.abrirDirectorio(rutaArchivo);
    } catch (error) {
        console.error('❌ Error abriendo carpeta:', error);
        mostrarMensaje('error', `Error al abrir carpeta: ${error.message}`);
    }
}

/**
 * Inicia una nueva consulta de deuda
 */
function iniciarNuevaConsultaDeuda() {
    // Limpiar resultados
    const seccionResultados = document.getElementById('seccion-resultados-deuda');
    seccionResultados.style.display = 'none';

    // Limpiar formularios guardados
    Object.keys(formulariosPorCliente).forEach(key => {
        delete formulariosPorCliente[key];
    });

    // Re-renderizar formularios
    renderizarFormulariosDeuda();

    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });

    console.log('🔄 Iniciando nueva consulta de deuda');
}

// Exponer funciones globales
window.abrirArchivoDeuda = abrirArchivoDeuda;
window.abrirCarpetaDeuda = abrirCarpetaDeuda;

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
