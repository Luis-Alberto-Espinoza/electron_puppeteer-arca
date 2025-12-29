const { parentPort, workerData } = require('worker_threads');
const { flujoPlanDePago } = require('../puppeteer/ATM/flujosDeTareas/flujo_planDepagoIngresosBruto.js');
const { flujoConstanciaFiscal } = require('../puppeteer/ATM/flujosDeTareas/flujo_constanciaFiscal_imprimir.js');
const { flujoDescargaRetenciones } = require('../puppeteer/ATM/flujosDeTareas/flujo_descargaRetenciones.js');

// Función para procesar un único usuario
async function procesarUsuario(usuario, tipoAccion, downloadsPath) {
    const { cuit, claveATM, nombre = '', apellido = '', periodo = '' } = usuario;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

    const enviarProgreso = (status, mensaje, datosAdicionales = {}) => {
        parentPort.postMessage({ userId: usuario.id, nombre: nombreCompleto, status, mensaje: `[Usuario: ${nombreCompleto}] ${mensaje}`, ...datosAdicionales });
    };

    enviarProgreso('iniciando', 'Iniciando proceso...');

    try {
        let resultadoFlujo;
        const credenciales = { cuit, clave: claveATM }; // Construir objeto de credenciales
        const nombreParaArchivos = `${nombre}_${apellido}`.replace(/\s+/g, '_'); // Nombre para usar en archivos

        if (tipoAccion === 'constanciaFiscal') {
            resultadoFlujo = await flujoConstanciaFiscal(credenciales, nombreParaArchivos, downloadsPath, enviarProgreso);
        } else if (tipoAccion === 'planDePago') {
            resultadoFlujo = await flujoPlanDePago(credenciales, nombreParaArchivos, downloadsPath, enviarProgreso);
        } else if (tipoAccion === 'descargaRetenciones') {
            resultadoFlujo = await flujoDescargaRetenciones(credenciales, nombreParaArchivos, downloadsPath, enviarProgreso, periodo);
        } else {
            throw new Error('Tipo de acción no soportado.');
        }

        // Enviar un mensaje final de éxito con los datos del resultado (archivos, etc.)
        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
             enviarProgreso('exito_final', 'Proceso finalizado con éxito.', resultadoFlujo);
        }

    } catch (error) {
        // Los flujos ya envían un mensaje de error, pero capturamos aquí por si algo falla fuera del flujo.
        console.error(`Error fatal procesando al usuario ${nombreCompleto}:`, error);
        enviarProgreso('error', `Descripción del error: ${error.message}`);
    }
};

// Función principal que orquesta el lote
const iniciarProcesoLote = async () => {
    const { usuarios, tipoAccion, downloadsPath } = workerData;
    parentPort.postMessage({ status: 'general', mensaje: `Iniciando proceso en lote para ${usuarios.length} usuarios.` });

    // Procesar usuarios en secuencia para no sobrecargar el sistema
    for (const usuario of usuarios) {
        await procesarUsuario(usuario, tipoAccion, downloadsPath);
        // Pausa opcional entre usuarios
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    parentPort.postMessage({ status: 'finalizado', mensaje: 'El proceso en lote ha finalizado.' });
};

// Iniciar el proceso
iniciarProcesoLote();