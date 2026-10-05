/**
 * COMPONENTE COMPARTIDO: ACTUALIZAR CLAVE
 *
 * Diálogo para corregir la clave de un cliente SIN salir de lo que estás haciendo
 * (no hay que ir a Clientes y volver). Guarda la clave y la VERIFICA en el momento,
 * con el navegador oculto, para que el cliente quede usable ahí mismo:
 *
 *   const r = await window.abrirActualizarClave({ cuit, servicio: 'afip'|'atm', verificar });
 *   // r = { actualizada, verificada, mensaje }  |  { actualizada: false, error? }
 *
 * `verificar` es lo que necesita la pantalla para operar: 'atm' / 'afip' (solo login)
 * o 'facturacion' (solo login si ya tiene puntos de venta; si no, también los trae).
 *
 * Ojo AFIP: un representado no tiene clave propia, entra con la de su representante.
 * El backend resuelve de quién es la clave y el diálogo lo avisa antes de guardar.
 */
(function () {
    const LABEL_CLAVE = { afip: 'Clave fiscal AFIP', atm: 'Clave ATM' };
    const SITIO = { afip: 'AFIP', atm: 'ATM' };

    function escapar(t) {
        const d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    }

    function abrirActualizarClave({ cuit, servicio, verificar = servicio }) {
        return new Promise(async (resolve) => {
            const api = window.electronAPI && window.electronAPI.contribuyente;
            if (!api || !api.titularClave) {
                console.error('[ActualizarClave] API contribuyente.titularClave no disponible');
                return resolve({ actualizada: false });
            }

            const info = await api.titularClave({ cuit, servicio });
            // Sin alert(): en Electron roba el foco. El que llamó muestra el error donde corresponda.
            if (!info || !info.success) {
                return resolve({ actualizada: false, error: (info && info.message) || 'No se pudo leer el cliente.' });
            }

            const aviso = info.esRepresentante ? `
                <div class="ac-aviso">
                    Este cliente entra a AFIP con la clave de su representante.
                    Vas a cambiar la clave de <strong>${escapar(info.titular.nombre)}</strong>
                    (${escapar(info.titular.cuit)}), y se actualiza para todos los que representa.
                </div>` : '';

            const queVerifica = verificar === 'facturacion'
                ? 'Verificando la clave con AFIP (si al cliente le faltan los puntos de venta, también los trae)…'
                : `Verificando la clave con ${SITIO[servicio] || 'el servicio'}…`;

            const overlay = document.createElement('div');
            overlay.className = 'ac-overlay';
            overlay.innerHTML = `
                <div class="ac-caja ac-${servicio} tema-vista" role="dialog" aria-modal="true">
                    <div class="ac-header">
                        <h3>Actualizar ${escapar(LABEL_CLAVE[servicio] || 'clave')}</h3>
                        <button type="button" class="ac-cerrar" title="Cerrar">✕</button>
                    </div>
                    <div class="ac-cliente">
                        <div class="ac-nombre">${escapar(info.objetivo.nombre)}</div>
                        <div class="ac-cuit">CUIT ${escapar(info.objetivo.cuit)}</div>
                    </div>
                    ${aviso}
                    <label class="ac-campo">
                        <span>Nueva ${escapar(LABEL_CLAVE[servicio] || 'clave')}</span>
                        <div class="ac-clave-wrap">
                            <input type="password" class="ac-input" autocomplete="off" placeholder="••••••••">
                            <button type="button" class="ac-ver" title="Mostrar clave">👁️</button>
                        </div>
                    </label>
                    <div class="ac-verificando" hidden>
                        <span class="rueda-giratoria" aria-hidden="true"></span>
                        <div>
                            <div>${escapar(queVerifica)}</div>
                            <div class="ac-verificando-sub">Puede tardar hasta un minuto. No se colgó: está probando la clave.</div>
                        </div>
                    </div>
                    <div class="ac-error" hidden></div>
                    <div class="ac-acciones">
                        <button type="button" class="ac-btn ac-cancelar">Cancelar</button>
                        <button type="button" class="ac-btn ac-guardar" disabled>Guardar y verificar</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            const input = overlay.querySelector('.ac-input');
            const btnGuardar = overlay.querySelector('.ac-guardar');
            const btnCancelar = overlay.querySelector('.ac-cancelar');
            const btnCerrarX = overlay.querySelector('.ac-cerrar');
            const btnVer = overlay.querySelector('.ac-ver');
            const error = overlay.querySelector('.ac-error');
            const verificando = overlay.querySelector('.ac-verificando');

            // guardada: la clave ya se escribió en el cliente (aunque no se haya podido verificar).
            let guardada = false;
            let ocupado = false;
            let ultimoMensaje = null;

            function cerrar(resultado) {
                document.removeEventListener('keydown', onTecla);
                overlay.remove();
                resolve(resultado);
            }
            // Cerrar sin verificar: si ya se guardó, el que llamó tiene que enterarse igual.
            function cerrarSinVerificar() {
                if (ocupado) return;
                cerrar(guardada
                    ? { actualizada: true, verificada: false, mensaje: ultimoMensaje || 'Clave guardada sin verificar' }
                    : { actualizada: false });
            }
            function onTecla(e) {
                if (e.key === 'Escape') cerrarSinVerificar();
                if (e.key === 'Enter' && !btnGuardar.disabled && !ocupado) guardarYVerificar();
            }
            function setOcupado(valor) {
                ocupado = valor;
                verificando.hidden = !valor;
                input.disabled = valor;
                btnVer.disabled = valor;
                btnCancelar.disabled = valor;
                btnCerrarX.disabled = valor;
                btnGuardar.disabled = valor || !input.value.trim();
            }
            function mostrarError(msg) {
                error.textContent = msg;
                error.hidden = false;
            }

            async function guardarYVerificar() {
                error.hidden = true;
                setOcupado(true);

                const g = await api.actualizarClave({ cuit, servicio, clave: input.value });
                if (!g || !g.success) {
                    setOcupado(false);
                    mostrarError((g && g.message) || 'No se pudo guardar la clave.');
                    return;
                }
                guardada = true;

                const v = await api.verificarClave({ cuit, servicio: verificar });
                setOcupado(false);
                if (v && v.success) {
                    cerrar({ actualizada: true, verificada: true, mensaje: v.message });
                    return;
                }

                ultimoMensaje = (v && v.message) || 'No se pudo verificar la clave.';
                mostrarError(ultimoMensaje);
                if (v && v.error === 'INVALID_CREDENTIALS') {
                    // La clave está mal: a reescribirla ahí mismo.
                    input.value = '';
                    btnGuardar.disabled = true;
                    input.focus();
                } else {
                    // Captcha, sin puntos de venta, timeout…: reintentar ahora no sirve.
                    btnGuardar.hidden = true;
                    btnCancelar.textContent = 'Cerrar';
                }
            }

            input.addEventListener('input', () => { btnGuardar.disabled = ocupado || !input.value.trim(); });
            btnVer.addEventListener('click', () => {
                const visible = input.type === 'text';
                input.type = visible ? 'password' : 'text';
                btnVer.title = visible ? 'Mostrar clave' : 'Ocultar clave';
            });
            btnGuardar.addEventListener('click', guardarYVerificar);
            btnCancelar.addEventListener('click', cerrarSinVerificar);
            btnCerrarX.addEventListener('click', cerrarSinVerificar);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarSinVerificar(); });
            document.addEventListener('keydown', onTecla);
            input.focus();
        });
    }

    /**
     * Arma la opción `accionFila` del SelectorUsuarios con el botón "Clave" ya cableado:
     * aparece en filas con problema de clave (o recién marcadas con error), abre el diálogo
     * (que guarda y verifica), recarga la lista y deja el resultado en la fila.
     * En facturación, si la clave anda pero faltan los puntos de venta, el mismo botón es
     * "Traer PDV": corre Analizar sin diálogo y deja el resultado en la fila.
     *
     * @param {'afip'|'atm'} canal           clave a actualizar (facturación usa 'afip')
     * @param {() => SelectorUsuarios} obtenerSelector  función: el selector se crea DESPUÉS
     * @param {'afip'|'atm'|'facturacion'} [verificar]  qué necesita la pantalla para operar
     */
    function crearAccionActualizarClave(canal, obtenerSelector, verificar = canal) {
        // Facturación: si la clave anda y solo faltan los puntos de venta, el botón los trae.
        const esTraerPdv = (usuario) => verificar === 'facturacion' && !!usuario.sinPuntosDeVenta && !usuario.problemaClave;
        // Un "Traer PDV" a la vez en toda la lista: un solo login a AFIP por vez (captcha) y,
        // hasta resolver el click intermitente del buscador (docs/FALTANTES.md), sin paralelo.
        let enCurso = null;   // id de la fila que está buscando
        return {
            texto: (usuario) => !esTraerPdv(usuario) ? '🔑 Clave'
                : usuario.pdvRevisado ? '🔄 Revisar de nuevo' : '🔄 Traer PDV',
            titulo: (usuario) => !esTraerPdv(usuario) ? 'Actualizar la clave de este cliente'
                : usuario.pdvRevisado
                    ? 'Ya se revisó y AFIP no tenía puntos de venta: vuelve a mirar (por si dio de alta uno)'
                    : 'Entra a AFIP y trae los puntos de venta de este cliente (como Analizar en Clientes)',
            mostrar: (usuario, marca) => !!usuario.problemaClave || esTraerPdv(usuario) || !!(marca && marca.tipo === 'error'),
            deshabilitado: (usuario) => enCurso !== null && esTraerPdv(usuario),   // todos opacos mientras uno busca
            onClick: async (usuario) => {
                const selector = obtenerSelector();
                if (esTraerPdv(usuario)) {
                    if (enCurso !== null) return;
                    enCurso = usuario.id;
                    selector.marcarFila(usuario.id, '⏳ Buscando puntos de venta…', 'cargando');
                    let r;
                    try {
                        // Sin PDV, verificarClave('facturacion') corre Analizar (login + trae los PDV).
                        r = await window.electronAPI.contribuyente.verificarClave({ cuit: usuario.cuit, servicio: 'facturacion' });
                    } catch (err) {
                        r = { success: false, message: err.message };
                    } finally {
                        enCurso = null;
                    }
                    await selector.recargar();   // con PDV queda habilitado para elegir
                    selector.marcarFila(usuario.id, (r && r.message) || 'No se pudieron traer los puntos de venta', r && r.success ? 'ok' : 'error');
                    return;
                }
                const r = await abrirActualizarClave({ cuit: usuario.cuit, servicio: canal, verificar });
                if (r.error) {
                    selector.marcarFila(usuario.id, r.error, 'error');
                    return;
                }
                if (!r.actualizada) return;
                await selector.recargar();   // cambió el estado (si era representante, el de varios)
                selector.marcarFila(usuario.id, r.mensaje, r.verificada ? 'ok' : 'error');
            }
        };
    }

    /**
     * Todo lo que una pantalla necesita para sumar al buscador: filtro de habilitados,
     * clientes con clave sin validar elegibles (usarlos la valida) y botón "Clave".
     * Uso: new SelectorUsuarios(id, { ...otras, ...opcionesClaveEnSelector('afip', () => sel) })
     *
     * @param {'afip'|'atm'} canal
     * @param {() => SelectorUsuarios} obtenerSelector
     * @param {{ lote?: boolean, verificar?: 'afip'|'atm'|'facturacion' }} [opts]
     *   lote: true en servicios que procesan varios clientes → no deja elegir los que
     *   tienen la clave marcada como incorrecta (fallarían seguro y acercan el captcha).
     *   verificar: 'facturacion' si la pantalla necesita puntos de venta.
     */
    function opcionesClaveEnSelector(canal, obtenerSelector, { lote = false, verificar = canal } = {}) {
        return {
            permitirSinValidar: true,
            permitirInvalidos: true,
            filtroHabilitados: true,
            bloquearClaveIncorrecta: lote,
            accionFila: crearAccionActualizarClave(canal, obtenerSelector, verificar)
        };
    }

    window.abrirActualizarClave = abrirActualizarClave;
    window.crearAccionActualizarClave = crearAccionActualizarClave;
    window.opcionesClaveEnSelector = opcionesClaveEnSelector;
})();
