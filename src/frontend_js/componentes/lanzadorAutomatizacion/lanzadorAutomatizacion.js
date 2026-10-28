/**
 * LANZADOR DE AUTOMATIZACIÓN — la caja que arranca (y cancela) una automatización,
 * igual en todos los servicios.
 * ----------------------------------------------------------------------
 * Mismo patrón que archivoResultado / rueda (componente global auto-registrado).
 * Sale del recuadro de Facturación ("Selecciona el modo de Ingreso"): usa .ui-modo-botones.
 *
 *   Sin título (a propósito: la botonera se identifica por su recuadro y sus botones).
 *   ┌──────────────────────────────────────────────┐
 *   │                          [☑ Mostrar navegador] │
 *   │                   [ 🧪 Test ] [ 🔐 Generar ] │   ← acciones[0] (Generar) fija a la derecha;
 *   │                                              │     las siguientes van a su izquierda
 *   └──────────────────────────────────────────────┘
 *
 *   Con auxiliares, van en el renglón de las acciones, a la izquierda:
 *   ┌──────────────────────────────────────────────────────┐
 *   │                               [☑ Mostrar navegador] │
 *   │ [Limpiar] [Descartar]      [ 🧪 Test ] [ 🔐 Generar ] │
 *   └──────────────────────────────────────────────────────┘
 *   Si no entran en un renglón (ventana angosta), el último auxiliar sube al renglón
 *   del switch (clase ui-lanzador--apilado); las acciones siguen juntas:
 *     [Descartar]          [☑ Mostrar navegador]
 *     [Limpiar]       [ 🧪 Test ] [ 🔐 Generar ]
 *
 * La vista deja un contenedor vacío (<div id="lanzadorXx"></div>) y lo llena así:
 *
 *   const lanzador = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorXx'), {
 *       navegador: true,                           // false = sin switch (el servicio no deja ocultarlo)
 *       acciones: [{
 *           texto: '🔍 Consultar comprobantes',
 *           tipo: 'principal',                     // 'principal' (azul) | 'prueba' (verde) | 'secundario' (tono del servicio)
 *           nota: 'Facturación real',              // opcional: va en el tooltip del botón (junto con ayuda)
 *           ayuda: 'Qué hace…',                    // opcional, tooltip del botón
 *           preparar:  () => datos | null,         // opcional: null = no arranca
 *           confirmar: (datos) => ({ title, message, confirmBtnClass }),  // opcional: sin él no hay modal
 *           rueda:     { servicio, subservicio, mensaje },                // opcional
 *           confirmarCancelar: () => ({ title, message }) | null,        // opcional: modal antes de cancelar (null = sin modal)
 *           ejecutar:  async (datos, { visible }) => { ... }              // la corrida en sí
 *       }],
 *       auxiliares: [{                             // opcional: botones grises que NO lanzan nada
 *           texto: '🧹 Limpiar formulario',
 *           ayuda: 'Qué hace…',                    // opcional, tooltip
 *           mostrar: () => true | false,           // opcional: se consulta en cada repintado
 *           alHacer: () => { ... }
 *       }]
 *   });
 *   lanzador.habilitar(true | false);   // todas las acciones (mientras corre quedan bloqueadas igual)
 *   lanzador.habilitar(false, 1);       // solo la acción 1
 *   lanzador.cambiar(0, { texto, ayuda, nota });   // ej. "Consultar deuda para 3 CUIT(s)"; ayuda y nota = tooltip
 *   lanzador.lanzar(1, datos);          // corre la acción 1 con esos datos, sin preparar ni modal
 *                                       // (ej. reintentar un cliente desde Resultados): también se cancela
 *   lanzador.visible();                 // cómo está el switch del navegador
 *   lanzador.fijarNavegador(true);      // prende el switch y lo bloquea (la acción necesita verse)
 *   lanzador.fijarNavegador(false, false); // lo apaga y lo deja libre para que el usuario elija
 *   lanzador.enCurso();                 // true mientras corre
 *   lanzador.refrescar();               // vuelve a consultar mostrar() de los auxiliares
 *
 * Mientras corre:
 *   - el botón que se tocó pasa a "⏹ Cancelar" (rojo); las otras acciones, los auxiliares
 *     y el switch se bloquean.
 *   - Cancelar queda bloqueado CANCELAR_ARMA_MS al arrancar: un doble clic no corta la corrida.
 *   - Cancelar no pide confirmación (salvo que la acción traiga confirmarCancelar, ej. Facturación:
 *     lo emitido no se deshace): llama a 'automatizacion:cancelar', que cierra el navegador,
 *     y el botón dice "⏳ Cancelando…" hasta que ejecutar() termina. El servicio recibe
 *     { success:false, error:'CANCELADO', message:'Cancelado por el usuario' }.
 *
 * El modal: icono 🚀, botón "Iniciar" en el tono del servicio y "¿Desea continuar?" al final
 * del mensaje, salvo que confirmar() devuelva otro icon / confirmText / confirmBtnClass.
 * Los errores de ejecutar() no se tragan: los maneja el servicio adentro de ejecutar.
 */
