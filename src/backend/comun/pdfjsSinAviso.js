// pdfjsSinAviso.js — precarga pdfjs (build legacy) sin el aviso de canvas del arranque.
//
// Al cargarse, pdfjs intenta traer DOMMatrix/Path2D del paquete `canvas` (no instalado)
// y avisa "Cannot polyfill ... rendering may be broken" con todo el require stack.
// Solo sirven para DIBUJAR PDFs; la app solo les lee el texto, así que no afecta nada.
//
// Se requiere una vez desde main.js: Node cachea el módulo, y todos los
// require('pdfjs-dist/legacy/build/pdf.js') de después reciben el mismo, ya cargado.

const AVISO = 'Warning: Cannot polyfill';

const logOriginal = console.log;
console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith(AVISO)) return;
    logOriginal.apply(console, args);
};
try {
    module.exports = require('pdfjs-dist/legacy/build/pdf.js');
} finally {
    console.log = logOriginal; // solo durante la carga: los demás avisos de pdfjs siguen saliendo
}
