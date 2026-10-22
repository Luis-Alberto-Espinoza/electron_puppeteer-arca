/**
 * MÓDULO: Renderizador de Archivos Descargados
 * Muestra los VEPs descargados con opción para abrirlos
 */

/**
 * Muestra la sección de archivos descargados
 */
export function mostrarSeccionArchivos() {
    const seccion = document.getElementById('seccion-archivos-descargados');
    if (seccion) {
        seccion.style.display = 'block';
    }
}

/**
 * Oculta la sección de archivos descargados
 */
export function ocultarSeccionArchivos() {
    const seccion = document.getElementById('seccion-archivos-descargados');
    if (seccion) {
        seccion.style.display = 'none';
    }
}

/**
 * Renderiza la lista de archivos descargados
 * @param {Array} resultados - Array de resultados con pdfDescargado
 */
export function renderizarArchivosDescargados(resultados) {
    const listaArchivos = document.getElementById('lista-archivos-descargados');

    if (!listaArchivos) {
        console.error('❌ No se encontró el contenedor de archivos');
        return;
    }

    // Limpiar contenido anterior
    listaArchivos.innerHTML = '';

    // Filtrar solo los que tienen PDF descargado
    const archivosDescargados = resultados.filter(r =>
        r.pdfDescargado && r.pdfDescargado.path
    );

    if (archivosDescargados.length === 0) {
        listaArchivos.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--v-texto-2, #6b7280);">
                <p>No se descargaron archivos</p>
            </div>
        `;
        return;
    }

    // Renderizar cada archivo
    archivosDescargados.forEach((resultado, index) => {
        const { usuario, pdfDescargado } = resultado;

        const archivoItem = document.createElement('div');
        archivoItem.className = 'archivo-item';
        archivoItem.innerHTML = `
            <div class="archivo-info">
                <div class="archivo-icono">📄</div>
                <div class="archivo-detalles">
                    <div class="archivo-usuario">${usuario.nombre}</div>
                    <div class="archivo-nombre">${pdfDescargado.nombre || 'VEP.pdf'}</div>
                </div>
            </div>
        `;
        // Botones Abrir / Carpeta: componente común (componentes/archivoResultado)
        archivoItem.appendChild(window.archivoResultado.crearBotones(pdfDescargado.path, { etiquetaAbrir: 'Abrir', etiquetaCarpeta: 'Carpeta' }));

        listaArchivos.appendChild(archivoItem);
    });

    // Mostrar la sección
    mostrarSeccionArchivos();

    console.log(`✅ Renderizados ${archivosDescargados.length} archivo(s) descargado(s)`);
}

/**
 * Limpia la sección de archivos
 */
export function limpiarArchivos() {
    const listaArchivos = document.getElementById('lista-archivos-descargados');
    if (listaArchivos) {
        listaArchivos.innerHTML = '';
    }
    ocultarSeccionArchivos();
}
