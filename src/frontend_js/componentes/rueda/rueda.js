/**
 * COMPONENTE COMPARTIDO: RUEDA "ESTÁ TRABAJANDO"
 *
 * Cartel flotante (abajo al centro, NO bloquea la pantalla) para cualquier automatización
 * que esté corriendo. Uno solo a la vez y el MISMO en todos los servicios (AFIP, ATM, los
 * que vengan): si se quiere cambiar cómo se ve o qué dice, se cambia acá.
 *
 * Renglones FIJOS (el cartel no cambia de tamaño mientras llegan mensajes):
 *   1. servicio · subservicio             + "2 / 5" a la derecha si es un lote
 *   2. cliente: NOMBRE — CUIT             (cambia una vez por cliente)
 *   3-4. mensaje: lo que está haciendo    (cambia a cada paso; si no entra, "…" y entero al pasar el mouse)
 *   5. extra: por defecto "No se colgó: está trabajando."
 *
 * Color: toma el tono del servicio (--vista-tono de la vista que lo abrió) y lo oscurece
 * con los mismos % que .modal-global → cada servicio con su tinte, ATM distinto de AFIP.
 *
 *   ruedaTrabajando.mostrar({ servicio: 'ARCA', subservicio: 'Datos registrales',
 *                             mensaje: 'Iniciando sesión…', cliente, cuit, extra, actual, total });
 *   ruedaTrabajando.recibirAviso(aviso);          // ← lo normal en un lote, ver CONTRATO abajo
 *   ruedaTrabajando.cambiarCliente('LANDES S. A. S.', '30718985699');
 *   ruedaTrabajando.cambiarMensaje('Descargando la constancia…');
 *   ruedaTrabajando.cambiarExtra('El navegador está oculto…');
 *   ruedaTrabajando.cambiarContador(2, 5);
 *   ruedaTrabajando.ocultar();
 *   ruedaTrabajando.error('No se pudo facturar', 'motivo…');  // rojo, queda hasta cerrarlo
 *
 * CONTRATO DEL AVISO DE PROGRESO (lo que manda el backend por '<servicio>:update'):
 *   { tipo: 'progreso' | 'resultado' | 'finalizado',
 *     id, cuit, nombre,        // el cliente, en campos sueltos
 *     mensaje,                 // qué está haciendo, SIN el nombre del cliente (va en su renglón)
 *     procesados, total }      // procesados = clientes que YA terminaron
 *   En el backend lo arma backend/comun/avisoProgreso.js (lo usan los 5 de ATM); Datos
 *   registrales / DDJJ pendientes / Portal IVA lo arman igual en su handler. El frontend solo hace
 *   onUpdate(aviso => ruedaTrabajando.recibirAviso(aviso)) además de lo propio de su pantalla.
 *
 * mostrar() con el cartel ya abierto NO lo rearma: cambia los textos en el lugar (sin parpadeo).
 * Lo que no se pasa queda como estaba, salvo el extra, que vuelve al de por defecto.
 *
 * Abrir y cerrar es cosa del SERVICIO (mostrar / ocultar). recibirAviso solo actualiza una rueda
 * abierta: un aviso que llega tarde, después del ocultar(), no la vuelve a abrir.
 *
 * Mientras está abierta, la página suma abajo un espacio del alto del cartel: así se puede
 * bajar hasta el final y leer lo que quedaría tapado.
 */
