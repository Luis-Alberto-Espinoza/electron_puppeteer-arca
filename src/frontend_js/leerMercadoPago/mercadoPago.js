import { mercadoPagoFacturas } from '../facturas/facturas.js';
import { AuthManager, realizarLoginNormal, realizarLoginTest, obtenerCredencialesAfip } from '../autenticacion/auth.js';

function mostrarTablas(datos) {
    // Actualizar tabla de fechas (totales diarios)
    const tablaFechas = document.querySelector('.table-box:first-child');
    if (tablaFechas) {
        let htmlFechas = `
            <div class="tabla-header">
                <h3 class="table-title">📅 Totales por Día (${datos.totalesDiarios.length} registros)</h3>
                <button class="btn-expandir" data-tabla="fechas">
                    <span class="texto-expandir">Expandir Tabla</span>
                    <span class="icono-expandir">▼</span>
                </button>
            </div>
        `;
        
        htmlFechas += '<div class="tabla-scroll tabla-colapsada" id="tabla-fechas-content">';
        htmlFechas += '<table class="tabla-datos">';
        htmlFechas += '<thead><tr><th>Fecha</th><th>Transferencias</th><th>Liquidaciones</th><th>Total</th></tr></thead>';
        htmlFechas += '<tbody>';

        datos.totalesDiarios.forEach(item => {
            htmlFechas += `
                <tr>
                    <td>${item.fecha}</td>
                    <td>${item.transferencias.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>${item.liquidaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td class="total-cell">${item.totalFormateado}</td>
                </tr>
            `;
        });

        htmlFechas += '</tbody></table></div>';
        tablaFechas.innerHTML = htmlFechas;
    }

    // Actualizar tabla de montos (totales mensuales)
    const tablaMontos = document.querySelector('.table-box:last-child');
    if (tablaMontos) {
        let htmlMontos = `
            <div class="tabla-header">
                <h3 class="table-title">📈 Totales por Mes (${datos.totalesMensuales.length} registros)</h3>
                <button class="btn-expandir" data-tabla="montos">
                    <span class="texto-expandir">Expandir Tabla</span>
                    <span class="icono-expandir">▼</span>
                </button>
            </div>
        `;
        
        htmlMontos += '<div class="tabla-scroll tabla-colapsada" id="tabla-montos-content">';
        htmlMontos += '<table class="tabla-datos">';
        htmlMontos += '<thead><tr><th>Mes</th><th>Transferencias</th><th>Liquidaciones</th><th>Total</th></tr></thead>';
        htmlMontos += '<tbody>';

        datos.totalesMensuales.forEach(item => {
            htmlMontos += `
                <tr>
                    <td>${item.nombreMes}</td>
                    <td>${item.transferencias.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>${item.liquidaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td class="total-cell">${item.totalFormateado}</td>
                </tr>
            `;
        });

        htmlMontos += '</tbody></table></div>';
        tablaMontos.innerHTML = htmlMontos;
    }

    configurarBotonesExpandirTablas();
}


function configurarBotonesExpandirTablas() {
    const botonesExpandir = document.querySelectorAll('.btn-expandir');

    botonesExpandir.forEach(boton => {
        boton.addEventListener('click', function () {
            const tipoTabla = this.getAttribute('data-tabla');
            const tablaContent = document.getElementById(`tabla-${tipoTabla}-content`);
            const textoExpandir = this.querySelector('.texto-expandir');
            const iconoExpandir = this.querySelector('.icono-expandir');

            if (tablaContent.classList.contains('tabla-colapsada')) {
                // Expandir tabla
                tablaContent.classList.remove('tabla-colapsada');
                tablaContent.classList.add('tabla-expandida');
                textoExpandir.textContent = 'Colapsar Tabla';
                iconoExpandir.textContent = '▲';
                this.classList.add('btn-activo');
            } else {
                // Colapsar tabla
                tablaContent.classList.remove('tabla-expandida');
                tablaContent.classList.add('tabla-colapsada');
                textoExpandir.textContent = 'Expandir Tabla';
                iconoExpandir.textContent = '▼';
                this.classList.remove('btn-activo');
            }
        });
    });
}

