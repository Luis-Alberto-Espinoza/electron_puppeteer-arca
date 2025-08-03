const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

class PDFProcessorService {
    constructor() {
        this.limpiarMonto = this.limpiarMonto.bind(this);
        this.formatearMonto = this.formatearMonto.bind(this);
    }

    // Función para limpiar y convertir montos
    limpiarMonto(montoStr) {
        let limpio = montoStr.replace(/[$.]/g, '');
        limpio = limpio.replace(/,/g, '.');
        return parseFloat(limpio) || 0;
    }

    // Función para formatear montos
    formatearMonto(monto) {
        return monto.toLocaleString('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        });
    }

    // Validar que el archivo existe y es un PDF
    validarArchivo(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`No se encontró el archivo: ${filePath}`);
        }

        const extension = path.extname(filePath).toLowerCase();
        if (extension !== '.pdf') {
            throw new Error(`El archivo debe ser un PDF. Extensión recibida: ${extension}`);
        }

        return true;
    }

    // Procesar PDF principal
    async procesarPDF(pdfPath) {
        try {
            // Validar archivo
            this.validarArchivo(pdfPath);

            const dataBuffer = fs.readFileSync(pdfPath);
            const data = await pdf(dataBuffer);
            const text = data.text;

            // Extraer transferencias recibidas únicas
            const uniqueTransferencias = new Map();
            const primaryPattern = /(\d{2}-\d{2}-\d{4})\s*(?:[\s\S]*?)Transferencia\s+recibida\s+([\s\S]*?)(\d{12})\s*\$\s*([\d.,]+)\s*\$\s*([\d.,]+)/gi;

            let transferMatch;
            while ((transferMatch = primaryPattern.exec(text)) !== null) {
                const idOperacion = transferMatch[3];
                const fecha = transferMatch[1];
                const monto = this.limpiarMonto(transferMatch[4]);
                const nombreCompleto = transferMatch[2].trim().replace(/\s+/g, ' ');
                const saldo = this.limpiarMonto(transferMatch[5]);

                if (idOperacion && monto > 0) {
                    uniqueTransferencias.set(idOperacion, {
                        fecha, 
                        nombre: nombreCompleto, 
                        idOperacion, 
                        monto, 
                        saldo
                    });
                }
            }

            const transferenciasRecibidas = Array.from(uniqueTransferencias.values());

            // Calcular totales por día - transferencias
            const totalesDiarios = {};
            transferenciasRecibidas.forEach(transferencia => {
                const fecha = transferencia.fecha;
                totalesDiarios[fecha] = (totalesDiarios[fecha] || 0) + transferencia.monto;
            });

            // Calcular totales por mes - transferencias
            const totalesMensuales = {};
            transferenciasRecibidas.forEach(transferencia => {
                const [dia, mes, año] = transferencia.fecha.split('-');
                const mesAño = `${mes}-${año}`;
                totalesMensuales[mesAño] = (totalesMensuales[mesAño] || 0) + transferencia.monto;
            });

            // Extraer liquidaciones de dinero por fecha
            const liquidacionesPorFecha = {};
            const regexLiquidacionDineroFecha = /(\d{2}-\d{2}-\d{4})[\s\S]*?Liquidación\s+de\s+dinero[\s\S]*?\$\s*([\d.,]+)/gi;
            let matchLiqFecha;
            while ((matchLiqFecha = regexLiquidacionDineroFecha.exec(text)) !== null) {
                const fecha = matchLiqFecha[1];
                const monto = this.limpiarMonto(matchLiqFecha[2]);
                if (monto > 0) {
                    liquidacionesPorFecha[fecha] = (liquidacionesPorFecha[fecha] || 0) + monto;
                }
            }

            // Calcular totales mensuales de liquidaciones
            const totalesMensualesLiquidacion = {};
            Object.entries(liquidacionesPorFecha).forEach(([fecha, monto]) => {
                const [dia, mes, año] = fecha.split('-');
                const mesAño = `${mes}-${año}`;
                totalesMensualesLiquidacion[mesAño] = (totalesMensualesLiquidacion[mesAño] || 0) + monto;
            });

            // Obtener todas las fechas únicas y ordenarlas
            const fechasUnificadas = Array.from(
                new Set([...Object.keys(totalesDiarios), ...Object.keys(liquidacionesPorFecha)])
            ).sort((a, b) => {
                const [diaA, mesA, añoA] = a.split('-').map(Number);
                const [diaB, mesB, añoB] = b.split('-').map(Number);
                return new Date(añoA, mesA - 1, diaA) - new Date(añoB, mesB - 1, diaB);
            });

            // Obtener todos los meses únicos y ordenarlos
            const mesesUnicos = Array.from(
                new Set([...Object.keys(totalesMensuales), ...Object.keys(totalesMensualesLiquidacion)])
            ).sort((a, b) => {
                const [mesA, añoA] = a.split('-').map(Number);
                const [mesB, añoB] = b.split('-').map(Number);
                return new Date(añoA, mesA - 1) - new Date(añoB, mesB - 1);
            });

            // Extraer rendimientos
            const regexRendimientos = /Rendimiento[\s\S]*?\$\s*([\d.,]+)/gi;
            let matchRendimiento;
            let sumaRendimientos = 0;
            while ((matchRendimiento = regexRendimientos.exec(text)) !== null) {
                const monto = this.limpiarMonto(matchRendimiento[1]);
                if (monto > 0) sumaRendimientos += monto;
            }

            // Calcular totales generales
            const granTotalTransferencias = Object.values(totalesDiarios).reduce((sum, val) => sum + val, 0);
            const granTotalLiquidacion = Object.values(liquidacionesPorFecha).reduce((sum, val) => sum + val, 0);
            const granTotalGeneral = granTotalTransferencias + granTotalLiquidacion + sumaRendimientos;

            // Crear totales diarios unificados con formato
            const totalesDiariosUnificados = fechasUnificadas.map(fecha => {
                const sumaTransferencias = totalesDiarios[fecha] || 0;
                const sumaLiquidacion = liquidacionesPorFecha[fecha] || 0;
                const sumaTotal = sumaTransferencias + sumaLiquidacion;
                return {
                    fecha,
                    transferencias: sumaTransferencias,
                    liquidaciones: sumaLiquidacion,
                    total: sumaTotal,
                    totalFormateado: this.formatearMonto(sumaTotal)
                };
            });

            // Crear totales mensuales unificados con formato
            const totalesMensualesUnificados = mesesUnicos.map(mesAño => {
                const sumaTransferencias = totalesMensuales[mesAño] || 0;
                const sumaLiquidacion = totalesMensualesLiquidacion[mesAño] || 0;
                const sumaTotal = sumaTransferencias + sumaLiquidacion;
                const [mes, año] = mesAño.split('-');
                const nombreMes = new Date(año, mes - 1).toLocaleDateString('es-ES', { 
                    month: 'long', 
                    year: 'numeric' 
                });
                return {
                    mesAño,
                    nombreMes,
                    transferencias: sumaTransferencias,
                    liquidaciones: sumaLiquidacion,
                    total: sumaTotal,
                    totalFormateado: this.formatearMonto(sumaTotal)
                };
            });

            // Crear string de totales diarios (como en el original)
            const totalDiarioSumado = totalesDiariosUnificados
                .map(item => parseInt(item.total))
                .join('\n');

            // Construir objeto de respuesta
            const resultado = {
                success: true,
                archivo: path.basename(pdfPath),
                procesadoEn: new Date().toISOString(),
                datos: {
                    transferenciasDetalle: transferenciasRecibidas,
                    totalesDiarios: totalesDiariosUnificados,
                    totalesMensuales: totalesMensualesUnificados,
                    totalDiarioSumado: totalDiarioSumado,
                    resumenGeneral: {
                        transferenciasRecibidas: {
                            total: granTotalTransferencias,
                            totalFormateado: this.formatearMonto(granTotalTransferencias),
                            cantidad: transferenciasRecibidas.length
                        },
                        liquidaciones: {
                            total: granTotalLiquidacion,
                            totalFormateado: this.formatearMonto(granTotalLiquidacion)
                        },
                        rendimientos: {
                            total: sumaRendimientos,
                            totalFormateado: this.formatearMonto(sumaRendimientos)
                        },
                        totalGeneral: {
                            total: granTotalGeneral,
                            totalFormateado: this.formatearMonto(granTotalGeneral)
                        }
                    }
                },
                estadisticas: {
                    totalTransferencias: transferenciasRecibidas.length,
                    totalDias: fechasUnificadas.length,
                    totalMeses: mesesUnicos.length,
                    rangoFechas: {
                        desde: fechasUnificadas[0] || null,
                        hasta: fechasUnificadas[fechasUnificadas.length - 1] || null
                    }
                }
            };

            return resultado;

        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack,
                    codigo: error.code || 'PROCESSING_ERROR'
                },
                archivo: path.basename(pdfPath || 'desconocido'),
                procesadoEn: new Date().toISOString()
            };
        }
    }

    // Método para usar en rutas de Express/API
    async procesarPDFEndpoint(req, res) {
        try {
            const { filePath } = req.body;
            
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'Se requiere la ruta del archivo PDF',
                        codigo: 'MISSING_FILE_PATH'
                    }
                });
            }

            const resultado = await this.procesarPDF(filePath);
            
            if (resultado.success) {
                res.json(resultado);
            } else {
                res.status(500).json(resultado);
            }

        } catch (error) {
            res.status(500).json({
                success: false,
                error: {
                    message: 'Error interno del servidor',
                    codigo: 'INTERNAL_SERVER_ERROR'
                }
            });
        }
    }

    // Método para IPC de Electron
    async procesarPDFIPC(event, filePath) {
        const resultado = await this.procesarPDF(filePath);
        return resultado;
    }
}
module.exports = PDFProcessorService;

