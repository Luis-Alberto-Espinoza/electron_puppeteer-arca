//paso1_PuntosDeVentas
if (window.location.href.includes('buscarPtosVtas')) {
    const listaPuntosDeVentas = document.querySelector("#puntodeventa")
    listaPuntosDeVentas.selectedIndex = 1
    listaPuntosDeVentas.onchange(1)
    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)")
    setTimeout(function () {
        btnContinuar.click()
    }, 500);
}