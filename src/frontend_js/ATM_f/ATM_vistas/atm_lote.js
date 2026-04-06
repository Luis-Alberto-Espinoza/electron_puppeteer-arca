window.inicializarModuloLoteATM = () => {
    console.log('Inicializando módulo de procesamiento por lote ATM...');

    // =========================================================================
    // CONFIGURACIÓN DE SUBSERVICIOS
    // =========================================================================
    const CONFIG_SUB = {
        constancias: {
            label:         'Constancias',
            tienePeriodo:  false,
            ejecutar:      (clientes) => window.electronAPI.atm.constanciaFiscal.generarLote({ usuarios: clientes })
        },
        planesPago: {
            label:         'Planes de Pago',
            tienePeriodo:  false,
            ejecutar:      (clientes) => window.electronAPI.atm.planDePago.generarLote({ usuarios: clientes })
        },
        tasaCero: {
            label:         'Tasa Cero',
            tienePeriodo:  true,
            periodoDefault: 'current',   // índice 0 → mes actual
            ejecutar:      (clientes) => window.electronAPI.atm.tasaCero.generarLote({ clientes })
        },
        retenciones: {
            label:         'Retenciones',
            tienePeriodo:  true,
            periodoDefault: 'previous',  // índice 1 → mes anterior
            ejecutar:      (clientes) => window.electronAPI.atm.retenciones.generarLote({ usuarios: clientes })
        }
    };

    // =========================================================================
    // ESTADO
    // =========================================================================
    let subservicioActivo = null;
    let selectorUsuarios  = null;

    // =========================================================================
    // ELEMENTOS DOM
    // =========================================================================
    const panelConfiguracion  = document.getElementById('panel-configuracion');
    const panelPeriodo        = document.getElementById('panel-periodo');
    const selectPeriodo       = document.getElementById('selectPeriodoGlobal');
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
    const matchResultado      = document.getElementById('match-resultado');
    const procesandoContainer = document.getElementById('lote-procesando-ahora');
    const finalizadosContainer= document.getElementById('lote-finalizados-container');
    const finalizadosDiv      = document.getElementById('lote-finalizados');

    // Ocultar paneles de resultados al iniciar
    procesandoContainer.style.display  = 'none';
    finalizadosContainer.style.display = 'none';

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

    // =========================================================================
    // INICIALIZAR SELECTOR DE USUARIOS (se crea una sola vez)
    // =========================================================================
    if (typeof SelectorUsuarios === 'undefined') {
        console.error('SelectorUsuarios no está definido. Reintentando...');
        setTimeout(window.inicializarModuloLoteATM, 100);
        return;
    }

    selectorUsuarios = new SelectorUsuarios('selector-usuarios-atm', {
        campoCredencial:  'claveATM',
        campoEstado:      'estado_atm',
        campoError:       'errorAtm',
        permitirInvalidos:   false,
        permitirSinValidar:  false,
        mensajeSinValidar:   'Debe validar las credenciales ATM primero',
        renderizarColumnasExtras: (usuario) => {
            let badge = '';
            let cssClass = '';
            if (usuario.estado_atm === 'validado')      { badge = '✅ Validado';   cssClass = 'badge-validado'; }
            else if (usuario.estado_atm === 'invalido') { badge = '❌ Inválido';   cssClass = 'badge-invalido'; }
            else                                         { badge = '⚠️ Sin validar'; cssClass = 'badge-sin-validar'; }
            return `<td class="estado-cell"><span class="badge ${cssClass}">${badge}</span></td>`;
        },
        headersColumnasExtras: ['Estado'],
        onCambioSeleccion: (seleccionados) => {
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

        // Poblar periodo si aún no fue poblado
        if (config.tienePeriodo) {
            if (selectPeriodo.options.length === 0) {
                generarOpcionesPeriodo().forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p;
                    opt.textContent = p;
                    selectPeriodo.appendChild(opt);
                });
            }
            // Aplicar periodo por defecto según el subservicio
            selectPeriodo.selectedIndex = config.periodoDefault === 'previous' ? 1 : 0;
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
            lista.clienteIds.forEach(id => {
                const existe = selectorUsuarios.todosLosUsuarios.some(u => String(u.id) === String(id));
                if (existe) {
                    selectorUsuarios.toggleSeleccion(id);
                } else {
                    noEncontrados.push(id);
                }
            });
            if (noEncontrados.length > 0) {
                mostrarMatchResultado([],
                    [`${noEncontrados.length} cliente(s) guardado(s) ya no existen en la base de datos`]
                );
            }
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
            html += `<div class="match-ok">✅ ${seleccionados.length} cliente(s) seleccionado(s)</div>`;
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

        // Agregar periodo si corresponde
        if (config.tienePeriodo) {
            const periodoSeleccionado = selectPeriodo.value;
            if (!periodoSeleccionado) { alert('Seleccione un periodo.'); return; }
            const periodoBackend = periodoParaBackend(periodoSeleccionado);
            clientes.forEach(c => { c.periodo = periodoBackend; });
        }

        const nombresClientes = clientes.map(c => `${c.nombre || ''} ${c.apellido || ''}`.trim()).join('\n - ');
        const confirmacion = confirm(
            `Se iniciará el proceso de ${config.label} para ${clientes.length} cliente(s):\n\n - ${nombresClientes}\n\n¿Desea continuar?`
        );
        if (!confirmacion) return;

        prepararUIParaProceso();

        try {
            await config.ejecutar(clientes);
        } catch (error) {
            procesandoContainer.innerHTML = `<div class="progreso-item status-error">Error de comunicación: ${error.message}</div>`;
        }
    });

    function prepararUIParaProceso() {
        procesandoContainer.innerHTML = '<h3>Procesando Usuario Actual:</h3>';
        finalizadosDiv.innerHTML      = '';
        procesandoContainer.style.display  = 'block';
        finalizadosContainer.style.display = 'none';
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
    }

    // =========================================================================
    // MANEJO DE PROGRESO (compartido por todos los subservicios)
    // =========================================================================
    const userDivMap = new Map();

    const manejarActualizacionProgreso = (datos) => {
        const { userId, clienteId, nombre, status, estado, mensaje, files = [], archivoPdf, downloadDir, resumen } = datos;
        const idUsuario   = userId || clienteId;
        const estadoFinal = status || estado;

        if (estadoFinal === 'general')    return;
        if (estadoFinal === 'finalizado') { procesandoContainer.style.display = 'none'; return; }

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

        const isFinalStatus = ['exito_final', 'error', 'exito'].includes(estadoFinal);
        const messageContainer = userDiv.querySelector('.message-container');
        messageContainer.innerHTML = `<div class="progreso-item">[${new Date().toLocaleTimeString()}] ${mensaje}</div>`;

        if (isFinalStatus) {
            finalizadosContainer.style.display = 'block';
            finalizadosDiv.appendChild(userDiv);
            if (procesandoContainer.contains(userDiv)) procesandoContainer.removeChild(userDiv);
            if (procesandoContainer.children.length <= 1) procesandoContainer.style.display = 'none';

            let badge = estadoFinal === 'error'
                ? '<span class="badge bg-danger">FALLO</span>'
                : `<span class="badge bg-success">Éxito - ${files.length || (archivoPdf ? 1 : 0)} archivo(s)</span>`;
            userDiv.querySelector('h4').innerHTML = `${nombre} ${badge}`;

            if (estadoFinal !== 'error') {
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
                if (downloadDir && archivosParaMostrar.length > 0) {
                    const dirWrapper = document.createElement('div');
                    dirWrapper.className = 'lote-dir-container d-flex justify-content-between align-items-center';
                    dirWrapper.innerHTML = `<code>${downloadDir}</code>`;

                    const openDirBtn = document.createElement('button');
                    openDirBtn.textContent = 'Abrir Carpeta';
                    openDirBtn.className = 'btn btn-sm lote-btn-abrir-carpeta';
                    openDirBtn.onclick = () => window.electronAPI.abrirDirectorio(downloadDir);
                    dirWrapper.appendChild(openDirBtn);
                    userDiv.appendChild(dirWrapper);

                    const fileList = document.createElement('ul');
                    fileList.className = 'list-group mt-1';
                    archivosParaMostrar.forEach(filePath => {
                        const fileItem = document.createElement('li');
                        fileItem.className = 'list-group-item bg-transparent text-light d-flex justify-content-between align-items-center p-1';
                        const fileName = document.createElement('span');
                        fileName.textContent = filePath.split('/').pop().split('\\').pop();
                        fileName.style.marginRight = '15px';
                        fileItem.appendChild(fileName);
                        const openFileBtn = document.createElement('button');
                        openFileBtn.textContent = 'Abrir Archivo';
                        openFileBtn.className = 'btn btn-sm lote-btn-abrir-archivo';
                        openFileBtn.onclick = () => window.electronAPI.abrirArchivo(filePath);
                        fileItem.appendChild(openFileBtn);
                        fileList.appendChild(fileItem);
                    });
                    userDiv.appendChild(fileList);
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

    console.log('✅ Módulo de lote ATM inicializado completamente');
};
