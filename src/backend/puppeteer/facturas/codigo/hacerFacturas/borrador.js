async function paso_1_DatosDeEmision_Productos(newPage, datos, factura) {
    try {
        await newPage.evaluate((datos) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Producto') {
                    // Obtener la fecha actual
                    console.log("Obteniendo la fecha actual...");
                    const fecha = new Date();

                    // Obtener el día, mes y año
                    const dia = String(fecha.getDate()).padStart(2, '0'); // Asegura que el día tenga dos dígitos
                    const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses comienzan desde 0, por lo que sumamos 1
                    const año = fecha.getFullYear();

                    // Formatear la fecha en dd/mm/YYYY
                    const fechaFormateada = `${dia}/${mes}/${año}`;

                    // Mostrar la fecha en la consola
                    console.log(fechaFormateada);

                    let inputFechas = document.querySelector("#fc");
                    inputFechas.value = fechaFormateada; // fecha provisoria de prueba

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.children[1].selected = true;
                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeEmision:", datos.datosDeEmision);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos);

        // Esperar la navegación después de hacer clic en el botón
        await Promise.all([
            newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }), // Espera la navegación
            newPage.evaluate(() => {
                let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                btnContinuar.click(); // Haz clic en el botón
            })
        ]);

        console.log("Script _1_Producto_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (producto) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Productos };