// src/backend/index.js

const { procesarDatosFactura } = require('./facturas/procesarFactura.js');
const { libroIVAManager } = require('./libroIVA/archivos/index.js');

function comunicacionConFactura(data) {
    let elRetorno = procesarDatosFactura(data);
    return elRetorno; // Contiene los datos procesados del formulario
}

function comunicacionConLibroIVA(data){
    return libroIVAManager(data)
}
module.exports = {
    comunicacionConFactura, 
    comunicacionConLibroIVA
};