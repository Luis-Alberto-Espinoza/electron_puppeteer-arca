// auth.js - Módulo de autenticación reutilizable

// Rueda "está trabajando" mientras se factura (sobre todo con el navegador oculto, donde
// si no hay nada en pantalla parece que el botón no anduvo). El listener del fin del
// proceso se registra UNA sola vez para todo el módulo: Facturas y Mercado Pago crean
// cada uno su AuthManager, y si cada uno se suscribiera, se acumularían.
let escuchandoFin = false;

// Pantallas que saben responder a los avisos de PDV del paso 0. Cada una se
// registra con el id de su desplegable de PDV (el "ancla"): auth.js no conoce
// ninguna pantalla, solo le pasa el aviso a la que APRETÓ el botón. No sirve
// mirar cuál está visible: Facturas y Mercado Pago pueden estar abiertos a la vez.
const manejadoresPdv = new Map();   // anclaId → { noHabilitado, tipoCorregido }
let anclaTrabajando = null;         // ancla de la pantalla que está facturando

/**
 * @param {string} anclaId  id del <select> de PDV de la pantalla
 * @param {{noHabilitado: function(string[], string), tipoCorregido: function({puntoVenta: string, letra: string})}} manejador
 */
export function registrarManejadorPdv(anclaId, manejador) {
    manejadoresPdv.set(anclaId, manejador);
}

// Si la pantalla se cerró mientras facturaba (MP vacía su HTML), no hay dónde
// dibujar el aviso: cae al cartel de error común.
function manejadorPdvDelTrabajo() {
    const anclaId = anclaTrabajando;
    anclaTrabajando = null;
    return anclaId && document.getElementById(anclaId) ? manejadoresPdv.get(anclaId) || null : null;
}

function terminarTrabajo(resultado) {
    if (window.ruedaTrabajando) {
        // El backend contesta siempre por acá; si falló, el motivo queda a la vista
        // (antes solo se apagaba la rueda y el error vivía en la consola).
        const manejador = manejadorPdvDelTrabajo();
        if (manejador && resultado && resultado.codigo === 'PDV_NO_HABILITADO') {
            // No es un error para mostrar: AFIP nos dijo qué PDV ofrece → se
            // recarga el desplegable con esos y se pide elegir de nuevo.
            window.ruedaTrabajando.ocultar();
            manejador.noHabilitado(resultado.pdvHabilitados, resultado.pdvElegido);
        } else if (manejador && resultado && resultado.codigo === 'TIPO_PDV_DISTINTO') {
            // AFIP dijo de qué tipo es el PDV y el backend ya corrigió el cliente:
            // se vuelve al formulario con el PDV recargado y el aviso.
            window.ruedaTrabajando.ocultar();
            manejador.tipoCorregido(resultado.detalle);
        } else if (resultado && resultado.success === false) {
            // `message` primero: cuando falla el navegador, `error` es solo un código
            // interno ('BROWSER_ERROR') y el texto legible viene en `message`.
            window.ruedaTrabajando.error('No se pudo facturar',
                resultado.message || resultado.error || 'Error sin detalle: mirá el log del día.');
        } else {
            window.ruedaTrabajando.ocultar();
        }
    }
    document.querySelectorAll('[data-facturando="1"]').forEach(b => {
        b.disabled = false;
        delete b.dataset.facturando;
    });
}
function escucharFinDelProceso() {
    if (escuchandoFin || !window.electronAPI || !window.electronAPI.onFinProcesoAfip) return;
    escuchandoFin = true;
    window.electronAPI.onFinProcesoAfip(terminarTrabajo);
}

export class AuthManager {
    constructor() {
        this.loginButton = null;
        this.testButton = null;
        this.visibleSwitchId = null;
        this.pdvAnclaId = null;
        this.nombreServicio = 'Facturación';
    }

