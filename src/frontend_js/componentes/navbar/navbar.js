/**
 * NAVBAR — barra de navegación fija superior
 * ------------------------------------------
 * Componente reutilizable (mismo patrón que selectorUsuarios / confirmModal).
 *
 * Expone en window:
 *   - initNavbar()                 → inyecta la barra y cablea los botones.
 *   - actualizarNavbarUsuario(txt) → refresca el indicador de usuario activo.
 *
 * Depende de:
 *   - window.CATALOGO_SERVICIOS / window.ejecutarServicio (catalogoServicios.js):
 *     los menús salen de ahí; un servicio nuevo se agrega en el catálogo, no acá.
 *   - window.recargarVistaActual() (controlador.js)
 *
 * No conoce la lógica de navegación: cada ítem lleva data-servicio y el catálogo
 * sabe qué hacer. Si algo no está disponible todavía, avisa por consola y no rompe.
 */
(function () {
    const catalogo = () => window.CATALOGO_SERVICIOS || [];

    // Botones de un grupo del catálogo (los que van en la navbar).
    function items(grupo, clase) {
        return catalogo()
            .filter(s => s.grupo === grupo && s.navbar !== false)
            .map(s => `<button class="${clase}" data-servicio="${s.id}">${s.label}</button>`)
            .join('');
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
            <div class="nav-logo" aria-hidden="true"></div>
            <div class="nav-links">
                <div class="nav-dropdown">
                    <button class="nav-btn nav-dropdown-toggle">AFIP ▾</button>
                    <div class="nav-dropdown-menu">${items('AFIP', 'nav-drop-item')}</div>
                </div>
                <div class="nav-dropdown nav-dropdown-atm">
                    <button class="nav-btn nav-dropdown-toggle">ATM ▾</button>
                    <div class="nav-dropdown-menu">${items('ATM', 'nav-drop-item')}</div>
                </div>
                ${items('General', 'nav-btn')}
            </div>
            <div class="nav-right">
                <span class="nav-usuario" id="navUsuario"></span>
                <button class="nav-btn" id="navConfigDatos" title="Carpeta de datos">📁</button>
                <button class="nav-btn nav-recargar" id="navRecargar" title="Recargar vista (Ctrl+Shift+R)">⟳ Recargar</button>
            </div>
        `;
        document.body.insertBefore(nav, document.body.firstChild);

        // Cierra TODOS los menús desplegables abiertos.
        function cerrarDropdowns() {
            nav.querySelectorAll('.nav-dropdown-menu.abierto').forEach(m => m.classList.remove('abierto'));
        }

        // Todos los ítems (menús + botones sueltos): el catálogo sabe qué hace cada uno
        // (vista, subservicio ATM, lanzador, evento de módulo).
        nav.querySelectorAll('[data-servicio]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof window.ejecutarServicio === 'function') {
                    window.ejecutarServicio(btn.dataset.servicio);
                } else {
                    console.warn('[navbar] window.ejecutarServicio no está disponible todavía');
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

        // Botón carpeta de datos (abre el modal de configDatos)
        nav.querySelector('#navConfigDatos').addEventListener('click', () => {
            if (typeof window.abrirConfigDatos === 'function') {
                window.abrirConfigDatos();
            } else {
                console.warn('[navbar] window.abrirConfigDatos no está disponible todavía');
            }
        });
    };

    window.actualizarNavbarUsuario = function (texto) {
        const el = document.getElementById('navUsuario');
        if (el) el.textContent = texto ? `👤 ${texto}` : '';
    };
})();
