// paraStorage.js
export function pStorage(data) {
    let arrayDatos = data.arrayResultante;
    let datosDeEmision = data.tipoActividad;
    let datosDeOperacion = data.tipoContribuyente;

    const codigoLocalStorage = `
    let iterador = localStorage.getItem('iterador');

    if (iterador === null || isNaN(parseInt(iterador))) {
        iterador = 0;
    } else {
        iterador = parseInt(iterador);
    }

    localStorage.setItem('arrayDatos', ${JSON.stringify(data.montoResultados.facturasGeneradas)});
    \nlocalStorage.setItem('datosDeEmision', '${datosDeEmision}');
    \nlocalStorage.setItem('datosDeOperacion', '${datosDeOperacion}');
    \nif (localStorage.getItem('iterador') === null || localStorage.getItem('iterador') !== '0') {
        localStorage.setItem('iterador', 0);
    };
    `;
    return codigoLocalStorage;
}