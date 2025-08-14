import { procesarDatosTextareas } from './procesarDatosMasivos.js';
import { procesarFormularioFactura } from './facturas.js'; // Removida la importación de realizarAccionFacturacion
import { implementarSeguro } from './paraStorage.js';
import { inicializarFacturas } from './index_01.js';


let datosMasivos = [];
let datosValidados = false;
let flatpickrFechaComprobante; // Para la fecha del comprobante
let flatpickrDatepicker;       // Para la selección múltiple de fechas

export async function inicializarInterfazFacturas() {
    const facturasDiv = document.getElementById('facturasDiv');
    const facturasBtn = document.getElementById('facturasBtn');

    if (!facturasBtn || !facturasDiv) {
        console.error("No se encontraron los elementos facturasBtn o facturasDiv");
        return;
    }

    // 1. Cargar el componente de facturas.html en facturasDiv primero
    try {
        const response = await fetch('../facturas/factura.html');
        const html = await response.text();
        facturasDiv.innerHTML = html;
    } catch (err) {
        console.error('Error al cargar facturas.html:', err);
        return;
    }

    // 2. Ahora busca los elementos dentro de facturasDiv
    const fechaComprobante = document.getElementById('fechaComprobante');
    const datepicker = document.getElementById('datepicker');
    const selectMes = document.getElementById('selectMes');
    const selectAnio = document.getElementById('selectAnio');
    const periodoManual = document.getElementById('periodoManual');
    const montoManualRadio = document.getElementById('montoManual');
    const montoTotalRadio = document.getElementById('montoTotal');
    const textareaContainer = document.getElementById('textareaContainer');
    const inputContainerTotal = document.getElementById('inputContainerTotal');
    const procesarDatosBtn = document.getElementById('procesarDatos');
    const textareaFechas = document.getElementById('textareaFechas');
    const textareaMontos = document.getElementById('textareaMontos');
    const tablaDatosProcesados = document.getElementById('tablaDatosProcesados');
    const resultadoProcesamiento = document.getElementById('resultadoProcesamiento');
    const ingresoManual = document.getElementById('ingresoManual');
    const ingresoMasivo = document.getElementById('ingresoMasivo');
    const seccionManual = document.getElementById('seccionManual');
    const seccionMasiva = document.getElementById('seccionMasiva');
    const periodoTotal = document.getElementById('periodoTotal');
    const periodoDiasHabiles = document.getElementById('periodoDiasHabiles');
    const calendario = document.getElementById('calendario');
    const fechasText = document.getElementById('fechasFacturas');
    const facturasForm = document.getElementById('facturasForm');

    inicializarFacturas();
    facturasDiv.style.display = 'none'; // Inicialmente oculto

    facturasBtn.addEventListener('click', () => {
        const isVisible = facturasDiv.style.display === 'block';
        facturasDiv.style.display = isVisible ? 'none' : 'block';
        //realizarAccionFacturacion();
    });

    // === Generar Selects de Meses y Años ===
    if (selectMes && selectAnio) {
        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        meses.forEach((mes, index) => {
            const option = document.createElement('option');
            option.value = index + 1;
            option.textContent = mes;
            selectMes.appendChild(option);
        });

        const anioActual = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const option = document.createElement('option');
            option.value = anioActual + i;
            option.textContent = anioActual + i;
            selectAnio.appendChild(option);
        }
    }

    // Inicializar flatpickr para fechaComprobante
    if (fechaComprobante) {
        flatpickrFechaComprobante = flatpickr(fechaComprobante, {
            mode: "single",
            dateFormat: "d/m/Y",
            onChange: function (selectedDates) {
                if (selectedDates.length > 0) {
                    const date = selectedDates[0];
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    fechaComprobante.value = `${day}/${month}/${year}`;
                }
            }
        });
    } else {
        console.error('El elemento con ID "fechaComprobante" no existe.');
    }

    if (datepicker) {
        flatpickrDatepicker = flatpickr(datepicker, {
            mode: "multiple",
            dateFormat: "d/m/Y",
            onChange: function (selectedDates) {
                const fechasFacturas = document.getElementById('fechasFacturas');
                if (fechasFacturas) {
                    fechasFacturas.value = selectedDates.map(date => {
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        return `${day}/${month}/${year}`;
                    }).join(', ');
                }
            }
        });
    }

    // Función para actualizar solo el calendario de selección múltiple
    function actualizarCalendario() {
        const mes = selectMes.value;
        const anio = selectAnio.value;

        if (mes && anio && flatpickrDatepicker) {
            const nuevaFecha = new Date(anio, mes - 1, 1);
            flatpickrDatepicker.setDate([], false);  // Limpiar fechas seleccionadas
            flatpickrDatepicker.jumpToDate(nuevaFecha);
        }
    }

    // Event listeners para los selectores de mes y año
    if (selectMes) selectMes.addEventListener('change', actualizarCalendario);
    if (selectAnio) selectAnio.addEventListener('change', actualizarCalendario);

    // 2. Función para mostrar/ocultar según selección
    function actualizarVista() {
        if (periodoManual.checked) {
            // Mostrar elementos de ingreso manual
            datepicker.style.display = 'block';
            calendario.style.display = 'block';
            fechasText.style.display = 'block';
        } else {
            // Ocultar elementos de ingreso manual
            datepicker.style.display = 'none';
            fechasText.style.display = 'none';
            calendario.style.display = 'none';
        }
    }

    // 3. Escuchar cambios en todos los radios
    periodoTotal.addEventListener('change', actualizarVista);
    periodoDiasHabiles.addEventListener('change', actualizarVista);
    periodoManual.addEventListener('change', actualizarVista);

    // 4. Inicializar estado al cargar
    actualizarVista();


    function handleMontoChange() {
        if (montoManualRadio.checked) {
            textareaContainer.style.display = 'block';
            inputContainerTotal.style.display = 'none';
        } else if (montoTotalRadio.checked) {
            textareaContainer.style.display = 'none';
            inputContainerTotal.style.display = 'block';
        }
    }

    if (montoManualRadio && montoTotalRadio) {
        montoManualRadio.addEventListener('change', handleMontoChange);
        montoTotalRadio.addEventListener('change', handleMontoChange);
        handleMontoChange();
    }
    //Manejo de ingreso masivo y manual
    function actualizarMetodoIngreso() {
        if (ingresoManual.checked) {
            seccionManual.style.display = 'block';
            seccionMasiva.style.display = 'none';
        } else if (ingresoMasivo.checked) {
            seccionManual.style.display = 'none';
            seccionMasiva.style.display = 'block';
        }
    }

    ingresoManual.addEventListener('change', actualizarMetodoIngreso);
    ingresoMasivo.addEventListener('change', actualizarMetodoIngreso);

    procesarDatosBtn.addEventListener('click', () => {
        event.preventDefault();
        const resultado = procesarDatosTextareas(textareaFechas, textareaMontos);
        if (resultado.errores.length > 0) {
            alert(resultado.errores.join('\n'));
            return;
        }

        datosMasivos = resultado.datos;
        datosValidados = true;
        tablaDatosProcesados.innerHTML = datosMasivos.map(({ fecha, monto }) => `<tr><td>${fecha}</td><td>${monto}</td></tr>`).join('');
        resultadoProcesamiento.style.display = 'block';
    });
    facturasForm.addEventListener('submit', (event) => {
        procesarFormularioFactura(event, facturasForm, datosMasivos, datosValidados); // Llama a la función

        // Mostrar el botón "Hacer Factura" al procesar el formulario
        const hacerFacturaDiv = document.getElementById('hacerFacturaFacturas');
        const botonesPuppeteer = document.getElementById('botones-puppeteer');
        if (hacerFacturaDiv) hacerFacturaDiv.classList.remove('hidden');
        // Ocultar los botones de puppeteer hasta que se haga click en "Hacer Factura"
        if (botonesPuppeteer) botonesPuppeteer.classList.add('hidden');
    });

    // Mostrar los botones de puppeteer al hacer click en "Hacer Factura"
    const habilitarBtnAFIP = document.getElementById('habilitarBtnAFIP');
    if (habilitarBtnAFIP) {
        habilitarBtnAFIP.addEventListener('click', () => {
            const botonesPuppeteer = document.getElementById('botones-puppeteer');
            if (botonesPuppeteer) {
                botonesPuppeteer.classList.remove('hidden');
            }
        });
    }

    // Ocultar "Hacer Factura" y "botones-puppeteer" al abrir el módulo
    const hacerFacturaDiv = document.getElementById('hacerFacturaFacturas');
    const botonesPuppeteer = document.getElementById('botones-puppeteer');
    if (hacerFacturaDiv) hacerFacturaDiv.classList.add('hidden');
    if (botonesPuppeteer) botonesPuppeteer.classList.add('hidden');

    window.electronAPI.onCodigoLocalStorageGenerado((codigo) => {
        implementarSeguro('respuesta', codigo);
        configurarBotonesExpandirTablas(); 
    });

    // Llama a configurarUsuarioEnFacturas después de cargar el HTML y de inicializar los elementos
    configurarUsuarioEnFacturas();
}

