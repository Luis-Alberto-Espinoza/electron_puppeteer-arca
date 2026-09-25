/**
 * Vista Plantillas Excel.
 * --------------------------------------------------------
 * Dos puertas, un mismo final:
 *  - "Procesar Excel": elige el archivo y el orquestador (plantillasExcel.detectar)
 *    dice qué plantilla(s) sirven. Una → se ejecuta directo. Varias → el usuario
 *    elige entre esas. Ninguna → se muestra la más parecida y qué le falta.
 *  - Lista manual: un botón por plantilla (con su color e ícono) para forzarla.
 * Las dos terminan en ejecutar(plantilla, archivo), que procesa y muestra el
 * archivo generado o el error.
 *
 * Expone window.inicializarPlantillasExcel() — el controlador lo llama al cargar la vista.
 * Ver docs/herramientas_archivos/plantillas_excel.md
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

    function ocultarEleccion() {
        const el = document.getElementById('pxEleccion');
        if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    }

    function habilitarBotones(si) {
        document.querySelectorAll('#pxRaiz button').forEach(b => { b.disabled = !si; });
    }

    // Botón de una plantilla, con su color e ícono. Lo usan la lista y la elección.
    function botonPlantilla(p, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-btn px-plantilla';
        btn.style.background = p.color;
        btn.innerHTML = `<span class="px-plantilla-nombre">${esc(p.icono)} ${esc(p.nombre)}</span>`
            + `<span class="px-plantilla-desc">${esc(p.descripcion)}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
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

    // Envuelve una acción: una a la vez, botones apagados mientras corre.
    async function conBloqueo(accion) {
        if (ocupado) return;
        ocupado = true;
        habilitarBotones(false);
        try {
            await accion();
        } catch (e) {
            mostrarError('Error inesperado', e.message);
        } finally {
            ocupado = false;
            habilitarBotones(true);
        }
    }

    // Abre el administrador de archivos. Devuelve la ruta, o null si canceló o falló.
    async function elegirArchivo() {
        const elegido = await api().elegirArchivo();
        if (!elegido || elegido.canceled) return null; // canceló: no mostramos nada
        if (!elegido.success) {
            mostrarError('No se pudo abrir el selector de archivos', elegido.mensaje);
            return null;
        }
        return elegido.archivo;
    }

    // El final común de las dos puertas.
    async function ejecutar(plantilla, archivo) {
        ocultarEleccion();
        mostrarEstado('proceso', `${esc(plantilla.icono)} <b>${esc(plantilla.nombre)}</b>: procesando <b>${esc(archivo)}</b>…`);
        const res = await api().procesar(plantilla.id, archivo);
        if (res && res.success) mostrarExito(plantilla, res);
        else mostrarError(`${plantilla.nombre}: no se generó el archivo`, (res && res.mensaje) || 'Error desconocido.');
    }

    // Varias plantillas sirven: se muestran solo esas y el usuario elige.
    function mostrarEleccion(candidatas, archivo) {
        const el = document.getElementById('pxEleccion');
        el.innerHTML = `
            <div class="px-estado-titulo">Este archivo sirve para ${candidatas.length} plantillas. ¿Qué querés generar?</div>
            <div class="px-ruta">${esc(archivo)}</div>
            <div class="px-lista" id="pxEleccionLista"></div>
        `;
        const lista = document.getElementById('pxEleccionLista');
        for (const p of candidatas) {
            lista.appendChild(botonPlantilla(p, () => conBloqueo(() => ejecutar(p, archivo))));
        }
        el.style.display = '';
        document.getElementById('pxEstado').style.display = 'none';
    }

    // Ninguna plantilla reconoce el archivo: se muestra la más parecida y qué le falta.
    function mostrarSinCoincidencia(candidatas) {
        const cercana = candidatas.find(c => c.puntaje > 0);
        if (!cercana) {
            mostrarError('Ninguna plantilla reconoce este archivo',
                'No se encontraron las columnas que espera ninguna de las plantillas. '
                + 'Revisá que sea el Excel original del cliente.');
            return;
        }
        mostrarError('Ninguna plantilla reconoce este archivo',
            `La más parecida es "${cercana.icono} ${cercana.nombre}" `
            + `(encontró el ${Math.round(cercana.puntaje * 100)}% de las columnas).\n${cercana.mensaje}`);
    }

    // Puerta 1: detección automática.
    async function procesarConDeteccion() {
        ocultarEleccion();
        const archivo = await elegirArchivo();
        if (!archivo) return;

        mostrarEstado('proceso', `Buscando qué plantilla corresponde a <b>${esc(archivo)}</b>…`);
        const det = await api().detectar(archivo);
        if (!det || !det.success) {
            mostrarError('No se pudo leer el archivo', (det && det.mensaje) || 'Error desconocido.');
            return;
        }

        const coinciden = det.candidatas.filter(c => det.coincidencias.includes(c.id));
        if (coinciden.length === 1) await ejecutar(coinciden[0], archivo);
        else if (coinciden.length > 1) mostrarEleccion(coinciden, archivo);
        else mostrarSinCoincidencia(det.candidatas);
    }

    // Puerta 2: plantilla elegida a mano.
    async function usarPlantilla(plantilla) {
        ocultarEleccion();
        const archivo = await elegirArchivo();
        if (!archivo) return;
        await ejecutar(plantilla, archivo);
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
            lista.appendChild(botonPlantilla(p, () => conBloqueo(() => usarPlantilla(p))));
        }
    }

    window.inicializarPlantillasExcel = function () {
        ocupado = false;
        const procesar = document.getElementById('pxProcesar');
        if (procesar) procesar.addEventListener('click', () => conBloqueo(procesarConDeteccion));
        cargarLista().catch(e => mostrarError('No se pudieron leer las plantillas', e.message));
    };
})();
