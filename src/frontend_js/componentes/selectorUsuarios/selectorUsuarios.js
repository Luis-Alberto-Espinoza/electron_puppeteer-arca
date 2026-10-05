/**
 * COMPONENTE GENÉRICO: SELECTOR DE USUARIOS
 * Reutilizable para VEP, ATM, Facturas, etc.
 *
 * Uso:
 * const selector = new SelectorUsuarios('contenedor-id', {
 *     onCambioSeleccion: (seleccionados) => { ... },
 *     renderizarColumnasExtras: (usuario, index) => { ... }
 * });
 */

class SelectorUsuarios {
    constructor(contenedorId, opciones = {}) {
        this.contenedorId = contenedorId;
        this.contenedor = document.getElementById(contenedorId);

        if (!this.contenedor) {
            console.error(`No se encontró el contenedor con ID: ${contenedorId}`);
            return;
        }

        // Opciones configurables
        this.opciones = {
            // Callback cuando cambia la selección
            onCambioSeleccion: null,

            // Función para renderizar columnas extras en tabla de seleccionados
            // Recibe (usuario, index) y debe retornar array de elementos TD
            renderizarColumnasExtras: null,

            // Headers para columnas extras (array de strings)
            headersColumnasExtras: [],

            // Mostrar tabla de seleccionados (útil para casos de selección única)
            mostrarTablaSeleccionados: true,

            // Selección única: al elegir otro usuario, reemplaza la selección
            // previa en vez de acumular (modo radio en vez de checkbox).
            seleccionUnica: false,

            // Mostrar columna CUIT por defecto
            mostrarColumnaCUIT: true,

            // ====== VALIDACIÓN Y FILTRADO ======
            // Campo que contiene las credenciales (ej: 'claveAFIP', 'claveATM')
            campoCredencial: null,

            // Campo que indica el estado de validación (ej: 'estado_afip')
            campoEstado: null,

            // Campo con el mensaje de error (ej: 'errorAfip')
            campoError: null,

            // Permitir seleccionar usuarios con credenciales inválidas
            permitirInvalidos: false,

            // Permitir seleccionar usuarios sin validar
            permitirSinValidar: false,

            // Mensaje para usuarios sin validar
            mensajeSinValidar: 'Debe validar las credenciales primero en la sección Gestión de Cliente',

            // ====== ANÁLISIS (scraping de empresas + PDV) ======
            // Si true, los usuarios validados pero sin análisis se muestran
            // deshabilitados (no seleccionables) con el mensaje de abajo.
            requiereAnalisis: false,

            // Campo booleano que indica si ya se hizo el scraping detallado.
            campoAnalisis: 'analizado_afip',

            // Mensaje para usuarios que están validados pero sin analizar.
            mensajeSinAnalizar: 'Analizá primero el cliente (botón "🔍 Analizar" en Gestión de Cliente) para traer empresas y puntos de venta.',

            // API de Electron (pasada desde el contexto que tiene acceso)
            api: null,

            // ====== MODELO PLANO (opt-in) ======
            // 'usuarios' (default, legacy: user.getAll) | 'contribuyentes' (nuevo: contribuyente.listar)
            // En modo 'contribuyentes' el backend ya computó puedeOperar/motivoNoOpera,
            // así que NO se usan campoCredencial/campoEstado/requiereAnalisis.
            fuente: 'usuarios',
            // Servicio para computar operabilidad en modo contribuyentes: 'facturacion'|'afip'|'atm'
            servicio: null,

            // ====== ACCIÓN POR FILA (opt-in) ======
            // Botón chico a la derecha de cada fila, ej. "Actualizar clave".
            // { texto, titulo?, mostrar(usuario, marca) → bool, onClick(usuario) }
            // Se combina con marcarFila(): la pantalla marca la fila que falló y el botón aparece ahí.
            accionFila: null,

            // ====== FILTRO DE HABILITADOS (opt-in) ======
            // Si true: por default solo se ven los que pueden operar, y una casilla
            // "Mostrar no habilitados (N)" muestra el resto. Requiere que el consumidor
            // cargue todos (permitirInvalidos). Las filas marcadas con marcarFila() siguen
            // visibles aunque dejen de estar habilitadas (ej. la clave acaba de fallar).
            filtroHabilitados: false,

            // Con permitirSinValidar: igual NO dejar elegir los que tienen la clave marcada
            // como incorrecta (para lotes: fallarían seguro y suman intentos hacia el captcha).
            bloquearClaveIncorrecta: false,

            ...opciones
        };

        // Estado
        this.todosLosUsuarios = [];
        this.usuariosFiltrados = [];
        this.usuariosSeleccionados = [];
        this.textoBusqueda = '';
        // Mensajes puestos desde afuera sobre filas puntuales: id → { mensaje, tipo: 'error'|'ok' }
        this.marcas = new Map();
        // Filtro de habilitados: estado de la casilla + filas tocadas en esta sesión.
        this.mostrarNoHabilitados = false;
        this.filasTocadas = new Set();
        // Con búsqueda: los no habilitados que coinciden se muestran al final, atenuados.
        this.idsAtenuados = new Set();

        this.inicializar();
    }

