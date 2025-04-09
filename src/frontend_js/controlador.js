import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js';

document.addEventListener('DOMContentLoaded', () => {
    inicializarInterfazFacturas();
});

document.addEventListener('DOMContentLoaded', () => {
    const seleccionarArchivoComprobanteBtn = document.getElementById('seleccionarArchivoComprobanteBtn');
    const seleccionarArchivoAlicuotasBtn = document.getElementById('seleccionarArchivoAlicuotasBtn');
    const procesarLibroIvaBtn = document.getElementById('procesarLibroIvaBtn');
    const modificarSegunInforme = document.getElementById('modificarSegunInforme');
    const loginButton = document.getElementById('loginButton');
    const testButton = document.getElementById('testButton'); // Nuevo botón
    const btnEditarLineasExcedidas = document.getElementById('btnEditarLineasExcedidas');

    // Selección automática de archivos para desarrollo
    let archivoComprobanteSeleccionado = '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.TXT';
    let archivoAlicuotasSeleccionado = '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt';

    // Código para seleccionar archivos manualmente
    // let archivoComprobanteSeleccionado = '';
    // let archivoAlicuotasSeleccionado = '';

    loginButton.addEventListener('click', async () => {
        const credenciales = {
            usuario: await window.electronAPI.getEnv('AFIP_USUARIO'),
            contrasena: await window.electronAPI.getEnv('AFIP_CONTRASENA')
        };
        const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
        console.log("Enviando datos de login:", { url, credenciales });
        window.electronAPI.iniciarSesion(url, { ...credenciales, test: false });
    });

    // Lógica para el nuevo botón
    testButton.addEventListener('click', async () => {
        const credenciales = {
            usuario: await window.electronAPI.getEnv('AFIP_USUARIO'),
            contrasena: await window.electronAPI.getEnv('AFIP_CONTRASENA')
        };
        const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
        console.log("Enviando datos de login en modo test:", { url, credenciales, test: true });
        window.electronAPI.iniciarSesion(url, credenciales, true); // Pasa `true` explícitamente como valor de `test`
    });

    seleccionarArchivoComprobanteBtn.addEventListener('click', async () => {
        const archivos = await window.electronAPI.seleccionarArchivos();
        if (archivos.length > 0) {
            archivoComprobanteSeleccionado = archivos[0];
            document.getElementById('nombreArchivoComprobante').innerText = `Nombre: ${archivoComprobanteSeleccionado.split('/').pop()}`;
            document.getElementById('rutaArchivoComprobante').innerText = `Ruta: ${archivoComprobanteSeleccionado}`;
        }
    });

    seleccionarArchivoAlicuotasBtn.addEventListener('click', async () => {
        const archivos = await window.electronAPI.seleccionarArchivos();
        if (archivos.length > 0) {
            archivoAlicuotasSeleccionado = archivos[0];
            document.getElementById('nombreArchivoAlicuotas').innerText = `Nombre: ${archivoAlicuotasSeleccionado.split('/').pop()}`;
            document.getElementById('rutaArchivoAlicuotas').innerText = `Ruta: ${archivoAlicuotasSeleccionado}`;
        }
    });

    procesarLibroIvaBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        if (!archivoComprobanteSeleccionado || !archivoAlicuotasSeleccionado) {
            alert("Debe seleccionar ambos archivos.");
            return;
        }
        const libroIvaForm = document.getElementById('libroIvaForm');
        const libroIvaData = new FormData(libroIvaForm);
        const data = Object.fromEntries(libroIvaData.entries());
        data.archivos = [archivoComprobanteSeleccionado, archivoAlicuotasSeleccionado];
        console.log("Datos enviados desde el frontend:", data);
        window.electronAPI.procesarLibroIva(data);
    });

    window.electronAPI.onLibroIvaProcesado((event, resultado) => {
        console.log("Resultado recibido en el frontend:", resultado);
        const resultadoDiv = document.getElementById('resultado');
        resultadoDiv.innerHTML = `
            <h3>Resultado del Análisis</h3>
            <p>${resultado.message}</p>
            <pre>${resultado.data.message}</pre>
            <pre>${resultado.data.informe.mensaje}</pre>
            <p>Informe:</p>
            <pre>CANTIDAD DE DIFERENCIAS: ${(resultado.data.informe.diferencias).length}</pre>
            <br>
            <pre>Se muestra como Ejemplo la segunda diferencia</pre>
            <pre>Comprobante numero: ${parseInt(resultado.data.informe.diferencias[1].numero)}</pre>
            <pre>Importe en Alicuota: ${resultado.data.informe.diferencias[1].importeAlicuota}</pre>
            <pre>Importe en Comprobante: ${resultado.data.informe.diferencias[1].importeComprobante}</pre>
            <pre>Diferencia: ${resultado.data.informe.diferencias[1].diferencia}</pre>
        `;
        console.log("mira aca ", resultado.data.informe.lineasExcedidas[0])
        //si hay lineas excedidas debe aparecer un btn que permita modificar en una ventana aparte esas lineas de a una a la vez 

        if (resultado.data.informe.lineasExcedidas.length > 0) {
            const lineasExcedidasDiv = document.getElementById('lineasExcedidas');
            lineasExcedidasDiv.innerHTML = `
                <h3>Lineas Excedidas</h3>
                <pre>El número de linea en el archivo es: ${resultado.data.informe.lineasExcedidas[0].numeroLinea}</pre>
                <pre>La cantidad de caracteres normal es de 267 y esta linea tiene un total de: ${resultado.data.informe.lineasExcedidas[0].longitud}</pre>
                <pre>este es el contenido de la linea completa</pre>
                <pre>${resultado.data.informe.lineasExcedidas[0].contenido}</pre>
            `;
            btnEditarLineasExcedidas.style.display = 'block';
        }
        document.getElementById('modificarSegunInformeDiv').style.display = 'block';
    });

    modificarSegunInforme.addEventListener('click', async (event) => {
        event.preventDefault();
        const libroIvaForm = document.getElementById('libroIvaForm');
        const libroIvaData = new FormData(libroIvaForm);
        const data = Object.fromEntries(libroIvaData.entries());
        data.archivos = [archivoComprobanteSeleccionado, archivoAlicuotasSeleccionado];
        data.case = 'modificarSegunInforme';
        console.log("Datos enviados para modificar según informe:", data);
        window.electronAPI.modificarSegunInforme(data);
    });

    btnEditarLineasExcedidas.addEventListener('click', () => {
        abrirModalEdicion(resultado.data.informe.lineasExcedidas[0]);
    });

    document.getElementById('btnGuardarEdicion').addEventListener('click', () => {
        const lineaEditada = document.getElementById('txtLineaEdicion').value;
        console.log("Línea editada:", lineaEditada);
        cerrarModalEdicion();
    });

    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalEdicion);
});

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
    txtLinea.value = lineaExcedida.contenido;

    modal.style.display = 'block';
    modalFondo.style.display = 'block';
}

function cerrarModalEdicion() {
    document.getElementById('modalEdicion').style.display = 'none';
    document.getElementById('modalFondo').style.display = 'none';
}
