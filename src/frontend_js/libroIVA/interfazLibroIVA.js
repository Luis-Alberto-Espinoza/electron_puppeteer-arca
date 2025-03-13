/*
este archivo sera el index de libro iva 
por ende debera capturar y manejar todos las validaciones necesarias 
para que al main lleguen los datos lo mas limpío posible 

*/

export function procesarLibroIva (libroIvaData){

document.getElementById('libroIvaForm').addEventListener('submit', function (event) {
    event.preventDefault(); // Evita el envío tradicional del formulario

    // Obtener los valores del formulario
    const informe = document.getElementById('informe').checked;
    const eliminarAnteriores = document.getElementById('eliminarAnteriores').checked;
    const todoAnterior = document.getElementById('todoAnterior').checked;

    // Determinar el caso a ejecutar
    let caseValue = 0;
    if (informe) caseValue = "informe";
    if (eliminarAnteriores) caseValue = "eliminarAnteriores";
    if (todoAnterior) caseValue = "todoAnterior";

    // Validar que se haya seleccionado al menos una opción
    if (caseValue === 0) {
        alert('Por favor, selecciona al menos una opción.');
        return;
    }

    // Estructurar los datos para enviar
    const data = {
        case: caseValue,
        archivos: [] // Aquí puedes agregar los archivos o datos necesarios
    };

    // Llamar a la función libroIVAManager
    try {
        const resultado = libroIVAManager(data);
        console.log('Resultado:', resultado);
        alert('Procesamiento completado con éxito.');
    } catch (error) {
        console.error('Error al procesar el libro IVA:', error.message);
        alert('Error al procesar el libro IVA: ' + error.message);
    }
    window.electronAPI.procesarLibroIva(data);
});

document.getElementById('modificarSegunInforme').addEventListener('click', function (event) {
    event.preventDefault(); // Evita el comportamiento predeterminado del botón
    console.log("\n\nhola\n\n");

    // Obtener los valores del formulario
    const libroIvaForm = document.getElementById('libroIvaForm');
    const libroIvaData = new FormData(libroIvaForm);
    const data = Object.fromEntries(libroIvaData.entries());
    data.archivos = []; // Aquí puedes agregar los archivos o datos necesarios

    // Estructurar los datos para enviar
    data.case = 'modificarSegunInforme';

    // Llamar a la función modificarSegunInforme
    try {
        const resultado = modificarSegunInforme(data);
        console.log('Resultado:', resultado);
        alert('Modificación completada con éxito.');
    } catch (error) {
        console.error('Error al modificar según informe:', error.message);
        alert('Error al modificar según informe: ' + error.message);
    }
    window.electronAPI.modificarSegunInforme(data);
});
}
