import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js';

document.addEventListener('DOMContentLoaded', () => {
    inicializarInterfazFacturas();
});

document.addEventListener('DOMContentLoaded', () => {
    const seleccionarArchivoComprobanteBtn = document.getElementById('seleccionarArchivoComprobanteBtn');
    const seleccionarArchivoAlicuotasBtn = document.getElementById('seleccionarArchivoAlicuotasBtn');
    const procesarLibroIvaBtn = document.getElementById('procesarLibroIvaBtn');
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

        // Ordenar las diferencias por el valor absoluto de la columna "Diferencia" de mayor a menor
        const diferenciasOrdenadas = resultado.data.informe.diferencias.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

        resultadoDiv.innerHTML = `
            <h3>Resultado del Análisis</h3>
            <p>${resultado.message}</p>
            <pre>${resultado.data.message}</pre>
            <pre>${resultado.data.informe.mensaje}</pre>
            <p>Informe:</p>
            <pre>CANTIDAD DE DIFERENCIAS: ${diferenciasOrdenadas.length}</pre>
            <br>
            <h4>Tabla de Diferencias</h4>
            <table border="1">
                <thead>
                    <tr>
                        <th>Número de Comprobante</th>
                        <th>Importe en Comprobante</th>
                        <th>Sumatoria de imortes en Alicuota y CBTE</th>
                        <th>Diferencia</th>
                    </tr>
                </thead>
                <tbody>
                    ${diferenciasOrdenadas.map(diferencia => `
                        <tr>
                         
                            <td>${(diferencia.numero)}</td>
                            <td>${diferencia.importeComprobante}</td>
                            <td>${diferencia.importeAlicuotaMasImpuestoInternoEnCompŕobante}</td>
                            <td>${diferencia.diferencia}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const countOnes = diferenciasOrdenadas.filter(item => Math.abs(item.diferencia) == 1).length;
        const countOthers = diferenciasOrdenadas.length - countOnes;

        document.body.innerHTML += `<pre>Diferencia igual a 1: ${countOnes}</pre>`;
        document.body.innerHTML += `<pre>Otras diferencias: ${countOthers}</pre>`;

        console.log("mira aca ", resultado.data.informe.lineasExcedidas[0]);
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

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM completamente cargado y analizado'); // Depuración
    const mostrarEliminarAnterioresBtn = document.getElementById('mostrarEliminarAnterioresBtn');
    const numeroEliminarContainer = document.getElementById('numeroEliminarContainer');
    const numeroEliminarInput = document.getElementById('numeroEliminar');
    const confirmNumeroEliminarBtn = document.getElementById('confirmNumeroEliminar');
    const numeroConfirmadoSpan = document.getElementById('numeroConfirmado');
    
    // Para el botón "Mostrar Eliminar Anteriores"
    if (mostrarEliminarAnterioresBtn) {
        mostrarEliminarAnterioresBtn.addEventListener('click', () => {
            if (numeroEliminarContainer) {
                numeroEliminarContainer.style.display = 'block';
            }
        });
    }
    
    // Para el botón "Confirmar número"
    if (confirmNumeroEliminarBtn) {
        confirmNumeroEliminarBtn.addEventListener('click', () => {
            const numeroValor = numeroEliminarInput.value;
            console.log(`Número confirmado: ${numeroValor}`);
            
            if (numeroValor) {
                if (numeroConfirmadoSpan) {
                    numeroConfirmadoSpan.style.display = 'inline';
                }
                if (numeroEliminarInput) {
                    numeroEliminarInput.readOnly = true;
                }
            } else {
                alert('Debe ingresar un número válido');
            }
        });
    }
});

document.addEventListener('click', async (event) => {
    if (event.target && event.target.id === 'modificarSegunInforme') {
        event.preventDefault();
        const libroIvaForm = document.getElementById('libroIvaForm');
        const libroIvaData = new FormData(libroIvaForm);
        const data = Object.fromEntries(libroIvaData.entries());
        data.archivos = [archivoComprobanteSeleccionado, archivoAlicuotasSeleccionado];
        data.case = 'modificarSegunInforme';
        console.log("Datos enviados para modificar según informe:", data);
        window.electronAPI.modificarSegunInforme(data);
    }
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
