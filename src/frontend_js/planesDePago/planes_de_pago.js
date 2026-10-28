window.inicializarModuloPlanesDePago = () => {
    console.log('Inicializando módulo Planes de Pago (lote)...');

    // =========================================================================
    // ELEMENTOS DOM
    // =========================================================================
    const selectLista          = document.getElementById('selectListaPlanes');
    const btnNuevaLista        = document.getElementById('btnNuevaListaPlanes');
    const btnRenombrarLista    = document.getElementById('btnRenombrarListaPlanes');
    const btnEliminarLista     = document.getElementById('btnEliminarListaPlanes');
    const panelNombreLista     = document.getElementById('panelNombreListaPlanes');
    const inputNombreLista     = document.getElementById('inputNombreListaPlanes');
    const btnConfirmarNombre   = document.getElementById('btnConfirmarNombrePlanes');
    const btnCancelarNombre    = document.getElementById('btnCancelarNombrePlanes');
    const textareaNombres      = document.getElementById('textareaNombresPlanes');
    const btnBuscar            = document.getElementById('btnBuscarSeleccionarPlanes');
    const btnGuardarLista      = document.getElementById('btnGuardarListaPlanes');
    const matchResultado       = document.getElementById('matchResultadoPlanes');
    const panelCuitsRepresentantes = document.getElementById('panelCuitsRepresentantes');
    const contenedorBloques    = document.getElementById('contenedorBloquesRepresentantes');
    const resultadosContainer  = document.getElementById('resultadosPlanesDePago');
    const resultadosContenido  = document.getElementById('resultadosContenido');

    // =========================================================================
    // HELPERS
    // =========================================================================
    function normalizar(texto) {
        return String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    // =========================================================================
    // ESTADO
    // =========================================================================
    let selectorUsuarios = null;
    // Map: representanteId → { representante, asociados, cuitsSeleccionados: Set }
    const estadoRepresentantes = new Map();

    // =========================================================================
    // INICIALIZAR SELECTOR DE USUARIOS (multi-selección)
    // =========================================================================
    if (typeof SelectorUsuarios === 'undefined') {
        console.error('SelectorUsuarios no está definido. Reintentando...');
        setTimeout(window.inicializarModuloPlanesDePago, 100);
        return;
    }

    // =========================================================================
    // LANZADORES (componentes/lanzadorAutomatizacion): mientras corre una vuelta,
    // el botón tocado pasa a ⏹ Cancelar y los demás quedan bloqueados
    // =========================================================================
    const lanzador = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorPlanes'), {
        acciones: [{
            texto: 'Ver planes y elegir',
            preparar: prepararLote,
            confirmar: ({ loteRepresentantes, opciones }) => ({
                title: 'Ver planes',
                message: `Se leen los planes de ${contarClientes(loteRepresentantes)} cliente(s):${detalleLote(loteRepresentantes)}\n\nSe listan ${opciones.queSeBaja}. Todavía no se descarga nada: después marcás qué bajar.`,
                confirmText: 'Ver planes'
            }),
            rueda: { servicio: 'ARCA', subservicio: 'Plan de Pagos', mensaje: 'Leyendo los planes…' },
            ejecutar: verPlanes
        }, {
            texto: 'Descargar directo',
            tipo: 'secundario',
            ayuda: 'Baja todo lo que pasa el filtro, sin elegir plan por plan',
            preparar: prepararLote,
            confirmar: ({ loteRepresentantes, opciones }) => ({
                title: 'Planes de Pago',
                message: `Se procesarán ${loteRepresentantes.length} representante(s):${detalleLote(loteRepresentantes)}\n\nSe bajan ${opciones.queSeBaja}.`
            }),
            rueda: { servicio: 'ARCA', subservicio: 'Plan de Pagos', mensaje: 'Descargando los planes…' },
            ejecutar: ({ loteRepresentantes, opciones }, { visible }) => {
                panelSeleccion.style.display = 'none';
                return descargar(loteRepresentantes, opciones.estados, visible);
            }
        }]
    });
    const lanzadorSeleccion = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorPlanesSeleccion'), {
        navegador: false,
        acciones: [{
            texto: 'Descargar seleccionados',
            preparar: prepararSeleccion,
            confirmar: ({ totalPlanes, totalClientes }) => ({
                title: 'Descargar planes',
                message: `Se descargan ${totalPlanes} plan(es) de ${totalClientes} cliente(s).`,
                confirmText: 'Descargar'
            }),
            rueda: { servicio: 'ARCA', subservicio: 'Plan de Pagos', mensaje: 'Descargando los planes elegidos…' },
            // Son dos lanzadores: mientras baja, "Ver planes" / "Descargar directo" quedan apagados
            ejecutar: async ({ loteRepresentantes }) => {
                lanzador.habilitar(false);
                try {
                    await descargar(loteRepresentantes, estadosListados, visibleListado);
                } finally {
                    actualizarResumen();
                    sincronizarSeleccion();
                }
            }
        }]
    });

    selectorUsuarios = new SelectorUsuarios('selector-representantes-planes', {
        mostrarTablaSeleccionados: true,
        botonLimpiar: true,
        // El selector ya vació la selección; acá lo que es de esta vista.
        onLimpiar: () => {
            estadoRepresentantes.clear();
            matchResultado.style.display = 'none';
            actualizarPanelesCuits([]);
        },
        // Modelo plano: el backend ya computó puedeOperar para 'afip' (acceso
        // propio o por representante), así el representado aparece igual que en
        // el resto de AFIP. Solo se listan operables → no hace falta columna Estado.
        fuente: 'contribuyentes',
        servicio: 'afip',
        // Lote: elegibles los de clave sin validar, NO los de clave incorrecta
        // (filtro de habilitados + botón "Clave"; ver actualizarClave.js)
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selectorUsuarios, { lote: true }) : {}),
        onCambioSeleccion: (seleccionados) => {
            actualizarPanelesCuits(seleccionados);
        }
    });

    // =========================================================================
    // CARGAR LISTAS GUARDADAS
    // =========================================================================
    cargarListas();

    async function cargarListas() {
        const resultado = await window.electronAPI.planesDePago.listas.get();
        if (!resultado.exito) return;

        selectLista.innerHTML = '<option value="">-- Sin lista guardada --</option>';
        resultado.listas.forEach(lista => {
            const opt = document.createElement('option');
            opt.value = lista.nombre;
            opt.textContent = lista.nombre;
            selectLista.appendChild(opt);
        });
    }

    // Al cambiar la lista seleccionada → restaurar texto, representantes y CUITs
    selectLista.addEventListener('change', async () => {
        const nombreLista = selectLista.value;
        if (!nombreLista) return;

        const resultado = await window.electronAPI.planesDePago.listas.get();
        if (!resultado.exito) return;

        const lista = resultado.listas.find(l => l.nombre === nombreLista);
        if (!lista) return;

        // Limpiar selección actual
        selectorUsuarios.limpiarSeleccion();
        estadoRepresentantes.clear();
        matchResultado.style.display = 'none';

        // Restaurar texto del textarea
        textareaNombres.value = lista.texto || '';

        // Seleccionar representantes por ID
        const noEncontrados = [];
        const noHabilitados = [];
        if (Array.isArray(lista.representantes)) {
            lista.representantes.forEach(rep => {
                const cliente = selectorUsuarios.todosLosUsuarios.find(u => String(u.id) === String(rep.id));
                if (cliente) {
                    selectorUsuarios.toggleSeleccion(rep.id);
                    // El selector no deja elegir a los que no pueden operar (ej. clave incorrecta).
                    const quedo = selectorUsuarios.obtenerSeleccionados().some(u => String(u.id) === String(rep.id));
                    if (!quedo) noHabilitados.push(`${rep.nombre || rep.id}: ${cliente.motivoNoOpera || 'no habilitado'}`);
                } else {
                    noEncontrados.push(rep.nombre || rep.id);
                }
            });
            // Los CUITs marcados que traiga la lista NO se restauran: cada fila
            // procesa su propio CUIT (ver actualizarPanelesCuits).
        }

        const avisos = [...noHabilitados];
        if (noEncontrados.length > 0) {
            avisos.push(`${noEncontrados.length} representante(s) guardado(s) ya no existen en la base de datos`);
        }
        if (avisos.length > 0) mostrarMatchResultado([], avisos);
    });

    // =========================================================================
    // BÚSQUEDA Y MATCH POR NOMBRE (desde textarea)
    // =========================================================================
    btnBuscar.addEventListener('click', () => {
        const texto = textareaNombres.value.trim();
        if (!texto) {
            alert('Escriba al menos un nombre para buscar.');
            return;
        }

        const terminos = texto.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        const todos = selectorUsuarios.todosLosUsuarios;

        selectorUsuarios.limpiarSeleccion();
        matchResultado.style.display = 'none';

        const noEncontrados = [];
        const noHabilitados = [];

        terminos.forEach(termino => {
            const terminoNorm = normalizar(termino);
            const matches = todos.filter(u => {
                const nombreCompleto = normalizar(`${u.nombre || ''} ${u.apellido || ''}`.trim());
                const razonSocial = normalizar(u.razonSocial || '');
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
            html += `<div class="match-ok">✅ ${seleccionados.length} representante(s) seleccionado(s)</div>`;
        }
        if (advertencias.length > 0) {
            html += advertencias.map(a => `<div class="match-warn">⚠️ ${a}</div>`).join('');
        }

        matchResultado.innerHTML = html;
    }

    // =========================================================================
    // GESTIÓN DE LISTAS (Nuevo/Renombrar/Eliminar/Guardar)
    // =========================================================================
    let modoNombre = null;

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
                setTimeout(() => inputNombreLista.classList.remove('input-error'), 1500);
                return;
            }
            const opt = document.createElement('option');
            opt.value = nombre;
            opt.textContent = nombre;
            selectLista.appendChild(opt);
            selectLista.value = nombre;
            cerrarPanelNombre();
        }

        if (modoNombre === 'renombrar') {
            const nombreActual = selectLista.value;
            if (nombre === nombreActual) { cerrarPanelNombre(); return; }

            const resultado = await window.electronAPI.planesDePago.listas.renombrar({
                nombreActual,
                nombreNuevo: nombre
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

    btnNuevaLista.addEventListener('click', () => abrirPanelNombre('nueva'));

    btnRenombrarLista.addEventListener('click', () => {
        const nombreActual = selectLista.value;
        if (!nombreActual) {
            selectLista.classList.add('input-error');
            setTimeout(() => selectLista.classList.remove('input-error'), 1500);
            return;
        }
        abrirPanelNombre('renombrar', nombreActual);
    });

    btnEliminarLista.addEventListener('click', async () => {
        const nombre = selectLista.value;
        if (!nombre) { alert('Seleccione una lista para eliminar.'); return; }
        if (!confirm(`Eliminar la lista "${nombre}"? Esta accion no se puede deshacer.`)) return;

        const resultado = await window.electronAPI.planesDePago.listas.eliminar({ nombre });
        if (!resultado.exito) { alert(`Error: ${resultado.error}`); return; }

        await cargarListas();
        selectorUsuarios.limpiarSeleccion();
        estadoRepresentantes.clear();
        actualizarPanelesCuits([]);
    });

    // Guardar lista (incluye texto del textarea + representantes + CUITs)
    btnGuardarLista.addEventListener('click', async () => {
        const nombre = selectLista.value;
        if (!nombre) {
            alert('Seleccione o cree una lista antes de guardar.');
            return;
        }

        // Construir array de representantes con CUITs seleccionados
        const representantes = [];
        estadoRepresentantes.forEach((estado, id) => {
            if (estado.cuitsSeleccionados.size > 0) {
                representantes.push({
                    id: estado.representante.id,
                    cuit: estado.representante.cuit,
                    nombre: estado.representante.nombre,
                    cuitsSeleccionados: Array.from(estado.cuitsSeleccionados)
                });
            }
        });

        const texto = textareaNombres.value;

        const resultado = await window.electronAPI.planesDePago.listas.guardar({
            nombre,
            texto,
            representantes
        });

        if (resultado.exito) {
            btnGuardarLista.textContent = '✅ Guardado';
            btnGuardarLista.disabled = true;
            setTimeout(() => {
                btnGuardarLista.textContent = 'Guardar lista';
                btnGuardarLista.disabled = false;
            }, 2000);
            await cargarListas();
            selectLista.value = nombre;
        } else {
            alert(`Error al guardar: ${resultado.error}`);
        }
    });

    // =========================================================================
    // PANELES DE CUITS POR REPRESENTANTE
    // =========================================================================
    // Modelo plano: el selector ya lista a los representados como filas propias,
    // así que cada fila seleccionada procesa SU PROPIO CUIT. El panel de "CUITs
    // por representante" (asociados de cuits_asociados_planes.json) quedó oculto
    // y los asociados se ignoran. Pendiente: borrar el código de asociados.
    async function actualizarPanelesCuits(representantesSeleccionados) {
        panelCuitsRepresentantes.style.display = 'none';
        if (representantesSeleccionados.length === 0) {
            contenedorBloques.innerHTML = '';
            estadoRepresentantes.clear();
            actualizarResumen();
            return;
        }

        // Determinar qué representantes se agregaron/quitaron
        const idsActuales = new Set(representantesSeleccionados.map(u => String(u.id)));
        const idsExistentes = new Set(estadoRepresentantes.keys());

        // Eliminar bloques de representantes deseleccionados
        for (const id of idsExistentes) {
            if (!idsActuales.has(id)) {
                estadoRepresentantes.delete(id);
            }
        }

        // Agregar representantes nuevos
        for (const usuario of representantesSeleccionados) {
            const id = String(usuario.id);
            if (!estadoRepresentantes.has(id)) {
                const representante = {
                    id: usuario.id,
                    cuit: usuario.cuit || '',
                    nombre: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim()
                };

                estadoRepresentantes.set(id, {
                    representante,
                    asociados: [],
                    cuitsSeleccionados: new Set([representante.cuit])
                });
            }
        }

        actualizarResumen();
    }

    function renderizarTodosBloques() {
        contenedorBloques.innerHTML = '';

        estadoRepresentantes.forEach((estado) => {
            const bloque = crearBloqueRepresentante(estado);
            contenedorBloques.appendChild(bloque);
        });
    }

    function crearBloqueRepresentante(estado) {
        const { representante, asociados, cuitsSeleccionados } = estado;
        const totalCuits = 1 + asociados.length; // titular + asociados
        const seleccionados = cuitsSeleccionados.size;

        const bloque = document.createElement('div');
        bloque.className = 'planes-bloque-representante';
        bloque.dataset.representanteId = representante.id;

        // Header colapsable
        const header = document.createElement('div');
        header.className = 'planes-bloque-header';
        header.innerHTML = `
            <div class="planes-bloque-info">
                <span class="planes-bloque-nombre">${representante.nombre}</span>
                <span class="planes-bloque-cuit">${representante.cuit}</span>
                <span class="planes-bloque-badge">${seleccionados}/${totalCuits} CUITs</span>
            </div>
            <span class="planes-bloque-toggle">&#9660;</span>
        `;

        const contenido = document.createElement('div');
        contenido.className = 'planes-bloque-contenido';

        header.addEventListener('click', () => {
            const abierto = contenido.classList.toggle('abierto');
            header.querySelector('.planes-bloque-toggle').classList.toggle('abierto', abierto);
        });

        // Tabla de CUITs
        const tabla = document.createElement('table');
        tabla.className = 'planes-tabla-cuits';
        tabla.innerHTML = `
            <thead>
                <tr>
                    <th class="col-check"></th>
                    <th>CUIT</th>
                    <th>Alias</th>
                    <th>Origen</th>
                    <th>Acciones</th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');

        // Fila titular
        const trTitular = document.createElement('tr');
        trTitular.classList.add('fila-titular');
        const cbTitular = document.createElement('input');
        cbTitular.type = 'checkbox';
        cbTitular.checked = cuitsSeleccionados.has(representante.cuit);
        cbTitular.dataset.cuit = representante.cuit;

        cbTitular.addEventListener('change', () => {
            if (cbTitular.checked) {
                cuitsSeleccionados.add(representante.cuit);
            } else {
                cuitsSeleccionados.delete(representante.cuit);
            }
            actualizarBadgeBloque(bloque, estado);
            actualizarResumen();
        });

        trTitular.innerHTML = `
            <td class="col-check"></td>
            <td>${representante.cuit}</td>
            <td>${representante.nombre}</td>
            <td><span class="badge-origen badge-origen-titular">Titular</span></td>
            <td></td>
        `;
        trTitular.querySelector('.col-check').appendChild(cbTitular);

        // Click en fila para toggle checkbox
        trTitular.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            cbTitular.checked = !cbTitular.checked;
            cbTitular.dispatchEvent(new Event('change'));
        });

        tbody.appendChild(trTitular);

        // Filas de asociados
        asociados.forEach(asoc => {
            const tr = document.createElement('tr');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = cuitsSeleccionados.has(asoc.cuit);
            cb.dataset.cuit = asoc.cuit;

            cb.addEventListener('change', () => {
                if (cb.checked) {
                    cuitsSeleccionados.add(asoc.cuit);
                } else {
                    cuitsSeleccionados.delete(asoc.cuit);
                }
                actualizarBadgeBloque(bloque, estado);
                actualizarResumen();
            });

            tr.innerHTML = `
                <td class="col-check"></td>
                <td>${asoc.cuit}</td>
                <td>${asoc.alias}</td>
                <td><span class="badge-origen badge-origen-${asoc.origen}">${asoc.origen === 'users' ? 'Cliente' : 'Manual'}</span></td>
                <td>
                    <button class="planes-btn-accion planes-btn-editar" data-cuit="${asoc.cuit}">Editar</button>
                    <button class="planes-btn-accion planes-btn-eliminar" data-cuit="${asoc.cuit}">Eliminar</button>
                </td>
            `;
            tr.querySelector('.col-check').appendChild(cb);

            tr.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });

            // Listeners de editar/eliminar
            tr.querySelector('.planes-btn-editar').addEventListener('click', () => {
                abrirEditarCuit(estado, asoc.cuit, bloque);
            });
            tr.querySelector('.planes-btn-eliminar').addEventListener('click', () => {
                eliminarCuitAsociado(estado, asoc.cuit, bloque);
            });

            tbody.appendChild(tr);
        });

        tabla.appendChild(tbody);
        contenido.appendChild(tabla);

        // Sección agregar CUIT
        const agregarDiv = crearSeccionAgregarCuit(estado, bloque);
        contenido.appendChild(agregarDiv);

        bloque.appendChild(header);
        bloque.appendChild(contenido);

        return bloque;
    }

    function actualizarBadgeBloque(bloque, estado) {
        const badge = bloque.querySelector('.planes-bloque-badge');
        if (badge) {
            const total = 1 + estado.asociados.length;
            badge.textContent = `${estado.cuitsSeleccionados.size}/${total} CUITs`;
        }
    }

    function renderizarBloqueCuits(estado) {
        const bloque = contenedorBloques.querySelector(`[data-representante-id="${estado.representante.id}"]`);
        if (!bloque) return;

        const nuevoBloque = crearBloqueRepresentante(estado);
        bloque.replaceWith(nuevoBloque);
    }

    // =========================================================================
    // CRUD DE CUITS ASOCIADOS (dentro de cada bloque)
    // =========================================================================
    function crearSeccionAgregarCuit(estado, bloque) {
        const { representante } = estado;
        const container = document.createElement('div');
        container.className = 'planes-agregar-cuit';

        container.innerHTML = `
            <div class="planes-agregar-titulo">Agregar CUIT asociado</div>
            <div class="planes-agregar-tabs">
                <button class="planes-tab planes-tab-activo tab-clientes">Desde clientes</button>
                <button class="planes-tab tab-manual">Manual</button>
            </div>
            <div class="planes-agregar-panel panel-clientes">
                <select class="planes-select-cliente">
                    <option value="">-- Seleccionar cliente --</option>
                </select>
                <button class="btn planes-btn-agregar btn-agregar-cliente">Agregar</button>
            </div>
            <div class="planes-agregar-panel panel-manual" style="display:none">
                <input type="text" class="planes-input input-cuit-manual" placeholder="CUIT (ej: 30712345678)" maxlength="11" />
                <input type="text" class="planes-input input-alias-manual" placeholder="Alias" />
                <button class="btn planes-btn-agregar btn-agregar-manual">Agregar</button>
            </div>
        `;

        // Tabs
        const tabClientes = container.querySelector('.tab-clientes');
        const tabManual = container.querySelector('.tab-manual');
        const panelClientes = container.querySelector('.panel-clientes');
        const panelManual = container.querySelector('.panel-manual');

        tabClientes.addEventListener('click', () => {
            tabClientes.classList.add('planes-tab-activo');
            tabManual.classList.remove('planes-tab-activo');
            panelClientes.style.display = 'flex';
            panelManual.style.display = 'none';
        });

        tabManual.addEventListener('click', () => {
            tabManual.classList.add('planes-tab-activo');
            tabClientes.classList.remove('planes-tab-activo');
            panelManual.style.display = 'flex';
            panelClientes.style.display = 'none';
        });

        // Llenar select de clientes
        const selectCliente = container.querySelector('.planes-select-cliente');
        cargarClientesEnSelect(selectCliente, representante.cuit);

        // Agregar desde clientes
        container.querySelector('.btn-agregar-cliente').addEventListener('click', async () => {
            const valor = selectCliente.value;
            if (!valor) {
                selectCliente.classList.add('input-error');
                setTimeout(() => selectCliente.classList.remove('input-error'), 1500);
                return;
            }
            const cliente = JSON.parse(valor);
            const resultado = await window.electronAPI.planesDePago.cuits.guardar({
                cuitRepresentante: representante.cuit,
                nombreRepresentante: representante.nombre,
                asociado: { cuit: cliente.cuit, alias: cliente.nombre, origen: 'users' }
            });
            if (!resultado.exito) { alert(resultado.error); return; }
            selectCliente.value = '';
            await recargarAsociados(estado, bloque);
        });

        // Agregar manual
        container.querySelector('.btn-agregar-manual').addEventListener('click', async () => {
            const inputCuit = container.querySelector('.input-cuit-manual');
            const inputAlias = container.querySelector('.input-alias-manual');
            const cuit = inputCuit.value.trim();
            const alias = inputAlias.value.trim();

            if (!cuit) {
                inputCuit.classList.add('input-error');
                setTimeout(() => inputCuit.classList.remove('input-error'), 1500);
                return;
            }
            if (!alias) {
                inputAlias.classList.add('input-error');
                setTimeout(() => inputAlias.classList.remove('input-error'), 1500);
                return;
            }

            const resultado = await window.electronAPI.planesDePago.cuits.guardar({
                cuitRepresentante: representante.cuit,
                nombreRepresentante: representante.nombre,
                asociado: { cuit, alias, origen: 'manual' }
            });
            if (!resultado.exito) { alert(resultado.error); return; }
            inputCuit.value = '';
            inputAlias.value = '';
            await recargarAsociados(estado, bloque);
        });

        return container;
    }

    async function cargarClientesEnSelect(selectEl, cuitRepresentante) {
        const result = await window.electronAPI.user.getAll();
        if (result.success && Array.isArray(result.users)) {
            result.users.forEach(user => {
                const cuit = user.cuit ? String(user.cuit).trim() : '';
                if (!cuit || cuit === cuitRepresentante) return;
                const nombre = `${user.nombre || ''} ${user.apellido || ''}`.trim();
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ cuit, nombre });
                opt.textContent = `${nombre} (${cuit})`;
                selectEl.appendChild(opt);
            });
        }
    }

    async function recargarAsociados(estado, bloque) {
        const resultado = await window.electronAPI.planesDePago.cuits.get(estado.representante.cuit);
        if (resultado.exito) {
            estado.asociados = resultado.asociados;
            // Auto-seleccionar nuevos CUITs
            estado.asociados.forEach(a => estado.cuitsSeleccionados.add(a.cuit));
        }
        renderizarBloqueCuits(estado);
        actualizarResumen();
    }

    function abrirEditarCuit(estado, cuitViejo, bloque) {
        const asoc = estado.asociados.find(a => a.cuit === cuitViejo);
        if (!asoc) return;

        // Crear panel editar inline dentro del bloque
        const existente = bloque.querySelector('.planes-panel-editar');
        if (existente) existente.remove();

        const panelEditar = document.createElement('div');
        panelEditar.className = 'planes-panel-editar';
        panelEditar.innerHTML = `
            <div class="planes-editar-fila">
                <input type="text" class="planes-input" value="${asoc.cuit}" placeholder="CUIT" maxlength="11" />
                <input type="text" class="planes-input" value="${asoc.alias}" placeholder="Alias" />
                <button class="btn planes-btn-agregar">Confirmar</button>
                <button class="btn planes-btn-cancelar">Cancelar</button>
            </div>
        `;

        const inputs = panelEditar.querySelectorAll('.planes-input');
        panelEditar.querySelector('.planes-btn-cancelar').addEventListener('click', () => panelEditar.remove());
        panelEditar.querySelector('.planes-btn-agregar').addEventListener('click', async () => {
            const cuitNuevo = inputs[0].value.trim();
            const aliasNuevo = inputs[1].value.trim();
            if (!cuitNuevo || !aliasNuevo) return;

            const resultado = await window.electronAPI.planesDePago.cuits.editar({
                cuitRepresentante: estado.representante.cuit,
                cuitViejo,
                datosNuevos: { cuit: cuitNuevo, alias: aliasNuevo }
            });
            if (!resultado.exito) { alert(resultado.error); return; }

            // Actualizar seleccion si cambió el CUIT
            if (estado.cuitsSeleccionados.has(cuitViejo)) {
                estado.cuitsSeleccionados.delete(cuitViejo);
                estado.cuitsSeleccionados.add(cuitNuevo);
            }

            await recargarAsociados(estado, bloque);
        });

        const contenido = bloque.querySelector('.planes-bloque-contenido');
        contenido.appendChild(panelEditar);
        // Abrir el bloque si no está abierto
        if (!contenido.classList.contains('abierto')) {
            contenido.classList.add('abierto');
            bloque.querySelector('.planes-bloque-toggle').classList.add('abierto');
        }
    }

    async function eliminarCuitAsociado(estado, cuit, bloque) {
        const asoc = estado.asociados.find(a => a.cuit === cuit);
        if (!asoc) return;
        if (!confirm(`Eliminar el CUIT asociado "${asoc.alias}" (${asoc.cuit})?`)) return;

        const resultado = await window.electronAPI.planesDePago.cuits.eliminar({
            cuitRepresentante: estado.representante.cuit,
            cuitAsociado: cuit
        });
        if (!resultado.exito) { alert(resultado.error); return; }

        estado.cuitsSeleccionados.delete(cuit);
        await recargarAsociados(estado, bloque);
    }

    // =========================================================================
    // ACTUALIZAR BOTONES (según CUITs seleccionados)
    // =========================================================================
    function actualizarResumen() {
        let totalCuits = 0;
        estadoRepresentantes.forEach(estado => { totalCuits += estado.cuitsSeleccionados.size; });

        // Un CUIT por fila seleccionada (modelo plano): CUITs = clientes
        const sufijo = totalCuits > 0 ? ` (${totalCuits} cliente${totalCuits === 1 ? '' : 's'})` : '';
        lanzador.cambiar(0, { texto: `Ver planes y elegir${sufijo}` });
        lanzador.cambiar(1, { texto: `Descargar directo${sufijo}` });
        lanzador.habilitar(totalCuits > 0);
    }

    // =========================================================================
    // RANGO DE NO VIGENTES: solo se usa si está tildado "Planes no vigentes"
    // =========================================================================
    const chkNoVigentes = document.getElementById('chk-planes-no-vigentes');
    const inputRangoDesde = document.getElementById('input-rango-desde-planes');
    const inputRangoHasta = document.getElementById('input-rango-hasta-planes');
    const rangoNoVigentes = document.getElementById('rangoNoVigentesPlanes');
    // Calendario común en modo período: la pantalla sigue leyendo 'AAAA-MM' en .value
    // (como el viejo input month); en pantalla se ve mm/aaaa.
    [inputRangoDesde, inputRangoHasta].forEach(input =>
        crearCalendario(input, { modo: 'periodo', formato: 'Y-m', ver: 'm/Y', inicial: null }));
    const sincronizarRango = () => {
        const activo = chkNoVigentes.checked;
        inputRangoDesde.disabled = !activo;
        inputRangoHasta.disabled = !activo;
        rangoNoVigentes.classList.toggle('planes-rango-inactivo', !activo);
    };
    chkNoVigentes.addEventListener('change', sincronizarRango);
    sincronizarRango();

    // =========================================================================
    // LOTE + OPCIONES (comunes a "Ver planes" y "Descargar directo")
    // =========================================================================
    // [{ representante, cuitsAProcesar: [{ cuit, alias }] }] con lo tildado en el selector
    function construirLote() {
        const loteRepresentantes = [];
        estadoRepresentantes.forEach(estado => {
            if (estado.cuitsSeleccionados.size === 0) return;

            const cuitsAProcesar = [];
            // Titular
            if (estado.cuitsSeleccionados.has(estado.representante.cuit)) {
                cuitsAProcesar.push({ cuit: estado.representante.cuit, alias: estado.representante.nombre });
            }
            // Asociados
            estado.asociados.forEach(asoc => {
                if (estado.cuitsSeleccionados.has(asoc.cuit)) {
                    cuitsAProcesar.push({ cuit: asoc.cuit, alias: asoc.alias });
                }
            });

            if (cuitsAProcesar.length > 0) {
                loteRepresentantes.push({ representante: estado.representante, cuitsAProcesar });
            }
        });
        return loteRepresentantes;
    }

    // Casillas de estado + rango → { estados, queSeBaja } | null si no es válido
    function leerOpciones() {
        const estados = {
            vigentes: document.getElementById('chk-planes-vigentes')?.checked !== false,
            noVigentes: chkNoVigentes.checked === true
        };
        if (!estados.vigentes && !estados.noVigentes) {
            alert('Elegí al menos un tipo de plan: vigentes o no vigentes.');
            return null;
        }
        // Rango 'AAAA-MM' (input month): se compara como texto, que ordena bien
        const desde = inputRangoDesde.value || null;
        const hasta = inputRangoHasta.value || null;
        if (estados.noVigentes) {
            if (desde && hasta && desde > hasta) {
                alert('En el rango de no vigentes, "desde" no puede ser posterior a "hasta".');
                return null;
            }
            if (desde || hasta) estados.rangoNoVigentes = { desde, hasta };
        }
        const mmAaaa = (v) => v.split('-').reverse().join('/');
        const textoRango = estados.rangoNoVigentes
            ? (desde && hasta ? ` presentados ${mmAaaa(desde)} – ${mmAaaa(hasta)}`
                : desde ? ` presentados desde ${mmAaaa(desde)}` : ` presentados hasta ${mmAaaa(hasta)}`)
            : '';
        const queSeBaja = estados.vigentes && estados.noVigentes ? `todos los vigentes y los no vigentes${textoRango}`
            : estados.vigentes ? 'solo planes vigentes' : `solo planes no vigentes${textoRango}`;
        return { estados, queSeBaja };
    }

    // Lo común a "Ver planes" y "Descargar directo": lote + filtros (null = no arranca)
    function prepararLote() {
        const loteRepresentantes = construirLote();
        if (loteRepresentantes.length === 0) { alert('No hay CUITs seleccionados.'); return null; }
        const opciones = leerOpciones();
        if (!opciones) return null;
        return { loteRepresentantes, opciones };
    }

    const contarClientes = (lote) => lote.reduce((n, lr) => n + lr.cuitsAProcesar.length, 0);

    function detalleLote(loteRepresentantes) {
        let detalle = '';
        loteRepresentantes.forEach(lr => {
            detalle += `\n${lr.representante.nombre} (${lr.cuitsAProcesar.length} CUITs)`;
            lr.cuitsAProcesar.forEach(c => { detalle += `\n  - ${c.alias} (${c.cuit})`; });
        });
        return detalle;
    }

    // Descarga (2ª vuelta o directa). Si un cuitAProcesar trae `planes`, se bajan solo esos.
    async function descargar(loteRepresentantes, estados, visible) {
        resultadosContainer.style.display = 'block';
        resultadosContenido.innerHTML = '';

        try {
            const resultado = await window.electronAPI.planesDePago.generarLote({
                loteRepresentantes,
                visible,
                estados
            });
            if (resultado.success) {
                console.log('Procesamiento lote completado:', resultado);
            } else {
                agregarResultadoUI('error', resultado.message);
            }
        } catch (error) {
            agregarResultadoUI('error', `Error de comunicacion: ${error.message}`);
        }
    }

    // =========================================================================
    // VER PLANES (1ª vuelta: lista sin descargar → el usuario marca)
    // =========================================================================
    let estadosListados = null; // filtros con los que se listó (van al resumen en la 2ª vuelta)
    let visibleListado = true;  // la 2ª vuelta usa el navegador que se eligió al listar

    async function verPlanes({ loteRepresentantes, opciones }, { visible }) {
        panelSeleccion.style.display = 'none';
        resultadosContainer.style.display = 'block';
        resultadosContenido.innerHTML = '';

        try {
            const resultado = await window.electronAPI.planesDePago.listarLote({
                loteRepresentantes,
                visible,
                estados: opciones.estados
            });
            if (resultado.success) {
                estadosListados = opciones.estados;
                visibleListado = visible;
                mostrarSeleccion(resultado.clientes, opciones.queSeBaja);
            } else {
                agregarResultadoUI('error', resultado.message);
            }
        } catch (error) {
            agregarResultadoUI('error', `Error de comunicacion: ${error.message}`);
        }
    }

    // =========================================================================
    // PANEL DE SELECCIÓN DE PLANES (resultado de la 1ª vuelta)
    // Un bloque por cliente: casilla general + una fila por plan. Todo viene
    // marcado (ya pasó el filtro); el usuario destilda lo que no quiere.
    // =========================================================================
    const panelSeleccion = document.getElementById('panelSeleccionPlanes');
    const contenedorSeleccion = document.getElementById('contenedorSeleccionPlanes');
    const resumenSeleccion = document.getElementById('resumenSeleccionPlanes');
    let clientesListados = [];

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }

    function mostrarSeleccion(clientes, queSeBaja) {
        clientesListados = clientes;
        contenedorSeleccion.innerHTML = '';
        resumenSeleccion.dataset.filtro = queSeBaja;

        clientes.forEach((cli, idx) => {
            const bloque = el('div', 'planes-sel-cliente');
            const cab = el('div', 'planes-sel-cabecera');
            const titulo = el('label', 'planes-sel-titulo');
            const chkTodos = el('input');
            chkTodos.type = 'checkbox';
            titulo.appendChild(chkTodos);
            titulo.appendChild(el('strong', null, ` ${cli.cuitConsulta.alias}`));
            titulo.appendChild(el('span', 'planes-sel-cuit', ` ${cli.cuitConsulta.cuit}`));
            cab.appendChild(titulo);
            bloque.appendChild(cab);

            if (!cli.success) {
                chkTodos.disabled = true;
                // Cancelado o navegador cerrado a mano: amarillo, no fallo
                cab.appendChild(cli.error === 'CANCELADO' || cli.error === 'NAVEGADOR_CERRADO'
                    ? el('span', 'planes-chip planes-chip-cancelado', `⏹ ${cli.message}`)
                    : el('span', 'planes-chip planes-chip-error', `✗ ${cli.message || 'Error'}`));
                contenedorSeleccion.appendChild(bloque);
                return;
            }
            if (cli.planes.length === 0) {
                chkTodos.disabled = true;
                cab.appendChild(el('span', 'planes-chip planes-chip-no', 'Sin planes para los filtros elegidos'));
                contenedorSeleccion.appendChild(bloque);
                return;
            }
            cab.appendChild(el('span', 'planes-sel-cuenta'));

            const tabla = el('table', 'planes-sel-tabla');
            const thead = el('thead');
            const trh = el('tr');
            ['', 'Plan N°', 'Situación', 'Presentación', 'Cuotas', 'Tipo', 'Consolidado ($)'].forEach(t => trh.appendChild(el('th', null, t)));
            thead.appendChild(trh);
            tabla.appendChild(thead);
            const tbody = el('tbody');
            cli.planes.forEach(plan => {
                const tr = el('tr', plan.vigente ? '' : 'planes-sel-no-vigente');
                const tdChk = el('td');
                const chk = el('input');
                chk.type = 'checkbox';
                chk.checked = true;
                chk.dataset.cliente = String(idx);
                chk.dataset.plan = plan.numero;
                tdChk.appendChild(chk);
                tr.appendChild(tdChk);
                tr.appendChild(el('td', null, plan.numero));
                tr.appendChild(el('td', null, plan.estado || '—'));
                tr.appendChild(el('td', null, plan.presentacion || ''));
                tr.appendChild(el('td', 'planes-sel-num', plan.cuotas || ''));
                const tdTipo = el('td', 'planes-sel-tipo', plan.tipo || '');
                tdTipo.title = plan.tipo || '';
                tr.appendChild(tdTipo);
                tr.appendChild(el('td', 'planes-sel-num', plan.consolidado || ''));
                // Click en la fila (fuera de la casilla) también marca/desmarca
                tr.addEventListener('click', (e) => {
                    if (e.target === chk) return;
                    chk.checked = !chk.checked;
                    sincronizarSeleccion();
                });
                chk.addEventListener('change', sincronizarSeleccion);
                tbody.appendChild(tr);
            });
            tabla.appendChild(tbody);
            bloque.appendChild(tabla);

            chkTodos.addEventListener('change', () => {
                tbody.querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = chkTodos.checked; });
                sincronizarSeleccion();
            });
            contenedorSeleccion.appendChild(bloque);
        });

        sincronizarSeleccion();
        panelSeleccion.style.display = 'block';
        panelSeleccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Recalcula contadores, casillas generales y el botón de descarga
    function sincronizarSeleccion() {
        let marcados = 0;
        let total = 0;
        contenedorSeleccion.querySelectorAll('.planes-sel-cliente').forEach(bloque => {
            const casillas = Array.from(bloque.querySelectorAll('tbody input[type="checkbox"]'));
            if (casillas.length === 0) return;
            const n = casillas.filter(c => c.checked).length;
            marcados += n;
            total += casillas.length;
            const chkTodos = bloque.querySelector('.planes-sel-titulo input');
            chkTodos.checked = n === casillas.length;
            chkTodos.indeterminate = n > 0 && n < casillas.length;
            bloque.querySelector('.planes-sel-cuenta').textContent = `${n}/${casillas.length} marcados`;
        });
        resumenSeleccion.textContent = `${marcados} de ${total} plan(es) marcados · filtro: ${resumenSeleccion.dataset.filtro || ''}`;
        lanzadorSeleccion.cambiar(0, { texto: `Descargar seleccionados (${marcados})` });
        lanzadorSeleccion.habilitar(marcados > 0);
    }

    document.getElementById('btnMarcarTodosPlanes').addEventListener('click', () => {
        contenedorSeleccion.querySelectorAll('tbody input[type="checkbox"]').forEach(c => { c.checked = true; });
        sincronizarSeleccion();
    });
    document.getElementById('btnDesmarcarTodosPlanes').addEventListener('click', () => {
        contenedorSeleccion.querySelectorAll('tbody input[type="checkbox"]').forEach(c => { c.checked = false; });
        sincronizarSeleccion();
    });

    // 2ª vuelta: arma el lote solo con los clientes que tienen algo marcado y,
    // en cada uno, `planes` = los números marcados.
    function prepararSeleccion() {
        const porCliente = new Map(); // idx → [numeros]
        contenedorSeleccion.querySelectorAll('tbody input[type="checkbox"]:checked').forEach(c => {
            const idx = Number(c.dataset.cliente);
            if (!porCliente.has(idx)) porCliente.set(idx, []);
            porCliente.get(idx).push(c.dataset.plan);
        });
        if (porCliente.size === 0) return null;

        // Agrupar por representante (un login por representante, como siempre)
        const porRepresentante = new Map();
        porCliente.forEach((planes, idx) => {
            const cli = clientesListados[idx];
            const clave = cli.representante.cuit || cli.representante.id;
            if (!porRepresentante.has(clave)) porRepresentante.set(clave, { representante: cli.representante, cuitsAProcesar: [] });
            porRepresentante.get(clave).cuitsAProcesar.push({ ...cli.cuitConsulta, planes });
        });
        const loteRepresentantes = [...porRepresentante.values()];
        const totalPlanes = [...porCliente.values()].reduce((n, p) => n + p.length, 0);
        return { loteRepresentantes, totalPlanes, totalClientes: porCliente.size };
    }

    // =========================================================================
    // PANEL DE RESULTADOS Y PROGRESO
    // =========================================================================
    function agregarResultadoUI(estado, mensaje, alias, cuit) {
        const div = document.createElement('div');
        div.className = `planes-resultado planes-resultado-${estado}`;

        let icono = '';
        if (estado === 'procesando') icono = '...';
        else if (estado === 'exito') icono = 'OK';
        else if (estado === 'error') icono = 'ERROR';
        else if (estado === 'cancelado' || estado === 'cerrado') icono = '⏹';
        else if (estado === 'finalizado') icono = 'FIN';
        else if (estado === 'representante') icono = '>>>';

        const label = alias ? `${alias} (${cuit})` : '';
        div.innerHTML = `<span>${icono} ${label ? `<strong>${label}</strong> — ` : ''}${mensaje}</span>`;
        resultadosContenido.appendChild(div);

        // Auto-scroll
        resultadosContenido.scrollTop = resultadosContenido.scrollHeight;
    }

    // Una fila por plan: "Plan W715660 · Pagos ✓ · Plan de Pago ✓ · Impositivas — · …"
    // Estados de sección: ok | no (el plan no la tiene) | error. Control: ok | difiere | sinDatos.
    function agregarResumenPlanesUI(planes) {
        const SIMBOLO = { ok: '✓', no: '—', error: '✗' };
        const TITULO = { ok: 'Descargado', no: 'El plan no tiene esta sección', error: 'Falló' };
        const CONTROL = {
            ok: ['✓', 'ok', 'Cierra con el consolidado de AFIP'],
            difiere: ['⚠ no cierra', 'error', 'Lo leído no coincide con el consolidado: revisar'],
            sinDatos: ['—', 'no', 'Sin datos para comparar']
        };

        const lista = document.createElement('div');
        lista.className = 'planes-resumen-planes';

        planes.forEach(p => {
            const fila = document.createElement('div');
            fila.className = 'planes-resumen-plan';

            const nombre = document.createElement('strong');
            nombre.textContent = `Plan ${p.numero}`;
            fila.appendChild(nombre);

            // Situación de AFIP (Vigente / Plan Caduco / Plan Cancelado / ...)
            if (p.estado) {
                const sit = document.createElement('span');
                sit.className = `planes-chip planes-chip-situacion${p.vigente ? '' : ' planes-chip-no-vigente'}`;
                sit.textContent = p.estado;
                sit.title = p.vigente ? 'Plan vigente' : 'Plan no vigente: va a la carpeta No_Vigentes';
                fila.appendChild(sit);
            }

            if (!p.success) {
                const err = document.createElement('span');
                err.className = 'planes-chip planes-chip-error';
                err.textContent = `✗ ${p.error || 'Error'}`;
                fila.appendChild(err);
                lista.appendChild(fila);
                return;
            }

            const chip = (etiqueta, estado, simbolo, titulo) => {
                const span = document.createElement('span');
                span.className = `planes-chip planes-chip-${estado}`;
                span.textContent = `${etiqueta} ${simbolo}`;
                span.title = titulo;
                fila.appendChild(span);
            };
            // En las secciones, el tooltip dice de dónde salió el PDF
            const ORIGEN = { afip: ' (PDF oficial de AFIP)', propio: ' (PDF propio: el de AFIP no estuvo disponible)' };
            const tituloSeccion = (estado, id) => TITULO[estado] + ((estado === 'ok' && p.pdfOrigen && ORIGEN[p.pdfOrigen[id]]) || '');
            chip('Pagos', p.pagos, SIMBOLO[p.pagos], tituloSeccion(p.pagos, 'pagos'));
            chip('Plan de Pago', p.planPago, SIMBOLO[p.planPago], tituloSeccion(p.planPago, 'planPago'));
            chip('Impositivas', p.obligImp, SIMBOLO[p.obligImp], tituloSeccion(p.obligImp, 'obligImp'));
            chip('Previsionales', p.obligPrev, SIMBOLO[p.obligPrev], tituloSeccion(p.obligPrev, 'obligPrev'));
            chip('Excel', p.excel, SIMBOLO[p.excel], TITULO[p.excel]);
            const [simb, clase, tit] = CONTROL[p.control] || CONTROL.sinDatos;
            chip('Control', clase, simb, tit);

            lista.appendChild(fila);
        });

        resultadosContenido.appendChild(lista);
        resultadosContenido.scrollTop = resultadosContenido.scrollHeight;
    }

    // Listener de progreso desde el backend
    window.electronAPI.planesDePago.onUpdate((datos) => {
        resultadosContainer.style.display = 'block';
        // Rueda: cliente y paso actual (el aviso trae `alias` en vez de `nombre`)
        if (datos.tipo === 'progreso' && window.ruedaTrabajando) {
            window.ruedaTrabajando.recibirAviso({ ...datos, nombre: datos.alias });
        }

        if (datos.tipo === 'representante-inicio') {
            agregarResultadoUI('representante',
                `Iniciando ${datos.representanteNombre} (${datos.totalCuits} CUITs) — Representante ${datos.indiceRepresentante + 1}/${datos.totalRepresentantes}`,
                null, null
            );
        } else if (datos.tipo === 'representante-error') {
            agregarResultadoUI('error', datos.mensaje, datos.representanteNombre, datos.representanteCuit);
        } else if (datos.tipo === 'progreso') {
            // Remover ultimo procesando
            const ultimoProcesando = resultadosContenido.querySelector('.planes-resultado-procesando:last-child');
            if (ultimoProcesando) ultimoProcesando.remove();
            agregarResultadoUI('procesando', datos.mensaje, datos.alias, datos.cuit);
        } else if (datos.tipo === 'resultado') {
            const ultimoProcesando = resultadosContenido.querySelector('.planes-resultado-procesando:last-child');
            if (ultimoProcesando) ultimoProcesando.remove();
            agregarResultadoUI(datos.estado, datos.mensaje, datos.alias, datos.cuit);

            // Detalle por plan: qué secciones se bajaron y si cerró el control
            if (Array.isArray(datos.resumenPlanes) && datos.resumenPlanes.length) {
                agregarResumenPlanesUI(datos.resumenPlanes);
            }

            // Botón abrir carpeta si hay downloadDir: componente común (componentes/archivoResultado)
            if (datos.downloadDir && datos.estado === 'exito') {
                const btnContainer = document.createElement('div');
                btnContainer.style.paddingLeft = '20px';
                btnContainer.style.marginBottom = '4px';
                btnContainer.appendChild(window.archivoResultado.crearBotones(null, {
                    abrir: false, rutaCarpeta: datos.downloadDir, etiquetaCarpeta: 'Abrir carpeta del cliente'
                }));
                resultadosContenido.appendChild(btnContainer);
            }
        } else if (datos.tipo === 'representante-fin') {
            // Silencioso, el resumen final viene con 'finalizado'
        } else if (datos.tipo === 'finalizado') {
            // Bloque aparte del registro: cuenta por cliente + Excel consolidado
            const resumen = el('div', 'planes-resumen-final');
            resumen.appendChild(el('div', 'planes-resumen-final-titulo', 'Resumen final'));
            const cuentas = [`Exitosos: ${datos.exitosos}`, `Fallidos: ${datos.fallidos}`];
            if (datos.cancelados) cuentas.push(`Cancelados: ${datos.cancelados}`);
            if (datos.cerrados) cuentas.push(`Navegador cerrado: ${datos.cerrados}`);
            resumen.appendChild(el('div', 'planes-resumen-final-cuenta', `${cuentas.join(' · ')} (clientes)`));

            // Si se generó el Excel consolidado: componente común (componentes/archivoResultado)
            if (datos.consolidado && datos.consolidado.path) {
                const t = datos.consolidado.totales || {};
                resumen.appendChild(window.archivoResultado.crearBloque(datos.consolidado.path, {
                    titulo: `Consolidado del día (${t.clientes || 0} cliente/s, ${t.planes || 0} plan/es, ${t.impagas || 0} impaga/s)`,
                    etiquetaAbrir: 'Abrir Excel consolidado'
                }));
            }
            resultadosContenido.appendChild(resumen);

            // Redirigir el foco al panel de resultados
            resultadosContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    console.log('Modulo Planes de Pago (lote) inicializado correctamente');
};
