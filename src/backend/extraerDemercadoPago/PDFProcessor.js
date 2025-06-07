// src/main/pdfProcessor.js
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { dialog } = require('electron');

class PDFProcessor {
    
    async selectAndProcessPDF() {
        try {
            // Abrir diálogo para seleccionar archivo
            const result = await dialog.showOpenDialog({
                title: 'Seleccionar archivo PDF',
                filters: [
                    { name: 'PDF Files', extensions: ['pdf'] },
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled) {
                return { success: false, message: 'Operación cancelada' };
            }

            const filePath = result.filePaths[0];
            
            if (path.extname(filePath).toLowerCase() === '.pdf') {
                return await this.extractFromPDF(filePath);
            } else {
                return await this.extractFromText(filePath);
            }

        } catch (error) {
            console.error('Error al procesar archivo:', error);
            return { success: false, message: error.message };
        }
    }

    async extractFromPDF(pdfPath) {
        try {
            const dataBuffer = fs.readFileSync(pdfPath);
            const data = await pdf(dataBuffer);
            const transferencias = this.processText(data.text);
            const stats = this.generarEstadisticas(transferencias);
            
            return {
                success: true,
                data: {
                    transferencias,
                    estadisticas: stats,
                    archivo: path.basename(pdfPath)
                }
            };
        } catch (error) {
            return { success: false, message: `Error al procesar PDF: ${error.message}` };
        }
    }

    async extractFromText(textPath) {
        try {
            const text = fs.readFileSync(textPath, 'utf8');
            const transferencias = this.processText(text);
            const stats = this.generarEstadisticas(transferencias);
            
            return {
                success: true,
                data: {
                    transferencias,
                    estadisticas: stats,
                    archivo: path.basename(textPath)
                }
            };
        } catch (error) {
            return { success: false, message: `Error al procesar archivo: ${error.message}` };
        }
    }

    processText(text) {
        const transferenciasRecibidas = [];
        
        // Patrón más robusto que captura toda la información de una transferencia recibida
        const patronTransferencia = /(\d{2}-\d{2}-\d{4})\s*(?:[\s\S]*?)Transferencia\s+recibida\s+([\s\S]*?)(\d{12})\s*\$\s*([\d.,]+)\s*\$\s*([\d.,]+)/gi;
        
        let match;
        while ((match = patronTransferencia.exec(text)) !== null) {
            const fecha = match[1];
            const nombreCompleto = match[2].trim().replace(/\s+/g, ' ');
            const idOperacion = match[3];
            const monto = match[4];
            const saldo = match[5];
            
            if (!monto.includes('-')) {
                transferenciasRecibidas.push({
                    fecha: fecha,
                    monto: `$ ${monto}`,
                    nombre: nombreCompleto,
                    idOperacion: idOperacion,
                    saldo: `$ ${saldo}`,
                    descripcion: `Transferencia recibida ${nombreCompleto}`
                });
            }
        }
        
        // Patrón alternativo
        const lineasTransferencia = text.match(/[^\n]*Transferencia\s+recibida[^\n]*/gi);
        
        if (lineasTransferencia) {
            lineasTransferencia.forEach(linea => {
                const fechaMatch = text.match(new RegExp(`(\\d{2}-\\d{2}-\\d{4})[\\s\\S]*?${linea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
                
                if (fechaMatch) {
                    const fecha = fechaMatch[1];
                    const montoMatch = linea.match(/\$\s*([\d.,]+)(?!\s*\$\s*-)/);
                    const idMatch = linea.match(/(\d{12})/);
                    
                    if (montoMatch && idMatch) {
                        const monto = montoMatch[1];
                        const id = idMatch[1];
                        const nombreMatch = linea.match(/Transferencia\s+recibida\s+(.*?)\s*\d{12}/i);
                        const nombre = nombreMatch ? nombreMatch[1].trim() : 'Nombre no encontrado';
                        
                        const yaExiste = transferenciasRecibidas.some(t => 
                            t.fecha === fecha && 
                            t.idOperacion === id && 
                            t.monto.includes(monto)
                        );
                        
                        if (!yaExiste && !monto.includes('-')) {
                            transferenciasRecibidas.push({
                                fecha: fecha,
                                monto: `$ ${monto}`,
                                nombre: nombre,
                                idOperacion: id,
                                saldo: 'N/A',
                                descripcion: `Transferencia recibida ${nombre}`
                            });
                        }
                    }
                }
            });
        }
        
        // Remover duplicados y ordenar
        const transferenciasUnicas = transferenciasRecibidas.filter((transfer, index, self) => 
            index === self.findIndex(t => 
                t.fecha === transfer.fecha && 
                t.idOperacion === transfer.idOperacion && 
                t.monto === transfer.monto
            )
        );
        
        transferenciasUnicas.sort((a, b) => {
            const fechaA = new Date(a.fecha.split('-').reverse().join('-'));
            const fechaB = new Date(b.fecha.split('-').reverse().join('-'));
            return fechaA - fechaB;
        });
        
        return transferenciasUnicas;
    }

    generarEstadisticas(transferencias) {
        const totalTransferencias = transferencias.length;
        const montoTotal = transferencias.reduce((sum, t) => {
            const monto = parseFloat(t.monto.replace(/[$\s.,]/g, '').replace(',', '.'));
            return sum + monto;
        }, 0);
        
        const fechas = [...new Set(transferencias.map(t => t.fecha))];
        const transferenciasPerFecha = {};
        const montoDiario = {};
        
        fechas.forEach(fecha => {
            const transferenciasDelDia = transferencias.filter(t => t.fecha === fecha);
            transferenciasPerFecha[fecha] = transferenciasDelDia.length;
            
            const totalDia = transferenciasDelDia.reduce((sum, t) => {
                const monto = parseFloat(t.monto.replace(/[$\s.,]/g, '').replace(',', '.'));
                return sum + monto;
            }, 0);
            
            montoDiario[fecha] = {
                cantidad: transferenciasDelDia.length,
                total: totalDia,
                totalFormateado: totalDia.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }),
                promedio: totalDia / transferenciasDelDia.length,
                promedioFormateado: (totalDia / transferenciasDelDia.length).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
            };
        });
        
        return {
            totalTransferencias,
            montoTotal: montoTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }),
            fechasConActividad: fechas.length,
            transferenciasPerFecha,
            montoDiario
        };
    }

    async saveResults(data, outputDir = null) {
        try {
            let saveDir = outputDir;
            
            if (!saveDir) {
                const result = await dialog.showSaveDialog({
                    title: 'Guardar resultados',
                    defaultPath: 'transferencias_recibidas.json',
                    filters: [
                        { name: 'JSON Files', extensions: ['json'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (result.canceled) return { success: false, message: 'Guardado cancelado' };
                saveDir = path.dirname(result.filePath);
            }

            // Guardar JSON
            const jsonPath = path.join(saveDir, 'transferencias_recibidas.json');
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

            // Guardar CSV de transferencias
            const csvPath = path.join(saveDir, 'transferencias_recibidas.csv');
            const csvContent = 'Fecha,Monto,Nombre,ID_Operacion,Saldo,Descripcion\n' + 
                data.transferencias.map(t => 
                    `${t.fecha},"${t.monto}","${t.nombre}","${t.idOperacion}","${t.saldo}","${t.descripcion}"`
                ).join('\n');
            fs.writeFileSync(csvPath, csvContent);

            // Guardar CSV de resumen diario
            const csvDiarioPath = path.join(saveDir, 'resumen_diario.csv');
            const csvDiario = 'Fecha,Cantidad_Transferencias,Total_Dia,Promedio_Por_Transferencia\n' + 
                Object.entries(data.estadisticas.montoDiario)
                    .sort(([a], [b]) => {
                        const fechaA = new Date(a.split('-').reverse().join('-'));
                        const fechaB = new Date(b.split('-').reverse().join('-'));
                        return fechaA - fechaB;
                    })
                    .map(([fecha, datos]) => 
                        `${fecha},${datos.cantidad},${datos.total.toFixed(2)},${datos.promedio.toFixed(2)}`
                    ).join('\n');
            fs.writeFileSync(csvDiarioPath, csvDiario);

            return {
                success: true,
                message: 'Archivos guardados correctamente',
                files: [jsonPath, csvPath, csvDiarioPath]
            };

        } catch (error) {
            return { success: false, message: `Error al guardar: ${error.message}` };
        }
    }
}

module.exports = PDFProcessor;