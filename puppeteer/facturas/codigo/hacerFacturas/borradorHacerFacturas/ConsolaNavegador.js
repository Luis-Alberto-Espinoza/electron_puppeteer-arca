const datosDeEmision = localStorage.getItem('datosDeEmision');
const datosDeOperacion = localStorage.getItem('datosDeOperacion');
let arrayDatos = JSON.parse(localStorage.getItem('arrayDatos'));
let iterador = parseInt(localStorage.getItem("iterador"));

function esperarElementoEnDOM(selector, maxIntentos = 10, intervalo = 500) {
    return new Promise((resolve, reject) => {
        let intentos = 0;

        function verificarElemento() {
            let elemento = document.querySelector(selector);
            if (elemento) {
                resolve(elemento);
            } else {
                intentos++;
                if (intentos >= maxIntentos) {
                    reject(new Error(`Elemento ${selector} no encontrado después de ${maxIntentos} intentos`));
                } else {
                    setTimeout(verificarElemento, intervalo);
                }
            }
        }
        verificarElemento();
    });
}

//paso0_GeneraComprobantes
if (window.location.href.includes('menu_ppal')) {

    esperarElementoEnDOM("#btn_gen_cmp")
        .then((elemento) => {
            elemento.click();
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso1_PuntosDeVentas
if (window.location.href.includes('buscarPtosVtas')) {

    esperarElementoEnDOM("#puntodeventa")
        .then((elemento) => {
            const listaPuntosDeVentas = elemento
            listaPuntosDeVentas.selectedIndex = 1
            listaPuntosDeVentas.onchange(1)
            let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)")
            setTimeout(function () {
                btnContinuar.click()
            }, 500);
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso2_DatosDeEmision-Productos
if (window.location.href.includes('genComDatosEmisor') && datosDeEmision === 'producto') {

    esperarElementoEnDOM("#contenido")
        .then((elemento) => {
            let inputFechas = document.querySelector("#fc")
            inputFechas.value = arrayDatos[(arrayDatos.length) - 1][0]
            let conceptoAincluir = document.querySelector("#idconcepto")
            conceptoAincluir.children[1].selected = true
            let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)")
            btnContinuar.click()
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso2_DatosDeEmision-Servicio -falta Probar!!!!!!
if (window.location.href.includes('genComDatosEmisor') && datosDeEmision === 'servicio') {

    esperarElementoEnDOM("#refComEmisor")
        .then((elemento) => {
            let referencia = document.querySelector("#refComEmisor")
            let inputFechas = document.querySelector("#fc")
            let fechaEmision = arrayDatos[(arrayDatos.length) - 1][0]
            inputFechas.value = fechaEmision
            let itemElegido = 3
            let conceptoAincluir = document.querySelector("#idconcepto")
            conceptoAincluir.value = itemElegido
            mostrarOcultar(itemElegido)
            let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)")
            const desde = document.querySelector("#fsd")
            const hasta = document.querySelector("#fsh")
            const vto = document.querySelector("#vencimientopago")
            desde.value = arrayDatos[iterador][0];
            hasta.value = arrayDatos[iterador][0];
            vto.value = fechaEmision
            referencia.value = "";

            btnContinuar.click();
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso3_DatosDelReceptor
if (window.location.href.includes('genComDatosReceptor')) {

    esperarElementoEnDOM("#idtipodocreceptor")
        .then((elemento) => {
            let formu = document.getElementById('formulario')
            formu[0].value = 5
            formu[7].checked = true
            formu[15].checked = true
            setTimeout(function () {
                validarCampos()
            }, 500);
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso4_DatosDeOperacion-Factura_B
if (window.location.href.includes('genComDatosOperacion' && datosDeOperacion === 'Factura_B')) {

    esperarElementoEnDOM("#detalle_medida1")
        .then((elemento) => {
            let productosServicio = document.getElementById("detalle_descripcion1")
            const detalleDescripcion = document.querySelector('#detalle_medida1')
            const precioUnitario = document.querySelector("#detalle_precio1")
            const alicuotaIva = document.querySelector("#detalle_tipo_iva1")
            productosServicio.value = `Factura del día ` + arrayDatos[iterador][0]
            detalleDescripcion.lastChild.selected = true
            precioUnitario.value = arrayDatos[iterador][1]
            alicuotaIva.value = 5
            precioUnitario.onkeyup(precioUnitario.value)
            precioUnitario.onchange(precioUnitario.value)
            validarCampos();
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso4_DatosDeOperacion-Factura_C
if (window.location.href.includes('genComDatosOperacion') && datosDeOperacion === 'Factura_C') {

    esperarElementoEnDOM("#detalle_medida1")
        .then((elemento) => {
            const productosServicio = document.querySelector("#detalle_descripcion1")
            const detalleDescripcion = document.querySelector('#detalle_medida1')
            const precioUnitario = document.querySelector("#detalle_precio1")
            productosServicio.value = 'Factura del dia ' + arrayDatos[iterador][0]
            detalleDescripcion.lastChild.selected = true
            precioUnitario.value = arrayDatos[iterador][1]
            precioUnitario.onkeyup(precioUnitario.value)
            precioUnitario.onchange(precioUnitario.value)
            validarCampos();
        })
        .catch((error) => {
            console.error(error);
        });
}

//paso5_ConfirmarFactura
if (window.location.href.includes('genComResumenDatos')) {
    esperarElementoEnDOM("#impuestos")
        .then((elemento) => {
            window.scrollTo(0, document.body.scrollHeight);
            ajaxFunction()
            let btnMenuPrinvipalVolver = document.querySelectorAll('input')
            localStorage.setItem("iterador", iterador + 1);
            setTimeout(function () {
                btnMenuPrinvipalVolver[3].click()
            }, 500);
        })
        .catch((error) => {
            console.error(error);
        });
}