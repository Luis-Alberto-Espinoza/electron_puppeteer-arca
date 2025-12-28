const loginManager = require('../facturas/codigo/login/login_arca.js');
const flujo_consultaDeuda = require('./flujos/flujo_consultaDeuda.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Inicializa el proceso de consulta de deuda
 * @param {string} url - URL de AFIP
 * @param {Object} credenciales - Credenciales del usuario
 * @param {Object} consultaData - Datos de la consulta (usuario, períodos, fecha)
 * @param {string} downloadsPath - Ruta base para guardar los archivos Excel
 * @returns {Object} Resultado del proceso
 */
async function iniciarConsultaDeuda(url, credenciales, consultaData, downloadsPath = null) {
    let navegador;
    console.log("🔵 [Consulta Deuda Manager] Iniciando proceso de consulta de deuda...");
    console.log(`   Usuario: ${consultaData.usuario.nombre}`);
    console.log(`   CUIT: ${consultaData.usuario.cuit}`);
    console.log(`   Período Desde: ${consultaData.periodoDesde}`);
    console.log(`   Período Hasta: ${consultaData.periodoHasta}`);
    console.log(`   Fecha Cálculo: ${consultaData.fechaCalculo}`);
    console.log(`   Ruta de descargas: ${downloadsPath || 'NO ESPECIFICADA'}`);

    try {
        // 1. Login a AFIP (reutilizamos el login existente)
        console.log("🔵 [Consulta Deuda Manager] Paso 1: Haciendo login...");

        // ===== MODO HEADLESS (NAVEGADOR OCULTO) =====
        // Para mostrar el navegador durante la ejecución, cambiar headless: true a headless: false
        // headless: true  -> Navegador oculto (modo producción - no se ve la ventana del navegador)
        // headless: false -> Navegador visible (modo debug - útil para ver qué está haciendo)
        const resultadoLogin = await loginManager.hacerLogin(url, credenciales, { headless: true });

        // 2. Verificar login exitoso
        if (!resultadoLogin.success) {
            console.error("❌ [Consulta Deuda Manager] El login falló:", resultadoLogin.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        // 3. Desestructurar page y browser
        const { page, browser: b } = resultadoLogin;
        navegador = b;

        console.log("✅ [Consulta Deuda Manager] Login exitoso. Iniciando flujo de consulta...");

        // 4. Verificar que downloadsPath esté definido
        if (!downloadsPath) {
            console.warn("⚠️ [Consulta Deuda Manager] downloadsPath no especificado. Usando carpeta de descargas del sistema...");

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

        // 5. Ejecutar el flujo de consulta de deuda
        const resultado = await flujo_consultaDeuda.ejecutarFlujoConsultaDeuda(
            page,
            consultaData.usuario,
            consultaData.periodoDesde,
            consultaData.periodoHasta,
            consultaData.fechaCalculo,
            downloadsPath
        );

        return resultado;

    } catch (error) {
        console.error("❌ [Consulta Deuda Manager] Error en iniciarConsultaDeuda:", error);
        return {
            success: false,
            error: 'PROCESS_ERROR',
            message: error.message,
            stack: error.stack
        };
    } finally {
        // 6. Cerrar navegador SIEMPRE
        if (navegador) {
            console.log("🔵 [Consulta Deuda Manager] Cerrando navegador...");
            // await navegador.close();
        }
    }
}

module.exports = {
    iniciarConsulta: iniciarConsultaDeuda,
};
