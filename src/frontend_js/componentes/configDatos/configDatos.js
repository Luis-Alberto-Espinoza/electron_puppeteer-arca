/**
 * CONFIG DATOS — modal para ver/cambiar la carpeta donde viven los .json.
 * ----------------------------------------------------------------------
 * Mismo patrón que confirmModal / lanzadorSesion (componente global auto-registrado).
 *
 * Expone en window:
 *   - abrirConfigDatos() → abre el modal (refresca info primero).
 *
 * Backend: window.electronAPI.datos.* (ver preload.js + comun/handlers.js).
 * Depende de Bootstrap (bundle) ya cargado en index.html.
 */
(function () {
    let modalInstance = null;

    function ensureModal() {
        if (document.getElementById('configDatosModal')) return;

        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div class="modal fade" id="configDatosModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content cd-content">
              <div class="modal-header">
                <h5 class="modal-title">📁 Carpeta de datos</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <p class="cd-desc">Acá se guardan tus clientes, listas e historial. Podés dejarlos
                al lado del programa (en el pendrive) o en una carpeta tuya del disco.</p>
                <div class="cd-info">
                  <span id="cdModo" class="cd-badge"></span>
                  <code id="cdRuta" class="cd-ruta">—</code>
                </div>
                <div id="cdAviso" class="cd-aviso" hidden>
                  ✅ Guardado. Hay que <strong>reiniciar</strong> para que el programa lea la carpeta nueva.
                </div>
              </div>
              <div class="modal-footer cd-footer">
                <button type="button" class="btn btn-outline-secondary" id="cdAbrir">Abrir carpeta</button>
                <button type="button" class="btn btn-outline-secondary" id="cdDefault">Volver al valor por defecto</button>
                <button type="button" class="btn btn-primary" id="cdCambiar">Cambiar carpeta…</button>
                <button type="button" class="btn btn-success" id="cdReiniciar" hidden>Reiniciar ahora</button>
              </div>
            </div>
          </div>
        </div>`;
        document.body.appendChild(wrap.firstElementChild);

        document.getElementById('cdAbrir').addEventListener('click', () => {
            window.electronAPI.datos.abrirCarpeta();
        });
        document.getElementById('cdCambiar').addEventListener('click', onCambiar);
        document.getElementById('cdDefault').addEventListener('click', onDefault);
        document.getElementById('cdReiniciar').addEventListener('click', () => {
            window.electronAPI.datos.reiniciar();
        });
    }

    function pintar(info) {
        const ruta = document.getElementById('cdRuta');
        const modo = document.getElementById('cdModo');
        ruta.textContent = info.carpeta || '—';

        let txt = 'Por defecto (en el sistema)';
        let cls = 'cd-badge';
        if (info.esOverride) { txt = 'Carpeta elegida'; cls += ' cd-badge--elegida'; }
        else if (info.esPortable) { txt = 'Al lado del programa'; cls += ' cd-badge--portable'; }
        modo.className = cls;
        modo.textContent = txt;
    }

    function marcarPendienteReinicio() {
        document.getElementById('cdAviso').hidden = false;
        document.getElementById('cdReiniciar').hidden = false;
    }

    async function refrescar() {
        const info = await window.electronAPI.datos.getInfo();
        pintar(info);
    }

    async function onCambiar() {
        const sel = await window.electronAPI.datos.elegirCarpeta();
        if (!sel.ok) return; // canceló el diálogo
        const res = await window.electronAPI.datos.setCarpeta(sel.carpeta);
        if (!res.ok) {
            alert(res.error === 'no_escribible'
                ? 'Esa carpeta no permite escritura (¿pendrive protegido o sin permisos?). Elegí otra.'
                : 'No se pudo guardar la carpeta: ' + (res.error || 'error'));
            return;
        }
        await refrescar();
        marcarPendienteReinicio();
    }

    async function onDefault() {
        const res = await window.electronAPI.datos.setCarpeta(null);
        if (!res.ok) { alert('No se pudo restablecer: ' + (res.error || 'error')); return; }
        await refrescar();
        marcarPendienteReinicio();
    }

    window.abrirConfigDatos = async function abrirConfigDatos() {
        ensureModal();
        // resetear el aviso de reinicio cada vez que se abre
        document.getElementById('cdAviso').hidden = true;
        document.getElementById('cdReiniciar').hidden = true;
        await refrescar();
        if (!modalInstance) {
            modalInstance = new bootstrap.Modal(document.getElementById('configDatosModal'));
        }
        modalInstance.show();
    };
})();
