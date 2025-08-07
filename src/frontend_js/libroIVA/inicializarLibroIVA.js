// ========================================
// VARIABLES GLOBALES
// ========================================
let archivoComprobanteSeleccionado = '';
let archivoAlicuotasSeleccionado = '';
let resultadoGlobal = null;

// ========================================
// CONFIGURACIÓN DE ARCHIVOS PARA DESARROLLO
// ========================================
function inicializarArchivosDesarrollo() {
    // Selección automática de archivos para desarrollo
    archivoComprobanteSeleccionado = '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.TXT';
    archivoAlicuotasSeleccionado = '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt';

    // Para habilitar selección manual, comentar las líneas anteriores y descomentar estas:
    // archivoComprobanteSeleccionado = '';
    // archivoAlicuotasSeleccionado = '';
}





// ========================================
// EVENTOS DE SELECCIÓN DE ARCHIVOS
// ========================================
function inicializarEventosSeleccionArchivos() {
    const seleccionarArchivoComprobanteBtn = document.getElementById('seleccionarArchivoComprobanteBtn');
    const seleccionarArchivoAlicuotasBtn = document.getElementById('seleccionarArchivoAlicuotasBtn');

    if (seleccionarArchivoComprobanteBtn) {
        seleccionarArchivoComprobanteBtn.addEventListener('click', manejarSeleccionArchivoComprobante);
    }

    if (seleccionarArchivoAlicuotasBtn) {
        seleccionarArchivoAlicuotasBtn.addEventListener('click', manejarSeleccionArchivoAlicuotas);
    }
}




// ========================================
// EVENTOS DE SELECCIÓN DE libro IVA
// ========================================
async function manejarSeleccionArchivoComprobante() {
    const archivos = await window.electronAPI.seleccionarArchivos();
    if (archivos.length > 0) {
        archivoComprobanteSeleccionado = archivos[0];
        actualizarInfoArchivoComprobante(archivoComprobanteSeleccionado);
    }
}

async function manejarSeleccionArchivoAlicuotas() {
    const archivos = await window.electronAPI.seleccionarArchivos();
    if (archivos.length > 0) {
        archivoAlicuotasSeleccionado = archivos[0];
        actualizarInfoArchivoAlicuotas(archivoAlicuotasSeleccionado);
    }
}

function actualizarInfoArchivoComprobante(rutaArchivo) {
    const nombreElemento = document.getElementById('nombreArchivoComprobante');
    const rutaElemento = document.getElementById('rutaArchivoComprobante');

    if (nombreElemento && rutaElemento) {
        nombreElemento.innerText = `Nombre: ${rutaArchivo.split('/').pop()}`;
        rutaElemento.innerText = `Ruta: ${rutaArchivo}`;
    }
}

function actualizarInfoArchivoAlicuotas(rutaArchivo) {
    const nombreElemento = document.getElementById('nombreArchivoAlicuotas');
    const rutaElemento = document.getElementById('rutaArchivoAlicuotas');

    if (nombreElemento && rutaElemento) {
        nombreElemento.innerText = `Nombre: ${rutaArchivo.split('/').pop()}`;
        rutaElemento.innerText = `Ruta: ${rutaArchivo}`;
    }
}

// ========================================
// EVENTOS DE PROCESAMIENTO LIBRO IVA
// ========================================
function inicializarEventosProcesamientoLibroIVA() {
    const procesarLibroIvaBtn = document.getElementById('procesarLibroIvaBtn');
    const modificarSegunInforme = document.getElementById('modificarSegunInforme');

    if (procesarLibroIvaBtn) {
        procesarLibroIvaBtn.addEventListener('click', manejarProcesamientoLibroIVA);
    }

    if (modificarSegunInforme) {
        modificarSegunInforme.addEventListener('click', manejarModificacionSegunInforme);
    }
}

async function manejarProcesamientoLibroIVA(event) {
    event.preventDefault();

    if (!validarArchivosSeleccionados()) {
        return;
    }

    const data = obtenerDatosFormularioLibroIVA();
    console.log("Datos enviados desde el frontend:", data);
    window.electronAPI.procesarLibroIva(data);
}

async function manejarModificacionSegunInforme(event) {
    event.preventDefault();

    const data = obtenerDatosFormularioLibroIVA();
    data.case = 'modificarSegunInforme';
    console.log("Datos enviados para modificar según informe:", data);
    window.electronAPI.modificarSegunInforme(data);
}

function validarArchivosSeleccionados() {
    if (!archivoComprobanteSeleccionado || !archivoAlicuotasSeleccionado) {
        alert("Debe seleccionar ambos archivos.");
        return false;
    }
    return true;
}

function obtenerDatosFormularioLibroIVA() {
    const libroIvaForm = document.getElementById('libroIvaForm');
    const libroIvaData = new FormData(libroIvaForm);
    const data = Object.fromEntries(libroIvaData.entries());
    data.archivos = [archivoComprobanteSeleccionado, archivoAlicuotasSeleccionado];
    return data;
}

// ========================================
// LISTENER DE RESULTADOS de libro IVA
// ========================================
function inicializarListenerResultados() {
    window.electronAPI.onLibroIvaProcesado((event, resultado) => {
        resultadoGlobal = resultado;
        mostrarResultadoAnalisis(resultado);
        mostrarLineasExcedidas(resultado);
        mostrarBotonModificarInforme();
    });
}

