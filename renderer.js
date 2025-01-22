//const { ipcRenderer } = require('electron');
// ipcRenderer.on('resultado-mayusculas', (event, resultado) => {
//     resultadoDiv.textContent = 'Mayúsculas: ' + resultado;
// });

// ipcRenderer.on('resultado-conteo', (event, resultado) => {
//     resultadoDiv.textContent = 'Número de palabras: ' + resultado;
// });

window.electronAPI.onFormularioRecibido((event, mensaje) => {
    console.log(mensaje);
    alert(mensaje); // O cualquier otra acción que quieras realizar
});