const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { navegarARetenciones } = require('../codigoXpagina/oficina_retenciones.js');
const { descargarRetencionGenerico } = require('../codigoXpagina/retenciones_generico.js');
const { launchBrowser } = require('../../browserLauncher.js');

/**
 * Flujo completo para descargar retenciones desde ATM
 * @param {Object} credencialesATM - Credenciales del usuario {cuit, clave}
 * @param {string} nombreUsuario - Nombre del usuario para construir la ruta de descarga
 * @param {string} downloadsPath - Ruta base de descargas (app.getPath('downloads'))
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 * @param {string} periodo - Periodo en formato YYYY-MM (ej: "2025-01")
 * @returns {Promise<Object>} Resultado del flujo {exito, mensaje, files?, downloadDir?}
 */
async function flujoDescargaRetenciones(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso, periodo) {
    let browser;

    // Configuración de tipos de retenciones/percepciones a procesar
    // Índices basados en el submenu de la Oficina Virtual ATM
    // Estructura del menú:
    //   Índice 0: "Inscripciones" (NO procesar)
    //   Índice 1: "Reimprimir Certificado/Constancia" (NO procesar)
    //   Índice 2: "Retenciones/Percepciones I.B. hasta 03/2022" (NO procesar)
    //   Índice 3: "Retenciones SIRTAC I.B." ← EMPEZAR AQUÍ
    //   Índice 4: "Retenciones Comerciales SIRCAR I.B."
    //   Índice 5: "Percepciones Comerciales SIRCAR I.B." ⚠️ PERCEPCIONES
    //   Índice 6: "Retenciones SIRCREB I.B."
    //   Índice 7: "Retenciones SIRCUPA I.B."

    const tiposRetenciones = [
        { nombre: 'Retenciones SIRTAC I.B.', submenuIndex: 3 },
        { nombre: 'Retenciones Comerciales SIRCAR I.B.', submenuIndex: 4 },
        { nombre: 'Percepciones Comerciales SIRCAR I.B.', submenuIndex: 5 }, // ⚠️ PERCEPCIONES
        { nombre: 'Retenciones SIRCREB I.B.', submenuIndex: 6 },
        { nombre: 'Retenciones SIRCUPA I.B.', submenuIndex: 7 }
    ];

    try {
        enviarProgreso('info', 'Iniciando navegador...');
        browser = await launchBrowser({ headless: false }); // Modo visible para debugging
        const page = await browser.newPage();

        // PASO 1: Navegar a la URL de login de ATM
        const urlATM = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';
        await page.goto(urlATM);

        // PASO 2: Login en ATM
        enviarProgreso('info', 'Iniciando sesión en ATM...');
        await loginATM(page, credencialesATM);

        // PASO 3: Entrar a la Oficina Virtual
        enviarProgreso('info', 'Navegando a la oficina virtual...');
        const oficinaVirtualPage = await entrarOficinaVirtual(page);

        // Array para recolectar todos los archivos descargados y detalles por sub-servicio
        const todosLosArchivos = [];
        const detalles = [];
        let directorioBase = null;

        // PASO 4: Iterar por cada tipo de retención (SECUENCIAL, uno a la vez)
        for (const tipoRetencion of tiposRetenciones) {
            let intento = 0;
            const maxReintentos = 1; // Reintentar 1 vez si falla
            let resultado = null;

            // Sistema de reintentos
            while (intento <= maxReintentos && !resultado) {
                try {
                    const intentoTexto = intento > 0 ? ` (Reintento ${intento}/${maxReintentos})` : '';
                    enviarProgreso('info', `Procesando ${tipoRetencion.nombre}${intentoTexto}...`);

                    // Navegar a la sección específica de retenciones
                    await navegarARetenciones(oficinaVirtualPage, tipoRetencion.submenuIndex);

                    // Ejecutar la descarga usando la función genérica
                    resultado = await descargarRetencionGenerico({
                        nombre: tipoRetencion.nombre,
                        page: oficinaVirtualPage,
                        nombreUsuario: nombreUsuario,
                        cuit: credencialesATM.cuit,
                        downloadsPath: downloadsPath,
                        periodo: periodo // Periodo seleccionado por el usuario en el frontend
                    });

                    // Si llegamos aquí, fue exitoso
                    if (resultado.success) {
                        if (resultado.registros === 0) {
                            // Sin registros
                            enviarProgreso('info', `${tipoRetencion.nombre}: ${resultado.mensaje} ${resultado.alertMensaje || ''}`);
                        } else if (resultado.files.length > 0) {
                            // Con archivos descargados
                            enviarProgreso('info', `${tipoRetencion.nombre}: ${resultado.archivosDescargados} archivo(s) descargado(s).`);
                            todosLosArchivos.push(...resultado.files);
                            if (!directorioBase) directorioBase = resultado.downloadDir;
                        }
                    }

                } catch (errorTipo) {
                    console.error(`[${tipoRetencion.nombre}] Error en intento ${intento + 1}:`, errorTipo.message);
                    intento++;

                    if (intento <= maxReintentos) {
                        console.log(`[${tipoRetencion.nombre}] Reintentando en 2 segundos...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        // Agotados los reintentos, reportar error y continuar
                        console.error(`[${tipoRetencion.nombre}] ❌ Falló después de ${maxReintentos + 1} intentos`);
                        enviarProgreso('error', `${tipoRetencion.nombre}: Error después de ${maxReintentos + 1} intentos - ${errorTipo.message}`);

                        // Crear resultado de error para el informe
                        resultado = {
                            success: false,
                            tipo: tipoRetencion.nombre,
                            registros: 0,
                            archivosDescargados: 0,
                            files: [],
                            downloadDir: null,
                            mensaje: `Error: ${errorTipo.message}`,
                            error: true
                        };
                    }
                }
            }

            // Agregar resultado al array de detalles
            if (resultado) {
                detalles.push(resultado);
            }

            // Pequeña pausa entre tipos
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // PASO 5: Retornar resultado consolidado con detalles
        const totalRegistros = detalles.reduce((sum, d) => sum + d.registros, 0);
        const totalExitosos = detalles.filter(d => d.success && !d.error).length;
        const totalFallidos = detalles.filter(d => d.error).length;

        if (todosLosArchivos.length > 0) {
            enviarProgreso('exito', `Proceso completado. Total: ${todosLosArchivos.length} archivo(s) de ${totalRegistros} registro(s).`);
            return {
                exito: true,
                mensaje: `Retenciones procesadas: ${totalExitosos} exitosos, ${totalFallidos} fallidos. ${todosLosArchivos.length} archivo(s) descargado(s).`,
                files: todosLosArchivos,
                downloadDir: directorioBase,
                detalles: detalles // ← Información detallada por sub-servicio
            };
        } else {
            const razon = totalFallidos > 0 ? 'Todos los sub-servicios fallaron o no tenían registros.' : 'No se encontraron registros en ningún sub-servicio.';
            enviarProgreso('info', razon);
            return {
                exito: true,
                mensaje: razon,
                files: [],
                downloadDir: null,
                detalles: detalles // ← Información detallada por sub-servicio
            };
        }

    } catch (error) {
        console.error('Error en el flujo de descarga de retenciones:', error.message);
        enviarProgreso('error', `Error en el flujo de descarga de retenciones: ${error.message}`);
        throw error; // Lanzar para que el worker lo capture
    } finally {
        if (browser) {
            await browser.close();
            enviarProgreso('info', 'Proceso finalizado. Navegador cerrado.');
        }
    }
}

module.exports = {
    flujoDescargaRetenciones
};
