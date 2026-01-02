//importar un modulo externo que complete el formulario de usuario con datos hardcodeados

document.addEventListener('DOMContentLoaded', function () {
  const facturasBtn = document.getElementById('facturasBtn');
  const facturasDiv = document.getElementById('facturasDiv');
  const facturasForm = document.getElementById('facturasForm');
  const ingresoMasivo = document.getElementById('ingresoMasivo');
  const seleccionaEmpresaForm = document.getElementById('seleccionaEmpresaForm');


  // generar una funcion que este atenta a si el ususario aprieta en gesion de usuario si es asi debe activar una funcion de un modulo externo que complete el formulario de usuario con datos hardcodeados
  const gestionUsuarioBtn = document.getElementById('btnUsuarios');
  gestionUsuarioBtn.addEventListener('click', function () {
    console.log("Llamando a completarFormulario desde el script de usuario");

    // Espera 500ms antes de intentar completar el formulario
    setTimeout(() => {
      completarFormulario();
    }, 500);
  });


  facturasBtn.addEventListener('click', function () {

    setTimeout(function () {
      const procesarBtn = document.querySelector('button[type="submit"]'); // Busca el botón "Procesar"

      if (procesarBtn) {
        procesarBtn.focus(); // Le da el foco al botón "Procesar"

        procesarBtn.addEventListener('click', function () {
          // Este código se ejecutará *después* de que el usuario haga clic manualmente en "Procesar"

          // setTimeout(function () {
          //   const loginButton = document.getElementById('loginButton');
          //   if (loginButton) {
          //     loginButton.focus();
          //   } else {
          //     console.log("El botón 'Abrir AFIP con Puppeteer' no se encontró.");
          //   }
          // }, 100); // Ajusta el retraso según sea necesario
        });
      } else {
        console.log("El botón 'Procesar' no se encontró.");
      }

    }, 100); // Un retraso de 100 milisegundos suele ser suficiente.  Ajusta si es necesario.

    // Espera a que los elementos del formulario existan antes de manipularlos
    function rellenarFormulario() {
      const fechaComprobante = document.getElementById('fechaComprobante');
      const producto = document.getElementById('producto');
      const ingresoManual = document.getElementById('ingresoManual');
      const selectMes = document.getElementById('selectMes');
      const selectAnio = document.getElementById('selectAnio');

      /* Preselección de fechas */
      const periodoTotal = document.getElementById('periodoTotal');
      const periodoDiasHabiles = document.getElementById('periodoDiasHabiles');
      const periodoManual = document.getElementById('periodoManual');
      const datepicker = document.getElementById('datepicker');


      const montoTotal = document.getElementById('montoTotal');
      const inputContainerTotal = document.getElementById('inputContainerTotal');
      const montoTotalInput = document.getElementById('montoTotalInput');

      // Verifica que todos los elementos existen antes de continuar
      if (
        fechaComprobante &&
        producto &&
        ingresoManual &&
        selectMes &&
        selectAnio &&
        periodoTotal &&
        montoTotal &&
        inputContainerTotal &&
        montoTotalInput
      ) {

        function obtenerFechaFormateada(diasARestar = 0) {
          // Crea una nueva instancia de Date para evitar modificar el objeto original
          const fecha = new Date();

          // Resta los días especificados
          fecha.setDate(fecha.getDate() - diasARestar);

          // Extrae y formatea el día, mes y año
          const dia = String(fecha.getDate()).padStart(2, '0');
          const mes = String(fecha.getMonth() + 1).padStart(2, '0');
          const anio = fecha.getFullYear();

          return `${dia}/${mes}/${anio}`;
        }

        // Para obtener la fecha de hoy
        const fechaHoy = obtenerFechaFormateada();

        // Para obtener la fecha de ayer
        const fechaAyer = obtenerFechaFormateada(1);

        // Asigna los valores a tus campos

        // Establece la fecha en el campo
        const fecha = new Date();
        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses empiezan desde 0
        const anio = fecha.getFullYear();
        fechaComprobante.value = fechaHoy;

        // Selecciona el tipo de contribuyente 
        //document.getElementById('tipoContribuyenteC').checked = true;
        // document.getElementById('tipoContribuyenteB').checked = true;

        // Selecciona la actividad de producto
        producto.checked = true;
        // document.getElementById('servicio').checked = true;

        // Selecciona el ingreso manual
        //ingresoManual.checked = true;

        //ingresoMasivo.checked = true;
        setTimeout(() => {
        //  ingresoMasivo.click(); // Simula un clic para activar el evento asociado
        }, 1000);
        const textareaFechas = document.getElementById('textareaFechas');
        const textareaMontos = document.getElementById('textareaMontos');
        textareaFechas.value = fechaAyer;
        textareaMontos.value = '25689';
        const procesarDatos = document.getElementById('procesarDatos');
        procesarDatos.click(); // Simula un clic para activar el evento asociado


        // Selecciona el mes de julio
        selectMes.selectedIndex = parseInt(mes, 10) - 1;

        // Selecciona el año actual
        selectAnio.value = String(anio);

        /*Preselección de fechas*/
        // Selecciona periodo días hábiles
        //document.getElementById('periodoDiasHabiles').checked = true;

        //selecciona: Ciertos dias del mes

        //periodoManual.click(); // Simula un clic para activar el evento asociado
        //periodoManual.value = fechaAyer;

        // selecciona periodo dias menuales
        // periodoTotal.checked = true;
        // Selecciona monto total
        montoTotal.checked = true;

        inputContainerTotal.style.display = 'block'; // Muestra el contenedor del monto total

        // Ingresa el monto total
        montoTotalInput.value = '25689';
      } else {
        // Si no existen aún, espera y vuelve a intentar
        setTimeout(rellenarFormulario, 100);
      }
    }

    setTimeout(rellenarFormulario, 700); // Espera a que el HTML esté cargado
  });

  function completarFormulario() {
    const datosUsuario = {
      nombre: 'Juan',
      apellido: 'Pérez',
      cuil: '',
      cuit: '27334617977',
      tipoContribuyente: 'C',
      clave: 'MiPerro2025'
    };

    function intentarCompletar() {
      const nombre = document.getElementById('nombre');
      const apellido = document.getElementById('apellido');
      const cuit = document.getElementById('cuit');
      const cuil = document.getElementById('cuil');
      const tipoContribuyente = document.getElementById('tipoContribuyente');
      const clave = document.getElementById('clave');

      if (nombre && apellido && cuit && cuil && tipoContribuyente && clave) {
        nombre.value = datosUsuario.nombre;
        apellido.value = datosUsuario.apellido;
        cuit.value = datosUsuario.cuit;
        cuil.value = datosUsuario.cuil;
        tipoContribuyente.value = datosUsuario.tipoContribuyente;
        clave.value = datosUsuario.clave;
        console.log("Formulario de usuario completado con datos 'hardcodeados'.");
      } else {
        setTimeout(intentarCompletar, 100); // Vuelve a intentar en 100ms
      }
    }

    intentarCompletar();
  }
});