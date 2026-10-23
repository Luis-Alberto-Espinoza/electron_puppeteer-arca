// comun/avisoProgreso.js
// Arma el AVISO DE PROGRESO con el contrato único que entiende la rueda del frontend
// (frontend_js/componentes/rueda/rueda.js → recibirAviso):
//
//   { tipo, id, cuit, nombre, estado, mensaje, procesados, total, ...datos extra }
//
// - El cliente va en campos sueltos (id, cuit, nombre) y el mensaje NUNCA lleva su nombre:
//   la rueda lo muestra en su propio renglón.
// - procesados = clientes que YA terminaron (lo avanza el lote con clienteTerminado()).
// - Nunca tira errores: si mandar el aviso falla, se anota en consola y el servicio SIGUE.
//   (Un aviso es informativo; no puede cortar una descarga a la mitad.)
//
// Uso en un manager de lote:
//   const aviso = crearAvisoProgreso(enviarProgreso, usuarios.length);
//   aviso.general('Iniciando ... para 3 cliente(s).');
//   for (...) {
//       const avisarCliente = aviso.paraCliente({ id, cuit, nombre });
//       avisarCliente('info', 'Descargando...');                       // (estado, mensaje, datosExtra)
//       avisarCliente.final('exito_final', 'Listo.', { files });      // el RESULTADO del cliente (y el error del catch)
//       aviso.clienteTerminado();
//   }
//
// final: true marca el aviso con el resultado del cliente. La pantalla pasa la tarjeta a
// "Finalizados" SOLO con ese: un 'exito' o 'error' de mitad de camino no la mueve.
//   aviso.finalizado('Proceso terminado.');

function crearAvisoProgreso(enviar, total) {
    let procesados = 0;

    const mandar = (aviso) => {
        try {
            enviar(aviso);
        } catch (error) {
            console.error('[avisoProgreso] No se pudo mandar el aviso:', error.message);
        }
    };

    return {
        general(mensaje) {
            mandar({ tipo: 'general', estado: 'general', mensaje, procesados, total });
        },

        finalizado(mensaje) {
            mandar({ tipo: 'finalizado', estado: 'finalizado', mensaje, procesados, total });
        },

        /**
         * Devuelve (estado, mensaje, datosExtra) => void para los avisos de ESE cliente,
         * con .final(estado, mensaje, datosExtra) para el resultado.
         */
        paraCliente({ id, cuit, nombre } = {}) {
            const avisar = (estado, mensaje, datosExtra = {}, final = false) => {
                // Los datos extra (files, downloadDir, el resultado del flujo...) PUEDEN pisar
                // estado y mensaje, como antes (ej. Constancia: el flujo trae "procesada (sin
                // deuda)" y eso es lo que se muestra). Lo que NO pueden pisar: cliente, contador y final.
                mandar({
                    estado, mensaje,
                    ...datosExtra,
                    tipo: 'progreso',
                    id, cuit, nombre,
                    procesados, total,
                    final
                });
            };
            const avisarCliente = (estado, mensaje, datosExtra) => avisar(estado, mensaje, datosExtra, false);
            avisarCliente.final = (estado, mensaje, datosExtra) => avisar(estado, mensaje, datosExtra, true);
            return avisarCliente;
        },

        clienteTerminado() {
            procesados = Math.min(procesados + 1, total);
        }
    };
}

module.exports = { crearAvisoProgreso };
