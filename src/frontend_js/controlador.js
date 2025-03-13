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
    let archivoComprobanteSeleccionado = '';
    let archivoAlicuotasSeleccionado = '';

    loginButton.addEventListener('click', async () => {
        const credenciales = {
            usuario: await window.electronAPI.getEnv('AFIP_USUARIO'),
            contrasena: await window.electronAPI.getEnv('AFIP_CONTRASENA')
        };
        const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
        console.log("Enviando datos de login:", { url, credenciales });
        window.electronAPI.iniciarSesion(url, credenciales);
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
            <pre>CANTIDAD DE DIFERENCIAS: ${(resultado.data.informe.diferencias).length}</pre>
            <br>
            <pre>Se muestra como Ejemplo la segunda diferencia</pre>
            <pre>Comprobante numero: ${parseInt(resultado.data.informe.diferencias[1].numero)}</pre>
            <pre>Importe en Alicuota: ${resultado.data.informe.diferencias[1].importeAlicuota}</pre>
            <pre>Importe en Comprobante: ${resultado.data.informe.diferencias[1].importeComprobante}</pre>
            <pre>Diferencia: ${resultado.data.informe.diferencias[1].diferencia}</pre>
        `;
        document.getElementById('modificarSegunInformeDiv').style.display = 'block';
        //document.getElementById('eliminarAnterioresDiv').style.display = 'block'; // Mostrar el div
    });

    modificarSegunInforme.addEventListener('click', async (event) => {
        event.preventDefault();
        console.log("\t\t ========  \n\n")
        const libroIvaForm = document.getElementById('libroIvaForm');
        const libroIvaData = new FormData(libroIvaForm);
        const data = Object.fromEntries(libroIvaData.entries());
        data.archivos = [archivoComprobanteSeleccionado, archivoAlicuotasSeleccionado];
        data.case = 'modificarSegunInforme';
        console.log("Datos enviados para modificar según informe:", data);
        window.electronAPI.modificarSegunInforme(data);
    });

});
