const loginManager = require('../facturas/codigo/login/login_arca.js');
const flujo_generarVEP = require('./codigo/flujos/flujo_generarVEP.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Inicializa el proceso de generación de VEP (Volante Electrónico de Pago)
 * @param {string} url - URL de AFIP
 * @param {Object} credenciales - Credenciales del usuario
 * @param {Object} usuarioData - Datos del usuario y medio de pago seleccionado
 * @param {Array<string>} periodosSeleccionados - Períodos seleccionados por el usuario (opcional)
 * @param {string} downloadsPath - Ruta base para guardar los archivos descargados
 * @returns {Object} Resultado del proceso
 */
async function iniciarProcesoVEP(url, credenciales, usuarioData, periodosSeleccionados = null, downloadsPath = null) {
    let navegador;
    console.log("🔵 [VEP Manager] Iniciando proceso de generación de VEP...");
    console.log(`   Usuario: ${usuarioData.usuario.nombre}`);
    console.log(`   CUIT: ${usuarioData.usuario.cuit}`);
    console.log(`   Medio de pago: ${usuarioData.medioPago.nombre}`);
    console.log(`   Ruta de descargas: ${downloadsPath || 'NO ESPECIFICADA'}`);

    try {
        // 1. Login a AFIP (reutilizamos el login existente)
        console.log("🔵 [VEP Manager] Paso 1: Haciendo login...");
        const resultadoLogin = await loginManager.hacerLogin(url, credenciales);

        // 2. Verificar login exitoso
        if (!resultadoLogin.success) {
            console.error("❌ [VEP Manager] El login falló:", resultadoLogin.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        // 3. Desestructurar page y browser
        const { page, browser: b } = resultadoLogin;
        navegador = b;

        console.log("✅ [VEP Manager] Login exitoso. Iniciando flujo de VEP...");

        // 4. Verificar que downloadsPath esté definido
        if (!downloadsPath) {
            console.warn("⚠️ [VEP Manager] downloadsPath no especificado. Usando carpeta de descargas del sistema...");

            // Intentar obtener la carpeta de descargas del sistema operativo
            const homeDir = os.homedir();

            // Probar rutas comunes para la carpeta de descargas
            const posiblesRutas = [
                path.join(homeDir, 'Downloads'),   // Windows / macOS / Linux (inglés)
                path.join(homeDir, 'Descargas'),   // Linux / macOS (español)
                path.join(homeDir, 'Téléchargements') // Linux / macOS (francés)
            ];

            // Buscar cuál existe
            for (const ruta of posiblesRutas) {
                if (fs.existsSync(ruta)) {
                    downloadsPath = ruta;
                    break;
                }
            }

            // Si no se encontró ninguna, usar Downloads por defecto
            if (!downloadsPath) {
                downloadsPath = path.join(homeDir, 'Downloads');
            }

            console.log(`   Usando ruta de descargas: ${downloadsPath}`);
        }

        // 5. Ejecutar el flujo de generación de VEP
        const resultado = await flujo_generarVEP.ejecutarFlujoVEP(
            page,
            usuarioData.usuario,
            usuarioData.medioPago,
            periodosSeleccionados,
            downloadsPath
        );

        return resultado;

    } catch (error) {
        console.error("❌ [VEP Manager] Error en iniciarProcesoVEP:", error);
        return {
            success: false,
            error: 'PROCESS_ERROR',
            message: error.message,
            stack: error.stack
        };
    } finally {
        // 6. Cerrar navegador SIEMPRE
        if (navegador) {
            console.log("🔵 [VEP Manager] Cerrando navegador...");
           // await navegador.close();
        }
    }
}

module.exports = {
    iniciarProceso: iniciarProcesoVEP,
};
