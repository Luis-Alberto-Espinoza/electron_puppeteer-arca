const { fechaHoy } = require('./utils.js');


async function paso_3_DatosDeOperacion_Factura_C(newPage, datos, iterador) {
	try {

		// Verificar que la URL sea la correcta
		const urlActual = newPage.url();
		if (!urlActual.includes('genComDatosOperacion')) {
			throw new Error(`La URL actual (${urlActual}) no es la esperada.`);
		}

		// Esperar a que los elementos estén disponibles
		//await newPage.waitForSelector('#detalle_medida1', { timeout: 120000 });

		// Ejecutar el código dentro de la página
		await newPage.evaluate((datos, iterador) => {
			try {
				if (window.location.href.includes('genComDatosOperacion') && datos.tipoContribuyente === 'C') {
					const productosServicio = document.getElementById("detalle_descripcion1");
					const detalleDescripcion = document.querySelector('#detalle_medida1');
					const precioUnitario = document.getElementById('detalle_precio1');

					// Llenar los campos del formulario
					productosServicio.value = `Factura del día ` + datos.montoResultados.facturasGeneradas[iterador][0];
					detalleDescripcion.lastChild.selected = true;
					precioUnitario.value = datos.montoResultados.facturasGeneradas[iterador][1];

					setTimeout(function () {
						precioUnitario.dispatchEvent(new Event('keyup'));
					}, 1000);

					// // Disparar eventos para validar los campos
					// precioUnitario.dispatchEvent(new Event('change'));

					setTimeout(function () {
						validarCampos();
					  }, 1500);
				} else {
					console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeOperacion:", datos.datosDeOperacion);
				}
			} catch (error) {
				console.error("Error dentro de evaluate:", error);
			}
		}, datos, iterador);

		console.log("Paso 3 completado correctamente.|(Factura C) |");
		return { success: true, message: "Datos de operación (Factura C) completados" };
	} catch (error) {
		console.error("Error al ejecutar el paso 3:", error);
		throw error;
	}
}

module.exports = { paso_3_DatosDeOperacion_Factura_C };