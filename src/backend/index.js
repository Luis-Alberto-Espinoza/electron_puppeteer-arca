// src/backend/index.js

const { procesarDatosFactura } = require('./facturas/procesarFactura.js');

function comunicacionConFactura(data) {
    let elRetorno = procesarDatosFactura(data);
    return elRetorno; // Contiene los datos procesados del formulario
}

module.exports = {
    comunicacionConFactura
};