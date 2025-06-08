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
      // Selecciona el tipo de contribuyente 
      document.getElementById('tipoContribuyenteC').checked = true;
      // document.getElementById('tipoContribuyenteB').checked = true;



      // Selecciona la actividad de producto
      document.getElementById('producto').checked = true;
      // document.getElementById('servicio').checked = true;

      // Selecciona el ingreso manual
      document.getElementById('ingresoManual').checked = true;

      //ingresa las fechas al input type textArea
      document.getElementById('fechasFacturas').value = "01/01/2025, 15/01/2025, 29/01/2025";


      // Selecciona el mes de julio
      document.getElementById('selectMes').value = 5;

      // Selecciona el año 2026
      document.getElementById('selectAnio').value = '2025';

      // Selecciona periodo días hábiles
      document.getElementById('periodoDiasHabiles').checked = true;

      // Selecciona monto total
      //document.getElementById('montoTotal').checked = true;

      // Ingresa el monto total
      // document.getElementById('montoTotalInput').value = '235689';



      //para el uso de monto manual 
      
     // document.getElementById('montoManual').checked = true;

      // Ingresa el monto total
      document.getElementById('textareaMontoManual').value = '235689\n888888\n2000.35';



      //PARA CARGA MASIVA DE DATOS 
      // seleccionar checkbox de ingresoMasivo
      document.getElementById('ingresoMasivo').checked = true;

      // ingresar fechas en el textArea de fechas en el formato correco. revisar validaciones 
      // formato: YYYY-MM-DD
      document.getElementById('textareaFechas').value = "01/05/2025\n15/05/2025\n29/05/2025";
      
      // Ingreso de los montos separacion con saltos de lines o sea un en cada renglon, correspondiente a el lugar que ocupa su fecha correspondiente 
      document.getElementById('textareaMontos').value = '235689\n888888\n2000.35';
      const argaMasiva = document.getElementById('seccionMasiva');
      libroIvaDargaMasivaiv.style.display = 'block';
      
      // Simula el envío del formulario (opcional)
      //procesarBtn.click();
    }, 500); // Espera 3 segundos antes de completar el formulario
  });

  const btnLibroIVA = document.getElementById('btnLibroIVA');
  const libroIvaDiv = document.getElementById('libroIvaDiv');

  btnLibroIVA.addEventListener('click', function () {
    if (libroIvaDiv.style.display === 'none') {
      libroIvaDiv.style.display = 'block';
    } else {
      libroIvaDiv.style.display = 'none';
    }
  });
});