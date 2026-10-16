/**
 * BUSCADOR GLOBAL — un solo buscador para ir a cualquier lado
 * -----------------------------------------------------------
 * Lo que escribís decide qué te ofrece:
 *   - SERVICIOS del catálogo (catalogoServicios.js), por nombre, grupo y palabras clave.
 *   - CLIENTES (por nombre o CUIT), cada uno con sus acciones: Sesión AFIP, Sesión ATM, Editar.
 *     Si no puede entrar a un servicio (sin clave, clave incorrecta) la acción va atenuada con
 *     el motivo, pero igual abre el lanzador en ese cliente para arreglar la clave ahí.
 * Va primero la sección que mejor coincide (empate: clientes).
 *
 * Dónde aparece:
 *   - En la portada (#portadaDiv, pantalla de inicio): montado en el centro, con foco.
 *   - En cualquier vista con Ctrl+K: ventana flotante. Ctrl+K de nuevo o Escape la cierran.
 *
 * Teclado: escribir filtra · ↓ o Tab baja a los resultados (↑ o Shift+Tab; desde arriba vuelve al input) ·
 *          ← → recorren las acciones de un cliente · Enter ejecuta lo marcado (sin nada marcado:
 *          el primer servicio; nunca una sesión de cliente sin elegirla) ·
 *          Escape cierra/limpia.
 *
 * Expone en window:
 *   - abrirBuscadorGlobal()
 */