    async inicializar() {
        console.log('🔵 SelectorUsuarios: Iniciando...');
        await this.cargarUsuarios();
        this.calcularFiltrados();
        console.log(`🔵 SelectorUsuarios: ${this.todosLosUsuarios.length} usuarios cargados, renderizando...`);
        this.renderizar();
        this.agregarEventos();
        console.log('✅ SelectorUsuarios: Inicialización completa');
    }

    /**
     * Determina el estado de validación de un usuario
     * @param {Object} usuario - Usuario a evaluar
     * @returns {Object} { estado: 'validado'|'invalido'|'sin_validar'|'sin_analizar', mensaje: string, esSeleccionable: boolean }
     */
    obtenerEstadoValidacion(usuario) {
        // Modo contribuyentes: el backend ya decidió (puedeOperar/motivoNoOpera).
        if (usuario && usuario._fuenteContribuyentes) {
            if (usuario.puedeOperar) return { estado: 'validado', mensaje: null, esSeleccionable: true };
            // permitirSinValidar: si hay clave (aunque no validada) se deja elegir; usarla la valida.
            const bloqueada = this.opciones.bloquearClaveIncorrecta && usuario.claveIncorrecta;
            if (this.opciones.permitirSinValidar && usuario.tieneAcceso && !bloqueada) {
                return { estado: 'sin_validar', mensaje: usuario.motivoNoOpera, esSeleccionable: true };
            }
            return { estado: 'invalido', mensaje: usuario.motivoNoOpera || 'No puede operar en este servicio', esSeleccionable: false };
        }

        // Si no hay configuración de validación, todos son válidos
        if (!this.opciones.campoEstado) {
            return {
                estado: 'validado',
                mensaje: null,
                esSeleccionable: true
            };
        }

        const estadoUsuario = usuario[this.opciones.campoEstado];
        const errorUsuario = this.opciones.campoError ? usuario[this.opciones.campoError] : null;

        // GRUPO 1: Validado ✅
        if (estadoUsuario === 'validado') {
            // Sub-chequeo: si la vista requiere análisis (scraping de empresas/PDV),
            // un cliente validado pero sin analizar no es usable acá.
            if (this.opciones.requiereAnalisis && usuario[this.opciones.campoAnalisis] !== true) {
                return {
                    estado: 'sin_analizar',
                    mensaje: this.opciones.mensajeSinAnalizar,
                    esSeleccionable: false
                };
            }
            return {
                estado: 'validado',
                mensaje: null,
                esSeleccionable: true
            };
        }

        // GRUPO 2: Inválido ❌
        if (estadoUsuario === 'invalido' || usuario.claveAfipValida === false) {
            return {
                estado: 'invalido',
                mensaje: errorUsuario || 'Credenciales inválidas',
                esSeleccionable: this.opciones.permitirInvalidos
            };
        }

        // GRUPO 3: Sin validar ⚠️
        return {
            estado: 'sin_validar',
            mensaje: this.opciones.mensajeSinValidar,
            esSeleccionable: this.opciones.permitirSinValidar
        };
    }

    /**
     * Cuenta cuántos usuarios son realmente seleccionables
     * @returns {number}
     */
    contarUsuariosSeleccionables() {
        return this.usuariosFiltrados.filter(usuario => {
            const estado = this.obtenerEstadoValidacion(usuario);
            return estado.esSeleccionable;
        }).length;
    }

