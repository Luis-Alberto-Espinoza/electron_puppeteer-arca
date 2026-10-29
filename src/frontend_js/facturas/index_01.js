// Importa el módulo de autenticación
import { AuthManager } from '../autenticacion/auth.js';

// Exporta una función que inicializa todo
export function inicializarFacturas() {
    // === Referencias generales ===
    const selectMes = document.getElementById('selectMes');
    const selectAnio = document.getElementById('selectAnio');
    const periodoFactura = document.getElementById('periodoFactura');
    const inputMontoTotal = document.getElementById('montoTotalInput');
    const ingresoManual = document.getElementById('ingresoManual');
    const ingresoMasivo = document.getElementById('ingresoMasivo');
    const seccionManual = document.getElementById('seccionManual');
    const seccionMasiva = document.getElementById('seccionMasiva');

    // Mostrar/ocultar secciones según el método de ingreso seleccionado
    function actualizarMetodoIngreso() {
        if (ingresoManual.checked) {
            seccionManual.style.display = 'block';
            seccionMasiva.style.display = 'none';
        } else if (ingresoMasivo.checked) {
            seccionManual.style.display = 'none';
            seccionMasiva.style.display = 'block';
        }
    }

    ingresoManual.addEventListener('change', actualizarMetodoIngreso);
    ingresoMasivo.addEventListener('change', actualizarMetodoIngreso);

    // === Período (mes y año) ===
    // Calendario común en modo período. El formulario sigue mandando "mes" (1..12, sin cero)
    // y "anio" en los dos ocultos #selectMes / #selectAnio; al cambiarlos se avisa con
    // 'change' para que interfazFacturas.js mueva el calendario de varios días a ese mes.
    if (periodoFactura && selectMes && selectAnio) {
        const anioActual = new Date().getFullYear();
        const ponerPeriodo = (fecha) => {
            if (!fecha) return;
            const mes = String(fecha.getMonth() + 1);
            const anio = String(fecha.getFullYear());
            if (selectMes.value !== mes) { selectMes.value = mes; selectMes.dispatchEvent(new Event('change')); }
            if (selectAnio.value !== anio) { selectAnio.value = anio; selectAnio.dispatchEvent(new Event('change')); }
        };
        crearCalendario(periodoFactura, {
            modo: 'periodo', formato: 'Y-m', ver: 'F Y', inicial: 'hoy',
            // Mismo rango que tenía la lista de años: el anterior y tres para adelante
            anioMin: anioActual - 1, anioMax: anioActual + 3,
            minimo: `${anioActual - 1}-01`, maximo: `${anioActual + 3}-12`,
            onChange: (fechas) => ponerPeriodo(fechas[0])
        });
        ponerPeriodo(new Date());
    }


    // ========================================
    // INICIALIZACIÓN DE AUTENTICACIÓN
    // ========================================
    const authManager = new AuthManager();
    authManager.inicializar();

    return { authManager };
}