
document.addEventListener('DOMContentLoaded', function () {
    // === Referencias generales ===
   
    const facturasForm = document.getElementById('facturasForm');

    const selectMes = document.getElementById('selectMes');
    const selectAnio = document.getElementById('selectAnio');
    
    const periodoTotal = document.getElementById('periodoTotal');
    const periodoDiasHabiles = document.getElementById('periodoDiasHabiles');
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
    const procesarDatosBtn = document.getElementById('procesarDatos');
    const procesarBtn = document.getElementById('procesarFacturas');
    const textareaFechas = document.getElementById('textareaFechas');
    const textareaMontos = document.getElementById('textareaMontos');
    const tablaDatosProcesados = document.getElementById('tablaDatosProcesados');
    const resultadoProcesamiento = document.getElementById('resultadoProcesamiento');
    let datosMasivos = [];
    let flatpickrInstance;
    let usandoDatosMasivos = false;
    let datosValidados = false;

    // === Función para procesar y validar datos ===
    function procesarYValidarDatos() {
        const fechas = textareaFechas.value.split('\n').map(linea => linea.trim()).filter(linea => linea !== '');
        const montos = textareaMontos.value.split('\n').map(linea => linea.trim()).filter(linea => linea !== '');

        if (fechas.length !== montos.length) {
            alert('El número de fechas y montos debe coincidir.');
            datosValidados = false;
            return false;
        }

        // Crear array de datos combinados
        datosMasivos = fechas.map((fecha, index) => ({
            fecha: fecha,
            monto: montos[index]
        }));

        // Validar formato de las fechas y montos
        const errores = [];
        datosMasivos.forEach(({ fecha, monto }, i) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                errores.push(`La fecha en la línea ${i + 1} no tiene el formato válido (YYYY-MM-DD).`);
            }
            if (isNaN(parseFloat(monto))) {
                errores.push(`El monto en la línea ${i + 1} no es un número válido.`);
            }
        });
        if (errores.length > 0) {
            alert(errores.join('\n'));
            datosValidados = false;
            return false;
        }

        // Mostrar los datos en la tabla
        tablaDatosProcesados.innerHTML = datosMasivos.map(({ fecha, monto }) => `
            <tr>
                <td>${fecha}</td>
                <td>${monto}</td>
            </tr>
        `).join('');
        resultadoProcesamiento.style.display = 'block';
        datosValidados = true;
        return true;
    }

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


    // === Procesar Datos Masivos ===
    procesarDatosBtn.addEventListener('click', (event) => {
        event.preventDefault();
        procesarYValidarDatos();
    });

    // === Procesar Envío de Datos (Formulario o Masivo) ===

    // === Manejo del Formulario de Facturas ===
    if (facturasForm) {
        facturasForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const formData = new FormData(facturasForm);
            const data = Object.fromEntries(formData.entries());
            let errores = [];

            // Si estamos usando datos masivos procesados
            if (data.metodoIngreso === 'masivo') {
                // Validar que los datos hayan sido procesados
                if (!datosValidados || datosMasivos.length === 0) {
                    alert('Debe procesar los datos antes de enviarlos.');
                    return;
                }
                // Solo validar tipo de contribuyente y actividad
                if (!data.tipoContribuyente) errores.push("Debe seleccionar un tipo de contribuyente.");
                if (!data.Actividad) errores.push("Debe seleccionar un tipo de Actividad.");
                if (errores.length > 0) {
                    alert(errores.join('\n'));
                    return;
                }
                // Enviar los datos masivos procesados
                const datosMasivosParaEnviar = {
                    tipo: 'masivo',
                    tipoContribuyente: data.tipoContribuyente,
                    Actividad: data.Actividad,
                    datos: datosMasivos
                };
                console.log("Enviando datos masivos:", datosMasivosParaEnviar);
                window.electronAPI.sendFormData(datosMasivosParaEnviar);
                return;
            }

    // Validación CONDICIONAL para fechas y montos (MODIFICADO)
    if (data.periodoFacturacion === 'manual') {
        if (!data.fechasFacturas) {
            errores.push("Debe ingresar las fechas de facturación.");
        }

        if (!data.tipoMonto) { // Se mantiene la validación del tipo de monto para manual
            errores.push("Debe seleccionar un tipo de monto.");
        } else if (data.tipoMonto === 'montoTotal' && !data.montoTotalInput) {
            errores.push("Debe ingresar un monto total.");
        } else if (data.tipoMonto === 'montoManual' && !data.montoManual) {
            errores.push("Debe ingresar montos manuales.");
        }
    } else { // Para "total" y "habiles"
        // Validación OBLIGATORIA del monto para "total" y "habiles"
        if (!data.tipoMonto) {
            errores.push("Debe seleccionar un tipo de monto.");
        } else if (data.tipoMonto === 'montoTotal' && !data.montoTotalInput) {
            errores.push("Debe ingresar un monto total.");
        } else if (data.tipoMonto === 'montoManual' && !data.montoManual) {
            errores.push("Debe ingresar montos manuales.");
        }
    }

            // Mostrar errores si los hay
            if (errores.length > 0) {
                alert(errores.join('\n'));
                return;
            }

            // Limpieza de datos para modo manual
            const datosParaEnviar = { ...data };
            delete datosParaEnviar.textareaFechas;
            delete datosParaEnviar.textareaMontos;

            if (datosParaEnviar.tipoMonto !== 'montoManual') delete datosParaEnviar.montoManual;
            if (datosParaEnviar.tipoMonto !== 'montoTotal') delete datosParaEnviar.montoTotalInput;

            console.log("Datos del formulario manual:", datosParaEnviar);
            window.electronAPI.sendFormData(datosParaEnviar);
        });
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

    // Procesar los datos ingresados en los textareas
    function procesarDatosTextareas() {
        const textareaFechas = document.getElementById('textareaFechas');
        const textareaMontos = document.getElementById('textareaMontos');

        if (!textareaFechas || !textareaMontos) {
            return { errores: ["Faltan elementos del DOM"], datos: [] };
        }

        const fechas = textareaFechas.value.split('\n').map(linea => linea.trim()).filter(linea => linea !== '');
        const montos = textareaMontos.value.split('\n').map(linea => linea.trim()).filter(linea => linea !== '');

        const errores = [];

        // Validar que ambos campos tengan el mismo número de líneas
        if (fechas.length !== montos.length) {
            errores.push('El número de fechas no coincide con el número de montos.');
        }

        // Validar formato de fechas y montos
        fechas.forEach((fecha, index) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                errores.push(`La fecha en la línea ${index + 1} no tiene el formato correcto (YYYY-MM-DD).`);
            }
        });

        montos.forEach((monto, index) => {
            if (isNaN(parseFloat(monto))) {
                errores.push(`El monto en la línea ${index + 1} no es un número válido.`);
            }
        });

        if (errores.length > 0) {
            return { errores: errores, datos: [] };
        }

        const datos = fechas.map((fecha, index) => ({ fecha, monto: parseFloat(montos[index]) }));
        return { errores: [], datos: datos };
    }

    procesarDatosBtn.addEventListener('click', () => {
        const resultado = procesarDatosTextareas();
        if (resultado.errores.length > 0) {
            alert(resultado.errores.join('\n'));
            return;
        }

        datosMasivos = resultado.datos;
        // Mostrar datos procesados
        tablaDatosProcesados.innerHTML = datosMasivos.map(({ fecha, monto }) => `<tr><td>${fecha}</td><td>${monto}</td></tr>`).join('');
        resultadoProcesamiento.style.display = 'block';
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
});