    async cargarUsuarios() {
        // Modo opt-in: leer del modelo plano (contribuyente.listar) en vez de user.getAll.
        if (this.opciones.fuente === 'contribuyentes') {
            return this.cargarContribuyentes();
        }
        try {
            // Usar window.electronAPI (como ATM) o la API pasada en opciones
            const api = this.opciones.api || window.electronAPI || window.api;

            console.log('🔵 Verificando API...', typeof api);

            if (!api || !api.user || !api.user.getAll) {
                console.error('❌ API no disponible');
                this.todosLosUsuarios = [];
                this.usuariosFiltrados = [];
                return;
            }

            console.log('🔵 Llamando a user.getAll()...');
            const response = await api.user.getAll();
            console.log('🔵 Respuesta recibida:', response);

            if (!response) {
                console.error('❌ Response es null o undefined');
                this.todosLosUsuarios = [];
                this.usuariosFiltrados = [];
                return;
            }

            if (response.success) {
                // Verificar que response.users existe y es un array
                if (!response.users || !Array.isArray(response.users)) {
                    console.error('❌ response.users no es un array válido:', response.users);
                    this.todosLosUsuarios = [];
                    this.usuariosFiltrados = [];
                    return;
                }

                let usuarios = response.users;

                // FILTRAR por credencial si está configurado (GRUPO 4 - Sin credenciales)
                if (this.opciones.campoCredencial) {
                    const campoCredencial = this.opciones.campoCredencial;
                    const usuariosAntesDeFiltar = usuarios.length;

                    usuarios = usuarios.filter(user => {
                        const credencial = user[campoCredencial];
                        return credencial && String(credencial).trim() !== '';
                    });

                    console.log(`🔵 Filtrado por ${campoCredencial}: ${usuariosAntesDeFiltar} → ${usuarios.length} usuarios`);
                }

                // FILTRAR por estado de validación si está configurado.
                // Solo dejamos pasar a los 'validado': ocultamos del listado a
                // todos los que no se pueden operar (inválidos, sin_validar y
                // también sin_analizar cuando requiereAnalisis está activo).
                if (this.opciones.campoEstado && !this.opciones.permitirInvalidos && !this.opciones.permitirSinValidar) {
                    const usuariosAntesDeFiltar = usuarios.length;

                    usuarios = usuarios.filter(user => {
                        const estadoValidacion = this.obtenerEstadoValidacion(user);
                        return estadoValidacion.estado === 'validado';
                    });

                    console.log(`🔵 Filtrado (oculta inválidos): ${usuariosAntesDeFiltar} → ${usuarios.length} usuarios`);
                }

                // Ordenar alfabéticamente por nombre
                this.todosLosUsuarios = usuarios.sort((a, b) => {
                    const nombreA = a.nombre || '';
                    const nombreB = b.nombre || '';
                    return nombreA.localeCompare(nombreB);
                });
                this.usuariosFiltrados = [...this.todosLosUsuarios];

                console.log(`✅ ${this.todosLosUsuarios.length} usuarios cargados`);
            } else {
                console.error('❌ Error en respuesta:', response.error || 'Error desconocido');
                this.todosLosUsuarios = [];
                this.usuariosFiltrados = [];
            }
        } catch (error) {
            console.error('❌ Error en cargarUsuarios:', error);
            this.todosLosUsuarios = [];
            this.usuariosFiltrados = [];
        }
    }

