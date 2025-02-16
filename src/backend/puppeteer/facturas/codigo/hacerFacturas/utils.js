// utils.js
function formatearFecha() {
    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
  }
  
  // Exporta la función para que pueda ser utilizada en otros archivos
  module.exports = { formatearFecha };