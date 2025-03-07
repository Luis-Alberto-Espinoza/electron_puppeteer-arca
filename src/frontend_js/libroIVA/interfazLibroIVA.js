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
    const modificarSegunInforme = document.getElementById('modificarSegunInforme').checked;
    const eliminarAnteriores = document.getElementById('eliminarAnteriores').checked;
    const todoAnterior = document.getElementById('todoAnterior').checked;

    // Determinar el caso a ejecutar
    let caseValue = 0;
    if (informe) caseValue = "informe";
    if (modificarSegunInforme) caseValue = "modificarSegunInforme";
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
}
