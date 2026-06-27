/**
 * NAVBAR — barra de navegación fija superior
 * ------------------------------------------
 * Componente reutilizable (mismo patrón que selectorUsuarios / confirmModal).
 *
 * Expone en window:
 *   - initNavbar()                 → inyecta la barra y cablea los botones.
 *   - actualizarNavbarUsuario(txt) → refresca el indicador de usuario activo.
 *
 * Depende de (definidas en controlador.js):
 *   - window.navegarVista(clave)
 *   - window.recargarVistaActual()
 *
 * No conoce la lógica de navegación: solo dispara claves. Si el controlador
 * todavía no expuso esas funciones, avisa por consola y no rompe.
 */
(function () {
    // Servicios AFIP que navegan directo (su selector de usuario va embebido en la vista)
    const SERVICIOS_AFIP = [
        { clave: 'vep', label: 'Generar VEP' },
        { clave: 'cuentaTributaria', label: 'Cuenta Tributaria' },
        { clave: 'consultaComprobantes', label: 'Consulta Comprobantes' },
        { clave: 'planesDePago', label: 'Planes de Pago' },
        { clave: 'declaracionJurada', label: 'Declaración Jurada' },
    ];

    // Subservicios ATM: van todos a la vista ATM (lote) y activan su panel.
    // `sub` = valor de data-sub del botón dentro de la vista (no es una vista aparte).
    const SUBSERVICIOS_ATM = [
        { sub: 'constancias', label: 'Constancias' },
        { sub: 'planesPago', label: 'Planes de Pago' },
        { sub: 'tasaCero', label: 'Tasa Cero' },
        { sub: 'retenciones', label: 'Retenciones' },
    ];

    function navegar(clave) {
        if (typeof window.navegarVista === 'function') {
            window.navegarVista(clave);
        } else {
            console.warn('[navbar] window.navegarVista no está disponible todavía');
        }
    }

    function recargar() {
        if (typeof window.recargarVistaActual === 'function') {
            window.recargarVistaActual();
        } else {
            console.warn('[navbar] window.recargarVistaActual no está disponible todavía');
        }
    }

    window.initNavbar = function initNavbar() {
        if (document.getElementById('appNavbar')) return; // evitar doble init

        const nav = document.createElement('nav');
        nav.id = 'appNavbar';
        nav.className = 'app-navbar';
        nav.innerHTML = `
            <div class="nav-brand">AFIP · ARCA</div>
            <div class="nav-links">
                <div class="nav-dropdown">
                    <button class="nav-btn nav-dropdown-toggle">AFIP ▾</button>
                    <div class="nav-dropdown-menu">
                        <button class="nav-drop-item" data-clave="afip">Inicio AFIP-ARCA</button>
                        ${SERVICIOS_AFIP.map(s => `<button class="nav-drop-item" data-clave="${s.clave}">${s.label}</button>`).join('')}
                    </div>
                </div>
                <div class="nav-dropdown">
                    <button class="nav-btn nav-dropdown-toggle">ATM ▾</button>
                    <div class="nav-dropdown-menu">
                        <button class="nav-drop-item" data-clave="atm">Inicio ATM</button>
                        ${SUBSERVICIOS_ATM.map(s => `<button class="nav-drop-item" data-sub="${s.sub}">${s.label}</button>`).join('')}
                    </div>
                </div>
                <button class="nav-btn" data-clave="clientes">Clientes</button>
                <button class="nav-btn" data-clave="pdf">PDF</button>
                <button class="nav-btn" data-clave="historial">Historial</button>
            </div>
            <div class="nav-right">
                <span class="nav-usuario" id="navUsuario"></span>
                <button class="nav-btn nav-recargar" id="navRecargar" title="Recargar vista (Ctrl+Shift+R)">⟳ Recargar</button>
            </div>
        `;
        document.body.insertBefore(nav, document.body.firstChild);

        // Cierra TODOS los menús desplegables abiertos.
        function cerrarDropdowns() {
            nav.querySelectorAll('.nav-dropdown-menu.abierto').forEach(m => m.classList.remove('abierto'));
        }

        // Navegación por vista (botones principales + ítems con data-clave)
        nav.querySelectorAll('[data-clave]').forEach(btn => {
            btn.addEventListener('click', () => {
                navegar(btn.dataset.clave);
                cerrarDropdowns();
            });
        });

        // Navegación a subservicios ATM (ítems con data-sub): van a la vista ATM
        // y activan su panel vía window.navegarAtmSub (definida en controlador.js).
        nav.querySelectorAll('[data-sub]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof window.navegarAtmSub === 'function') {
                    window.navegarAtmSub(btn.dataset.sub);
                } else {
                    console.warn('[navbar] window.navegarAtmSub no está disponible todavía');
                }
                cerrarDropdowns();
            });
        });

        // Dropdowns (AFIP, ATM…): cada toggle abre su propio menú y cierra los demás.
        nav.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
            const menu = toggle.nextElementSibling;
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const estaAbierto = menu.classList.contains('abierto');
                cerrarDropdowns();
                if (!estaAbierto) menu.classList.add('abierto');
            });
        });
        document.addEventListener('click', cerrarDropdowns); // click afuera cierra

        // Botón recargar vista
        nav.querySelector('#navRecargar').addEventListener('click', recargar);
    };

    window.actualizarNavbarUsuario = function (texto) {
        const el = document.getElementById('navUsuario');
        if (el) el.textContent = texto ? `👤 ${texto}` : '';
    };
})();