(function () {
    const MIN_LETRAS_CLIENTES = 2;   // con 1 letra coincide media cartera
    const MAX_CLIENTES = 8;          // el resto: "seguí escribiendo"

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

    /** Puntaje de un texto contra la búsqueda: empieza > empieza alguna palabra > contiene. */
    function puntajeTexto(texto, q) {
        const t = normalizar(texto);
        if (!t) return 0;
        if (t.startsWith(q)) return 100;
        if (t.split(' ').some(p => p.startsWith(q))) return 80;
        if (t.includes(q)) return 60;
        return 0;
    }

    // ===== Servicios =====

    /** Qué tan bien coincide un servicio (0 = no). Las palabras clave pesan menos que el nombre. */
    function puntajeServicio(servicio, q) {
        const p = puntajeTexto(servicio.label, q);
        if (p) return p;
        const claves = (servicio.claves || []).map(normalizar);
        if (claves.some(c => c.startsWith(q))) return 50;
        if (claves.some(c => c.includes(q))) return 30;
        const grupo = normalizar(servicio.grupo);
        if (grupo.startsWith(q)) return 20;

        // Varias palabras ("planes atm"): todas tienen que estar en algún lado.
        const todo = [normalizar(servicio.label), ...claves, grupo].join(' ');
        const palabras = q.split(' ');
        if (palabras.length > 1 && palabras.every(w => todo.includes(w))) return 10;
        return 0;
    }

    function buscarServicios(q) {
        return (window.CATALOGO_SERVICIOS || [])
            .map((s, orden) => ({ s, orden, p: puntajeServicio(s, q) }))
            .filter(r => r.p > 0)
            .sort((a, b) => b.p - a.p || a.orden - b.orden)   // empate: orden del catálogo
            .map(r => ({ item: r.s, p: r.p }));
    }

    // ===== Clientes =====

    // Se piden al abrir el buscador (pueden cambiar: claves, altas). Sin claves: listar no las devuelve.
    let clientes = [];

    async function cargarClientes() {
        const api = window.electronAPI && window.electronAPI.contribuyente;
        if (!api || !api.listar) return;
        try {
            // Una lista por servicio: cada una trae si puede operar en ese servicio y por qué no.
            const [afip, atm] = await Promise.all([
                api.listar({ servicio: 'afip' }),
                api.listar({ servicio: 'atm' }),
            ]);
            const porCuit = new Map(((atm && atm.items) || []).map(c => [String(c.cuit), c]));
            clientes = ((afip && afip.items) || []).map(c => ({
                id: c.id,
                cuit: String(c.cuit || ''),
                nombre: c.nombreMostrado || [c.nombre, c.apellido].filter(Boolean).join(' ') || c.razonSocial || String(c.cuit),
                buscables: [c.nombreMostrado, c.razonSocial, [c.nombre, c.apellido].filter(Boolean).join(' ')],
                afip: estadoServicio(c),
                atm: estadoServicio(porCuit.get(String(c.cuit))),
            }));
        } catch (err) {
            console.error('[buscadorGlobal] no se pudieron cargar los clientes:', err);
        }
    }

    // Igual criterio que el lanzador: entra si puede operar o si tiene clave sin validar (abrir la valida).
    function estadoServicio(item) {
        if (!item) return { puede: false, motivo: 'sin datos' };
        const puede = !!(item.puedeOperar || (item.tieneAcceso && !item.claveIncorrecta));
        return { puede, motivo: puede ? '' : (item.motivoNoOpera || 'no puede entrar') };
    }

    function puntajeCliente(cliente, q) {
        const digitos = q.replace(/\D/g, '');
        // Si escribió números, también por CUIT (con o sin guiones).
        if (digitos.length >= 2 && digitos.length === q.replace(/[\s-]/g, '').length) {
            if (cliente.cuit.startsWith(digitos)) return 90;
            if (cliente.cuit.includes(digitos)) return 70;
        }
        return Math.max(0, ...cliente.buscables.map(t => puntajeTexto(t, q)));
    }

    function buscarClientes(q) {
        if (q.length < MIN_LETRAS_CLIENTES) return [];
        return clientes
            .map(c => ({ item: c, p: puntajeCliente(c, q) }))
            .filter(r => r.p > 0)
            .sort((a, b) => b.p - a.p || a.item.nombre.localeCompare(b.item.nombre));
    }

    // ===== Acciones =====

    function abrirSesion(servicio, cliente) {
        if (typeof window.abrirLanzadorSesion !== 'function') {
            return console.warn('[buscadorGlobal] window.abrirLanzadorSesion no está disponible');
        }
        window.abrirLanzadorSesion(servicio, { cuit: cliente.cuit });
    }

    // Va a Clientes y aprieta el ✏️ de su fila (el form de edición necesita lo que trae la lista).
    async function editarCliente(cliente) {
        window.ejecutarServicio('clientes');
        const selector = `#usersList .user-item[data-user-id="${CSS.escape(String(cliente.id))}"] .btn-edit`;
        const fin = Date.now() + 8000;
        while (Date.now() < fin) {
            const btn = document.querySelector(selector);
            if (btn) return btn.click();
            await new Promise(r => setTimeout(r, 150));
        }
        console.warn('[buscadorGlobal] no apareció la fila del cliente para editar:', cliente.cuit);
    }

    function ejecutar(opcion) {
        if (opcion.tipo === 'servicio') return window.ejecutarServicio(opcion.servicio);
        if (opcion.accion === 'editar') return editarCliente(opcion.cliente);
        abrirSesion(opcion.accion, opcion.cliente);
    }

    // ===== Pintado =====

    // Resalta en el texto lo que se escribió. Normaliza letra por letra guardando de qué
    // posición original sale cada una: así "Landes S. A. S." resalta bien aunque se saquen puntos.
    function resaltar(texto, q) {
        if (!q) return escaparHtml(texto);
        let norm = '';
        const origen = [];
        [...texto].forEach((letra, k) => {
            const n = letra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/\./g, '').replace(/-/g, ' ');
            for (const ch of n) { norm += ch; origen.push(k); }
        });
        const i = norm.indexOf(q);
        if (i < 0) return escaparHtml(texto);
        const desde = origen[i];
        const hasta = origen[i + q.length - 1] + 1;
        return escaparHtml(texto.slice(0, desde))
            + `<mark>${escaparHtml(texto.slice(desde, hasta))}</mark>`
            + escaparHtml(texto.slice(hasta));
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
                        placeholder="Buscá un servicio o un cliente… (ej. ddjj, iva, landes)">
                    <kbd class="bg-atajo">Ctrl+K</kbd>
                </div>
                <ul class="bg-resultados" role="listbox"></ul>
            </div>
        `;
        const input = contenedor.querySelector('.bg-input');
        const lista = contenedor.querySelector('.bg-resultados');
        // Grilla navegable: cada servicio es una fila de 1 columna; cada cliente, una fila
        // con sus acciones como columnas. fila -1 = el cursor está en el input (nada marcado).
        let opciones = [];   // todas las opciones (data-i = índice acá)
        let filas = [];      // filas[f] = [índices de opciones de esa fila]
        let fila = -1;
        let col = 0;

        function htmlServicios(servicios, q) {
            return `<li class="bg-seccion">Servicios</li>` + servicios.map(({ item: s }) => {
                const i = opciones.push({ tipo: 'servicio', servicio: s }) - 1;
                filas.push([i]);
                return `
                <li class="bg-item bg-opcion" role="option" data-i="${i}">
                    <span class="bg-label">${resaltar(s.label, q)}</span>
                    <span class="bg-grupo bg-grupo-${s.grupo.toLowerCase()}">${s.grupo}</span>
                </li>`;
            }).join('');
        }

        function htmlClientes(encontrados, q) {
            const visibles = encontrados.slice(0, MAX_CLIENTES);
            const resto = encontrados.length - visibles.length;
            return `<li class="bg-seccion">Clientes</li>` + visibles.map(({ item: c }) => {
                const filaCliente = [];
                filas.push(filaCliente);
                const boton = (accion, texto, estado) => {
                    const i = opciones.push({ tipo: 'cliente', accion, cliente: c }) - 1;
                    filaCliente.push(i);
                    const atenuado = estado && !estado.puede;
                    return `<button type="button" class="bg-accion bg-opcion${atenuado ? ' atenuada' : ''}"
                        data-i="${i}" data-accion="${accion}" tabindex="-1"
                        ${atenuado ? `title="${escaparHtml(estado.motivo)}: abre el lanzador para arreglar la clave"` : ''}>${texto}</button>`;
                };
                const problemas = [['AFIP', c.afip], ['ATM', c.atm]]
                    .filter(([, e]) => !e.puede)
                    .map(([n, e]) => `${n}: ${escaparHtml(e.motivo)}`);
                return `
                <li class="bg-cliente">
                    <div class="bg-cliente-datos">
                        <span class="bg-label">${resaltar(c.nombre, q)}</span>
                        <span class="bg-cuit">${resaltar(c.cuit, q.replace(/\D/g, ''))}</span>
                    </div>
                    ${problemas.length ? `<div class="bg-cliente-aviso">⚠️ ${problemas.join(' · ')}</div>` : ''}
                    <div class="bg-acciones">
                        ${boton('afip', '🚀 Sesión AFIP', c.afip)}
                        ${boton('atm', '🚀 Sesión ATM', c.atm)}
                        ${boton('editar', '✏️ Editar')}
                    </div>
                </li>`;
            }).join('') + (resto > 0 ? `<li class="bg-vacio">y ${resto} más… seguí escribiendo</li>` : '');
        }

        function pintar() {
            const texto = input.value;
            const q = normalizar(texto);
            opciones = [];
            filas = [];
            fila = -1;
            col = 0;
            if (!q) {
                lista.innerHTML = '';
                return;
            }

            const servicios = buscarServicios(q);
            const encontrados = buscarClientes(q);
            if (!servicios.length && !encontrados.length) {
                lista.innerHTML = `<li class="bg-vacio">Sin resultados para "${escaparHtml(texto)}"</li>`;
                return;
            }

            // Primero la sección que mejor coincide (empate: clientes).
            const mejorS = servicios.length ? servicios[0].p : -1;
            const mejorC = encontrados.length ? encontrados[0].p : -1;
            const secciones = [];
            const pintarC = () => encontrados.length && secciones.push(htmlClientes(encontrados, q));
            const pintarS = () => servicios.length && secciones.push(htmlServicios(servicios, q));
            if (mejorC >= mejorS) { pintarC(); pintarS(); } else { pintarS(); pintarC(); }

            lista.innerHTML = secciones.join('');
        }

        /** Marca la opción (f, c). f = -1 vuelve al input y no marca nada. */
        function marcar(f, c) {
            fila = Math.max(-1, Math.min(f, filas.length - 1));
            // Al cambiar de fila se conserva la columna si existe (bajar por "Sesión ATM" de cada cliente).
            col = fila < 0 ? 0 : Math.max(0, Math.min(c, filas[fila].length - 1));
            const activa = fila < 0 ? -1 : filas[fila][col];
            lista.querySelectorAll('.bg-opcion').forEach(el =>
                el.classList.toggle('activo', Number(el.dataset.i) === activa));
            if (activa >= 0) lista.querySelector(`.bg-opcion[data-i="${activa}"]`).scrollIntoView({ block: 'nearest' });
            else lista.scrollTop = 0;
        }

        function elegir(i) {
            const opcion = opciones[i];
            if (opcion) alElegir(opcion);
        }

        // Enter. Con algo marcado: lo ejecuta. Sin nada marcado NUNCA ejecuta una acción de
        // cliente (abriría una sesión real sin elegirla: "iva" coincide con "Ivan"):
        // va al primer SERVICIO ("iva" + Enter → Importar Libro IVA); si solo hay
        // clientes, marca el primero y espera otro Enter.
        function enterSinMarcar() {
            if (fila >= 0) return elegir(filas[fila][col]);
            const servicio = opciones.findIndex(o => o.tipo === 'servicio');
            if (servicio >= 0) return elegir(servicio);
            if (filas.length) marcar(0, 0);
        }

        input.addEventListener('input', pintar);
        input.addEventListener('keydown', (e) => {
            // Tab / Shift+Tab = ↓ / ↑ cuando hay resultados: el foco no se va a la pantalla de atrás.
            const tab = e.key === 'Tab' && filas.length > 0;
            if (e.key === 'ArrowDown' || (tab && !e.shiftKey)) { e.preventDefault(); marcar(fila + 1, col); }
            else if (e.key === 'ArrowUp' || (tab && e.shiftKey)) { e.preventDefault(); marcar(fila - 1, col); }
            // ← → solo con algo marcado: si no, mueven el cursor dentro del texto como siempre.
            else if (e.key === 'ArrowRight' && fila >= 0) { e.preventDefault(); marcar(fila, col + 1); }
            else if (e.key === 'ArrowLeft' && fila >= 0) { e.preventDefault(); marcar(fila, col - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); enterSinMarcar(); }
            else if (e.key === 'Escape') { e.preventDefault(); alEscape(); }
        });
        lista.addEventListener('mousemove', (e) => {
            const el = e.target.closest('.bg-opcion');
            if (!el) return;
            const i = Number(el.dataset.i);
            const f = filas.findIndex(r => r.includes(i));
            if (f !== fila || filas[f].indexOf(i) !== col) marcar(f, filas[f].indexOf(i));
        });
        // mousedown: que el click no le saque el foco al input.
        lista.addEventListener('mousedown', (e) => e.preventDefault());
        lista.addEventListener('click', (e) => {
            const el = e.target.closest('.bg-opcion');
            if (el) elegir(Number(el.dataset.i));
        });

        return {
            input,
            repintar: pintar,
            limpiar() { input.value = ''; pintar(); },
        };
    }

    // ===== Ventana flotante (Ctrl+K) =====
    let overlay = null;

    // Trampa de foco: con la ventana abierta, el foco no sale de ella (Tab sin resultados,
    // o un click en el borde de la caja). Cualquier tecla con el foco afuera lo devuelve al input.
    function retenerFoco(e) {
        if (!overlay || overlay.contains(document.activeElement)) return;
        if (e.key === 'Tab') e.preventDefault();
        overlay.querySelector('.bg-input').focus();
    }

    function cerrarBuscadorGlobal() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        document.body.classList.remove('bg-sin-scroll');
        document.removeEventListener('keydown', retenerFoco, true);
    }

    function abrirBuscadorGlobal() {
        if (overlay) return overlay.querySelector('.bg-input').focus();

        overlay = document.createElement('div');
        overlay.className = 'bg-overlay';
        overlay.innerHTML = '<div class="bg-caja"></div>';
        document.body.appendChild(overlay);
        // Mientras está abierto, la página de atrás no scrollea ni recibe el foco.
        document.body.classList.add('bg-sin-scroll');
        document.addEventListener('keydown', retenerFoco, true);

        const buscador = montarBuscador(overlay.querySelector('.bg-caja'), {
            alElegir: (opcion) => {
                cerrarBuscadorGlobal();
                ejecutar(opcion);
            },
            alEscape: cerrarBuscadorGlobal,
        });
        // Tab sin resultados: el input es lo único enfocable de la ventana, se queda ahí.
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Tab') e.preventDefault(); });
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) cerrarBuscadorGlobal();   // click afuera de la caja
        });
        buscador.input.focus();
        // Clientes frescos; si ya escribió algo mientras cargaban, se repinta.
        cargarClientes().then(() => buscador.repintar());
    }

    // ===== Portada (pantalla de inicio) =====
    let buscadorPortada = null;

    function montarPortada() {
        const portada = document.getElementById('portadaDiv');
        if (!portada) return;
        portada.innerHTML = `
            <div class="portada">
                <p class="portada-pregunta">¿Qué querés hacer?</p>
                <div class="portada-buscador"></div>
            </div>
        `;
        buscadorPortada = montarBuscador(portada.querySelector('.portada-buscador'), {
            alElegir: (opcion) => {
                buscadorPortada.limpiar();
                ejecutar(opcion);
            },
            alEscape: () => buscadorPortada.limpiar(),
        });
        buscadorPortada.input.focus();
        cargarClientes().then(() => buscadorPortada.repintar());
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
        if (portadaVisible() && buscadorPortada) return buscadorPortada.input.focus();
        abrirBuscadorGlobal();
    });

    document.addEventListener('DOMContentLoaded', montarPortada);

    window.abrirBuscadorGlobal = abrirBuscadorGlobal;
})();