// Función adicional para mostrar detalles de transferencias si es necesario
function mostrarDetalleTransferencias(transferencias) {
    console.log('Transferencias detalladas:', transferencias);
    // Esta función se puede expandir para mostrar una tabla detallada de todas las transferencias
}


function injectMercadoPagoCSS() {
    const cssFileId = 'mercado-pago-styles';
    if (document.getElementById(cssFileId)) {
        return; // Evita inyectar el CSS múltiples veces
    }

    const head = document.head;
    const link = document.createElement('link');

    link.id = cssFileId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = '../leerMercadoPago/mercadoPago.css'; // Ruta relativa desde index.html
    link.media = 'all';

    head.appendChild(link);
}

initializeMercadoPago();

function initializeMercadoPago() {
    injectMercadoPagoCSS(); // <-- Inyectar el CSS específico del módulo
    try {
        // Pequeña pausa para asegurar que el DOM esté listo
        setTimeout(() => {
            const btnSeleccionarArchivo = document.getElementById('btn-seleccionar-archivo');
            const rutaSeleccionadaContainer = document.getElementById('ruta-seleccionada-container');
            const rutaSeleccionadaInput = document.getElementById('ruta-seleccionada-input');
            const btnProcesarArchivo = document.getElementById('btn-procesar-archivo');
            const resultadosContainer = document.getElementById('resultados-container');
            const tablasContainer = document.getElementById('tablas-container');

            // Verificar que los elementos existen
            if (!btnSeleccionarArchivo) {
                console.error('No se encontró el botón seleccionar archivo');
                return;
            }

            // PASO 1: Inicializar interfaz - Solo mostrar botón de seleccionar archivo
            inicializarInterfaz();

            // PASO 2: Event listener para seleccionar archivo
            btnSeleccionarArchivo.addEventListener('click', async () => {
                try {
                    // Verificar si window.electronAPI.mercadoPago existe
                    if (!window.electronAPI || !window.electronAPI.mercadoPago) {
                        console.error('MercadoPago API no está disponible');
                        alert('Error: API de MercadoPago no disponible');
                        return;
                    }

                    const archivos = await window.electronAPI.mercadoPago.seleccionarArchivo();

                    if (archivos && archivos.length > 0) {
                        const archivoSeleccionado = archivos[0];

                        // Verificar que la ruta no esté vacía
                        if (!archivoSeleccionado || archivoSeleccionado.trim() === '') {
                            console.error('La ruta del archivo está vacía');
                            alert('Error: La ruta del archivo está vacía');
                            return;
                        }

                        // MOSTRAR PASO 2: Archivo seleccionado + botón procesar
                        rutaSeleccionadaInput.value = archivoSeleccionado;
                        mostrarPaso2_ArchivoSeleccionado();

                    } else {
                        alert('No se seleccionó ningún archivo');
                    }
                } catch (error) {
                    console.error('Error al seleccionar archivo:', error);
                    alert('Error al seleccionar archivo: ' + error.message);
                }
            });

            // PASO 3: Event listener para procesar archivo
            btnProcesarArchivo.addEventListener('click', async () => {
                const ruta = rutaSeleccionadaInput.value;

                if (!ruta || ruta.trim() === '') {
                    console.error('No hay archivo seleccionado o ruta vacía');
                    alert('No hay archivo seleccionado');
                    return;
                }

                try {
                    // Verificar APIs disponibles
                    if (!window.electronAPI?.mercadoPago?.procesarArchivo) {
                        console.error('Función procesarArchivo de MercadoPago no disponible');
                        alert('Error: Función de procesamiento no disponible');
                        return;
                    }

                    // Mostrar indicador de carga
                    btnProcesarArchivo.textContent = 'Procesando...';
                    btnProcesarArchivo.disabled = true;

                    const resultado = await window.electronAPI.mercadoPago.procesarArchivo(ruta);

                    if (resultado.success) {
                        // MOSTRAR PASO 3: Resultados + botones de autenticación
                        mostrarPaso3_ResultadosYAutenticacion(resultado);
                    } else {
                        console.error('Error en el procesamiento:', resultado.error);
                        mostrarError(resultado);
                    }

                } catch (error) {
                    console.error('Error al procesar archivo:', error);
                    alert('Error al procesar archivo: ' + error.message);
                } finally {
                    // Restaurar botón
                    btnProcesarArchivo.textContent = 'Procesar Archivo';
                    btnProcesarArchivo.disabled = false;
                }
            });

        }, 100); // Pequeña pausa de 100ms

    } catch (error) {
        console.error('Error en la inicialización de MercadoPago:', error);
    }
}

