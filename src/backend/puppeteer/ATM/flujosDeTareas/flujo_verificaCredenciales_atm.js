const { loginATM } = require('../codigoXpagina/login_atm.js');

/**
 * Flujo de trabajo para verificar las credenciales de ATM.
 * Llama a la función de login y devuelve su resultado estructurado.
 * @param {import('puppeteer').Page} page La instancia de la página de Puppeteer.
 * @param {string} cuit El CUIT del usuario.
 * @param {string} clave La clave del usuario.
 * @returns {Promise<{success: boolean, error?: string, message?: string}>} El resultado de la operación de login.
 */
async function verificarCredencialesATM(page, cuit, clave) {
    console.log(`[Flujo ATM] ==> Iniciando verificación para CUIT: ${cuit}`);
    
    const credencialesATM = { cuit, clave };

    try {
        // Llama a la función de login que ahora devuelve un objeto de resultado
        const resultadoLogin = await loginATM(page, credencialesATM);
        
        console.log(`[Flujo ATM] <== Finalizada verificación. Resultado: ${resultadoLogin.success ? 'Éxito' : 'Fallo (' + resultadoLogin.error + ')'}`);
        
        // Devuelve el objeto de resultado directamente
        return resultadoLogin;

    } catch (error) {
        // Este catch es una salvaguarda para errores completamente inesperados
        console.error('❌ [Flujo ATM] Error catastrófico durante la verificación de credenciales de ATM:', error);
        return {
            success: false,
            error: 'CATASTROPHIC_ERROR',
            message: 'Ocurrió un error no controlado en el flujo de verificación de ATM.'
        };
    }
}

module.exports = verificarCredencialesATM;