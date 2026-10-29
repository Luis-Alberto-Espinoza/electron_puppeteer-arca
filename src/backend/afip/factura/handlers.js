// afip/factura/handlers.js
// Handlers IPC para el dominio de facturacion AFIP

const { procesarDatosFactura: comunicacionConFactura } = require('./service/procesarFactura.js');
const facturaManagerUnificado = require('./facturaManagerUnificado.js');
const { listarRazonesSociales, normalizarNumeroPdv, tipoContribuyenteDesdePuntosDeVenta } = require('../../cliente/model.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const { aprenderPdvHabilitados, aprenderTipoDelPdv } = require('./aprenderPdv.js');
const { loteEnUnaSesion } = require('./corteLote.js');

// En facturas el CUIT puede venir como `cuit` o `cuil`; normalizamos acá.
const clienteFactura = (u) => historialRepo.clienteDesdeUsuario(
    u ? { id: u.id, nombre: u.nombre, cuit: u.cuit || u.cuil } : null
);

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

// Copia del código procesado sin las primeras `desde` facturas (las que ya salieron).
function recortarDesde(codigo, desde) {
    const todas = (codigo && codigo.montoResultados && codigo.montoResultados.facturasGeneradas) || [];
    const n = Math.max(0, Math.min(parseInt(desde, 10) || 0, todas.length));
    if (n === 0) return { codigo, desde: 0, total: todas.length };
    return {
        codigo: { ...codigo, montoResultados: { ...codigo.montoResultados, facturasGeneradas: todas.slice(n) } },
        desde: n,
        total: todas.length - n
    };
}

// Una entrada por corrida real (el modo prueba no emite nada → no se registra).
function registrarCorrida(servicio, cliente, final) {
    const { desde, total, aEmitir, emitidas, dudosa } = final.avance;
    const deServicio = servicio === 'mercadopago' ? 'Mercado Pago' : 'Facturas';
    const estado = final.success ? 'exito' : (emitidas > 0 ? 'parcial' : 'error');
    const motivo = final.success ? '' : ` — ${final.message || final.error || 'error sin detalle'}`;
    historialRepo.registrar({
        dominio: 'factura', accion: 'generar', estado,
        cliente: cliente && cliente.cuit ? cliente : null,
        resumen: `${emitidas} de ${aEmitir} factura(s) emitida(s) (${deServicio})`
            + (desde ? ` — reintento: N° ${desde + 1} a ${total}` : '')
            + (dudosa ? `; la N° ${dudosa} quedó dudosa: revisala en Mis Comprobantes` : '')
            + (final.avisoConsulta ? ' — no se pudo verificar en la consulta de AFIP' : '') + motivo,
        error: final.success ? null : (final.message || final.error || null)
    });
}

/**
 * Configura los handlers IPC para el dominio de facturacion
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 */
function setupFacturaHandlers(ipcMain, mainWindow) {
    const repo = getContribuyenteRepo();

    // ========================================
    // FACTURAR y FACTURAR MERCADO PAGO
    // ========================================
    // Dos pasos SIN estado en el backend: `calcular` devuelve un "paquete" y el
    // front lo manda entero a `emitir`. Así cada pantalla factura lo SUYO (antes
    // Facturar y MP compartían variables acá y una podía emitir lo de la otra).

    // factura:calcular → { success, paquete: { codigo, usuario, empresaElegida } }
    ipcMain.handle('factura:calcular', async (event, data) => {
        try {
            // El tipo (B/C) lo decide el backend con el cliente GUARDADO, no lo que
            // trae el front. Manda el sistema del PDV elegido: un mismo cliente puede
            // tener PDV de los dos sistemas (ej. pasó de RI a Monotributo y conserva
            // los viejos) y AFIP emite la letra de ESE PDV. Si el PDV no trae sistema,
            // queda el tipo del cliente (cargado o deducido de sus PDV).
            const usuario = data.usuario || {};
            const cuit = usuario.cuit || usuario.cuil;
            const guardado = cuit ? await repo.getByCuit(String(cuit)) : null;
            //
            // Si viene del form de Facturar (`tipoContribuyenteElegido`, siempre visible
            // y ya ajustado a la letra del PDV), manda lo que eligió el usuario y se
            // guarda en el cliente. Mercado Pago no lo manda: sigue el orden de antes.
            const elegido = (data.tipoContribuyenteElegido === 'B' || data.tipoContribuyenteElegido === 'C')
                ? data.tipoContribuyenteElegido : null;
            if (guardado) {
                const numeroPdv = normalizarNumeroPdv(data.puntoDeVenta || data.puntoVenta);
                const pdv = (guardado.puntosDeVenta || []).find(p => p.numero === numeroPdv);
                const tipo = elegido || tipoContribuyenteDesdePuntosDeVenta(pdv ? [pdv] : []) || guardado.tipoContribuyente;
                if (tipo) {
                    usuario.tipoContribuyente = tipo;
                    data.tipoContribuyente = tipo;
                }
                if (elegido && elegido !== guardado.tipoContribuyente) {
                    await repo.actualizar(guardado.cuit, { tipoContribuyente: elegido });
                    console.log(`Tipo de contribuyente de ${guardado.cuit}: ${guardado.tipoContribuyente || '(vacío)'} → ${elegido} (elegido en Facturar).`);
                }
            }
            if (data.tipoContribuyente == null) data.tipoContribuyente = usuario.tipoContribuyente;

            const codigo = comunicacionConFactura(data);
            if (!codigo || !(codigo.montoResultados?.facturasGeneradas?.length > 0)) {
                return { success: false, error: 'No salió ninguna factura con esos datos: revisá el período y el monto.' };
            }
            return { success: true, paquete: { codigo, usuario, empresaElegida: data.empresaElegida || null } };
        } catch (error) {
            console.error('Error en factura:calcular:', error);
            return { success: false, error: error.message };
        }
    });

    // factura:emitir({ paquete, test, visible, desde, servicio }) → resultado final
    // (siempre contesta: éxito, error, cancelado o navegador cerrado)
    ipcMain.handle('factura:emitir', async (event, { paquete, test, visible, desde, servicio } = {}) => {
        try {
            const usuario = (paquete && paquete.usuario) || {};
            const cuitObjetivo = usuario.cuit || usuario.cuil;
            if (!paquete || !paquete.codigo || !cuitObjetivo) {
                return { success: false, error: 'Faltan los datos a facturar: volvé a procesar el formulario.' };
            }
            // Sin tipo (B/C) el flujo no sabe qué comprobante emitir y abortaba recién
            // adentro de AFIP. Se frena antes de abrir el navegador.
            const tipo = usuario.tipoContribuyente;
            if (tipo !== 'B' && tipo !== 'C') {
                const error = `Falta el tipo de contribuyente (B = Responsable Inscripto / C = Monotributo) del cliente ${cuitObjetivo}: cargalo en Clientes o volvé a analizarlo.`;
                console.warn(`✗ ${error}`);
                return { success: false, error };
            }

            // Modelo plano: el LOGIN lo resuelve el backend con resolverAcceso (la
            // clave no viaja por el renderer). Para un representado entra por su representante.
            const acceso = await repo.resolverAcceso(String(cuitObjetivo), 'afip');
            if (!acceso) {
                return { success: false, error: `El contribuyente ${cuitObjetivo} no tiene acceso AFIP (ni clave propia ni representante)` };
            }
            const credenciales = {
                usuario: acceso.loginCuit,
                contrasena: acceso.loginClave,
                // Razón social canónica de AFIP (misma que usan los otros handlers).
                // El nombre que arma el frontend puede venir como "Nombre Apellido",
                // pero AFIP lista a las personas físicas como "APELLIDO NOMBRE": si le
                // pasamos ese, el selector de empresa no matchea. objetivoNombre sale
                // de nombreDe() → razón social, que es exactamente el texto del botón.
                nombreEmpresa: acceso.objetivoNombre || paquete.empresaElegida
            };

            // Log de inicio SIN clave (la consola se guarda en logs/AAAA-MM-DD.log).
            // Muestra el login real: para un representado es el CUIT del representante.
            const viaRepresentante = String(acceso.loginCuit) !== String(cuitObjetivo);
            console.log(`Iniciando proceso AFIP: cliente ${cuitObjetivo} → login con ${acceso.loginCuit}`
                + `${viaRepresentante ? ' (representante)' : ''}, empresa "${credenciales.nombreEmpresa}"`
                + `, modo prueba: ${test ? 'sí' : 'no'}`);

            // Reintento: `desde` = cuántas ya salieron en la corrida anterior; se
            // factura solo el resto (los índices del flujo quedan alineados).
            const datos = recortarDesde(paquete.codigo, desde);
            const avance = {
                desde: datos.desde,
                total: datos.total,
                emitidas: 0,
                confirmando: null
            };
            const cliente = clienteFactura(usuario) || {};
            const enviarProgreso = (aviso) => {
                if (aviso.tipo === 'confirmando') avance.confirmando = aviso.indice;
                else if (aviso.tipo === 'emitida') { avance.emitidas++; avance.confirmando = null; }
                else if (aviso.tipo === 'progreso' && !event.sender.isDestroyed()) {
                    event.sender.send('factura:update', {
                        ...aviso, nombre: cliente.nombre || '', cuit: cuitObjetivo
                    });
                }
            };

            // El código ya viene procesado: el unificado lo detecta como 'simple'.
            const resultado = await facturaManagerUnificado.iniciarProceso(
                URL_LOGIN_AFIP,
                credenciales,
                datos.codigo,
                test,
                usuario,
                paquete.empresaElegida,
                enviarProgreso,
                { visible } // false = navegador oculto
            );
            await aprenderPdvHabilitados(cuitObjetivo, resultado, datos.codigo);
            await aprenderTipoDelPdv(cuitObjetivo, resultado);

            // Si se cortó confirmando una, no se sabe si AFIP la grabó: queda dudosa
            // (el reintento arranca después de ella para no duplicarla).
            const exito = resultado && resultado.success;
            const dudosa = !exito && avance.confirmando !== null;
            const final = {
                ...resultado,
                avance: {
                    desde: avance.desde,                   // resueltas en corridas anteriores
                    total: avance.desde + avance.total,    // todas las del lote
                    aEmitir: avance.total,                 // las de esta corrida
                    emitidas: avance.emitidas,             // las que salieron en esta corrida
                    dudosa: dudosa ? avance.desde + avance.confirmando + 1 : null   // n° de factura (1..N)
                }
            };
            if (!test) registrarCorrida(servicio, cliente, final);
            return final;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ========================================
    // FLUJO NUEVO: FACTURA TIPIFICADA
    // ========================================

    // Handler: facturaTipificada:generar
    // Genera una factura tipificada individual
    ipcMain.handle('facturaTipificada:generar', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud para generar factura tipificada');
        console.log('Datos recibidos:', JSON.stringify(datos, null, 2));

        const { usuarioSeleccionado, ...datosFactura } = datos;

        if (!usuarioSeleccionado) {
            return {
                success: false,
                message: 'No se recibio informacion del usuario seleccionado'
            };
        }

        try {
            // Modelo plano: el login lo resuelve el backend (representante si aplica).
            // No se confía en la claveAFIP del frontend.
            const acceso = await repo.resolverAcceso(String(usuarioSeleccionado.cuit || usuarioSeleccionado.cuil), 'afip');
            if (!acceso) {
                return {
                    success: false,
                    message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante)'
                };
            }
            const credenciales = {
                usuario: acceso.loginCuit,
                contrasena: acceso.loginClave,
                nombreEmpresa: acceso.objetivoNombre   // razón social del contribuyente
            };

            console.log(`Generando factura para: ${usuarioSeleccionado.nombre} (${credenciales.usuario})`);

            // Agregar modulo para que el unificado detecte el tipo
            datosFactura.modulo = 'facturaCliente';

            // Llamar al manager unificado
            const resultado = await facturaManagerUnificado.iniciarProceso(
                'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
                credenciales,
                datosFactura,
                false, // test mode = false
                usuarioSeleccionado,
                // Priorizar el puntoVenta elegido por el usuario en el selector frontend.
                // El fallback al primer nombre de empresa queda por retrocompatibilidad
                // con flujos viejos que no mandaban puntoVenta explícito.
                datosFactura.puntoVenta || listarRazonesSociales(usuarioSeleccionado)[0] || '0001'
            );

            console.log('Resultado de facturacion:', resultado);
            await aprenderTipoDelPdv(usuarioSeleccionado.cuit || usuarioSeleccionado.cuil, resultado);

            historialRepo.registrar({
                dominio: 'factura', accion: 'generar', estado: resultado?.success ? 'exito' : 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: resultado?.success ? 'Factura tipificada generada' : 'Fallo al generar factura',
                error: resultado?.success ? null : (resultado?.message || null)
            });

            return resultado;

        } catch (error) {
            console.error('BACKEND: Error al generar factura tipificada:', error);
            historialRepo.registrar({
                dominio: 'factura', accion: 'generar', estado: 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: 'Fallo al generar factura', error: error.message
            });
            return {
                success: false,
                message: `Error al generar factura: ${error.message}`,
                error: error.toString()
            };
        }
    });

    // ========================================
    // FLUJO NUEVO: LOTE DE FACTURAS TIPIFICADAS
    // ========================================

    // Handler: facturaTipificada:generarLote
    // Genera un lote de facturas tipificadas
    ipcMain.handle('facturaTipificada:generarLote', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud para generar LOTE de facturas tipificadas');

        // Normalizar al shape nuevo { grupos: [{ datosComunes, facturas }, ...] }.
        // Compat: shape viejo { datosComunes, facturas } -> un solo grupo.
        let grupos = datos.grupos;
        if (!Array.isArray(grupos)) {
            if (datos.datosComunes && Array.isArray(datos.facturas)) {
                grupos = [{ datosComunes: datos.datosComunes, facturas: datos.facturas }];
            } else {
                return { success: false, message: 'No hay facturas para generar' };
            }
        }

        // El usuario logueado es el mismo para todos los grupos (cambia el cabezal,
        // no la cuenta AFIP). Lo tomamos del primer grupo.
        const usuario = grupos[0]?.datosComunes?.usuarioSeleccionado;
        if (!usuario) {
            return {
                success: false,
                message: 'No se recibio informacion del usuario seleccionado'
            };
        }

        // Total de comprobantes sumando todos los grupos.
        const totalComprobantes = grupos.reduce((s, g) => s + (g.facturas?.length || 0), 0);
        if (totalComprobantes === 0) {
            return {
                success: false,
                message: 'No hay facturas para generar'
            };
        }

        // Modo prueba global (lo setea el frontend igual en todos los grupos).
        const modoTest = grupos[0]?.datosComunes?.modoTest || false;

        console.log(`Generando ${grupos.length} factura(s) distinta(s), ${totalComprobantes} comprobante(s) para: ${usuario.nombre}`);

        // Credenciales: el emisor es el mismo en todos los grupos (cambia el
        // cabezal / receptor, no la cuenta AFIP). El login lo resuelve el backend.
        const primerGrupo = grupos[0].datosComunes;
        const acceso = await repo.resolverAcceso(String(usuario.cuit || usuario.cuil), 'afip');
        if (!acceso) {
            return {
                success: false,
                message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante)'
            };
        }
        const credenciales = {
            usuario: acceso.loginCuit,
            contrasena: acceso.loginClave,
            nombreEmpresa: primerGrupo.nombreEmpresa || acceso.objetivoNombre
        };

        // Todos los comprobantes en orden, cada uno con su cabezal: van en UN login.
        // Cada uno sabe su `grupo` (índice en `grupos`): si el lote se corta, el
        // front saca los grupos ya emitidos y reintentar no los re-emite.
        const lote = grupos.flatMap((grupo, indiceGrupo) => (grupo.facturas || []).map((factura, i) => {
            const dc = grupo.datosComunes;
            return {
                grupo: indiceGrupo,
                indiceEnGrupo: i,
                cliente: (dc.receptor?.nombreCliente || '').trim() || dc.receptor?.numeroDocumento || '',
                datosFactura: {
                    ...dc,
                    lineasDetalle: factura.lineasDetalle,
                    usuarioSeleccionado: dc.usuarioSeleccionado,
                    modulo: 'facturaCliente'  // Para que el unificado detecte el tipo
                }
            };
        }));
        // Modo prueba: solo el primer comprobante, sin confirmar.
        const aCorrer = modoTest ? lote.slice(0, 1) : lote;
        if (modoTest) console.log('🧪 MODO PRUEBA: Solo se procesará el primer comprobante sin confirmar');

        const { resultados: porComprobante, cortadoPor, resultado } = await loteEnUnaSesion({
            sender: event.sender, canal: 'facturaTipificada:update', queEs: 'Comprobante',
            nombres: aCorrer.map(c => c.cliente),
            correr: (enviarProgreso) => facturaManagerUnificado.iniciarProceso(
                'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
                credenciales,
                aCorrer.map(c => c.datosFactura),
                modoTest,
                usuario,
                // Priorizar el puntoVenta elegido en el selector frontend.
                primerGrupo.puntoVenta || listarRazonesSociales(usuario)[0] || '0001',
                enviarProgreso,
                { visible: datos.visible } // una sola elección para todo el lote
            )
        });

        // Lo que el paso 0 vio de los PDV (queda en el datosFactura que pasó por ahí).
        // Si un comprobante cortó el lote por el PDV, ese es el que manda.
        const cuitEmisor = usuario.cuit || usuario.cuil;
        const iCorte = porComprobante.findIndex(r => r && r.cortaLote);
        const conPdv = iCorte >= 0 ? aCorrer[iCorte] : aCorrer.find(c => c.datosFactura.pdvHabilitadosAfip);
        const resultadoPdv = iCorte >= 0 ? porComprobante[iCorte] : (modoTest ? resultado : { success: true });
        const pdvNoHabilitado = conPdv ? await aprenderPdvHabilitados(cuitEmisor, resultadoPdv, conPdv.datosFactura) : null;
        const tipoCorregido = await aprenderTipoDelPdv(cuitEmisor, resultadoPdv);

        if (modoTest) {
            if (cortadoPor) {
                return { success: false, modoTest: true, error: resultado.error, message: resultado.message };
            }
            // Si falló, NO es "revisá la captura": no se llegó a sacarla.
            if (!resultado || resultado.success === false) {
                const mensaje = resultado?.message || resultado?.error || 'La factura de prueba no se pudo generar.';
                console.warn(`🧪 MODO PRUEBA con error: ${mensaje}`);
                return { success: false, modoTest: true, message: mensaje, tipoCorregido, pdvNoHabilitado };
            }
            console.log('🧪 MODO PRUEBA completado - Revisa la captura');
            return {
                success: true,
                modoTest: true,
                message: 'Modo PRUEBA completado - Revisa la captura para verificar los datos',
                screenshotPath: resultado.screenshotPath,
                resultados: [{ success: true, modoTest: true, numeroFactura: 1, message: 'Modo prueba - factura NO confirmada' }]
            };
        }

        // Un resultado por comprobante intentado (sin resultado = no se intentó).
        const resultados = [];
        porComprobante.forEach((r, i) => {
            if (!r) return;
            const c = aCorrer[i];
            const mensaje = r.success ? 'Factura generada' : (r.error || r.message || 'La factura no se pudo generar');
            resultados.push({
                success: !!r.success,
                grupo: c.grupo,
                indiceEnGrupo: c.indiceEnGrupo,
                numeroFactura: i + 1,
                ...(r.success ? { pdfPath: r.pdfPath || null } : { dudosa: !!r.dudosa, error: mensaje }),
                ...(r.cortado ? { cortado: r.cortado } : {}),
                message: mensaje
            });
            console.log(`[${i + 1}/${totalComprobantes}] ${r.success ? 'Comprobante generado' : `Comprobante NO generado: ${mensaje}`}`);
        });

        if (cortadoPor) {
            console.warn(`Lote cortado: ${cortadoPor === 'cancelado' ? 'cancelado por el usuario' : 'se cerró el navegador'}.`);
        } else if (tipoCorregido) {
            console.warn(`Lote cortado: AFIP indica que el PDV ${tipoCorregido.puntoVenta} es ${tipoCorregido.letra}; se corrigió el cliente, revisá el tipo de comprobante y volvé a generar.`);
        } else if (pdvNoHabilitado) {
            console.warn(`Lote cortado: AFIP no habilita el PDV ${pdvNoHabilitado.elegido}; ofrece ${pdvNoHabilitado.habilitados.join(', ')}.`);
        }

        // Resumen final
        const exitosas = resultados.filter(r => r.success).length;
        const fallidas = resultados.filter(r => !r.success).length;

        console.log(`\nRESUMEN DEL LOTE:`);
        console.log(`   Total: ${resultados.length}`);
        console.log(`   Exitosas: ${exitosas}`);
        console.log(`   Fallidas: ${fallidas}\n`);

        // Una sola entrada-resumen por lote (no una por comprobante: sería ruido).
        const dudosas = resultados.filter(r => r.dudosa).length;
        const noIntentadas = totalComprobantes - resultados.length;
        const estadoLote = (fallidas === 0 && noIntentadas === 0) ? 'exito' : (exitosas === 0 ? 'error' : 'parcial');
        historialRepo.registrar({
            dominio: 'factura', accion: 'generarLote', estado: estadoLote,
            cliente: clienteFactura(usuario),
            resumen: `Lote de facturas: ${exitosas} de ${totalComprobantes} ok, ${fallidas} fallida/s`
                + (dudosas ? `, ${dudosas} dudosa/s (revisar en Mis Comprobantes)` : '')
                + (cortadoPor ? ` — ${cortadoPor === 'cancelado' ? 'cancelado por el usuario' : 'se cerró el navegador'}` : ''),
            detalle: { total: totalComprobantes, exitosas, fallidas, dudosas, noIntentadas, cortadoPor }
        });

        return {
            success: true,
            message: `Lote procesado: ${exitosas} exitosas, ${fallidas} fallidas`,
            resultados: resultados,
            // 'cancelado' | 'cerrado' | null: los comprobantes sin resultado no se intentaron.
            cortadoPor,
            // AFIP corrigió el tipo del PDV: la pantalla se actualiza con esto.
            tipoCorregido,
            // AFIP no habilita el PDV elegido: { habilitados, elegido } para recargar el desplegable.
            pdvNoHabilitado,
            // Grupos con TODOS sus comprobantes emitidos (índices en `grupos`).
            gruposEmitidos: grupos.flatMap((g, i) => {
                const cantidad = (g.facturas || []).length;
                const ok = resultados.filter(r => r.grupo === i && r.success).length;
                return cantidad > 0 && ok === cantidad ? [i] : [];
            }),
            resumen: {
                total: resultados.length,
                exitosas: exitosas,
                fallidas: fallidas
            }
        };
    });

    // ========================================
    // FLUJO NUEVO: FACTURAS DE CLIENTE
    // ========================================

    // Handler: facturaCliente:generar
    // Genera facturas de cliente con progreso en tiempo real
    ipcMain.handle('facturaCliente:generar', async (event, datos) => {
        console.log('--- DATOS RECIBIDOS (facturaCliente:generar) ---');
        console.log(JSON.stringify(datos, null, 2));
        console.log('-------------------------------------------------');

        const { usuarioSeleccionado, facturas, modoTest, ...datosComunes } = datos;

        if (!usuarioSeleccionado) {
            return {
                success: false,
                message: 'No se recibio informacion del usuario seleccionado'
            };
        }

        // Modelo plano: el login lo resuelve el backend (representante si aplica).
        const acceso = await repo.resolverAcceso(String(usuarioSeleccionado.cuit || usuarioSeleccionado.cuil), 'afip');
        if (!acceso) {
            return {
                success: false,
                message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante)'
            };
        }
        const credenciales = {
            usuario: acceso.loginCuit,
            contrasena: acceso.loginClave,
            nombreEmpresa: acceso.objetivoNombre
        };

        try {
            // Funcion callback para enviar progreso
            const enviarProgreso = (datosProgreso) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('facturaCliente:progreso', datosProgreso);
                }
            };

            // Preparar datos para el flujo (pueden ser array o objeto unico)
            const datosParaFlujo = facturas || datos;

            // Agregar modulo para que el unificado detecte el tipo
            if (Array.isArray(datosParaFlujo)) {
                datosParaFlujo.forEach(f => f.modulo = 'facturaCliente');
            } else {
                datosParaFlujo.modulo = 'facturaCliente';
            }

            // Ejecutar el flujo de facturacion usando el manager unificado
            const resultado = await facturaManagerUnificado.iniciarProceso(
                'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
                credenciales,
                datosParaFlujo,
                modoTest || false,
                usuarioSeleccionado,
                // Priorizar el puntoVenta elegido en el selector frontend.
                datosComunes.puntoVenta || listarRazonesSociales(usuarioSeleccionado)[0] || '0001',
                enviarProgreso
            );

            // Enviar resultado final
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('facturaCliente:resultado', resultado);
            }

            historialRepo.registrar({
                dominio: 'factura', accion: 'generarCliente', estado: resultado?.success ? 'exito' : 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: resultado?.success ? 'Factura(s) de cliente generada(s)' : 'Fallo al generar factura de cliente',
                error: resultado?.success ? null : (resultado?.message || null)
            });

            return resultado;

        } catch (error) {
            console.error('Error en facturaCliente:generar:', error);

            const errorResult = {
                success: false,
                message: error.message,
                error: error.toString()
            };

            // Enviar resultado de error
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('facturaCliente:resultado', errorResult);
            }

            historialRepo.registrar({
                dominio: 'factura', accion: 'generarCliente', estado: 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: 'Fallo al generar factura de cliente', error: error.message
            });

            return errorResult;
        }
    });
}

module.exports = setupFacturaHandlers;
