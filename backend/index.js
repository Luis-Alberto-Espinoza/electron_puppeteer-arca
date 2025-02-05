const { procesarDatosFactura } = require('./facturas/procesarFactura.js');
const { pStorage } = require('./facturas/paraStorage.js');

function comunicacionConFactura(data) {

    let elRetorno = procesarDatosFactura(data)
    let losDatosDelStorage = pStorage(elRetorno);

    return losDatosDelStorage; //contiene los datos procesados del formulario 
}

// export { procesarDatosFactura, procesarDatosRecibo };
module.exports = {
    comunicacionConFactura
    
};