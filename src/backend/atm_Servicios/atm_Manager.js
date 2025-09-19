const { flujoPlanDePago } = require('../puppeteer/ATM/flujosDeTareas/flujo_planDepagoIngresosBruto.js');
const { flujoConstanciaFiscal } = require('../puppeteer/ATM/flujosDeTareas/flujo_constanciaFiscal_imprimir.js');

async function manejarEventoATM(evento, downloadsPath) {
    // console.log('Manejando evento ATM:', evento);
    let resultado = null;

    // Validar que el objeto usuario y sus credenciales existan
    if (!evento.usuario || (!evento.usuario.cuit && !evento.usuario.cuil) || !evento.usuario.claveATM) {
        console.error("Datos de usuario o credenciales ATM incompletos:", evento.usuario);
        return { exito: false, mensaje: 'Datos de usuario o credenciales de ATM incompletos.' };
    }

    // Adaptar el nuevo objeto 'usuario' al formato 'credencialesATM' que esperan los flujos
    const credencialesATM = {
        cuit: evento.usuario.cuit || evento.usuario.cuil,
        clave: evento.usuario.claveATM
    };

    switch (evento.evento) {
        case 'planDePago':
            resultado = await flujoPlanDePago(credencialesATM, evento.usuario.nombre, downloadsPath);
            break;
        case 'constanciaFiscal':
            resultado = await flujoConstanciaFiscal(credencialesATM, evento.usuario.nombre, downloadsPath);
            break;
        default:
            resultado = { exito: false, mensaje: 'Tipo de evento no soportado.' };
    }
    return resultado;
}

module.exports = { manejarEventoATM };

