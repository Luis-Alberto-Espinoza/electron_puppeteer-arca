// afip/planesDePago/storage_cuits.js
// Almacenamiento de CUITs asociados por representante para Planes de Pago

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class CuitsAsociadosStorage {
    constructor() {
        this.dataPath = path.join(app.getPath('userData'), 'cuits_asociados_planes.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        try {
            if (!fs.existsSync(this.dataPath)) {
                fs.writeFileSync(this.dataPath, JSON.stringify({ representantes: {} }, null, 2), 'utf8');
                console.log('[PlanesDePago] cuits_asociados_planes.json creado en:', this.dataPath);
            }
        } catch (error) {
            console.error('[PlanesDePago] Error creando cuits_asociados_planes.json:', error);
        }
    }

    loadData() {
        try {
            const raw = fs.readFileSync(this.dataPath, 'utf8');
            const data = JSON.parse(raw);
            if (!data.representantes || typeof data.representantes !== 'object') {
                data.representantes = {};
            }
            return data;
        } catch (error) {
            console.error('[PlanesDePago] Error leyendo cuits_asociados_planes.json:', error);
            return { representantes: {} };
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('[PlanesDePago] Error guardando cuits_asociados_planes.json:', error);
            return false;
        }
    }

    /**
     * Retorna los CUITs asociados de un representante
     * @param {string} cuitRepresentante
     * @returns {Array} Array de { cuit, alias, origen }
     */
    getAsociados(cuitRepresentante) {
        const data = this.loadData();
        const rep = data.representantes[cuitRepresentante];
        return rep ? rep.asociados : [];
    }

    /**
     * Agrega un CUIT asociado a un representante
     * @param {string} cuitRepresentante
     * @param {string} nombreRepresentante
     * @param {Object} asociado - { cuit, alias, origen }
     */
    guardarAsociado(cuitRepresentante, nombreRepresentante, asociado) {
        const data = this.loadData();

        if (!data.representantes[cuitRepresentante]) {
            data.representantes[cuitRepresentante] = {
                nombre: nombreRepresentante,
                asociados: []
            };
        }

        const lista = data.representantes[cuitRepresentante].asociados;
        const existe = lista.some(a => a.cuit === asociado.cuit);
        if (existe) {
            return { exito: false, error: `El CUIT ${asociado.cuit} ya esta asociado` };
        }

        lista.push({ cuit: asociado.cuit, alias: asociado.alias, origen: asociado.origen });
        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }

    /**
     * Edita un CUIT asociado existente
     * @param {string} cuitRepresentante
     * @param {string} cuitViejo - CUIT actual del asociado a editar
     * @param {Object} datosNuevos - { cuit, alias }
     */
    editarAsociado(cuitRepresentante, cuitViejo, datosNuevos) {
        const data = this.loadData();
        const rep = data.representantes[cuitRepresentante];
        if (!rep) return { exito: false, error: 'Representante no encontrado' };

        const idx = rep.asociados.findIndex(a => a.cuit === cuitViejo);
        if (idx < 0) return { exito: false, error: `CUIT ${cuitViejo} no encontrado en asociados` };

        // Si cambia el CUIT, verificar que no exista duplicado
        if (datosNuevos.cuit !== cuitViejo) {
            const duplicado = rep.asociados.some(a => a.cuit === datosNuevos.cuit);
            if (duplicado) return { exito: false, error: `El CUIT ${datosNuevos.cuit} ya esta asociado` };
        }

        rep.asociados[idx].cuit = datosNuevos.cuit;
        rep.asociados[idx].alias = datosNuevos.alias;

        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }

    /**
     * Elimina un CUIT asociado. Si queda sin asociados, elimina al representante del JSON.
     * @param {string} cuitRepresentante
     * @param {string} cuitAsociado
     */
    eliminarAsociado(cuitRepresentante, cuitAsociado) {
        const data = this.loadData();
        const rep = data.representantes[cuitRepresentante];
        if (!rep) return { exito: false, error: 'Representante no encontrado' };

        const antes = rep.asociados.length;
        rep.asociados = rep.asociados.filter(a => a.cuit !== cuitAsociado);

        if (rep.asociados.length === antes) {
            return { exito: false, error: `CUIT ${cuitAsociado} no encontrado en asociados` };
        }

        // Si no quedan asociados, eliminar la entrada del representante
        if (rep.asociados.length === 0) {
            delete data.representantes[cuitRepresentante];
        }

        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }
}

module.exports = { CuitsAsociadosStorage };
