// Datos registrales — elegir clientes y bajar el PDF de Sistema Registral (lote).
// El backend agrupa por login (representante) y avisa el progreso por onUpdate.

window.inicializarModuloDatosRegistrales = () => {
    // Errores que se arreglan con la clave (login_arca.js y el resolver de acceso).
    // Adentro de la función: el script se recarga en cada entrada y una const global chocaría.
    const ERRORES_DE_ACCESO = new Set(['INVALID_CREDENTIALS', 'UPDATE_PASSWORD_REQUIRED', 'LOGIN_FAILED', 'SIN_ACCESO']);

    const btnProcesar = document.getElementById('btnProcesarDr');
    const chkVisible  = document.getElementById('chk-visible-dr');
    const resultados  = document.getElementById('resultadosDr');
    const contenido   = document.getElementById('resultadosContenidoDr');
    const contador    = document.getElementById('contadorDr');

    let enCurso = false;

    const selector = new SelectorUsuarios('selector-contribuyentes-dr', {
        mostrarTablaSeleccionados: true,
        // Modelo plano: el backend ya sabe si cada uno puede operar AFIP (clave propia
        // o por representante).
        fuente: 'contribuyentes',
        servicio: 'afip',
        // Lote: no deja elegir los de clave incorrecta (fallarían y acercan el captcha).
        ...(window.opcionesClaveEnSelector ? window.opcionesClaveEnSelector('afip', () => selector, { lote: true }) : {}),
        onCambioSeleccion: (seleccionados) => {
            btnProcesar.disabled = enCurso || seleccionados.length === 0;
        }
    });

    // ===== Resultados =====
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    function filaDe(cuit) {
        let fila = contenido.querySelector(`[data-cuit="${cuit}"]`);
        if (!fila) {
            fila = el('div', 'dr-resultado');
            fila.dataset.cuit = cuit;
            contenido.appendChild(fila);
        }
        return fila;
    }

    function pintarFila(datos) {
        const fila = filaDe(datos.cuit);
        fila.className = `dr-resultado dr-resultado-${datos.estado}`;
        fila.innerHTML = '';

        const icono = { procesando: '⏳', exito: '✓', error: '✗' }[datos.estado] || '';
        const texto = el('span', 'dr-resultado-texto');
        texto.appendChild(el('strong', null, `${icono} ${datos.nombre || ''} (${datos.cuit})`));
        texto.appendChild(document.createTextNode(` — ${datos.mensaje || ''}`));
        fila.appendChild(texto);

        if (datos.estado === 'exito' && datos.rutaPdf) {
            // Botones: componente común (componentes/archivoResultado)
            fila.appendChild(window.archivoResultado.crearBotones(datos.rutaPdf, {
                etiquetaAbrir: 'Abrir PDF', rutaCarpeta: datos.downloadDir, etiquetaCarpeta: 'Carpeta'
            }));
        }
        // Solo los errores de acceso van a la fila: ahí el selector ofrece "Clave". Un error de
        // Sistema Registral o de ARCA con el botón de la llave asusta y no se arregla con la clave.
        if (datos.estado === 'error' && datos.id != null && ERRORES_DE_ACCESO.has(datos.error)) {
            selector.marcarFila(datos.id, datos.mensaje, 'error');
        }
    }

    // Lleva la vista al panel de resultados (al arrancar: "algo está pasando"; al terminar: el resumen).
    function irAResultados() {
        resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onUpdate(datos) {
        resultados.style.display = 'block';
        const inicio = contenido.querySelector('.dr-inicio');
        if (inicio) inicio.remove();
        if (datos.tipo === 'progreso' || datos.tipo === 'resultado') {
            pintarFila(datos);
            contador.textContent = `(${datos.procesados}/${datos.total})`;
            if (datos.tipo === 'progreso' && window.ruedaTrabajando) {
                window.ruedaTrabajando.recibirAviso(datos);
            }
        } else if (datos.tipo === 'finalizado') {
            const fin = el('div', 'dr-resultado dr-resultado-fin',
                `Terminado: ${datos.exitosos} descargado(s), ${datos.fallidos} con error.`);
            contenido.appendChild(fin);
            irAResultados();
        }
    }

    // ipcRenderer.on acumula listeners: se registra UNA vez y se redirige a la vista actual.
    window.__drOnUpdate = onUpdate;
    if (!window.__drListenerRegistrado) {
        window.electronAPI.datosRegistrales.onUpdate((datos) => window.__drOnUpdate && window.__drOnUpdate(datos));
        window.__drListenerRegistrado = true;
    }

    // ===== Procesar =====
    btnProcesar.addEventListener('click', async () => {
        const seleccionados = selector.obtenerSeleccionados();
        if (seleccionados.length === 0) return;

        const contribuyentes = seleccionados.map(u => ({
            id: u.id,
            cuit: u.cuit,
            nombre: u.razonSocial || [u.nombre, u.apellido].filter(Boolean).join(' ')
        }));

        enCurso = true;
        btnProcesar.disabled = true;
        btnProcesar.textContent = '⏳ Descargando...';
        contenido.innerHTML = '';
        contador.textContent = '';
        resultados.style.display = 'block';
        contenido.appendChild(el('div', 'dr-resultado dr-resultado-procesando dr-inicio',
            `⏳ Iniciando ${contribuyentes.length} cliente(s)... (puede tardar: la consulta de AFIP es lenta)`));
        irAResultados();
        if (window.ruedaTrabajando) window.ruedaTrabajando.mostrar({
            servicio: 'ARCA', subservicio: 'Datos registrales', mensaje: 'Iniciando sesión en AFIP…'
        });

        try {
            const r = await window.electronAPI.datosRegistrales.procesar({
                contribuyentes,
                visible: chkVisible.checked
            });
            if (!r || !r.success) {
                contenido.appendChild(el('div', 'dr-resultado dr-resultado-error', (r && r.message) || 'Error desconocido'));
            }
        } catch (e) {
            contenido.appendChild(el('div', 'dr-resultado dr-resultado-error', e.message));
        } finally {
            if (window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
            enCurso = false;
            btnProcesar.textContent = '▶ Descargar datos registrales';
            btnProcesar.disabled = selector.obtenerSeleccionados().length === 0;
        }
    });
};
