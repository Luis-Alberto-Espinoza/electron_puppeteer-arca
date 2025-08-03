// Importa el módulo de autenticación
import { AuthManager } from '../autenticacion/auth.js';

// Exporta una función que inicializa todo
export function inicializarFacturas() {
    // === Referencias generales ===
    const selectMes = document.getElementById('selectMes');
    const selectAnio = document.getElementById('selectAnio');
    const periodoManual = document.getElementById('periodoManual');
    const fechasFacturas = document.getElementById('fechasFacturas');
    const calendarioDiv = document.getElementById('calendario');
    const datepicker = document.getElementById('datepicker');
    const montoManualRadio = document.getElementById('montoManual');
    const montoTotalRadio = document.getElementById('montoTotal');
    const textareaContainer = document.getElementById('textareaContainer');
    const inputContainerTotal = document.getElementById('inputContainerTotal');
    const inputMontoTotal = document.getElementById('montoTotalInput');
    const ingresoManual = document.getElementById('ingresoManual');
    const ingresoMasivo = document.getElementById('ingresoMasivo');
    const seccionManual = document.getElementById('seccionManual');
    const seccionMasiva = document.getElementById('seccionMasiva');
    let flatpickrInstance;

    // === Inicialización de Flatpickr ===
    if (datepicker) {
        flatpickrInstance = flatpickr(datepicker, {
            mode: "multiple",
            dateFormat: "Y-m-d",
            onChange: function (selectedDates) {
                fechasFacturas.value = selectedDates.map(date => date.toISOString().split('T')[0]).join(', ');
            }
        });
    } else {
        console.error('El elemento con ID "datepicker" no existe.');
    }

    // Mostrar/ocultar secciones según el método de ingreso seleccionado
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

    // Función para actualizar la vista inicial del calendario
    function actualizarCalendario() {
        const mes = selectMes.value;
        const anio = selectAnio.value;

        if (mes && anio && flatpickrInstance) {
            // Establecer la fecha inicial del calendario
            const nuevaFecha = new Date(anio, mes - 1, 1);
            flatpickrInstance.setDate(nuevaFecha, false);
            flatpickrInstance.jumpToDate(nuevaFecha);
        }
    }

    // Listeners para los selects de mes y año
    if (selectMes && selectAnio) {
        selectMes.addEventListener('change', actualizarCalendario);
        selectAnio.addEventListener('change', actualizarCalendario);
        if (flatpickrInstance) actualizarCalendario();
    }

    // === Manejo del Período Manual ===
    if (periodoManual) {
        periodoManual.addEventListener('change', () => {
            const isChecked = periodoManual.checked;
            calendarioDiv.style.display = isChecked ? 'block' : 'none';
            fechasFacturas.style.display = isChecked ? 'block' : 'none';
        });
    }

    // === Manejo de los Montos ===
    function handleMontoChange() {
        if (montoManualRadio.checked) {
            textareaContainer.style.display = 'block';
            inputContainerTotal.style.display = 'none';
            inputMontoTotal.value = '';
        } else if (montoTotalRadio.checked) {
            textareaContainer.style.display = 'none';
            inputContainerTotal.style.display = 'block';
            document.getElementById('textareaMontoManual').value = '';
        }
    }

    if (montoManualRadio && montoTotalRadio) {
        montoManualRadio.addEventListener('change', handleMontoChange);
        montoTotalRadio.addEventListener('change', handleMontoChange);
        handleMontoChange();
    }

    // ========================================
    // INICIALIZACIÓN DE AUTENTICACIÓN
    // ========================================
    const authManager = new AuthManager();
    authManager.inicializar();

    // Retorna una referencia al authManager por si necesitas acceder a él desde fuera
    return {
        authManager,
        flatpickrInstance
    };
}