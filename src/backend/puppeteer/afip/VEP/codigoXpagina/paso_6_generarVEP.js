/**
 * PASO 6: Click en "Generar VEP o QR"
 * Carga nueva vista en la misma pestaña
 *
 * IMPORTANTE: Existen dos botones posibles según la sección seleccionada:
 * - GenerarVEPAlone: usado cuando hay una sola tabla (ej: Provincial)
 * - GenerarVEP: usado cuando hay múltiples tablas (ej: Monotributo)
 * Ambos existen en el DOM pero uno está oculto con display: none
 */
async function ejecutar(page) {
    try {
        console.log("  → Buscando botones 'Generar VEP o QR' (GenerarVEPAlone o GenerarVEP)...");

        // 1. Definir los selectores de los dos botones
        const selectorVEPAlone = 'input[name="GenerarVEPAlone"]';
        const selectorVEP = 'input[name="GenerarVEP"]';
        const selectorVEPMONO = 'input[name="GenerarVEPMONO"]';

        // DEBUG: Verificar qué botones existen y su estado
        console.log("  → DEBUG: Verificando estado de todos los botones...");
        const estadoBotones = await page.evaluate(() => {
            const botones = [];

            // Buscar todos los botones posibles
            const ids = ['GenerarVEP', 'GenerarVEPAlone', 'GenerarVEPMONO'];
            ids.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    const estilo = window.getComputedStyle(btn);
                    botones.push({
                        id: id,
                        name: btn.getAttribute('name'),
                        type: btn.type,
                        display: estilo.display,
                        visibility: estilo.visibility,
                        disabled: btn.disabled,
                        haydeuda: btn.getAttribute('haydeuda'),
                        visible: estilo.display !== 'none' && estilo.visibility !== 'hidden'
                    });
                }
            });

            // También verificar qué div está visible
            const divs = ['divAM', 'divPROV', 'divSD'];
            const divsVisibles = {};
            divs.forEach(divId => {
                const div = document.getElementById(divId);
                if (div) {
                    const estilo = window.getComputedStyle(div);
                    divsVisibles[divId] = estilo.display !== 'none';
                }
            });

            return { botones, divsVisibles };
        });

        console.log("  → DEBUG: Estado de botones:", JSON.stringify(estadoBotones.botones, null, 2));
        console.log("  → DEBUG: Divs visibles:", JSON.stringify(estadoBotones.divsVisibles, null, 2));

        // El selector CSS para buscar CUALQUIERA de los tres
        const selectores = `${selectorVEPAlone}, ${selectorVEP}, ${selectorVEPMONO}`;

        // 2. Esperar al menos uno de los botones (SIN verificar visible por ahora)
        await page.waitForSelector(selectores, {
            timeout: 15000
        });

        console.log("  → Botón encontrado. Esperando que esté habilitado...");

        // Espera adicional para asegurar la habilitación
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. PREPARAR el listener ANTES de hacer click
        const browser = page.browser();
        const URL_VEP = '/pago/veps-a-enviar';

        console.log("  → Preparando detector de nueva pestaña...");
        const promesaNuevaPagina = new Promise((resolve, reject) => {
            let resuelto = false;
            const timeoutFinal = setTimeout(() => {
                if (!resuelto) {
                    reject(new Error('Timeout esperando nueva pestaña (30s)'));
                }
            }, 30000);

            // POLLING: Buscar la página cada 500ms
            const intervalo = setInterval(async () => {
                if (resuelto) return;

                try {
                    const pages = await browser.pages();
                    const paginaVEP = pages.find(p => p.url().includes(URL_VEP));

                    if (paginaVEP) {
                        resuelto = true;
                        clearInterval(intervalo);
                        clearTimeout(timeoutFinal);
                        console.log("  ✅ Página encontrada por URL. Verificando que esté lista...");

                        // Esperar un momento para que la página termine de cargar
                        await new Promise(r => setTimeout(r, 1000));

                        resolve(paginaVEP);
                    }
                } catch (error) {
                    // Ignorar errores de polling y continuar buscando
                }
            }, 500);

            // Evento targetcreated como método alternativo (por si funciona)
            browser.once('targetcreated', async (target) => {
                if (resuelto) return;

                try {
                    const newPage = await target.page();
                    if (newPage) {
                        console.log("  → Nueva pestaña detectada por evento.");

                        // Esperar a que la URL cambie a la esperada
                        await newPage.waitForFunction(
                            (urlSubstring) => window.location.href.includes(urlSubstring),
                            { timeout: 10000 },
                            URL_VEP
                        ).catch(() => {
                            console.log("  ⚠️ URL no coincide con la esperada");
                        });

                        if (newPage.url().includes(URL_VEP)) {
                            resuelto = true;
                            clearInterval(intervalo);
                            clearTimeout(timeoutFinal);
                            console.log("  ✅ Página validada por evento.");
                            resolve(newPage);
                        }
                    }
                } catch (error) {
                    // Si falla el evento, el polling lo detectará
                    console.log("  ⚠️ Error en evento targetcreated, usando polling...");
                }
            });
        });

        // 4. AHORA hacer click usando JavaScript en el botón que esté presente, visible y habilitado
        const resultado = await page.evaluate((selAlone, selVEP, selMONO) => {
            let boton = null;
            let nombreBoton = '';

            // Orden de prioridad: GenerarVEPAlone -> GenerarVEP -> GenerarVEPMONO
            const botonesAPrueba = [
                { selector: selAlone, nombre: 'GenerarVEPAlone' },
                { selector: selVEP, nombre: 'GenerarVEP' },
                { selector: selMONO, nombre: 'GenerarVEPMONO' }
            ];

            for (const item of botonesAPrueba) {
                const btn = document.querySelector(item.selector);
                if (btn) {
                    const estilo = window.getComputedStyle(btn);
                    if (estilo.display !== 'none' && estilo.visibility !== 'hidden' && !btn.disabled) {
                        boton = btn;
                        nombreBoton = item.nombre;
                        break;
                    }
                }
            }

            // Si encontramos un botón visible y habilitado, hacemos click
            if (boton) {
                boton.click();
                return { clicked: true, boton: nombreBoton };
            }
            return { clicked: false, boton: null };
        }, selectorVEPAlone, selectorVEP, selectorVEPMONO);

        if (!resultado.clicked) {
            throw new Error('Ninguno de los botones GenerarVEP (Alone o normal) está disponible o habilitado.');
        }

        console.log(`  → Click realizado en: ${resultado.boton}. Esperando nueva pestaña...`);

        // 5. Esperar a que se complete la promesa de la nueva pestaña
        const nuevaPagina = await promesaNuevaPagina;

        console.log("  ✅ Paso 6 completado: Nueva pestaña de VEP cargada");

        return {
            success: true,
            message: "Nueva pestaña de VEP cargada correctamente",
            botonUtilizado: resultado.boton,
            newPage: nuevaPagina
        };

    } catch (error) {
        console.error("  ❌ Error en paso_6_generarVEP:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
