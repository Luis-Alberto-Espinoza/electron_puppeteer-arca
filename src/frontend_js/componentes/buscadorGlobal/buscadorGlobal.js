/**
 * BUSCADOR GLOBAL — un solo buscador para ir a cualquier lado
 * -----------------------------------------------------------
 * Paso 1: busca SERVICIOS del catálogo (catalogoServicios.js) por nombre, grupo y
 * palabras clave. (Paso 2: clientes con sus acciones.)
 *
 * Dónde aparece:
 *   - En la portada (#portadaDiv, pantalla de inicio): montado en el centro, con foco.
 *   - En cualquier vista con Ctrl+K: ventana flotante. Ctrl+K de nuevo o Escape la cierran.
 *
 * Teclado: escribir filtra · ↑↓ mueven · Enter abre el marcado · Escape cierra/limpia.
 *
 * Expone en window:
 *   - abrirBuscadorGlobal()
 */
(function () {
    // Minúsculas, sin tildes ni puntos ("F.5111" → "f5111"), guiones como espacios.
    function normalizar(texto) {
        return String(texto || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\./g, '')
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escaparHtml(texto) {
        return String(texto).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /**
     * Qué tan bien coincide un servicio con la búsqueda (0 = no coincide).
     * Gana lo que EMPIEZA con lo escrito; las palabras clave pesan menos que el nombre.
     */
    function puntaje(servicio, q) {
        const label = normalizar(servicio.label);
        const claves = (servicio.claves || []).map(normalizar);
        const grupo = normalizar(servicio.grupo);

        if (label.startsWith(q)) return 100;
        if (label.split(' ').some(p => p.startsWith(q))) return 80;
        if (label.includes(q)) return 60;
        if (claves.some(c => c.startsWith(q))) return 50;
        if (claves.some(c => c.includes(q))) return 30;
        if (grupo.startsWith(q)) return 20;

        // Varias palabras ("planes atm"): todas tienen que estar en algún lado.
        const todo = [label, ...claves, grupo].join(' ');
        const palabras = q.split(' ');
        if (palabras.length > 1 && palabras.every(p => todo.includes(p))) return 10;
        return 0;
    }

    function buscarServicios(texto) {
        const q = normalizar(texto);
        if (!q) return [];
        return (window.CATALOGO_SERVICIOS || [])
            .map((s, orden) => ({ s, orden, p: puntaje(s, q) }))
            .filter(r => r.p > 0)
            .sort((a, b) => b.p - a.p || a.orden - b.orden)   // empate: orden del catálogo
            .map(r => r.s);
    }

    // Resalta en el nombre lo que se escribió (comparando sin tildes).
    function resaltar(label, texto) {
        const q = normalizar(texto);
        const i = q ? normalizar(label).indexOf(q) : -1;
        // normalizar() puede cambiar largos (saca puntos): solo resalto si el largo coincide.
        if (i < 0 || normalizar(label).length !== label.length) return escaparHtml(label);
        return escaparHtml(label.slice(0, i))
            + `<mark>${escaparHtml(label.slice(i, i + q.length))}</mark>`
            + escaparHtml(label.slice(i + q.length));
    }

    /**
     * Arma el buscador (input + lista) adentro de `contenedor`.
     * @param {HTMLElement} contenedor
     * @param {{ alElegir: Function, alEscape: Function }} opciones
     */
    function montarBuscador(contenedor, { alElegir, alEscape }) {
        contenedor.innerHTML = `
            <div class="bg-buscador">
                <div class="bg-input-wrap">
                    <span class="bg-lupa" aria-hidden="true">🔍</span>
                    <input type="text" class="bg-input" autocomplete="off" spellcheck="false"
                        placeholder="Buscá un servicio… (ej. ddjj, factura, iva)">
                    <kbd class="bg-atajo">Ctrl+K</kbd>
                </div>
                <ul class="bg-resultados" role="listbox"></ul>
            </div>
        `;
        const input = contenedor.querySelector('.bg-input');
        const lista = contenedor.querySelector('.bg-resultados');
        let resultados = [];
        let activo = 0;

        function pintar() {
            const texto = input.value;
            resultados = buscarServicios(texto);
            activo = 0;

            if (!normalizar(texto)) {
                lista.innerHTML = '';
                return;
            }
            if (!resultados.length) {
                lista.innerHTML = `<li class="bg-vacio">Sin resultados para "${escaparHtml(texto)}"</li>`;
                return;
            }
            lista.innerHTML = `<li class="bg-seccion">Servicios</li>` + resultados.map((s, i) => `
                <li class="bg-item${i === 0 ? ' activo' : ''}" role="option" data-i="${i}">
                    <span class="bg-label">${resaltar(s.label, texto)}</span>
                    <span class="bg-grupo bg-grupo-${s.grupo.toLowerCase()}">${s.grupo}</span>
                </li>`).join('');
        }

        function marcar(i) {
            const items = lista.querySelectorAll('.bg-item');
            if (!items.length) return;
            activo = (i + items.length) % items.length;   // da la vuelta en los extremos
            items.forEach((el, n) => el.classList.toggle('activo', n === activo));
            items[activo].scrollIntoView({ block: 'nearest' });
        }

        function elegir(i) {
            const servicio = resultados[i];
            if (servicio) alElegir(servicio);
        }

        input.addEventListener('input', pintar);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); marcar(activo + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(activo - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); elegir(activo); }
            else if (e.key === 'Escape') { e.preventDefault(); alEscape(); }
        });
        lista.addEventListener('mousemove', (e) => {
            const li = e.target.closest('.bg-item');
            if (li && Number(li.dataset.i) !== activo) marcar(Number(li.dataset.i));
        });
        lista.addEventListener('click', (e) => {
            const li = e.target.closest('.bg-item');
            if (li) elegir(Number(li.dataset.i));
        });

        return {
            input,
            limpiar() { input.value = ''; pintar(); },
        };
    }

    // ===== Ventana flotante (Ctrl+K) =====
    let overlay = null;

    function cerrarBuscadorGlobal() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        document.body.classList.remove('bg-sin-scroll');
    }

    function abrirBuscadorGlobal() {
        if (overlay) return overlay.querySelector('.bg-input').focus();

        overlay = document.createElement('div');
        overlay.className = 'bg-overlay';
        overlay.innerHTML = '<div class="bg-caja"></div>';
        document.body.appendChild(overlay);
        // Mientras está abierto, la página de atrás no scrollea.
        document.body.classList.add('bg-sin-scroll');

        const buscador = montarBuscador(overlay.querySelector('.bg-caja'), {
            alElegir: (servicio) => {
                cerrarBuscadorGlobal();
                window.ejecutarServicio(servicio);
            },
            alEscape: cerrarBuscadorGlobal,
        });
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) cerrarBuscadorGlobal();   // click afuera de la caja
        });
        buscador.input.focus();
    }

    // ===== Portada (pantalla de inicio) =====
    function montarPortada() {
        const portada = document.getElementById('portadaDiv');
        if (!portada) return;
        portada.innerHTML = `
            <div class="portada">
                <p class="portada-pregunta">¿Qué querés hacer?</p>
                <div class="portada-buscador"></div>
            </div>
        `;
        const buscador = montarBuscador(portada.querySelector('.portada-buscador'), {
            alElegir: (servicio) => {
                buscador.limpiar();
                window.ejecutarServicio(servicio);
            },
            alEscape: () => buscador.limpiar(),
        });
        buscador.input.focus();
    }

    function portadaVisible() {
        const portada = document.getElementById('portadaDiv');
        return portada && portada.getClientRects().length > 0;
    }

    // Ctrl+K: en la portada lleva al buscador de la portada; en otra vista abre/cierra la ventana.
    document.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
        e.preventDefault();
        if (overlay) return cerrarBuscadorGlobal();
        if (portadaVisible()) return document.querySelector('#portadaDiv .bg-input').focus();
        abrirBuscadorGlobal();
    });

    document.addEventListener('DOMContentLoaded', montarPortada);

    window.abrirBuscadorGlobal = abrirBuscadorGlobal;
})();
