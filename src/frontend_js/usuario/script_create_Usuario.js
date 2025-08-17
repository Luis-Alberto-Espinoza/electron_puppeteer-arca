console.log("script_create_Usuario.js cargado");

// Función para completar el formulario con datos 'hardcodeados'
function completarFormulario() {
  const datosUsuario = {
    nombre: 'Juan',
    apellido: 'Pérez',
    cuit: null,
    cuil: '27334617977',
    tipoContribuyente: 'C',
    clave: 'MiPerro2025'
  };

  document.getElementById('nombre').value = datosUsuario.nombre;
  document.getElementById('apellido').value = datosUsuario.apellido;
  document.getElementById('cuit').value = datosUsuario.cuit;
  document.getElementById('cuil').value = datosUsuario.cuil;
  document.getElementById('tipoContribuyente').value = datosUsuario.tipoContribuyente;
  document.getElementById('clave').value = datosUsuario.clave;
}

// Ejecutar solo al hacer click en el botón btnEntrarAfip
document.addEventListener('DOMContentLoaded', () => {
  const btnEntrarAfip = document.getElementById('btnEntrarAfip');
  if (btnEntrarAfip) {
    btnEntrarAfip.addEventListener('click', () => {
      completarFormulario();
      console.log("Formulario de usuario completado con datos 'hardcodeados'.");
    });
  }
});

export { completarFormulario };