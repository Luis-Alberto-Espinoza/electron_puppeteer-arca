const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');

process.on('message', ({ screenshotPath }) => {
    // console.log('Intentando abrir imagen en:', screenshotPath);

    // Verificar si el archivo existe
    if (!fs.existsSync(screenshotPath)) {
        // console.error('Error: El archivo no existe en la ruta especificada');
        process.exit(1);
    }

    const platform = os.platform();
    let command;

    switch (platform) {
        case 'linux':
            command = `xdg-open "${screenshotPath}"`;
            break;
        case 'darwin':
            command = `open "${screenshotPath}"`;
            break;
        case 'win32':
            command = `start "" "${screenshotPath}"`;
            break;
        default:
            console.log('Sistema operativo no soportado:', platform);
            process.exit(1);
    }

    // console.log('Ejecutando comando:', command);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('Error al abrir la imagen:', error);
            console.error('stderr:', stderr);
            process.exit(1);
        }
        // console.log('Imagen abierta correctamente');
        console.log('stdout:', stdout);
        process.exit(0);
    });
});

// Log cuando el proceso inicia
// console.log('Proceso visor iniciado');
