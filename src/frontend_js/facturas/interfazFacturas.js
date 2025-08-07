import { procesarDatosTextareas } from './procesarDatosMasivos.js';
import { realizarAccionFacturacion, procesarFormularioFactura } from './facturas.js';
import { pStorage } from './paraStorage.js';
import { inicializarFacturas } from './index_01.js';


let datosMasivos = [];
let datosValidados = false;
let flatpickrInstance;
let flatpickrFechaComprobante; // Para la fecha del comprobante
let flatpickrDatepicker;       // Para la selección múltiple de fechas

export function inicializarInterfazFacturas() {
    const facturasForm = document.getElementById('facturasForm');
    const fechaComprobante = document.getElementById('fechaComprobante');
    const datepicker = document.getElementById('datepicker');
    const selectMes = document.getElementById('selectMes');
    const selectAnio = document.getElementById('selectAnio');
    const periodoManual = document.getElementById('periodoManual');
    const fechasFacturas = document.getElementById('fechasFacturas');
    const calendarioDiv = document.getElementById('calendario');
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

    const radioSeleccionado = document.querySelector('input[name="periodoFacturacion"]:checked');

    if (!facturasBtn || !facturasDiv) { // <-- ¡Verificación importante!
        console.error("No se encontraron los elementos facturasBtn o facturasDiv");
        return; // Sale de la función si no existen los elementos
    }
    inicializarFacturas();
    facturasDiv.style.display = 'none'; // Inicialmente oculto

    facturasBtn.addEventListener('click', () => {
        const isVisible = facturasDiv.style.display === 'block';
        facturasDiv.style.display = isVisible ? 'none' : 'block';
        realizarAccionFacturacion(); //Ejecutar la logica de facturacion cuando se muestra el div de facturas
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

    // Inicializar flatpickr para datepicker (selección múltiple)
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

    if (periodoManual) {
        periodoManual.addEventListener('change', () => {
            const isChecked = periodoManual.checked;
            calendarioDiv.style.display = isChecked ? 'block' : 'none';
            fechasFacturas.style.display = isChecked ? 'block' : 'none';
        });
    }

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
    });

    window.electronAPI.onCodigoLocalStorageGenerado((codigo) => {
        const codigoLocalStorageTextArea = document.getElementById('codigoLocalStorage');

        if (!codigoLocalStorageTextArea) {
            console.error("No se encontró el elemento con ID 'codigoLocalStorage'");
            alert("Error al mostrar el código. Asegúrate de que exista el textarea en el HTML."); //Mensaje de error mas descriptivo.
            return;
        }
        codigo = pStorage(codigo); // <-- Llama a la    función pStorage    
        codigoLocalStorageTextArea.value = codigo; // Asigna el código al textarea

        //Para que el textarea sea visible
        codigoLocalStorageTextArea.style.display = 'block';

        // Opcional: Copiar al portapapeles (como en la respuesta anterior)
        const copiarCodigoBtn = document.getElementById('copiarCodigo');
        if (copiarCodigoBtn) {
            copiarCodigoBtn.addEventListener('click', () => {
                codigoLocalStorageTextArea.select();
                document.execCommand('copy');
                alert("Código copiado al portapapeles.");
            });
        } else {
            console.error("No se encontró el botón con ID 'copiarCodigo'");
        }
    });
}