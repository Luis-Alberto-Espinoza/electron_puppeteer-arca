//paso4_DatosDeOperacion-Factura_B
if (window.location.href.includes('genComDatosOperacion' && datosDeOperacion === 'Factura_B')) {

    let productosServicio = document.getElementById("detalle_descripcion1")
    const detalleDescripcion = document.querySelector('#detalle_medida1')
    const precioUnitario = document.querySelector("#detalle_precio1")
    const alicuotaIva = document.querySelector("#detalle_tipo_iva1")
  
    let arrayDatos = JSON.parse(localStorage.getItem('arrayDatos'));
    let iterador = parseInt(localStorage.getItem('iterador'));
  
    productosServicio.value = `Factura del día ` + arrayDatos[iterador][0]
    detalleDescripcion.lastChild.selected = true
    precioUnitario.value = arrayDatos[iterador][1]
    alicuotaIva.value = 5
    precioUnitario.onkeyup(precioUnitario.value)
    precioUnitario.onchange(precioUnitario.value)
    validarCampos();
  }