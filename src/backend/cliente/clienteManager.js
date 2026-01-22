// cliente/clienteManager.js
// Manager principal para operaciones de clientes/usuarios

const { JsonStorage } = require('./service/storage.js');
const { procesarArchivoUsuarios } = require('./service/cargaMasiva.js');
const { gestionarValidacion } = require('./service/verificacion.js');

/**
 * Manager de clientes - Punto de entrada unificado para operaciones de usuarios
 */
class ClienteManager {
    constructor() {
        this.storage = new JsonStorage();
    }

    /**
     * Obtiene todos los usuarios
     * @returns {Array} Lista de usuarios
     */
    getAll() {
        const data = this.storage.loadData();
        return data.users || [];
    }

    /**
     * Obtiene un usuario por ID
     * @param {string} id - ID del usuario
     * @returns {Object|null} Usuario encontrado o null
     */
    getById(id) {
        const users = this.getAll();
        return users.find(user => user.id === id) || null;
    }

    /**
     * Obtiene un usuario por CUIT
     * @param {string} cuit - CUIT del usuario
     * @returns {Object|null} Usuario encontrado o null
     */
    getByCuit(cuit) {
        const users = this.getAll();
        return users.find(user => user.cuit === cuit) || null;
    }

    /**
     * Crea un nuevo usuario
     * @param {Object} userData - Datos del usuario
     * @returns {Object} Usuario creado
     */
    create(userData) {
        return this.storage.addUser(userData);
    }

    /**
     * Actualiza un usuario existente
     * @param {string} id - ID del usuario
     * @param {Object} userData - Datos a actualizar
     * @returns {Object} Usuario actualizado
     */
    update(id, userData) {
        return this.storage.updateUser(id, userData);
    }

    /**
     * Elimina un usuario
     * @param {string} id - ID del usuario
     * @returns {boolean} true si se elimino correctamente
     */
    delete(id) {
        return this.storage.deleteUser(id);
    }

    /**
     * Procesa carga masiva desde archivo Excel
     * @param {Buffer} fileBuffer - Buffer del archivo Excel
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async procesarCargaMasiva(fileBuffer) {
        return await procesarArchivoUsuarios(fileBuffer);
    }

    /**
     * Valida credenciales de un usuario
     * @param {Object} browser - Instancia del navegador Puppeteer
     * @param {Object} usuario - Usuario a validar
     * @param {Array} servicesToVerify - Servicios a verificar ['afip', 'atm']
     * @returns {Promise<Object>} Resultado de la validacion
     */
    async validarCredenciales(browser, usuario, servicesToVerify = null) {
        return await gestionarValidacion(browser, usuario, servicesToVerify);
    }
}

// Exportar clase y funciones individuales para flexibilidad
module.exports = {
    ClienteManager,
    JsonStorage,
    procesarArchivoUsuarios,
    gestionarValidacion
};
