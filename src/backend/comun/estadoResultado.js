// comun/estadoResultado.js
// Estado de la tarjeta del cliente en ATM Lote (guía §3.5.4: el resultado no miente).
//   todo bien → 'exito_final' (verde) · falló algo pero bajaron archivos → 'parcial' (amarillo,
//   se ven los que bajaron) · falló algo y no bajó nada → 'error' (rojo).
// El flujo avisa que algo falló con `descargaIncompleta: true`.

function estadoDelCliente(resultadoFlujo) {
    if (resultadoFlujo.descargaIncompleta !== true) return 'exito_final';
    return (resultadoFlujo.files || []).length > 0 ? 'parcial' : 'error';
}

module.exports = { estadoDelCliente };
