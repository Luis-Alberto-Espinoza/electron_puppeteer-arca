/**
 * Vista Plantillas Excel.
 * --------------------------------------------------------
 * Lista las plantillas (window.electronAPI.plantillasExcel.listar) y arma un botón
 * por cada una. Al tocarlo: abre el administrador de archivos, procesa y muestra
 * el archivo generado o el error (cabecera que falta, control que no da 0, .xls...).
 *
 * Expone window.inicializarPlantillasExcel() — el controlador lo llama al cargar la vista.
 */
(function () {
    let ocupado = false;

    function esc(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function fmtPesos(n) {
        return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function api() {
        return window.electronAPI && window.electronAPI.plantillasExcel;
    }

    function mostrarEstado(tipo, html) {
        const el = document.getElementById('pxEstado');
        if (!el) return;
        el.className = `ui-card px-estado px-estado--${tipo}`;
        el.innerHTML = html;
        el.style.display = '';
    }

    function habilitarBotones(si) {
        document.querySelectorAll('#pxLista .px-plantilla').forEach(b => { b.disabled = !si; });
    }

    function mostrarExito(plantilla, res) {
        const controles = (res.controles || []).map(c =>
            `${esc(c.concepto)}${res.meses && res.meses.length > 1 ? ` ${esc(c.mes)}` : ''}: ${fmtPesos(c.totalDatos)} (diferencia ${fmtPesos(c.diferencia)})`
        ).join(' · ');
        mostrarEstado('ok', `
            <div class="px-estado-titulo">✅ ${esc(plantilla.nombre)}: listo</div>
            <div>${esc(res.mensaje)}</div>
            <div class="px-ruta">${esc(res.archivoGenerado)}</div>
            ${controles ? `<div class="px-controles">Controles: ${controles}</div>` : ''}
            <div class="px-acciones">
                <button type="button" class="ui-btn ui-btn--ok" id="pxAbrir">Abrir archivo</button>
                <button type="button" class="ui-btn ui-btn--ghost" id="pxCarpeta">Mostrar en la carpeta</button>
            </div>
        `);
        const ruta = res.archivoGenerado;
        document.getElementById('pxAbrir').addEventListener('click', () => window.electronAPI.abrirArchivo(ruta));
        document.getElementById('pxCarpeta').addEventListener('click', () => window.electronAPI.abrirDirectorio(ruta));
    }

    function mostrarError(titulo, mensaje) {
        mostrarEstado('error', `
            <div class="px-estado-titulo">❌ ${esc(titulo)}</div>
            <div>${esc(mensaje)}</div>
        `);
    }

    async function usarPlantilla(plantilla) {
        if (ocupado) return;
        ocupado = true;
        habilitarBotones(false);
        try {
            const elegido = await api().elegirArchivo();
            if (!elegido || elegido.canceled) return; // canceló: no mostramos nada
            if (!elegido.success) {
                mostrarError('No se pudo abrir el selector de archivos', elegido.mensaje);
                return;
            }

            mostrarEstado('proceso', `Procesando <b>${esc(elegido.archivo)}</b>…`);
            const res = await api().procesar(plantilla.id, elegido.archivo);
            if (res && res.success) mostrarExito(plantilla, res);
            else mostrarError(`${plantilla.nombre}: no se generó el archivo`, (res && res.mensaje) || 'Error desconocido.');
        } catch (e) {
            mostrarError('Error inesperado', e.message);
        } finally {
            ocupado = false;
            habilitarBotones(true);
        }
    }

    async function cargarLista() {
        const lista = document.getElementById('pxLista');
        if (!lista) return;
        if (!api()) {
            lista.innerHTML = '';
            mostrarError('Servicio no disponible', 'La API de Plantillas Excel no está cargada (preload).');
            return;
        }
        const res = await api().listar();
        if (!res || !res.success) {
            mostrarError('No se pudieron leer las plantillas', (res && res.mensaje) || '');
            return;
        }
        lista.innerHTML = '';
        for (const p of res.plantillas) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ui-btn px-plantilla';
            btn.innerHTML = `<span>${esc(p.nombre)}</span><span class="px-plantilla-desc">${esc(p.descripcion)}</span>`;
            btn.addEventListener('click', () => usarPlantilla(p));
            lista.appendChild(btn);
        }
    }

    window.inicializarPlantillasExcel = function () {
        ocupado = false;
        cargarLista().catch(e => mostrarError('No se pudieron leer las plantillas', e.message));
    };
})();
