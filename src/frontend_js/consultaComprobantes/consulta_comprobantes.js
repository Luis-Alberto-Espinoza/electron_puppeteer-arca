/**
 * Frontend del módulo Consulta de Comprobantes Emitidos.
 * Expone window.inicializarConsultaComprobantes() para que controlador.js lo invoque.
 */
window.inicializarConsultaComprobantes = () => {
    console.log('🔵 [ConsultaComprobantes] Inicializando módulo...');

    const selectPdv       = document.getElementById('cc-select-pdv');
    const selectTipo      = document.getElementById('cc-select-tipo');
    const btnRefrescarPdv = document.getElementById('cc-btn-refrescar-pdv');
    const pdvInfo         = document.getElementById('cc-pdv-info');

    const inputDesde      = document.getElementById('cc-fecha-desde');
    const inputHasta      = document.getElementById('cc-fecha-hasta');
    const btnConsultar    = document.getElementById('cc-btn-consultar');
    const btnVolver       = document.getElementById('cc-btn-volver');
    const mensajeError    = document.getElementById('cc-mensaje-error');
    const procesando      = document.getElementById('cc-procesando');
    const procesandoText  = document.getElementById('cc-procesando-texto');
    const resultados      = document.getElementById('cc-resultados');
    const totalCantidad   = document.getElementById('cc-total-cantidad');
    const totalSuma       = document.getElementById('cc-total-suma');
    const tablaBody       = document.getElementById('cc-tabla-body');

    // Cliente actualmente elegido en el buscador (objeto usuario completo, viene
    // del componente SelectorUsuarios). null si no hay ninguno seleccionado.
    let clienteSeleccionado = null;

    // dd/mm/aaaa de hoy, para preestablecer "Fecha hasta" y ahorrar clicks.
    function hoyDDMMYYYY() {
        const d = new Date();
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        return `${dia}/${mes}/${d.getFullYear()}`;
    }

    // ===== Flatpickr para fechas (si está disponible) =====
    // "Fecha hasta" arranca en el día de hoy: es el caso más común y evita
    // que el usuario tenga que abrir el calendario y tipear la fecha.
    if (typeof flatpickr === 'function') {
        const cfg = {
            dateFormat: 'd/m/Y',
            allowInput: true,
            locale: (typeof flatpickr.l10ns !== 'undefined' && flatpickr.l10ns.es) ? flatpickr.l10ns.es : undefined
        };
        flatpickr(inputDesde, cfg);
        flatpickr(inputHasta, { ...cfg, defaultDate: new Date() });
    } else {
        // Sin flatpickr igual dejamos la fecha de hoy escrita en el input.
        inputHasta.value = hoyDDMMYYYY();
    }

    // ===== Buscador de clientes (componente compartido SelectorUsuarios) =====
    // Mismo buscador que usan VEP / Cuenta Tributaria / ATM. Selección única:
    // al elegir otro cliente se reemplaza el anterior. Con requiereAnalisis, los
    // clientes sin analizar ni siquiera aparecen en la lista (no se pueden operar).
    montarSelectorClientes();

    function montarSelectorClientes() {
        if (typeof SelectorUsuarios === 'undefined') {
            console.warn('SelectorUsuarios aún no disponible — reintentando...');
            setTimeout(montarSelectorClientes, 100);
            return;
        }
        new SelectorUsuarios('cc-selector-cliente', {
            fuente: 'contribuyentes',     // modelo plano: El Papi aparece como fila propia
            servicio: 'facturacion',      // operable = acceso AFIP validado + tiene PDV
            seleccionUnica: true,
            mostrarTablaSeleccionados: false,
            mostrarColumnaCUIT: false,
            onCambioSeleccion: (seleccionados) => onClienteSeleccionado(seleccionados[0] || null)
        });
    }

    // ===== Cambio de contribuyente → poblar puntos de venta (cacheados) =====
    // En el modelo plano el contribuyente YA es la "empresa": no hay cascada
    // cliente→empresa. Cargamos directo sus PDV cacheados (los trajo la migración).
    async function onClienteSeleccionado(contribuyente) {
        clienteSeleccionado = contribuyente;
        resetPdv('Seleccione primero un cliente');

        if (!contribuyente) {
            actualizarEstadoBoton();
            return;
        }

        mostrarPdvInfo('Cargando puntos de venta…', 'loading');
        try {
            const res = await window.electronAPI.contribuyente.puntosDeVenta(contribuyente.cuit);
            if (res && res.success) {
                popularPdv(res.puntosDeVenta);
                if (Array.isArray(res.puntosDeVenta) && res.puntosDeVenta.length > 0) {
                    mostrarPdvInfo(`${res.puntosDeVenta.length} punto(s) de venta`, 'idle');
                }
            } else {
                resetPdv('No se pudieron cargar los puntos de venta');
                mostrarPdvInfo(res?.error || 'Error al cargar puntos de venta', 'error');
            }
        } catch (e) {
            resetPdv('Error al cargar puntos de venta');
            mostrarPdvInfo(e.message || 'Error inesperado', 'error');
        }
        // Redescubrir PDV desde AFIP queda para un sub-paso siguiente.
        mostrarBtnRefrescar(false);
        actualizarEstadoBoton();
    }

    // ===== Botón Refrescar PDV =====
    // Vuelve a leer los PDV desde AFIP con el análisis del modelo plano (login por
    // resolverAcceso, guarda en contribuyentes.json) y recarga la lista.
    btnRefrescarPdv.addEventListener('click', async () => {
        const cuit = clienteSeleccionado?.cuit;
        if (!cuit) return;
        await descubrirYPopularPdv(cuit);
    });

    function mostrarBtnRefrescar(visible) {
        btnRefrescarPdv.style.display = visible ? '' : 'none';
    }

    async function descubrirYPopularPdv(cuit) {
        selectPdv.innerHTML = '<option value="">Descubriendo puntos de venta…</option>';
        selectPdv.disabled = true;
        btnRefrescarPdv.disabled = true;
        mostrarBtnRefrescar(true);
        mostrarPdvInfo('Conectando a AFIP para leer los puntos de venta — puede demorar 20–40s', 'loading');
        actualizarEstadoBoton();

        try {
            const res = await window.electronAPI.empresa.analizarContribuyente({ cuit, visible: document.getElementById('chk-visible-cc')?.checked !== false });
            if (!res || !res.success) {
                resetPdv('Error al descubrir puntos de venta');
                mostrarPdvInfo(res?.message || 'Error al descubrir puntos de venta', 'error');
                mostrarBtnRefrescar(true);
                btnRefrescarPdv.disabled = false;
                actualizarEstadoBoton();
                return;
            }

            // El análisis ya guardó los PDV en el contribuyente: los releemos de ahí.
            const pdvRes = await window.electronAPI.contribuyente.puntosDeVenta(cuit);
            const pdvs = (pdvRes && pdvRes.success) ? pdvRes.puntosDeVenta : [];

            popularPdv(pdvs);
            // Solo pisamos el mensaje si vinieron PDV. Si vino lista vacía,
            // popularPdv() ya dejó el aviso rojo de "sin facturación habilitada".
            if (Array.isArray(pdvs) && pdvs.length > 0) {
                mostrarPdvInfo(`Actualizado ahora — ${pdvs.length} punto(s) de venta encontrado(s)`, 'idle');
            }
            mostrarBtnRefrescar(true);
            btnRefrescarPdv.disabled = false;
        } catch (e) {
            console.error('Error descubriendo pdv:', e);
            resetPdv('Error al descubrir puntos de venta');
            mostrarPdvInfo(e.message || 'Error inesperado', 'error');
            mostrarBtnRefrescar(true);
            btnRefrescarPdv.disabled = false;
            actualizarEstadoBoton();
        }
    }

    function popularPdv(pdvs) {
        if (!Array.isArray(pdvs) || pdvs.length === 0) {
            selectPdv.innerHTML = '<option value="">— sin facturación habilitada —</option>';
            selectPdv.disabled = true;
            mostrarPdvInfo(
                '⚠️ Esta empresa no tiene facturación habilitada en AFIP. No se pueden consultar comprobantes emitidos porque no existen puntos de venta activos.',
                'error'
            );
            mostrarBtnRefrescar(true);
            btnRefrescarPdv.disabled = false;
            actualizarEstadoBoton();
            return;
        }
        selectPdv.innerHTML = '<option value="">Seleccione un punto de venta</option>';
        pdvs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.numero;
            opt.textContent = p.descripcion ? `${p.numero} — ${p.descripcion}` : p.numero;
            selectPdv.appendChild(opt);
        });
        selectPdv.disabled = false;
        actualizarEstadoBoton();
    }

    function resetPdv(placeholder) {
        selectPdv.innerHTML = `<option value="">${placeholder}</option>`;
        selectPdv.disabled = true;
        pdvInfo.style.display = 'none';
        pdvInfo.className = 'cc-pdv-info';
        pdvInfo.textContent = '';
        mostrarBtnRefrescar(false);
    }

    function mostrarPdvInfo(texto, tipo) {
        pdvInfo.textContent = texto;
        const sufijo = tipo === 'loading' ? ' cc-pdv-loading'
            : tipo === 'error'   ? ' cc-pdv-error'
            : tipo === 'stale'   ? ' cc-pdv-stale'
            : '';
        pdvInfo.className = 'cc-pdv-info' + sufijo;
        pdvInfo.style.display = 'block';
    }

    // ===== Validar y habilitar botón =====
    [selectPdv, inputDesde, inputHasta].forEach(el => {
        el.addEventListener('change', actualizarEstadoBoton);
        el.addEventListener('input', actualizarEstadoBoton);
    });

    function actualizarEstadoBoton() {
        // El punto de venta es OPCIONAL: si no se elige, AFIP trae los
        // comprobantes de todos los puntos de venta. Exigimos contribuyente
        // y rango de fechas.
        const ok = clienteSeleccionado
            && clienteSeleccionado.cuit
            && inputDesde.value
            && inputHasta.value;
        btnConsultar.disabled = !ok;
    }

    // ===== Botón Volver =====
    btnVolver.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('volverHomeAfip'));
    });

    // ===== Botón Consultar =====
    btnConsultar.addEventListener('click', async () => {
        mensajeError.style.display = 'none';
        resultados.style.display = 'none';
        procesando.style.display = 'block';
        procesandoText.textContent = 'Abriendo navegador y haciendo login en AFIP...';
        btnConsultar.disabled = true;

        const datos = {
            cuit: clienteSeleccionado.cuit,
            puntoDeVenta: selectPdv.value,
            fechaDesde: inputDesde.value.trim(),
            fechaHasta: inputHasta.value.trim(),
            // Opcional: texto exacto del tipo de comprobante. Vacío = no filtrar
            // (AFIP trae todos). La automatización matchea este texto contra las
            // <option> reales del select de AFIP.
            tipoComprobante: selectTipo.value,
            visible: document.getElementById('chk-visible-cc')?.checked !== false
        };

        try {
            const res = await window.electronAPI.consultaComprobantes.consultar(datos);
            procesando.style.display = 'none';

            if (!res || !res.success) {
                mostrarError(res?.message || res?.error || 'Error desconocido');
                actualizarEstadoBoton();
                return;
            }

            renderizarResultados(res.data);
            actualizarEstadoBoton();
        } catch (e) {
            console.error('Error en consulta:', e);
            procesando.style.display = 'none';
            mostrarError(e.message || 'Error inesperado');
            actualizarEstadoBoton();
        }
    });

    function mostrarError(msg) {
        mensajeError.textContent = `❌ ${msg}`;
        mensajeError.style.display = 'block';

        // Igual que con los resultados: llevar el foco al error para que se
        // note que la automatización terminó (aunque haya fallado).
        mensajeError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function renderizarResultados(data) {
        if (!data) {
            mostrarError('La consulta finalizó sin datos.');
            return;
        }

        const comprobantes = Array.isArray(data.comprobantes) ? data.comprobantes : [];
        const cantidad = data.totalFilas ?? comprobantes.length;
        const suma = Number(data.sumaTotal || 0);

        totalCantidad.textContent = cantidad;
        totalSuma.textContent = formatearMoneda(suma);

        // Bloque de archivo Excel generado
        const archivoBox = document.getElementById('cc-archivo-excel');
        const archivoRuta = document.getElementById('cc-archivo-ruta');
        const btnAbrirArchivo = document.getElementById('cc-btn-abrir-archivo');
        const btnAbrirCarpeta = document.getElementById('cc-btn-abrir-carpeta');

        if (data.rutaCompleta) {
            archivoRuta.textContent = data.rutaCompleta;
            archivoBox.style.display = 'flex';

            btnAbrirArchivo.onclick = () => {
                if (window.electronAPI?.abrirArchivo) {
                    window.electronAPI.abrirArchivo(data.rutaCompleta);
                }
            };
            btnAbrirCarpeta.onclick = () => {
                if (window.electronAPI?.abrirDirectorio) {
                    const carpeta = data.rutaCompleta.replace(/[\\/][^\\/]+$/, '');
                    window.electronAPI.abrirDirectorio(carpeta);
                }
            };
        } else {
            archivoBox.style.display = 'none';
        }

        // Tabla detallada
        tablaBody.innerHTML = '';
        if (comprobantes.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="9" style="text-align:center; color:#7f8c8d; padding:20px;">No se encontraron comprobantes en el rango</td>';
            tablaBody.appendChild(tr);
        } else {
            comprobantes.forEach((c, i) => {
                const tr = document.createElement('tr');
                const celdas = [
                    String(i + 1),
                    c.tipoComprobante || '—',
                    c.puntoDeVenta || '—',
                    c.comprobanteNumero || '—',
                    c.periodoDesde || '—',
                    c.periodoHasta || '—',
                    c.cuitReceptor || '—',
                    c.razonSocialReceptor || '—',
                    typeof c.importeTotal === 'number' ? formatearMoneda(c.importeTotal) : '—'
                ];
                celdas.forEach((valor, idx) => {
                    const td = document.createElement('td');
                    td.textContent = valor;
                    if (idx === celdas.length - 1) td.style.textAlign = 'right';
                    tr.appendChild(td);
                });
                tablaBody.appendChild(tr);
            });
        }

        resultados.style.display = 'block';

        // Llevar el foco a los resultados: si no scrolleamos, la vista queda
        // igual que antes de consultar y no se nota que la automatización terminó.
        resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function formatearMoneda(n) {
        if (typeof n !== 'number' || isNaN(n)) return '$0,00';
        const signo = n < 0 ? '-' : '';
        return signo + '$' + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
};
