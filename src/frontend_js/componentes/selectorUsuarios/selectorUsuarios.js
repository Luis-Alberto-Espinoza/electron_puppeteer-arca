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

            // API de Electron (pasada desde el contexto que tiene acceso)
            api: null,

            ...opciones
        };

        // Estado
        this.todosLosUsuarios = [];
        this.usuariosFiltrados = [];
        this.usuariosSeleccionados = [];
        this.textoBusqueda = '';

        this.inicializar();
    }

    async inicializar() {
        console.log('🔵 SelectorUsuarios: Iniciando...');
        await this.cargarUsuarios();
        console.log(`🔵 SelectorUsuarios: ${this.todosLosUsuarios.length} usuarios cargados, renderizando...`);
        this.renderizar();
        this.agregarEventos();
        console.log('✅ SelectorUsuarios: Inicialización completa');
    }

    /**
     * Determina el estado de validación de un usuario
     * @param {Object} usuario - Usuario a evaluar
     * @returns {Object} { estado: 'validado'|'invalido'|'sin_validar', mensaje: string, esSeleccionable: boolean }
     */
    obtenerEstadoValidacion(usuario) {
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

                // FILTRAR por estado de validación si está configurado
                if (this.opciones.campoEstado && !this.opciones.permitirInvalidos && !this.opciones.permitirSinValidar) {
                    const usuariosAntesDeFiltar = usuarios.length;

                    usuarios = usuarios.filter(user => {
                        const estadoValidacion = this.obtenerEstadoValidacion(user);
                        return estadoValidacion.estado === 'validado';
                    });

                    console.log(`🔵 Filtrado por estado validado: ${usuariosAntesDeFiltar} → ${usuarios.length} usuarios`);
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

    renderizar() {
        this.contenedor.innerHTML = `
            <div class="selector-usuarios-container">
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
                            placeholder="Buscar por nombre, CUIT, razón social..."
                            value="${this.textoBusqueda}"
                        />
                        <button
                            id="${this.contenedorId}-btn-limpiar"
                            class="btn-limpiar"
                        >
                            ✕ Limpiar
                        </button>
                    </div>
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

        return this.usuariosFiltrados.map((usuario, index) => {
            // Obtener índice ORIGINAL para color fijo (comparar como string)
            const indiceOriginal = this.todosLosUsuarios.findIndex(u => String(u.id) === String(usuario.id));
            const estaSeleccionado = this.usuariosSeleccionados.some(u => String(u.id) === String(usuario.id));
            const claseColor = indiceOriginal % 2 === 0 ? 'par' : 'impar';
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
            }

            return `
                <div
                    class="usuario-fila ${claseColor} ${claseSeleccionado} ${claseEstado} ${claseDeshabilitado}"
                    data-usuario-id="${usuario.id}"
                    data-seleccionable="${estadoValidacion.esSeleccionable}"
                >
                    <span class="usuario-check">
                        ${icono}
                    </span>
                    <div class="usuario-info">
                        <div class="usuario-nombre">${this.formatearNombreCompleto(usuario) || 'Sin nombre'}</div>
                        <div class="usuario-cuit">${usuario.cuit || usuario.cuil || 'N/A'}</div>
                        ${estadoValidacion.mensaje ? `
                            <div class="usuario-mensaje-estado">
                                ${estadoValidacion.mensaje}
                            </div>
                        ` : ''}
                    </div>
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

        if (!this.textoBusqueda) {
            this.usuariosFiltrados = [...this.todosLosUsuarios];
        } else {
            this.usuariosFiltrados = this.todosLosUsuarios.filter(u =>
                u.nombre?.toLowerCase().includes(this.textoBusqueda) ||
                String(u.cuit || '').includes(this.textoBusqueda) ||
                String(u.cuil || '').includes(this.textoBusqueda) ||
                u.razonSocial?.toLowerCase().includes(this.textoBusqueda)
            );
        }

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
            this.usuariosSeleccionados.push(usuario);
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
    }

    renderizarSoloListaSeleccionados() {
        const seccionSeleccionados = this.contenedor.querySelector('.lista-seleccionados-section');
        if (seccionSeleccionados) {
            seccionSeleccionados.innerHTML = this.renderizarSeccionSeleccionados();
        }
        // No es necesario reagregar eventos gracias a la delegación
    }

    // Métodos públicos para uso externo
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
