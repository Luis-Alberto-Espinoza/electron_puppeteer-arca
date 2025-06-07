/* historial de importaciones para los archivos libro iva y comprobantes */
// estando en la ventana del historial

// selecciono la tabla
const tabla = document.getElementById("tablaTareas");



// bucle para recorrer todas las filas de la tabla
const filas = tabla.children[1].childNodes; // Selecciona todas las filas del cuerpo de la tabla
let fecha1Bruto = filas[0].childNodes[0].innerText
let fecha2Bruto = filas[2].childNodes[0].innerText





let btnbtn = filas[2].childNodes[3].childNodes[0]

btnbtn.click()

let tituloErrorBruto = filas[2].childNodes[3].childNodes[1].innerText

let card = filas[2].childNodes[3].childNodes[1].innerText
console.log(card,"\n",tituloErrorBruto,"\n",fecha1Bruto,"\n",fecha2Bruto)




/**
 * posible falta de tiempo luego del click
 * no esta iterando entre las filas 
 * 
 */



const resultados = [];

filas.forEach((fila) => {
    // console.log(fila);
    // console.log("\n");

    /* fecha de creacion */
let fechaCreacion = fila.childNodes[0].innerText;
/* fecha y hora de ejecucion */
let fechaejecucion = fila.childNodes[0].innerText;




    
    
    fila.childNodes[3].childNodes[0].click()
    let tituloError = fila.childNodes[3].childNodes[1].innerText
    let descripcionError = fila.childNodes[3].childNodes[1].childNodes[2].innerText
    const datosFila = [
        fechaCreacion ,
        fechaejecucion,
        tituloError,
        descripcionError,
    ];
  resultados.push(datosFila);
});

// mostrar los resultados en la consola
console.log(resultados);