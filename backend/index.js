const { procesarDatosFactura } = require('./facturas/procesarFactura.js');
const { pStorage } = require('./facturas/paraStorage.js');

function comunicacionConFactura(data) {

    let elRetorno = procesarDatosFactura(data)
    // console.log("elRetorno", elRetorno);
    // console.dir(elRetorno, { depth: null }); // Profundidad infinita
    console.log("elRetorno", elRetorno);
    let losDatosDelStorage = pStorage(elRetorno);

    return losDatosDelStorage; //contiene los datos procesados del formulario 
}

// export { procesarDatosFactura, procesarDatosRecibo };
module.exports = {
    comunicacionConFactura
    
};