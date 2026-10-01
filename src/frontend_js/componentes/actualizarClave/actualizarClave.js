/**
 * COMPONENTE COMPARTIDO: ACTUALIZAR CLAVE
 *
 * Diálogo para corregir la clave de un cliente SIN salir de lo que estás haciendo
 * (no hay que ir a Clientes y volver). Cualquier pantalla lo puede usar:
 *
 *   const r = await window.abrirActualizarClave({ cuit, servicio: 'afip' | 'atm' });
 *   // r = { actualizada: true, titular, esRepresentante }  |  { actualizada: false, error? }
 *
 * Ojo AFIP: un representado no tiene clave propia, entra con la de su representante.
 * El backend resuelve de quién es la clave y el diálogo lo avisa antes de guardar.
 * La clave queda "sin validar" hasta que un login la confirme.
 */
(function () {
    const LABEL_CLAVE = { afip: 'Clave fiscal AFIP', atm: 'Clave ATM' };

    function escapar(t) {
        const d = document.createElement('div');
        d.textContent = t == null ? '' : String(t);
        return d.innerHTML;
    }

    function abrirActualizarClave({ cuit, servicio }) {
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

            const overlay = document.createElement('div');
            overlay.className = 'ac-overlay';
            overlay.innerHTML = `
                <div class="ac-caja ac-${servicio}" role="dialog" aria-modal="true">
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
                    <div class="ac-error" hidden></div>
                    <div class="ac-acciones">
                        <button type="button" class="ac-btn ac-cancelar">Cancelar</button>
                        <button type="button" class="ac-btn ac-guardar" disabled>Guardar</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            const input = overlay.querySelector('.ac-input');
            const btnGuardar = overlay.querySelector('.ac-guardar');
            const btnVer = overlay.querySelector('.ac-ver');
            const error = overlay.querySelector('.ac-error');

            function cerrar(resultado) {
                document.removeEventListener('keydown', onTecla);
                overlay.remove();
                resolve(resultado);
            }
            function onTecla(e) {
                if (e.key === 'Escape') cerrar({ actualizada: false });
                if (e.key === 'Enter' && !btnGuardar.disabled) guardar();
            }

            async function guardar() {
                btnGuardar.disabled = true;
                error.hidden = true;
                const r = await api.actualizarClave({ cuit, servicio, clave: input.value });
                if (r && r.success) {
                    cerrar({ actualizada: true, titular: r.titular, esRepresentante: r.esRepresentante });
                } else {
                    error.textContent = (r && r.message) || 'No se pudo guardar la clave.';
                    error.hidden = false;
                    btnGuardar.disabled = false;
                }
            }

            input.addEventListener('input', () => { btnGuardar.disabled = !input.value.trim(); });
            btnVer.addEventListener('click', () => {
                const visible = input.type === 'text';
                input.type = visible ? 'password' : 'text';
                btnVer.title = visible ? 'Mostrar clave' : 'Ocultar clave';
            });
            btnGuardar.addEventListener('click', guardar);
            overlay.querySelector('.ac-cancelar').addEventListener('click', () => cerrar({ actualizada: false }));
            overlay.querySelector('.ac-cerrar').addEventListener('click', () => cerrar({ actualizada: false }));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar({ actualizada: false }); });
            document.addEventListener('keydown', onTecla);
            input.focus();
        });
    }

    window.abrirActualizarClave = abrirActualizarClave;
})();