(function () {
    const EXTRA_POR_DEFECTO = 'No se colgó: está trabajando.';
    let cartel = null;
    let espacio = null;   // hueco al final de la página, del alto del cartel

    function crearCartel(clase, rol) {
        ocultar();
        cartel = document.createElement('div');
        cartel.className = clase;
        cartel.setAttribute('role', rol);
        // Tono del servicio: el de la vista activa (helper de utils/confirmModal.js).
        const tono = typeof tonoVistaActiva === 'function' ? tonoVistaActiva() : '';
        if (tono) cartel.style.setProperty('--rueda-tono', tono);
        cartel.innerHTML = `
            <span class="rueda-giratoria" aria-hidden="true"></span>
            <div class="rueda-aviso-textos">
                <div class="rueda-aviso-cabecera">
                    <span class="rueda-aviso-titulo"></span>
                    <span class="rueda-aviso-contador"></span>
                </div>
                <div class="rueda-aviso-cliente">
                    <span class="rueda-aviso-cliente-nombre"></span>
                    <span class="rueda-aviso-cliente-cuit"></span>
                </div>
                <div class="rueda-aviso-mensaje"></div>
                <div class="rueda-aviso-extra"></div>
            </div>`;
        document.body.appendChild(cartel);
        reservarEspacio();
    }

    /** Alto del cartel + su separación del borde (bottom: 24px) + un margen. */
    function reservarEspacio() {
        if (!cartel) return;
        if (!espacio) {
            espacio = document.createElement('div');
            espacio.className = 'rueda-espacio';
            espacio.setAttribute('aria-hidden', 'true');
        }
        document.body.appendChild(espacio);   // siempre al final, después de todo
        espacio.style.height = `${cartel.offsetHeight + 40}px`;
    }

    /** Pone el texto y el tooltip (el texto entero, por si quedó cortado con "…"). */
    function ponerTexto(selector, texto) {
        if (!cartel) return;
        const el = cartel.querySelector(selector);
        el.textContent = texto || '';
        el.title = texto || '';
    }

    function mostrar(opciones = {}) {
        if (!cartel || cartel.classList.contains('rueda-aviso--error')) {
            crearCartel('rueda-aviso', 'status');
        }
        const { servicio, subservicio, cliente, cuit, mensaje, extra, actual, total } = opciones;
        if (servicio || subservicio) {
            ponerTexto('.rueda-aviso-titulo', [servicio, subservicio].filter(Boolean).join(' · '));
        }
        if (cliente !== undefined || cuit !== undefined) cambiarCliente(cliente, cuit);
        if (mensaje !== undefined) cambiarMensaje(mensaje);
        cambiarExtra(extra);
        if (total) cambiarContador(actual, total);
        reservarEspacio();   // medir con los textos ya puestos
    }

    /** Renglón 2. El nombre se corta con "…" si es largo; el CUIT queda siempre a la vista. */
    function cambiarCliente(nombre, cuit) {
        ponerTexto('.rueda-aviso-cliente-nombre', nombre);
        ponerTexto('.rueda-aviso-cliente-cuit', nombre && cuit ? `— ${cuit}` : cuit);
    }

    function cambiarMensaje(texto) {
        ponerTexto('.rueda-aviso-mensaje', texto);
    }

    function cambiarExtra(texto) {
        ponerTexto('.rueda-aviso-extra', texto || EXTRA_POR_DEFECTO);
    }

    /** "2 / 5" a la derecha del título. Sin total (o total 1) no se muestra. */
    function cambiarContador(actual, total) {
        ponerTexto('.rueda-aviso-contador', total > 1 ? `${Math.min(actual, total)} / ${total}` : '');
    }

    /**
     * Aviso del backend con el CONTRATO de arriba. Solo los de tipo 'progreso' tocan la rueda
     * (llegan ANTES de cada cliente: va por el procesados + 1). 'resultado' y 'finalizado'
     * los pinta cada pantalla; ocultar la rueda es cosa del servicio cuando vuelve el invoke.
     */
    function recibirAviso(aviso) {
        if (!aviso || aviso.tipo !== 'progreso') return;
        // Solo actualiza: si la rueda ya se cerró (o es el cartel de error), no la reabre.
        if (!cartel || cartel.classList.contains('rueda-aviso--error')) return;
        mostrar({
            cliente: aviso.nombre || '',
            cuit: aviso.cuit || '',
            mensaje: aviso.mensaje || 'Trabajando…',
            actual: (aviso.procesados || 0) + 1,
            total: aviso.total
        });
    }

    // Mismo lugar y mismo tamaño que la rueda, en rojo y SIN irse solo: un error que dura
    // un segundo no se alcanza a leer. Se cierra con la ✕ o al empezar otro trabajo.
    function error(titulo, detalle = '') {
        crearCartel('rueda-aviso rueda-aviso--error', 'alert');
        cartel.querySelector('.rueda-giratoria').remove();
        const cerrar = document.createElement('button');
        cerrar.type = 'button';
        cerrar.className = 'rueda-aviso-cerrar';
        cerrar.setAttribute('aria-label', 'Cerrar');
        cerrar.textContent = '✕';
        cerrar.addEventListener('click', ocultar);
        cartel.appendChild(cerrar);
        ponerTexto('.rueda-aviso-titulo', titulo);
        ponerTexto('.rueda-aviso-mensaje', detalle);
        reservarEspacio();   // el de error crece con el detalle
    }

    function ocultar() {
        if (cartel) cartel.remove();
        if (espacio) espacio.remove();
        cartel = null;
    }

    window.ruedaTrabajando = {
        mostrar, recibirAviso, cambiarCliente, cambiarMensaje, cambiarExtra, cambiarContador, ocultar, error
    };
})();
