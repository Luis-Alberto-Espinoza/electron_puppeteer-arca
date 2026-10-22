/**
 * ARCHIVO RESULTADO — cómo se muestra un archivo generado, igual en todos los servicios.
 * ----------------------------------------------------------------------
 * Mismo patrón que confirmModal / configDatos (componente global auto-registrado).
 * Antes cada servicio armaba a mano la ruta + "abrir archivo" + "abrir carpeta",
 * con estilos distintos (<code>, <input readonly>, texto suelto...).
 *
 * Expone en window.archivoResultado:
 *   - crearBloque(ruta, opciones)  → caja con nombre + carpeta + botones (un archivo final).
 *   - crearFila(ruta, opciones)    → renglón compacto: nombre + botones (listas de archivos).
 *   - crearBotones(ruta, opciones) → solo los botones (para meter en una fila propia del servicio).
 *   - completarBotones(raiz, opciones) → para vistas que arman su HTML como texto: cada elemento
 *                      con data-ruta-archivo="..." recibe sus botones. (La ruta NO va dentro de un
 *                      onclick="...('ruta')": ahí las \ de Windows se toman como escapes y se rompe.)
 *
 * Opciones (todas opcionales):
 *   - titulo:          texto chico arriba del nombre (solo crearBloque). Ej: "Excel generado".
 *   - abrir:           mostrar el botón de abrir el archivo (default true).
 *   - carpeta:         mostrar el botón de la carpeta (default true).
 *   - etiquetaAbrir:   texto del botón de abrir (default "Abrir archivo").
 *   - destacado:       el botón de abrir va en verde (default true); false = discreto, como el de carpeta.
 *   - etiquetaCarpeta: texto del botón de carpeta (default "Mostrar en la carpeta").
 *   - rutaCarpeta:     qué mostrar con el botón de carpeta (default: la misma ruta del archivo,
 *                      así el explorador abre la carpeta con el archivo ya marcado).
 *
 * Backend: window.electronAPI.abrirArchivo / abrirDirectorio (ver preload.js).
 * abrirDirectorio usa shell.showItemInFolder: con la ruta del ARCHIVO ya abre su carpeta,
 * no hace falta cortar la ruta a mano (cortarla por "/" fallaba con las rutas de Windows).
 */
(function () {
    /** "C:\a\b\informe.xlsx" o "/a/b/informe.xlsx" → "informe.xlsx" */
    function nombreDeArchivo(ruta) {
        return String(ruta || '').split(/[\\/]/).pop();
    }

    /** "C:\a\b\informe.xlsx" → "C:\a\b" */
    function carpetaDe(ruta) {
        return String(ruta || '').replace(/[\\/][^\\/]*$/, '');
    }

    function abrirArchivo(ruta) {
        window.electronAPI?.abrirArchivo?.(ruta);
    }

    function mostrarEnCarpeta(ruta) {
        window.electronAPI?.abrirDirectorio?.(ruta);
    }

    function crearElemento(etiqueta, clase, texto) {
        const el = document.createElement(etiqueta);
        if (clase) el.className = clase;
        if (texto != null) el.textContent = texto;
        return el;
    }

    function crearBotones(ruta, opciones = {}) {
        const {
            abrir = true,
            carpeta = true,
            etiquetaAbrir = 'Abrir archivo',
            destacado = true,
            etiquetaCarpeta = 'Mostrar en la carpeta',
            rutaCarpeta = ruta
        } = opciones;

        const contenedor = crearElemento('span', 'ar-acciones');
        if (abrir && ruta) {
            const btnAbrir = crearElemento('button', destacado ? 'ar-btn ar-btn--principal' : 'ar-btn', etiquetaAbrir);
            btnAbrir.type = 'button';
            btnAbrir.title = ruta;
            btnAbrir.addEventListener('click', () => abrirArchivo(ruta));
            contenedor.appendChild(btnAbrir);
        }
        if (carpeta && rutaCarpeta) {
            const btnCarpeta = crearElemento('button', 'ar-btn', '📁 ' + etiquetaCarpeta);
            btnCarpeta.type = 'button';
            btnCarpeta.title = rutaCarpeta;
            btnCarpeta.addEventListener('click', () => mostrarEnCarpeta(rutaCarpeta));
            contenedor.appendChild(btnCarpeta);
        }
        return contenedor;
    }

    /** Ruta larga: se corta al PRINCIPIO ("…/datos/2026/10") y entera en el tooltip. */
    function crearLineaCarpeta(ruta) {
        const linea = crearElemento('div', 'ar-carpeta');
        linea.title = ruta;
        const texto = crearElemento('bdi', null, carpetaDe(ruta));
        texto.dir = 'ltr';
        linea.appendChild(texto);
        return linea;
    }

    function crearBloque(ruta, opciones = {}) {
        const bloque = crearElemento('div', 'ar-bloque');
        if (opciones.titulo) bloque.appendChild(crearElemento('div', 'ar-titulo', opciones.titulo));
        const nombre = crearElemento('div', 'ar-nombre', '📄 ' + nombreDeArchivo(ruta));
        nombre.title = ruta;
        bloque.appendChild(nombre);
        bloque.appendChild(crearLineaCarpeta(ruta));
        bloque.appendChild(crearBotones(ruta, opciones));
        return bloque;
    }

    function crearFila(ruta, opciones = {}) {
        const fila = crearElemento('div', 'ar-fila');
        const nombre = crearElemento('span', 'ar-nombre', '📄 ' + nombreDeArchivo(ruta));
        nombre.title = ruta;
        fila.appendChild(nombre);
        fila.appendChild(crearBotones(ruta, opciones));
        return fila;
    }

    function completarBotones(raiz, opciones = {}) {
        raiz.querySelectorAll('[data-ruta-archivo]').forEach(lugar => {
            lugar.appendChild(crearBotones(lugar.dataset.rutaArchivo, opciones));
        });
    }

    window.archivoResultado = { crearBloque, crearFila, crearBotones, completarBotones, nombreDeArchivo, carpetaDe };
})();
