
function getDiasHabiles(mes, anio) {
    const diasEnMes = new Date(anio, mes, 0).getDate();
    let diasHabiles = [];
    
    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fecha = new Date(anio, mes - 1, dia);
        const diaSemana = fecha.getDay();
        
        // 0 es domingo, 6 es sábado
        if (diaSemana !== 0 && diaSemana !== 6) {
            // Formatear la fecha en formato dd/mm/yyyy
            const diaFormateado = String(fecha.getDate()).padStart(2, '0');
            const mesFormateado = String(fecha.getMonth() + 1).padStart(2, '0');
            const anioFormateado = fecha.getFullYear();
            const fechaFormateada = `${diaFormateado}/${mesFormateado}/${anioFormateado}`;
            
            diasHabiles.push(fechaFormateada);
        }
    }
    
    return diasHabiles;
}  

function getDiasXmes(mes, anio) {
    const diasEnMes = new Date(anio, mes, 0).getDate();
    let fechas = [];
    
    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fecha = new Date(anio, mes - 1, dia);
        const diaSemana = fecha.getDay();
        
            // Formatear la fecha en formato dd/mm/yyyy
            const diaFormateado = String(fecha.getDate()).padStart(2, '0');
            const mesFormateado = String(fecha.getMonth() + 1).padStart(2, '0');
            const anioFormateado = fecha.getFullYear();
            const fechaFormateada = `${diaFormateado}/${mesFormateado}/${anioFormateado}`;
            
            fechas.push(fechaFormateada);
    }
    
    return fechas;
}

function limpiarMontos(montosString) {
    if (typeof montosString !== 'string') {
        return { error: "El valor ingresado no es una cadena de texto." };
    }

    if (montosString.trim() === '') {
        return { montos: [] }; // Devuelve un array vacío si el string está vacío o solo contiene espacios en blanco
    }

    const montosArray = montosString.split('\n').map(monto => {
        const montoLimpio = monto.trim(); 
        if (montoLimpio === '') return null; 
        const montoNumero = Number(montoLimpio); 
        if (isNaN(montoNumero)) {
            return { error: `"${monto}" no es un número válido.` }; 
        }
        return montoNumero;
    }).filter(monto => monto !== null); 

    // Verifica si hubo errores durante la conversión
    const errores = montosArray.filter(item => item && item.error);
    if (errores.length > 0) {
        return { errores: errores.map(err => err.error) }; 
    }

    return { montos: montosArray }; 
}
function convertirStringAArrayDeFechasString(fechasString) {
    if (!fechasString) {
        console.warn("No se recibieron fechas.");
        return []; 
    }

    const fechasArray = fechasString.split(',').map(fecha => fecha.trim());
    return fechasArray;
}

function generarMontosAleatorios(montoTotal, fechas) {
    if (!montoTotal || montoTotal <= 0) {
        return { error: "El monto total debe ser mayor que cero." };
    }

    if (!fechas || fechas.length === 0) {
        return { error: "Debe haber al menos una fecha." };
    }

    const numDias = fechas.length;
    const promedioDiario = montoTotal / numDias;

// console.log("numDias", numDias)
// console.log("promedioDiario", promedioDiario)

    const montos = [];
    let sumaMontos = 0;

    const rangoVariacion = 0.45; 

    for (let i = 0; i < numDias; i++) {
        let variacion = (Math.random() * 2 - 1) * promedioDiario * rangoVariacion;

        // Alternar entre incremento y decremento para equilibrar
        if (i % 2 === 1) { // Si es impar, invierte la variación (siempre que no sea el ultimo)
            if (i !== numDias -1) {
                variacion = -variacion;
            }
        }
        
        let montoDia = promedioDiario + variacion;
        montoDia = Math.max(0, Math.round(montoDia));

        montos.push(montoDia);
        sumaMontos += montoDia;
    }

    // Ajuste final para la suma exacta (distribuyendo la diferencia)
    let diferencia = montoTotal - sumaMontos;

    for (let i = 0; i < numDias && diferencia !== 0; i++) {
        let ajuste = Math.trunc(diferencia/ (numDias - i))
        montos[i] += ajuste;
        diferencia -= ajuste;
    }

    return { montos };
}
function combinarFechasMontosConMap(fechas, montos) {
    if (!fechas || !montos || fechas.length !== montos.length) {
        console.error("Los arrays de fechas y montos deben existir y tener la misma longitud.");
        return []; // O podrías lanzar un error
    }
    return fechas.map((fecha, index) => [fecha, montos[index]]);
}


/*
// Ejemplo de uso para combinarFechasMontosConMap:
const fechasMap = ['12/06/2025', '13/06/2025', '14/06/2025'];
const montosMap = [150000, 250000, 294360];
const resultadoConMap = combinarFechasMontosConMap(fechasMap, montosMap);
console.log("Resultado con map:", resultadoConMap);

const fechasDesigualesMap = ['12/06/2025', '13/06/2025'];
const montosDesigualesMap = [150000, 250000, 294360];
const resultadoConMapDesiguales = combinarFechasMontosConMap(fechasDesigualesMap, montosDesigualesMap);
console.log("Resultado con map desiguales:", resultadoConMapDesiguales);
*/

