const fs = require('fs');
const path = require('path');

// Ruta donde están los archivos JS
const carpeta = './solucion_desglozada/'; 

// Leer todos los archivos en la carpeta
const archivos = fs.readdirSync(carpeta)
    .filter(f => /^paso\d+_.+\.js$/.test(f))  // Filtrar solo los archivos que siguen el patrón "pasox_Titulo.js"
    .sort((a, b) => {
        // Extraer números de los nombres de archivo para ordenar por el número secuencial
        const numA = parseInt(a.match(/^paso(\d+)_/)[1]);
        const numB = parseInt(b.match(/^paso(\d+)_/)[1]);
        return numA - numB;
    });

// Ruta del archivo unificado
const solucionUnificadaPath = path.join(carpeta, 'solucionUnificada.js');

// Leer y concatenar el contenido de los archivos "pasox_Titulo.js"
let contenidoUnificado = archivos.map(archivo => {
    const contenido = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
    return `// ${archivo}\n${contenido}\n`;  // Agregar un comentario con el nombre del archivo para referencia
}).join('\n');

// Sobrescribir o crear el archivo "solucionUnificada.js"
fs.writeFileSync(solucionUnificadaPath, contenidoUnificado, 'utf8');
console.log('solucionUnificada.js actualizado con éxito');
