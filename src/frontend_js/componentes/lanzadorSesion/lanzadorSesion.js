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
    // Etiqueta de la clave según el servicio (ARCA usa "clave fiscal"; ATM su propia clave).
    const LABEL_CLAVE = { afip: 'Clave fiscal', atm: 'Clave ATM' };

    // Servicios válidos (también son el 'servicio' que entiende contribuyente.listar).
    const SERVICIOS = ['afip', 'atm'];

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
        if (!SERVICIOS.includes(servicio)) {
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

                <div class="lanzador-tabs" role="tablist">
                    <button class="lanzador-tab activo" data-modo="cliente">👥 Cliente guardado</button>
                    <button class="lanzador-tab" data-modo="manual">✍️ Ingresar a mano</button>
                </div>

                <div class="lanzador-panel" data-modo="cliente">
                    <p class="lanzador-ayuda">Hacé click en un cliente y se abre el navegador ya logueado para operar a mano.</p>
                    <div id="lanzador-selector"></div>
                </div>

                <div class="lanzador-panel" data-modo="manual" hidden>
                    <p class="lanzador-ayuda">Ingresá el CUIT y la clave a mano para abrir el navegador logueado (no se guardan).</p>
                    <label class="lanzador-campo">
                        <span>CUIT</span>
                        <input type="text" id="lanzador-manual-cuit" inputmode="numeric" autocomplete="off" placeholder="20123456789">
                    </label>
                    <label class="lanzador-campo">
                        <span>${LABEL_CLAVE[servicio]}</span>
                        <div class="lanzador-clave-wrap">
                            <input type="password" id="lanzador-manual-clave" autocomplete="off" placeholder="••••••••">
                            <button type="button" class="lanzador-ver-clave" id="lanzador-ver-clave" title="Mostrar clave">👁️</button>
                        </div>
                    </label>
                </div>

                <div class="lanzador-estado" id="lanzador-estado"></div>
                <div class="lanzador-acciones" hidden>
                    <button class="lanzador-btn-abrir" id="lanzador-btn-abrir" disabled>Abrir navegador</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const btnAbrir = overlay.querySelector('#lanzador-btn-abrir');
        const estado = overlay.querySelector('#lanzador-estado');
        const inputCuit = overlay.querySelector('#lanzador-manual-cuit');
        const inputClave = overlay.querySelector('#lanzador-manual-clave');
        const btnVerClave = overlay.querySelector('#lanzador-ver-clave');
        const contSelector = overlay.querySelector('#lanzador-selector');
        const acciones = overlay.querySelector('.lanzador-acciones');
        let modoActivo = 'cliente';
        let abriendo = false;   // bloquea la lista mientras se abre un navegador (evita doble apertura)

        function limpiarEstado() {
            estado.textContent = '';
            estado.className = 'lanzador-estado';
        }

        // El botón solo existe en modo manual; en modo cliente el click en la lista abre directo.
        function recomputarBoton() {
            btnAbrir.disabled = abriendo || !(inputCuit.value.trim() && inputClave.value);
        }

        // Cerrar al clickear el fondo o la X.
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        overlay.querySelector('.lanzador-cerrar').addEventListener('click', cerrar);

        // Pestañas: alternar cliente / manual.
        overlay.querySelectorAll('.lanzador-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                modoActivo = tab.dataset.modo;
                overlay.querySelectorAll('.lanzador-tab').forEach(t =>
                    t.classList.toggle('activo', t === tab));
                overlay.querySelectorAll('.lanzador-panel').forEach(p =>
                    p.hidden = p.dataset.modo !== modoActivo);
                acciones.hidden = modoActivo !== 'manual';
                limpiarEstado();
                recomputarBoton();
            });
        });

        inputCuit.addEventListener('input', () => { limpiarEstado(); recomputarBoton(); });
        inputClave.addEventListener('input', () => { limpiarEstado(); recomputarBoton(); });

        // Ojito: mostrar / ocultar la clave para chequear que se tipeó bien.
        btnVerClave.addEventListener('click', () => {
            const visible = inputClave.type === 'text';
            inputClave.type = visible ? 'password' : 'text';
            btnVerClave.classList.toggle('activo', !visible);
            btnVerClave.title = visible ? 'Mostrar clave' : 'Ocultar clave';
        });

        try {
            await asegurarSelectorCargado();
        } catch (err) {
            estado.textContent = '❌ ' + err.message;
            estado.className = 'lanzador-estado error';
            return;
        }

        // Elegir un cliente de la lista ES la acción: abre el navegador sin botón intermedio.
        // La selección se descarta al toque: no queda tildado y un nuevo click vuelve a abrir.
        const selector = new SelectorUsuarios('lanzador-selector', {
            fuente: 'contribuyentes',   // modelo plano
            servicio: servicio,         // 'afip' | 'atm' → computa puedeOperar
            seleccionUnica: true,
            mostrarTablaSeleccionados: false,
            onCambioSeleccion: (sel) => {
                const cliente = sel[0];
                if (!cliente) return;   // el propio quitarSeleccion de abajo vuelve a llamar acá
                selector.quitarSeleccion(cliente.id);
                if (abriendo) return;
                lanzar(window.electronAPI.sesion[servicio](cliente.cuit));
            }
        });

        btnAbrir.addEventListener('click', () => {
            const cuit = inputCuit.value.trim();
            const clave = inputClave.value;
            if (!cuit || !clave || abriendo) return;
            lanzar(window.electronAPI.sesion[`${servicio}Manual`]({ cuit, clave }));
        });

        async function lanzar(promesa) {
            abriendo = true;
            contSelector.classList.add('lanzador-bloqueado');
            btnAbrir.disabled = true;
            estado.textContent = '⏳ Abriendo navegador e iniciando sesión…';
            estado.className = 'lanzador-estado cargando';
            try {
                const r = await promesa;
                if (r && r.success) {
                    const extra = r.requiereElegirEmpresa
                        ? ' Entrás como su representante: elegí la empresa en la pantalla de AFIP.'
                        : '';
                    estado.textContent = '✅ Navegador abierto y sesión iniciada. Podés operar a mano (cerralo cuando termines).' + extra;
                    estado.className = 'lanzador-estado ok';
                } else {
                    estado.textContent = '❌ ' + ((r && r.message) || 'No se pudo iniciar sesión');
                    estado.className = 'lanzador-estado error';
                }
            } catch (err) {
                estado.textContent = '❌ ' + err.message;
                estado.className = 'lanzador-estado error';
            } finally {
                abriendo = false;
                contSelector.classList.remove('lanzador-bloqueado');
                recomputarBoton();
            }
        }
    }

    window.abrirLanzadorSesion = abrirLanzadorSesion;
})();
