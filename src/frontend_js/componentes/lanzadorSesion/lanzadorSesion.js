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

    // Esc cierra el lanzador. Se guarda la referencia para sacarlo al cerrar.
    let onTeclaLanzador = null;

    function cerrar() {
        const ov = document.getElementById('lanzador-sesion-overlay');
        if (ov) ov.remove();
        if (onTeclaLanzador) {
            document.removeEventListener('keydown', onTeclaLanzador);
            onTeclaLanzador = null;
        }
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
            <div class="lanzador-caja lanzador-${servicio} tema-vista">
                <div class="lanzador-header">
                    <h3>🚀 ${TITULOS[servicio]}</h3>
                    <button class="lanzador-tab" id="lanzador-cambiar-modo">✍️ Ingresar a mano</button>
                    <button class="lanzador-cerrar" title="Cerrar">✕</button>
                </div>

                <!-- Dos columnas: a la izquierda la lista (o el formulario manual); a la
                     derecha los mensajes, siempre a la vista aunque la lista sea larga. -->
                <div class="lanzador-cuerpo">
                <div class="lanzador-principal">
                <div class="lanzador-panel" data-modo="cliente">
                    <div id="lanzador-selector"></div>
                </div>

                <div class="lanzador-panel" data-modo="manual" hidden>
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

                <div class="lanzador-acciones" hidden>
                    <button class="lanzador-btn-abrir" id="lanzador-btn-abrir" disabled>Abrir navegador</button>
                </div>
                </div>

                <!-- Oculto: el resultado ya se ve en la fila del cliente. Se deja el nodo porque el JS escribe en #lanzador-estado. -->
                <aside class="lanzador-lateral" hidden>
                    <div class="lanzador-lateral-titulo">Estado</div>
                    <div class="lanzador-estado" id="lanzador-estado">Elegí un cliente de la lista.</div>
                    <div class="lanzador-atajos">Esc o ✕ para cerrar</div>
                </aside>
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

        // Sin novedades: la columna de estado muestra qué hacer según la pestaña.
        function limpiarEstado() {
            estado.textContent = modoActivo === 'manual'
                ? 'Completá CUIT y clave y apretá "Abrir navegador".'
                : 'Elegí un cliente de la lista.';
            estado.className = 'lanzador-estado';
        }

        // El botón solo existe en modo manual; en modo cliente el click en la lista abre directo.
        function recomputarBoton() {
            btnAbrir.disabled = abriendo || !(inputCuit.value.trim() && inputClave.value);
        }

        // Cerrar al clickear el fondo, la X o con Esc.
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        overlay.querySelector('.lanzador-cerrar').addEventListener('click', cerrar);
        onTeclaLanzador = (e) => {
            if (e.key !== 'Escape') return;
            // Si el diálogo de clave está abierto encima, el Esc es para él, no para el lanzador.
            if (document.querySelector('.ac-overlay')) return;
            cerrar();
        };
        document.addEventListener('keydown', onTeclaLanzador);

        // Alternar cliente / manual con un solo botón en el header.
        // El texto muestra el modo al que se pasa, no el actual.
        const btnModo = overlay.querySelector('#lanzador-cambiar-modo');
        btnModo.addEventListener('click', () => {
            modoActivo = modoActivo === 'cliente' ? 'manual' : 'cliente';
            btnModo.textContent = modoActivo === 'cliente' ? '✍️ Ingresar a mano' : '👥 Cliente guardado';
            overlay.querySelectorAll('.lanzador-panel').forEach(p =>
                p.hidden = p.dataset.modo !== modoActivo);
            acciones.hidden = modoActivo !== 'manual';
            limpiarEstado();
            recomputarBoton();
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
        //
        // Por default solo los habilitados. La casilla "Mostrar no habilitados" suma los que tienen
        // clave sin validar (abrir el navegador la valida) y los que no tienen clave, con el botón
        // "Clave" para cargarla/corregirla desde acá.
        const selector = new SelectorUsuarios('lanzador-selector', {
            fuente: 'contribuyentes',   // modelo plano
            servicio: servicio,         // 'afip' | 'atm' → computa puedeOperar
            seleccionUnica: true,
            mostrarTablaSeleccionados: false,
            ...window.opcionesClaveEnSelector(servicio, () => selector),
            onCambioSeleccion: (sel) => {
                const cliente = sel[0];
                if (!cliente) return;   // el propio quitarSeleccion de abajo vuelve a llamar acá
                selector.quitarSeleccion(cliente.id);
                if (abriendo) return;
                lanzar(window.electronAPI.sesion[servicio](cliente.cuit), cliente);
            }
        });

        btnAbrir.addEventListener('click', () => {
            const cuit = inputCuit.value.trim();
            const clave = inputClave.value;
            if (!cuit || !clave || abriendo) return;
            lanzar(window.electronAPI.sesion[`${servicio}Manual`]({ cuit, clave }));
        });

        // cliente: la fila de donde salió (null en modo manual). El resultado se muestra en esa fila.
        async function lanzar(promesa, cliente = null) {
            abriendo = true;
            if (cliente) selector.limpiarMarcaFila(cliente.id);
            contSelector.classList.add('lanzador-bloqueado');
            btnAbrir.disabled = true;
            estado.textContent = '⏳ Abriendo navegador e iniciando sesión…';
            estado.className = 'lanzador-estado cargando';
            let r = null;
            try {
                r = await promesa;
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
                r = { success: false, message: err.message };
                estado.textContent = '❌ ' + err.message;
                estado.className = 'lanzador-estado error';
            } finally {
                abriendo = false;
                contSelector.classList.remove('lanzador-bloqueado');
                recomputarBoton();
            }

            // El resultado también va en la fila del cliente: ahí está el botón para corregir la clave.
            if (cliente) {
                // El backend registró si la clave anduvo o no: refrescamos los estados.
                await selector.recargar();
                if (r && r.success) {
                    selector.marcarFila(cliente.id, 'Sesión abierta', 'ok');
                } else {
                    selector.marcarFila(cliente.id, (r && r.message) || 'No se pudo iniciar sesión', 'error');
                }
            }
        }
    }

    window.abrirLanzadorSesion = abrirLanzadorSesion;
})();
