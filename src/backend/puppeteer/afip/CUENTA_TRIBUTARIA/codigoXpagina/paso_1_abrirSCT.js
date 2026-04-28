// PASO 1: Abrir el Sistema de Cuenta Tributaria (SCT) desde el buscador de AFIP.
// Busca 'sct', espera la nueva pestaña y valida que sea el portal SCT.
//
// Caso especial: a veces AFIP, después de hacer click en el servicio del buscador,
// abre la nueva pestaña en `auth.afip.gob.ar/contribuyente_/login.xhtml?action=SYSTEM&system=cuenta_corriente_contrib`
// pidiendo el login otra vez. Lo detectamos y volvemos a loguear con las
// credenciales antes de continuar.

const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip.js');
const loginManager = require('../../archivosComunes/login/login_arca.js');

const URL_SCT = 'https://ctacte.cloud.afip.gob.ar/contribuyente/externo';
const HOST_SCT = 'ctacte.cloud.afip.gob.ar';
const FRAGMENTO_LOGIN_INTERMEDIO = 'auth.afip.gob.ar/contribuyente_/login.xhtml';

async function ejecutar(page, credenciales, options = {}) {
    try {
        const { timeoutNuevaPestana = 15000, timeoutPortal = 25000 } = options;
        console.log('  → [SCT] Abriendo Sistema de Cuenta Tributaria (buscando "sct")...');

        const newPage = await buscarEnAfip(page, 'sct', {
            esperarNuevaPestana: true,
            timeoutNuevaPestana,
            // Si el primer resultado no menciona "Sistema de Cuentas Tributarias",
            // o si el click no produce navegación, el buscador hace F5 y reintenta.
            textoEsperadoEnResultado: 'Sistema de Cuentas Tributarias'
        });

        if (!newPage) {
            throw new Error('No se obtuvo la nueva pestaña del SCT');
        }

        // Race: o llegamos al portal SCT, o AFIP nos manda al login intermedio.
        const destino = await Promise.race([
            newPage.waitForFunction(
                (host) => location.href.includes(host),
                { timeout: timeoutPortal },
                HOST_SCT
            ).then(() => 'sct').catch(() => null),
            newPage.waitForFunction(
                (frag) => location.href.includes(frag),
                { timeout: timeoutPortal },
                FRAGMENTO_LOGIN_INTERMEDIO
            ).then(() => 'reLogin').catch(() => null)
        ]);

        if (destino === 'reLogin') {
            console.log('  ⚠️ [SCT] AFIP pidió re-login intermedio. Volviendo a loguearse...');
            if (!credenciales) {
                throw new Error('Re-login intermedio requerido pero no se recibieron credenciales en paso_1');
            }
            const urlActual = newPage.url();
            const resultadoRelogin = await loginManager.hacerLogin(newPage, urlActual, credenciales);
            if (!resultadoRelogin.success) {
                throw new Error(`Re-login intermedio falló: ${resultadoRelogin.message || resultadoRelogin.error}`);
            }
            // Después del re-login, esperar a llegar al portal SCT.
            try {
                await newPage.waitForFunction(
                    (host) => location.href.includes(host),
                    { timeout: timeoutPortal },
                    HOST_SCT
                );
            } catch (_) {
                console.warn('  ⚠️ [SCT] Tras re-login no se detectó URL del portal; continuando con URL actual:', newPage.url());
            }
        } else if (destino !== 'sct') {
            console.warn('  ⚠️ [SCT] No se detectó URL esperada ni login intermedio. URL actual:', newPage.url());
        }

        // Esperar que el cuerpo del SCT esté listo (razonSoc aparece una vez cargado el header).
        try {
            await newPage.waitForSelector('div.razonSoc', { timeout: 15000 });
        } catch (e) {
            console.warn('  ⚠️ [SCT] div.razonSoc no apareció en 15s; puede ser un caso especial.');
        }

        console.log('  ✅ [SCT] Portal abierto:', newPage.url());

        return {
            success: true,
            newPage,
            url: newPage.url(),
            urlEsperada: URL_SCT,
            huboReLogin: destino === 'reLogin'
        };
    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_1_abrirSCT:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
