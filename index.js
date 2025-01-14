// Refactorizando el JavaScript para consolidar y organizar el código

document.addEventListener('DOMContentLoaded', function () {
    // === Referencias generales ===
    const facturasBtn = document.getElementById('facturasBtn');
    const recibosBtn = document.getElementById('recibosBtn');
    const facturasDiv = document.getElementById('facturasDiv');
    const recibosDiv = document.getElementById('recibosDiv');
    const facturasForm = document.getElementById('facturasForm');

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

    // === Inicialización de Flatpickr ===
    if (datepicker) {
        flatpickr(datepicker, {
            mode: "multiple",
            dateFormat: "Y-m-d",
            onChange: function (selectedDates) {
                fechasFacturas.value = selectedDates.map(date => date.toISOString().split('T')[0]).join(', ');
            }
        });
    } else {
        console.error('El elemento con ID "datepicker" no existe.');
    }

    // === Mostrar/Ocultar Formularios ===
    if (facturasBtn && recibosBtn) {
        facturasDiv.style.display = 'none';
        recibosDiv.style.display = 'none';

        facturasBtn.addEventListener('click', () => {
            const isVisible = facturasDiv.style.display === 'block';
            facturasDiv.style.display = isVisible ? 'none' : 'block';
            recibosDiv.style.display = 'none';
        });

        recibosBtn.addEventListener('click', () => {
            const isVisible = recibosDiv.style.display === 'block';
            recibosDiv.style.display = isVisible ? 'none' : 'block';
            facturasDiv.style.display = 'none';
        });
    }

    // === Manejo del Formulario de Facturas ===
    if (facturasForm) {
        facturasForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const formData = new FormData(facturasForm);
            const data = Object.fromEntries(formData.entries());
            let errores = [];

            // Validaciones
            if (!data.tipoContribuyente) errores.push("Debe seleccionar un tipo de contribuyente.");
            if (!data.Actividad) errores.push("Debe seleccionar un tipo de Actividad.");
            if (!data.mes) errores.push("Debe seleccionar un mes.");
            if (!data.anio) errores.push("Debe seleccionar un año.");

            if (data.periodoFacturacion === 'manual' && !data.fechasFacturas) {
                errores.push("Debe ingresar las fechas de facturación.");
            }

            if (!data.tipoMonto) {
                errores.push("Debe seleccionar un tipo de monto.");
            } else if (data.tipoMonto === 'montoTotal' && !data.montoTotalInput) {
                errores.push("Debe ingresar un monto total.");
            } else if (data.tipoMonto === 'montoManual' && !data.montoManual) {
                errores.push("Debe ingresar montos manuales.");
            }

            if (errores.length > 0) {
                alert(errores.join('\n'));
                return;
            }

            // Limpieza de datos
            if (data.periodoFacturacion !== 'manual') delete data.fechasFacturas;
            if (data.tipoMonto !== 'montoManual') delete data.montoManual;
            if (data.tipoMonto !== 'montoTotal') delete data.montoTotalInput;

            console.log("Datos del formulario (validados y limpios):", data);
            window.electronAPI.sendFormData(data);
        });
    }

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

    // Función para actualizar la vista inicial del calendario
    function actualizarCalendario() {
        const mes = selectMes.value; // Valor del mes seleccionado (1-12)
        const anio = selectAnio.value; // Valor del año seleccionado

        if (mes && anio) {
            // Establecer la fecha inicial del calendario
            const nuevaFecha = new Date(anio, mes - 1, 1); // Año, Mes (0-11), Día
            flatpickrInstance.setDate(nuevaFecha, false); // Actualiza la fecha sin disparar eventos
            flatpickrInstance.jumpToDate(nuevaFecha); // Cambia la vista inicial
        }
    }

    // Listeners para los selects de mes y año
    if (selectMes && selectAnio) {
        selectMes.addEventListener('change', actualizarCalendario);
        selectAnio.addEventListener('change', actualizarCalendario);
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
        handleMontoChange(); // Inicializa el estado
    }
});
