/**
 * COMPONENTE COMPARTIDO: RUEDA "ESTÁ TRABAJANDO"
 *
 * Cartel flotante con una rueda girando, para procesos largos donde la pantalla no
 * muestra nada (ej. facturar con el navegador oculto: sin esto parece que el botón
 * no anduvo). Uno solo a la vez.
 *
 *   window.ruedaTrabajando.mostrar('Facturando en AFIP…', 'Puede tardar un par de minutos.');
 *   window.ruedaTrabajando.ocultar();
 *   window.ruedaTrabajando.error('No se pudo facturar', 'motivo…');  // queda hasta cerrarlo
 */
(function () {
    let cartel = null;

    function mostrar(titulo, sub = 'No se colgó: está trabajando. Puede tardar un par de minutos.') {
        ocultar();
        cartel = document.createElement('div');
        cartel.className = 'rueda-aviso';
        cartel.setAttribute('role', 'status');
        cartel.innerHTML = `
            <span class="rueda-giratoria" aria-hidden="true"></span>
            <div>
                <div class="rueda-aviso-titulo"></div>
                <div class="rueda-aviso-sub"></div>
            </div>`;
        cartel.querySelector('.rueda-aviso-titulo').textContent = titulo;
        cartel.querySelector('.rueda-aviso-sub').textContent = sub;
        document.body.appendChild(cartel);
    }

    // Mismo lugar que la rueda, en rojo y SIN irse solo: un error que dura un
    // segundo no se alcanza a leer. Se cierra con la ✕ o al empezar otro trabajo.
    function error(titulo, detalle = '') {
        ocultar();
        cartel = document.createElement('div');
        cartel.className = 'rueda-aviso rueda-aviso--error';
        cartel.setAttribute('role', 'alert');
        cartel.innerHTML = `
            <div>
                <div class="rueda-aviso-titulo"></div>
                <div class="rueda-aviso-sub"></div>
            </div>
            <button type="button" class="rueda-aviso-cerrar" aria-label="Cerrar">✕</button>`;
        cartel.querySelector('.rueda-aviso-titulo').textContent = titulo;
        cartel.querySelector('.rueda-aviso-sub').textContent = detalle;
        cartel.querySelector('.rueda-aviso-cerrar').addEventListener('click', ocultar);
        document.body.appendChild(cartel);
    }

    function ocultar() {
        if (cartel) cartel.remove();
        cartel = null;
    }

    window.ruedaTrabajando = { mostrar, ocultar, error };
})();