    /**
     * Carga desde el modelo plano (contribuyente.listar). Los items ya vienen con
     * puedeOperar/motivoNoOpera computados por el backend y SIN claves. Se adaptan
     * al shape interno que usa el render (nombre/cuit/id) marcándolos con
     * `_fuenteContribuyentes` para que obtenerEstadoValidacion sepa el origen.
     */
    async cargarContribuyentes() {
        try {
            const api = this.opciones.api || window.electronAPI || window.api;
            if (!api || !api.contribuyente || !api.contribuyente.listar) {
                console.error('❌ API contribuyente.listar no disponible');
                this.todosLosUsuarios = [];
                this.usuariosFiltrados = [];
                return;
            }

            const resp = await api.contribuyente.listar({ servicio: this.opciones.servicio });
            if (!resp || !resp.success || !Array.isArray(resp.items)) {
                console.error('❌ contribuyente.listar falló:', resp && resp.error);
                this.todosLosUsuarios = [];
                this.usuariosFiltrados = [];
                return;
            }

            let items = resp.items.map(it => ({
                id: it.id,
                cuit: it.cuit,
                cuil: null,
                // Preferimos el apodo del usuario (nombre/apellido) para mostrar y
                // buscar; si no cargó ninguno, cae al nombre canónico (razón social).
                // Lo que se usa para operar en AFIP lo resuelve el backend aparte.
                nombre: it.nombre || it.nombreMostrado,
                apellido: it.apellido || '',
                razonSocial: it.razonSocial || it.nombreMostrado,
                tipo: it.tipo,
                tipoContribuyente: it.tipoContribuyente,
                puedeOperar: it.puedeOperar,
                motivoNoOpera: it.motivoNoOpera,
                tieneAcceso: it.tieneAcceso,
                problemaClave: it.problemaClave,
                claveIncorrecta: it.claveIncorrecta,
                sinPuntosDeVenta: it.sinPuntosDeVenta,
                pdvRevisado: it.pdvRevisado,
                esRepresentado: it.esRepresentado,
                _fuenteContribuyentes: true
            }));

            // Por default ocultamos a los que no pueden operar (igual que el legacy).
            // permitirSinValidar suma los que tienen clave sin validar; permitirInvalidos muestra todos.
            if (!this.opciones.permitirInvalidos) {
                items = items.filter(i => i.puedeOperar || (this.opciones.permitirSinValidar && i.tieneAcceso));
            }

            this.todosLosUsuarios = items.sort((a, b) =>
                (a.nombre || '').localeCompare(b.nombre || ''));
            this.usuariosFiltrados = [...this.todosLosUsuarios];
            console.log(`✅ ${this.todosLosUsuarios.length} contribuyentes cargados (servicio=${this.opciones.servicio})`);
        } catch (error) {
            console.error('❌ Error en cargarContribuyentes:', error);
            this.todosLosUsuarios = [];
            this.usuariosFiltrados = [];
        }
    }

    renderizar() {
        this.contenedor.innerHTML = `
            <div class="selector-usuarios-container${this.opciones.servicio === 'atm' ? ' servicio-atm' : ''}">
                <!-- Buscador -->
                <div class="buscador-section">
                    <div class="buscador-titulo">
                        🔍 BUSCAR CLIENTES
                    </div>
                    <div class="buscador-input-wrapper">
                        <input
                            type="text"
                            id="${this.contenedorId}-buscador"
                            class="buscador-input"
                            placeholder="Buscar por nombre, apellido, CUIT, razón social..."
                            value="${this.textoBusqueda}"
                        />
                        <button
                            id="${this.contenedorId}-btn-limpiar"
                            class="btn-limpiar"
                        >
                            ✕ Limpiar
                        </button>
                    </div>
                    ${this.opciones.filtroHabilitados ? `
                        <label class="filtro-habilitados">
                            <input type="checkbox" id="${this.contenedorId}-chk-no-habilitados"
                                ${this.mostrarNoHabilitados ? 'checked' : ''}>
                            Mostrar no habilitados
                            (<span class="filtro-habilitados-cant">${this.contarNoHabilitados()}</span>)
                        </label>
                    ` : ''}
                </div>

                <!-- Lista de disponibles -->
                <div class="lista-disponibles-section">
                    <div class="lista-header">
                        <span>📋 CLIENTES DISPONIBLES</span>
                        <span class="lista-contador">${this.contarUsuariosSeleccionables()} seleccionables de ${this.usuariosFiltrados.length}</span>
                    </div>
                    <div class="lista-usuarios-disponibles" id="${this.contenedorId}-lista-disponibles">
                        ${this.renderizarListaDisponibles()}
                    </div>
                </div>

                <!-- Lista de seleccionados (opcional) -->
                ${this.opciones.mostrarTablaSeleccionados ? `
                    <div class="lista-seleccionados-section">
                        ${this.renderizarSeccionSeleccionados()}
                    </div>
                ` : ''}
            </div>
        `;

        this.agregarEventos();
    }

    /**
     * Formatea el nombre completo del usuario (nombre + apellido) con capitalización
     * @param {Object} usuario - Objeto usuario con propiedades nombre y apellido
     * @returns {string} Nombre completo capitalizado
     */
    formatearNombreCompleto(usuario) {
        const capitalizarTexto = (texto) => {
            if (!texto) return '';
            return texto.split(' ')
                .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase())
                .join(' ');
        };

        const nombre = capitalizarTexto(usuario.nombre || '');
        const apellido = capitalizarTexto(usuario.apellido || '');

