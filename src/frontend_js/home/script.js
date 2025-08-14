document.addEventListener('DOMContentLoaded', function () {
  const facturasBtn = document.getElementById('facturasBtn');
  const facturasDiv = document.getElementById('facturasDiv');
  const facturasForm = document.getElementById('facturasForm');

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
      const periodoTotal = document.getElementById('periodoTotal');
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
        // Establece la fecha en el campo
        const fecha = new Date();
        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses empiezan desde 0
        const anio = fecha.getFullYear();
        fechaComprobante.value = `${dia}/${mes}/${anio}`;

        // Selecciona el tipo de contribuyente 
        //document.getElementById('tipoContribuyenteC').checked = true;
        // document.getElementById('tipoContribuyenteB').checked = true;

        // Selecciona la actividad de producto
        producto.checked = true;
        // document.getElementById('servicio').checked = true;

        // Selecciona el ingreso manual
        ingresoManual.checked = true;

        // Selecciona el mes de julio
        selectMes.selectedIndex = parseInt(mes, 10) - 1;

        // Selecciona el año 2026
        selectAnio.value = String(anio + 1); // ejemplo: año siguiente

        // Selecciona periodo días hábiles
        //document.getElementById('periodoDiasHabiles').checked = true;

        // selecciona periodo dias menuales
        periodoTotal.checked = true;
        // Selecciona monto total
        montoTotal.checked = true;

        inputContainerTotal.style.display = 'block'; // Muestra el contenedor del monto total

        // Ingresa el monto total
        montoTotalInput.value = '235689';
      } else {
        // Si no existen aún, espera y vuelve a intentar
        setTimeout(rellenarFormulario, 100);
      }
    }

    setTimeout(rellenarFormulario, 700); // Espera a que el HTML esté cargado
  });
});