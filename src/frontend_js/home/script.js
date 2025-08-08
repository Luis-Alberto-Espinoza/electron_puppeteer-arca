document.addEventListener('DOMContentLoaded', function () {
  const facturasBtn = document.getElementById('facturasBtn');
  const facturasDiv = document.getElementById('facturasDiv');
  const facturasForm = document.getElementById('facturasForm');
  const fechaComprobante = document.getElementById('fechaComprobante');
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

    setTimeout(function () {
      // Selecciona el tipo de contribuyente 
      //document.getElementById('tipoContribuyenteC').checked = true;
      // document.getElementById('tipoContribuyenteB').checked = true;

      // Selecciona la actividad de producto
      document.getElementById('producto').checked = true;
      // document.getElementById('servicio').checked = true;

      // Establece la fecha del comprobante con este formato: 02/08/2025
      const fecha = new Date();
      const dia = String(fecha.getDate()).padStart(2, '0');
      const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Los meses empiezan desde 0
      const anio = fecha.getFullYear();
      fechaComprobante.value = `${dia}/${mes}/${anio}`; // Establece la fecha en el campo


      // Selecciona el ingreso manual
      document.getElementById('ingresoManual').checked = true;

      // Selecciona el mes de julio
      document.getElementById('selectMes').selectedIndex = `${mes}`-2;

      // Selecciona el año 2026
      document.getElementById('selectAnio').value = '2025';

      // Selecciona periodo días hábiles
      //document.getElementById('periodoDiasHabiles').checked = true;

      // selecciona periodo dias menuales
      document.getElementById('periodoTotal').checked = true;
      // Selecciona monto total
      document.getElementById('montoTotal').checked = true;

      inputContainerTotal = document.getElementById('inputContainerTotal');
      inputContainerTotal.style.display = 'block'; // Muestra el contenedor del monto total

      // Ingresa el monto total
      document.getElementById('montoTotalInput').value = '235689';

    }, 500); // Espera 3 segundos antes de completar el formulario
  });
});