function configurarUsuarioEnFacturas() {
    const selectUsuariosFacturas = document.getElementById('selectUsuarios');
    const usuarioSeleccionado = window.usuarioSeleccionado;
    if (selectUsuariosFacturas && usuarioSeleccionado) {
        const nombreCapitalizado = usuarioSeleccionado.nombre
            ? usuarioSeleccionado.nombre.charAt(0).toUpperCase() + usuarioSeleccionado.nombre.slice(1).toLowerCase()
            : 'Sin nombre';
        selectUsuariosFacturas.textContent = nombreCapitalizado;
        selectUsuariosFacturas.style.background = '#e9e9e9';
        selectUsuariosFacturas.style.color = '#222';
        selectUsuariosFacturas.style.padding = '4px 8px';
        selectUsuariosFacturas.style.fontWeight = 'bold';
    }
}

function configurarBotonesExpandirTablas() {
    const botonesExpandir = document.querySelectorAll('.btn-expandir');
    botonesExpandir.forEach(boton => {
        boton.addEventListener('click', function() {
            const tipoTabla = this.getAttribute('data-tabla');
            const tablaContent = document.getElementById(`tabla-${tipoTabla}-content`);
            const textoExpandir = this.querySelector('.texto-expandir');
            const iconoExpandir = this.querySelector('.icono-expandir');
            
            if (!tablaContent) {
                console.warn(`No se encontró el elemento con id tabla-${tipoTabla}-content`);
                return;
            }
            
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