function mostrarResultadoAnalisis(resultado) {
    console.log("Resultado recibido en el frontend:", resultado);
    const resultadoDiv = document.getElementById('resultado');

    if (resultadoDiv) {
        resultadoDiv.innerHTML = generarHTMLResultado(resultado);
    }
}

function generarHTMLResultado(resultado) {
    const diferencias = resultado.data.informe.diferencias;
    const segundaDiferencia = diferencias.length > 1 ? diferencias[1] : null;

    return `
        <h3>Resultado del Análisis</h3>
        <p>${resultado.message}</p>
        <pre>${resultado.data.message}</pre>
        <pre>${resultado.data.informe.mensaje}</pre>
        <p>Informe:</p>
        <pre>CANTIDAD DE DIFERENCIAS: ${diferencias.length}</pre>
        <br>
        ${segundaDiferencia ? `
        <pre>Se muestra como Ejemplo la segunda diferencia</pre>
        <pre>Comprobante numero: ${parseInt(segundaDiferencia.numero)}</pre>
        <pre>Importe en Alicuota: ${segundaDiferencia.importeAlicuota}</pre>
        <pre>Importe en Comprobante: ${segundaDiferencia.importeComprobante}</pre>
        <pre>Diferencia: ${segundaDiferencia.diferencia}</pre>
        ` : ''}
    `;
}

function mostrarLineasExcedidas(resultado) {
    const lineasExcedidas = resultado.data.informe.lineasExcedidas;
    console.log("mira aca ", lineasExcedidas[0]);

    if (lineasExcedidas.length > 0) {
        mostrarInformacionLineasExcedidas(lineasExcedidas[0]);
        mostrarBotonEditarLineas();
    }
}

function mostrarInformacionLineasExcedidas(primeraLineaExcedida) {
    const lineasExcedidasDiv = document.getElementById('lineasExcedidas');

    if (lineasExcedidasDiv) {
        lineasExcedidasDiv.innerHTML = `
            <h3>Lineas Excedidas</h3>
            <pre>El número de linea en el archivo es: ${primeraLineaExcedida.numeroLinea}</pre>
            <pre>La cantidad de caracteres normal es de 267 y esta linea tiene un total de: ${primeraLineaExcedida.longitud}</pre>
            <pre>este es el contenido de la linea completa</pre>
            <pre>${primeraLineaExcedida.contenido}</pre>
        `;
    }
}

function mostrarBotonEditarLineas() {
    const btnEditarLineasExcedidas = document.getElementById('btnEditarLineasExcedidas');
    if (btnEditarLineasExcedidas) {
        btnEditarLineasExcedidas.style.display = 'block';
    }
}

function mostrarBotonModificarInforme() {
    const modificarSegunInformeDiv = document.getElementById('modificarSegunInformeDiv');
    if (modificarSegunInformeDiv) {
        modificarSegunInformeDiv.style.display = 'block';
    }
}

// ========================================
// EVENTOS DEL MODAL DE EDICIÓN
// ========================================
function inicializarEventosModalEdicion() {
    const btnEditarLineasExcedidas = document.getElementById('btnEditarLineasExcedidas');
    const btnGuardarEdicion = document.getElementById('btnGuardarEdicion');
    const btnCerrarModal = document.getElementById('btnCerrarModal');

    if (btnEditarLineasExcedidas) {
        btnEditarLineasExcedidas.addEventListener('click', manejarAbrirModalEdicion);
    }

    if (btnGuardarEdicion) {
        btnGuardarEdicion.addEventListener('click', manejarGuardarEdicion);
    }

    if (btnCerrarModal) {
        btnCerrarModal.addEventListener('click', cerrarModalEdicion);
    }
}

function manejarAbrirModalEdicion() {
    if (resultadoGlobal && resultadoGlobal.data.informe.lineasExcedidas.length > 0) {
        abrirModalEdicion(resultadoGlobal.data.informe.lineasExcedidas[0]);
    }
}

function manejarGuardarEdicion() {
    const lineaEditada = document.getElementById('txtLineaEdicion').value;
    console.log("Línea editada:", lineaEditada);
    cerrarModalEdicion();
}

// ========================================
// FUNCIONES DEL MODAL DE EDICIÓN
// ========================================
function abrirModalEdicion(lineaExcedida) {
    const modal = document.getElementById('modalEdicion');
    const modalFondo = document.getElementById('modalFondo');
    const txtLinea = document.getElementById('txtLineaEdicion');
    const modalMensaje = document.getElementById('modalMensaje');

    modalMensaje.innerHTML = `
        <strong>Número de línea:</strong> ${lineaExcedida.numeroLinea}<br>
        <strong>Longitud:</strong> ${lineaExcedida.longitud}<br>
        <strong>Caracteres esperados:</strong> 267
    `;
}

function cerrarModalEdicion() {
    const modal = document.getElementById('modalEdicion');
    const modalFondo = document.getElementById('modalFondo');

    if (modal) {
        modal.style.display = 'none';
    }

    if (modalFondo) {
        modalFondo.style.display = 'none';
    }
}