// Ejemplo de uso:
/*
// Para Express:
const express = require('express');
const PDFProcessorService = require('./pdf-processor-service');

const app = express();
const pdfService = new PDFProcessorService();

app.use(express.json());
app.post('/api/procesar-pdf', pdfService.procesarPDFEndpoint.bind(pdfService));

// Para IPC de Electron (en main process):
const { ipcMain } = require('electron');
const PDFProcessorService = require('./pdf-processor-service');

const pdfService = new PDFProcessorService();
ipcMain.handle('procesar-pdf', pdfService.procesarPDFIPC.bind(pdfService));

{
  "success": true/false,
  "archivo": "nombre-del-archivo.pdf",
  "procesadoEn": "2025-07-30T...",
  "datos": {
    "transferenciasDetalle": [...],
    "totalesDiarios": [...],
    "totalesMensuales": [...],
    "totalDiarioSumado": "string con los totales",
    "resumenGeneral": {
      "transferenciasRecibidas": {...},
      "liquidaciones": {...},
      "rendimientos": {...},
      "totalGeneral": {...}
    }
  },
  "estadisticas": {...}
}






// En main process
const { ipcMain } = require('electron');
const PDFProcessorService = require('./pdf-processor-service');

const pdfService = new PDFProcessorService();
ipcMain.handle('procesar-pdf', pdfService.procesarPDFIPC.bind(pdfService));

// En renderer process (frontend)
const resultado = await window.electronAPI.invoke('procesar-pdf', filePath);








*/