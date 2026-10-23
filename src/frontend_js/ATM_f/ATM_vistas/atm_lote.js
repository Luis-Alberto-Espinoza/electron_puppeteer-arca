window.inicializarModuloLoteATM = () => {
    console.log('Inicializando módulo de procesamiento por lote ATM...');

    // =========================================================================
    // CONFIGURACIÓN DE SUBSERVICIOS
    // =========================================================================
    const CONFIG_SUB = {
        constancias: {
            label:         'Constancias',
            tienePeriodo:  false,
            ejecutar:      (clientes, { visible }) => window.electronAPI.atm.constanciaFiscal.generarLote({ usuarios: clientes, visible })
        },
        planesPago: {
            label:         'Planes de Pago',
            tienePeriodo:  false,
            ejecutar:      (clientes, { visible }) => window.electronAPI.atm.planDePago.generarLote({ usuarios: clientes, visible })
        },
        tasaCero: {
            label:         'Tasa Cero',
            tienePeriodo:  true,
            periodoDefault: 'current',   // índice 0 → mes actual
            ejecutar:      (clientes, { visible }) => window.electronAPI.atm.tasaCero.generarLote({ clientes, visible })
        },
        retenciones: {
            label:         'Retenciones',
            tienePeriodo:  true,
            rangoPeriodo:  true,         // permite descargar un rango de meses de una sola pasada
            periodoDefault: 'previous',  // índice 1 → mes anterior
            ejecutar:      (clientes, { visible }) => window.electronAPI.atm.retenciones.generarLote({ usuarios: clientes, visible })
        },
        apremios: {
            label:         'Apremios',
            tienePeriodo:  false,
            impuestosPorCliente: true,   // cada cliente elige sus impuestos (panel-apremios)
            ejecutar:      (clientes, { visible }) => window.electronAPI.atm.apremios.generarLote({ clientes, visible })
        }
    };

    // Botones de "Consulta de Apremios" en ATM. Mismos ids que el backend (atm/apremios/tablaApremios.js).
    const IMPUESTOS_APREMIOS = [
        { id: 'automotor',      label: 'Automotor' },
        { id: 'inmueble',       label: 'Inmueble' },
        { id: 'ingresosBrutos', label: 'Ingresos Brutos' },
        { id: 'multas',         label: 'Multas' },
        { id: 'agentes',        label: 'Agentes' }
    ];

    // =========================================================================
    // ESTADO
    // =========================================================================
    let subservicioActivo = null;
    let selectorUsuarios  = null;
    // Apremios: id de cliente → Set de impuestos elegidos (un cliente nuevo arranca sin ninguno).
    const impuestosPorCliente = new Map();

    // =========================================================================
    // ELEMENTOS DOM
    // =========================================================================
    const panelConfiguracion  = document.getElementById('panel-configuracion');
    const panelPeriodo        = document.getElementById('panel-periodo');
    const selectPeriodo       = document.getElementById('selectPeriodoGlobal'); // "desde"
    const selectPeriodoHasta  = document.getElementById('selectPeriodoHasta');
    const labelPeriodoDesde   = document.getElementById('labelPeriodoDesde');
    const labelPeriodoHasta   = document.getElementById('labelPeriodoHasta');
    const periodoResumen      = document.getElementById('periodoResumen');
    const selectLista         = document.getElementById('selectLista');
    const btnNuevaLista       = document.getElementById('btnNuevaLista');
    const btnRenombrarLista   = document.getElementById('btnRenombrarLista');
    const btnEliminarLista    = document.getElementById('btnEliminarLista');
    const panelNombreLista    = document.getElementById('panel-nombre-lista');
    const inputNombreLista    = document.getElementById('inputNombreLista');
    const btnConfirmarNombre  = document.getElementById('btnConfirmarNombre');
    const btnCancelarNombre   = document.getElementById('btnCancelarNombre');
    const textareaNombres     = document.getElementById('textareaNombres');
    const btnBuscar           = document.getElementById('btnBuscarSeleccionar');
    const btnGuardar          = document.getElementById('btnGuardarLista');
    const btnLimpiar          = document.getElementById('btnLimpiarSeleccion');
    const btnProcesar         = document.getElementById('btnProcesar');
    const chkVisible          = document.getElementById('chk-visible-lote');
    const matchResultado      = document.getElementById('match-resultado');
    const procesandoContainer = document.getElementById('lote-procesando-ahora');
    const finalizadosContainer= document.getElementById('lote-finalizados-container');
    const finalizadosDiv      = document.getElementById('lote-finalizados');
    const panelApremios       = document.getElementById('panel-apremios');
    const tablaApremios       = document.getElementById('tabla-apremios');
    const apremiosSinClientes = document.getElementById('apremios-sin-clientes');

    // Ocultar paneles de resultados al iniciar
    procesandoContainer.style.display  = 'none';
    finalizadosContainer.style.display = 'none';

    // Lanzador de sesión ATM (abrir navegador logueado para operar a mano)
    const btnLanzadorAtm = document.getElementById('btnLanzadorAtm');
    if (btnLanzadorAtm) {
        btnLanzadorAtm.addEventListener('click', () => {
            if (window.abrirLanzadorSesion) {
                window.abrirLanzadorSesion('atm');
            } else {
                console.error('window.abrirLanzadorSesion no está disponible');
            }
        });
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function normalizar(texto) {
        return String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function generarOpcionesPeriodo() {
        const hoy        = new Date();
        const mesActual  = hoy.getMonth();
        const anioActual = hoy.getFullYear();
        const opciones   = [];

        for (let i = 0; i < 24; i++) {
            let mes  = mesActual - i;
            let anio = anioActual;
            while (mes < 0) { mes += 12; anio -= 1; }
            const mesStr = (mes + 1).toString().padStart(2, '0');
            opciones.push(`${mesStr}/${anio}`);
        }
        return opciones;
    }

    // Convierte "04/2026" → "2026-04" (formato que espera el backend)
    function periodoParaBackend(periodoMMYYYY) {
        const [mes, anio] = periodoMMYYYY.split('/');
        return `${anio}-${mes}`;
    }

    // Las opciones van del mes más nuevo (índice 0) al más viejo (índice 23),
    // así que el "desde" siempre tiene un índice mayor o igual que el "hasta".
    function expandirRangoPeriodos() {
        const idxDesde = selectPeriodo.selectedIndex;
        const idxHasta = selectPeriodoHasta.selectedIndex;

        if (idxDesde < 0 || idxHasta < 0 || idxDesde < idxHasta) return [];

        const periodos = [];
        for (let i = idxDesde; i >= idxHasta; i--) {
            periodos.push(periodoParaBackend(selectPeriodo.options[i].value));
        }
        return periodos; // del más viejo al más nuevo
    }

    // Si el usuario deja el rango al revés, lo emparejamos en vez de bloquearlo.
    function corregirRango(origen) {
        if (selectPeriodo.selectedIndex >= selectPeriodoHasta.selectedIndex) return;

        if (origen === 'desde') {
            selectPeriodoHasta.selectedIndex = selectPeriodo.selectedIndex;
        } else {
            selectPeriodo.selectedIndex = selectPeriodoHasta.selectedIndex;
        }
    }

    function actualizarResumenPeriodo() {
        if (!periodoResumen) return;

        const config = subservicioActivo ? CONFIG_SUB[subservicioActivo] : null;

        if (!config || !config.tienePeriodo) {
            periodoResumen.textContent = '';
            return;
        }

        if (!config.rangoPeriodo) {
            periodoResumen.textContent = `Periodo: ${selectPeriodo.value}`;
            periodoResumen.classList.remove('periodo-error');
            return;
        }

        const periodos = expandirRangoPeriodos();

        if (periodos.length === 0) {
            periodoResumen.textContent = 'El periodo "desde" no puede ser posterior al "hasta".';
            periodoResumen.classList.add('periodo-error');
            return;
        }

        periodoResumen.classList.remove('periodo-error');
        periodoResumen.textContent = periodos.length === 1
            ? `1 periodo: ${selectPeriodo.value}`
            : `${periodos.length} periodos: ${selectPeriodo.value} a ${selectPeriodoHasta.value}`;
    }

    selectPeriodo.addEventListener('change', () => {
        corregirRango('desde');
        actualizarResumenPeriodo();
    });

    selectPeriodoHasta.addEventListener('change', () => {
        corregirRango('hasta');
        actualizarResumenPeriodo();
    });

    // =========================================================================
    // INICIALIZAR SELECTOR DE USUARIOS (se crea una sola vez)
    // =========================================================================
    if (typeof SelectorUsuarios === 'undefined') {
        console.error('SelectorUsuarios no está definido. Reintentando...');
        setTimeout(window.inicializarModuloLoteATM, 100);
        return;
    }

    selectorUsuarios = new SelectorUsuarios('selector-usuarios-atm', {
        // Modelo plano: el backend ya computó puedeOperar para 'atm' (clave ATM
        // propia validada). Los que no pueden operar no se listan; ya no usamos
        // campoCredencial/campoEstado del objeto gordo.
        fuente: 'contribuyentes',
        servicio: 'atm',
        // Lote: elegibles los de clave sin validar, NO los de clave incorrecta
        // (filtro de habilitados + botón "Clave"; ver actualizarClave.js)
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('atm', () => selectorUsuarios, { lote: true }) : {}),
        renderizarColumnasExtras: (usuario) => {
            const operable = usuario.puedeOperar !== false;
            const badge = operable ? '✅ Operable' : (usuario.motivoNoOpera || 'No operable');
            const cssClass = operable ? 'badge-validado' : 'badge-invalido';
            return `<td class="estado-cell"><span class="badge ${cssClass}">${badge}</span></td>`;
        },
        headersColumnasExtras: ['Estado'],
        onCambioSeleccion: (seleccionados) => {
            renderizarPanelApremios(seleccionados);
            btnProcesar.disabled = seleccionados.length === 0;
            btnProcesar.textContent = subservicioActivo
                ? `▶ Procesar ${CONFIG_SUB[subservicioActivo].label} (${seleccionados.length})`
                : '▶ Procesar';
        }
    });

    // =========================================================================
    // PASO 1: SELECCIÓN DE SUBSERVICIO
    // =========================================================================
    document.querySelectorAll('.btn-sub').forEach(btn => {
        btn.addEventListener('click', () => activarSubservicio(btn.dataset.sub));
    });

    function activarSubservicio(sub) {
        subservicioActivo = sub;

        // Resaltar botón activo
        document.querySelectorAll('.btn-sub').forEach(b => {
            b.classList.toggle('btn-sub-activo', b.dataset.sub === sub);
        });

        // Mostrar panel
        panelConfiguracion.style.display = 'block';

        // Limpiar estado anterior al cambiar de subservicio
        textareaNombres.value = '';
        matchResultado.style.display = 'none';
        selectorUsuarios.limpiarSeleccion();
        cerrarPanelNombre();

        // Mostrar/ocultar periodo
        const config = CONFIG_SUB[sub];
        panelPeriodo.style.display = config.tienePeriodo ? 'block' : 'none';
        panelApremios.style.display = config.impuestosPorCliente ? 'block' : 'none';
        impuestosPorCliente.clear();
        renderizarPanelApremios([]);

        // Switch visible/oculto: vuelve a "visible" al cambiar de subservicio
        // (no se guarda preferencia).
        chkVisible.checked = true;

        // Poblar periodo si aún no fue poblado
        if (config.tienePeriodo) {
            if (selectPeriodo.options.length === 0) {
                generarOpcionesPeriodo().forEach(p => {
                    [selectPeriodo, selectPeriodoHasta].forEach(select => {
                        const opt = document.createElement('option');
                        opt.value = p;
                        opt.textContent = p;
                        select.appendChild(opt);
                    });
                });
            }

            // El "hasta" solo tiene sentido en los subservicios que aceptan rango
            const mostrarHasta = !!config.rangoPeriodo;
            labelPeriodoDesde.style.display  = mostrarHasta ? '' : 'none';
            labelPeriodoHasta.style.display  = mostrarHasta ? '' : 'none';
            selectPeriodoHasta.style.display = mostrarHasta ? '' : 'none';

            // Por defecto, desde y hasta apuntan al mismo mes: un solo periodo,
            // igual que antes. El rango es opcional.
            const indiceDefault = config.periodoDefault === 'previous' ? 1 : 0;
            selectPeriodo.selectedIndex      = indiceDefault;
            selectPeriodoHasta.selectedIndex = indiceDefault;

            actualizarResumenPeriodo();
        }

        // Cargar listas guardadas del subservicio
        cargarListas(sub);

        // Actualizar botón procesar
        btnProcesar.disabled = true;
        btnProcesar.textContent = `▶ Procesar ${config.label}`;

        console.log(`Subservicio activo: ${sub}`);
    }

    // =========================================================================
    // GESTIÓN DE LISTAS
    // =========================================================================

    async function cargarListas(sub) {
        const resultado = await window.electronAPI.atm.listas.get(sub);
        if (!resultado.exito) return;

        const listas = resultado.listas;
        selectLista.innerHTML = '<option value="">-- Sin lista guardada --</option>';
        listas.forEach(lista => {
            const opt = document.createElement('option');
            opt.value = lista.nombre;
            opt.textContent = lista.nombre;
            selectLista.appendChild(opt);
        });
    }

    // Al cambiar la lista seleccionada → cargar su contenido
    selectLista.addEventListener('change', async () => {
        const nombreLista = selectLista.value;
        if (!nombreLista || !subservicioActivo) return;

        const resultado = await window.electronAPI.atm.listas.get(subservicioActivo);
        if (!resultado.exito) return;

        const lista = resultado.listas.find(l => l.nombre === nombreLista);
        if (!lista) return;

        // Pre-rellenar textarea
        textareaNombres.value = lista.texto || '';

        // Seleccionar clientes por ID guardado
        selectorUsuarios.limpiarSeleccion();
        if (Array.isArray(lista.clienteIds) && lista.clienteIds.length > 0) {
            const noEncontrados = [];
            const noHabilitados = [];
            lista.clienteIds.forEach(id => {
                const cliente = selectorUsuarios.todosLosUsuarios.find(u => String(u.id) === String(id));
                if (cliente) {
                    selectorUsuarios.toggleSeleccion(id);
                    // El selector no deja elegir a los que no pueden operar (ej. clave incorrecta).
                    const quedo = selectorUsuarios.obtenerSeleccionados().some(u => String(u.id) === String(id));
                    if (!quedo) noHabilitados.push(`${cliente.nombre || cliente.cuit}: ${cliente.motivoNoOpera || 'no habilitado'}`);
                } else {
                    noEncontrados.push(id);
                }
            });
            const avisos = [...noHabilitados];
            if (noEncontrados.length > 0) {
                avisos.push(`${noEncontrados.length} cliente(s) guardado(s) ya no existen en la base de datos`);
            }
            if (avisos.length > 0) mostrarMatchResultado([], avisos);
        }
    });

    // -------------------------------------------------------------------------
    // Panel inline para ingresar nombre (nueva lista o renombrar)
    // -------------------------------------------------------------------------
    let modoNombre = null; // 'nueva' | 'renombrar'

    function abrirPanelNombre(modo, valorInicial = '') {
        modoNombre = modo;
        inputNombreLista.value = valorInicial;
        panelNombreLista.style.display = 'block';
        inputNombreLista.focus();
        inputNombreLista.select();
    }

    function cerrarPanelNombre() {
        panelNombreLista.style.display = 'none';
        inputNombreLista.value = '';
        modoNombre = null;
    }

    btnCancelarNombre.addEventListener('click', cerrarPanelNombre);

    inputNombreLista.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  btnConfirmarNombre.click();
        if (e.key === 'Escape') cerrarPanelNombre();
    });

    btnConfirmarNombre.addEventListener('click', async () => {
        const nombre = inputNombreLista.value.trim();
        if (!nombre) { inputNombreLista.focus(); return; }

        if (modoNombre === 'nueva') {
            const yaExiste = Array.from(selectLista.options).some(o => o.value === nombre);
            if (yaExiste) {
                inputNombreLista.classList.add('input-error');
                inputNombreLista.title = `Ya existe una lista llamada "${nombre}"`;
                setTimeout(() => inputNombreLista.classList.remove('input-error'), 1500);
                return;
            }
            // Agregar al select y seleccionarla (se guarda cuando el usuario presione "Guardar lista")
            const opt = document.createElement('option');
            opt.value = nombre;
            opt.textContent = nombre;
            selectLista.appendChild(opt);
            selectLista.value = nombre;
            textareaNombres.value = '';
            selectorUsuarios.limpiarSeleccion();
            cerrarPanelNombre();
        }

        if (modoNombre === 'renombrar') {
            const nombreActual = selectLista.value;
            if (nombre === nombreActual) { cerrarPanelNombre(); return; }

            const resultado = await window.electronAPI.atm.listas.renombrar({
                subservicio:  subservicioActivo,
                nombreActual: nombreActual,
                nombreNuevo:  nombre
            });

            if (!resultado.exito) {
                inputNombreLista.classList.add('input-error');
                inputNombreLista.title = resultado.error;
                setTimeout(() => inputNombreLista.classList.remove('input-error'), 1500);
                return;
            }

            const opt = Array.from(selectLista.options).find(o => o.value === nombreActual);
            if (opt) { opt.value = nombre; opt.textContent = nombre; }
            selectLista.value = nombre;
            cerrarPanelNombre();
        }
    });

    // Nueva lista
    btnNuevaLista.addEventListener('click', () => {
        abrirPanelNombre('nueva');
    });

    // Renombrar lista
    btnRenombrarLista.addEventListener('click', () => {
        const nombreActual = selectLista.value;
        if (!nombreActual) {
            // Resaltar el select para indicar que hay que elegir primero
            selectLista.classList.add('input-error');
            setTimeout(() => selectLista.classList.remove('input-error'), 1500);
            return;
        }
        abrirPanelNombre('renombrar', nombreActual);
    });

    // Eliminar lista
    btnEliminarLista.addEventListener('click', async () => {
        const nombre = selectLista.value;
        if (!nombre) { alert('Seleccione una lista para eliminar.'); return; }

        if (!confirm(`¿Eliminar la lista "${nombre}"? Esta acción no se puede deshacer.`)) return;

        const resultado = await window.electronAPI.atm.listas.eliminar({
            subservicio: subservicioActivo,
            nombre:      nombre
        });

        if (!resultado.exito) {
            alert(`Error: ${resultado.error}`);
            return;
        }

        await cargarListas(subservicioActivo);
        textareaNombres.value = '';
        selectorUsuarios.limpiarSeleccion();
    });

    // Guardar lista
    btnGuardar.addEventListener('click', async () => {
        const nombre = selectLista.value;
        if (!nombre) {
            alert('Seleccione o cree una lista antes de guardar.');
            return;
        }

        const texto      = textareaNombres.value;
        const clienteIds = selectorUsuarios.obtenerSeleccionados().map(u => u.id);

        const resultado = await window.electronAPI.atm.listas.guardar({
            subservicio: subservicioActivo,
            nombre,
            texto,
            clienteIds
        });

        if (resultado.exito) {
            mostrarMensajeGuardado();
            await cargarListas(subservicioActivo);
            selectLista.value = nombre;
        } else {
            alert(`Error al guardar: ${resultado.error}`);
        }
    });

    function mostrarMensajeGuardado() {
        btnGuardar.textContent = '✅ Guardado';
        btnGuardar.disabled = true;
        setTimeout(() => {
            btnGuardar.textContent = 'Guardar lista';
            btnGuardar.disabled = false;
        }, 2000);
    }

    // =========================================================================
    // BÚSQUEDA Y MATCH DE CLIENTES
    // =========================================================================

    btnBuscar.addEventListener('click', () => {
        const texto = textareaNombres.value.trim();
        if (!texto) { alert('Escriba al menos un nombre para buscar.'); return; }

        const terminos = texto.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        const todos    = selectorUsuarios.todosLosUsuarios;

        selectorUsuarios.limpiarSeleccion();
        matchResultado.style.display = 'none';

        const noEncontrados = [];
        const noHabilitados = [];

        terminos.forEach(termino => {
            const terminoNorm = normalizar(termino);
            const matches = todos.filter(u => {
                const nombreCompleto = normalizar(`${u.nombre || ''} ${u.apellido || ''}`.trim());
                const razonSocial    = normalizar(u.razonSocial || '');
                return nombreCompleto.includes(terminoNorm) || razonSocial.includes(terminoNorm);
            });

            if (matches.length === 0) {
                noEncontrados.push(termino);
            } else {
                matches.forEach(u => {
                    const estaElegido = () => selectorUsuarios.obtenerSeleccionados().some(s => String(s.id) === String(u.id));
                    if (!estaElegido()) selectorUsuarios.toggleSeleccion(u.id);
                    // El selector no deja elegir a los que no pueden operar: avisarlo en vez de callarlo.
                    if (!estaElegido()) noHabilitados.push(`${u.nombre || u.cuit}: ${u.motivoNoOpera || 'no habilitado'}`);
                });
            }
        });

        const seleccionados = selectorUsuarios.obtenerSeleccionados();
        mostrarMatchResultado(seleccionados, [
            ...noEncontrados.map(t => `"${t}" — sin coincidencias`),
            ...noHabilitados
        ]);
    });

    function mostrarMatchResultado(seleccionados, advertencias) {
        matchResultado.style.display = 'block';
        let html = '';

        if (seleccionados.length > 0) {
            html += `<div class="match-ok">✅ ${seleccionados.length} cliente(s) seleccionado(s)</div>`;
        }
        if (advertencias.length > 0) {
            html += advertencias.map(a => `<div class="match-warn">⚠️ ${a}</div>`).join('');
        }

        matchResultado.innerHTML = html;
    }

    // =========================================================================
    // APREMIOS: IMPUESTOS POR CLIENTE
    // =========================================================================

    function impuestosDe(id) {
        const clave = String(id);
        if (!impuestosPorCliente.has(clave)) {
            impuestosPorCliente.set(clave, new Set());
        }
        return impuestosPorCliente.get(clave);
    }

    // Una fila por cliente seleccionado: "Todos" (los 5 de ese cliente) + un checkbox por
    // impuesto. La fila de arriba marca/desmarca la columna entera para todos los clientes.
    function renderizarPanelApremios(seleccionados) {
        if (!subservicioActivo || !CONFIG_SUB[subservicioActivo].impuestosPorCliente) return;

        apremiosSinClientes.style.display = seleccionados.length ? 'none' : 'block';
        tablaApremios.style.display = seleccionados.length ? 'table' : 'none';
        if (!seleccionados.length) return;

        const todosMarcados = (impId) => seleccionados.every(c => impuestosDe(c.id).has(impId));
        const filaCompleta = (id) => impuestosDe(id).size === IMPUESTOS_APREMIOS.length;
        const marcado = (v) => v ? 'checked' : '';
        tablaApremios.querySelector('thead').innerHTML = `
            <tr><th>Cliente</th><th>Todos</th>${IMPUESTOS_APREMIOS.map(i => `<th>${i.label}</th>`).join('')}</tr>
            <tr class="fila-todos"><td>Todos los clientes</td>
                <td><input type="checkbox" data-todo="1" ${marcado(seleccionados.every(c => filaCompleta(c.id)))}></td>
                ${IMPUESTOS_APREMIOS.map(i => `<td><input type="checkbox" data-columna="${i.id}" ${marcado(todosMarcados(i.id))}></td>`).join('')}</tr>`;

        const tbody = tablaApremios.querySelector('tbody');
        tbody.innerHTML = '';
        seleccionados.forEach(c => {
            const elegidos = impuestosDe(c.id);
            const tr = document.createElement('tr');
            const celdaNombre = document.createElement('td');
            celdaNombre.textContent = `${c.nombre || ''} ${c.apellido || ''}`.trim() || c.cuit;
            tr.appendChild(celdaNombre);
            const celdaTodos = document.createElement('td');
            celdaTodos.className = 'celda-todos';
            celdaTodos.innerHTML = `<input type="checkbox" data-fila="${c.id}" ${marcado(filaCompleta(c.id))}>`;
            tr.appendChild(celdaTodos);
            IMPUESTOS_APREMIOS.forEach(i => {
                const td = document.createElement('td');
                td.innerHTML = `<input type="checkbox" data-cliente="${c.id}" data-impuesto="${i.id}" ${elegidos.has(i.id) ? 'checked' : ''}>`;
                tr.appendChild(td);
            });
            if (elegidos.size === 0) tr.classList.add('fila-sin-impuestos');
            tbody.appendChild(tr);
        });
    }

    tablaApremios.addEventListener('change', (e) => {
        const chk = e.target;
        const llenar = (set) => chk.checked ? IMPUESTOS_APREMIOS.forEach(i => set.add(i.id)) : set.clear();
        if (chk.dataset.todo) {
            selectorUsuarios.obtenerSeleccionados().forEach(c => llenar(impuestosDe(c.id)));
        } else if (chk.dataset.fila) {
            llenar(impuestosDe(chk.dataset.fila));
        } else if (chk.dataset.columna) {
            selectorUsuarios.obtenerSeleccionados().forEach(c => {
                const set = impuestosDe(c.id);
                chk.checked ? set.add(chk.dataset.columna) : set.delete(chk.dataset.columna);
            });
        } else if (chk.dataset.cliente) {
            const set = impuestosDe(chk.dataset.cliente);
            chk.checked ? set.add(chk.dataset.impuesto) : set.delete(chk.dataset.impuesto);
        }
        renderizarPanelApremios(selectorUsuarios.obtenerSeleccionados());
    });

    // =========================================================================
    // LIMPIAR SELECCIÓN
    // =========================================================================
    btnLimpiar.addEventListener('click', () => {
        selectorUsuarios.limpiarSeleccion();
        matchResultado.style.display = 'none';
    });

    // =========================================================================
    // PROCESAR
    // =========================================================================
    btnProcesar.addEventListener('click', async () => {
        if (!subservicioActivo) { alert('Seleccione un subservicio primero.'); return; }

        const clientes = selectorUsuarios.obtenerSeleccionados();
        if (clientes.length === 0) { alert('No hay clientes seleccionados.'); return; }

        const config = CONFIG_SUB[subservicioActivo];

        // Agregar periodo(s) si corresponde
        let textoPeriodos = '';

        if (config.tienePeriodo) {
            const periodoSeleccionado = selectPeriodo.value;
            if (!periodoSeleccionado) { alert('Seleccione un periodo.'); return; }

            if (config.rangoPeriodo) {
                const periodos = expandirRangoPeriodos();
                if (periodos.length === 0) {
                    alert('El periodo "desde" no puede ser posterior al "hasta".');
                    return;
                }
                // periodo (singular) se manda igual por compatibilidad con el backend viejo
                clientes.forEach(c => { c.periodos = periodos; c.periodo = periodos[0]; });
                textoPeriodos = periodos.length === 1
                    ? `\n\nPeriodo: ${selectPeriodo.value}`
                    : `\n\nPeriodos: ${selectPeriodo.value} a ${selectPeriodoHasta.value} (${periodos.length} meses por cliente)`;
            } else {
                const periodoBackend = periodoParaBackend(periodoSeleccionado);
                clientes.forEach(c => { c.periodo = periodoBackend; });
                textoPeriodos = `\n\nPeriodo: ${periodoSeleccionado}`;
            }
        }

        if (config.impuestosPorCliente) {
            const sinImpuestos = [];
            clientes.forEach(c => {
                c.impuestos = IMPUESTOS_APREMIOS.map(i => i.id).filter(id => impuestosDe(c.id).has(id));
                if (c.impuestos.length === 0) sinImpuestos.push(`${c.nombre || ''} ${c.apellido || ''}`.trim() || c.cuit);
            });
            if (sinImpuestos.length > 0) {
                alert(`Estos clientes no tienen ningún impuesto marcado:\n\n - ${sinImpuestos.join('\n - ')}`);
                return;
            }
        }

        const etiquetaImpuestos = (c) => c.impuestos
            ? ` (${c.impuestos.map(id => IMPUESTOS_APREMIOS.find(i => i.id === id).label).join(', ')})`
            : '';
        const nombresClientes = clientes.map(c => `${c.nombre || ''} ${c.apellido || ''}`.trim() + etiquetaImpuestos(c)).join('\n - ');
        const confirmacion = await showConfirmModal({
            title: config.label,
            icon: '🚀',
            message: `Se iniciará el proceso para ${clientes.length} cliente(s):\n\n - ${nombresClientes}${textoPeriodos}\n\n¿Desea continuar?`,
            confirmText: 'Iniciar',
            confirmBtnClass: 'tono'
        });
        if (!confirmacion) return;

        prepararUIParaProceso();
        window.ruedaTrabajando?.mostrar({
            servicio: 'ATM', subservicio: config.label, mensaje: 'Iniciando sesión en ATM…'
        });

        try {
            await config.ejecutar(clientes, { visible: chkVisible.checked });
        } catch (error) {
            procesandoContainer.innerHTML = `<div class="progreso-item status-error">Error de comunicación: ${error.message}</div>`;
        } finally {
            // El invoke vuelve cuando terminó el lote entero (o falló): la rueda se va siempre.
            window.ruedaTrabajando?.ocultar();
        }
    });

    function prepararUIParaProceso() {
        procesandoContainer.innerHTML = '<h3>Procesando Usuario Actual:</h3>';
        finalizadosDiv.innerHTML      = '';
        // Tarjetas nuevas en cada corrida: si no, se reusa la del cliente de la corrida
        // anterior con sus archivos viejos (y parecen bajados ahora).
        userDivMap.clear();
        procesandoContainer.style.display  = 'block';
        finalizadosContainer.style.display = 'none';
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
    }

    // =========================================================================
    // MANEJO DE PROGRESO (compartido por todos los subservicios)
    // =========================================================================
    const userDivMap = new Map();

    // Los 5 subservicios mandan el aviso con el contrato de la rueda (backend/comun/avisoProgreso.js):
    // { tipo, id, cuit, nombre, estado, mensaje, procesados, total, ...files/downloadDir/resumen }
    const manejarActualizacionProgreso = (datos) => {
        const { id, nombre, estado, mensaje, files = [], archivoPdf, downloadDir, resumen, detalleApremios } = datos;
        const idUsuario   = id;
        const estadoFinal = estado;

        window.ruedaTrabajando?.recibirAviso(datos);   // solo usa los de tipo 'progreso'

        if (estadoFinal === 'general')    return;
        if (estadoFinal === 'finalizado') {
            procesandoContainer.style.display = 'none';
            // Llevar los resultados arriba de todo (con un solo cliente sube lo que da la página).
            if (finalizadosContainer.style.display !== 'none') {
                finalizadosContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }

        let userDiv = userDivMap.get(idUsuario);
        if (!userDiv) {
            userDiv = document.createElement('div');
            userDiv.className = 'progreso-usuario';
            userDiv.setAttribute('data-userid', idUsuario);
            userDivMap.set(idUsuario, userDiv);

            const userHeader = document.createElement('h4');
            userHeader.textContent = nombre;
            userDiv.appendChild(userHeader);

            const messageContainer = document.createElement('div');
            messageContainer.className = 'message-container';
            userDiv.appendChild(messageContainer);
        }

        const isFinalStatus = ['exito_final', 'error', 'exito', 'no_habilitado', 'parcial'].includes(estadoFinal);

        const esFallo = estadoFinal === 'error' || estadoFinal === 'no_habilitado';
        const messageContainer = userDiv.querySelector('.message-container');
        messageContainer.innerHTML = `<div class="progreso-item">[${new Date().toLocaleTimeString()}] ${mensaje}</div>`;

        if (isFinalStatus) {
            finalizadosContainer.style.display = 'block';
            finalizadosDiv.appendChild(userDiv);
            if (procesandoContainer.contains(userDiv)) procesandoContainer.removeChild(userDiv);
            if (procesandoContainer.children.length <= 1) procesandoContainer.style.display = 'none';

            let badge = estadoFinal === 'error'
                ? '<span class="badge bg-danger">FALLO</span>'
                : estadoFinal === 'no_habilitado'
                    ? '<span class="badge bg-warning text-dark">NO HABILITADO</span>'
                    : estadoFinal === 'parcial'
                    ? `<span class="badge bg-warning text-dark">PARCIAL - ${files.length} archivo(s)</span>`
                    : `<span class="badge bg-success">Éxito - ${files.length || (archivoPdf ? 1 : 0)} archivo(s)</span>`;
            userDiv.querySelector('h4').innerHTML = `${nombre} ${badge}`;

            // Apremios: una línea por impuesto consultado (también cuando todos fallaron)
            if (Array.isArray(detalleApremios) && detalleApremios.length > 0) {
                const lista = document.createElement('ul');
                lista.className = 'detalle-apremios';
                detalleApremios.forEach(d => {
                    const li = document.createElement('li');
                    li.className = `apremio-${d.estado}`;
                    li.textContent = d.texto;
                    lista.appendChild(li);
                });
                userDiv.appendChild(lista);
            }

            if (!esFallo) {
                const archivosParaMostrar = files.length > 0 ? files : (archivoPdf ? [archivoPdf] : []);

                // Resumen de deudas (retenciones)
                if (resumen && Array.isArray(resumen) && resumen.length > 0) {
                    const granTotal = resumen.reduce((sum, item) => {
                        return sum + (parseFloat(item.total.replace(/\./g, '').replace(',', '.')) || 0);
                    }, 0);
                    const resumenContainer = document.createElement('div');
                    resumenContainer.className = 'resumen-deudas-container';
                    resumenContainer.innerHTML = `<h6>Resumen de Deudas</h6>
                        <ul class="list-group list-group-flush">
                            ${resumen.map(i => `<li class="list-group-item">${i.nombreTabla}<span class="badge">$ ${i.total}</span></li>`).join('')}
                        </ul>
                        <div class="resumen-total"><span>GRAN TOTAL</span><span>$ ${granTotal.toFixed(2).replace('.', ',')}</span></div>`;
                    userDiv.appendChild(resumenContainer);
                }

                // Botones de carpeta y archivos
                // Componente común (componentes/archivoResultado): un renglón por archivo + la carpeta
                if (downloadDir && archivosParaMostrar.length > 0) {
                    const bloqueArchivos = document.createElement('div');
                    bloqueArchivos.className = 'ar-bloque';
                    archivosParaMostrar.forEach(rutaArchivo => {
                        bloqueArchivos.appendChild(window.archivoResultado.crearFila(rutaArchivo, { carpeta: false, etiquetaAbrir: 'Abrir' }));
                    });
                    bloqueArchivos.appendChild(window.archivoResultado.crearBotones(null, {
                        abrir: false, rutaCarpeta: downloadDir, etiquetaCarpeta: 'Abrir carpeta del cliente'
                    }));
                    userDiv.appendChild(bloqueArchivos);
                }
            }
        } else {
            procesandoContainer.style.display = 'block';
            if (!procesandoContainer.contains(userDiv)) procesandoContainer.appendChild(userDiv);
        }
    };

    window.electronAPI.atm.constanciaFiscal.onUpdate(manejarActualizacionProgreso);
    window.electronAPI.atm.planDePago.onUpdate(manejarActualizacionProgreso);
    window.electronAPI.atm.retenciones.onUpdate(manejarActualizacionProgreso);
    window.electronAPI.atm.tasaCero.onUpdate(manejarActualizacionProgreso);
    window.electronAPI.atm.apremios.onUpdate(manejarActualizacionProgreso);

    console.log('✅ Módulo de lote ATM inicializado completamente');
};
