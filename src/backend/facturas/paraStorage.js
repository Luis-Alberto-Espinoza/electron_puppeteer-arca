function pStorage(data) {

    let arrayDatos = data.arrayResultante
    let datosDeEmision = data.tipoActividad;
    let datosDeOperacion = data.tipoContribuyente

    const codigoLocalStorage = `
    let iterador = localStorage.getItem('iterador');

    if (iterador === null || isNaN(parseInt(iterador))) {
        iterador = 0;
    } else {
        iterador = parseInt(iterador)
    }

    localStorage.setItem('arrayDatos', JSON.stringify(${JSON.stringify(arrayDatos)}));
    localStorage.setItem('datosDeEmision', '${datosDeEmision}');
    localStorage.setItem('datosDeOperacion', '${datosDeOperacion}');
    if (localStorage.getItem('iterador') === null || localStorage.getItem('iterador') !== '0') {
        localStorage.setItem('iterador', 0);
    };
    `;

    // return { codigo: codigoLocalStorage };
    return codigoLocalStorage;
}

module.exports = {
    pStorage
};