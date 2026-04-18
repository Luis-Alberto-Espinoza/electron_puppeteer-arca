// afip/planesDePago/datosResumenBuilder.js
// Construye el objeto `datosResumen` a partir de la salida de paso_5
// (cuotasAgrupadas + totales) y el info del plan. Usado por:
//   - resumenClienteExcel (agrega todos los planes del cliente)
//   - consolidadoExcel (agrega todos los clientes del lote)

function construir(datosTabla, infoPlan, usuario, cuitConsulta) {
    const cuotas = (datosTabla && datosTabla.cuotasAgrupadas) || [];
    const totales = (datosTabla && datosTabla.totales) || {};

    const cuotasImpagas = cuotas.filter(c => c.estaImpaga);
    const cuotasCanceladas = cuotas.filter(c => c.fueCancelada);
    const cuotasPendientes = cuotas.filter(c => !c.estaImpaga && !c.fueCancelada);

    // Monto a regularizar hoy = suma de último intento de cada impaga
    let montoRegularizar = 0;
    cuotasImpagas.forEach(c => {
        montoRegularizar += parseNumero(c.montoActualAUltimaFecha);
    });

    // Pagos con atraso en el historial
    const pagosConAtraso = cuotasCanceladas.filter(c =>
        diasEntreFechas(c.vencimientoOriginal, c.fechaPagoEfectiva) > 0
    );
    const moraPagadaTotal = parseNumero(totales.moraPagada);

    // Motivos de fallos únicos
    const motivosFallidosUnicos = new Set();
    cuotas.forEach(c => {
        (c.intentos || []).forEach(i => {
            if (i.fueFallido && i.motivo) motivosFallidosUnicos.add(i.motivo.toLowerCase());
        });
    });

    // Días vencida de la primera impaga (contra hoy)
    const hoy = new Date();
    const fechaHoyArg = formatearFechaArg(hoy);
    let diasVencidaPrimeraImpaga = 0;
    if (cuotasImpagas.length > 0) {
        diasVencidaPrimeraImpaga = diasEntreFechas(cuotasImpagas[0].vencimientoOriginal, fechaHoyArg);
    }

    // Próximo vencimiento: primera cuota pendiente (si el plan está al día)
    // o primera cuota impaga (si está atrasado)
    let proximaCuota = null;
    if (cuotasImpagas.length > 0) {
        proximaCuota = cuotasImpagas[0];
    } else if (cuotasPendientes.length > 0) {
        // Ordenar pendientes por fecha de vencimiento y tomar la más cercana
        const pendientesOrdenadas = [...cuotasPendientes].sort((a, b) => {
            const da = parseFechaArg(a.vencimientoOriginal);
            const db = parseFechaArg(b.vencimientoOriginal);
            return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
        });
        proximaCuota = pendientesOrdenadas[0];
    }

    return {
        // Identificación
        representante: usuario.nombre || '',
        representanteCuit: usuario.cuit || '',
        cuitConsultado: cuitConsulta,
        planNumero: infoPlan.numero || '',
        planCuotas: infoPlan.cuotas || '',
        planTipo: infoPlan.tipo || '',
        planConsolidado: infoPlan.consolidado || '',
        planSituacion: infoPlan.situacion || '',
        planPresentacion: infoPlan.presentacion || '',
        fechaConsulta: fechaHoyArg,

        // Estado
        cantidadImpagas: cuotasImpagas.length,
        cantidadCanceladas: cuotasCanceladas.length,
        cantidadPendientes: cuotasPendientes.length,
        cantidadTotal: cuotas.length,

        // Urgencia
        montoRegularizarHoy: montoRegularizar,
        fechaReferenciaRegularizacion: cuotasImpagas.length > 0 ? cuotasImpagas[0].fechaUltimoIntento : '',
        diasVencidaPrimeraImpaga,

        // Próximo vencimiento
        proximaCuotaNro: proximaCuota ? proximaCuota.cuotaNro : '',
        proximaCuotaFecha: proximaCuota ? proximaCuota.vencimientoOriginal : '',
        proximaCuotaMonto: proximaCuota ? parseNumero(proximaCuota.montoActualAUltimaFecha || proximaCuota.totalOriginal) : 0,
        proximaCuotaImpaga: proximaCuota ? !!proximaCuota.estaImpaga : false,

        // Señales
        cantidadPagosAtrasados: pagosConAtraso.length,
        moraPagadaTotal,
        motivosFallidos: Array.from(motivosFallidosUnicos),

        // Totales
        totalCapitalPagado: parseNumero(totales.capitalPagado),
        totalInteresFinancieroPagado: parseNumero(totales.interesFinancieroPagado),
        totalPagado: parseNumero(totales.totalPagado),

        // Detalle (para futuras iteraciones)
        cuotas,
        cuotasImpagas,

        // Clasificación
        urgencia: clasificarUrgencia(cuotasImpagas.length, diasVencidaPrimeraImpaga)
    };
}

function clasificarUrgencia(cantImpagas, diasVencida) {
    if (cantImpagas === 0) return 'ok';
    if (diasVencida > 30) return 'critico';
    return 'alerta';
}

function parseNumero(texto) {
    if (typeof texto === 'number') return texto;
    if (!texto) return 0;
    const limpio = String(texto)
        .replace(/\$/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const n = parseFloat(limpio);
    return isNaN(n) ? 0 : n;
}

function parseFechaArg(texto) {
    if (!texto) return null;
    const m = String(texto).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function formatearFechaArg(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

function diasEntreFechas(fechaDesdeStr, fechaHastaStr) {
    const d1 = parseFechaArg(fechaDesdeStr);
    const d2 = parseFechaArg(fechaHastaStr);
    if (!d1 || !d2) return 0;
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

module.exports = {
    construir,
    parseNumero,
    parseFechaArg,
    formatearFechaArg,
    diasEntreFechas
};
