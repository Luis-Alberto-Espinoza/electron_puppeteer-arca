/**
 * CATÁLOGO DE SERVICIOS — la lista única de "a dónde se puede ir" en la app
 * -------------------------------------------------------------------------
 * La usan la navbar (arma sus menús) y el buscador global (Ctrl+K / portada).
 * Un servicio nuevo se agrega ACÁ una sola vez y aparece en los dos.
 *
 * Cada ítem:
 *   id      → único (lo usa el HTML como data-servicio)
 *   label   → lo que se ve
 *   grupo   → 'AFIP' | 'ATM' | 'General'  (menú de la navbar y etiqueta del buscador)
 *   claves  → palabras clave extra para el buscador (ej. "ddjj" encuentra
 *             "Declaración Jurada", que no lo dice en el nombre)
 *   accion  → UNA de: { vista } | { sub } | { lanzador } | { evento } | { fn }
 *   navbar  → false = solo en el buscador (la navbar lo muestra a su manera, ej. 📁)
 *
 * Expone en window:
 *   - CATALOGO_SERVICIOS
 *   - ejecutarServicio(itemOId)   → hace la acción del ítem
 *
 * Depende de (definidas en controlador.js y componentes): navegarVista,
 * navegarAtmSub, abrirLanzadorSesion, abrirConfigDatos. Si alguna falta, avisa y no rompe.
 */
(function () {
    const CATALOGO_SERVICIOS = [
        // ===== AFIP =====
        { id: 'inicioAfip', label: 'Inicio AFIP-ARCA', grupo: 'AFIP', accion: { vista: 'afip' }, claves: ['arca', 'inicio', 'menu'] },
        { id: 'lanzadorAfip', label: 'Lanzador', grupo: 'AFIP', accion: { lanzador: 'afip' }, claves: ['sesion', 'abrir', 'login', 'clave fiscal'] },
        { id: 'facturacion', label: 'Facturar', grupo: 'AFIP', accion: { vista: 'facturacion' }, claves: ['factura', 'facturar', 'emitir', 'comprobante'] },
        { id: 'facturaTipificada', label: 'Facturar tipificada', grupo: 'AFIP', accion: { vista: 'facturaTipificada' }, claves: ['factura', 'tipificada', 'nota de credito', 'nota de debito'] },
        { id: 'facturaExcel', label: 'Facturar desde Excel', grupo: 'AFIP', accion: { vista: 'facturaExcel' }, claves: ['excel', 'planilla', 'lote', 'factura', 'varias facturas'] },
        { id: 'mercadoPago', label: 'Facturar Mercado Pago', grupo: 'AFIP', accion: { vista: 'mercadoPago' }, claves: ['mp', 'mercadopago', 'factura', 'cobros'] },
        { id: 'vep', label: 'Generar VEP', grupo: 'AFIP', accion: { vista: 'vep' }, claves: ['volante', 'pago', 'deuda'] },
        { id: 'cuentaTributaria', label: 'Cuenta Tributaria', grupo: 'AFIP', accion: { vista: 'cuentaTributaria' }, claves: ['sct', 'saldo', 'deuda'] },
        { id: 'consultaComprobantes', label: 'Consulta Comprobantes', grupo: 'AFIP', accion: { vista: 'consultaComprobantes' }, claves: ['emitidos', 'facturas'] },
        { id: 'planesDePago', label: 'Planes de Pago', grupo: 'AFIP', accion: { vista: 'planesDePago' }, claves: ['cuotas', 'mis facilidades'] },
        { id: 'declaracionJurada', label: 'Declaración Jurada', grupo: 'AFIP', accion: { vista: 'declaracionJurada' }, claves: ['ddjj', 'dj', 'f5111'] },
        { id: 'datosRegistrales', label: 'Datos registrales', grupo: 'AFIP', accion: { vista: 'datosRegistrales' }, claves: ['sistema registral', 'reflejo', 'constancia'] },
        { id: 'ddjjPendientes', label: 'DDJJ pendientes', grupo: 'AFIP', accion: { vista: 'ddjjPendientes' }, claves: ['seti', 'presentacion', 'declaraciones'] },
        { id: 'importarLibroIva', label: 'Portal IVA', grupo: 'AFIP', accion: { vista: 'importarLibroIva' }, claves: ['importar libro iva', 'ventas', 'compras'] },

        // ===== ATM =====
        { id: 'inicioAtm', label: 'Inicio ATM', grupo: 'ATM', accion: { vista: 'atm' }, claves: ['mendoza', 'rentas', 'inicio'] },
        { id: 'lanzadorAtm', label: 'Lanzador', grupo: 'ATM', accion: { lanzador: 'atm' }, claves: ['sesion', 'abrir', 'login', 'clave atm'] },
        { id: 'atmConstancias', label: 'Constancias', grupo: 'ATM', accion: { sub: 'constancias' }, claves: ['constancia'] },
        { id: 'atmPlanesPago', label: 'Planes de Pago', grupo: 'ATM', accion: { sub: 'planesPago' }, claves: ['cuotas'] },
        { id: 'atmTasaCero', label: 'Tasa Cero', grupo: 'ATM', accion: { sub: 'tasaCero' }, claves: ['iibb', 'ingresos brutos'] },
        { id: 'atmRetenciones', label: 'Retenciones', grupo: 'ATM', accion: { sub: 'retenciones' }, claves: ['percepciones'] },
        { id: 'atmApremios', label: 'Apremios', grupo: 'ATM', accion: { sub: 'apremios' }, claves: ['inhibiciones', 'embargo', 'juicio', 'deuda'] },

        // ===== General (botones sueltos de la navbar) =====
        { id: 'clientes', label: 'Clientes', grupo: 'General', accion: { vista: 'clientes' }, claves: ['contribuyentes', 'alta', 'abm', 'usuarios'] },
        { id: 'pdf', label: 'PDF', grupo: 'General', accion: { vista: 'pdf' }, claves: ['tablas pdf', 'extraer'] },
        { id: 'plantillasExcel', label: 'Plantillas Excel', grupo: 'General', accion: { vista: 'plantillasExcel' }, claves: ['excel', 'plantilla'] },
        { id: 'historial', label: 'Historial', grupo: 'General', accion: { vista: 'historial' }, claves: ['log', 'bitacora', 'acciones'] },
        { id: 'carpetaDatos', label: 'Carpeta de datos', grupo: 'General', accion: { fn: 'abrirConfigDatos' }, claves: ['configuracion', 'datos'], navbar: false },
    ];

    // Llama a una función global si existe; si no, avisa (el controlador es un módulo y carga después).
    function llamar(nombre, ...args) {
        if (typeof window[nombre] === 'function') return window[nombre](...args);
        console.warn(`[catalogo] window.${nombre} no está disponible todavía`);
    }

    function ejecutarServicio(itemOId) {
        const item = typeof itemOId === 'string'
            ? CATALOGO_SERVICIOS.find(s => s.id === itemOId)
            : itemOId;
        if (!item) return console.warn('[catalogo] Servicio desconocido:', itemOId);

        const a = item.accion;
        if (a.vista) llamar('navegarVista', a.vista);
        else if (a.sub) llamar('navegarAtmSub', a.sub);
        else if (a.lanzador) llamar('abrirLanzadorSesion', a.lanzador);
        else if (a.evento) document.dispatchEvent(new CustomEvent(a.evento));
        else if (a.fn) llamar(a.fn);
    }

    window.CATALOGO_SERVICIOS = CATALOGO_SERVICIOS;
    window.ejecutarServicio = ejecutarServicio;
})();
