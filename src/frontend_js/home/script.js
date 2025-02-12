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

          setTimeout(function () {
            const loginButton = document.getElementById('loginButton');
            if (loginButton) {
              loginButton.focus();
            } else {
              console.log("El botón 'Abrir AFIP con Puppeteer' no se encontró.");
            }
          }, 100); // Ajusta el retraso según sea necesario
        });
      } else {
        console.log("El botón 'Procesar' no se encontró.");
      }

    }, 100); // Un retraso de 100 milisegundos suele ser suficiente.  Ajusta si es necesario.

    setTimeout(function () {
      // Selecciona el tipo de contribuyente C
      document.getElementById('tipoContribuyenteC').checked = true;

      // Selecciona la actividad de producto
      document.getElementById('producto').checked = true;

      // Selecciona el ingreso manual
      document.getElementById('ingresoManual').checked = true;

      // Selecciona el mes de julio
      document.getElementById('selectMes').value = 7;

      // Selecciona el año 2026
      document.getElementById('selectAnio').value = '2026';

      // Selecciona periodo días hábiles
      document.getElementById('periodoDiasHabiles').checked = true;

      // Selecciona monto total
      document.getElementById('montoTotal').checked = true;

      // Ingresa el monto total
      document.getElementById('montoTotalInput').value = '235689';

      // Simula el envío del formulario (opcional)
      // facturasForm.submit();
    }, 1500); // Espera 3 segundos antes de completar el formulario
  });
});