async function paso_0_generaComprobante(newPage, datos) {
    try {
        await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' }); // Espera a que la página cargue

        // Ejecuta el script original dentro de la página
        await newPage.evaluate((datos) => {

        // mostrar que tiene la variable datos con saltos de linea al inicio y al final con un titulo concatenado
        
        if (window.location.href.includes('menu_ppal')) {
            let generarComprobantes = document.getElementById("btn_gen_cmp");
            if (generarComprobantes) { // Verifica si el elemento existe
                generarComprobantes.click();
            } else {
                console.error("No se encontró el botón 'btn_gen_cmp'");
            }
        }
    }, datos);
    
    // Espera a que la acción se complete (opcional, pero recomendable)
    await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }); // Aumenta el tiempo de espera a 120000 ms
    
  
    console.log("Script _0_ ejecutado correctamente.");
    return { success: true, message: "Comprobante generado correctamente" };
} catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_0_generaComprobante };
