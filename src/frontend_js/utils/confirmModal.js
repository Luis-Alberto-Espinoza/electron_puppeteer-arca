/**
 * ========================================
 * COMPONENTE DE MODAL DE CONFIRMACIÓN
 * ========================================
 *
 * Componente reutilizable para mostrar modales de confirmación
 * en toda la aplicación. Reemplaza al confirm() nativo que causa
 * problemas de foco en Electron.
 *
 * @author Claude Code
 * @version 1.0.0
 */

console.log('✅ Componente confirmModal.js cargado');

/**
 * Inicializa el componente de modal de confirmación.
 * Inyecta el HTML del modal en el body del documento.
 *
 * IMPORTANTE: Llamar esta función UNA SOLA VEZ al cargar la página.
 */
function initConfirmModal() {
    console.log('🔧 Inicializando modal de confirmación...');

    // Template HTML del modal
    const modalHTML = `
        <!-- ==================== MODAL DE CONFIRMACIÓN REUTILIZABLE ==================== -->
        <div class="modal fade" id="confirmModal" tabindex="-1" aria-labelledby="confirmModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content bg-dark-custom">
                    <div class="modal-header border-bottom-custom">
                        <h5 class="modal-title" id="confirmModalLabel">
                            <span id="confirmModalIcon" class="me-2">⚠️</span>
                            <span id="confirmModalTitle">Confirmación</span>
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body text-light">
                        <p id="confirmModalMessage" class="mb-0"></p>
                    </div>
                    <div class="modal-footer border-top-custom">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="confirmModalCancelBtn">
                            <span id="confirmModalCancelText">Cancelar</span>
                        </button>
                        <button type="button" class="btn" id="confirmModalConfirmBtn">
                            <span id="confirmModalConfirmText">Confirmar</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inyectar el HTML al final del body
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = modalHTML;
    document.body.appendChild(tempDiv.firstElementChild);

    console.log('✅ Modal de confirmación inicializado correctamente');
}

/**
 * Muestra un modal de confirmación personalizable (reemplaza al confirm() nativo)
 *
 * @param {Object} options - Opciones de configuración del modal
 * @param {string} options.title - Título del modal (default: "Confirmación")
 * @param {string} options.message - Mensaje del modal (requerido)
 * @param {string} options.icon - Emoji/icono a mostrar (default: "⚠️")
 * @param {string} options.confirmText - Texto del botón de confirmar (default: "Confirmar")
 * @param {string} options.cancelText - Texto del botón de cancelar (default: "Cancelar")
 * @param {string} options.confirmBtnClass - Clase CSS del botón confirmar: 'danger', 'success', o vacío (default: 'danger')
 * @param {Function} options.onConfirm - Callback al confirmar (opcional)
 * @param {Function} options.onCancel - Callback al cancelar (opcional)
 *
 * @returns {Promise<boolean>} - Resuelve true si confirma, false si cancela
 *
 * @example
 * // Uso básico
 * const confirmed = await showConfirmModal({
 *     message: '¿Estás seguro de eliminar este usuario?'
 * });
 * if (confirmed) {
 *     // Usuario confirmó
 * }
 *
 * @example
 * // Uso avanzado con todas las opciones
 * showConfirmModal({
 *     title: 'Eliminar Usuario',
 *     message: '¿Deseas eliminar a Juan Pérez?',
 *     icon: '🗑️',
 *     confirmText: 'Sí, eliminar',
 *     cancelText: 'No, cancelar',
 *     confirmBtnClass: 'danger',
 *     onConfirm: () => console.log('Confirmado'),
 *     onCancel: () => console.log('Cancelado')
 * });
 */
function showConfirmModal(options = {}) {
    return new Promise((resolve) => {
        // Opciones por defecto
        const config = {
            title: options.title || 'Confirmación',
            message: options.message || '¿Estás seguro de realizar esta acción?',
            icon: options.icon || '⚠️',
            confirmText: options.confirmText || 'Confirmar',
            cancelText: options.cancelText || 'Cancelar',
            confirmBtnClass: options.confirmBtnClass || 'danger', // 'danger', 'success', o vacío
            onConfirm: options.onConfirm || null,
            onCancel: options.onCancel || null
        };

        // Obtener elementos del DOM
        const modalElement = document.getElementById('confirmModal');
        if (!modalElement) {
            console.error('❌ Error: Modal no encontrado. ¿Olvidaste llamar initConfirmModal()?');
            resolve(false);
            return;
        }

        const modalTitle = document.getElementById('confirmModalTitle');
        const modalIcon = document.getElementById('confirmModalIcon');
        const modalMessage = document.getElementById('confirmModalMessage');
        const confirmBtn = document.getElementById('confirmModalConfirmBtn');
        const cancelBtn = document.getElementById('confirmModalCancelBtn');
        const confirmText = document.getElementById('confirmModalConfirmText');
        const cancelText = document.getElementById('confirmModalCancelText');

        // Configurar contenido del modal
        modalTitle.textContent = config.title;
        modalIcon.textContent = config.icon;
        modalMessage.textContent = config.message;
        confirmText.textContent = config.confirmText;
        cancelText.textContent = config.cancelText;

        // Configurar clase del botón de confirmar
        confirmBtn.className = 'btn'; // Reset clases
        if (config.confirmBtnClass === 'danger') {
            confirmBtn.classList.add('btn-danger');
        } else if (config.confirmBtnClass === 'success') {
            confirmBtn.classList.add('btn-success');
        }
        // Si no es danger ni success, usa el estilo amarillo por defecto del CSS

        // Crear instancia del modal de Bootstrap
        const modal = new bootstrap.Modal(modalElement, {
            backdrop: 'static',
            keyboard: false
        });

        // Handler para confirmar
        const handleConfirm = () => {
            modal.hide();
            if (config.onConfirm) config.onConfirm();
            resolve(true);
            cleanup();
        };

        // Handler para cancelar
        const handleCancel = () => {
            modal.hide();
            if (config.onCancel) config.onCancel();
            resolve(false);
            cleanup();
        };

        // Cleanup de event listeners
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modalElement.removeEventListener('hidden.bs.modal', handleCancel);
        };

        // Adjuntar event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);

        // Si cierra el modal con X o ESC, contar como cancelar
        modalElement.addEventListener('hidden.bs.modal', handleCancel, { once: true });

        // Mostrar modal
        modal.show();
    });
}

// Exponer funciones globalmente para que puedan ser usadas desde cualquier parte
window.initConfirmModal = initConfirmModal;
window.showConfirmModal = showConfirmModal;

// Exportar para uso con módulos ES6 (opcional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initConfirmModal, showConfirmModal };
}
