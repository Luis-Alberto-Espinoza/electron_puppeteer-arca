/**
 * COMPONENTE COMPARTIDO: CALENDARIO
 *
 * Un solo calendario para toda la app. Adentro trabaja flatpickr (instalado con pnpm,
 * anda sin internet), pero las pantallas NO lo tocan: solo llaman a crearCalendario.
 * Si algún día se cambia flatpickr por otro, se cambia acá y ninguna pantalla se entera.
 *
 * Reglas fijas (iguales en todas las pantallas):
 *   - en español, semana arrancando el lunes
 *   - mes Y año como listas desplegables (el año de flatpickr es un número con flechitas;
 *     acá se reemplaza por una lista igual a la del mes)
 *   - la lista de años es una VENTANA de ±6 alrededor del año que se ve: al elegir 2020
 *     pasa a 2014..2026, y así se llega a cualquier año viejo sin una lista eterna.
 *     Tipear la fecha a mano también lleva a cualquier año.
 *   - toma el tono del servicio (--vista-tono de la vista donde está el campo) y lo usa,
 *     aclarado, de fondo del calendario (cuánto: --calendario-aclarado en calendario.css)
 *
 *   crearCalendario(input, {
 *       modo: 'dia',               // 'dia' | 'periodo' (mes/año: grilla de 12 meses)
 *                                  //   | 'varios' (varios días sueltos, separados por ", ")
 *       formato: 'd/m/Y',          // lo que lee la pantalla en input.value (no se unifica)
 *       ver,                       // opcional: cómo se MUESTRA si difiere de formato
 *                                  //   (ej. periodo: formato 'Y-m', ver 'm/Y')
 *       inicial: 'hoy',            // 'hoy' | fecha | null (vacío)
 *       escribir: true,            // permite tipear la fecha a mano (en 'varios', no)
 *       anioMin, anioMax,          // topes duros opcionales (por defecto, sin tope)
 *       minimo, maximo,            // opcional: fecha mín/máx elegible (en "formato" o 'today')
 *       obligatorio: false,        // si falta, avisa abajo del campo (ver MENSAJES)
 *       mensajeObligatorio,        // opcional: texto propio para "falta"
 *       onChange(fechas, texto),   // opcional
 *   });
 *
 * Devuelve la instancia (la misma que input._flatpickr): setDate, clear, etc.
 * Llamarlo dos veces sobre el mismo input rearma el calendario (no lo duplica).
 *
 * MENSAJES (una línea roja debajo del campo, la arma el componente):
 *   - Solo muestra lo que es de ESTA fecha: nada llega solo desde el backend ni de otro campo.
 *   - Obligatorio: no avisa de entrada. Avisa si se abrió el calendario y se cerró sin elegir,
 *     o cuando la pantalla pregunta con cal.validar() (ej. al apretar Procesar).
 *   - La pantalla manda sus mensajes propios con una línea: cal.mostrarError('texto').
 *   - Se borra solo al elegir otra fecha (o con cal.limpiarError()).
 *
 *   if (!cal.validar()) return;                       // falta → aparece el aviso y corta
 *   cal.mostrarError('No puede ser anterior a hoy');  // regla propia de la pantalla
 */
