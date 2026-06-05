/**
 * Frontend del módulo Consulta de Comprobantes Emitidos.
 * Expone window.inicializarConsultaComprobantes() para que controlador.js lo invoque.
 */
window.inicializarConsultaComprobantes = () => {
    console.log('🔵 [ConsultaComprobantes] Inicializando módulo...');

    const selectEmpresa   = document.getElementById('cc-select-empresa');
    const selectPdv       = document.getElementById('cc-select-pdv');
    const selectTipo      = document.getElementById('cc-select-tipo');
    const btnRefrescarPdv = document.getElementById('cc-btn-refrescar-pdv');
    const pdvInfo         = document.getElementById('cc-pdv-info');

    const DIAS_PDV_STALE = 30;
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

    // ===== Flatpickr para fechas (si está disponible) =====
    if (typeof flatpickr === 'function') {
        const cfg = {
            dateFormat: 'd/m/Y',
            allowInput: true,
            locale: (typeof flatpickr.l10ns !== 'undefined' && flatpickr.l10ns.es) ? flatpickr.l10ns.es : undefined
        };
        flatpickr(inputDesde, cfg);
        flatpickr(inputHasta, cfg);
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
            campoCredencial: 'claveAFIP',
            campoEstado: 'estado_afip',
            campoError: 'errorAfip',
            requiereAnalisis: true,
            seleccionUnica: true,
            mostrarTablaSeleccionados: false,
            mostrarColumnaCUIT: false,
            onCambioSeleccion: (seleccionados) => onClienteSeleccionado(seleccionados[0] || null)
        });
    }

    // ===== Cambio de cliente → poblar empresas =====
    function onClienteSeleccionado(cliente) {
        clienteSeleccionado = cliente;
        selectEmpresa.innerHTML = '';
        selectEmpresa.disabled = true;
        resetPdv('Seleccione primero una empresa');

        if (!cliente) {
            selectEmpresa.innerHTML = '<option value="">Seleccione primero un cliente</option>';
            actualizarEstadoBoton();
            return;
        }

        const empresas = Array.isArray(cliente.empresas) ? cliente.empresas : [];

        if (empresas.length === 0) {
            selectEmpresa.innerHTML = '<option value="">El cliente no tiene empresas registradas</option>';
            actualizarEstadoBoton();
            return;
        }

        selectEmpresa.innerHTML = '<option value="">Seleccione una empresa</option>';
        empresas.forEach(emp => {
            const nombre = typeof emp === 'string'
                ? emp
                : (emp?.razonSocial || emp?.nombre || '');
            if (!nombre) return;
            const opt = document.createElement('option');
            opt.value = nombre;
            opt.textContent = nombre;
            selectEmpresa.appendChild(opt);
        });
        selectEmpresa.disabled = false;
        actualizarEstadoBoton();
    }

    // ===== Cambio de empresa → poblar puntos de venta (lazy) =====
    selectEmpresa.addEventListener('change', async () => {
        const razonSocial = selectEmpresa.value;
        resetPdv('Seleccione primero una empresa');
        actualizarEstadoBoton();

        if (!razonSocial) return;

        const cliente = clienteSeleccionado;
        const empresa = (cliente?.empresas || []).find(e => e.razonSocial === razonSocial);

        // Si la empresa NO está en el modelo nuevo (cliente legacy sin migrar todavía),
        // disparar descubrimiento sí o sí.
        if (!empresa) {
            await descubrirYPopularPdv(cliente.id, razonSocial);
            return;
        }

        // Si ya tenemos pdv cacheados, popular directo.
        if (empresa.puntosDeVentaActualizados && Array.isArray(empresa.puntosDeVenta) && empresa.puntosDeVenta.length > 0) {
            popularPdv(empresa.puntosDeVenta);
            const dias = diasDesde(empresa.puntosDeVentaActualizados);
            const stale = dias >= DIAS_PDV_STALE;
            const sufijo = stale
                ? ` — desactualizado hace ${dias} días, conviene refrescar`
                : '';
            mostrarPdvInfo(`Cargados desde caché — última actualización ${formatearFecha(empresa.puntosDeVentaActualizados)}${sufijo}`, stale ? 'stale' : 'idle');
            mostrarBtnRefrescar(true);
            return;
        }

        // Lazy: pedir al backend
        await descubrirYPopularPdv(cliente.id, razonSocial);
    });

    // ===== Botón Refrescar PDV =====
    btnRefrescarPdv.addEventListener('click', async () => {
        const razonSocial = selectEmpresa.value;
        const clienteId = clienteSeleccionado?.id;
        if (!razonSocial || !clienteId) return;
        await descubrirYPopularPdv(clienteId, razonSocial);
    });

    function mostrarBtnRefrescar(visible) {
        btnRefrescarPdv.style.display = visible ? '' : 'none';
    }

    function diasDesde(iso) {
        try {
            const ms = Date.now() - new Date(iso).getTime();
            return Math.floor(ms / (1000 * 60 * 60 * 24));
        } catch (_) {
            return 0;
        }
    }

    async function descubrirYPopularPdv(clienteId, razonSocial) {
        selectPdv.innerHTML = '<option value="">Descubriendo puntos de venta…</option>';
        selectPdv.disabled = true;
        btnRefrescarPdv.disabled = true;
        mostrarBtnRefrescar(true);
        mostrarPdvInfo('Conectando a AFIP para leer los puntos de venta — puede demorar 20–40s', 'loading');
        actualizarEstadoBoton();

        try {
            const res = await window.electronAPI.empresa.descubrirPuntosDeVenta({ usuarioId: clienteId, razonSocial });
            if (!res || !res.success) {
                resetPdv('Error al descubrir puntos de venta');
                mostrarPdvInfo(res?.message || 'Error al descubrir puntos de venta', 'error');
                mostrarBtnRefrescar(true);
                btnRefrescarPdv.disabled = false;
                actualizarEstadoBoton();
                return;
            }

            // Refrescar el cache local para que la próxima vez no haga llamada.
            // clienteSeleccionado es el mismo objeto que guarda el componente en
            // su lista interna, así que mutar la empresa persiste en la sesión.
            const cliente = clienteSeleccionado;
            const empresa = (cliente?.empresas || []).find(e => e.razonSocial === razonSocial);
            if (empresa) {
                empresa.puntosDeVenta = res.data.puntosDeVenta;
                empresa.puntosDeVentaActualizados = res.data.puntosDeVentaActualizados;
            }

            popularPdv(res.data.puntosDeVenta);
            // Solo pisamos el mensaje si vinieron PDV. Si vino lista vacía,
            // popularPdv() ya dejó el aviso rojo de "sin facturación habilitada".
            if (Array.isArray(res.data.puntosDeVenta) && res.data.puntosDeVenta.length > 0) {
                mostrarPdvInfo(`Actualizado ahora — ${res.data.puntosDeVenta.length} punto(s) de venta encontrado(s)`, 'idle');
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

    function formatearFecha(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return iso;
        }
    }

    // ===== Validar y habilitar botón =====
    [selectPdv, inputDesde, inputHasta].forEach(el => {
        el.addEventListener('change', actualizarEstadoBoton);
        el.addEventListener('input', actualizarEstadoBoton);
    });

    function actualizarEstadoBoton() {
        const ok = clienteSeleccionado
            && selectEmpresa.value
            && selectPdv.value
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
            usuario: { id: clienteSeleccionado.id },
            nombreEmpresa: selectEmpresa.value,
            puntoDeVenta: selectPdv.value,
            fechaDesde: inputDesde.value.trim(),
            fechaHasta: inputHasta.value.trim(),
            // Opcional: texto exacto del tipo de comprobante. Vacío = no filtrar
            // (AFIP trae todos). La automatización matchea este texto contra las
            // <option> reales del select de AFIP.
            tipoComprobante: selectTipo.value
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
