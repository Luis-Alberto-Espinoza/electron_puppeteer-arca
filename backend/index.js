const { procesarDatosFactura } = require('./facturas/procesarFactura.js');
const { pStorage } = require('./facturas/paraStorage.js');

function comunicacionConFactura(data) {

    let elRetorno = procesarDatosFactura(data)

    return elRetorno;
}
// export { procesarDatosFactura, procesarDatosRecibo };
module.exports = {
    comunicacionConFactura
};