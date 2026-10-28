// auth.js - Lanzador de Facturación, compartido por Facturas y Mercado Pago.
//
// Las dos pantallas arman los datos a su manera y los mandan con sendFormData; el
// backend los guarda procesados (resultadoCodigo) y los devuelve por
// 'codigoLocalStorageGenerado'. Desde ahí, lanzar es igual en las dos: el
// componente lanzadorAutomatizacion (switch + 🔐 Facturar / 🧪 Modo Test, ⏹ Cancelar)
// y abajo el resultado de la corrida, con "Reintentar las que faltan".
//
// Los listeners de IPC se registran UNA sola vez para todo el módulo: Facturas y
// Mercado Pago crean cada uno su AuthManager, y si cada uno se suscribiera, se acumularían.

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

let escuchando = false;
let ultimoCodigo = null;     // lo último que procesó el backend (lo que se va a facturar)
let finPendiente = null;     // resolve de la corrida en curso (el fin llega por 'login-automatizado')

// Pantallas que saben responder a los avisos de PDV del paso 0. Cada una se
// registra con el id de su desplegable de PDV (el "ancla"): auth.js no conoce
// ninguna pantalla, solo le pasa el aviso a la que APRETÓ el botón. No sirve
// mirar cuál está visible: Facturas y Mercado Pago pueden estar abiertos a la vez.
const manejadoresPdv = new Map();   // anclaId → { noHabilitado, tipoCorregido }

/**
 * @param {string} anclaId  id del <select> de PDV de la pantalla
 * @param {{noHabilitado: function(string[], string), tipoCorregido: function({puntoVenta: string, letra: string})}} manejador
 */
export function registrarManejadorPdv(anclaId, manejador) {
    manejadoresPdv.set(anclaId, manejador);
}

function escuchar() {
    if (escuchando || !window.electronAPI) return;
    escuchando = true;
    window.electronAPI.onCodigoLocalStorageGenerado((codigo) => {
        ultimoCodigo = codigo;
        // Datos nuevos: el resultado (y su "Reintentar") era de los anteriores.
        document.querySelectorAll('.factura-resultado').forEach(div => div.remove());
    });
    // El backend contesta SIEMPRE por acá (éxito, error o cancelado).
    window.electronAPI.onFinProcesoAfip((resultado) => {
        const resolver = finPendiente;
        finPendiente = null;
        if (resolver) resolver(resultado);
    });
    window.electronAPI.onFacturaUpdate((aviso) => {
        if (window.ruedaTrabajando) window.ruedaTrabajando.recibirAviso(aviso);
    });
}

function cantidadFacturas() {
    return ultimoCodigo?.montoResultados?.facturasGeneradas?.length || 0;
}

