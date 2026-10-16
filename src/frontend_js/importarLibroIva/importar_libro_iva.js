// Importar Libro IVA — elegir clientes y período; por cada uno, Portal IVA importa desde ARCA
// el Libro Ventas y el Libro Compras al borrador (no presenta) y baja el Excel de cada libro.
// El backend agrupa por login (representante) y avisa el progreso por onUpdate.

window.inicializarModuloImportarLibroIva = () => {
    // Errores que se arreglan con la clave (login_arca.js y el resolver de acceso).
    // Adentro de la función: el script se recarga en cada entrada y una const global chocaría.
    const ERRORES_DE_ACCESO = new Set(['INVALID_CREDENTIALS', 'UPDATE_PASSWORD_REQUIRED', 'LOGIN_FAILED', 'SIN_ACCESO']);

    const btnProcesar = document.getElementById('btnProcesarIl');
    const chkVisible  = document.getElementById('chk-visible-il');
    const inpPeriodo  = document.getElementById('il-periodo');
    const resultados  = document.getElementById('resultadosIl');
    const contenido   = document.getElementById('resultadosContenidoIl');
    const contador    = document.getElementById('contadorIl');

    let enCurso = false;

    // Por defecto, el mes anterior (el que se declara).
    const hoy = new Date();
    const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    inpPeriodo.value = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;

    // `let` + null: el selector puede avisar un cambio mientras se construye.
    let selector = null;
    const actualizarBoton = () => {
        const elegidos = selector ? selector.obtenerSeleccionados().length : 0;
        btnProcesar.disabled = enCurso || !inpPeriodo.value || elegidos === 0;
    };

    selector = new SelectorUsuarios('selector-contribuyentes-il', {
        mostrarTablaSeleccionados: true,
        fuente: 'contribuyentes',
        servicio: 'afip',
        // Lote: no deja elegir los de clave incorrecta (fallarían y acercan el captcha).
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selector, { lote: true }) : {}),
        onCambioSeleccion: () => actualizarBoton()
    });
    inpPeriodo.addEventListener('change', actualizarBoton);

    // ===== Resultados =====
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    // Un bloque por cliente: renglón del cliente + un renglón por libro.
    function bloqueDe(cuit) {
        let bloque = contenido.querySelector(`[data-cuit="${cuit}"]`);
        if (!bloque) {
            bloque = el('div', 'il-cliente');
            bloque.dataset.cuit = cuit;
            contenido.appendChild(bloque);
        }
        return bloque;
    }

    function renglonLibro(nombre, libro) {
        const fila = el('div', `il-resultado il-libro il-resultado-${libro.success ? 'exito' : 'error'}`);
        const texto = libro.success
            ? `${libro.encontrados} encontrados en ARCA, ${libro.agregados} agregados, ${libro.yaExistentes} ya estaban` +
              (libro.totalLibro != null ? ` — el libro tiene ${libro.totalLibro}` : '') +
              (libro.aviso ? ` ⚠ ${libro.aviso}` : '')
            : (libro.message || 'Error');
        const span = el('span', 'il-resultado-texto');
        span.appendChild(el('strong', null, `${libro.success ? '✓' : '✗'} ${nombre}`));
        span.appendChild(document.createTextNode(` — ${texto}`));
        fila.appendChild(span);
        if (libro.rutaExcel) {
            const btnExcel = el('button', 'ui-btn', 'Abrir Excel');
            btnExcel.addEventListener('click', () => window.electronAPI.abrirArchivo(libro.rutaExcel));
            fila.appendChild(btnExcel);
        }
        return fila;
    }

    function pintarCliente(datos) {
        const bloque = bloqueDe(datos.cuit);
        bloque.innerHTML = '';

        const icono = { procesando: '⏳', exito: '✓', error: '✗' }[datos.estado] || '';
        // Con libros, el detalle va en cada renglón: el del cliente queda corto.
        const conLibros = datos.ventas || datos.compras;
        const texto = conLibros ? (datos.estado === 'exito' ? 'importado' : 'con errores') : (datos.mensaje || '');
        const fila = el('div', `il-resultado il-resultado-${datos.estado}`);
        const span = el('span', 'il-resultado-texto');
        span.appendChild(el('strong', null, `${icono} ${datos.nombre || ''} (${datos.cuit})`));
        span.appendChild(document.createTextNode(` — ${texto}`));
        fila.appendChild(span);
        if (datos.downloadDir) {
            const btnCarpeta = el('button', 'ui-btn ui-btn--ghost', 'Abrir carpeta');
            btnCarpeta.addEventListener('click', () => window.electronAPI.abrirDirectorio(datos.downloadDir));
            fila.appendChild(btnCarpeta);
        }
        bloque.appendChild(fila);

        if (datos.ventas) bloque.appendChild(renglonLibro('Ventas', datos.ventas));
        if (datos.compras) bloque.appendChild(renglonLibro('Compras', datos.compras));

        // Solo los errores de acceso van a la fila: ahí el selector ofrece "Clave". Un error de
        // período o de ARCA con el botón de la llave asusta y no se arregla con la clave.
        if (datos.estado === 'error' && datos.id != null && ERRORES_DE_ACCESO.has(datos.error)) {
            selector.marcarFila(datos.id, datos.mensaje, 'error');
        }
    }

    function irAResultados() {
        resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onUpdate(datos) {
        resultados.style.display = 'block';
        const inicio = contenido.querySelector('.il-inicio');
        if (inicio) inicio.remove();
        if (datos.tipo === 'progreso' || datos.tipo === 'resultado') {
            pintarCliente(datos);
            contador.textContent = `(${datos.procesados}/${datos.total})`;
            if (datos.tipo === 'progreso' && window.ruedaTrabajando) {
                window.ruedaTrabajando.mostrar(
                    `Libro IVA: ${datos.nombre || datos.cuit} (${datos.procesados + 1}/${datos.total})`,
                    datos.mensaje || 'No se colgó: está trabajando. ARCA es lento.');
            }
        } else if (datos.tipo === 'finalizado') {
            contenido.appendChild(el('div', 'il-resultado il-resultado-fin',
                `Terminado: ${datos.exitosos} importado(s), ${datos.fallidos} con error.`));
            irAResultados();
        }
    }

    // ipcRenderer.on acumula listeners: se registra UNA vez y se redirige a la vista actual.
    window.__ilOnUpdate = onUpdate;
    if (!window.__ilListenerRegistrado) {
        window.electronAPI.importarLibroIva.onUpdate((datos) => window.__ilOnUpdate && window.__ilOnUpdate(datos));
        window.__ilListenerRegistrado = true;
    }

    // ===== Procesar =====
    btnProcesar.addEventListener('click', async () => {
        const seleccionados = selector.obtenerSeleccionados();
        if (seleccionados.length === 0 || !inpPeriodo.value) return;

        const contribuyentes = seleccionados.map(u => ({
            id: u.id,
            cuit: u.cuit,
            nombre: u.razonSocial || [u.nombre, u.apellido].filter(Boolean).join(' ')
        }));
        const periodo = inpPeriodo.value.replace('-', '');   // 'AAAA-MM' → 'AAAAMM'

        enCurso = true;
        btnProcesar.disabled = true;
        btnProcesar.textContent = '⏳ Importando...';
        contenido.innerHTML = '';
        contador.textContent = '';
        resultados.style.display = 'block';
        contenido.appendChild(el('div', 'il-resultado il-resultado-procesando il-inicio',
            `⏳ Iniciando ${contribuyentes.length} cliente(s)... (puede tardar: ARCA procesa cada importación)`));
        irAResultados();
        if (window.ruedaTrabajando) window.ruedaTrabajando.mostrar('Libro IVA: iniciando sesión en AFIP…');

        try {
            const r = await window.electronAPI.importarLibroIva.procesar({
                contribuyentes,
                periodo,
                visible: chkVisible.checked
            });
            if (!r || !r.success) {
                contenido.appendChild(el('div', 'il-resultado il-resultado-error', (r && r.message) || 'Error desconocido'));
            }
        } catch (e) {
            contenido.appendChild(el('div', 'il-resultado il-resultado-error', e.message));
        } finally {
            if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
            enCurso = false;
            btnProcesar.textContent = '▶ Importar Libro IVA';
            actualizarBoton();
        }
    });
};
