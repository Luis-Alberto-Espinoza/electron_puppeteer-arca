/**
 * GESTIÓN DE GRUPOS/ESTUDIOS — modal para crear, renombrar y eliminar estudios.
 * ----------------------------------------------------------------------------
 * Mismo patrón que configDatos / lanzadorSesion (componente global auto-registrado
 * sobre Bootstrap, ya cargado en index.html).
 *
 * Expone en window:
 *   - abrirGestionGrupos() → abre el modal (refresca la lista primero).
 *
 * Backend: window.electronAPI.grupos.* (ver preload.js + cliente/grupos/handlers.js).
 *
 * Al crear/renombrar/eliminar dispara un CustomEvent 'grupos:cambiado' en document,
 * que usuario.js escucha para recargar la lista, los badges y los <select>. Así este
 * componente no conoce nada del módulo de usuarios (queda desacoplado).
 */
(function () {
    let modalInstance = null;

    function avisarCambio() {
        document.dispatchEvent(new CustomEvent('grupos:cambiado'));
    }

    function ensureModal() {
        if (document.getElementById('gestionGruposModal')) return;

        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div class="modal fade" id="gestionGruposModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content gg-content">
              <div class="modal-header">
                <h5 class="modal-title">🏢 Estudios / Grupos</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <p class="gg-desc">Agrupá tus clientes por estudio. Eliminar un estudio
                  <strong>no borra</strong> sus clientes: quedan “sin estudio”.</p>
                <div class="gg-crear">
                  <input type="text" id="ggNuevoNombre" class="gg-input" placeholder="Nombre del estudio nuevo" maxlength="60">
                  <button type="button" class="btn btn-success" id="ggBtnCrear">➕ Agregar</button>
                </div>
                <div id="ggAviso" class="gg-aviso" hidden></div>
                <ul id="ggLista" class="gg-lista"></ul>
              </div>
            </div>
          </div>
        </div>`;
        document.body.appendChild(wrap.firstElementChild);

        document.getElementById('ggBtnCrear').addEventListener('click', onCrear);
        document.getElementById('ggNuevoNombre').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); onCrear(); }
        });
    }

    function aviso(texto, tipo = 'info') {
        const el = document.getElementById('ggAviso');
        if (!el) return;
        if (!texto) { el.hidden = true; el.textContent = ''; return; }
        el.hidden = false;
        el.className = `gg-aviso gg-aviso--${tipo}`;
        el.textContent = texto;
    }

    function escapar(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    async function refrescarLista() {
        const ul = document.getElementById('ggLista');
        if (!ul) return;
        let grupos = [];
        try {
            const r = await window.electronAPI.grupos.listar();
            if (r && r.success) grupos = r.grupos || [];
        } catch (e) {
            aviso('No se pudo leer la lista de estudios: ' + e.message, 'error');
        }

        if (grupos.length === 0) {
            ul.innerHTML = '<li class="gg-vacio">Todavía no hay estudios. Creá el primero arriba.</li>';
            return;
        }

        ul.innerHTML = grupos.map(g => `
            <li class="gg-item" data-id="${escapar(g.id)}">
                <span class="gg-color" style="background:${escapar(g.color || '#888')}"></span>
                <input type="text" class="gg-nombre" value="${escapar(g.nombre)}" maxlength="60">
                <button type="button" class="gg-accion gg-guardar" title="Guardar el nuevo nombre">💾</button>
                <button type="button" class="gg-accion gg-borrar" title="Eliminar estudio (los clientes quedan sin estudio)">🗑️</button>
            </li>
        `).join('');

        ul.querySelectorAll('.gg-guardar').forEach(btn => {
            btn.addEventListener('click', () => onRenombrar(btn.closest('.gg-item')));
        });
        ul.querySelectorAll('.gg-borrar').forEach(btn => {
            btn.addEventListener('click', () => onEliminar(btn.closest('.gg-item')));
        });
        ul.querySelectorAll('.gg-nombre').forEach(inp => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); onRenombrar(inp.closest('.gg-item')); }
            });
        });
    }

    async function onCrear() {
        const input = document.getElementById('ggNuevoNombre');
        const nombre = (input.value || '').trim();
        if (!nombre) { aviso('Escribí un nombre para el estudio.', 'error'); return; }
        try {
            const r = await window.electronAPI.grupos.crear({ nombre });
            if (r && r.success) {
                input.value = '';
                aviso(`Estudio “${r.grupo.nombre}” creado.`, 'ok');
                await refrescarLista();
                avisarCambio();
            } else {
                aviso(r.error || 'No se pudo crear.', 'error');
            }
        } catch (e) {
            aviso('Error al crear: ' + e.message, 'error');
        }
    }

    async function onRenombrar(item) {
        if (!item) return;
        const id = item.dataset.id;
        const nombre = (item.querySelector('.gg-nombre').value || '').trim();
        if (!nombre) { aviso('El estudio necesita un nombre.', 'error'); return; }
        try {
            const r = await window.electronAPI.grupos.renombrar({ id, nombre });
            if (r && r.success) {
                aviso(`Renombrado a “${r.grupo.nombre}”.`, 'ok');
                await refrescarLista();
                avisarCambio();
            } else {
                aviso(r.error || 'No se pudo renombrar.', 'error');
            }
        } catch (e) {
            aviso('Error al renombrar: ' + e.message, 'error');
        }
    }

    async function onEliminar(item) {
        if (!item) return;
        const id = item.dataset.id;
        const nombre = item.querySelector('.gg-nombre').value || 'este estudio';
        // Confirmación simple: no borra clientes, solo los deja sin estudio.
        const ok = window.confirm(`¿Eliminar el estudio “${nombre}”?\n\nSus clientes NO se borran: quedan sin estudio.`);
        if (!ok) return;
        try {
            const r = await window.electronAPI.grupos.eliminar(id);
            if (r && r.success) {
                const n = r.clientesLiberados || 0;
                aviso(`Estudio eliminado. ${n} cliente(s) quedaron sin estudio.`, 'ok');
                await refrescarLista();
                avisarCambio();
            } else {
                aviso(r.error || 'No se pudo eliminar.', 'error');
            }
        } catch (e) {
            aviso('Error al eliminar: ' + e.message, 'error');
        }
    }

    window.abrirGestionGrupos = async function abrirGestionGrupos() {
        ensureModal();
        aviso('');
        document.getElementById('ggNuevoNombre').value = '';
        await refrescarLista();
        if (!modalInstance) {
            modalInstance = new bootstrap.Modal(document.getElementById('gestionGruposModal'));
        }
        modalInstance.show();
    };
})();
