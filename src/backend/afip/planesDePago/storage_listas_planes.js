// afip/planesDePago/storage_listas_planes.js
// Almacenamiento de listas persistentes para Planes de Pago AFIP

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ListasPlanesPagoStorage {
    constructor() {
        this.dataPath = path.join(app.getPath('userData'), 'listas_planes_pago.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        try {
            if (!fs.existsSync(this.dataPath)) {
                fs.writeFileSync(this.dataPath, JSON.stringify({ listas: [] }, null, 2), 'utf8');
                console.log('[ListasPlanesPago] listas_planes_pago.json creado en:', this.dataPath);
            }
        } catch (error) {
            console.error('[ListasPlanesPago] Error creando listas_planes_pago.json:', error);
        }
    }

    loadData() {
        try {
            const raw = fs.readFileSync(this.dataPath, 'utf8');
            const data = JSON.parse(raw);
            if (!Array.isArray(data.listas)) data.listas = [];
            return data;
        } catch (error) {
            console.error('[ListasPlanesPago] Error leyendo listas_planes_pago.json:', error);
            return { listas: [] };
        }
    }

    saveData(data) {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('[ListasPlanesPago] Error guardando listas_planes_pago.json:', error);
            return false;
        }
    }

    getListas() {
        const data = this.loadData();
        return data.listas;
    }

    guardarLista(nombre, texto, representantes) {
        const data = this.loadData();
        const idx = data.listas.findIndex(l => l.nombre === nombre);
        const lista = { nombre, texto: texto || '', representantes: representantes || [] };

        if (idx >= 0) {
            data.listas[idx] = lista;
        } else {
            data.listas.push(lista);
        }

        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }

    renombrarLista(nombreActual, nombreNuevo) {
        const data = this.loadData();

        if (data.listas.some(l => l.nombre === nombreNuevo)) {
            return { exito: false, error: `Ya existe una lista llamada "${nombreNuevo}"` };
        }

        const lista = data.listas.find(l => l.nombre === nombreActual);
        if (!lista) {
            return { exito: false, error: `No se encontró la lista "${nombreActual}"` };
        }

        lista.nombre = nombreNuevo;
        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }

    eliminarLista(nombre) {
        const data = this.loadData();
        const antes = data.listas.length;
        data.listas = data.listas.filter(l => l.nombre !== nombre);

        if (data.listas.length === antes) {
            return { exito: false, error: `No se encontró la lista "${nombre}"` };
        }

        const ok = this.saveData(data);
        return ok ? { exito: true } : { exito: false, error: 'Error al escribir el archivo' };
    }
}

module.exports = { ListasPlanesPagoStorage };
