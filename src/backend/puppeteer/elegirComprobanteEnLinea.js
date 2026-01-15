const { buscarEnAfip } = require('./buscadorAfip');

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
        console.log('  → Buscando Comprobantes en línea mediante buscador...');

        // Usar el componente reutilizable del buscador
        const newPage = await buscarEnAfip(page, 'compr', {
            timeoutNuevaPestana: 5000,
            esperarNuevaPestana: true
        });

        console.log('  ✅ Comprobantes en línea abierto correctamente');
        return newPage;

    } catch (error) {
        console.error("Error en elegirComprobanteEnLinea:", error);
        throw error;
    }
}

module.exports = { elegirComprobanteEnLinea };
