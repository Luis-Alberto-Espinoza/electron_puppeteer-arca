/**
 * Inicializa el módulo Home AFIP
 * Configura los event listeners para los botones de servicios
 */
function inicializarHomeAfip() {
    const btnGenerarVEP = document.getElementById('btnGenerarVEP');
    const btnGenerarFactura = document.getElementById('btnGenerarFactura');

    if (btnGenerarVEP) {
        btnGenerarVEP.addEventListener('click', () => {
            console.log('Cargando módulo Generar VEP...');
            cargarModuloGenerarVEP();
        });
    }

    if (btnGenerarFactura) {
        btnGenerarFactura.addEventListener('click', () => {
            console.log('Cargando módulo Generar Factura...');
            cargarModuloGenerarFactura();
        });
    }

    const btnPlanesDePago = document.getElementById('btnPlanesDePago');
    if (btnPlanesDePago) {
        btnPlanesDePago.addEventListener('click', () => {
            console.log('Cargando módulo Planes de Pago...');
            cargarModuloPlanesDePagoDesdeHome();
        });
    }

    const btnCuentaTributaria = document.getElementById('btnCuentaTributaria');
    if (btnCuentaTributaria) {
        btnCuentaTributaria.addEventListener('click', () => {
            console.log('Cargando módulo Cuenta Tributaria...');
            cargarModuloCuentaTributariaDesdeHome();
        });
    }
}

/**
 * Carga el módulo de Generar VEP
 */
async function cargarModuloGenerarVEP() {
    // Esta función será llamada desde el controlador principal
    // Por ahora, emitimos un evento personalizado que el controlador puede capturar
    const evento = new CustomEvent('cargarModuloVEP');
    document.dispatchEvent(evento);
}

/**
 * Carga el módulo de Generar Factura (selector de usuario existente)
 */
async function cargarModuloGenerarFactura() {
    // Esta función será llamada desde el controlador principal
    // Emitimos un evento personalizado que el controlador puede capturar
    const evento = new CustomEvent('cargarModuloFactura');
    document.dispatchEvent(evento);
}

/**
 * Carga el módulo de Planes de Pago (selector de usuario → vista Planes de Pago)
 */
async function cargarModuloPlanesDePagoDesdeHome() {
    const evento = new CustomEvent('cargarModuloPlanesDePago');
    document.dispatchEvent(evento);
}

/**
 * Carga el módulo de Cuenta Tributaria (Flujo A — consulta SCT con selección)
 */
async function cargarModuloCuentaTributariaDesdeHome() {
    const evento = new CustomEvent('cargarModuloCuentaTributaria');
    document.dispatchEvent(evento);
}

// Exponer la función de inicialización globalmente
window.inicializarHomeAfip = inicializarHomeAfip;
