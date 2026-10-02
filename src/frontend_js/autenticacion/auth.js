// auth.js - Módulo de autenticación reutilizable

// Rueda "está trabajando" mientras se factura (sobre todo con el navegador oculto, donde
// si no hay nada en pantalla parece que el botón no anduvo). El listener del fin del
// proceso se registra UNA sola vez para todo el módulo: Facturas y Mercado Pago crean
// cada uno su AuthManager, y si cada uno se suscribiera, se acumularían.
let escuchandoFin = false;
function terminarTrabajo() {
    if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
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
    }

    // Inicializa los eventos de autenticación con selectores personalizables
    inicializar(config = {}) {
        const {
            loginButtonId = 'loginButton',
            testButtonId = 'testButton',
            visibleSwitchId = 'chk-visible-factura'
        } = config;

        this.visibleSwitchId = visibleSwitchId;
        this.loginButton = document.getElementById(loginButtonId);
        this.testButton = document.getElementById(testButtonId);

        this._configurarEventos();
        escucharFinDelProceso();
    }

    // Rueda + botones bloqueados (evita mandar dos facturas con un doble click).
    _empezarTrabajo(esTest) {
        for (const b of [this.loginButton, this.testButton]) {
            if (b) { b.disabled = true; b.dataset.facturando = '1'; }
        }
        if (window.ruedaTrabajando) {
            const oculto = !this._leerVisible();
            window.ruedaTrabajando.mostrar(
                esTest ? 'Facturando en AFIP (modo prueba)…' : 'Facturando en AFIP…',
                oculto
                    ? 'El navegador está oculto, por eso no ves nada: está trabajando. Puede tardar un par de minutos.'
                    : 'No se colgó: está trabajando. Puede tardar un par de minutos.'
            );
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