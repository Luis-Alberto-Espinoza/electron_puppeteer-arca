// atm/listas/storage_listas.js
// Almacenamiento de listas de clientes por subservicio ATM

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SUBSERVICIOS_VALIDOS = ['constancias', 'planesPago', 'tasaCero', 'retenciones'];

class ListasATMStorage {
    constructor() {
        this.dataPath = path.join(app.getPath('userData'), 'listas_atm.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        try {
            if (!fs.existsSync(this.dataPath)) {
                const initialData = {};
                SUBSERVICIOS_VALIDOS.forEach(s => { initialData[s] = []; });
                fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2), 'utf8');
                console.log('✅ [ListasATM] listas_atm.json creado en:', this.dataPath);
            }
        } catch (error) {
            console.error('❌ [ListasATM] Error creando listas_atm.json:', error);
        }
    }

    loadData() {
        try {
            const raw = fs.readFileSync(this.dataPath, 'utf8');
            const data = JSON.parse(raw);
            // Garantizar que todos los subservicios existan en el archivo
            SUBSERVICIOS_VALIDOS.forEach(s => {
                if (!Array.isArray(data[s])) data[s] = [];
            });
            return data;
        } catch (error) {
            console.error('❌ [ListasATM] Error leyendo listas_atm.json:', error);
            const data = {};
            SUBSERVICIOS_VALIDOS.forEach(s => { data[s] = []; });
            return data;
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('❌ [ListasATM] Error guardando listas_atm.json:', error);
            return false;
        }
    }

    /**
     * Retorna todas las listas de un subservicio
     * @param {string} subservicio - 'tasaCero' | 'retenciones' | 'constancias' | 'planesPago'
     * @returns {Array} Array de listas { nombre, texto, clienteIds }
     */
    getListas(subservicio) {
        if (!SUBSERVICIOS_VALIDOS.includes(subservicio)) return [];
        const data = this.loadData();
        return data[subservicio] || [];
    }

    /**
     * Guarda (crea o sobreescribe) una lista para un subservicio
     * @param {string} subservicio
     * @param {string} nombre - Nombre de la lista
     * @param {string} texto - Contenido del textarea
     * @param {Array<number>} clienteIds - IDs de los clientes seleccionados
     */
    guardarLista(subservicio, nombre, texto, clienteIds) {
        if (!SUBSERVICIOS_VALIDOS.includes(subservicio)) {
            return { exito: false, error: 'Subservicio inválido' };
        }

        const data = this.loadData();
        const listas = data[subservicio];
        const idx = listas.findIndex(l => l.nombre === nombre);

        if (idx >= 0) {
            listas[idx] = { nombre, texto, clienteIds };
        } else {
            listas.push({ nombre, texto, clienteIds });
        }

        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }

    /**
     * Renombra una lista
     * @param {string} subservicio
     * @param {string} nombreActual
     * @param {string} nombreNuevo
     */
    renombrarLista(subservicio, nombreActual, nombreNuevo) {
        if (!SUBSERVICIOS_VALIDOS.includes(subservicio)) {
            return { exito: false, error: 'Subservicio inválido' };
        }

        const data = this.loadData();
        const listas = data[subservicio];

        if (listas.some(l => l.nombre === nombreNuevo)) {
            return { exito: false, error: `Ya existe una lista llamada "${nombreNuevo}"` };
        }

        const lista = listas.find(l => l.nombre === nombreActual);
        if (!lista) {
            return { exito: false, error: `No se encontró la lista "${nombreActual}"` };
        }

        lista.nombre = nombreNuevo;
        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }

    /**
     * Elimina una lista
     * @param {string} subservicio
     * @param {string} nombre
     */
    eliminarLista(subservicio, nombre) {
        if (!SUBSERVICIOS_VALIDOS.includes(subservicio)) {
            return { exito: false, error: 'Subservicio inválido' };
        }

        const data = this.loadData();
        const antes = data[subservicio].length;
        data[subservicio] = data[subservicio].filter(l => l.nombre !== nombre);

        if (data[subservicio].length === antes) {
            return { exito: false, error: `No se encontró la lista "${nombre}"` };
        }

        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }
}

module.exports = { ListasATMStorage };
