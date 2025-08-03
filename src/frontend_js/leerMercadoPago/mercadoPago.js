import { mercadoPagoFacturas } from '../facturas/facturas.js';
import { AuthManager, realizarLoginNormal, realizarLoginTest, obtenerCredencialesAfip } from '../autenticacion/auth.js';

function mostrarTablas(datos) {
    // Actualizar tabla de fechas (totales diarios)
    const tablaFechas = document.querySelector('.table-box:first-child');
    if (tablaFechas) {
        let htmlFechas = '<h3 class="table-title">📅 Totales por Día</h3>';
        htmlFechas += '<div class="tabla-scroll">';
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
        let htmlMontos = '<h3 class="table-title">📈 Totales por Mes</h3>';
        htmlMontos += '<div class="tabla-scroll">';
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
}

// Función adicional para mostrar detalles de transferencias si es necesario
function mostrarDetalleTransferencias(transferencias) {
    console.log('Transferencias detalladas:', transferencias);
    // Esta función se puede expandir para mostrar una tabla detallada de todas las transferencias
}

initializeMercadoPago();

function initializeMercadoPago() {
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

            inicializarInterfaz();

            // Event listener para seleccionar archivo
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

                        rutaSeleccionadaInput.value = archivoSeleccionado;
                        rutaSeleccionadaContainer.classList.remove('hidden');
                        btnProcesarArchivo.classList.remove('hidden');
                    } else {
                        alert('No se seleccionó ningún archivo');
                    }
                } catch (error) {
                    console.error('Error al seleccionar archivo:', error);
                    alert('Error al seleccionar archivo: ' + error.message);
                }
            });

            btnProcesarArchivo.addEventListener('click', async () => {
                const ruta = rutaSeleccionadaInput.value;

                const todosLosInputs = document.querySelectorAll('input');
                todosLosInputs.forEach((input, index) => {
                    // console.log(`Input ${index}:`, input.id, 'valor:', input.value);
                });

                if (!ruta || ruta.trim() === '') {
                    console.error('No hay archivo seleccionado o ruta vacía');
                    alert('No hay archivo seleccionado');
                    console.log('=== FIN PROCESAR ARCHIVO (ERROR RUTA) ===');
                    return;
                }

                try {

                    // Verificar si existe la función de procesamiento
                    if (!window.electronAPI) {
                        console.error('electronAPI no disponible');
                        alert('Error: electronAPI no disponible');
                        return;
                    }

                    if (!window.electronAPI.mercadoPago) {
                        console.error('electronAPI.mercadoPago no disponible');
                        alert('Error: mercadoPago API no disponible');
                        return;
                    }

                    if (!window.electronAPI.mercadoPago.procesarArchivo) {
                        console.error('Función procesarArchivo de MercadoPago no disponible');
                        alert('Error: Función de procesamiento no disponible');
                        return;
                    }

                    // Mostrar indicador de carga
                    btnProcesarArchivo.textContent = 'Procesando...';
                    btnProcesarArchivo.disabled = true;

                    const resultado = await window.electronAPI.mercadoPago.procesarArchivo(ruta);

                    if (resultado.success) {
                        mostrarResultados(resultado);
                        resultadosContainer.classList.remove('hidden');
                        tablasContainer.classList.remove('hidden');
                    } else {
                        console.error('Error en el procesamiento:', resultado.error);
                        mostrarResultados(resultado); // Mostrar el error
                        resultadosContainer.classList.remove('hidden');
                    }

                } catch (error) {
                    console.error('Error al procesar archivo:', error);
                    alert('Error al procesar archivo: ' + error.message);
                } finally {
                    // Restaurar botón
                    btnProcesarArchivo.textContent = 'btn procesar archivo';
                    btnProcesarArchivo.disabled = false;
                }
            });

        }, 100); // Pequeña pausa de 100ms

    } catch (error) {
        console.error('Error en la inicialización de MercadoPago:', error);
    }
}

