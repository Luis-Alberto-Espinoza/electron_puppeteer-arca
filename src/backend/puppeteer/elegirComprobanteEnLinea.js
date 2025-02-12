async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

async function elegirComprobanteEnLinea(page) {
    try {
        //await page.waitForTimeout(5000); // Reemplaza page.waitFor con page.waitForTimeout

        // Navigate to services
        await page.waitForSelector('#serviciosMasUtilizados > div > div > div > div:nth-child(5) > div > a', { timeout: 5000 });
        await page.evaluate(() => {
            document.querySelector('#serviciosMasUtilizados > div > div > div > div:nth-child(5) > div > a').click();
        });

        await autoScroll(page);

        // Configurar listener para nueva pestaña antes de hacer clic
        const newPagePromise = new Promise(resolve => {
            page.browser().once('targetcreated', async (target) => {
                const newPage = await target.page();
                resolve(newPage);
            });
        });

        // Select COMPROBANTES EN LÍNEA
        await page.waitForSelector('.roboto-font.bold.h5', { timeout: 5000 });
        await page.evaluate(() => {
            const elements = document.querySelectorAll('.roboto-font.bold.h5');
            const comprobante = Array.from(elements).find(
                element => element.textContent.trim() === 'COMPROBANTES EN LÍNEA'
            );
            if (comprobante) {
                comprobante.click();
            } else {
                throw new Error('No se encontró el enlace de COMPROBANTES EN LÍNEA');
            }
        });
        const newPage = await newPagePromise;
        return newPage; // Devuelve la nueva página, no llama a elegirPuntoDeVenta
   
    } catch (error) {
        console.error("Error en elegirComprobanteEnLinea:", error);
        throw error;
    }
}

module.exports = { elegirComprobanteEnLinea };