// ========================================
// FUNCIONES PARA MOSTRAR PASOS PROGRESIVAMENTE
// ========================================

function inicializarInterfaz() {

    // Ocultar todos los elementos excepto el botón de seleccionar archivo
    const elementosAOcultar = [
        'ruta-seleccionada-container',
        'btn-procesar-archivo',
        'resultados-container',
        'tablas-container',
        'hacerFactura',
        'botones-container'
    ];

    elementosAOcultar.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.classList.add('hidden');
        } else {
            console.warn(`Elemento ${id} no encontrado`);
        }
    });

    // Limpiar contenido de las tablas para que no muestren títulos vacíos
    limpiarTablas();
}

function mostrarPaso2_ArchivoSeleccionado() {

    // Mostrar la ruta seleccionada y el botón procesar
    const rutaContainer = document.getElementById('ruta-seleccionada-container');
    const btnProcesar = document.getElementById('btn-procesar-archivo');

    if (rutaContainer) {
        rutaContainer.classList.remove('hidden');
    }

    if (btnProcesar) {
        btnProcesar.classList.remove('hidden');
    }
}

function mostrarPaso3_ResultadosYAutenticacion(resultado) {

    // Mostrar resultados
    mostrarResultados(resultado);

    // Mostrar containers de resultados y tablas
    const resultadosContainer = document.getElementById('resultados-container');
    const tablasContainer = document.getElementById('tablas-container');

    if (resultadosContainer) {
        resultadosContainer.classList.remove('hidden');
    }

    if (tablasContainer) {
        tablasContainer.classList.remove('hidden');
    }

    // Mostrar botón "Hacer Factura" y preparar datos
    mostrarBotonHacerFactura(resultado);
}

function mostrarBotonHacerFactura(resultado) {

    const hacerFacturaContainer = document.getElementById('hacerFactura');
    if (!hacerFacturaContainer) {
        console.error('No se encontró el contenedor hacerFactura');
        return;
    }
    hacerFacturaContainer.classList.remove('hidden');
    hacerFacturaContainer.innerHTML = `
        <button id="btn-hacer-factura" class="btn-hacer-factura">
            Hacer Factura
        </button>
    `;
    let datosDiarios = [];
    resultado.datos.totalesDiarios.forEach(item => {
        item.totalFormateado = item.total.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        item.total = parseFloat(item.totalFormateado.replace(/\./g, '').replace(/,/g, '.'));
        datosDiarios.push({
            fecha: item.fecha.replace(/-/g, '/'),
            monto: item.total
        });
    });

    const btnHacerFactura = document.getElementById('btn-hacer-factura');
    if (btnHacerFactura) {
        btnHacerFactura.addEventListener('click', () => {
            const selectEmpresa = document.getElementById('selectEmpresaDisponibleMP');
            const empresaElegida = selectEmpresa ? selectEmpresa.value : '';

            const radioActividad = document.querySelector('input[name="ActividadMP"]:checked');
            const actividadElegida = radioActividad ? radioActividad.value : 'Servicio';

            const usuarioSeleccionado = window.usuarioSeleccionado || {};

            const fechaComprobanteInput = document.getElementById('fechaComprobanteMP');
            let fechaComprobante = '';
            if (fechaComprobanteInput && fechaComprobanteInput.value) {
                fechaComprobante = fechaComprobanteInput.value;
            }

            window.fechaComprobanteMP = fechaComprobante;

            const datosParaEnviar = {
                modulo: 'mercadopago',
                Actividad: actividadElegida,
                tipoContribuyente: usuarioSeleccionado.tipoContribuyente || 'C',
                datos: datosDiarios,
                fechaComprobante, 
                metodoIngreso: 'masivo',
                servicio: "factura",
                empresaElegida,
                usuario: usuarioSeleccionado
            };
            mercadoPagoFacturas(datosParaEnviar);
            mostrarPaso4_BotonesAutenticacion(datosDiarios);
        });
    }
}

