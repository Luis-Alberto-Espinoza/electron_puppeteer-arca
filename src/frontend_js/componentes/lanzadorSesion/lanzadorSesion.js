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
                    <label class="lanzador-campo">
                        <span>Nombre / razón social</span>
                        <input type="text" id="lanzador-manual-nombre" autocomplete="off" placeholder="Se completa solo al iniciar sesión">
                    </label>

                    <div class="lanzador-acciones">
                        <button class="lanzador-btn-guardar" id="lanzador-btn-guardar" disabled>💾 Guardar cliente</button>
                        <button class="lanzador-btn-abrir" id="lanzador-btn-abrir" disabled>Abrir navegador</button>
                    </div>
                    <!-- Resultado del login y del guardado (en modo cliente el resultado va en la fila). -->
                    <div class="lanzador-estado" id="lanzador-estado"></div>
                </div>
                </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const btnAbrir = overlay.querySelector('#lanzador-btn-abrir');
        const estado = overlay.querySelector('#lanzador-estado');
        const inputCuit = overlay.querySelector('#lanzador-manual-cuit');
        const inputClave = overlay.querySelector('#lanzador-manual-clave');
        const inputNombre = overlay.querySelector('#lanzador-manual-nombre');
        const btnGuardar = overlay.querySelector('#lanzador-btn-guardar');
        const btnVerClave = overlay.querySelector('#lanzador-ver-clave');
        const contSelector = overlay.querySelector('#lanzador-selector');
        let modoActivo = 'cliente';
        let abriendo = false;   // bloquea la lista mientras se abre un navegador (evita doble apertura)
        let guardando = false;
        // Último login manual exitoso: { cuit, clave, guardado }. Solo se guarda lo que se probó.
        let loginOk = null;

        function mostrarEstado(texto, tipo = '') {
            estado.textContent = texto;
            estado.className = 'lanzador-estado' + (tipo ? ' ' + tipo : '');
        }
        function limpiarEstado() { mostrarEstado(''); }

        // El botón solo existe en modo manual; en modo cliente el click en la lista abre directo.
        function recomputarBoton() {
            btnAbrir.disabled = abriendo || !(inputCuit.value.trim() && inputClave.value);
            recomputarGuardar();
        }

        // Guardar se habilita solo con el CUIT y la clave del último login exitoso. Si el
        // cliente ya está en la cartera, el botón actualiza su clave (el nombre es el guardado).
        function recomputarGuardar() {
            const vigente = !!loginOk && loginOk.cuit === inputCuit.value.trim() && loginOk.clave === inputClave.value;
            const g = vigente ? loginOk.guardado : null;
            const existe = !!(g && g.existe);
            btnGuardar.textContent = existe ? '💾 Actualizar clave guardada' : '💾 Guardar cliente';
            inputNombre.readOnly = existe;
            btnGuardar.disabled = guardando || abriendo || !vigente
                || (existe && g.esRepresentado)
                || (!existe && !inputNombre.value.trim());
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
            limpiarEstado();
            recomputarBoton();
        });

        inputCuit.addEventListener('input', () => { limpiarEstado(); recomputarBoton(); });
        inputClave.addEventListener('input', () => { limpiarEstado(); recomputarBoton(); });
        inputNombre.addEventListener('input', recomputarGuardar);

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
            contSelector.textContent = '❌ ' + err.message;
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
            loginOk = null;
            lanzar(window.electronAPI.sesion[`${servicio}Manual`]({ cuit, clave }), null, { cuit, clave });
        });

        btnGuardar.addEventListener('click', async () => {
            if (!loginOk || guardando) return;
            guardando = true;
            recomputarGuardar();
            mostrarEstado('⏳ Guardando…', 'cargando');
            try {
                const r = await window.electronAPI.contribuyente.guardarDesdeLanzador({
                    cuit: loginOk.cuit, servicio, clave: loginOk.clave, nombre: inputNombre.value.trim()
                });
                if (r && r.success) {
                    mostrarEstado(r.accion === 'creado'
                        ? `✅ "${r.nombre}" quedó guardado como cliente, con la clave validada.`
                        : `✅ Clave de "${r.nombre}" actualizada y validada.`, 'ok');
                    loginOk = null;              // ya está guardado: no se vuelve a ofrecer
                    await selector.recargar();   // que aparezca en la lista de clientes
                } else {
                    mostrarEstado('❌ ' + ((r && r.message) || 'No se pudo guardar'), 'error');
                }
            } catch (err) {
                mostrarEstado('❌ ' + err.message, 'error');
            } finally {
                guardando = false;
                recomputarGuardar();
            }
        });

        // cliente: la fila de donde salió (null en modo manual). El resultado se muestra en esa fila.
        // manual: { cuit, clave } tipeados (null en modo cliente). Si el login anda, se ofrece guardarlo.
        async function lanzar(promesa, cliente = null, manual = null) {
            abriendo = true;
            if (cliente) selector.limpiarMarcaFila(cliente.id);
            contSelector.classList.add('lanzador-bloqueado');
            btnAbrir.disabled = true;
            mostrarEstado('⏳ Abriendo navegador e iniciando sesión…', 'cargando');
            let r = null;
            try {
                r = await promesa;
                if (r && r.success && manual) {
                    loginOk = { ...manual, guardado: r.guardado || { existe: false } };
                    const g = loginOk.guardado;
                    if (g.existe) inputNombre.value = g.nombre || '';
                    else if (r.nombre) inputNombre.value = r.nombre;
                    const extra = g.esRepresentado
                        ? ' Este cliente entra con la clave de su representante: no se le guarda una propia.'
                        : g.existe ? ' Ya está en tus clientes: podés actualizar su clave guardada.'
                        : ' Podés guardarlo como cliente.';
                    mostrarEstado('✅ Sesión iniciada.' + extra, 'ok');
                } else if (r && r.success) {
                    const extra = r.requiereElegirEmpresa
                        ? ' Entrás como su representante: elegí la empresa en la pantalla de AFIP.'
                        : '';
                    mostrarEstado('✅ Navegador abierto y sesión iniciada. Podés operar a mano (cerralo cuando termines).' + extra, 'ok');
                } else {
                    mostrarEstado('❌ ' + ((r && r.message) || 'No se pudo iniciar sesión'), 'error');
                }
            } catch (err) {
                r = { success: false, message: err.message };
                mostrarEstado('❌ ' + err.message, 'error');
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
