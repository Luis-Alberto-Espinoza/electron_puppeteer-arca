const { app } = require('electron');
const path = require('path');
const fs = require('fs');


// Clase para manejar el almacenamiento JSON
class JsonStorage {
  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'users.json');
    console.log('📂 Archivo de usuarios ubicado en:', this.dataPath);
    this.ensureFileExists();
  }

  // Asegurar que el archivo existe
  ensureFileExists() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        const initialData = { users: [] };
        fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2), 'utf8');
        console.log('✅ Archivo users.json creado exitosamente');
      }
      // Verificar que el archivo sea válido
      const data = fs.readFileSync(this.dataPath, 'utf8');
      try {
        JSON.parse(data);
        console.log('✅ Archivo users.json validado correctamente');
      } catch (e) {
        console.error('❌ Archivo JSON inválido, recreando...');
        fs.writeFileSync(this.dataPath, JSON.stringify({ users: [] }, null, 2), 'utf8');
      }
    } catch (error) {
      console.error('❌ Error con el archivo users.json:', error);
      fs.writeFileSync(this.dataPath, JSON.stringify({ users: [] }, null, 2), 'utf8');
    }
  }

  // Cargar datos del archivo JSON
  loadData() {
    try {
      const data = fs.readFileSync(this.dataPath, 'utf8');
      console.log('📖 Datos cargados:', data);
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error cargando datos:', error);
      return { users: [] };
    }
  }

  // Guardar datos al archivo JSON
  saveData(data) {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('💾 Datos guardados exitosamente');
      return true;
    } catch (error) {
      console.error('❌ Error guardando datos:', error);
      return false;
    }
  }

  // Generar ID único
  generateId() {
    return Date.now() + Math.random();
  }

  // Obtener todos los usuarios
  getAllUsers() {
    const data = this.loadData();
    // Si data no es un objeto o no tiene la propiedad users, devolvemos []
    if (!data || typeof data !== 'object' || !Array.isArray(data.users)) {
      return [];
    }
    return data.users;
  }

  // Alias para compatibilidad con main.js
  getAll() {
    return this.getAllUsers();
  }
}

let storage;


module.exports = { JsonStorage };