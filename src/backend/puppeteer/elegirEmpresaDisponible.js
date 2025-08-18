async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function elegirEmpresaDisponible(newPage, nombreEmpresa) {
    try {
        // Esperar a que la nueva página esté lista
        try {
            await Promise.race([
                newPage.waitForSelector('body'), // Esperar a que al menos el body esté disponible
                wait(5000) // Timeout de seguridad
            ]);
        } catch (error) {
            console.log('Timeout esperando la carga inicial de la página');
        }

        // Dar un tiempo adicional para que la página termine de cargar
        await wait(2000);

        // Trabajar con la nueva pestaña
        // await newPage.screenshot({ path: 'nueva_pestana.png' });

        let empresaAElegir = '.btn_empresa'; // selector de clase

        // Debug y selección de empresa en la nueva pestaña
        await newPage.waitForSelector(empresaAElegir, { timeout: 20000 });

        // Opción 1: Por className y índice (para seleccionar la primera o segunda empresa)
        const botones = await newPage.$$(empresaAElegir);

        console.log(`que es botones: ${botones}`);
        console.log(`que es empresaAElegir: ${nombreEmpresa}`);
        // iterar hasta encontrar el botones.value === nombreEmpresa
        for (let i = 0; i < botones.length; i++) {
            const texto = await botones[i].evaluate(el => el.value?.trim());
            console.log(`Botón ${i}: ${texto}`);
            if (texto === nombreEmpresa) {
                console.log(`Botón encontrado: ${texto}`);
                //hacer click en el botón
                await botones[i].click();
                console.log(`Haciendo click en el botón de la empresa: ${texto}`);
                break;
            }
        }
        //  await botones[0]; // [0] para primera empresa, [1] para segunda

        // Click en el botón de la empresa  
        //await botones[0].click();     // Click en el botón de la empresa
        await newPage.waitForNavigation({ waitUntil: 'networkidle0' }).catch(e => console.log('Navegación completada'));
        return newPage;
    } catch (error) {
        console.error("Error en elegirEmpresaDisponible:", error);
        throw error;
    }
}

module.exports = { elegirEmpresaDisponible };