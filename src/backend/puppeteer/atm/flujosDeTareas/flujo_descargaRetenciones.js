const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { navegarARetenciones } = require('../codigoXpagina/oficina_retenciones.js');
const { descargarRetencionGenerico } = require('../codigoXpagina/retenciones_generico.js');
const { launchBrowserAndPage } = require('../../archivos_comunes/navegador/browserLauncher.js');

/**
 * Flujo completo para descargar retenciones desde ATM
 *
 * Orden del recorrido (importante para el tiempo total): un solo login, y por
 * cada tipo de retención se navega el menú UNA vez y adentro se recorren todos
 * los periodos pedidos. Lo único que se repite por periodo es elegir año/mes y
 * consultar, que es la parte barata.
 *
 * @param {Object} credencialesATM - Credenciales del usuario {cuit, clave}
 * @param {string} nombreUsuario - Nombre del usuario para construir la ruta de descarga
 * @param {string} downloadsPath - Ruta base de descargas (app.getPath('downloads'))
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 * @param {string|string[]} periodos - Periodo o lista de periodos en formato YYYY-MM
 * @returns {Promise<Object>} Resultado del flujo {exito, mensaje, files?, downloadDir?}
 */
async function flujoDescargaRetenciones(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso, periodos) {
    let browser;

    // Acepta un periodo suelto (formato viejo) o una lista de periodos.
    const listaPeriodos = (Array.isArray(periodos) ? periodos : [periodos]).filter(Boolean);

    if (listaPeriodos.length === 0) {
        throw new Error('No se recibió ningún periodo para descargar.');
    }

    const rangoTexto = listaPeriodos.length === 1
        ? listaPeriodos[0]
        : `${listaPeriodos[0]} a ${listaPeriodos[listaPeriodos.length - 1]} (${listaPeriodos.length} periodos)`;

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
        enviarProgreso('info', `Iniciando navegador... (periodos: ${rangoTexto})`);
        // Modo visible para debugging. launchBrowserAndPage reusa la pestaña inicial
        // (sin about:blank de más) y aplica el viewport por defecto.
        const lanzado = await launchBrowserAndPage({ headless: false });
        browser = lanzado.browser;
        const page = lanzado.page;

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

        /**
         * Vuelve a dejar la pantalla del tipo de retención lista después de un error.
         * Recarga y re-navega el menú para no arrastrar un DOM roto al periodo siguiente.
         */
        const resincronizarPantalla = async (submenuIndex) => {
            try {
                await oficinaVirtualPage.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(resolve => setTimeout(resolve, 2000));
                await navegarARetenciones(oficinaVirtualPage, submenuIndex);
                return true;
            } catch (errorResinc) {
                console.error(`[Retenciones] No se pudo resincronizar la pantalla: ${errorResinc.message}`);
                return false;
            }
        };

        // PASO 4: Iterar por cada tipo de retención (SECUENCIAL, uno a la vez)
        for (const tipoRetencion of tiposRetenciones) {

            // Navegar UNA sola vez al tipo de retención; los periodos se recorren adentro
            try {
                enviarProgreso('info', `Abriendo ${tipoRetencion.nombre}...`);
                await navegarARetenciones(oficinaVirtualPage, tipoRetencion.submenuIndex);
            } catch (errorNavegacion) {
                console.error(`[${tipoRetencion.nombre}] ❌ No se pudo abrir la sección:`, errorNavegacion.message);
                enviarProgreso('error', `${tipoRetencion.nombre}: no se pudo abrir la sección - ${errorNavegacion.message}`);

                // Todos los periodos de este tipo quedan como fallidos
                listaPeriodos.forEach(periodoFallido => {
                    detalles.push({
                        success: false,
                        tipo: tipoRetencion.nombre,
                        periodo: periodoFallido,
                        registros: 0,
                        archivosDescargados: 0,
                        files: [],
                        downloadDir: null,
                        mensaje: `Error de navegación: ${errorNavegacion.message}`,
                        error: true
                    });
                });

                // Intentar recuperar la pantalla para el próximo tipo
                await resincronizarPantalla(tipoRetencion.submenuIndex).catch(() => {});
                continue;
            }

            // PASO 4.b: Recorrer los periodos dentro del mismo tipo de retención
            for (let indicePeriodo = 0; indicePeriodo < listaPeriodos.length; indicePeriodo++) {
                const periodoActual = listaPeriodos[indicePeriodo];
                const esUltimoPeriodo = indicePeriodo === listaPeriodos.length - 1;

                let intento = 0;
                const maxReintentos = 1; // Reintentar 1 vez si falla
                let resultado = null;

                // Sistema de reintentos
                while (intento <= maxReintentos && !resultado) {
                    try {
                        const intentoTexto = intento > 0 ? ` (Reintento ${intento}/${maxReintentos})` : '';
                        enviarProgreso('info', `${tipoRetencion.nombre} - periodo ${periodoActual}${intentoTexto}...`);

                        // Ejecutar la descarga usando la función genérica.
                        // Solo recargamos la página en el último periodo del tipo:
                        // en el medio la pantalla queda lista para cambiar año/mes.
                        resultado = await descargarRetencionGenerico({
                            nombre: tipoRetencion.nombre,
                            page: oficinaVirtualPage,
                            nombreUsuario: nombreUsuario,
                            cuit: credencialesATM.cuit,
                            downloadsPath: downloadsPath,
                            periodo: periodoActual,
                            recargarAlFinal: esUltimoPeriodo
                        });

                        // Si llegamos aquí, fue exitoso
                        if (resultado.success) {
                            if (resultado.registros === 0) {
                                // Sin registros
                                enviarProgreso('info', `${tipoRetencion.nombre} (${periodoActual}): ${resultado.mensaje} ${resultado.alertMensaje || ''}`);
                            } else if (resultado.files.length > 0) {
                                // Con archivos descargados
                                if (resultado.periodoArchivoInesperado) {
                                    enviarProgreso('error', `${tipoRetencion.nombre}: se pidió ${periodoActual} y ATM devolvió archivos de ${resultado.periodoArchivoInesperado}. Revisar esos archivos.`);
                                }
                                enviarProgreso('info', `${tipoRetencion.nombre} (${periodoActual}): ${resultado.archivosDescargados} archivo(s) descargado(s).`);
                                todosLosArchivos.push(...resultado.files);
                                if (!directorioBase) directorioBase = resultado.downloadDir;
                            } else {
                                // Había registros pero no bajó ningún archivo: hay que avisar,
                                // si no queda como si el periodo no tuviera nada.
                                enviarProgreso('error', `${tipoRetencion.nombre} (${periodoActual}): ${resultado.registros} registro(s) pero no se descargó ningún archivo.`);
                            }
                        }

                    } catch (errorTipo) {
                        console.error(`[${tipoRetencion.nombre}] [${periodoActual}] Error en intento ${intento + 1}:`, errorTipo.message);
                        intento++;

                        if (intento <= maxReintentos) {
                            console.log(`[${tipoRetencion.nombre}] [${periodoActual}] Reintentando en 2 segundos...`);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            // El DOM quedó en estado desconocido: volver a la pantalla del tipo
                            await resincronizarPantalla(tipoRetencion.submenuIndex);
                        } else {
                            // Agotados los reintentos, reportar error y seguir con el próximo periodo
                            console.error(`[${tipoRetencion.nombre}] [${periodoActual}] ❌ Falló después de ${maxReintentos + 1} intentos`);
                            enviarProgreso('error', `${tipoRetencion.nombre} (${periodoActual}): Error después de ${maxReintentos + 1} intentos - ${errorTipo.message}`);

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

                            // Dejar la pantalla lista para el siguiente periodo o tipo
                            await resincronizarPantalla(tipoRetencion.submenuIndex);
                        }
                    }
                }

                // Agregar resultado al array de detalles (con el periodo al que corresponde)
                if (resultado) {
                    detalles.push({ ...resultado, periodo: periodoActual });
                }

                // Pequeña pausa entre periodos
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Pequeña pausa entre tipos
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // PASO 5: Retornar resultado consolidado con detalles
        const totalRegistros = detalles.reduce((sum, d) => sum + d.registros, 0);
        const totalExitosos = detalles.filter(d => d.success && !d.error).length;
        const totalFallidos = detalles.filter(d => d.error).length;

        if (todosLosArchivos.length > 0) {
            enviarProgreso('exito', `Proceso completado (${rangoTexto}). Total: ${todosLosArchivos.length} archivo(s) de ${totalRegistros} registro(s).`);
            return {
                exito: true,
                mensaje: `Retenciones procesadas: ${totalExitosos} consulta(s) exitosa(s), ${totalFallidos} fallida(s). ${todosLosArchivos.length} archivo(s) descargado(s).`,
                files: todosLosArchivos,
                downloadDir: directorioBase,
                periodos: listaPeriodos,
                detalles: detalles // ← Información detallada por sub-servicio y periodo
            };
        } else {
            const razon = totalFallidos > 0
                ? 'Todas las consultas fallaron o no tenían registros.'
                : `No se encontraron registros en ningún sub-servicio (${rangoTexto}).`;
            enviarProgreso('info', razon);
            return {
                exito: true,
                mensaje: razon,
                files: [],
                downloadDir: null,
                periodos: listaPeriodos,
                detalles: detalles // ← Información detallada por sub-servicio y periodo
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
