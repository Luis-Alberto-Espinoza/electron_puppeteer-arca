/**
 * MÓDULO: Utilidades
 * Funciones auxiliares para formateo y cálculos
 */

/**
 * Formatea un CUIT con guiones (XX-XXXXXXXX-X)
 * @param {string|number} cuit - CUIT sin formato
 * @returns {string}
 */
export function formatearCUIT(cuit) {
    if (!cuit || cuit === 'N/A') return 'N/A';

    const cuitStr = String(cuit).replace(/\D/g, '');

    if (cuitStr.length === 11) {
        return `${cuitStr.slice(0, 2)}-${cuitStr.slice(2, 10)}-${cuitStr.slice(10)}`;
    }

    return cuitStr;
}

/**
 * Formatea un monto con separadores de miles
 * @param {string|number} monto - Monto a formatear
 * @returns {string}
 */
export function formatearMoneda(monto) {
    if (!monto) return '$ 0,00';

    // Si viene como string con comas (del backend)
    const montoStr = String(monto).replace(/\./g, '').replace(',', '.');
    const numero = parseFloat(montoStr);

    if (isNaN(numero)) return monto;

    return `$ ${numero.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Calcula el total de un período sumando todas sus filas
 * @param {Array} filas - Array de objetos con propiedad 'importe'
 * @returns {number}
 */
export function calcularTotalPeriodo(filas) {
    if (!filas || filas.length === 0) return 0;

    return filas.reduce((total, fila) => {
        const importeStr = String(fila.importe).replace(/\./g, '').replace(',', '.');
        const importe = parseFloat(importeStr);
        return total + (isNaN(importe) ? 0 : importe);
    }, 0);
}

/**
 * Formatea el total de un período como moneda
 * @param {Array} filas - Array de objetos con propiedad 'importe'
 * @returns {string}
 */
export function formatearTotalPeriodo(filas) {
    const total = calcularTotalPeriodo(filas);
    return formatearMoneda(total);
}

/**
 * Capitaliza la primera letra de cada palabra
 * @param {string} texto - Texto a capitalizar
 * @returns {string}
 */
export function capitalizarTexto(texto) {
    if (!texto) return '';

    return texto.toLowerCase().split(' ').map(palabra => {
        if (palabra.length === 0) return '';
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');
}

/**
 * Genera un ID único para elementos del DOM
 * @param {string} prefijo - Prefijo del ID
 * @returns {string}
 */
export function generarIdUnico(prefijo = 'elemento') {
    return `${prefijo}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitiza texto para usar como ID o clase CSS
 * @param {string} texto - Texto a sanitizar
 * @returns {string}
 */
export function sanitizarParaCSS(texto) {
    if (!texto) return '';
    return String(texto)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
}

/**
 * Obtiene el nombre del medio de pago formateado
 * @param {Object} medioPago - Objeto con id y nombre
 * @returns {string}
 */
export function formatearMedioPago(medioPago) {
    if (!medioPago) return 'N/A';

    const mapeoNombres = {
        'pago_qr': 'Pago QR',
        'pagar_link': 'Pagar Link',
        'pago_mis_cuentas': 'Pago Mis Cuentas',
        'interbanking': 'Interbanking',
        'xn_group': 'XN Group Latin America'
    };

    return mapeoNombres[medioPago.id] || medioPago.nombre || 'Desconocido';
}

/**
 * Trunca un texto si excede la longitud máxima
 * @param {string} texto - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string}
 */
export function truncarTexto(texto, maxLength = 50) {
    if (!texto) return '';
    if (texto.length <= maxLength) return texto;
    return texto.substring(0, maxLength) + '...';
}

/**
 * Valida si un string es un CUIT válido
 * @param {string} cuit - CUIT a validar
 * @returns {boolean}
 */
export function validarCUIT(cuit) {
    if (!cuit) return false;
    const cuitStr = String(cuit).replace(/\D/g, '');
    return cuitStr.length === 11;
}
