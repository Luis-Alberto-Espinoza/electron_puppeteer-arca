// DDJJ pendientes — elegir clientes y consultar sus DDJJ pendientes de presentación (lote).
// El backend agrupa por login (representante) y avisa el progreso por onUpdate.
// Con pendientes: tabla + PDF de AFIP + Excel. Sin pendientes: aviso + Excel de constancia.

window.inicializarModuloDdjjPendientes = () => {
    // Errores que se arreglan con la clave (login_arca.js y el resolver de acceso).
    // Adentro de la función: el script se recarga en cada entrada y una const global chocaría.
    const ERRORES_DE_ACCESO = new Set(['INVALID_CREDENTIALS', 'UPDATE_PASSWORD_REQUIRED', 'LOGIN_FAILED', 'SIN_ACCESO']);

    const btnProcesar = document.getElementById('btnProcesarDp');
    const chkVisible  = document.getElementById('chk-visible-dp');
    const resultados  = document.getElementById('resultadosDp');
    const contenido   = document.getElementById('resultadosContenidoDp');
    const contador    = document.getElementById('contadorDp');

    let enCurso = false;

    const selector = new SelectorUsuarios('selector-contribuyentes-dp', {
        mostrarTablaSeleccionados: true,
        fuente: 'contribuyentes',
        servicio: 'afip',
        // Lote: no deja elegir los de clave incorrecta (fallarían y acercan el captcha).
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selector, { lote: true }) : {}),
        onCambioSeleccion: (seleccionados) => {
            btnProcesar.disabled = enCurso || seleccionados.length === 0;
        }
    });

    // ===== Resultados =====
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    // Un bloque por cliente: renglón de estado + (si hay pendientes) la tabla.
    function bloqueDe(cuit) {
        let bloque = contenido.querySelector(`[data-cuit="${cuit}"]`);
        if (!bloque) {
            bloque = el('div', 'dp-cliente');
            bloque.dataset.cuit = cuit;
            contenido.appendChild(bloque);
        }
        return bloque;
    }

    function tablaPendientes(pendientes) {
        const tabla = el('table', 'dp-tabla');
        const trH = el('tr');
        ['CUIT', 'Est', 'Impuesto', 'Período', 'Vencimiento'].forEach(t => trH.appendChild(el('th', null, t)));
        const thead = el('thead');
        thead.appendChild(trH);
        const tbody = el('tbody');
        pendientes.forEach(p => {
            const tr = el('tr');
            [p.cuit, p.establecimiento, p.impuesto, p.periodo, p.vencimiento]
                .forEach(v => tr.appendChild(el('td', null, String(v ?? ''))));
            tbody.appendChild(tr);
        });
        tabla.append(thead, tbody);
        return tabla;
    }

    function pintarCliente(datos) {
        const bloque = bloqueDe(datos.cuit);
        bloque.innerHTML = '';

        const icono = { procesando: '⏳', exito: '✓', pendientes: '⚠', error: '✗' }[datos.estado] || '';
        const texto = datos.estado === 'exito' ? 'sin DDJJ pendientes de presentación' : (datos.mensaje || '');
        const fila = el('div', `dp-resultado dp-resultado-${datos.estado}`);
        const span = el('span', 'dp-resultado-texto');
        span.appendChild(el('strong', null, `${icono} ${datos.nombre || ''} (${datos.cuit})`));
        span.appendChild(document.createTextNode(` — ${texto}`));
        fila.appendChild(span);

        if (datos.estado === 'pendientes' || datos.estado === 'exito') {
            // Botones: componente común (componentes/archivoResultado)
            const componenteArchivos = window.archivoResultado;
            if (datos.rutaPdf) fila.appendChild(componenteArchivos.crearBotones(datos.rutaPdf, { etiquetaAbrir: 'Abrir PDF', carpeta: false }));
            if (datos.rutaExcel) fila.appendChild(componenteArchivos.crearBotones(datos.rutaExcel, { etiquetaAbrir: 'Abrir Excel', carpeta: false }));
            if (datos.downloadDir) fila.appendChild(componenteArchivos.crearBotones(null, { abrir: false, rutaCarpeta: datos.downloadDir, etiquetaCarpeta: 'Carpeta' }));
        }
        bloque.appendChild(fila);

        if (datos.estado === 'pendientes') {
            if (datos.aviso) bloque.appendChild(el('div', 'dp-resultado dp-resultado-error', datos.aviso));
            bloque.appendChild(tablaPendientes(datos.pendientes || []));
        }
        // Solo los errores de acceso van a la fila: ahí el selector ofrece "Clave". Un error de
        // Seti o de ARCA con el botón de la llave asusta y no se arregla con la clave.
        if (datos.estado === 'error' && datos.id != null && ERRORES_DE_ACCESO.has(datos.error)) {
            selector.marcarFila(datos.id, datos.mensaje, 'error');
        }
    }

    function irAResultados() {
        resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onUpdate(datos) {
        resultados.style.display = 'block';
        const inicio = contenido.querySelector('.dp-inicio');
        if (inicio) inicio.remove();
        if (datos.tipo === 'progreso' || datos.tipo === 'resultado') {
            pintarCliente(datos);
            contador.textContent = `(${datos.procesados}/${datos.total})`;
            if (datos.tipo === 'progreso' && window.ruedaTrabajando) {
                window.ruedaTrabajando.mostrar(
                    `DDJJ pendientes: ${datos.nombre || datos.cuit} (${datos.procesados + 1}/${datos.total})`,
                    'No se colgó: está trabajando. La consulta de AFIP es lenta.');
            }
        } else if (datos.tipo === 'finalizado') {
            contenido.appendChild(el('div', 'dp-resultado dp-resultado-fin',
                `Terminado: ${datos.exitosos} consultado(s), ${datos.fallidos} con error.`));
            irAResultados();
        }
    }

    // ipcRenderer.on acumula listeners: se registra UNA vez y se redirige a la vista actual.
    window.__dpOnUpdate = onUpdate;
    if (!window.__dpListenerRegistrado) {
        window.electronAPI.ddjjPendientes.onUpdate((datos) => window.__dpOnUpdate && window.__dpOnUpdate(datos));
        window.__dpListenerRegistrado = true;
    }

    // ===== Procesar =====
    btnProcesar.addEventListener('click', async () => {
        const seleccionados = selector.obtenerSeleccionados();
        if (seleccionados.length === 0) return;

        const contribuyentes = seleccionados.map(u => ({
            id: u.id,
            cuit: u.cuit,
            nombre: u.razonSocial || [u.nombre, u.apellido].filter(Boolean).join(' ')
        }));

        enCurso = true;
        btnProcesar.disabled = true;
        btnProcesar.textContent = '⏳ Consultando...';
        contenido.innerHTML = '';
        contador.textContent = '';
        resultados.style.display = 'block';
        contenido.appendChild(el('div', 'dp-resultado dp-resultado-procesando dp-inicio',
            `⏳ Iniciando ${contribuyentes.length} cliente(s)... (puede tardar: la consulta de AFIP es lenta)`));
        irAResultados();
        if (window.ruedaTrabajando) window.ruedaTrabajando.mostrar('DDJJ pendientes: iniciando sesión en AFIP…');

        try {
            const r = await window.electronAPI.ddjjPendientes.procesar({
                contribuyentes,
                visible: chkVisible.checked
            });
            if (!r || !r.success) {
                contenido.appendChild(el('div', 'dp-resultado dp-resultado-error', (r && r.message) || 'Error desconocido'));
            }
        } catch (e) {
            contenido.appendChild(el('div', 'dp-resultado dp-resultado-error', e.message));
        } finally {
            if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
            enCurso = false;
            btnProcesar.textContent = '▶ Consultar DDJJ pendientes';
            btnProcesar.disabled = selector.obtenerSeleccionados().length === 0;
        }
    });
};
