//paso2_DatosDeEmision-Productos
if (window.location.href.includes('genComDatosEmisor') && datosDeEmision === 'producto') {
    let inputFechas = document.querySelector("#fc")
    
    // Recuperar la cadena JSON del localStorage y convertirla de nuevo a un array
    let arrayDatosGuardado = JSON.parse(localStorage.getItem('arrayDatos'));
    inputFechas.value = arrayDatosGuardado[(arrayDatosGuardado.length) - 1][0]
    let conceptoAincluir = document.querySelector("#idconcepto")
    conceptoAincluir.children[1].selected = true
    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)")
    btnContinuar.click()
}
