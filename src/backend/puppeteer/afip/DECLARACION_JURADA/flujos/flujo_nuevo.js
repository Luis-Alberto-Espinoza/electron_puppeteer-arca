// flujo_nuevo.js
// Flujo REAL de alta de DDJJ por "Nuevo" (modo prueba: frena antes de Aceptar).
//   paso_1: buscar "Mis Aplicaciones Web" → portal fenix
//   paso_4: click "Nuevo"
//   paso_5: seleccionar CUIT asociado (si corresponde)
//   paso_6: Organismo → Formulario → Período Fiscal
//   [paso_7 Aceptar: pendiente — solo si !modoPrueba]
//
// El login ya lo hizo el manager antes de delegar acá.

const paso1 = require('../codigoXpagina/paso_1_abrirMisAplicaciones.js');
const paso4 = require('../codigoXpagina/paso_4_clickNuevo.js');
const paso5 = require('../codigoXpagina/paso_5_seleccionarCuitAsociado.js');
const paso6 = require('../codigoXpagina/paso_6_completarFormularioDDJJ.js');
const paso7 = require('../codigoXpagina/paso_7_aceptar.js');
const paso8 = require('../codigoXpagina/paso_8_irADeterminacion.js');
const paso9 = require('../codigoXpagina/paso_9_clickDetallar.js');
const paso11 = require('../codigoXpagina/paso_11_cargarBase.js');
const paso12 = require('../codigoXpagina/paso_12_aceptarDetalle.js');
const paso13 = require('../codigoXpagina/paso_13_completarTotales.js');
const paso14 = require('../codigoXpagina/paso_14_siguiente.js');
const paso18 = require('../codigoXpagina/paso_18_cargarRetenciones.js');
const pasoLiq = require('../codigoXpagina/paso_completarLiquidacion.js');
const pasoLeerDed = require('../codigoXpagina/paso_leerDeducciones.js');
const paso17 = require('../codigoXpagina/paso_17_siguiente.js');
const paso19 = require('../codigoXpagina/paso_19_grabar.js');
// Pasos exploratorios (NO en el flujo, se corren a mano para relevar):
//   paso_10 (volcar Determinación), paso_15 (detectar "+"), paso_16/16b/16c (una retención).
// Datos manuales HARDCODEADOS (bandera DatoAModificarPorExcel). Mañana vienen del frontend.
const datosManuales = require('../codigoXpagina/_datosManuales.js');

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} payload      { cliente, empresaObjetivo, organismo, formulario, periodo, modoPrueba }
 * @param {Object} credenciales { usuario, contrasena } — por re-login intermedio.
 */
