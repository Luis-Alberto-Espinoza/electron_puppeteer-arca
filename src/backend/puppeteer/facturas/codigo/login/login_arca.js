const puppeteer = require('puppeteer');
async function hacerLogin(url, credenciales) {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const browser = await puppeteer.launch({ 
        headless: false,
        // Configuraciones para controlar la ventana de Puppeteer
        args: [
            `--window-size=${width},${height}`,  // Tamaño de ventana completo
            `--window-position=0,0`,             // Posición en esquina superior izquierda
            '--no-first-run',                    // Evita la pestaña "Bienvenido"
            '--no-default-browser-check',        // No verificar navegador por defecto
            '--disable-infobars',                // Deshabilitar barras de información
            '--disable-extensions',              // Deshabilitar extensiones
            '--disable-dev-shm-usage',          // Para estabilidad
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ],
        defaultViewport: null,  // Usar el viewport completo de la ventana
        // Configuraciones adicionales para una mejor experiencia
        ignoreDefaultArgs: ['--enable-automation'],  // Ocultar "Chrome está siendo controlado por software automatizado"
        devtools: false  // DevTools cerradas por defecto
    });

    // Obtener todas las páginas abiertas (incluye about:blank inicial)
    const pages = await browser.pages();
    
    // Cerrar la página about:blank si existe
    if (pages.length > 1) {
        await pages[0].close();
    }
    
    // Usar la primera página disponible o crear una nueva
    const page = pages.length > 0 ? pages[pages.length - 1] : await browser.newPage();

    // Configurar la página para usar toda la ventana
    await page.setViewport(null);

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Esperar a que la página de login esté completamente cargada
        await page.waitForSelector('#F1\\:username', { visible: true });
        console.log("Campo de CUIT encontrado.");

        // Ingresar el CUIT
        await page.type('#F1\\:username', credenciales.usuario);
        console.log("CUIT ingresado.");

        // Hacer clic en el botón "Siguiente" y esperar a que aparezca la nueva página
        await Promise.all([
            page.click('#F1\\:btnSiguiente'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        console.log("Navegación a la página de clave completada.");

        // Esperar a que la página de clave esté completamente cargada
        await page.waitForSelector('#F1\\:password', { visible: true });
        console.log("Campo de clave encontrado.");

        // Ingresar la clave
        await page.type('#F1\\:password', credenciales.contrasena);
        console.log("Clave ingresada.");

        // Hacer clic en el botón de login y esperar a que la navegación termine
        await Promise.all([
            page.click('#F1\\:btnIngresar'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        console.log("Botón de login clicado y navegación completada.");

        // Manejar el cierre de la ventana correctamente
        page.on('close', () => {
            console.log('✅ Página de Puppeteer cerrada correctamente');
        });

        browser.on('disconnected', () => {
            console.log('✅ Browser de Puppeteer desconectado correctamente');
        });

        // Verificar si el login fue exitoso
        // const loginExitoso = await page.evaluate(() => {
        //     return document.querySelector('#some-element-after-login') !== null;
        // });

        // if (!loginExitoso) {
        //     throw new Error('Login fallido');
        // }

        return page;
    } catch (error) {
        console.error("Error en hacerLogin:", error);
        
        // Limpiar recursos si hay error
        try {
            if (page && !page.isClosed()) {
                await page.close();
            }
            if (browser && browser.isConnected()) {
                await browser.close();
            }
        } catch (cleanupError) {
            console.error("Error al limpiar recursos:", cleanupError);
        }
        
        throw error;
    }
}

module.exports = { hacerLogin };