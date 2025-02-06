import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js'; 

document.addEventListener('DOMContentLoaded', () => {
    inicializarInterfazFacturas();
});

document.addEventListener('DOMContentLoaded', () => {
    // const abrirNavegadorBtn = document.getElementById('abrirNavegadorBtn');
    const loginButton = document.getElementById('loginButton');
    const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
    const encabezados = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': 'https://google.com'
    };

    // abrirNavegadorBtn.addEventListener('click', () => {
    //     window.electronAPI.abrirNavegadorPuppeteer(url, encabezados);
    // });

    loginButton.addEventListener('click', async () => {
        const credenciales = {
            usuario: await window.electronAPI.getEnv('AFIP_USUARIO'),
            contrasena: await window.electronAPI.getEnv('AFIP_CONTRASENA')
        };

        window.electronAPI.sendFormData({ servicio: 'login', url, credenciales });
    });

    window.electronAPI.onStatusUpdate((event, status) => {
        console.log(status.message);
    });
});