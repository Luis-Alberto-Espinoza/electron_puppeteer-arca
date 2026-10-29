// facturaExcel.js - Facturar desde Excel.
// Elegís el cliente y el PDV, bajás el modelo, elegís el Excel completo y se ve una
// vista previa con los errores por hoja y fila. Sin errores aparece el lanzador:
// emite con el mismo motor que Factura Tipificada (facturaTipificada.generarLote),
// un login para todas las facturas, y deja reintentar las que no salieron.
//
// Script clásico (lo re-inyecta el controlador en cada entrada): todo adentro de
// una función para no redeclarar nada; afuera solo queda window.inicializarVistaFacturaExcel.
(function () {
    let selector = null;
    let plantilla = '';       // HTML del formulario tal como vino de facturaExcel.html
    let lanzador = null;
    let leidas = [];          // facturas de la vista previa ({ numero, ..., grupo })
    let pendientes = null;    // tras una corrida: las que hay que volver a mandar (null = todas)

    const $ = (id) => document.getElementById(id);
    const pesos = (n) => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const escapar = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // Aviso con el modal de la app (con el tono del servicio).
    function avisar(mensaje, titulo = 'Revisá los datos') {
        return showConfirmModal({ title: titulo, icon: '⚠️', message: mensaje, confirmText: 'Entendido', confirmBtnClass: 'tono', soloAceptar: true });
    }

    function inicializarVistaFacturaExcel() {
        const div = $('facturasExcelDiv');
        if (!div) return console.error('No se encontró facturasExcelDiv');
        plantilla = div.innerHTML;
        div.innerHTML = '';
        div.classList.add('contenido-oculto');
        window.usuarioSeleccionado = null;
        selector = new SelectorUsuarios('fx-selector-usuarios', {
            mostrarTablaSeleccionados: false,
            seleccionUnica: true,
            // Mismo filtro que los otros servicios de facturación (acceso AFIP + ≥1 PDV).
            fuente: 'contribuyentes',
            servicio: 'facturacion',
            ...(window.opcionesClaveEnSelector
                ? window.opcionesClaveEnSelector('afip', () => selector, { verificar: 'facturacion' })
                : {}),
            onCambioSeleccion: (seleccionados) => elegirCliente(seleccionados[0] || null)
        });
    }

    // Cada cliente arranca de cero. El mismo cliente otra vez (ej. tras corregir su clave) no borra nada.
    function elegirCliente(usuario) {
        const div = $('facturasExcelDiv');
        const mismoCliente = usuario && window.usuarioSeleccionado
            && String(usuario.id) === String(window.usuarioSeleccionado.id);
        window.usuarioSeleccionado = usuario;
        if (mismoCliente) return;
        div.classList.toggle('contenido-oculto', !usuario);
        if (usuario) armarFormulario();
        else div.innerHTML = '';
    }

    function armarFormulario() {
        $('facturasExcelDiv').innerHTML = plantilla;
        leidas = [];
        pendientes = null;
        $('fxBajarModelo').addEventListener('click', bajarModelo);
        $('fxElegirExcel').addEventListener('click', elegirExcel);
        crearLanzador();
        escucharRueda();
        // Recién con los PDV cargados se sabe qué campo está habilitado.
        popularPdv().then(() => $('fxPuntoVenta')?.focus());
    }

    async function popularPdv(habilitados = null) {
        const select = $('fxPuntoVenta');
        const usuario = window.usuarioSeleccionado;
        if (!select || !usuario) return;
        select.innerHTML = '<option value="">Cargando puntos de venta…</option>';
        select.disabled = true;
        const pdvs = await window.pdvOfrecibles(usuario.cuit, habilitados);
        select.innerHTML = pdvs.length
            ? pdvs.map(p => `<option value="${escapar(p.numero)}">${escapar(p.descripcion ? `${p.numero} — ${p.descripcion}` : p.numero)}</option>`).join('')
            : '<option value="">— sin puntos de venta —</option>';
        select.disabled = pdvs.length === 0;
    }

    async function bajarModelo() {
        const r = await window.electronAPI.facturaExcel.bajarModelo({ cuit: window.usuarioSeleccionado.cuit });
        if (r.cancelado) return;
        if (!r.success) return avisar(r.message, 'No se pudo generar el modelo');
        const lugar = $('fxModelo');
        lugar.innerHTML = '';
        lugar.appendChild(window.archivoResultado.crearBloque(r.ruta, { titulo: 'Modelo guardado', etiquetaAbrir: 'Abrir modelo' }));
    }

    async function elegirExcel() {
        const ruta = await window.electronAPI.facturaExcel.elegirExcel();
        if (ruta) await leerExcel(ruta);
    }

    // Lee y muestra la vista previa. Con errores no aparece el lanzador.
    async function leerExcel(ruta) {
        olvidarCorrida();
        $('fxArchivo').textContent = `📄 ${ruta}`;
        const r = await window.electronAPI.facturaExcel.leer({ ruta, cuit: window.usuarioSeleccionado.cuit });
        if (!r.success) {
            leidas = [];
            mostrarVistaPrevia([], [r.message]);
            return;
        }
        leidas = r.facturas;
        mostrarVistaPrevia(r.facturas, r.errores);
    }

    function mostrarVistaPrevia(facturas, errores) {
        $('fxVistaPrevia').classList.remove('contenido-oculto');
        document.querySelector('#facturaExcelDiv .fx-tabla').classList.remove('fx-con-resultado');
        $('fxErrores').innerHTML = errores.length
            ? `<div class="fx-errores"><h3>❌ Hay ${errores.length} error(es) en el Excel: corregilos y volvé a elegirlo</h3>
               <ul>${errores.map(e => `<li>${escapar(e)}</li>`).join('')}</ul></div>`
            : '';
        const total = facturas.reduce((s, f) => s + f.total, 0);
        $('fxResumen').textContent = facturas.length
            ? `${facturas.length} factura(s) por ${pesos(total)}`
            : '';
        $('fxFilas').innerHTML = facturas.map(f => `
            <tr data-numero="${f.numero}">
                <td>${f.numero}</td>
                <td>${escapar(f.fecha)}</td>
                <td>${escapar(f.comprobante)}</td>
                <td>${escapar(f.receptor)}</td>
                <td>${f.lineas}</td>
                <td class="fx-monto">${pesos(f.total)}</td>
                <td class="fx-estado"></td>
            </tr>`).join('');
        const listo = facturas.length > 0 && errores.length === 0;
        $('lanzadorFacturaExcel').classList.toggle('contenido-oculto', !listo);
        actualizarLanzador();
        $('fxVistaPrevia').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- lanzador ----------

    // Lo que se manda: las pendientes de la corrida anterior o todas las leídas.
    const aMandar = () => (pendientes || leidas);

    function crearLanzador() {
        const contenedor = $('lanzadorFacturaExcel');
        if (!contenedor || !window.lanzadorAutomatizacion) return;
        const rueda = { servicio: 'ARCA', subservicio: 'Facturar desde Excel', mensaje: 'Iniciando sesión en AFIP…' };
        lanzador = window.lanzadorAutomatizacion.crear(contenedor, {
            acciones: [{
                texto: 'Facturar',
                tipo: 'principal',
                nota: 'Facturas reales en AFIP',
                preparar: () => prepararLote(),
                confirmar: (lote) => ({
                    title: 'Facturar desde Excel',
                    icon: '🧾',
                    confirmText: 'Emitir',
                    message: `Vas a emitir ${lote.facturas.length} factura(s) REALES en AFIP por ${pesos(lote.facturas.reduce((s, f) => s + f.total, 0))}.\n`
                        + (pendientes ? 'Son las que no salieron: las emitidas y las dudosas no se vuelven a mandar.\n' : '')
                        + 'Una factura emitida no se deshace: se anula con nota de crédito.'
                }),
                confirmarCancelar: () => ({
                    title: '¿Cancelar la facturación?',
                    message: 'Las facturas que ya se emitieron quedan emitidas en AFIP: cancelar no las borra.\n'
                        + 'Al terminar vas a ver cuáles salieron y vas a poder facturar las que faltan.'
                }),
                rueda,
                ejecutar: (lote, { visible }) => correr(lote, false, visible)
            }, {
                texto: 'Simular 1ra factura',
                tipo: 'prueba',
                nota: 'Prueba: llega a la confirmación y no confirma',
                preparar: () => prepararLote(),
                rueda: { ...rueda, mensaje: 'Iniciando sesión en AFIP (modo prueba)…' },
                ejecutar: (lote, { visible }) => correr(lote, true, visible)
            }],
            auxiliares: [{
                texto: 'Limpiar',
                ayuda: 'Saca el Excel elegido y lo leído. El cliente queda elegido.',
                alHacer: limpiar
            }, {
                texto: 'Descartar',
                ayuda: 'Deja de lado el resultado y lo que quedó pendiente. No toca AFIP ni el Excel.',
                mostrar: () => !!pendientes || !!$('fxResultado')?.innerHTML,
                alHacer: descartar
            }]
        });
        lanzador.habilitar(true);
    }

    function actualizarLanzador() {
        if (!lanzador) return;
        const n = aMandar().length;
        lanzador.cambiar(0, { texto: pendientes ? `Facturar ${n === 1 ? 'la restante' : `las ${n} restantes`}` : `Facturar ${n}` });
        lanzador.refrescar();
    }

    function prepararLote() {
        const select = $('fxPuntoVenta');
        if (!select || !select.value) {
            avisar('Elegí el punto de venta.');
            return null;
        }
        const facturas = aMandar();
        if (facturas.length === 0) {
            avisar('No hay facturas para emitir: elegí el Excel.');
            return null;
        }
        return { facturas, puntoVenta: select.value };
    }

    // Lo que falta para el motor: emisor, PDV, empresa y modo prueba.
    function grupoParaMotor(factura, puntoVenta, modoTest) {
        const usuario = window.usuarioSeleccionado;
        return {
            datosComunes: {
                ...factura.grupo.datosComunes,
                puntoVenta,
                nombreEmpresa: usuario.razonSocial || usuario.nombre || '',
                usuarioSeleccionado: usuario,
                modoTest
            },
            facturas: factura.grupo.facturas
        };
    }

    async function correr(lote, modoTest, visible) {
        $('fxResultado').innerHTML = '';
        const grupos = lote.facturas.map(f => grupoParaMotor(f, lote.puntoVenta, modoTest));
        let r;
        try {
            r = await window.electronAPI.facturaTipificada.generarLote({ grupos, visible });
        } catch (error) {
            r = { success: false, message: error.message };
        }
        if (modoTest) mostrarPrueba(r);
        else if (r.success && r.resultados) mostrarCorrida(lote.facturas, r);
        else mostrarMensaje('fx-caja fx-errores', '❌ No se pudo facturar', r.message || r.error || 'Error sin detalle: mirá el log del día.');

        if (r.tipoCorregido || r.pdvNoHabilitado) await avisarPdv(r);
        lanzador?.refrescar();
    }

    function mostrarMensaje(clase, titulo, texto) {
        $('fxResultado').innerHTML = `<div class="${clase}"><h3>${escapar(titulo)}</h3><p>${escapar(texto)}</p></div>`;
        $('fxResultado').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function mostrarPrueba(r) {
        if (!r.success) {
            mostrarMensaje('fx-caja fx-errores', '🧪 La prueba no se pudo completar', r.message || r.error || 'Error sin detalle: mirá el log del día.');
            return;
        }
        $('fxResultado').innerHTML = `
            <div class="fx-caja fx-caja--ok">
                <h3>🧪 Modo prueba: salió bien</h3>
                <p><strong>La 1ra factura NO fue confirmada, que es lo esperado ✅</strong> No se emitió nada en AFIP.</p>
                <p>Revisá la captura: si está bien, "Facturar" emite las ${aMandar().length}.</p>
            </div>`;
        if (r.screenshotPath) {
            $('fxResultado').appendChild(window.archivoResultado.crearBloque(r.screenshotPath, { titulo: 'Captura de la confirmación', etiquetaAbrir: 'Ver captura' }));
        }
        $('fxResultado').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Resultado por factura en la tabla + resumen. El motor contesta por índice de grupo.
    function mostrarCorrida(enviadas, r) {
        const porGrupo = new Map(r.resultados.map(x => [x.grupo, x]));
        document.querySelector('#facturaExcelDiv .fx-tabla').classList.add('fx-con-resultado');
        const quedan = [];
        let ok = 0, dudosas = 0, malas = 0;
        enviadas.forEach((f, i) => {
            const res = porGrupo.get(i);
            const celda = document.querySelector(`#fxFilas tr[data-numero="${f.numero}"] .fx-estado`);
            if (!celda) return;
            celda.innerHTML = '';
            if (res && res.success) {
                ok++;
                celda.className = 'fx-estado fx-ok';
                celda.textContent = '✅ Emitida ';
                if (res.pdfPath) celda.appendChild(window.archivoResultado.crearBotones(res.pdfPath, { etiquetaAbrir: 'PDF', etiquetaCarpeta: 'Carpeta', destacado: false }));
            } else if (res && res.dudosa) {
                dudosas++;
                celda.className = 'fx-estado fx-duda';
                celda.textContent = '⚠ Dudosa: revisala en Mis Comprobantes';
            } else {
                quedan.push(f);
                if (res) malas++;
                celda.className = 'fx-estado fx-mal';
                celda.textContent = res ? `❌ ${res.error || res.message || 'No salió'}` : '— No se intentó';
            }
        });
        pendientes = quedan.length ? quedan : null;

        const cortado = r.cortadoPor === 'cancelado' ? ' Se canceló.' : r.cortadoPor === 'cerrado' ? ' Se cerró el navegador.' : '';
        const titulo = `${ok === enviadas.length ? '✅' : '⚠'} Se emitieron ${ok} de ${enviadas.length} factura(s)`;
        const detalle = (dudosas ? `${dudosas} dudosa(s): revisalas en Mis Comprobantes antes de reintentar. ` : '')
            + (quedan.length ? `Faltan ${quedan.length}: el botón ahora factura solo esas.` : '')
            + cortado;
        mostrarMensaje(ok === enviadas.length ? 'fx-caja fx-caja--ok' : 'fx-caja fx-caja--aviso', titulo, detalle || 'Todas salieron.');

        // Todo emitido: el lanzador se va, así no se vuelve a emitir el mismo Excel sin querer.
        if (!pendientes) $('lanzadorFacturaExcel').classList.add('contenido-oculto');
        actualizarLanzador();
    }

    // AFIP corrigió el tipo del PDV o no lo habilita: el Excel se lee con el emisor
    // corregido, así que hay que volver a elegirlo.
    async function avisarPdv(r) {
        if (r.tipoCorregido) {
            window.usuarioSeleccionado.tipoContribuyente = r.tipoCorregido.letra;
            avisar(`AFIP indica que el punto de venta ${r.tipoCorregido.puntoVenta} emite Factura ${r.tipoCorregido.letra}. `
                + 'Se corrigió el cliente: revisá el comprobante en el Excel y volvé a elegirlo.', 'Punto de venta');
        } else {
            await popularPdv(r.pdvNoHabilitado.habilitados);
            avisar(`AFIP no habilita el punto de venta ${r.pdvNoHabilitado.elegido}. Ofrece: ${r.pdvNoHabilitado.habilitados.join(', ')}. Elegí uno y volvé a facturar.`, 'Punto de venta');
        }
    }

    function olvidarCorrida() {
        pendientes = null;
        if ($('fxResultado')) $('fxResultado').innerHTML = '';
    }

    function descartar() {
        olvidarCorrida();
        document.querySelectorAll('#fxFilas .fx-estado').forEach(c => { c.className = 'fx-estado'; c.innerHTML = ''; });
        document.querySelector('#facturaExcelDiv .fx-tabla')?.classList.remove('fx-con-resultado');
        actualizarLanzador();
    }

    async function limpiar() {
        const ok = await showConfirmModal({
            title: 'Limpiar',
            icon: '🧹',
            confirmText: 'Limpiar',
            message: 'Se sacan el Excel elegido, la vista previa y el resultado. El cliente queda elegido.\n\n¿Desea continuar?'
        });
        if (ok) armarFormulario();
    }

    // Avisos de progreso del motor (contrato de la rueda). Mismo canal que Tipificada:
    // una sola suscripción para las dos vistas.
    function escucharRueda() {
        const api = window.electronAPI?.facturaTipificada;
        if (!api?.onFacturaTipificadaUpdate || window._ruedaTipificadaEscuchando) return;
        window._ruedaTipificadaEscuchando = true;
        api.onFacturaTipificadaUpdate((aviso) => window.ruedaTrabajando?.recibirAviso(aviso));
    }

    window.inicializarVistaFacturaExcel = inicializarVistaFacturaExcel;
})();
