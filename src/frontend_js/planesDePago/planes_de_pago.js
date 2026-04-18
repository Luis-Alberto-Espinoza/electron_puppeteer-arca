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
    const btnLimpiar           = document.getElementById('btnLimpiarSeleccionPlanes');
    const panelCuitsRepresentantes = document.getElementById('panelCuitsRepresentantes');
    const contenedorBloques    = document.getElementById('contenedorBloquesRepresentantes');
    const btnObtenerDatos      = document.getElementById('btnObtenerDatos');
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

    selectorUsuarios = new SelectorUsuarios('selector-representantes-planes', {
        mostrarTablaSeleccionados: true,
        campoCredencial: 'claveAFIP',
        campoEstado: 'estado_afip',
        campoError: 'errorAfip',
        permitirInvalidos: false,
        permitirSinValidar: false,
        mensajeSinValidar: 'Debe validar las credenciales AFIP primero',
        renderizarColumnasExtras: (usuario) => {
            let badge = '';
            let cssClass = '';
            if (usuario.estado_afip === 'validado')      { badge = 'Validado';    cssClass = 'badge-validado'; }
            else if (usuario.estado_afip === 'invalido') { badge = 'Invalido';    cssClass = 'badge-invalido'; }
            else                                          { badge = 'Sin validar'; cssClass = 'badge-sin-validar'; }
            return `<td class="estado-cell"><span class="badge ${cssClass}">${badge}</span></td>`;
        },
        headersColumnasExtras: ['Estado'],
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
        if (Array.isArray(lista.representantes)) {
            lista.representantes.forEach(rep => {
                const existe = selectorUsuarios.todosLosUsuarios.some(u => String(u.id) === String(rep.id));
                if (existe) {
                    selectorUsuarios.toggleSeleccion(rep.id);
                } else {
                    noEncontrados.push(rep.nombre || rep.id);
                }
            });

            // Restaurar CUITs seleccionados después de que los paneles se hayan generado
            setTimeout(() => {
                lista.representantes.forEach(rep => {
                    const estado = estadoRepresentantes.get(String(rep.id));
                    if (estado && Array.isArray(rep.cuitsSeleccionados)) {
                        estado.cuitsSeleccionados = new Set(rep.cuitsSeleccionados);
                        renderizarBloqueCuits(estado);
                    }
                });
                actualizarResumen();
            }, 300);
        }

        if (noEncontrados.length > 0) {
            mostrarMatchResultado([],
                [`${noEncontrados.length} representante(s) guardado(s) ya no existen en la base de datos`]
            );
        }
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
                    const yaSeleccionado = selectorUsuarios.obtenerSeleccionados().some(s => String(s.id) === String(u.id));
                    if (!yaSeleccionado) selectorUsuarios.toggleSeleccion(u.id);
                });
            }
        });

        const seleccionados = selectorUsuarios.obtenerSeleccionados();
        mostrarMatchResultado(seleccionados, noEncontrados.map(t => `"${t}" — sin coincidencias`));
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
    // LIMPIAR SELECCIÓN
    // =========================================================================
    btnLimpiar.addEventListener('click', () => {
        selectorUsuarios.limpiarSeleccion();
        estadoRepresentantes.clear();
        matchResultado.style.display = 'none';
        actualizarPanelesCuits([]);
    });

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
    async function actualizarPanelesCuits(representantesSeleccionados) {
        if (representantesSeleccionados.length === 0) {
            panelCuitsRepresentantes.style.display = 'none';
            contenedorBloques.innerHTML = '';
            estadoRepresentantes.clear();
            actualizarResumen();
            return;
        }

        panelCuitsRepresentantes.style.display = 'block';

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

                // Cargar CUITs asociados
                let asociados = [];
                try {
                    const resultado = await window.electronAPI.planesDePago.cuits.get(representante.cuit);
                    if (resultado.exito) asociados = resultado.asociados;
                } catch (e) {
                    console.error('Error cargando asociados:', e);
                }

                // Si solo hay titular (sin asociados) → auto-seleccionar.
                // Si hay asociados → ninguno preseleccionado, el usuario debe elegir.
                const cuitsSeleccionados = asociados.length === 0
                    ? new Set([representante.cuit])
                    : new Set();

                estadoRepresentantes.set(id, {
                    representante,
                    asociados,
                    cuitsSeleccionados
                });
            }
        }

        // Renderizar todos los bloques
        renderizarTodosBloques();
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
    // ACTUALIZAR BOTÓN PROCESAR (según CUITs seleccionados)
    // =========================================================================
    function actualizarResumen() {
        let totalCuits = 0;
        let totalRepresentantes = 0;

        estadoRepresentantes.forEach(estado => {
            if (estado.cuitsSeleccionados.size > 0) {
                totalRepresentantes++;
                totalCuits += estado.cuitsSeleccionados.size;
            }
        });

        if (totalCuits > 0) {
            btnObtenerDatos.disabled = false;
            btnObtenerDatos.textContent = `▶ Obtener Datos Plan de Pagos (${totalCuits} CUITs de ${totalRepresentantes} rep.)`;
        } else {
            btnObtenerDatos.disabled = true;
            btnObtenerDatos.textContent = '▶ Obtener Datos Plan de Pagos';
        }
    }

    // =========================================================================
    // BOTÓN OBTENER DATOS (ejecutar lote)
    // =========================================================================
    btnObtenerDatos.addEventListener('click', async () => {
        // Construir el lote
        const loteRepresentantes = [];

        estadoRepresentantes.forEach(estado => {
            if (estado.cuitsSeleccionados.size === 0) return;

            const cuitsAProcesar = [];
            // Titular
            if (estado.cuitsSeleccionados.has(estado.representante.cuit)) {
                cuitsAProcesar.push({
                    cuit: estado.representante.cuit,
                    alias: estado.representante.nombre
                });
            }
            // Asociados
            estado.asociados.forEach(asoc => {
                if (estado.cuitsSeleccionados.has(asoc.cuit)) {
                    cuitsAProcesar.push({ cuit: asoc.cuit, alias: asoc.alias });
                }
            });

            if (cuitsAProcesar.length > 0) {
                loteRepresentantes.push({
                    representante: estado.representante,
                    cuitsAProcesar
                });
            }
        });

        if (loteRepresentantes.length === 0) {
            alert('No hay CUITs seleccionados.');
            return;
        }

        // Confirmación
        let detalleMsg = '';
        loteRepresentantes.forEach(lr => {
            detalleMsg += `\n${lr.representante.nombre} (${lr.cuitsAProcesar.length} CUITs)`;
            lr.cuitsAProcesar.forEach(c => {
                detalleMsg += `\n  - ${c.alias} (${c.cuit})`;
            });
        });

        if (!confirm(`Se procesaran ${loteRepresentantes.length} representante(s):${detalleMsg}\n\nDesea continuar?`)) return;

        // Deshabilitar UI
        btnObtenerDatos.disabled = true;
        btnObtenerDatos.textContent = 'Procesando...';

        // Mostrar panel de resultados
        resultadosContainer.style.display = 'block';
        resultadosContenido.innerHTML = '';

        try {
            const resultado = await window.electronAPI.planesDePago.generarLote({
                loteRepresentantes
            });

            if (resultado.success) {
                console.log('Procesamiento lote completado:', resultado);
            } else {
                agregarResultadoUI('error', resultado.message);
            }
        } catch (error) {
            agregarResultadoUI('error', `Error de comunicacion: ${error.message}`);
        }

        btnObtenerDatos.disabled = false;
        btnObtenerDatos.textContent = 'Obtener Datos Plan de Pagos';
        actualizarResumen();
    });

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
        else if (estado === 'finalizado') icono = 'FIN';
        else if (estado === 'representante') icono = '>>>';

        const label = alias ? `${alias} (${cuit})` : '';
        div.innerHTML = `<span>${icono} ${label ? `<strong>${label}</strong> — ` : ''}${mensaje}</span>`;
        resultadosContenido.appendChild(div);

        // Auto-scroll
        resultadosContenido.scrollTop = resultadosContenido.scrollHeight;
    }

    // Listener de progreso desde el backend
    window.electronAPI.planesDePago.onUpdate((datos) => {
        resultadosContainer.style.display = 'block';

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

            // Botón abrir carpeta si hay downloadDir
            if (datos.downloadDir && datos.estado === 'exito') {
                const btnContainer = document.createElement('div');
                btnContainer.style.paddingLeft = '20px';
                btnContainer.style.marginBottom = '4px';
                const btnAbrir = document.createElement('button');
                btnAbrir.className = 'planes-btn-abrir-carpeta';
                btnAbrir.textContent = 'Abrir carpeta';
                btnAbrir.addEventListener('click', () => {
                    window.electronAPI.abrirDirectorio(datos.downloadDir);
                });
                btnContainer.appendChild(btnAbrir);
                resultadosContenido.appendChild(btnContainer);
            }
        } else if (datos.tipo === 'representante-fin') {
            // Silencioso, el resumen final viene con 'finalizado'
        } else if (datos.tipo === 'finalizado') {
            agregarResultadoUI('finalizado',
                `Procesamiento completado. Exitosos: ${datos.exitosos}, Fallidos: ${datos.fallidos}`
            );

            // Redirigir el foco al panel de resultados
            resultadosContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Si se generó el Excel consolidado, mostrar botón para abrirlo
            if (datos.consolidado && datos.consolidado.path) {
                const t = datos.consolidado.totales || {};
                const btnContainer = document.createElement('div');
                btnContainer.style.padding = '10px 20px';
                btnContainer.style.marginTop = '8px';

                const infoTexto = document.createElement('div');
                infoTexto.style.fontSize = '13px';
                infoTexto.style.marginBottom = '6px';
                infoTexto.textContent = `Resumen consolidado generado (${t.clientes || 0} cliente/s, ${t.planes || 0} plan/es, ${t.impagas || 0} impaga/s)`;
                btnContainer.appendChild(infoTexto);

                const btnAbrir = document.createElement('button');
                btnAbrir.className = 'planes-btn-abrir-carpeta';
                btnAbrir.textContent = 'Abrir Excel consolidado';
                btnAbrir.addEventListener('click', () => {
                    window.electronAPI.abrirArchivo
                        ? window.electronAPI.abrirArchivo(datos.consolidado.path)
                        : window.electronAPI.abrirDirectorio(datos.consolidado.path.split(/[\\/]/).slice(0, -1).join('/'));
                });
                btnContainer.appendChild(btnAbrir);
                resultadosContenido.appendChild(btnContainer);
            }
        }
    });

    console.log('Modulo Planes de Pago (lote) inicializado correctamente');
};