    // Inicializa los eventos de autenticación con selectores personalizables
    inicializar(config = {}) {
        const {
            loginButtonId = 'loginButton',
            testButtonId = 'testButton',
            visibleSwitchId = 'chk-visible-factura',
            pdvAnclaId = 'selectPuntoDeVentaFactura',  // ver registrarManejadorPdv
            nombreServicio = 'Facturación'             // título de la rueda: "ARCA · Facturación"
        } = config;

        this.nombreServicio = nombreServicio;
        this.visibleSwitchId = visibleSwitchId;
        this.pdvAnclaId = pdvAnclaId;
        this.loginButton = document.getElementById(loginButtonId);
        this.testButton = document.getElementById(testButtonId);

        this._configurarEventos();
        escucharFinDelProceso();
    }

    // Rueda + botones bloqueados (evita mandar dos facturas con un doble click).
    _empezarTrabajo(esTest) {
        anclaTrabajando = this.pdvAnclaId;
        for (const b of [this.loginButton, this.testButton]) {
            if (b) { b.disabled = true; b.dataset.facturando = '1'; }
        }
        if (window.ruedaTrabajando) {
            const oculto = !this._leerVisible();
            window.ruedaTrabajando.mostrar({
                servicio: 'ARCA',
                subservicio: this.nombreServicio,
                mensaje: esTest ? 'Facturando en AFIP (modo prueba)… Puede tardar un par de minutos.'
                                : 'Facturando en AFIP… Puede tardar un par de minutos.',
                extra: oculto ? 'El navegador está oculto, por eso no ves nada: está trabajando.' : undefined
            });
        }
    }

    // Configura los event listeners
    _configurarEventos() {
        if (this.loginButton) {
            this.loginButton.addEventListener('click', () => this.manejarLoginNormal());
        }

        if (this.testButton) {
            this.testButton.addEventListener('click', () => this.manejarLoginTest());
        }
    }

    // Maneja el login normal
    async manejarLoginNormal() {
        try {
            const credenciales = await this._obtenerCredenciales();
            const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
            this._empezarTrabajo(false);
            window.electronAPI.iniciarSesion(url, { ...credenciales, test: false }, false, this._leerVisible());
        } catch (error) {
            console.error("Error en login normal:", error);
            terminarTrabajo();
        }
    }

    // Maneja el login de test
    async manejarLoginTest() {
        try {
            const credenciales = await this._obtenerCredenciales();
            const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
            this._empezarTrabajo(true);
            window.electronAPI.iniciarSesion(url, credenciales, true, this._leerVisible());
        } catch (error) {
            console.error("Error en login test:", error);
            terminarTrabajo();
        }
    }

    // Switch "Mostrar navegador" de la vista. Si no existe, visible (no se guarda).
    _leerVisible() {
        const chk = this.visibleSwitchId && document.getElementById(this.visibleSwitchId);
        return chk ? chk.checked : true;
    }

    // Obtiene las credenciales del entorno
    async _obtenerCredenciales() {
        const usuario = window.usuarioSeleccionado;
        const usuarioAfip = usuario.cuit || usuario.cuil;
        return {
            usuario: usuarioAfip,
            contrasena: usuario.claveAFIP
        };
    }

    // Método para limpiar eventos (útil para cleanup)
    destruir() {
        if (this.loginButton) {
            this.loginButton.removeEventListener('click', this.manejarLoginNormal);
        }
        if (this.testButton) {
            this.testButton.removeEventListener('click', this.manejarLoginTest);
        }
    }
}

// Exporta también funciones individuales para mayor flexibilidad
export async function realizarLoginNormal() {
    const auth = new AuthManager();
    return await auth.manejarLoginNormal();
}

export async function realizarLoginTest() {
    const auth = new AuthManager();
    return await auth.manejarLoginTest();
}

export async function obtenerCredencialesAfip() {
    return {
        usuario: await window.electronAPI.getEnv('AFIP_USUARIO'),
        contrasena: await window.electronAPI.getEnv('AFIP_CONTRASENA')
    };
}