(function () {
    'use strict';

    const VENTANA_AÑOS = 6;   // años antes y después del que se ve

    function crearCalendario(input, opciones = {}) {
        if (!input) return null;
        if (typeof window.flatpickr === 'undefined') {
            console.error('[calendario] flatpickr no está cargado (ver home/index.html)');
            return null;
        }
        if (input._flatpickr) input._flatpickr.destroy();

        const {
            modo = 'dia',
            formato = modo === 'periodo' ? 'm/Y' : 'd/m/Y',
            ver,
            inicial = 'hoy',
            escribir = modo !== 'varios',
            anioMin = -Infinity,
            anioMax = Infinity,
            minimo,
            maximo,
            obligatorio = false,
            mensajeObligatorio = modo === 'periodo' ? 'Elegí un período.'
                : modo === 'varios' ? 'Elegí al menos un día.' : 'Elegí una fecha.',
            onChange,
        } = opciones;

        const rango = { min: anioMin, max: anioMax };
        const periodo = modo === 'periodo';
        if (periodo && typeof window.monthSelectPlugin === 'undefined') {
            console.error('[calendario] falta el plugin monthSelect (ver home/index.html)');
            return null;
        }
        // Con "ver" flatpickr muestra otro campo (altInput) y deja el original oculto con el
        // valor en "formato": la pantalla sigue leyendo input.value como siempre.
        const conOtroFormato = Boolean(ver) && ver !== formato;

        const fp = window.flatpickr(input, {
            dateFormat: formato,
            altInput: conOtroFormato,
            altFormat: conOtroFormato ? ver : undefined,
            mode: modo === 'varios' ? 'multiple' : 'single',
            locale: 'es',
            allowInput: escribir,
            minDate: minimo,
            maxDate: maximo,
            plugins: periodo
                ? [new window.monthSelectPlugin({ shorthand: true, dateFormat: formato, altFormat: ver || formato })]
                : [],
            defaultDate: inicial === 'hoy' ? new Date() : (inicial || undefined),
            monthSelectorType: 'dropdown',
            onReady: (_f, _t, fp) => {
                ponerListaDeAnios(fp, rango);
                ponerTonoDelServicio(fp, input);
            },
            // Las flechas ‹ › cruzan de año: la lista tiene que acompañar.
            onYearChange: (_f, _t, fp) => sincronizarAnio(fp, rango),
            onMonthChange: (_f, _t, fp) => sincronizarAnio(fp, rango),
            onOpen: (_f, _t, fp) => {
                ponerTonoDelServicio(fp, input);   // el input pudo cambiar de vista
                sincronizarAnio(fp, rango);
            },
            // Abrió y cerró sin elegir: recién ahí "falta" es un aviso, no antes.
            onClose: (_f, _t, fp) => { if (obligatorio) fp.validar(); },
            // Antes que la pantalla: si su regla vuelve a fallar, ella misma lo vuelve a mostrar.
            onChange: (fechas, texto, fp) => {
                sincronizarAnio(fp, rango);
                fp.limpiarError();
                if (onChange) onChange(fechas, texto);
            },
            onDestroy: (_f, _t, fp) => fp.limpiarError(),
        });
        if (conOtroFormato) seguirAlOriginal(input, fp.altInput);
        ponerMensajes(fp, () => fp.altInput || input, obligatorio, mensajeObligatorio);
        return fp;
    }

    // La línea del mensaje se crea recién cuando hay algo que decir y se saca al limpiar:
    // mientras no haya error, el campo y su pantalla quedan exactamente como estaban.
    function ponerMensajes(fp, campoVisible, obligatorio, mensajeObligatorio) {
        let linea = null;

        fp.mostrarError = (texto) => {
            const campo = campoVisible();
            if (!linea) {
                linea = document.createElement('div');
                linea.className = 'calendario-mensaje';
                linea.setAttribute('role', 'alert');
                campo.after(linea);
            }
            linea.textContent = texto;
            campo.classList.add('calendario-con-error');
        };

        fp.limpiarError = () => {
            if (linea) linea.remove();
            linea = null;
            campoVisible().classList.remove('calendario-con-error');
        };

        // true si está bien. Un campo deshabilitado no se le reclama a nadie.
        fp.validar = () => {
            if (!obligatorio || fp.input.disabled || fp.selectedDates.length > 0) return true;
            fp.mostrarError(mensajeObligatorio);
            return false;
        };
    }

    // Con altInput la pantalla sigue tocando SU input (el oculto): lo habilita/deshabilita
    // (Planes: "desde" solo con no vigentes) o le pone clases (VEP: 'error'). El que se ve es
    // otro, así que lo sigue: arranca con sus clases y después copia lo que se agregue o saque.
    function seguirAlOriginal(original, visible) {
        visible.disabled = original.disabled;
        visible.classList.add(...original.classList);
        let antes = new Set(original.classList);
        new MutationObserver(() => {
            visible.disabled = original.disabled;
            const ahora = new Set(original.classList);
            antes.forEach(c => { if (!ahora.has(c)) visible.classList.remove(c); });
            ahora.forEach(c => { if (!antes.has(c)) visible.classList.add(c); });
            antes = ahora;
        }).observe(original, { attributes: true, attributeFilter: ['disabled', 'class'] });
    }

    // Oculta el número con flechitas de flatpickr y pone una lista en su lugar.
    function ponerListaDeAnios(fp, rango) {
        const cabecera = fp.calendarContainer.querySelector('.flatpickr-current-month');
        const numero = cabecera && cabecera.querySelector('.numInputWrapper');
        if (!numero) return;

        const lista = document.createElement('select');
        // Misma clase que la lista del mes → mismo aspecto sin repetir CSS.
        lista.className = 'flatpickr-monthDropdown-months calendario-anios';
        lista.setAttribute('aria-label', 'Año');
        lista.addEventListener('change', () => fp.changeYear(Number(lista.value)));

        numero.style.display = 'none';
        numero.after(lista);
        fp._calendarioAnios = lista;
        sincronizarAnio(fp, rango);
    }

    // Rearma la ventana de años centrada en el que se ve y lo deja marcado.
    function sincronizarAnio(fp, rango) {
        const lista = fp._calendarioAnios;
        if (!lista) return;
        const anio = fp.currentYear;
        const desde = Math.max(rango.min, anio - VENTANA_AÑOS);
        const hasta = Math.min(rango.max, anio + VENTANA_AÑOS);

        if (lista.dataset.desde !== String(desde) || lista.dataset.hasta !== String(hasta)) {
            lista.replaceChildren();
            for (let a = desde; a <= hasta; a++) lista.add(new Option(String(a), String(a)));
            lista.dataset.desde = desde;
            lista.dataset.hasta = hasta;
        }
        lista.value = String(anio);
    }

    // El calendario se dibuja en <body>, fuera de la vista: no hereda --vista-tono.
    // Se lo copiamos del campo (mismo truco que la rueda).
    function ponerTonoDelServicio(fp, input) {
        const tono = getComputedStyle(input).getPropertyValue('--vista-tono').trim();
        if (tono) fp.calendarContainer.style.setProperty('--calendario-tono', tono);
        else fp.calendarContainer.style.removeProperty('--calendario-tono');
    }

    window.crearCalendario = crearCalendario;
})();
