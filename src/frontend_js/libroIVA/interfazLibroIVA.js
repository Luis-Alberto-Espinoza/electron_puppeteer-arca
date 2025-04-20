/*
este archivo sera el index de libro iva 
por ende debera capturar y manejar todos las validaciones necesarias 
para que al main lleguen los datos lo mas limpío posible 

*/

export function procesarLibroIva(libroIvaData) {
    // Obtener referencias a los elementos
    console.log('Cargando el script de libro IVA...'); // Depuración
    const mostrarEliminarAnterioresBtn = document.getElementById('mostrarEliminarAnterioresBtn');
    const numeroEliminarContainer = document.getElementById('numeroEliminarContainer');
    const numeroEliminarInput = document.getElementById('numeroEliminar');
    const numeroConfirmadoSpan = document.getElementById('numeroConfirmado');
    let numeroConfirmado = false;

    // Mostrar el contenedor al hacer clic en el botón
    // mostrarEliminarAnterioresBtn.addEventListener('click', () => {
    //     //console.log('Botón "Eliminar anteriores" presionado'); // Depuración
    //     numeroEliminarContainer.style.display = 'block';
    // });

 

    // Evento submit del formulario
    document.getElementById('libroIvaForm').addEventListener('submit', function (event) {
        event.preventDefault();

        const data = {
            case: '',
            archivos: []
        };

        // Validar si el número fue confirmado
        if (numeroEliminarContainer.style.display === 'block') {
            if (!numeroConfirmado) {
                alert('Por favor, confirme el número antes de enviar el formulario.');
                return;
            }
            data.case = 'eliminarAnteriores';
            data.numeroEliminar = numeroEliminarInput.value;
        } else if (document.getElementById('informe').checked) {
            data.case = 'informe';
        } else if (document.getElementById('todoAnterior').checked) {
            data.case = 'todoAnterior';
        }

        // Enviar los datos al backend
        console.log('Datos a enviar:', data);
        window.electronAPI.procesarLibroIva(data);
    });

    // Manejar la visibilidad del contenedor extra al elegir "eliminarAnteriores"
    const mensajeArchivos = document.getElementById('mensajeArchivos');
    const trabajarConAnterioresRadio = document.getElementById('trabajarConAnteriores');
    const numeroLineasContainer = document.getElementById('numeroLineasContainer');

    trabajarConAnterioresRadio.addEventListener('change', function () {
        if (trabajarConAnterioresRadio.checked) {
            numeroEliminarContainer.style.display = 'none';
            mensajeArchivos.style.display = 'none';
        }
        numeroLineasContainer.style.display = this.checked ? 'block' : 'none';
    });

    // Si se seleccionan otras opciones, ocultar el contenedor extra
    const informeRadio = document.getElementById('informe');
    const todoAnteriorRadio = document.getElementById('todoAnterior');
    informeRadio.addEventListener('change', function () {
        numeroEliminarContainer.style.display = 'none';
        mensajeArchivos.style.display = 'none';
    });
    todoAnteriorRadio.addEventListener('change', function () {
        numeroEliminarContainer.style.display = 'none';
        mensajeArchivos.style.display = 'none';
    });

    // Ocultar el campo numérico cuando se seleccionan otras opciones
    [informeRadio, mostrarEliminarAnterioresBtn, todoAnteriorRadio].forEach(radio => {
        radio.addEventListener('change', function () {
            numeroLineasContainer.style.display = 'none';
        });
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
