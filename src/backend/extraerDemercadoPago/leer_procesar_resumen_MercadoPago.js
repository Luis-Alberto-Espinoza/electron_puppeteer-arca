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

    // Nuevo método: extraer todos los elementos de manera independiente
    extraerElementosIndependientes(text) {
        const elementos = [];

        // 1. Extraer todas las fechas
        const regexFechas = /(\d{2}-\d{2}-\d{4})/g;
        let matchFecha;
        while ((matchFecha = regexFechas.exec(text)) !== null) {
            elementos.push({
                tipo: 'fecha',
                valor: matchFecha[1],
                posicion: matchFecha.index
            });
        }

        // 2. Extraer todas las transferencias recibidas
        const regexTransferencias = /Transferencia\s+recibida/gi;
        let matchTransferencia;
        while ((matchTransferencia = regexTransferencias.exec(text)) !== null) {
            elementos.push({
                tipo: 'transferencia_recibida',
                posicion: matchTransferencia.index
            });
        }

        // 3. Extraer todas las liquidaciones
        const regexLiquidaciones = /Liquidación\s+de\s+dinero/gi;
        let matchLiquidacion;
        while ((matchLiquidacion = regexLiquidaciones.exec(text)) !== null) {
            elementos.push({
                tipo: 'liquidacion_dinero',
                posicion: matchLiquidacion.index
            });
        }

        // 4. Extraer todos los rendimientos
        const regexRendimientos = /Rendimiento/gi;
        let matchRendimiento;
        while ((matchRendimiento = regexRendimientos.exec(text)) !== null) {
            elementos.push({
                tipo: 'rendimiento',
                posicion: matchRendimiento.index
            });
        }

        // 5. Extraer todos los IDs de operación (12 dígitos)
        const regexIds = /(\d{12})/g;
        let matchId;
        while ((matchId = regexIds.exec(text)) !== null) {
            elementos.push({
                tipo: 'id_operacion',
                valor: matchId[1],
                posicion: matchId.index
            });
        }

        // 6. Extraer todos los montos (formato $ X.XXX,XX)
        const regexMontos = /\$\s*([\d.,]+)/g;
        let matchMonto;
        while ((matchMonto = regexMontos.exec(text)) !== null) {
            const monto = this.limpiarMonto(matchMonto[1]);
            if (monto > 0) {
                elementos.push({
                    tipo: 'monto',
                    valor: monto,
                    valorOriginal: matchMonto[0],
                    posicion: matchMonto.index
                });
            }
        }

        // Ordenar por posición
        return elementos.sort((a, b) => a.posicion - b.posicion);
    }

    // Reconstruir operaciones basándose en proximidad
    reconstruirOperaciones(elementos, text) {
        const transferencias = [];
        const liquidaciones = [];
        const rendimientos = [];

        // Procesar transferencias recibidas
        const transferenciasPos = elementos.filter(e => e.tipo === 'transferencia_recibida');
        
        for (const transf of transferenciasPos) {
            const fecha = this.buscarElementoCercano(elementos, transf.posicion, 'fecha', -500, 0);
            const id = this.buscarElementoCercano(elementos, transf.posicion, 'id_operacion', 0, 300);
            const montosPosteriores = elementos.filter(e => 
                e.tipo === 'monto' && 
                e.posicion > transf.posicion && 
                e.posicion < transf.posicion + 500
            ).sort((a, b) => a.posicion - b.posicion);

            if (fecha && id && montosPosteriores.length >= 2) {
                // Extraer nombre desde la transferencia hasta el ID
                const inicio = transf.posicion + 'Transferencia recibida'.length;
                const fin = id.posicion;
                const nombre = text.substring(inicio, fin).trim().replace(/\s+/g, ' ');

                transferencias.push({
                    fecha: fecha.valor,
                    nombre: nombre,
                    idOperacion: id.valor,
                    monto: montosPosteriores[0].valor,
                    saldo: montosPosteriores[1].valor,
                    posicionEnTexto: transf.posicion
                });
            }
        }

        // Procesar liquidaciones de dinero
        const liquidacionesPos = elementos.filter(e => e.tipo === 'liquidacion_dinero');
        
        for (const liq of liquidacionesPos) {
            const fecha = this.buscarElementoCercano(elementos, liq.posicion, 'fecha', -100, 0);
            const id = this.buscarElementoCercano(elementos, liq.posicion, 'id_operacion', 0, 200);
            const montosPosteriores = elementos.filter(e => 
                e.tipo === 'monto' && 
                e.posicion > liq.posicion && 
                e.posicion < liq.posicion + 300
            ).sort((a, b) => a.posicion - b.posicion);

            if (fecha && id && montosPosteriores.length >= 2) {
                liquidaciones.push({
                    fecha: fecha.valor,
                    descripcion: 'Liquidación de dinero',
                    idOperacion: id.valor,
                    monto: montosPosteriores[0].valor,
                    saldo: montosPosteriores[1].valor,
                    posicionEnTexto: liq.posicion
                });
            }
        }

        // Procesar rendimientos
        const rendimientosPos = elementos.filter(e => e.tipo === 'rendimiento');
        
        for (const rend of rendimientosPos) {
            const fecha = this.buscarElementoCercano(elementos, rend.posicion, 'fecha', -100, 0);
            const montoPos = this.buscarElementoCercano(elementos, rend.posicion, 'monto', 0, 200);

            if (fecha && montoPos) {
                rendimientos.push({
                    fecha: fecha.valor,
                    descripcion: 'Rendimiento',
                    monto: montoPos.valor,
                    posicionEnTexto: rend.posicion
                });
            } else if (montoPos) {
                // Si no encuentra fecha, buscar en contexto más amplio
                const contextoInicio = Math.max(0, rend.posicion - 200);
                const contextoFin = Math.min(text.length, rend.posicion + 100);
                const contexto = text.substring(contextoInicio, contextoFin);
                const fechaEnContexto = contexto.match(/(\d{2}-\d{2}-\d{4})/);
                
                rendimientos.push({
                    fecha: fechaEnContexto ? fechaEnContexto[1] : 'Fecha no encontrada',
                    descripcion: 'Rendimiento',
                    monto: montoPos.valor,
                    posicionEnTexto: rend.posicion
                });
            }
        }

        return { transferencias, liquidaciones, rendimientos };
    }

    // Buscar elemento más cercano de un tipo específico
    buscarElementoCercano(elementos, posicionRef, tipo, rangoInicio, rangoFin) {
        const candidatos = elementos.filter(e => 
            e.tipo === tipo && 
            e.posicion >= posicionRef + rangoInicio && 
            e.posicion <= posicionRef + rangoFin
        );

        if (candidatos.length === 0) return null;

        // Devolver el más cercano
        return candidatos.reduce((closest, current) => {
            const distanciaClosest = Math.abs(closest.posicion - posicionRef);
            const distanciaCurrent = Math.abs(current.posicion - posicionRef);
            return distanciaCurrent < distanciaClosest ? current : closest;
        });
    }

    // Procesar PDF principal
    async procesarPDF(pdfPath) {
        try {
            // Validar archivo
            this.validarArchivo(pdfPath);

            const dataBuffer = fs.readFileSync(pdfPath);
            const data = await pdf(dataBuffer);
            const text = data.text;

            // Nuevo enfoque: extraer elementos independientemente y reconstruir
            const elementos = this.extraerElementosIndependientes(text);
            const { transferencias, liquidaciones, rendimientos } = this.reconstruirOperaciones(elementos, text);

            // Eliminar duplicados por ID de operación
            const transferenciasUnicas = new Map();
            transferencias.forEach(t => {
                if (!transferenciasUnicas.has(t.idOperacion)) {
                    transferenciasUnicas.set(t.idOperacion, t);
                }
            });

            const liquidacionesUnicas = new Map();
            liquidaciones.forEach(l => {
                if (!liquidacionesUnicas.has(l.idOperacion)) {
                    liquidacionesUnicas.set(l.idOperacion, l);
                }
            });

            const transferenciasRecibidas = Array.from(transferenciasUnicas.values());
            const liquidacionesDetalle = Array.from(liquidacionesUnicas.values());
            const rendimientosDetalle = rendimientos; // No filtrar duplicados en rendimientos

            // Calcular totales por día - transferencias
            const totalesDiariosTransf = {};
            transferenciasRecibidas.forEach(transferencia => {
                const fecha = transferencia.fecha;
                totalesDiariosTransf[fecha] = (totalesDiariosTransf[fecha] || 0) + transferencia.monto;
            });

            // Calcular totales por día - liquidaciones
            const totalesDiariosLiq = {};
            liquidacionesDetalle.forEach(liquidacion => {
                const fecha = liquidacion.fecha;
                totalesDiariosLiq[fecha] = (totalesDiariosLiq[fecha] || 0) + liquidacion.monto;
            });

            // Calcular totales por día - rendimientos
            const totalesDiariosRend = {};
            rendimientosDetalle.forEach(rendimiento => {
                const fecha = rendimiento.fecha;
                if (fecha !== 'Fecha no encontrada') {
                    totalesDiariosRend[fecha] = (totalesDiariosRend[fecha] || 0) + rendimiento.monto;
                }
            });

            // Calcular totales por mes
            const calcularTotalesMensuales = (totalesDiarios) => {
                const totalesMensuales = {};
                Object.entries(totalesDiarios).forEach(([fecha, monto]) => {
                    const [dia, mes, año] = fecha.split('-');
                    const mesAño = `${mes}-${año}`;
                    totalesMensuales[mesAño] = (totalesMensuales[mesAño] || 0) + monto;
                });
                return totalesMensuales;
            };

            const totalesMensualesTransf = calcularTotalesMensuales(totalesDiariosTransf);
            const totalesMensualesLiq = calcularTotalesMensuales(totalesDiariosLiq);
            const totalesMensualesRend = calcularTotalesMensuales(totalesDiariosRend);

            // Obtener todas las fechas únicas
            const todasLasFechas = new Set([
                ...Object.keys(totalesDiariosTransf),
                ...Object.keys(totalesDiariosLiq),
                ...Object.keys(totalesDiariosRend)
            ]);

            const fechasUnificadas = Array.from(todasLasFechas).sort((a, b) => {
                const [diaA, mesA, añoA] = a.split('-').map(Number);
                const [diaB, mesB, añoB] = b.split('-').map(Number);
                return new Date(añoA, mesA - 1, diaA) - new Date(añoB, mesB - 1, diaB);
            });

            // Obtener todos los meses únicos
            const todosLosMeses = new Set([
                ...Object.keys(totalesMensualesTransf),
                ...Object.keys(totalesMensualesLiq),
                ...Object.keys(totalesMensualesRend)
            ]);

            const mesesUnicos = Array.from(todosLosMeses).sort((a, b) => {
                const [mesA, añoA] = a.split('-').map(Number);
                const [mesB, añoB] = b.split('-').map(Number);
                return new Date(añoA, mesA - 1) - new Date(añoB, mesB - 1);
            });

            // Calcular totales generales
            const granTotalTransferencias = transferenciasRecibidas.reduce((sum, t) => sum + t.monto, 0);
            const granTotalLiquidaciones = liquidacionesDetalle.reduce((sum, l) => sum + l.monto, 0);
            const granTotalRendimientos = rendimientosDetalle.reduce((sum, r) => sum + r.monto, 0);
            const granTotalGeneral = granTotalTransferencias + granTotalLiquidaciones + granTotalRendimientos;

            // Crear totales diarios unificados
            const totalesDiariosUnificados = fechasUnificadas.map(fecha => {
                const transferencias = totalesDiariosTransf[fecha] || 0;
                const liquidaciones = totalesDiariosLiq[fecha] || 0;
                const rendimientos = totalesDiariosRend[fecha] || 0;
                const total = transferencias + liquidaciones + rendimientos;
                
                return {
                    fecha,
                    transferencias,
                    liquidaciones,
                    rendimientos,
                    total,
                    totalFormateado: this.formatearMonto(total)
                };
            });

            // Crear totales mensuales unificados
            const totalesMensualesUnificados = mesesUnicos.map(mesAño => {
                const transferencias = totalesMensualesTransf[mesAño] || 0;
                const liquidaciones = totalesMensualesLiq[mesAño] || 0;
                const rendimientos = totalesMensualesRend[mesAño] || 0;
                const total = transferencias + liquidaciones + rendimientos;
                
                const [mes, año] = mesAño.split('-');
                const nombreMes = new Date(año, mes - 1).toLocaleDateString('es-ES', { 
                    month: 'long', 
                    year: 'numeric' 
                });
                
                return {
                    mesAño,
                    nombreMes,
                    transferencias,
                    liquidaciones,
                    rendimientos,
                    total,
                    totalFormateado: this.formatearMonto(total)
                };
            });

            // String de totales diarios
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
                    liquidacionesDetalle: liquidacionesDetalle,
                    rendimientosDetalle: rendimientosDetalle,
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
                            total: granTotalLiquidaciones,
                            totalFormateado: this.formatearMonto(granTotalLiquidaciones),
                            cantidad: liquidacionesDetalle.length
                        },
                        rendimientos: {
                            total: granTotalRendimientos,
                            totalFormateado: this.formatearMonto(granTotalRendimientos),
                            cantidad: rendimientosDetalle.length
                        },
                        totalGeneral: {
                            total: granTotalGeneral,
                            totalFormateado: this.formatearMonto(granTotalGeneral)
                        }
                    }
                },
                estadisticas: {
                    totalTransferencias: transferenciasRecibidas.length,
                    totalLiquidaciones: liquidacionesDetalle.length,
                    totalRendimientos: rendimientosDetalle.length,
                    totalDias: fechasUnificadas.length,
                    totalMeses: mesesUnicos.length,
                    elementosEncontrados: elementos.length,
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
