// Importar Libro IVA — elegir clientes y período; por cada uno, Portal IVA importa desde ARCA
// el Libro Ventas y el Libro Compras al borrador (no presenta) y baja el Excel de cada libro.
// El backend agrupa por login (representante) y avisa el progreso por onUpdate.
// Preparación (antes del login), por cliente: origen de los comprobantes (ARCA o los 4 txt,
// validados al elegirlos) y Datos Iniciales por si ARCA los pide (así no hace falta otra vuelta).
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
    const preparacion = document.getElementById('preparacionIl');
    const prepContenido = document.getElementById('preparacionContenidoIl');

    let enCurso = false;
    let reintentando = false;
    // Lo último que se corrió: el reintento usa ESE período (no el del campo, que pudo cambiar).
    const lote = { periodo: null, porCuit: new Map() };

    // Por defecto, el mes anterior (el que se declara).
    const hoy = new Date();
    const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    inpPeriodo.value = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;

    // Preparación por CUIT. Sobrevive a sacar y volver a elegir un cliente (no se pierden los archivos).
    const prep = new Map();   // cuit → { origen, rutas, validacion, validando, turno, campos, nodo, ... }
    const periodoActual = () => inpPeriodo.value.replace('-', '');   // 'AAAA-MM' → 'AAAAMM'
    const nombreDe = (u) => u.razonSocial || [u.nombre, u.apellido].filter(Boolean).join(' ');

    // `let` + null: el selector puede avisar un cambio mientras se construye.
    let selector = null;
    // Un cliente con "Mis archivos" necesita los 4 txt validados antes de arrancar.
    const archivosListos = (lista) => lista.every(u => {
        const p = prep.get(String(u.cuit));
        return !p || p.origen !== 'archivos' || (!p.validando && p.validacion && p.validacion.ok);
    });
    const actualizarBoton = () => {
        const elegidos = selector ? selector.obtenerSeleccionados() : [];
        btnProcesar.disabled = enCurso || !inpPeriodo.value || elegidos.length === 0 || !archivosListos(elegidos);
    };

    selector = new SelectorUsuarios('selector-contribuyentes-il', {
        mostrarTablaSeleccionados: true,
        fuente: 'contribuyentes',
        servicio: 'afip',
        // Lote: no deja elegir los de clave incorrecta (fallarían y acercan el captcha).
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selector, { lote: true }) : {}),
        onCambioSeleccion: () => { if (selector) pintarPreparacion(); actualizarBoton(); }
    });
    // Ventas se valida contra el período: si cambia, se revisan de nuevo los archivos ya elegidos.
    inpPeriodo.addEventListener('change', () => {
        prep.forEach(p => { if (p.rutas.length) validarArchivos(p); });
        actualizarBoton();
    });

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

    /**
     * Las casillas de Datos Iniciales dentro de `caja` (Resultados y Preparación usan las mismas).
     * @returns {{ leer: () => object, algunaMarcada: () => boolean, alCambiar: (fn) => void }}
     */
    function camposDatosIniciales(caja, actuales, conAnterior) {
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
        if (conAnterior) {
            anterior = casilla('Importar datos de la presentación anterior', false);
            caja.appendChild(anterior.label);
        }

        const algunaMarcada = () => ninguna.input.checked || ops.some(o => o.input.checked);
        const avisos = [];
        const refrescar = () => {
            filaProrrateo.style.display = ops[0].input.checked ? '' : 'none';
            avisos.forEach(fn => fn());
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

        return {
            algunaMarcada,
            alCambiar: (fn) => avisos.push(fn),
            leer: () => {
                const elegidos = { ningunaOperacion: ninguna.input.checked, importarDatosAnterior: !!(anterior && anterior.input.checked) };
                ops.forEach(o => { elegidos[o.clave] = o.input.checked; });
                if (elegidos.operacionesNoGravadasExentas) elegidos.tipoProrrateo = selProrrateo.value;
                return elegidos;
            }
        };
    }

    function formDatosIniciales(datos) {
        const info = datos.datosIniciales;
        const caja = el('div', 'il-accion il-accion-columna');
        caja.appendChild(el('div', 'il-accion-titulo',
            `Datos Iniciales ${legible(info.periodo || lote.periodo)}: indicá si el cliente realiza alguna de estas operaciones`));
        const campos = camposDatosIniciales(caja, info.actuales || {}, info.importarAnteriorVisible);

        const btn = el('button', 'ui-btn ui-btn--accion il-btn-reintento', 'Continuar');
        caja.appendChild(btn);
        const habilitar = () => { btn.disabled = !campos.algunaMarcada(); };
        campos.alCambiar(habilitar);
        habilitar();

        btn.addEventListener('click', () => reintentar(datos.cuit, { datosIniciales: campos.leer() }));
        return caja;
    }

    // ===== Preparación =====
    function pintarEstadoArchivos(p) {
        p.estado.innerHTML = '';
        if (p.validando) {
            p.estado.appendChild(el('div', 'il-prep-nota', '⏳ Revisando los archivos…'));
            return;
        }
        const v = p.validacion;
        if (!v || p.rutas.length === 0) {
            p.estado.appendChild(el('div', 'il-prep-nota',
                'Agregá los 4 txt, juntos o de a uno desde distintas carpetas: la app reconoce cuál es cuál.'));
            return;
        }
        const titulo = v.ok
            ? `✓ Formato correcto: Ventas ${v.resumen.ventas} y Compras ${v.resumen.compras} comprobante(s)`
            : '✗ Hay que corregir los archivos antes de arrancar:';
        p.estado.appendChild(el('div', v.ok ? 'il-prep-ok' : 'il-prep-error', titulo));
        const lista = el('ul', 'il-prep-lista');
        if (!v.ok) v.errores.forEach(e => lista.appendChild(el('li', 'il-prep-error', e)));
        // Todos los archivos, también los no reconocidos, cada uno con su ✕ para sacarlo.
        (v.detalle || []).forEach(d => {
            const li = el('li', null, `${d.tipoNombre || 'No reconocido'}: ${d.nombre} `);
            const quitar = el('button', 'il-prep-quitar', '✕');
            quitar.title = `Sacar ${d.ruta}`;
            quitar.addEventListener('click', () => {
                p.rutas = p.rutas.filter(r => r !== d.ruta);
                if (p.rutas.length) {
                    validarArchivos(p);
                } else {
                    p.validacion = null;
                    pintarEstadoArchivos(p);
                    actualizarBoton();
                }
            });
            li.appendChild(quitar);
            lista.appendChild(li);
        });
        p.estado.appendChild(lista);
    }

    async function validarArchivos(p) {
        const turno = ++p.turno;   // si se pide otra validación mientras tanto, gana la última
        p.validando = true;
        pintarEstadoArchivos(p);
        actualizarBoton();
        let v;
        try {
            v = await window.electronAPI.importarLibroIva.validarArchivos(p.rutas, periodoActual());
        } catch (e) {
            v = { ok: false, errores: [e.message], detalle: [] };
        }
        if (turno !== p.turno) return;

        // Agregado de a uno: si un archivo nuevo es de un tipo que ya estaba, reemplaza al viejo.
        // Dos nuevos del mismo tipo (elegidos en la misma vez) no se tocan: queda el error.
        const nuevas = p.nuevas;
        p.nuevas = null;
        if (nuevas && v.detalle) {
            const viejasPisadas = v.detalle.filter(d => d.tipo && !nuevas.has(d.ruta) &&
                v.detalle.some(o => o.tipo === d.tipo && nuevas.has(o.ruta)));
            if (viejasPisadas.length) {
                p.rutas = p.rutas.filter(r => !viejasPisadas.some(d => d.ruta === r));
                return validarArchivos(p);
            }
        }
        p.validacion = v;
        p.validando = false;
        pintarEstadoArchivos(p);
        actualizarBoton();
    }

    function tarjetaPreparacion(u) {
        const cuit = String(u.cuit);
        const p = { origen: 'arca', rutas: [], validacion: null, validando: false, turno: 0 };
        p.nodo = el('div', 'il-prep-cliente');
        p.nodo.appendChild(el('div', 'il-prep-nombre', `${nombreDe(u)} (${cuit})`));

        const cajaArchivos = el('div', 'il-prep-archivos');
        const filaOrigen = el('div', 'il-prep-origen');
        [['arca', 'Importar desde ARCA'], ['archivos', 'Mis archivos (los 4 txt)']].forEach(([valor, texto]) => {
            const label = el('label', 'il-check');
            const input = el('input');
            input.type = 'radio';
            input.name = `il-origen-${cuit}`;
            input.value = valor;
            input.checked = valor === p.origen;
            input.addEventListener('change', () => {
                p.origen = valor;
                cajaArchivos.style.display = valor === 'archivos' ? '' : 'none';
                actualizarBoton();
            });
            label.append(input, document.createTextNode(texto));
            filaOrigen.appendChild(label);
        });

        // Se suman a los que ya estaban: los 4 pueden venir de carpetas distintas.
        const btnElegir = el('button', 'ui-btn', 'Agregar archivos…');
        btnElegir.addEventListener('click', async () => {
            const elegidas = await window.electronAPI.importarLibroIva.elegirArchivos();
            const nuevas = (elegidas || []).filter(r => !p.rutas.includes(r));
            if (nuevas.length === 0) return;
            p.rutas = [...p.rutas, ...nuevas];
            p.nuevas = new Set(nuevas);
            validarArchivos(p);
        });
        p.estado = el('div', 'il-prep-estado');
        cajaArchivos.append(btnElegir, p.estado);
        cajaArchivos.style.display = 'none';
        pintarEstadoArchivos(p);

        const datos = el('details', 'il-prep-datos');
        datos.appendChild(el('summary', null, 'Datos Iniciales (se usan solo si ARCA los pide para el período)'));
        p.campos = camposDatosIniciales(datos, {}, false);

        p.nodo.append(filaOrigen, cajaArchivos, datos);
        return p;
    }

    function pintarPreparacion() {
        const elegidos = selector.obtenerSeleccionados();
        prepContenido.innerHTML = '';   // las tarjetas viven en `prep`: solo se sacan de la vista
        elegidos.forEach(u => {
            const cuit = String(u.cuit);
            if (!prep.has(cuit)) prep.set(cuit, tarjetaPreparacion(u));
            prepContenido.appendChild(prep.get(cuit).nodo);
        });
        preparacion.style.display = elegidos.length ? '' : 'none';
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

        if (!archivosListos(seleccionados)) return;

        const contribuyentes = seleccionados.map(u => {
            const c = { id: u.id, cuit: u.cuit, nombre: nombreDe(u) };
            const p = prep.get(String(u.cuit));
            if (p && p.origen === 'archivos') Object.assign(c, { origen: 'archivos', archivos: p.rutas });
            if (p && p.campos.algunaMarcada()) c.datosIniciales = p.campos.leer();
            return c;
        });
        lote.periodo = periodoActual();
        lote.porCuit = new Map(contribuyentes.map(c => [String(c.cuit), c]));
        correr(contribuyentes, lote.periodo, false);
    });

    pintarPreparacion();
};