function el(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

export class AuthManager {
    constructor() {
        this.lanzador = null;
        this.contenedor = null;
        this.pdvAnclaId = null;
        this.nombreServicio = 'Facturación';
        this.servicio = 'factura';
    }

    /**
     * @param {object} config
     * @param {string} [config.contenedorId]   div vacío donde va el lanzador
     * @param {string} [config.pdvAnclaId]     ver registrarManejadorPdv
     * @param {string} [config.nombreServicio] título de la rueda: "ARCA · Facturación"
     * @param {string} [config.servicio]       'factura' | 'mercadopago' (para el historial)
     * @param {string} [config.avisoAlEmitir]  advertencia que se suma al modal de Facturar (no frena)
     */
    inicializar(config = {}) {
        const {
            contenedorId = 'lanzadorFactura',
            pdvAnclaId = 'selectPuntoDeVentaFactura',
            nombreServicio = 'Facturación',
            servicio = 'factura',
            avisoAlEmitir = null
        } = config;

        this.pdvAnclaId = pdvAnclaId;
        this.nombreServicio = nombreServicio;
        this.servicio = servicio;
        this.contenedor = document.getElementById(contenedorId);
        escuchar();
        if (!this.contenedor) return;

        const rueda = (esTest) => ({
            servicio: 'ARCA',
            subservicio: nombreServicio,
            mensaje: esTest ? 'Iniciando sesión en AFIP (modo prueba)…' : 'Iniciando sesión en AFIP…'
        });

        this.lanzador = window.lanzadorAutomatizacion.crear(this.contenedor, {
            acciones: [{
                texto: 'Facturar en AFIP',
                tipo: 'principal',
                nota: 'Facturación real',
                preparar: () => this._preparar(),
                confirmar: () => ({
                    title: 'Facturar en AFIP',
                    icon: '🔐',
                    confirmText: 'Emitir',
                    message: `Vas a emitir ${cantidadFacturas()} factura(s) REALES en AFIP.\n`
                        + 'Una factura emitida no se deshace: se anula con nota de crédito.'
                        + (avisoAlEmitir ? `\n\n⚠ ${avisoAlEmitir}` : '')
                }),
                confirmarCancelar: () => ({
                    title: '¿Cancelar la facturación?',
                    message: 'Las facturas que ya se emitieron quedan emitidas en AFIP: cancelar no las borra.\n'
                        + 'Al terminar vas a ver cuántas salieron y vas a poder reintentar las que faltan.'
                }),
                rueda: rueda(false),
                ejecutar: (datos, { visible }) => this._correr(false, visible, datos.desde)
            }, {
                texto: 'Modo Test',
                tipo: 'prueba',
                nota: 'Prueba: no confirma la factura',
                preparar: () => this._preparar(),
                rueda: rueda(true),
                ejecutar: (datos, { visible }) => this._correr(true, visible, 0)
            }]
        });
        this.lanzador.habilitar(true);
    }

    _preparar() {
        if (cantidadFacturas() > 0) return { desde: 0 };
        this._mostrarResultado({ success: false, message: 'Primero procesá los datos: no hay facturas para emitir.' }, false);
        return null;
    }

    async _correr(esTest, visible, desde) {
        this._limpiarResultado();
        const usuario = window.usuarioSeleccionado || {};
        // La clave la resuelve el backend (resolverAcceso): acá solo viaja el CUIT.
        const credenciales = { usuario: usuario.cuit || usuario.cuil };
        const resultado = await new Promise((resolve) => {
            finPendiente = resolve;
            window.electronAPI.iniciarSesion(URL_LOGIN_AFIP, credenciales, esTest, visible,
                { servicio: this.servicio, desde });
        });
        this._terminar(resultado || {}, esTest);
    }

    _terminar(resultado, esTest) {
        // Si la pantalla se cerró mientras facturaba (MP vacía su HTML), no hay dónde
        // dibujar el aviso de PDV: cae al resultado común.
        const ancla = this.pdvAnclaId && document.getElementById(this.pdvAnclaId);
        const manejador = ancla ? manejadoresPdv.get(this.pdvAnclaId) : null;
        if (manejador && resultado.codigo === 'PDV_NO_HABILITADO') {
            // No es un error para mostrar: AFIP nos dijo qué PDV ofrece → se
            // recarga el desplegable con esos y se pide elegir de nuevo.
            manejador.noHabilitado(resultado.pdvHabilitados, resultado.pdvElegido);
            return;
        }
        if (manejador && resultado.codigo === 'TIPO_PDV_DISTINTO') {
            // AFIP dijo de qué tipo es el PDV y el backend ya corrigió el cliente:
            // se vuelve al formulario con el PDV recargado y el aviso.
            manejador.tipoCorregido(resultado.detalle);
            return;
        }
        this._mostrarResultado(resultado, esTest);
    }

    _limpiarResultado() {
        const div = this.contenedor && this.contenedor.nextElementSibling;
        if (div && div.classList.contains('factura-resultado')) div.remove();
    }

    // Bloque abajo del lanzador: qué pasó, cuántas salieron y, si faltan, el reintento.
    _mostrarResultado(resultado, esTest) {
        this._limpiarResultado();
        if (!this.contenedor) return;
        const div = el('div', 'factura-resultado');
        this.contenedor.insertAdjacentElement('afterend', div);

        if (resultado.success && resultado.modoTest) {
            div.classList.add('factura-resultado--prueba');
            div.appendChild(el('h4', null, '🧪 Modo prueba: salió bien'));
            const p = resultado.prueba || {};
            div.appendChild(el('p', null,
                `Se cargó la 1ra factura${p.fecha ? ` (${p.fecha}, $ ${p.monto})` : ''} hasta la pantalla de confirmación y NO se confirmó.`
                + ' No se emitió nada en AFIP.'));
            if (p.total > 1) {
                div.appendChild(el('p', null, `Si está bien, "🔐 Facturar en AFIP" emite las ${p.total} facturas.`));
            }
            if (resultado.captura) {
                const ver = el('button', 'ui-btn ui-btn--ghost', '🖼 Ver captura de la confirmación');
                ver.type = 'button';
                ver.addEventListener('click', () => window.electronAPI.abrirArchivo(resultado.captura));
                div.appendChild(ver);
            }
            return;
        }

        const avance = !esTest && resultado.avance;
        if (resultado.success) {
            div.classList.add('factura-resultado--ok');
            div.appendChild(el('h4', null, avance
                ? `✅ Se emitieron ${avance.emitidas} de ${avance.aEmitir} factura(s)`
                : '✅ Facturación terminada'));
            if (avance && avance.desde) div.appendChild(el('p', null, `Reintento: N° ${avance.desde + 1} a ${avance.total}.`));
            if (resultado.avisoConsulta) div.appendChild(el('p', 'factura-resultado__dudosa', `⚠ ${resultado.avisoConsulta}`));
            const datos = resultado.data;
            if (datos) {
                if (datos.cantidadFacturas != null) div.appendChild(el('p', null, `Según la consulta de AFIP: ${datos.cantidadFacturas} comprobante(s), total $ ${datos.suma ?? '-'}`));
                if (datos.detalle) {
                    const det = el('details');
                    det.appendChild(el('summary', null, 'Ver detalle de la consulta'));
                    det.appendChild(el('pre', null, datos.detalle));
                    div.appendChild(det);
                }
            }
            return;
        }

        const cancelado = resultado.error === 'CANCELADO';
        const cerrado = resultado.error === 'NAVEGADOR_CERRADO';
        div.classList.add(cancelado || cerrado ? 'factura-resultado--aviso' : 'factura-resultado--error');
        div.appendChild(el('h4', null, cancelado ? '⏹ Cancelado'
            : cerrado ? '⏹ Se cerró el navegador antes de terminar'
            : '❌ No se pudo facturar'));
        // `message` primero: cuando falla el navegador, `error` es solo un código
        // interno ('BROWSER_ERROR') y el texto legible viene en `message`.
        if (!cancelado && !cerrado) {
            div.appendChild(el('p', null, resultado.message || resultado.error || 'Error sin detalle: mirá el log del día.'));
        }
        if (!avance) return;

        div.appendChild(el('p', 'factura-resultado__cuenta', `Salieron ${avance.emitidas} de ${avance.aEmitir} factura(s)`
            + (avance.desde ? ` (reintento: N° ${avance.desde + 1} a ${avance.total}).` : '.')));
        if (avance.dudosa) {
            div.appendChild(el('p', 'factura-resultado__dudosa',
                `⚠ La factura N° ${avance.dudosa} se cortó mientras se confirmaba: no sabemos si AFIP la grabó. `
                + 'Revisala en Mis Comprobantes. El reintento NO la incluye, para no emitirla dos veces.'));
        }
        const desde = avance.desde + avance.emitidas + (avance.dudosa ? 1 : 0);
        const faltan = avance.total - desde;
        if (faltan <= 0) return;

        const reintentar = el('button', 'ui-btn ui-btn--accion', `🔁 Reintentar las ${faltan} que faltan`);
        reintentar.type = 'button';
        reintentar.addEventListener('click', async () => {
            if (!this.lanzador || this.lanzador.enCurso()) return;
            const ok = await showConfirmModal({
                title: 'Reintentar',
                icon: '🔁',
                confirmText: 'Emitir',
                confirmBtnClass: 'tono',
                message: `Se emiten las facturas N° ${desde + 1} a ${avance.total} (${faltan}) en AFIP.\n`
                    + `Las primeras ${desde} no se vuelven a mandar.\n\n¿Desea continuar?`
            });
            if (ok) this.lanzador.lanzar(0, { desde });
        });
        div.appendChild(reintentar);
    }
}
