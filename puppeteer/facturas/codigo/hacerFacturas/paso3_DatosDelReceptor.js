//paso3_DatosDelReceptor
if (window.location.href.includes('genComDatosReceptor')) {
    let formu = document.getElementById('formulario')
    formu[0].value = 5
    formu[7].checked = true
    formu[15].checked = true
    setTimeout(function () {
      validarCampos()
    }, 500);
    
  }