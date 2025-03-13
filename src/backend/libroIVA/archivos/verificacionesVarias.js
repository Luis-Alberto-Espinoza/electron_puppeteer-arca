const fs = require('fs');
const readline = require('readline');


async function verificarLineas(url, limiteCaracteres) {
    const fileStream = fs.createReadStream(url);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineasExcedidas = [];
    let lineaNumero = 0;
    let excedido = false;

    for await (const linea of rl) {
        lineaNumero++;
        if (linea.length > limiteCaracteres) {
            lineasExcedidas.push(lineaNumero);
            excedido = true;
        }
    }

    return {
        lineasExcedidas,
        excedido
    };
}

// Ejemplo de uso
verificarLineas('ruta/al/archivo.txt', 80).then(resultado => {
    console.log(resultado);
}).catch(error => {
    console.error(error);
});