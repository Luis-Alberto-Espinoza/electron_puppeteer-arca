// Importar Libro IVA — elegir clientes y período; por cada uno, Portal IVA importa desde ARCA
// el Libro Ventas y el Libro Compras al borrador (no presenta) y baja el Excel de cada libro.
// El backend agrupa por login (representante) y avisa el progreso por onUpdate.
// Preparación (antes del login), por cliente: origen de los comprobantes (ARCA o los txt,
// validados al elegirlos) y Datos Iniciales por si ARCA los pide (así no hace falta otra vuelta).
// Dos casos los decide el usuario desde Resultados (y se reintenta solo ese cliente):
//   - borrador de otro período sin presentar → "Descartar borrador MM/AAAA y reintentar"
//     (o la casilla del formulario, que lo descarta sin preguntar);
//   - Datos Iniciales del período → las mismas opciones que ARCA + Continuar.
// "Abrir Vista Previa": no importa nada; deja el navegador abierto en la Vista Previa de cada cliente.

window.inicializarModuloImportarLibroIva = () => {
    // Errores que se arreglan con la clave (login_arca.js y el resolver de acceso).
    // Adentro de la función: el script se recarga en cada entrada y una const global chocaría.
    const ERRORES_DE_ACCESO = new Set(['INVALID_CREDENTIALS', 'UPDATE_PASSWORD_REQUIRED', 'LOGIN_FAILED', 'SIN_ACCESO']);

    const chkDescartar = document.getElementById('chk-descartar-borrador-il');
    const inpPeriodo  = document.getElementById('il-periodo');
    const contenedor  = inpPeriodo.closest('.il-container');
    const resultados  = document.getElementById('resultadosIl');
    const contenido   = document.getElementById('resultadosContenidoIl');
    const contador    = document.getElementById('contadorIl');
    const preparacion = document.getElementById('preparacionIl');
    const prepContenido = document.getElementById('preparacionContenidoIl');

    let reintentando = false;
    // Lo último que se corrió: el reintento usa ESE período (no el del campo, que pudo cambiar).
    const lote = { periodo: null, porCuit: new Map(), soloVistaPrevia: false };
    const conAvisos = new Set();   // CUIT cargados con renglones rechazados por ARCA (para el "Terminado")

    // Por defecto, el mes anterior (el que se declara).
    const hoy = new Date();
    const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    inpPeriodo.value = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
    // Calendario común en modo período: .value sigue siendo 'AAAA-MM'; en pantalla, mm/aaaa.
    crearCalendario(inpPeriodo, { modo: 'periodo', formato: 'Y-m', ver: 'm/Y', inicial: null });

    // Preparación por CUIT. Sobrevive a sacar y volver a elegir un cliente (no se pierden los archivos).
    const prep = new Map();   // cuit → { origen, rutas, validacion, validando, turno, campos, nodo, ... }
    const periodoActual = () => inpPeriodo.value.replace('-', '');   // 'AAAA-MM' → 'AAAAMM'
    const nombreDe = (u) => u.razonSocial || [u.nombre, u.apellido].filter(Boolean).join(' ');

    // Antes que el selector: su onCambioSeleccion ya habilita el lanzador.
    // Acción 0 (Cargar) queda a la derecha; Vista Previa a su izquierda.
    const RUEDA = { servicio: 'ARCA', subservicio: 'Portal IVA', mensaje: 'Iniciando sesión en AFIP…' };
    const lanzador = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorIl'), {
        acciones: [{
            texto: 'Cargar Libro IVA',
            preparar: prepararCarga,
            confirmar: confirmarCarga,
            rueda: RUEDA,
            ejecutar: correr
        }, {
            // Sin importar nada: entra al período, abre la Vista Previa y deja el navegador abierto.
            texto: 'Abrir Vista Previa',
            tipo: 'secundario',
            ayuda: 'Entra al Libro IVA del período de cada cliente, abre la Vista Previa y deja el navegador abierto para revisarla. No importa, no borra ni descarga nada.',
            preparar: prepararVistaPrevia,
            confirmar: confirmarVistaPrevia,
            rueda: RUEDA,
            ejecutar: correr
        }]
    });

    // `let` + null: el selector puede avisar un cambio mientras se construye.
    let selector = null;
    // Un cliente con "Mis archivos" necesita sus txt validados antes de arrancar (Ventas, Compras o los dos).
    const archivosListos = (lista) => lista.every(u => {
        const p = prep.get(String(u.cuit));
        return !p || p.origen !== 'archivos' || (!p.validando && p.validacion && p.validacion.ok);
    });
    const actualizarBoton = () => {
        const elegidos = selector ? selector.obtenerSeleccionados() : [];
        const hay = !!inpPeriodo.value && elegidos.length > 0;
        lanzador.habilitar(hay && archivosListos(elegidos), 0);
        // La Vista Previa no usa los archivos: no espera a que estén validados.
        lanzador.habilitar(hay, 1);
    };

    selector = new SelectorUsuarios('selector-contribuyentes-il', {
        mostrarTablaSeleccionados: true,
        botonLimpiar: true,
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

        // Tildada de entrada, salvo que ARCA ya traiga alguna operación marcada.
        const ninguna = casilla('No realizo ninguna de estas operaciones', !ops.some(o => o.input.checked));
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

        const botones = el('div', 'il-accion-botones');
        const btn = el('button', 'ui-btn ui-btn--accion il-btn-reintento', 'Continuar');
        // Cancelar: no se carga nada en ARCA; el cliente queda sin procesar (se puede volver a correr).
        const btnCancelar = el('button', 'ui-btn il-btn-reintento', 'Cancelar');
        botones.append(btn, btnCancelar);
        caja.appendChild(botones);
        const habilitar = () => { btn.disabled = !campos.algunaMarcada(); };
        campos.alCambiar(habilitar);
        habilitar();

        btn.addEventListener('click', () => reintentar(datos.cuit, { datosIniciales: campos.leer() }));
        btnCancelar.addEventListener('click', () => caja.replaceWith(el('div', 'il-resultado il-resultado-aviso il-libro',
            `Cancelado: no se cargaron los Datos Iniciales ${legible(info.periodo || lote.periodo)}. El cliente quedó sin procesar.`)));
        return caja;
    }

    // ===== Preparación =====
    // Los 4 lugares fijos (mismas claves que service/validarArchivosIva.js).
    const ARCHIVOS = [
        ['ventasCbte', 'Ventas (comprobantes)'],
        ['ventasAlicuotas', 'Ventas (alícuotas)'],
        ['comprasCbte', 'Compras (comprobantes)'],
        ['comprasAlicuotas', 'Compras (alícuotas)']
    ];

    function quitarArchivo(p, ruta) {
        p.rutas = p.rutas.filter(r => r !== ruta);
        if (p.rutas.length) return validarArchivos(p);
        p.validacion = null;
        pintarEstadoArchivos(p);
        actualizarBoton();
    }

    function renglonArchivo(p, clase, texto, ruta) {
        const li = el('li', clase, texto);
        if (ruta) {
            const quitar = el('button', 'il-prep-quitar', '✕');
            quitar.title = `Sacar ${ruta}`;
            quitar.addEventListener('click', () => quitarArchivo(p, ruta));
            li.appendChild(quitar);
        }
        return li;
    }

    function pintarEstadoArchivos(p) {
        p.estado.innerHTML = '';
        if (p.validando) {
            p.estado.appendChild(el('div', 'il-prep-nota', '⏳ Revisando los archivos…'));
            return;
        }
        const v = (p.rutas.length && p.validacion) || { ok: false, errores: [], detalle: [] };
        const detalle = v.detalle || [];
        // "Falta: …" ya se ve en los lugares vacíos.
        const errores = (v.errores || []).filter(e => !e.startsWith('Falta:'));
        // Libros que se cargan (los que tienen algún archivo). Sin ninguno, cuentan los dos.
        const libros = (v.libros && v.libros.length) ? v.libros : ['ventas', 'compras'];
        const seCarga = (tipo) => libros.some(l => tipo.startsWith(l));
        const faltan = ARCHIVOS.filter(([tipo]) => seCarga(tipo) && !detalle.some(d => d.tipo === tipo)).length;
        // Cosas que ARCA acepta igual: no frenan.
        const avisos = v.avisos || [];

        let titulo;
        if (v.ok) titulo = '✓ Archivos bien: ' + [['ventas', 'Ventas'], ['compras', 'Compras']]
            .map(([l, n]) => v.libros.includes(l) ? `${n} ${v.resumen[l]} comprobante(s)` : `${n} no se carga (sin archivos)`)
            .join('; ');
        else if (errores.length) titulo = '✗ Hay que corregir los archivos antes de arrancar:';
        else titulo = !(v.libros && v.libros.length)
            ? 'Agregá los txt de Ventas y/o de Compras (2 por libro), juntos o de a uno: la app reconoce cuál es cuál.'
            : `Falta(n) ${faltan} archivo(s).`;
        p.estado.appendChild(el('div', v.ok ? 'il-prep-ok' : (errores.length ? 'il-prep-error' : 'il-prep-nota'), titulo));

        // Un renglón por lugar: ✓ cargado, ⚠ cargado con errores de formato, ✗ falta,
        // — el libro no se carga (no tiene ningún archivo).
        // Los no reconocidos van aparte, con su ✕ para sacarlos.
        const lista = el('ul', 'il-prep-lista il-prep-lugares');
        ARCHIVOS.forEach(([tipo, nombre]) => {
            const cargados = detalle.filter(d => d.tipo === tipo);
            if (cargados.length === 0) {
                lista.appendChild(seCarga(tipo)
                    ? renglonArchivo(p, 'il-prep-falta', `✗ ${nombre}: falta`)
                    : renglonArchivo(p, 'il-prep-nota', `— ${nombre}: no se carga (sin archivos)`));
                return;
            }
            cargados.forEach(d => {
                const conError = (v.conError || []).includes(tipo) || cargados.length > 1;
                lista.appendChild(renglonArchivo(p, conError ? 'il-prep-error' : 'il-prep-ok',
                    `${conError ? '⚠' : '✓'} ${nombre}: ${d.nombre} `, d.ruta));
            });
        });
        detalle.filter(d => !d.tipo).forEach(d =>
            lista.appendChild(renglonArchivo(p, 'il-prep-error', `? No reconocido: ${d.nombre} `, d.ruta)));
        p.estado.appendChild(lista);

        if (errores.length) {
            const listaErrores = el('ul', 'il-prep-lista');
            errores.forEach(e => listaErrores.appendChild(el('li', 'il-prep-error', e)));
            p.estado.appendChild(listaErrores);
        }
        if (avisos.length) {
            p.estado.appendChild(el('div', 'il-prep-aviso', v.ok
                ? '⚠ Se puede cargar, pero revisá (ARCA lo acepta y lo ignora sin avisar):'
                : '⚠ Además (ARCA lo acepta y lo ignora sin avisar):'));
            const listaAvisos = el('ul', 'il-prep-lista');
            avisos.forEach(a => listaAvisos.appendChild(el('li', 'il-prep-aviso', a)));
            p.estado.appendChild(listaAvisos);
        }
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
        [['arca', 'Importar desde ARCA'], ['archivos', 'Mis archivos (txt)']].forEach(([valor, texto]) => {
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

        // Se suman a los que ya estaban: pueden venir de carpetas distintas.
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
        // Lo que había en el libro se recupera con "Importar desde ARCA", salvo lo cargado a mano
        // o por archivo: para eso, el respaldo (si no se pide, no se genera).
        const respaldo = casilla('Guardar en Excel lo que había en el libro antes de borrarlo', false);
        respaldo.label.title = 'Lo que vino de ARCA se recupera con "Importar desde ARCA"; lo cargado a mano o por archivo, no.';
        p.respaldo = respaldo.input;
        cajaArchivos.append(btnElegir, p.estado, respaldo.label);
        cajaArchivos.style.display = 'none';
        pintarEstadoArchivos(p);

        const datos = el('details', 'il-prep-datos');
        datos.appendChild(el('summary', null, 'Datos Iniciales (se usan solo si ARCA los pide para el período)'));
        p.campos = camposDatosIniciales(datos, {}, false);

        p.nodo.append(filaOrigen, cajaArchivos, datos);
        return p;
    }

    // Los CUIT que había antes del último cambio: para saber cuál se acaba de elegir.
    let mostrados = new Set();

    function pintarPreparacion() {
        const elegidos = selector.obtenerSeleccionados();
        prepContenido.innerHTML = '';   // las tarjetas viven en `prep`: solo se sacan de la vista
        elegidos.forEach(u => {
            const cuit = String(u.cuit);
            if (!prep.has(cuit)) prep.set(cuit, tarjetaPreparacion(u));
            prepContenido.appendChild(prep.get(cuit).nodo);
        });
        preparacion.style.display = elegidos.length ? '' : 'none';

        // Cliente recién elegido: el foco pasa a su tarjeta (lo próximo que hay que completar).
        // Para sumar otro cliente, se vuelve al buscador.
        const nuevo = elegidos.find(u => !mostrados.has(String(u.cuit)));
        mostrados = new Set(elegidos.map(u => String(u.cuit)));
        if (nuevo) {
            const p = prep.get(String(nuevo.cuit));
            p.nodo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const radio = p.nodo.querySelector('input[type=radio]:checked');
            if (radio) radio.focus({ preventScroll: true });
        }
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

    // Cargado pero con renglones que ARCA no aceptó: ni ✓ ni ✗, aviso.
    const conRechazos = (libro) => !!(libro && libro.success && libro.noImportados > 0);

    function renglonLibro(nombre, libro) {
        if (libro.sinArchivos) {
            return el('div', 'il-resultado il-libro il-resultado-nota',
                `— ${nombre}: sin archivos, no se tocó (en ARCA tiene ${libro.totalLibro} comprobante(s))`);
        }
        const estado = !libro.success ? 'error' : (conRechazos(libro) ? 'aviso' : 'exito');
        const fila = el('div', `il-resultado il-libro il-resultado-${estado}`);
        const importado = libro.origen === 'archivos'
            ? `desde archivos: ${libro.agregados} de ${libro.encontrados} agregados` +
              (libro.noImportados ? `, ${libro.noImportados} con error` : '') +
              (libro.eliminados ? ` (antes se eliminaron los ${libro.eliminados} que había)` : '')
            : `${libro.encontrados} encontrados en ARCA, ${libro.agregados} agregados, ${libro.yaExistentes} ya estaban`;
        const texto = libro.success
            ? importado +
              (libro.totalLibro != null ? ` — el libro tiene ${libro.totalLibro}` : '') +
              (libro.aviso ? ` ⚠ ${libro.aviso}` : '')
            : (libro.message || 'Error');
        const span = el('span', 'il-resultado-texto');
        span.appendChild(el('strong', null, `${{ exito: '✓', aviso: '⚠', error: '✗' }[estado]} ${nombre}`));
        span.appendChild(document.createTextNode(` — ${texto}`));
        fila.appendChild(span);
        // Botones: componente común (componentes/archivoResultado)
        if (libro.rutaRespaldo) {
            // "Excel anterior" = lo que había en el libro antes de "Eliminar todo" (discreto)
            fila.appendChild(window.archivoResultado.crearBotones(libro.rutaRespaldo, {
                etiquetaAbrir: 'Excel anterior', destacado: false, carpeta: false
            }));
        }
        if (libro.rutaExcel) {
            // Sin botón de carpeta: ya está en el renglón del cliente
            fila.appendChild(window.archivoResultado.crearBotones(libro.rutaExcel, {
                etiquetaAbrir: 'Abrir Excel', carpeta: false
            }));
        }
        return fila;
    }

    // Lo que ARCA dijo de cada renglón que no importó ("Procesada (con errores)").
    function erroresArca(libro) {
        if (!libro || !Array.isArray(libro.erroresFilas) || libro.erroresFilas.length === 0) return null;
        const caja = el('div', 'il-errores-arca');
        caja.appendChild(el('div', 'il-errores-arca-titulo',
            `ARCA no aceptó ${libro.noImportados} renglón(es) del txt de comprobantes:`));
        const lista = el('ul', 'il-errores-arca-lista');
        libro.erroresFilas.forEach(e => {
            const li = el('li');
            li.appendChild(el('strong', null, `Renglón ${e.fila}`));
            if (e.filaAlicuota != null) li.appendChild(el('span', 'il-errores-arca-ali', ` · alícuotas renglón ${e.filaAlicuota}`));
            li.appendChild(el('div', null, e.error));
            lista.appendChild(li);
        });
        caja.appendChild(lista);
        if (libro.noImportados > libro.erroresFilas.length) {
            caja.appendChild(el('div', null, `… y ${libro.noImportados - libro.erroresFilas.length} más en el Historial de Importaciones de ARCA.`));
        }
        return caja;
    }

    // ARCA rechazó la importación entera (tarea con error): lo que dijo, en renglones.
    function detalleRechazo(libro) {
        if (!libro || libro.success || !Array.isArray(libro.detalle) || libro.detalle.length === 0) return null;
        const caja = el('div', 'il-errores-arca il-errores-arca--error');
        caja.appendChild(el('div', 'il-errores-arca-titulo', 'Lo que informó ARCA:'));
        const lista = el('ul', 'il-errores-arca-lista');
        libro.detalle.forEach(d => lista.appendChild(el('li', null, d)));
        caja.appendChild(lista);
        return caja;
    }

    function pintarCliente(datos) {
        const bloque = bloqueDe(datos.cuit);
        bloque.innerHTML = '';

        // Cargado, pero ARCA rechazó renglones de algún libro: aviso (no es un éxito limpio).
        const rechazados = [datos.ventas, datos.compras].filter(conRechazos).reduce((n, l) => n + l.noImportados, 0);
        const estado = datos.estado === 'exito' && (rechazados || datos.sinDeclaracion) ? 'aviso' : datos.estado;
        if (estado === 'aviso') conAvisos.add(String(datos.cuit)); else conAvisos.delete(String(datos.cuit));
        const icono = { procesando: '⏳', exito: '✓', aviso: '⚠', error: '✗', cancelado: '⏹' }[estado] || '';
        // Con libros, el detalle va en cada renglón: el del cliente queda corto.
        const conLibros = datos.ventas || datos.compras;
        const texto = conLibros
            ? { exito: 'cargado', aviso: `cargado, con ${rechazados} renglón(es) rechazado(s) por ARCA`, error: 'con errores' }[estado]
            : (datos.mensaje || '');
        const fila = el('div', `il-resultado il-resultado-${estado}`);
        const span = el('span', 'il-resultado-texto');
        span.appendChild(el('strong', null, `${icono} ${datos.nombre || ''} (${datos.cuit})`));
        span.appendChild(document.createTextNode(` — ${texto}`));
        fila.appendChild(span);
        if (datos.downloadDir) {
            // Carpeta del cliente: componente común (componentes/archivoResultado)
            fila.appendChild(window.archivoResultado.crearBotones(null, {
                abrir: false, rutaCarpeta: datos.downloadDir, etiquetaCarpeta: 'Carpeta'
            }));
        }
        bloque.appendChild(fila);

        if (datos.borradorDescartado) {
            bloque.appendChild(el('div', 'il-resultado il-resultado-aviso il-libro',
                `⚠ Se descartó el borrador ${legible(datos.borradorDescartado)} sin presentar: lo cargado en él se perdió.`));
        }
        [['Ventas', datos.ventas], ['Compras', datos.compras]].forEach(([nombre, libro]) => {
            if (!libro) return;
            bloque.appendChild(renglonLibro(nombre, libro));
            const errores = erroresArca(libro) || detalleRechazo(libro);
            if (errores) bloque.appendChild(errores);
        });
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
                window.ruedaTrabajando.recibirAviso(datos);
            }
        } else if (datos.tipo === 'finalizado' && !reintentando) {
            contenido.appendChild(el('div', 'il-resultado il-resultado-fin', lote.soloVistaPrevia
                ? `Terminado: ${datos.exitosos - conAvisos.size} Vista(s) Previa(s) abierta(s)` +
                  (conAvisos.size ? `, ${conAvisos.size} sin declaración iniciada` : '') +
                  `, ${datos.fallidos} con error` + cancelados(datos) + '. El navegador queda abierto: cerralo a mano.'
                : `Terminado: ${datos.exitosos - conAvisos.size} cargado(s)` +
                  (conAvisos.size ? `, ${conAvisos.size} con renglones rechazados` : '') +
                  `, ${datos.fallidos} con error` + cancelados(datos) + '.'));
            irAResultados();
        }
    }

    function cancelados(datos) {
        return datos.cancelados ? `, ${datos.cancelados} cancelado(s)` : '';
    }

    // ipcRenderer.on acumula listeners: se registra UNA vez y se redirige a la vista actual.
    window.__ilOnUpdate = onUpdate;
    if (!window.__ilListenerRegistrado) {
        window.electronAPI.importarLibroIva.onUpdate((datos) => window.__ilOnUpdate && window.__ilOnUpdate(datos));
        window.__ilListenerRegistrado = true;
    }

    // ===== Procesar (componentes/lanzadorAutomatizacion: switch, Cargar / Vista Previa ↔ ⏹ Cancelar) =====
    // datos = { contribuyentes, soloVistaPrevia, reintento }
    // reintento = un solo cliente desde Resultados: no limpia la lista ni toca el contador.
    async function correr({ contribuyentes, soloVistaPrevia, reintento }, { visible }) {
        if (!reintento) {
            lote.periodo = periodoActual();
            lote.porCuit = new Map(contribuyentes.map(c => [String(c.cuit), c]));
            lote.soloVistaPrevia = soloVistaPrevia;
        }
        reintentando = !!reintento;
        contenedor.classList.add('il-ocupado');
        if (!reintento) {
            contenido.innerHTML = '';
            contador.textContent = '';
            conAvisos.clear();
            resultados.style.display = 'block';
            contenido.appendChild(el('div', 'il-resultado il-resultado-procesando il-inicio',
                soloVistaPrevia
                    ? `⏳ Abriendo la Vista Previa de ${contribuyentes.length} cliente(s)... (no se importa nada)`
                    : `⏳ Iniciando ${contribuyentes.length} cliente(s)... (puede tardar: ARCA procesa cada importación)`));
            irAResultados();
        }

        try {
            const r = await window.electronAPI.importarLibroIva.procesar({
                contribuyentes,
                periodo: lote.periodo,
                visible,
                // En el reintento manda lo que el usuario eligió para ESE cliente, no la casilla.
                descartarBorrador: !reintento && chkDescartar.checked,
                soloVistaPrevia
            });
            if (!r || !r.success) {
                contenido.appendChild(el('div', 'il-resultado il-resultado-error', (r && r.message) || 'Error desconocido'));
            }
        } catch (e) {
            contenido.appendChild(el('div', 'il-resultado il-resultado-error', e.message));
        } finally {
            reintentando = false;
            contenedor.classList.remove('il-ocupado');
            actualizarBoton();
        }
    }

    function reintentar(cuit, respuesta) {
        const c = lote.porCuit.get(String(cuit));
        if (lanzador.enCurso() || !c || !lote.periodo) return;
        lanzador.lanzar(lote.soloVistaPrevia ? 1 : 0, {
            contribuyentes: [{ ...c, ...respuesta }], soloVistaPrevia: lote.soloVistaPrevia, reintento: true
        });
    }

    // Mensaje del modal de confirmación: período, clientes y lo que se BORRA en ARCA.
    function textoPeriodo(periodo) {
        return `${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`;
    }
    function avisoDescartar() {
        return chkDescartar.checked
            ? '\n\n🗑️ Si hay un borrador de OTRO período sin presentar, se DESCARTA (se pierde lo cargado en él).'
            : '';
    }

    function prepararCarga() {
        const seleccionados = selector.obtenerSeleccionados();
        if (seleccionados.length === 0 || !inpPeriodo.value || !archivosListos(seleccionados)) return null;
        const contribuyentes = seleccionados.map(u => {
            const c = { id: u.id, cuit: u.cuit, nombre: nombreDe(u) };
            const p = prep.get(String(u.cuit));
            if (p && p.origen === 'archivos') Object.assign(c, { origen: 'archivos', archivos: p.rutas, respaldo: p.respaldo.checked });
            if (p && p.campos.algunaMarcada()) c.datosIniciales = p.campos.leer();
            return c;
        });
        return { contribuyentes, soloVistaPrevia: false };
    }

    function confirmarCarga({ contribuyentes }) {
        const conArchivos = contribuyentes.filter(c => c.origen === 'archivos');
        return {
            title: 'Portal IVA',
            message: `Período: ${textoPeriodo(periodoActual())}\n\nSe va a cargar el Libro IVA de ${contribuyentes.length} cliente(s):\n\n - `
                + contribuyentes.map(c => `${c.nombre} (${c.cuit}): ${c.origen === 'archivos'
                    ? `Mis archivos (${c.archivos.length} txt)${c.respaldo ? ', con respaldo en Excel' : ''}`
                    : 'desde ARCA'}`).join('\n - ')
                + (conArchivos.length ? '\n\n🗑️ ATENCIÓN: con "Mis archivos" se BORRA todo lo que haya en el libro de ARCA y se cargan los txt.' : '')
                + avisoDescartar()
                + '\n\nNo se presenta nada: queda en borrador.',
            confirmBtnClass: (conArchivos.length || chkDescartar.checked) ? 'danger' : 'tono'
        };
    }

    // Solo los datos para entrar al período (Datos Iniciales por si ARCA los pide): no se importa.
    function prepararVistaPrevia() {
        const seleccionados = selector.obtenerSeleccionados();
        if (seleccionados.length === 0 || !inpPeriodo.value) return null;
        const contribuyentes = seleccionados.map(u => {
            const c = { id: u.id, cuit: u.cuit, nombre: nombreDe(u) };
            const p = prep.get(String(u.cuit));
            if (p && p.campos.algunaMarcada()) c.datosIniciales = p.campos.leer();
            return c;
        });
        return { contribuyentes, soloVistaPrevia: true };
    }

    function confirmarVistaPrevia({ contribuyentes }) {
        return {
            title: 'Portal IVA · Vista Previa',
            message: `Período: ${textoPeriodo(periodoActual())}\n\nSe va a abrir la Vista Previa de ${contribuyentes.length} cliente(s):\n\n - `
                + contribuyentes.map(c => `${c.nombre} (${c.cuit})`).join('\n - ')
                + '\n\nNo importa, no borra ni descarga nada. El navegador queda abierto.'
                + avisoDescartar(),
            confirmBtnClass: chkDescartar.checked ? 'danger' : 'tono'
        };
    }

    pintarPreparacion();
};
