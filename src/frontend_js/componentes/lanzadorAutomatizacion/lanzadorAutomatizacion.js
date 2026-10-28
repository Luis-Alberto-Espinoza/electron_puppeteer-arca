/**
 * LANZADOR DE AUTOMATIZACIÓN — la caja que arranca (y cancela) una automatización,
 * igual en todos los servicios.
 * ----------------------------------------------------------------------
 * Mismo patrón que archivoResultado / rueda (componente global auto-registrado).
 * Sale del recuadro de Facturación ("Selecciona el modo de Ingreso"): usa .ui-modo-botones.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ▍Título (opcional)                           │
 *   │ ☑ Mostrar navegador                          │
 *   │                   [ 🧪 Test ] [ 🔐 Generar ] │   ← acciones[0] (Generar) fija a la derecha;
 *   │                                              │     las siguientes van a su izquierda
 *   │ [🧹 Limpiar]      nota (opc.)  nota (opc.)   │   ← auxiliares (opc.) a la izquierda
 *   └──────────────────────────────────────────────┘
 *
 * La vista deja un contenedor vacío (<div id="lanzadorXx"></div>) y lo llena así:
 *
 *   const lanzador = window.lanzadorAutomatizacion.crear(document.getElementById('lanzadorXx'), {
 *       titulo: 'Selecciona el modo de Ingreso',   // opcional
 *       navegador: true,                           // false = sin switch (el servicio no deja ocultarlo)
 *       acciones: [{
 *           texto: '🔍 Consultar comprobantes',
 *           tipo: 'principal',                     // 'principal' (azul) | 'prueba' (verde) | 'secundario' (tono del servicio)
 *           nota: 'Facturación real',              // opcional, chica abajo del botón
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
 *   lanzador.cambiar(0, { texto, ayuda, nota });   // ej. "Consultar deuda para 3 CUIT(s)"; tooltip con el motivo
 *   lanzador.lanzar(1, datos);          // corre la acción 1 con esos datos, sin preparar ni modal
 *                                       // (ej. reintentar un cliente desde Resultados): también se cancela
 *   lanzador.visible();                 // cómo está el switch del navegador
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
        const { titulo, navegador = true, acciones = [], auxiliares = [] } = opciones;

        let corriendo = null;        // índice de la acción que está corriendo
        let cancelarArmado = false;
        let cancelando = false;

        contenedor.classList.add('ui-lanzador');
        contenedor.innerHTML = '';

        if (titulo) {
            const h = document.createElement('h3');
            h.className = 'ui-lanzador__titulo';
            h.textContent = titulo;
            contenedor.appendChild(h);
        }

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
            if (accion.ayuda) btn.title = accion.ayuda;
            opcion.appendChild(btn);
            let nota = null;
            if (accion.nota) {
                nota = document.createElement('small');
                nota.className = 'ui-modo-nota';
                nota.textContent = accion.nota;
                opcion.appendChild(nota);
            }
            fila.appendChild(opcion);
            btn.addEventListener('click', () => clic(i));
            return { accion, btn, opcion, nota, habilitado: false };
        });

        // Auxiliares: último hijo de la fila (row-reverse) → quedan a la izquierda.
        let auxItems = [];
        if (auxiliares.length) {
            contenedor.classList.add('ui-lanzador--con-auxiliares');
            const caja = document.createElement('div');
            caja.className = 'ui-lanzador__auxiliares';
            fila.appendChild(caja);
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
            if (chkVisible) chkVisible.disabled = corriendo !== null;
        }

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
                if (ayuda !== undefined) item.btn.title = ayuda || '';
                if (nota !== undefined) {
                    if (!item.nota) {
                        item.nota = document.createElement('small');
                        item.nota.className = 'ui-modo-nota';
                        item.opcion.appendChild(item.nota);
                    }
                    item.nota.textContent = nota || '';
                }
                pintar();
            },
            lanzar(indice, datos) {
                if (corriendo === null) return arrancar(indice, { datos });
            },
            visible,
            enCurso: () => corriendo !== null,
            refrescar: pintar
        };
    }

    window.lanzadorAutomatizacion = { crear };
})();
