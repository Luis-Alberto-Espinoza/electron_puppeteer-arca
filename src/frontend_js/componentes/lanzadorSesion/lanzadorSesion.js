/**
 * COMPONENTE COMPARTIDO: LANZADOR DE SESIÓN
 *
 * Abre un modal para elegir UN cliente y abrir el navegador ya logueado (AFIP o ATM).
 * Reusa el componente SelectorUsuarios (modo single, solo clientes validados).
 *
 * Uso:  window.abrirLanzadorSesion('afip' | 'atm')
 *
 * El backend (afip:abrirSesion / atm:abrirSesion) abre Chrome visible, loguea y deja
 * la ventana abierta para que el usuario opere a mano.
 */
(function () {
    const TITULOS = { afip: 'Abrir sesión AFIP', atm: 'Abrir sesión ATM' };

    // Campos que usa SelectorUsuarios para filtrar validados (igual que el resto del front).
    const CONFIG = {
        afip: { campoCredencial: 'claveAFIP', campoEstado: 'estado_afip', campoError: 'errorAfip' },
        atm:  { campoCredencial: 'claveATM',  campoEstado: 'estado_atm',  campoError: 'errorAtm' }
    };

    // Rutas relativas a home/index.html (igual que controlador.js).
    const SELECTOR_CSS = '../componentes/selectorUsuarios/selectorUsuarios.css';
    const SELECTOR_JS  = '../componentes/selectorUsuarios/selectorUsuarios.js';

    function asegurarSelectorCargado() {
        return new Promise((resolve, reject) => {
            if (!document.head.querySelector(`link[href="${SELECTOR_CSS}"]`)) {
                const l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = SELECTOR_CSS;
                document.head.appendChild(l);
            }
            if (typeof SelectorUsuarios !== 'undefined') return resolve();
            const old = document.head.querySelector(`script[src="${SELECTOR_JS}"]`);
            if (old) old.remove();
            const s = document.createElement('script');
            s.src = SELECTOR_JS;
            s.defer = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('No se pudo cargar el selector de clientes'));
            document.head.appendChild(s);
        });
    }

    function cerrar() {
        const ov = document.getElementById('lanzador-sesion-overlay');
        if (ov) ov.remove();
    }

    async function abrirLanzadorSesion(servicio) {
        if (!CONFIG[servicio]) {
            console.error('[Lanzador] Servicio inválido:', servicio);
            return;
        }
        cerrar(); // si quedó uno abierto

        const overlay = document.createElement('div');
        overlay.id = 'lanzador-sesion-overlay';
        overlay.className = 'lanzador-overlay';
        overlay.innerHTML = `
            <div class="lanzador-caja lanzador-${servicio}">
                <div class="lanzador-header">
                    <h3>🚀 ${TITULOS[servicio]}</h3>
                    <button class="lanzador-cerrar" title="Cerrar">✕</button>
                </div>
                <p class="lanzador-ayuda">Elegí un cliente y abrí el navegador ya logueado para operar a mano.</p>
                <div id="lanzador-selector"></div>
                <div class="lanzador-estado" id="lanzador-estado"></div>
                <div class="lanzador-acciones">
                    <button class="lanzador-btn-abrir" id="lanzador-btn-abrir" disabled>Abrir navegador</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const btnAbrir = overlay.querySelector('#lanzador-btn-abrir');
        const estado = overlay.querySelector('#lanzador-estado');
        let clienteSel = null;

        // Cerrar al clickear el fondo o la X.
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        overlay.querySelector('.lanzador-cerrar').addEventListener('click', cerrar);

        try {
            await asegurarSelectorCargado();
        } catch (err) {
            estado.textContent = '❌ ' + err.message;
            estado.className = 'lanzador-estado error';
            return;
        }

        const cfg = CONFIG[servicio];
        new SelectorUsuarios('lanzador-selector', {
            campoCredencial: cfg.campoCredencial,
            campoEstado: cfg.campoEstado,
            campoError: cfg.campoError,
            seleccionUnica: true,
            mostrarTablaSeleccionados: false,
            onCambioSeleccion: (sel) => {
                clienteSel = sel[0] || null;
                btnAbrir.disabled = !clienteSel;
                estado.textContent = '';
                estado.className = 'lanzador-estado';
            }
        });

        btnAbrir.addEventListener('click', async () => {
            if (!clienteSel) return;
            btnAbrir.disabled = true;
            estado.textContent = '⏳ Abriendo navegador e iniciando sesión…';
            estado.className = 'lanzador-estado cargando';
            try {
                const r = await window.electronAPI.sesion[servicio](clienteSel.id);
                if (r && r.success) {
                    estado.textContent = '✅ Navegador abierto y sesión iniciada. Podés operar a mano (cerralo cuando termines).';
                    estado.className = 'lanzador-estado ok';
                } else {
                    estado.textContent = '❌ ' + ((r && r.message) || 'No se pudo iniciar sesión');
                    estado.className = 'lanzador-estado error';
                }
            } catch (err) {
                estado.textContent = '❌ ' + err.message;
                estado.className = 'lanzador-estado error';
            } finally {
                btnAbrir.disabled = false;
            }
        });
    }

    window.abrirLanzadorSesion = abrirLanzadorSesion;
})();