function mostrarPaso4_BotonesAutenticacion(datosDiarios) {

    const botonesContainer = document.getElementById('botones-container');
    if (!botonesContainer) {
        console.error('No se encontró el contenedor botones-container');
        return;
    }

    botonesContainer.classList.remove('hidden');
    botonesContainer.innerHTML = `
        <div class="auth-options">
            <h3>Selecciona el modo de Ingreso:</h3>
            <button id="testButtonMP" class="btn-test">
                🧪 Abrir AFIP - Modo Test
            </button>
            <button id="loginButtonMP" class="btn-login">
                🔐 Abrir AFIP - Modo Producción
            </button>
            <div class="info-container">
                <p><strong>Modo Test:</strong> Para pruebas y desarrollo</p>
                <p><strong>Modo Producción:</strong> Para facturación real</p>
                <div class="success-message">
                    <p><strong>✅ Datos listos para facturación:</strong></p>
                    <p>${datosDiarios.length} registros procesados</p>
                </div>
            </div>
        </div>
    `;

    const authManager = new AuthManager();
    authManager.inicializar({
        loginButtonId: 'loginButtonMP',
        testButtonId: 'testButtonMP'
    });
}

// === NUEVO: Inicialización de usuario, empresa y actividad para MercadoPago ===
function inicializarUsuarioEmpresaActividadMP() {
    // Usuario activo
    const usuario = window.usuarioSeleccionado;
    const usuarioMP = document.getElementById('selectUsuariosMP');
    if (usuario && usuarioMP) {
        const nombreCapitalizado = usuario.nombre
            ? usuario.nombre.charAt(0).toUpperCase() + usuario.nombre.slice(1).toLowerCase()
            : 'Sin nombre';
        usuarioMP.textContent = nombreCapitalizado;
        usuarioMP.style.background = '#e9e9e9';
        usuarioMP.style.color = '#222';
        usuarioMP.style.padding = '4px 8px';
        usuarioMP.style.fontWeight = 'bold';
    }

    // Empresas disponibles
    const selectEmpresaMP = document.getElementById('selectEmpresaDisponibleMP');
    if (selectEmpresaMP && usuario) {
        selectEmpresaMP.innerHTML = '';
        const empresas = usuario.empresasDisponibles || [];
        if (empresas.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Sin empresas disponibles';
            selectEmpresaMP.appendChild(option);
            selectEmpresaMP.disabled = true;
            window.empresaElegidaMP = '';
        } else {
            empresas.forEach(empresa => {
                const option = document.createElement('option');
                option.value = typeof empresa === 'object' && empresa.nombre ? empresa.nombre : empresa;
                option.textContent = typeof empresa === 'object' && empresa.nombre ? empresa.nombre : empresa;
                selectEmpresaMP.appendChild(option);
            });
            selectEmpresaMP.disabled = empresas.length === 1;
            if (empresas.length === 1) {
                selectEmpresaMP.selectedIndex = 0;
                window.empresaElegidaMP = selectEmpresaMP.value;
            }
        }
        // Guardar la empresa elegida al cambiar
        selectEmpresaMP.addEventListener('change', () => {
            window.empresaElegidaMP = selectEmpresaMP.value;
        });
    }

    // Tipo de actividad
    const actividadRadios = document.querySelectorAll('input[name="ActividadMP"]');
    window.actividadElegidaMP = null;
    actividadRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                window.actividadElegidaMP = radio.value;
            }
        });
    });
    // Si hay uno seleccionado por defecto
    const checkedRadio = Array.from(actividadRadios).find(r => r.checked);
    if (checkedRadio) {
        window.actividadElegidaMP = checkedRadio.value;
    }
}

// Llama a la función al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    inicializarUsuarioEmpresaActividadMP();
    // Inicializar flatpickr para fechaComprobanteMP
    const fechaComprobanteMP = document.getElementById('fechaComprobanteMP');
    if (fechaComprobanteMP && typeof flatpickr !== 'undefined') {
        flatpickr(fechaComprobanteMP, {
            mode: "single",
            dateFormat: "d/m/Y"
        });
    }
});

