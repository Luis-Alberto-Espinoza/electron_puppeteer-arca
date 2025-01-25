
//paso2_DatosDeEmision-Servicio 
if (window.location.href.includes('genComDatosEmisor')) {

    const arrayDatos = JSON.parse(localStorage.getItem('arrayDatos'));

    let referencia = document.querySelector("#refComEmisor")
    /*#########################*/

    /*lee desde el localStorage*/
    let iterador = parseInt(localStorage.getItem("iterador"));

    /*#########################*/
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
}