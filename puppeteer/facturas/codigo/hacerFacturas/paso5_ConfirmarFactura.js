//paso5_ConfirmarFactura
if (window.location.href.includes('genComResumenDatos')) {
    window.scrollTo(0, document.body.scrollHeight);
    ajaxFunction()
    let btnMenuPrinvipalVolver = document.querySelectorAll('input')
    let iterador = parseInt(localStorage.getItem('iterador'));

    localStorage.setItem("iterador", iterador + 1);

    setTimeout(function () {
        btnMenuPrinvipalVolver[3].click()
    }, 500);
}