(function () {
    const CANCELAR_ARMA_MS = 1500;

    function crear(contenedor, opciones = {}) {
        const { navegador = true, acciones = [], auxiliares = [] } = opciones;

        let corriendo = null;        // índice de la acción que está corriendo
        let cancelarArmado = false;
        let cancelando = false;
        let navegadorFijo = false;   // fijarNavegador(valor, true): el usuario no puede tocar el switch

        contenedor.classList.add('ui-lanzador');
        contenedor.innerHTML = '';

        let chkVisible = null;
        if (navegador) {
            const label = document.createElement('label');
            label.className = 'ui-switch';
            label.innerHTML = '<input type="checkbox" checked> Mostrar navegador';
            chkVisible = label.querySelector('input');
            contenedor.appendChild(label);
        }

        const fila = document.createElement('div');
        fila.className = 'ui-modo-botones';
        contenedor.appendChild(fila);

        const items = acciones.map((accion, i) => {
            const opcion = document.createElement('div');
            opcion.className = 'ui-modo-opcion';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `ui-btn ui-lanzador__accion ui-lanzador__accion--${accion.tipo || 'principal'}`;
            opcion.appendChild(btn);
            fila.appendChild(opcion);
            btn.addEventListener('click', () => clic(i));
            const item = { accion, btn, opcion, ayuda: accion.ayuda || '', nota: accion.nota || '', habilitado: false };
            ponerTooltip(item);
            return item;
        });

        // Auxiliares: hijos directos del recuadro (grilla de 2 columnas, ver el .css):
        // a la izquierda, en el renglón de las acciones.
        let auxItems = [];
        if (auxiliares.length) {
            contenedor.classList.add('ui-lanzador--con-auxiliares');
            const caja = document.createElement('div');
            caja.className = 'ui-lanzador__auxiliares';
            contenedor.appendChild(caja);
            auxItems = auxiliares.map((aux) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-btn ui-lanzador__auxiliar';
                btn.textContent = aux.texto;
                if (aux.ayuda) btn.title = aux.ayuda;
                btn.addEventListener('click', () => { if (corriendo === null) aux.alHacer(); });
                caja.appendChild(btn);
                return { aux, btn };
            });
        }

        // La nota ya no se escribe abajo del botón: va al tooltip, después de la ayuda.
        function ponerTooltip(item) {
            item.btn.title = [item.ayuda, item.nota].filter(Boolean).join(' — ');
        }

        function pintar() {
            items.forEach((item, i) => {
                const { btn } = item;
                const esLaQueCorre = corriendo === i;
                btn.classList.toggle('ui-lanzador__accion--cancelar', esLaQueCorre);
                if (esLaQueCorre) {
                    btn.textContent = cancelando ? 'Cancelando…' : 'Cancelar';
                    btn.disabled = !cancelarArmado || cancelando;
                } else {
                    btn.textContent = item.accion.texto;
                    btn.disabled = corriendo !== null || !item.habilitado;
                }
            });
            auxItems.forEach(({ aux, btn }) => {
                // style, no [hidden]: .ui-btn pone display y le ganaría.
                btn.style.display = aux.mostrar && !aux.mostrar() ? 'none' : '';
                btn.disabled = corriendo !== null;
            });
            acomodar();
            if (chkVisible) {
                chkVisible.disabled = corriendo !== null || navegadorFijo;
                chkVisible.closest('label').title = navegadorFijo ? 'Esta acción necesita el navegador a la vista' : '';
            }
        }

        // ¿Entran auxiliares + acciones en un renglón? Si no, el último auxiliar sube al
        // renglón del switch (solo CSS no alcanza: depende del largo de los textos de cada servicio).
        // Se mide con los anchos propios de cada botón, que no cambian al apilar.
        function acomodar() {
            if (!auxItems.length) return;
            const cs = getComputedStyle(contenedor);
            const disponible = contenedor.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            const ancho = (btns, gap) => {
                const vis = btns.filter(b => b.style.display !== 'none');
                return vis.reduce((n, b) => n + b.offsetWidth, 0) + gap * Math.max(vis.length - 1, 0);
            };
            const caja = contenedor.querySelector('.ui-lanzador__auxiliares');
            const gapAux = parseFloat(getComputedStyle(caja).columnGap) || 0;
            const gapAcc = parseFloat(getComputedStyle(fila).columnGap) || 0;
            const gapCol = parseFloat(cs.columnGap) || 0;
            const necesario = ancho(auxItems.map(a => a.btn), gapAux) + gapCol + ancho(items.map(i => i.btn), gapAcc);
            // +2px: offsetWidth redondea; sin margen, en el borde podía bajar un botón sin apilar
            contenedor.classList.toggle('ui-lanzador--apilado', necesario + 2 > disponible);
        }
        if (auxiliares.length && window.ResizeObserver) new ResizeObserver(acomodar).observe(contenedor);

        function clic(i) {
            if (corriendo === i) return cancelar();
            if (corriendo === null) return arrancar(i);
        }

        // directo = { datos }: lanzar() desde la vista, sin preparar ni modal.
        async function arrancar(i, directo) {
            const item = items[i];
            if (!directo && !item.habilitado) return;
            const { preparar, confirmar, rueda, ejecutar } = item.accion;

            const datos = directo ? directo.datos : (preparar ? preparar() : undefined);
            if (!directo && preparar && datos == null) return;

            if (confirmar && !directo) {
                const modal = confirmar(datos) || {};
                const confirmado = await showConfirmModal({
                    icon: '🚀',
                    confirmText: 'Iniciar',
                    confirmBtnClass: 'tono',
                    ...modal,
                    message: `${modal.message || ''}\n\n¿Desea continuar?`
                });
                if (!confirmado) return;
            }

            // "⏹ Cancelar" es más corto: el botón conserva su ancho y no salta
            item.btn.style.minWidth = `${item.btn.offsetWidth}px`;
            corriendo = i;
            cancelarArmado = false;
            cancelando = false;
            pintar();
            const reloj = setTimeout(() => { cancelarArmado = true; pintar(); }, CANCELAR_ARMA_MS);
            if (rueda && window.ruedaTrabajando) window.ruedaTrabajando.mostrar(rueda);
            try {
                await ejecutar(datos, { visible: visible() });
            } finally {
                clearTimeout(reloj);
                if (rueda && window.ruedaTrabajando) window.ruedaTrabajando.ocultar();
                corriendo = null;
                cancelando = false;
                item.btn.style.minWidth = '';
                pintar();
            }
        }

        async function cancelar() {
            if (!cancelarArmado || cancelando) return;
            const { confirmarCancelar } = items[corriendo].accion;
            const modal = confirmarCancelar && confirmarCancelar();
            if (modal) {
                const confirmado = await showConfirmModal({
                    icon: '⏹',
                    confirmText: 'Cancelar igual',
                    cancelText: 'Seguir',
                    confirmBtnClass: 'danger',
                    ...modal
                });
                // Pudo terminar sola mientras el modal estaba abierto
                if (!confirmado || corriendo === null || cancelando) return;
            }
            cancelando = true;
            pintar();
            try {
                await window.electronAPI.automatizacion.cancelar();
            } catch (e) {
                console.error('❌ Lanzador: no se pudo cancelar la corrida:', e);
                cancelando = false;
                pintar();
            }
        }

        function visible() {
            return chkVisible ? chkVisible.checked : true;
        }

        pintar();

        return {
            habilitar(valor, indice) {
                items.forEach((item, i) => {
                    if (indice === undefined || indice === i) item.habilitado = !!valor;
                });
                pintar();
            },
            cambiar(indice, { texto, ayuda, nota } = {}) {
                const item = items[indice];
                if (texto !== undefined) item.accion.texto = texto;
                if (ayuda !== undefined) item.ayuda = ayuda || '';
                if (nota !== undefined) item.nota = nota || '';
                ponerTooltip(item);
                pintar();
            },
            lanzar(indice, datos) {
                if (corriendo === null) return arrancar(indice, { datos });
            },
            visible,
            fijarNavegador(valor, fijo = true) {
                if (!chkVisible) return;
                chkVisible.checked = !!valor;
                navegadorFijo = !!fijo;
                pintar();
            },
            enCurso: () => corriendo !== null,
            refrescar: pintar
        };
    }

    window.lanzadorAutomatizacion = { crear };
})();
