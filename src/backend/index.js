const { procesarDatosFactura } = require('./facturas/procesarFactura.js');
const { pStorage } = require('./facturas/paraStorage.js');

function comunicacionConFactura(data) {
    let elRetorno = procesarDatosFactura(data);
    let losDatosDelStorage = pStorage(elRetorno);
    return losDatosDelStorage; // Contiene los datos procesados del formulario
}

module.exports = {
    comunicacionConFactura
};