        return apellido ? `${nombre} ${apellido}` : nombre;
    }

    renderizarListaDisponibles() {
        console.log(`🔵 Renderizando lista disponibles: ${this.usuariosFiltrados.length} usuarios`);

        if (this.usuariosFiltrados.length === 0) {
            return `
                <div class="tabla-vacia">
                    ${this.textoBusqueda ? 'No se encontraron usuarios' : 'No hay usuarios disponibles'}
                </div>
            `;
        }

        let separadorPuesto = false;
        return this.usuariosFiltrados.map((usuario, index) => {
            // Los no habilitados que coinciden con la búsqueda van al final, atenuados, con un
            // separador antes del primero: se ven, pero queda claro que hay que arreglarlos.
            const atenuado = this.idsAtenuados.has(String(usuario.id));
            let separador = '';
            if (atenuado && !separadorPuesto) {
                separadorPuesto = true;
                separador = `<div class="separador-atenuados">No habilitados que coinciden con la búsqueda</div>`;
            }

            // Cebra por posición en la lista VISIBLE: al filtrar se re-alterna y no quedan filas pegadas del mismo color.
            const estaSeleccionado = this.usuariosSeleccionados.some(u => String(u.id) === String(usuario.id));
            const claseColor = index % 2 === 0 ? 'par' : 'impar';
            const claseSeleccionado = estaSeleccionado ? 'seleccionado' : '';

            // Obtener estado de validación
            const estadoValidacion = this.obtenerEstadoValidacion(usuario);
            const claseEstado = `estado-${estadoValidacion.estado}`;
            const claseDeshabilitado = !estadoValidacion.esSeleccionable ? 'deshabilitado' : '';

            // Determinar ícono según estado
            let icono = '';
            if (estaSeleccionado) {
                icono = '✓';
            } else if (estadoValidacion.estado === 'invalido') {
                icono = '❌';
            } else if (estadoValidacion.estado === 'sin_validar') {
                icono = '⚠️';
            } else if (estadoValidacion.estado === 'sin_analizar') {
                icono = '⏳';
            }

            // Una marca puesta desde afuera (ej. "clave incorrecta" recién devuelto por el login)
            // le gana al mensaje de estado: es lo más reciente que sabemos de esa fila.
            const marca = this.marcas.get(String(usuario.id)) || null;
            const mensaje = marca ? marca.mensaje : estadoValidacion.mensaje;
            const claseMarca = marca ? `marca-${marca.tipo}` : '';
            const accion = this.opciones.accionFila;
            const mostrarAccion = accion && (!accion.mostrar || accion.mostrar(usuario, marca));
            // texto/titulo pueden depender de la fila (ej. "Clave" o "Traer PDV" según el problema).
            const textoAccion = mostrarAccion && (typeof accion.texto === 'function' ? accion.texto(usuario, marca) : accion.texto);
            const tituloAccion = mostrarAccion && (typeof accion.titulo === 'function' ? accion.titulo(usuario, marca) : accion.titulo);
            // Visible pero apagado (ej. mientras corre lo que disparó: evita el doble click).
            const accionApagada = mostrarAccion && !!(accion.deshabilitado && accion.deshabilitado(usuario, marca));

            return separador + `
                <div
                    class="usuario-fila ${claseColor} ${claseSeleccionado} ${claseEstado} ${claseDeshabilitado} ${claseMarca} ${atenuado ? 'atenuada' : ''}"
                    data-usuario-id="${usuario.id}"
                    data-seleccionable="${estadoValidacion.esSeleccionable}"
                >
                    <span class="usuario-check">
                        ${icono}
                    </span>
                    <div class="usuario-info">
                        <div class="usuario-linea">
                            <span class="usuario-nombre">${this.formatearNombreCompleto(usuario) || 'Sin nombre'}</span>
                            ${mensaje ? `<span class="usuario-mensaje-estado">${mensaje}</span>` : ''}
                        </div>
                        <div class="usuario-cuit">${usuario.cuit || usuario.cuil || 'N/A'}</div>
                    </div>
                    ${mostrarAccion ? `
                        <button type="button" class="usuario-accion" data-accion-id="${usuario.id}" ${accionApagada ? 'disabled' : ''}
                            title="${tituloAccion || textoAccion}">${textoAccion}</button>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    renderizarSeccionSeleccionados() {
        const cantidadSeleccionados = this.usuariosSeleccionados.length;

        return `
            <div class="seleccionados-header">
                <span>✓ SELECCIONADOS (${cantidadSeleccionados})</span>
                <span class="contador-validacion" id="${this.contenedorId}-contador-validacion">
                    <!-- Se actualiza dinámicamente desde el controlador VEP -->
                </span>
            </div>
            <div class="tabla-seleccionados-wrapper">
                ${cantidadSeleccionados === 0
                    ? this.renderizarTablaVacia()
                    : this.renderizarTablaSeleccionados()
                }
            </div>
        `;
    }

    renderizarTablaVacia() {
        return `
            <table class="tabla-seleccionados">
                <thead>
                    <tr>
                        <th>Quitar</th>
                        <th>Cliente</th>
                        ${this.opciones.mostrarColumnaCUIT ? '<th>CUIT</th>' : ''}
                        ${this.opciones.headersColumnasExtras.map(h => `<th>${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="${3 + this.opciones.headersColumnasExtras.length}" class="tabla-vacia">
                            No hay usuarios seleccionados<br>
                            <small>Haga click en la tabla superior</small>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    renderizarTablaSeleccionados() {
        const filas = this.usuariosSeleccionados.map((usuario, index) => {
            const claseColor = index % 2 === 0 ? 'par' : 'impar';

            return `
                <tr class="${claseColor}" data-usuario-id="${usuario.id}">
                    <td style="text-align: center;">
                        <button
                            class="btn-quitar"
                            data-usuario-id="${usuario.id}"
                            title="Quitar de la lista"
                        >
                            ❌
                        </button>
                    </td>
                    <td>${this.formatearNombreCompleto(usuario) || 'Sin nombre'}</td>
                    ${this.opciones.mostrarColumnaCUIT ? `<td>${usuario.cuit || usuario.cuil || 'N/A'}</td>` : ''}
                    ${this.renderizarColumnasExtrasFila(usuario, index)}
                </tr>
            `;
        }).join('');

        return `
            <table class="tabla-seleccionados">
                <thead>
                    <tr>
                        <th>Quitar</th>
                        <th>Cliente</th>
                        ${this.opciones.mostrarColumnaCUIT ? '<th>CUIT</th>' : ''}
                        ${this.opciones.headersColumnasExtras.map(h => `<th>${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${filas}
                </tbody>
            </table>
        `;
    }

    renderizarColumnasExtrasFila(usuario, index) {
        if (this.opciones.renderizarColumnasExtras) {
            return this.opciones.renderizarColumnasExtras(usuario, index);
        }
        return '';
    }

    agregarEventos() {
        // Usar delegación de eventos en el contenedor principal (que nunca cambia)
        // para evitar perder eventos cuando se actualiza el DOM

        // Remover listeners previos si existen
        if (this._clickHandler) {
            this.contenedor.removeEventListener('click', this._clickHandler);
        }
        if (this._inputHandler) {
            this.contenedor.removeEventListener('input', this._inputHandler);
        }

        // Delegación de eventos para clicks
        this._clickHandler = (e) => {
            // Botón de acción de la fila: va ANTES que la fila (está adentro) para no seleccionarla.
            const btnAccion = e.target.closest('.usuario-accion');
            if (btnAccion) {
                const usuario = this.todosLosUsuarios.find(u => String(u.id) === btnAccion.dataset.accionId);
                if (usuario && this.opciones.accionFila) this.opciones.accionFila.onClick(usuario);
                return;
            }

            // Click en fila de usuario disponible
            const fila = e.target.closest('.usuario-fila');
            if (fila) {
                const usuarioId = fila.dataset.usuarioId;
                console.log('🔵 Click en usuario:', usuarioId);
                this.toggleSeleccion(usuarioId);
                return;
            }

            // Click en botón quitar
            const btnQuitar = e.target.closest('.btn-quitar');
            if (btnQuitar) {
                const usuarioId = btnQuitar.dataset.usuarioId;
                console.log('🔵 Quitar usuario:', usuarioId);
                this.quitarSeleccion(usuarioId);
                return;
            }

            // Click en botón limpiar búsqueda
            if (e.target.id === `${this.contenedorId}-btn-limpiar`) {
                console.log('🔵 Limpiar búsqueda');
                this.limpiarBusqueda();
                return;
            }
        };

        // Delegación de eventos para inputs
        this._inputHandler = (e) => {
            if (e.target.id === `${this.contenedorId}-chk-no-habilitados`) {
                this.setMostrarNoHabilitados(e.target.checked);
                return;
            }
            if (e.target.id === `${this.contenedorId}-buscador`) {
                console.log('🔵 Filtrar:', e.target.value);
                this.filtrar(e.target.value);
            }
        };

        this.contenedor.addEventListener('click', this._clickHandler);
        this.contenedor.addEventListener('input', this._inputHandler);

        // Dar foco automático al input de búsqueda
        const inputBuscador = document.getElementById(`${this.contenedorId}-buscador`);
        if (inputBuscador) {
            setTimeout(() => inputBuscador.focus(), 100);
        }

        console.log('✅ Eventos agregados al contenedor');
    }

    filtrar(texto) {
        this.textoBusqueda = texto.toLowerCase();
        this.calcularFiltrados();
        this.renderizarSoloListaDisponibles();
    }

    /** Habilitado = puede operar en el servicio (lo que se ve por default con filtroHabilitados). */
    esHabilitado(usuario) {
        return this.obtenerEstadoValidacion(usuario).estado === 'validado';
    }

    contarNoHabilitados() {
        return this.todosLosUsuarios.filter(u => !this.esHabilitado(u)).length;
    }

    /** Aplica búsqueda + filtro de habilitados sobre todosLosUsuarios. */
    calcularFiltrados() {
        const t = this.textoBusqueda;
        const coinciden = !t ? [...this.todosLosUsuarios] : this.todosLosUsuarios.filter(u => {
            // Nombre completo combinado: permite buscar "juan salas" aunque el
            // nombre y el apellido estén en campos separados.
            const nombreCompleto = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
            return (
                u.nombre?.toLowerCase().includes(t) ||
                u.apellido?.toLowerCase().includes(t) ||
                nombreCompleto.includes(t) ||
                String(u.cuit || '').includes(t) ||
                String(u.cuil || '').includes(t) ||
                u.razonSocial?.toLowerCase().includes(t)
            );
        });

        this.idsAtenuados = new Set();
        if (!this.opciones.filtroHabilitados || this.mostrarNoHabilitados) {
            this.usuariosFiltrados = coinciden;
            return;
        }
        // También quedan a la vista los seleccionados: si no, uno elegido con la casilla
        // prendida desaparecería al apagarla y seguiría entrando al lote sin que se vea.
        const seleccionados = new Set(this.usuariosSeleccionados.map(u => String(u.id)));
        const visibles = coinciden.filter(u =>
            this.esHabilitado(u) || this.filasTocadas.has(String(u.id)) || seleccionados.has(String(u.id)));

        // Sin búsqueda: solo los habilitados (la lista limpia). Con búsqueda: los no
        // habilitados que coinciden van al final, atenuados, para que se vea que existen
        // y se puedan arreglar con el botón "Clave" sin tener que prender la casilla.
        if (!t) {
            this.usuariosFiltrados = visibles;
            return;
        }
        const idsVisibles = new Set(visibles.map(u => String(u.id)));
        const extras = coinciden.filter(u => !idsVisibles.has(String(u.id)));
        this.idsAtenuados = new Set(extras.map(u => String(u.id)));
        this.usuariosFiltrados = [...visibles, ...extras];
    }

    setMostrarNoHabilitados(valor) {
        this.mostrarNoHabilitados = !!valor;
        const chk = document.getElementById(`${this.contenedorId}-chk-no-habilitados`);
        if (chk) chk.checked = this.mostrarNoHabilitados;
        this.calcularFiltrados();
        this.renderizarSoloListaDisponibles();
    }

    limpiarBusqueda() {
        this.textoBusqueda = '';
        const inputBuscador = document.getElementById(`${this.contenedorId}-buscador`);
        if (inputBuscador) {
            inputBuscador.value = '';
        }
        this.filtrar('');
    }

    toggleSeleccion(usuarioId) {
        // Comparar IDs como strings para evitar problemas de tipos
        const usuario = this.todosLosUsuarios.find(u => String(u.id) === String(usuarioId));
        if (!usuario) {
            console.error('❌ Usuario no encontrado:', usuarioId);
            console.log('IDs disponibles:', this.todosLosUsuarios.map(u => u.id));
            return;
        }

        const index = this.usuariosSeleccionados.findIndex(u => String(u.id) === String(usuarioId));

        if (index >= 0) {
            // Ya está seleccionado → quitar (siempre se permite quitar)
            console.log('🔵 Quitando usuario de seleccionados:', usuario.nombre);
            this.usuariosSeleccionados.splice(index, 1);
        } else {
            // No está seleccionado → verificar si se puede agregar
            const estadoValidacion = this.obtenerEstadoValidacion(usuario);

            if (!estadoValidacion.esSeleccionable) {
                console.warn(`⚠️ No se puede seleccionar ${usuario.nombre}: ${estadoValidacion.mensaje}`);
                // Mostrar feedback visual (opcional)
                this.mostrarFeedbackNoSeleccionable(usuarioId, estadoValidacion.mensaje);
                return;
            }

            // Sí se puede agregar
            console.log('🔵 Agregando usuario a seleccionados:', usuario.nombre);
            if (this.opciones.seleccionUnica) {
                // Modo single: reemplaza la selección previa (comportamiento radio).
                this.usuariosSeleccionados = [usuario];
            } else {
                this.usuariosSeleccionados.push(usuario);
            }
        }

        console.log('🔵 Total seleccionados:', this.usuariosSeleccionados.length);
        this.actualizarVista();
        this.notificarCambio();
    }

    /**
     * Muestra feedback visual cuando un usuario no es seleccionable
     */
    mostrarFeedbackNoSeleccionable(usuarioId, mensaje) {
        const fila = this.contenedor.querySelector(`.usuario-fila[data-usuario-id="${usuarioId}"]`);
        if (fila) {
            // Agregar clase de animación temporalmente
            fila.classList.add('intento-seleccion-bloqueado');
            setTimeout(() => {
                fila.classList.remove('intento-seleccion-bloqueado');
            }, 600);
        }
    }

    quitarSeleccion(usuarioId) {
        this.usuariosSeleccionados = this.usuariosSeleccionados.filter(
            u => String(u.id) !== String(usuarioId)
        );

        this.actualizarVista();
        this.notificarCambio();
    }

    notificarCambio() {
        if (this.opciones.onCambioSeleccion) {
            this.opciones.onCambioSeleccion(this.usuariosSeleccionados);
        }
    }

    actualizarVista() {
        this.renderizarSoloListaDisponibles();
        this.renderizarSoloListaSeleccionados();
    }

    renderizarSoloListaDisponibles() {
        const listaDisponibles = document.getElementById(`${this.contenedorId}-lista-disponibles`);
        if (listaDisponibles) {
            listaDisponibles.innerHTML = this.renderizarListaDisponibles();
        }

        // Actualizar contador
        const contador = this.contenedor.querySelector('.lista-contador');
        if (contador) {
            contador.textContent = `${this.contarUsuariosSeleccionables()} seleccionables de ${this.usuariosFiltrados.length}`;
        }
        const cantNoHab = this.contenedor.querySelector('.filtro-habilitados-cant');
        if (cantNoHab) cantNoHab.textContent = this.contarNoHabilitados();
    }

    renderizarSoloListaSeleccionados() {
        const seccionSeleccionados = this.contenedor.querySelector('.lista-seleccionados-section');
        if (seccionSeleccionados) {
            seccionSeleccionados.innerHTML = this.renderizarSeccionSeleccionados();
        }
        // No es necesario reagregar eventos gracias a la delegación
    }

    // Métodos públicos para uso externo

    /** Pone un mensaje en la fila de un usuario. tipo: 'error' | 'ok'. */
    marcarFila(usuarioId, mensaje, tipo = 'error') {
        this.marcas.set(String(usuarioId), { mensaje, tipo });
        this.filasTocadas.add(String(usuarioId));   // que no la esconda el filtro de habilitados
        this.calcularFiltrados();
        this.renderizarSoloListaDisponibles();
    }

    limpiarMarcaFila(usuarioId) {
        if (this.marcas.delete(String(usuarioId))) this.renderizarSoloListaDisponibles();
    }

    /** Vuelve a pedir la lista al backend (ej. tras cambiar una clave) conservando búsqueda y marcas. */
    async recargar() {
        await this.cargarUsuarios();
        this.filtrar(this.textoBusqueda);
    }

    obtenerSeleccionados() {
        return this.usuariosSeleccionados;
    }

    limpiarSeleccion() {
        this.usuariosSeleccionados = [];
        this.actualizarVista();
        this.notificarCambio();
    }

    actualizarContadorValidacion(html) {
        const contador = document.getElementById(`${this.contenedorId}-contador-validacion`);
        if (contador) {
            contador.innerHTML = html;
        }
    }

    marcarFilaSinMedioPago(usuarioId, sinMedio) {
        const fila = this.contenedor.querySelector(
            `.tabla-seleccionados tbody tr[data-usuario-id="${usuarioId}"]`
        );

        if (fila) {
            if (sinMedio) {
                fila.classList.add('sin-medio-pago');
            } else {
                fila.classList.remove('sin-medio-pago');
            }
        }
    }
}

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SelectorUsuarios;
}