function inicializarInterfaz() {

    const elementos = [
        'ruta-seleccionada-container',
        'btn-procesar-archivo',
        'resultados-container',
        'tablas-container'
    ];

    elementos.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.classList.add('hidden');
            console.log(`Elemento ${id} ocultado`);
        } else {
            console.warn(`Elemento ${id} no encontrado`);
        }
    });
}

function mostrarResultados(resultado) {

    const resultBox = document.querySelector('.result-box');
    if (!resultBox) {
        console.error('No se encontró .result-box');
        return;
    }

    if (!resultado.success) {
        resultBox.innerHTML = `
            <div class="error-message">
                <h4>Error al procesar el archivo</h4>
                <p><strong>Mensaje:</strong> ${resultado.error?.message || 'Error desconocido'}</p>
                <p><strong>Archivo:</strong> ${resultado.archivo}</p>
            </div>
        `;
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
                        <span class="label">Total Transferencias:</span>
                        <span class="value">${datos.resumenGeneral.transferenciasRecibidas.totalFormateado}</span>
                        <span class="count">(${datos.resumenGeneral.transferenciasRecibidas.cantidad} transferencias)</span>
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
    // ========================================
    // PASO 1: CREAR BOTÓN INICIAL "HACER FACTURA"
    // ========================================
    const hacerFacturaContainer = document.getElementById('hacerFactura');
    if (!hacerFacturaContainer) {
        console.error('No se encontró el contenedor hacerFactura');
        return;
    }

    hacerFacturaContainer.innerHTML = `
        <button id="btn-hacer-factura" class="btn-hacer-factura">
            Hacer Factura
        </button>
    `;

    // ========================================
    // PASO 2: PROCESAR DATOS DE MERCADOPAGO
    // ========================================
    let datosDiarios = [];
    
    resultado.datos.totalesDiarios.forEach(item => {
        // Formatear el total a dos decimales
        item.totalFormateado = item.total.toLocaleString('es-AR', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        
        // Convertir el total a un número para evitar problemas de formato
        item.total = parseFloat(item.totalFormateado.replace(/\./g, '').replace(/,/g, '.'));
        
        // Agregar datos diarios para enviar a la factura
        datosDiarios.push({
            fecha: item.fecha.replace(/-/g, '/'),
            monto: item.total
        });
    });

    const datosParaEnviar = {
        modulo: 'mercadopago',
        Actividad: 'Producto',
        tipoContribuyente: 'C',
        datos: datosDiarios,
        fechaComprobante: "02/08/2025",
        metodoIngreso: 'masivo',
        servicio: "factura",
        tipoContribuyente: "C"
    };

    // ========================================
    // PASO 3: CONFIGURAR EVENTO DEL BOTÓN PRINCIPAL
    // ========================================
    const btnHacerFactura = document.getElementById('btn-hacer-factura');
    if (btnHacerFactura) {
        btnHacerFactura.addEventListener('click', () => {
            // Llamar a la función que procesa los datos
            mercadoPagoFacturas(datosParaEnviar);
            
            // Mostrar opciones de autenticación
            mostrarOpcionesAutenticacion();
        });
    } else {
        console.error('No se pudo crear el botón Hacer Factura');
    }

    // ========================================
    // FUNCIÓN PARA MOSTRAR OPCIONES DE AUTENTICACIÓN
    // ========================================
    function mostrarOpcionesAutenticacion() {
        const botonesContainer = document.getElementById('botones-container');
        if (!botonesContainer) {
            console.error('No se encontró el contenedor botones-container');
            return;
        }

        // Crear los botones de autenticación
        botonesContainer.innerHTML = `
            <div class="auth-options">
                <h3>Selecciona el modo de autenticación:</h3>
                <button id="testButtonMP" class="btn-test">
                    🧪 Abrir AFIP en Modo Test
                </button>
                <button id="loginButtonMP" class="btn-login">
                    🔐 Abrir AFIP Hacer Facturas
                </button>
                <div class="info-container">
                    <p><strong>Modo Test:</strong> Para pruebas y desarrollo</p>
                    <p><strong>Modo Producción:</strong> Para facturación real</p>
                </div>
            </div>
        `;

        // ========================================
        // CONFIGURAR AUTENTICACIÓN CON AuthManager
        // ========================================
        const authManager = new AuthManager();
        
        // Configurar con los IDs específicos de MercadoPago
        authManager.inicializar({
            loginButtonId: 'loginButtonMP',
            testButtonId: 'testButtonMP'
        });

        // ========================================
        // EVENTOS ADICIONALES (OPCIONAL)
        // ========================================
        const btnTest = document.getElementById('testButtonMP');
        const btnLogin = document.getElementById('loginButtonMP');

        // Mostrar mensaje de confirmación
        mostrarMensajeConfirmacion(datosDiarios.length);
    }

    // ========================================
    // FUNCIONES AUXILIARES
    // ========================================
    function mostrarMensajeConfirmacion(cantidadRegistros) {
        const mensaje = `
            ✅ Datos procesados correctamente:
            • ${cantidadRegistros} registros diarios
            • Módulo: MercadoPago
            • Método: Ingreso masivo
            
            Selecciona el modo de autenticación para continuar.
        `;
        
        // Opcional: mostrar en la UI
        const infoDiv = document.querySelector('.info-container');
        if (infoDiv) {
            infoDiv.innerHTML += `
                <div class="success-message">
                    <p><strong>✅ Datos listos para facturación:</strong></p>
                    <p>${cantidadRegistros} registros procesados</p>
                </div>
            `;
        }
    }

    // Actualizar las tablas (tu función existente)
    // mostrarTablas(datos);
}

// ========================================
// ESTILOS CSS SUGERIDOS (OPCIONAL)
// // ========================================
// const estilosCSS = `
// <style>
// .auth-options {
//     padding: 20px;
//     border: 1px solid #ddd;
//     border-radius: 8px;
//     margin: 20px 0;
//     background-color: #f9f9f9;
// }

// .auth-options h3 {
//     margin-top: 0;
//     color: #333;
// }

// .btn-test {
//     background-color: #ffc107;
//     color: #000;
//     border: none;
//     padding: 12px 24px;
//     margin: 8px;
//     border-radius: 6px;
//     cursor: pointer;
//     font-weight: bold;
// }

// .btn-login {
//     background-color: #28a745;
//     color: white;
//     border: none;
//     padding: 12px 24px;
//     margin: 8px;
//     border-radius: 6px;
//     cursor: pointer;
//     font-weight: bold;
// }

// .btn-hacer-factura {
//     background-color: #007bff;
//     color: white;
//     border: none;
//     padding: 15px 30px;
//     border-radius: 8px;
//     cursor: pointer;
//     font-size: 16px;
//     font-weight: bold;
// }

// .info-container {
//     margin-top: 15px;
//     padding: 10px;
//     background-color: #e9ecef;
//     border-radius: 4px;
// }

// .success-message {
//     background-color: #d4edda;
//     border: 1px solid #c3e6cb;
//     color: #155724;
//     padding: 10px;
//     border-radius: 4px;
//     margin-top: 10px;
// }

// .btn-test:hover, .btn-login:hover, .btn-hacer-factura:hover {
//     opacity: 0.9;
//     transform: translateY(-1px);
// }
// </style>
// `;

// // Si quieres inyectar los estilos automáticamente
// export function inyectarEstilos() {
//     if (!document.getElementById('mercadopago-styles')) {
//         const styleElement = document.createElement('style');
//         styleElement.id = 'mercadopago-styles';
//         styleElement.innerHTML = estilosCSS.replace('<style>', '').replace('</style>', '');
//         document.head.appendChild(styleElement);
//     }
// }