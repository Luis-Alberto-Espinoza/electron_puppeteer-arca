const cuit= "27334617977";
const clave= "Miperro2022";




const urlLoginAtm = 'https://auth.afip.gob.ar/contribuyente_/login.https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';





const inputCuit = document.getElementById('cuit');
const inputClave = document.getElementById('password');
const btnLogin = document.getElementById('ingresar');

// Función para simular eventos de usuario
function triggerEvents(element, value) {
    element.focus();
    element.value = value;
    
    // Disparar múltiples eventos que podrían estar escuchando
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('keyup', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
}

// Llenar formulario
triggerEvents(inputCuit, cuit);
triggerEvents(inputClave, clave);

// Esperar un poco antes de hacer click
setTimeout(() => {
    btnLogin.click();
}, 100);





/*hacer click en oficina virtual  */
const btnOficinaVirtual = document.querySelector('a.btn.btn-ofv-3[title="Abrir Oficina Virtual"]');
if (btnOficinaVirtual) {
    btnOficinaVirtual.click();
} else {
    console.log('No se encontró el botón de Oficina Virtual');
}



/**buscar btn General que esta en el menu */
const btnGeneral = document.querySelector('a.btn.btn-gen[title="Abrir General"]');
<span class="z-menuitem-text">Constancia de Cumplimiento Fiscal</span>
//buscar ese lemento span hacerle click
const btnConstancia = document.querySelector('span.z-menuitem-text:contains("Constancia de Cumplimiento Fiscal")');
if (btnConstancia) {
    btnConstancia.click();
} else {
    console.log('No se encontró el botón de Constancia de Cumplimiento Fiscal');
}
