let select_luis = document.getElementById('idivareceptor');

select_luis.addEventListener('change', () => console.log('Evento change disparado'));
select_luis.addEventListener('input', () => console.log('Evento input disparado'));
select_luis.addEventListener('select', () => console.log('Evento select_luis disparado'));


// Supongamos que tu elemento tiene id 'miElemento'
let elemento = document.getElementById('idivareceptor');

let formu = document.getElementById('formulario')

// Cambiar el valor mediante JavaScript
//formu.value = 'nuevoValor';
formu[0].value = 5

// Crear y disparar el evento 'input'
let eventoInput = new Event('input', { bubbles: true, cancelable: true });
formu[0].dispatchEvent(eventoInput);

// Crear y disparar el evento 'change'
let eventoChange = new Event('change', { bubbles: true, cancelable: true });
formu[0].dispatchEvent(eventoChange);