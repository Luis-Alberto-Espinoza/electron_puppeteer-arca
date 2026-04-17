window.inicializarModuloPlanesDePago = (usuarioSeleccionado) => {
    console.log('Inicializando módulo Planes de Pago...');

    if (!usuarioSeleccionado) {
        console.error('No hay usuario seleccionado');
        return;
    }

    const representante = {
        cuit: usuarioSeleccionado.cuit || '',
        nombre: usuarioSeleccionado.nombre || `${usuarioSeleccionado.nombreSolo || ''} ${usuarioSeleccionado.apellido || ''}`.trim(),
        id: usuarioSeleccionado.id
    };

    // =========================================================================
    // ELEMENTOS DOM
    // =========================================================================
    const infoRepresentante    = document.getElementById('infoRepresentante');
    const tablaCuitsContainer  = document.getElementById('tablaCuitsContainer');
    const tbodyCuits           = document.getElementById('tbodyCuits');
    const mensajeSinAsociados  = document.getElementById('mensajeSinAsociados');
    const tabDesdeClientes     = document.getElementById('tabDesdeClientes');
    const tabManual            = document.getElementById('tabManual');
    const panelDesdeClientes   = document.getElementById('panelDesdeClientes');
    const panelManual          = document.getElementById('panelManual');
    const selectCliente        = document.getElementById('selectClienteExistente');
    const btnAgregarDesdeCliente = document.getElementById('btnAgregarDesdeCliente');
    const inputCuitManual      = document.getElementById('inputCuitManual');
    const inputAliasManual     = document.getElementById('inputAliasManual');
    const btnAgregarManual     = document.getElementById('btnAgregarManual');
    const panelEditar          = document.getElementById('panelEditar');
    const inputEditarCuit      = document.getElementById('inputEditarCuit');
    const inputEditarAlias     = document.getElementById('inputEditarAlias');
    const btnConfirmarEditar   = document.getElementById('btnConfirmarEditar');
    const btnCancelarEditar    = document.getElementById('btnCancelarEditar');
    const btnObtenerDatos      = document.getElementById('btnObtenerDatos');
    const btnCambiarUsuario    = document.getElementById('btnCambiarUsuarioPlanes');

    // =========================================================================
    // ESTADO
    // =========================================================================
    let asociados = [];          // Array actual de { cuit, alias, origen }
    let editandoCuit = null;     // CUIT que se está editando (null si no se edita)
    let ultimoDownloadDir = null; // Carpeta de la última descarga exitosa

    // =========================================================================
    // MOSTRAR INFO DEL REPRESENTANTE
    // =========================================================================
    infoRepresentante.innerHTML = `
        <div class="dato">
            <span class="dato-label">Nombre</span>
            <span class="dato-valor">${representante.nombre}</span>
        </div>
        <div class="dato">
            <span class="dato-label">CUIT</span>
            <span class="dato-valor">${representante.cuit}</span>
        </div>
    `;

    // =========================================================================
    // BOTÓN CAMBIAR USUARIO
    // =========================================================================
    if (btnCambiarUsuario) {
        btnCambiarUsuario.addEventListener('click', () => {
            // Volver al selector de usuario, reconfigurando el callback
            document.dispatchEvent(new CustomEvent('cargarModuloPlanesDePago'));
        });
    }

    // =========================================================================
    // CARGAR DATOS INICIALES
    // =========================================================================
    cargarAsociados();
    cargarClientesEnSelect();

    async function cargarAsociados() {
        const resultado = await window.electronAPI.planesDePago.cuits.get(representante.cuit);
        if (resultado.exito) {
            asociados = resultado.asociados;
        } else {
            asociados = [];
        }
        renderizarTabla();
        actualizarBotonObtener();
    }

    async function cargarClientesEnSelect() {
        const result = await window.electronAPI.user.getAll();
        selectCliente.innerHTML = '<option value="">-- Seleccionar cliente --</option>';

        if (result.success && Array.isArray(result.users)) {
            result.users.forEach(user => {
                const cuit = user.cuit ? String(user.cuit).trim() : '';
                if (!cuit) return;
                // No mostrar el propio representante
                if (cuit === representante.cuit) return;

                const nombre = `${user.nombre || ''} ${user.apellido || ''}`.trim();
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ cuit, nombre });
                opt.textContent = `${nombre} (${cuit})`;
                selectCliente.appendChild(opt);
            });
        }
    }

    // =========================================================================
    // RENDERIZAR TABLA DE ASOCIADOS (siempre incluye al titular como primera fila)
    // =========================================================================
    function renderizarTabla() {
        tbodyCuits.innerHTML = '';

        // Siempre mostrar la tabla (el titular siempre está)
        tablaCuitsContainer.style.display = 'block';
        mensajeSinAsociados.style.display = asociados.length === 0 ? 'block' : 'none';

        // Primera fila: CUIT del titular (no se puede editar ni eliminar)
        const trTitular = document.createElement('tr');
        trTitular.classList.add('fila-titular');
        trTitular.innerHTML = `
            <td class="col-check"><input type="checkbox" data-cuit="${representante.cuit}" data-es-titular="true" /></td>
            <td>${representante.cuit}</td>
            <td>${representante.nombre}</td>
            <td><span class="badge-origen badge-origen-titular">Titular</span></td>
            <td></td>
        `;
        tbodyCuits.appendChild(trTitular);

        // Filas de asociados
        asociados.forEach(asoc => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-check"><input type="checkbox" data-cuit="${asoc.cuit}" /></td>
                <td>${asoc.cuit}</td>
                <td>${asoc.alias}</td>
                <td><span class="badge-origen badge-origen-${asoc.origen}">${asoc.origen === 'users' ? 'Cliente' : 'Manual'}</span></td>
                <td>
                    <button class="planes-btn-accion planes-btn-editar" data-cuit="${asoc.cuit}">Editar</button>
                    <button class="planes-btn-accion planes-btn-eliminar" data-cuit="${asoc.cuit}">Eliminar</button>
                </td>
            `;
            tbodyCuits.appendChild(tr);
        });

        // Listeners de checkboxes
        tbodyCuits.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', actualizarBotonObtener);
        });

        // Filas clickeables: toggle checkbox al clickear la fila
        tbodyCuits.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('click', (e) => {
                // No togglear si se clickeó un botón o el propio checkbox
                if (e.target.closest('button') || e.target.tagName === 'INPUT') return;

                const cb = tr.querySelector('input[type="checkbox"]');
                if (cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            });
        });

        // Listeners de editar
        tbodyCuits.querySelectorAll('.planes-btn-editar').forEach(btn => {
            btn.addEventListener('click', () => abrirEditar(btn.dataset.cuit));
        });

        // Listeners de eliminar
        tbodyCuits.querySelectorAll('.planes-btn-eliminar').forEach(btn => {
            btn.addEventListener('click', () => eliminarAsociado(btn.dataset.cuit));
        });
    }

    // =========================================================================
    // BOTÓN OBTENER DATOS - LÓGICA DE HABILITACIÓN
    // =========================================================================
    function actualizarBotonObtener() {
        // Siempre requiere al menos un checkbox marcado (titular o asociado)
        const checkboxes = tbodyCuits.querySelectorAll('input[type="checkbox"]:checked');
        btnObtenerDatos.disabled = checkboxes.length === 0;

        if (checkboxes.length > 0) {
            btnObtenerDatos.textContent = `Obtener Datos Plan de Pagos (${checkboxes.length})`;
        } else {
            btnObtenerDatos.textContent = 'Obtener Datos Plan de Pagos';
        }
    }

    // =========================================================================
    // TABS: DESDE CLIENTES / MANUAL
    // =========================================================================
    tabDesdeClientes.addEventListener('click', () => {
        tabDesdeClientes.classList.add('planes-tab-activo');
        tabManual.classList.remove('planes-tab-activo');
        panelDesdeClientes.style.display = 'flex';
        panelManual.style.display = 'none';
    });

    tabManual.addEventListener('click', () => {
        tabManual.classList.add('planes-tab-activo');
        tabDesdeClientes.classList.remove('planes-tab-activo');
        panelManual.style.display = 'flex';
        panelDesdeClientes.style.display = 'none';
    });

    // =========================================================================
    // AGREGAR DESDE CLIENTES EXISTENTES
    // =========================================================================
    btnAgregarDesdeCliente.addEventListener('click', async () => {
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

        if (!resultado.exito) {
            alert(resultado.error);
            return;
        }

        selectCliente.value = '';
        await cargarAsociados();
    });

    // =========================================================================
    // AGREGAR MANUAL
    // =========================================================================
    btnAgregarManual.addEventListener('click', async () => {
        const cuit = inputCuitManual.value.trim();
        const alias = inputAliasManual.value.trim();

        if (!cuit) {
            inputCuitManual.classList.add('input-error');
            setTimeout(() => inputCuitManual.classList.remove('input-error'), 1500);
            return;
        }
        if (!alias) {
            inputAliasManual.classList.add('input-error');
            setTimeout(() => inputAliasManual.classList.remove('input-error'), 1500);
            return;
        }

        const resultado = await window.electronAPI.planesDePago.cuits.guardar({
            cuitRepresentante: representante.cuit,
            nombreRepresentante: representante.nombre,
            asociado: { cuit, alias, origen: 'manual' }
        });

        if (!resultado.exito) {
            alert(resultado.error);
            return;
        }

        inputCuitManual.value = '';
        inputAliasManual.value = '';
        await cargarAsociados();
    });

    // =========================================================================
    // EDITAR ASOCIADO
    // =========================================================================
    function abrirEditar(cuit) {
        const asoc = asociados.find(a => a.cuit === cuit);
        if (!asoc) return;

        editandoCuit = cuit;
        inputEditarCuit.value = asoc.cuit;
        inputEditarAlias.value = asoc.alias;
        panelEditar.style.display = 'block';
        inputEditarCuit.focus();
    }

    function cerrarEditar() {
        panelEditar.style.display = 'none';
        editandoCuit = null;
        inputEditarCuit.value = '';
        inputEditarAlias.value = '';
    }

    btnCancelarEditar.addEventListener('click', cerrarEditar);

    btnConfirmarEditar.addEventListener('click', async () => {
        const cuitNuevo = inputEditarCuit.value.trim();
        const aliasNuevo = inputEditarAlias.value.trim();

        if (!cuitNuevo) {
            inputEditarCuit.classList.add('input-error');
            setTimeout(() => inputEditarCuit.classList.remove('input-error'), 1500);
            return;
        }
        if (!aliasNuevo) {
            inputEditarAlias.classList.add('input-error');
            setTimeout(() => inputEditarAlias.classList.remove('input-error'), 1500);
            return;
        }

        const resultado = await window.electronAPI.planesDePago.cuits.editar({
            cuitRepresentante: representante.cuit,
            cuitViejo: editandoCuit,
            datosNuevos: { cuit: cuitNuevo, alias: aliasNuevo }
        });

        if (!resultado.exito) {
            alert(resultado.error);
            return;
        }

        cerrarEditar();
        await cargarAsociados();
    });

    // =========================================================================
    // ELIMINAR ASOCIADO
    // =========================================================================
    async function eliminarAsociado(cuit) {
        const asoc = asociados.find(a => a.cuit === cuit);
        if (!asoc) return;

        if (!confirm(`¿Eliminar el CUIT asociado "${asoc.alias}" (${asoc.cuit})? Esta acción no se puede deshacer.`)) return;

        const resultado = await window.electronAPI.planesDePago.cuits.eliminar({
            cuitRepresentante: representante.cuit,
            cuitAsociado: cuit
        });

        if (!resultado.exito) {
            alert(resultado.error);
            return;
        }

        await cargarAsociados();
    }

    // =========================================================================
    // BOTÓN OBTENER DATOS
    // =========================================================================
    btnObtenerDatos.addEventListener('click', async () => {
        let cuitsAProcesar = [];

        // Obtener todos los checkboxes marcados (titular + asociados)
        const checkboxes = tbodyCuits.querySelectorAll('input[type="checkbox"]:checked');
        checkboxes.forEach(cb => {
            if (cb.dataset.esTitular === 'true') {
                // Es el titular
                cuitsAProcesar.push({ cuit: representante.cuit, alias: representante.nombre });
            } else {
                // Es un asociado
                const asoc = asociados.find(a => a.cuit === cb.dataset.cuit);
                if (asoc) cuitsAProcesar.push(asoc);
            }
        });

        if (cuitsAProcesar.length === 0) {
            alert('Seleccione al menos un CUIT.');
            return;
        }

        const nombres = cuitsAProcesar.map(c => `${c.alias} (${c.cuit})`).join('\n - ');
        if (!confirm(`Se procesarán ${cuitsAProcesar.length} CUIT(s):\n\n - ${nombres}\n\n¿Desea continuar?`)) return;

        // Deshabilitar botón durante el proceso
        btnObtenerDatos.disabled = true;
        btnObtenerDatos.textContent = 'Procesando...';

        // Mostrar panel de resultados
        resultadosContainer.style.display = 'block';
        resultadosContenido.innerHTML = '';

        try {
            const resultado = await window.electronAPI.planesDePago.generar({
                representante,
                cuitsAProcesar
            });

            if (resultado.success) {
                console.log('Procesamiento completado:', resultado);

                // Buscar la carpeta de descarga en los resultados
                let carpetaDescarga = null;
                if (resultado.resultados) {
                    for (const res of resultado.resultados) {
                        if (res.planes) {
                            const planConPdf = res.planes.find(p => p.pdf && p.pdf.downloadDir);
                            if (planConPdf) {
                                carpetaDescarga = planConPdf.pdf.downloadDir;
                                break;
                            }
                        }
                    }
                }

                // Mostrar botón "Abrir carpeta" si hay archivos generados
                if (carpetaDescarga) {
                    const btnContainer = document.createElement('div');
                    btnContainer.style.textAlign = 'center';
                    btnContainer.style.marginTop = '12px';
                    const btnAbrir = document.createElement('button');
                    btnAbrir.className = 'planes-btn-abrir-carpeta';
                    btnAbrir.textContent = 'Abrir carpeta de archivos generados';
                    btnAbrir.addEventListener('click', () => {
                        window.electronAPI.abrirDirectorio(carpetaDescarga);
                    });
                    btnContainer.appendChild(btnAbrir);
                    resultadosContenido.appendChild(btnContainer);
                }
            } else {
                agregarResultadoUI('error', resultado.message);
            }

        } catch (error) {
            agregarResultadoUI('error', `Error de comunicación: ${error.message}`);
        }

        btnObtenerDatos.disabled = false;
        btnObtenerDatos.textContent = 'Obtener Datos Plan de Pagos';
        actualizarBotonObtener();
    });

    // =========================================================================
    // PANEL DE RESULTADOS Y PROGRESO
    // =========================================================================
    // Crear el contenedor de resultados dinámicamente
    const planesContainer = document.querySelector('.planes-container');
    const resultadosContainer = document.createElement('div');
    resultadosContainer.className = 'planes-seccion';
    resultadosContainer.id = 'resultadosPlanesDePago';
    resultadosContainer.style.display = 'none';
    resultadosContainer.innerHTML = `
        <div class="planes-seccion-titulo">Resultados</div>
        <div id="resultadosContenido"></div>
    `;
    planesContainer.appendChild(resultadosContainer);
    const resultadosContenido = document.getElementById('resultadosContenido');

    function agregarResultadoUI(estado, mensaje, alias, cuit) {
        const div = document.createElement('div');
        div.className = `planes-resultado planes-resultado-${estado}`;

        let icono = '';
        if (estado === 'procesando') icono = '⏳';
        else if (estado === 'exito') icono = '✅';
        else if (estado === 'error') icono = '❌';
        else if (estado === 'finalizado') icono = '🏁';

        const label = alias ? `${alias} (${cuit})` : '';
        div.innerHTML = `<span>${icono} ${label ? `<strong>${label}</strong> — ` : ''}${mensaje}</span>`;
        resultadosContenido.appendChild(div);
    }

    // Listener de progreso desde el backend
    window.electronAPI.planesDePago.onUpdate((datos) => {
        resultadosContainer.style.display = 'block';

        if (datos.tipo === 'progreso') {
            agregarResultadoUI('procesando', datos.mensaje, datos.alias, datos.cuit);
        } else if (datos.tipo === 'resultado') {
            // Remover el último "procesando" si existe
            const ultimoProcesando = resultadosContenido.querySelector('.planes-resultado-procesando:last-child');
            if (ultimoProcesando) ultimoProcesando.remove();

            agregarResultadoUI(datos.estado, datos.mensaje, datos.alias, datos.cuit);
        } else if (datos.tipo === 'finalizado') {
            agregarResultadoUI('finalizado',
                `Procesamiento completado. Exitosos: ${datos.exitosos}, Fallidos: ${datos.fallidos}`
            );
        }
    });

    console.log('Módulo Planes de Pago inicializado correctamente');
};
