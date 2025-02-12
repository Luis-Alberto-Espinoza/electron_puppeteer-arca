document.addEventListener('DOMContentLoaded', function() {
    const facturasBtn = document.getElementById('facturasBtn');
    const facturasDiv = document.getElementById('facturasDiv');
    const facturasForm = document.getElementById('facturasForm');
  
    facturasBtn.addEventListener('click', function() {
  
      setTimeout(function() {
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
      }, 2000); // Espera 3 segundos antes de completar el formulario
    });
  });