// Importar Libro IVA — elegir clientes y período; por cada uno, Portal IVA importa desde ARCA
// el Libro Ventas y el Libro Compras al borrador (no presenta) y baja el Excel de cada libro.
// El backend agrupa por login (representante) y avisa el progreso por onUpdate.
// Dos casos los decide el usuario desde Resultados (y se reintenta solo ese cliente):
//   - borrador de otro período sin presentar → "Descartar borrador MM/AAAA y reintentar"
//     (o la casilla del formulario, que lo descarta sin preguntar);
//   - Datos Iniciales del período → las mismas opciones que ARCA + Continuar.

window.inicializarModuloImportarLibroIva = () => {
    // Errores que se arreglan con la clave (login_arca.js y el resolver de acceso).
    // Adentro de la función: el script se recarga en cada entrada y una const global chocaría.
    const ERRORES_DE_ACCESO = new Set(['INVALID_CREDENTIALS', 'UPDATE_PASSWORD_REQUIRED', 'LOGIN_FAILED', 'SIN_ACCESO']);

    const btnProcesar = document.getElementById('btnProcesarIl');
    const chkVisible  = document.getElementById('chk-visible-il');
    const chkDescartar = document.getElementById('chk-descartar-borrador-il');
    const contenedor  = btnProcesar.closest('.il-container');
    const inpPeriodo  = document.getElementById('il-periodo');
    const resultados  = document.getElementById('resultadosIl');
    const contenido   = document.getElementById('resultadosContenidoIl');
    const contador    = document.getElementById('contadorIl');

    let enCurso = false;
    let reintentando = false;
    // Lo último que se corrió: el reintento usa ESE período (no el del campo, que pudo cambiar).
    const lote = { periodo: null, porCuit: new Map() };

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

    const legible = (p) => `${p.slice(4, 6)}/${p.slice(0, 4)}`;   // 'AAAAMM' → 'MM/AAAA'

    function casilla(texto, marcada) {
        const label = el('label', 'il-check');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = !!marcada;
        label.append(input, document.createTextNode(texto));
        return { label, input };
    }

    // Borrador de otro período: descartarlo es decisión del usuario (se pierde lo cargado).
    function accionBorrador(datos) {
        const caja = el('div', 'il-accion');
        caja.appendChild(el('div', 'il-accion-texto',
            `Si lo descartás, se pierde lo cargado en el borrador ${legible(datos.periodoBorrador)}. Si no, presentalo en ARCA y volvé a correr.`));
        const btn = el('button', 'ui-btn ui-btn--danger il-btn-reintento',
            `Descartar borrador ${legible(datos.periodoBorrador)} y reintentar`);
        btn.addEventListener('click', () => reintentar(datos.cuit, { descartarPeriodo: datos.periodoBorrador }));
        caja.appendChild(btn);
        return caja;
    }

    // Datos Iniciales: las mismas opciones que ARCA. Siempre "Con Movimientos" ("Sin Movimientos" presenta).
    const OPERACIONES = [
        ['operacionesNoGravadasExentas', 'Operaciones No Gravadas o Exentas'],
        ['importacionDefinitivaBienes', 'Importación definitiva de bienes'],
        ['importacionServicios', 'Importación de servicios'],
        ['regimenTurIVA', 'Incluido en el régimen TurIVA'],
        ['bienesUsadosMaterialReciclable', 'Compras de bienes usados o material reciclable']
    ];
    const PRORRATEOS = [
        ['1', 'Con prorrateo por asignación directa'],
        ['2', 'Con prorrateo global'],
        ['3', 'Con prorrateo por asignación directa y global']
    ];

    function formDatosIniciales(datos) {
        const info = datos.datosIniciales;
        const actuales = info.actuales || {};
        const caja = el('div', 'il-accion il-accion-columna');
        caja.appendChild(el('div', 'il-accion-titulo',
            `Datos Iniciales ${legible(info.periodo || lote.periodo)}: indicá si el cliente realiza alguna de estas operaciones`));

        const ops = OPERACIONES.map(([clave, texto]) => {
            const c = casilla(texto, actuales[clave]);
            caja.appendChild(c.label);
            return { clave, input: c.input };
        });

        // Forma de cómputo: solo con No Gravadas o Exentas (como en ARCA).
        const filaProrrateo = el('label', 'il-prorrateo', 'Forma de cómputo del crédito fiscal ');
        const selProrrateo = el('select');
        PRORRATEOS.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; selProrrateo.appendChild(o); });
        if (actuales.tipoProrrateo) selProrrateo.value = actuales.tipoProrrateo;
        filaProrrateo.appendChild(selProrrateo);
        ops[0].input.closest('label').after(filaProrrateo);

        const ninguna = casilla('No realizo ninguna de estas operaciones', false);
        caja.appendChild(ninguna.label);

        let anterior = null;
        if (info.importarAnteriorVisible) {
            anterior = casilla('Importar datos de la presentación anterior', false);
            caja.appendChild(anterior.label);
        }

        const btn = el('button', 'ui-btn ui-btn--accion il-btn-reintento', 'Continuar');
        caja.appendChild(btn);

        const refrescar = () => {
            filaProrrateo.style.display = ops[0].input.checked ? '' : 'none';
            btn.disabled = !(ninguna.input.checked || ops.some(o => o.input.checked));
        };
        // "Ninguna" es excluyente con las operaciones (igual que en ARCA).
        ops.forEach(o => o.input.addEventListener('change', () => {
            if (o.input.checked) ninguna.input.checked = false;
            refrescar();
        }));
        ninguna.input.addEventListener('change', () => {
            if (ninguna.input.checked) ops.forEach(o => { o.input.checked = false; });
            refrescar();
        });
        refrescar();

        btn.addEventListener('click', () => {
            const elegidos = { ningunaOperacion: ninguna.input.checked, importarDatosAnterior: !!(anterior && anterior.input.checked) };
            ops.forEach(o => { elegidos[o.clave] = o.input.checked; });
            if (elegidos.operacionesNoGravadasExentas) elegidos.tipoProrrateo = selProrrateo.value;
            reintentar(datos.cuit, { datosIniciales: elegidos });
        });
        return caja;
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

        if (datos.borradorDescartado) {
            bloque.appendChild(el('div', 'il-resultado il-resultado-aviso il-libro',
                `⚠ Se descartó el borrador ${legible(datos.borradorDescartado)} sin presentar: lo cargado en él se perdió.`));
        }
        if (datos.ventas) bloque.appendChild(renglonLibro('Ventas', datos.ventas));
        if (datos.compras) bloque.appendChild(renglonLibro('Compras', datos.compras));
        if (datos.estado === 'error' && datos.error === 'BORRADOR_OTRO_PERIODO' && datos.periodoBorrador) {
            bloque.appendChild(accionBorrador(datos));
        }
        if (datos.estado === 'error' && datos.error === 'DATOS_INICIALES_PENDIENTES' && datos.datosIniciales) {
            bloque.appendChild(formDatosIniciales(datos));
        }

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
            if (!reintentando) contador.textContent = `(${datos.procesados}/${datos.total})`;
            if (datos.tipo === 'progreso' && window.ruedaTrabajando) {
                window.ruedaTrabajando.mostrar(
                    `Portal IVA: ${datos.nombre || datos.cuit} (${datos.procesados + 1}/${datos.total})`,
                    datos.mensaje || 'No se colgó: está trabajando. ARCA es lento.');
            }
        } else if (datos.tipo === 'finalizado' && !reintentando) {
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
    // reintento = un solo cliente desde Resultados: no limpia la lista ni toca el contador.
    async function correr(contribuyentes, periodo, reintento) {
        enCurso = true;
        reintentando = reintento;
        contenedor.classList.add('il-ocupado');
        btnProcesar.disabled = true;
        if (!reintento) {
            btnProcesar.textContent = '⏳ Importando...';
            contenido.innerHTML = '';
            contador.textContent = '';
            resultados.style.display = 'block';
            contenido.appendChild(el('div', 'il-resultado il-resultado-procesando il-inicio',
                `⏳ Iniciando ${contribuyentes.length} cliente(s)... (puede tardar: ARCA procesa cada importación)`));
            irAResultados();
        }
        if (window.ruedaTrabajando) window.ruedaTrabajando.mostrar('Portal IVA: iniciando sesión en AFIP…');

        try {
            const r = await window.electronAPI.importarLibroIva.procesar({
                contribuyentes,
                periodo,
                visible: chkVisible.checked,
                // En el reintento manda lo que el usuario eligió para ESE cliente, no la casilla.
                descartarBorrador: !reintento && chkDescartar.checked
            });
            if (!r || !r.success) {
                contenido.appendChild(el('div', 'il-resultado il-resultado-error', (r && r.message) || 'Error desconocido'));
            }
        } catch (e) {
            contenido.appendChild(el('div', 'il-resultado il-resultado-error', e.message));
        } finally {
            if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
            enCurso = false;
            reintentando = false;
            contenedor.classList.remove('il-ocupado');
            btnProcesar.textContent = '▶ Importar Libro IVA';
            actualizarBoton();
        }
    }

    function reintentar(cuit, respuesta) {
        const c = lote.porCuit.get(String(cuit));
        if (enCurso || !c || !lote.periodo) return;
        correr([{ ...c, ...respuesta }], lote.periodo, true);
    }

    btnProcesar.addEventListener('click', () => {
        const seleccionados = selector.obtenerSeleccionados();
        if (seleccionados.length === 0 || !inpPeriodo.value) return;

        const contribuyentes = seleccionados.map(u => ({
            id: u.id,
            cuit: u.cuit,
            nombre: u.razonSocial || [u.nombre, u.apellido].filter(Boolean).join(' ')
        }));
        lote.periodo = inpPeriodo.value.replace('-', '');   // 'AAAA-MM' → 'AAAAMM'
        lote.porCuit = new Map(contribuyentes.map(c => [String(c.cuit), c]));
        correr(contribuyentes, lote.periodo, false);
    });
};