/*
// Ejemplos de uso para generarMontosAleatorios():
const montoTotal1 = 3270265;
const fechas1 = [new Date(2024, 9, 25), new Date(2024, 9, 28), new Date(2024, 9, 29)];
const resultado1 = generarMontosAleatorios(montoTotal1, fechas1);
console.log("Montos 1:", resultado1);

const montoTotal2 = 10000;
const fechas2 = [new Date(2024, 9, 25), new Date(2024, 9, 26), new Date(2024, 9, 27), new Date(2024, 9, 28), new Date(2024, 9, 29)];
const resultado2 = generarMontosAleatorios(montoTotal2, fechas2);
console.log("Montos 2:", resultado2);

const montoTotal3 = 5000;
const fechas3 = [new Date(2024, 9, 25), new Date(2024, 9, 26)];
const resultado3 = generarMontosAleatorios(montoTotal3, fechas3);
console.log("Montos 3:", resultado3);

const montoTotal4 = 5000;
const fechas4 = [new Date(2024, 9, 25)];
const resultado4 = generarMontosAleatorios(montoTotal4, fechas4);
console.log("Montos 4:", resultado4);

const montoTotal5 = 0;
const fechas5 = [new Date(2024, 9, 25)];
const resultado5 = generarMontosAleatorios(montoTotal5, fechas5);
console.log("Montos 5:", resultado5);

const montoTotal6 = 5000;
const fechas6 = [];
const resultado6 = generarMontosAleatorios(montoTotal6, fechas6);
console.log("Montos 6:", resultado6);
*/

/*
// Ejemplos de uso convertirStringAArrayDeFechasString():
const fechasString1 = '01/06/2027, 09/06/2027, 17/06/2027, 25/06/2027';
const fechas1 = convertirStringAArrayDeFechasString(fechasString1);
console.log("Fechas 1:", fechas1);

const fechasString2 = '01/01/2025,fecha incorrecta, 03/01/2025'; // Ejemplo con fecha incorrecta (se ignora)
const fechas2 = convertirStringAArrayDeFechasString(fechasString2);
console.log("Fechas 2:", fechas2);

const fechasString3 = ""; // Cadena vacía
const fechas3 = convertirStringAArrayDeFechasString(fechasString3);
console.log("Fechas 3:", fechas3);

const fechasString4 = "1/1/2024,10/10/2024" // formato sin ceros adelante
const fechas4 = convertirStringAArrayDeFechasString(fechasString4)
console.log("Fechas 4:", fechas4);

const fechasString5 = "   01/01/2024 ,    10/10/2024  " // espacios adelante y atras
const fechas5 = convertirStringAArrayDeFechasString(fechasString5)
console.log("Fechas 5:", fechas5);
*/

/*
// Ejemplos de uso:
const fechasString1 = '01/01/2025, 02/01/2025, 03/01/2025';
const fechas1 = convertirStringAFechas(fechasString1);
console.log("Fechas 1:", fechas1);

const fechasString2 = '01/01/2025, fecha incorrecta, 03/01/2025';
const fechas2 = convertirStringAFechas(fechasString2);
console.log("Fechas 2:", fechas2);

const fechasString3 = "";
const fechas3 = convertirStringAFechas(fechasString3);
console.log("Fechas 3:", fechas3);

const fechasString4 = "1/1/2024,10/10/2024"
const fechas4 = convertirStringAFechas(fechasString4)
console.log("Fechas 4:", fechas4);

const fechasString5 = "32/1/2024,10/10/2024"
const fechas5 = convertirStringAFechas(fechasString5)
console.log("Fechas 5:", fechas5);

const fechasString6 = "1/13/2024,10/10/2024"
const fechas6 = convertirStringAFechas(fechasString6)
console.log("Fechas 6:", fechas6);

const fechasString7 = "1/1/2024,asd/asd/asd"
const fechas7 = convertirStringAFechas(fechasString7)
console.log("Fechas 7:", fechas7);
*/


// // Ejemplo de uso
// const diasHabilesDeEnero = getDiasXmes(1, 2025);
// console.log(diasHabilesDeEnero);


// console.log(getDiasXmes(2,2025));


/*
// Ejemplos de uso:
const montos1 = '2366\n6699\n6699\n6699\n6699';
const resultado1 = limpiarMontos(montos1);
console.log("Resultado 1:", resultado1);

const montos2 = '123\n456\n789\n'; // Con una línea vacía al final
const resultado2 = limpiarMontos(montos2);
console.log("Resultado 2:", resultado2);

const montos3 = 'abc\n123\nxyz'; // Con valores no numéricos
const resultado3 = limpiarMontos(montos3);
console.log("Resultado 3:", resultado3);

const montos4 = ''; // Cadena vacía
const resultado4 = limpiarMontos(montos4);
console.log("Resultado 4:", resultado4);

const montos5 = '   \n   100   \n   '; // Cadena con espacios y lineas vacias
const resultado5 = limpiarMontos(montos5);
console.log("Resultado 5:", resultado5);

const montos6 = 1234; // No es una cadena
const resultado6 = limpiarMontos(montos6);
console.log("Resultado 6:", resultado6);

const montos7 = '100\n200\n300\nerror';
const resultado7 = limpiarMontos(montos7);
console.log("Resultado 7:", resultado7);

const montos8 = '100\n\n300';
const resultado8 = limpiarMontos(montos8);
console.log("Resultado 8:", resultado8);
*/

module.exports = {
    getDiasHabiles,
    getDiasXmes,
    limpiarMontos,
    convertirStringAArrayDeFechasString,
    generarMontosAleatorios,
    combinarFechasMontosConMap
}