// Asegura que la inicialización se ejecute también después de cargar el HTML dinámicamente
window.configurarUsuarioMercadoPago = inicializarUsuarioEmpresaActividadMP;

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function limpiarTablas() {
    // Limpiar el contenido de las tablas para que no muestren títulos vacíos
    const tablaFechas = document.querySelector('.table-box:first-child');
    const tablaMontos = document.querySelector('.table-box:last-child');

    if (tablaFechas) {
        tablaFechas.innerHTML = '';
    }

    if (tablaMontos) {
        tablaMontos.innerHTML = '';
    }

    // Remover event listeners existentes si los hay
    const botonesExpandirExistentes = document.querySelectorAll('.btn-expandir');
    botonesExpandirExistentes.forEach(boton => {
        boton.removeEventListener('click', configurarBotonesExpandirTablas);
    });
}

function mostrarError(resultado) {
    const resultadosContainer = document.getElementById('resultados-container');
    if (resultadosContainer) {
        resultadosContainer.classList.remove('hidden');

        const resultBox = document.querySelector('.result-box');
        if (resultBox) {
            resultBox.innerHTML = `
                <div class="error-message">
                    <h4>Error al procesar el archivo</h4>
                    <p><strong>Mensaje:</strong> ${resultado.error?.message || 'Error desconocido'}</p>
                    <p><strong>Archivo:</strong> ${resultado.archivo}</p>
                </div>
            `;
        }
    }
}

function mostrarResultados(resultado) {
    console.log("Resultado completo:", resultado);

    const resultBox = document.querySelector('.result-box');
    if (!resultBox) {
        console.error('No se encontró .result-box');
        return;
    }

    if (!resultado.success) {
        mostrarError(resultado);
        return;
    }

    // Mostrar resultados exitosos
    const datos = resultado.datos;
    const estadisticas = resultado.estadisticas;

    resultBox.innerHTML = `
        <div class="resultado-exitoso">
            <h4>✅ Archivo procesado exitosamente</h4>
            <div class="info-basica">
                <p><strong>Archivo:</strong> ${resultado.archivo}</p>
                <p><strong>Procesado:</strong> ${new Date(resultado.procesadoEn).toLocaleString('es-AR')}</p>
            </div>
            
            <div class="resumen-general">
                <h5>📊 Resumen General</h5>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <span class="label">Empresa Elegida:</span>
                        <span class="value">${window.empresaElegidaMP || ''}</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Fecha de Comprobante:</span>
                        <span class="value">${window.fechaComprobanteMP.value || ''}</span>
                    </div>
                    <br>
                    <div class="resumen-item">
                        <span class="label">Total Transferencias:</span>
                        <span class="value">${datos.resumenGeneral.transferenciasRecibidas.totalFormateado}</span>
                        <span class="count">(${datos.resumenGeneral.transferenciasRecibidas.cantidad} transferencias)</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Total Transferencias Recibidas:</span>
                        <span class="value">${datos.resumenGeneral.transferenciasRecibidas.totalFormateado}</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Total Liquidaciones:</span>
                        <span class="value">${datos.resumenGeneral.liquidaciones.totalFormateado}</span>
                    </div>
                    <div class="resumen-item">
                        <span class="label">Total Rendimientos:</span>
                        <span class="value">${datos.resumenGeneral.rendimientos.totalFormateado}</span>
                    </div>
                    <div class="resumen-item total-general">
                        <span class="label">💰 TOTAL GENERAL:</span>
                        <span class="value-big">${datos.resumenGeneral.totalGeneral.totalFormateado}</span>
                    </div>
                </div>
            </div>
            <div class="estadisticas">
                <h5>📈 Estadísticas</h5>
                <p><strong>Período:</strong> ${estadisticas.rangoFechas.desde} a ${estadisticas.rangoFechas.hasta}</p>
                <p><strong>Total días:</strong> ${estadisticas.totalDias} | <strong>Total meses:</strong> ${estadisticas.totalMeses}</p>
            </div>
        </div>
    `;

    // Actualizar las tablas
    mostrarTablas(datos);
}