async function ejecutar(page, payload, credenciales) {
    const { empresaObjetivo, organismo, formulario, periodo, retenciones, modelo, fechaPago, grabar = false } = payload || {};

    // Retenciones: las del frontend (payload) si vienen con al menos una ruta; si no, el hardcode.
    // Cada valor puede ser una ruta (string) o varias (array).
    const tieneRuta = (v) => Array.isArray(v) ? v.some(x => x && String(x).trim()) : (v && String(v).trim());
    const retencionesFront = retenciones && Object.values(retenciones).some(tieneRuta)
        ? retenciones : datosManuales.retenciones;
    const datosRetenciones = { retenciones: retencionesFront };

    // Base/alícuota POR ACTIVIDAD: del Excel (modelo) si vino; si no, el hardcode (1 sola).
    // Join 1 por CÓDIGO ("Actividad id"): cada actividad se carga en su fila de AFIP.
    let listaActividades;
    if (modelo) {
        // Vino Excel → EXIGIMOS que tenga actividades para este período. Vacío = cortar con
        // error claro, NO caer al hardcode (cargaría datos de otro cliente sin avisar). El
        // handler ya lo filtra antes del login; esto es la doble red por si llega igual.
        if (!Array.isArray(modelo.actividades) || !modelo.actividades.length) {
            const msg = `El Excel (${modelo.hoja || 'hoja'}) no tiene actividades con base para el período ${modelo.periodo || periodo}.`;
            console.error('[DDJJ flujo_nuevo] ⛔ ' + msg);
            return { success: false, error: 'EXCEL_SIN_DATOS', message: msg };
        }
        listaActividades = modelo.actividades.map(a => ({
            codigo: a.codigo || null,
            actividad: a.actividad,
            alicuotaObjetivo: Number(a.alicuota) * 100,            // 0.03 → 3 (como en el popup)
            base: Number(a.base).toFixed(2).replace('.', ',')       // 88777.66 → "88777,66"
        }));
        console.log(`[DDJJ flujo_nuevo] ${listaActividades.length} actividad(es) del Excel:`);
        listaActividades.forEach(a => console.log(`   código ${a.codigo || '(sin id)'} · alícuota ${a.alicuotaObjetivo} · base ${a.base} · ${a.actividad}`));
    } else {
        // SIN Excel (corrida de prueba a propósito) → hardcode de desarrollo.
        listaActividades = [{ codigo: null, actividad: '(hardcode)', alicuotaObjetivo: datosManuales.alicuotaObjetivo, base: datosManuales.base }];
        console.warn(`[DDJJ flujo_nuevo] ⚠️ SIN Excel → base HARDCODE de prueba (${datosManuales.base}). NO usar en producción.`);
    }

    try {
        const fenixPage = await paso1.ejecutar(page, credenciales);

        await paso4.ejecutar(fenixPage);

        const resCuit = await paso5.ejecutar(fenixPage, empresaObjetivo);

        const resForm = await paso6.ejecutar(fenixPage, { organismo, formulario, periodo });

        // Siempre corremos el flujo completo (Aceptar + cargar). "Aceptar" sin "Grabar"
        // NO persiste → la simulación es segura. Lo único que persiste es Grabar (paso_19).
        let resAceptar = null;
        let resCarga = null;
        let resTotales = null;
        let resSiguiente = null;
        let resRetenciones = null;
        let resLiquidacion = null;
        let resDeducciones = null;
        let resSiguiente2 = null;
        let resGrabar = null;
        {
            resAceptar = await paso7.ejecutar(fenixPage);

            // Si el alta avanzó: Determinación → por CADA actividad: abrir su "+" (por código)
            // → cargar base/alícuota → Aceptar (vuelve a Determinación) → totales → Liquidación → retenciones.
            if (resAceptar.status === 'aceptado') {
                await paso8.ejecutar(fenixPage);

                const cargas = [];
                for (const act of listaActividades) {
                    const abrir = await paso9.ejecutar(fenixPage, act.codigo);
                    if (!abrir.abierto) {
                        console.warn(`[DDJJ flujo_nuevo] No abrí la actividad ${act.codigo || '(?)'} (${act.actividad}).`);
                        cargas.push({ codigo: act.codigo, actividad: act.actividad, ok: false, motivo: 'no abrió el "+"' });
                        continue;
                    }
                    const rc = await paso11.ejecutar(fenixPage, act);
                    await paso12.ejecutar(fenixPage);   // Aceptar el detalle → vuelve a Determinación
                    cargas.push({ codigo: act.codigo, actividad: act.actividad, ok: !!(rc && rc.success), impuesto: rc && rc.impuestoCalculado });
                }
                const basesOk = cargas.filter(c => c.ok).length;
                resCarga = {
                    success: basesOk > 0, basesOk, total: listaActividades.length, cargas,
                    resumen: ['--- base por actividad ---',
                        ...cargas.map(c => `  ${c.actividad} (${c.codigo || '-'}): ${c.ok ? `✅ imp ${c.impuesto || ''}` : `❌ ${c.motivo || 'no cargó'}`}`)].join('\n')
                };

                // Si se cargó al menos una actividad, seguimos con totales/Liquidación/retenciones.
                if (resCarga.success) {
                    resTotales = await paso13.ejecutar(fenixPage, datosManuales);
                    resSiguiente = await paso14.ejecutar(fenixPage);          // → Liquidación
                    resRetenciones = await paso18.ejecutar(fenixPage, datosRetenciones); // loop "+" + IMPORTAR
                    // Campos editables de Liquidación: fecha de pago (frontend) + saldo a favor
                    // anterior (Excel). Se hace acá, ya cargadas las retenciones, antes de avanzar.
                    resLiquidacion = await pasoLiq.ejecutar(fenixPage, {
                        fechaPago,
                        saldoAFavorAnterior: modelo ? modelo.safAnterior : 0
                    });
                    // Leer (read-only) los importes que AFIP calculó por deducción, antes de avanzar.
                    resDeducciones = await pasoLeerDed.ejecutar(fenixPage);
                    resSiguiente2 = await paso17.ejecutar(fenixPage);         // → Consistencia IVA
                    // Grabar el BORRADOR solo si el usuario lo pidió (persiste en AFIP).
                    if (grabar) resGrabar = await paso19.ejecutar(fenixPage);
                    else console.log('[DDJJ flujo_nuevo] No se graba (checkbox Grabar desactivado).');
                }
            }
        }

        const lineaAceptar = resAceptar.status === 'aceptado'
            ? `Aceptar: ✅ formulario creado/abierto`
            : (resAceptar.status === 'borrador-existente'
                ? `Aceptar: ⚠️ ya existe un BORRADOR/EN PROCESO → recuperalo con "Buscar". Msg: ${resAceptar.mensaje}`
                : `Aceptar: ❌ ${resAceptar.mensaje || 'error de validación'}`);

        const resumen = [
            `--- Alta "Nuevo" (${grabar ? 'CON Grabar — PERSISTE' : 'SIMULACIÓN — no graba'}) ---`,
            `Empresa:    ${resCuit.seleccionado ? '✅ ' + resCuit.texto : (resCuit.skipped ? '— sin asociados (form directo)' : '❌')}`,
            `Organismo:  ${resForm.organismoOk ? '✅' : '❌'} "${resForm.valorOrganismo || ''}"`,
            `Formulario: ${resForm.formularioOk ? '✅' : '❌'} "${resForm.valorFormulario || ''}"`,
            `Período:    ${resForm.periodoOk ? '✅' : '❌'} "${resForm.valorPeriodo || ''}"`,
            lineaAceptar,
            resCarga ? '\n' + resCarga.resumen : '',
            resTotales ? '\n' + resTotales.resumen : '',
            resSiguiente ? '\n' + resSiguiente.resumen : '',
            resRetenciones ? '\n' + resRetenciones.resumen : '',
            resLiquidacion ? '\n' + resLiquidacion.resumen : '',
            resDeducciones ? '\n' + resDeducciones.resumen : '',
            resSiguiente2 ? '\n' + resSiguiente2.resumen : '',
            resGrabar ? '\n' + resGrabar.resumen : ''
        ].join('\n');

        console.log('[DDJJ flujo_nuevo]\n' + resumen);

        return {
            success: true,
            modo: 'nuevo',
            grabado: grabar,
            cliente: payload && payload.cliente,
            url: fenixPage.url(),
            empresa: resCuit,
            formulario: resForm,
            aceptar: resAceptar,
            carga: resCarga,
            totales: resTotales,
            siguiente: resSiguiente,
            retenciones: resRetenciones,
            liquidacion: resLiquidacion,
            deducciones: resDeducciones ? resDeducciones.deducciones : null,
            siguiente2: resSiguiente2,
            grabar: resGrabar,
            resumen
        };

    } catch (error) {
        console.error('[DDJJ flujo_nuevo] Error:', error);
        return { success: false, error: 'FLUJO_ERROR', message: error.message, stack: error.stack };
    }
}

module.exports = { ejecutar };
