// auth.js - Módulo de autenticación reutilizable
export class AuthManager {
    constructor() {
        this.loginButton = null;
        this.testButton = null;
    }

    // Inicializa los eventos de autenticación con selectores personalizables
    inicializar(config = {}) {
        const {
            loginButtonId = 'loginButton',
            testButtonId = 'testButton'
        } = config;

        this.loginButton = document.getElementById(loginButtonId);
        this.testButton = document.getElementById(testButtonId);

        this._configurarEventos();
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
            window.electronAPI.iniciarSesion(url, { ...credenciales, test: false });
        } catch (error) {
            console.error("Error en login normal:", error);
        }
    }

    // Maneja el login de test
    async manejarLoginTest() {
        try {
            const credenciales = await this._obtenerCredenciales();
            const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
            window.electronAPI.iniciarSesion(url, credenciales, true);
        } catch (error) {
            console.error("Error en login test:", error);
        }
    }

    // Obtiene las credenciales del entorno
    async _obtenerCredenciales() {
        return {
            usuario: await window.electronAPI.getEnv('AFIP_USUARIO'),
            contrasena: await window.electronAPI.getEnv('AFIP_CONTRASENA')
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