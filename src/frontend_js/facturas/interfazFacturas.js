import { procesarDatosTextareas } from './procesarDatosMasivos.js';
import { procesarFormularioFactura } from './facturas.js'; // Removida la importación de realizarAccionFacturacion
import { implementarSeguro } from './paraStorage.js';
import { inicializarFacturas } from './index_01.js';
import { pdvOfrecibles } from './pdvOfrecibles.js';
import { registrarManejadorPdv } from '../autenticacion/auth.js';


let datosMasivos = [];
let datosValidados = false;
let flatpickrFechaComprobante; // Para la fecha del comprobante
let flatpickrDatepicker;       // Para la selección múltiple de fechas

export async function inicializarInterfazFacturas() {
    const facturasDiv = document.getElementById('facturasDiv');
    const facturasBtn = document.getElementById('facturasBtn');

    if (!facturasBtn || !facturasDiv) {
        console.error("No se encontraron los elementos facturasBtn o facturasDiv");
        return;
    }

    // 1. Cargar el componente de facturas.html en facturasDiv primero
    try {
        const response = await fetch('../facturas/factura.html');
        const html = await response.text();
        facturasDiv.innerHTML = html;
        const selectPdvFactura = document.getElementById('selectPuntoDeVentaFactura');
        if (selectPdvFactura) selectPdvFactura.addEventListener('change', alCambiarPdvFactura);
    } catch (err) {
        console.error('Error al cargar facturas.html:', err);
        return;
    }

    // 2. Ahora busca los elementos dentro de facturasDiv
    const fechaComprobante = document.getElementById('fechaComprobante');
    const datepicker = document.getElementById('datepicker');
    const selectMes = document.getElementById('selectMes');
    const selectAnio = document.getElementById('selectAnio');
    const periodoManual = document.getElementById('periodoManual');
    const montoManualRadio = document.getElementById('montoManual');
    const montoTotalRadio = document.getElementById('montoTotal');
    const textareaContainer = document.getElementById('textareaContainer');
    const inputContainerTotal = document.getElementById('inputContainerTotal');
    const procesarDatosBtn = document.getElementById('procesarDatos');
    const textareaFechas = document.getElementById('textareaFechas');
    const textareaMontos = document.getElementById('textareaMontos');
    const tablaDatosProcesados = document.getElementById('tablaDatosProcesados');
    const resultadoProcesamiento = document.getElementById('resultadoProcesamiento');
    const ingresoManual = document.getElementById('ingresoManual');
    const ingresoMasivo = document.getElementById('ingresoMasivo');
    const seccionManual = document.getElementById('seccionManual');
    const seccionMasiva = document.getElementById('seccionMasiva');
    const periodoTotal = document.getElementById('periodoTotal');
    const periodoDiasHabiles = document.getElementById('periodoDiasHabiles');
    const calendario = document.getElementById('calendario');
    const fechasText = document.getElementById('fechasFacturas');
    const facturasForm = document.getElementById('facturasForm');

    inicializarFacturas();
    facturasDiv.style.display = 'none'; // Inicialmente oculto

    facturasBtn.addEventListener('click', () => {
        const isVisible = facturasDiv.style.display === 'block';
        facturasDiv.style.display = isVisible ? 'none' : 'block';
        //realizarAccionFacturacion();
    });

    // Inicializar flatpickr para fechaComprobante
    if (fechaComprobante) {
        flatpickrFechaComprobante = flatpickr(fechaComprobante, {
            mode: "single",
            dateFormat: "d/m/Y",
            defaultDate: "today", // arranca con la fecha de hoy (AFIP la necesita sí o sí)
            onChange: function (selectedDates) {
                if (selectedDates.length > 0) {
                    const date = selectedDates[0];
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    fechaComprobante.value = `${day}/${month}/${year}`;
                }
            }
        });
    } else {
        console.error('El elemento con ID "fechaComprobante" no existe.');
    }

    if (datepicker) {
        flatpickrDatepicker = flatpickr(datepicker, {
            mode: "multiple",
            dateFormat: "d/m/Y",
            onChange: function (selectedDates) {
                const fechasFacturas = document.getElementById('fechasFacturas');
                if (fechasFacturas) {
                    fechasFacturas.value = selectedDates.map(date => {
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        return `${day}/${month}/${year}`;
                    }).join(', ');
                }
            }
        });
    }

    // Función para actualizar solo el calendario de selección múltiple
    function actualizarCalendario() {
        const mes = selectMes.value;
        const anio = selectAnio.value;

        if (mes && anio && flatpickrDatepicker) {
            const nuevaFecha = new Date(anio, mes - 1, 1);
            flatpickrDatepicker.setDate([], false);  // Limpiar fechas seleccionadas
            flatpickrDatepicker.jumpToDate(nuevaFecha);
        }
    }

    // Event listeners para los selectores de mes y año
    if (selectMes) selectMes.addEventListener('change', actualizarCalendario);
    if (selectAnio) selectAnio.addEventListener('change', actualizarCalendario);

    // 2. Función para mostrar/ocultar según selección
    function actualizarVista() {
        if (periodoManual.checked) {
            // Mostrar elementos de ingreso manual
            datepicker.style.display = 'block';
            calendario.style.display = 'block';
            fechasText.style.display = 'block';
        } else {
            // Ocultar elementos de ingreso manual
            datepicker.style.display = 'none';
            fechasText.style.display = 'none';
            calendario.style.display = 'none';
        }
    }

    // 3. Escuchar cambios en todos los radios
    periodoTotal.addEventListener('change', actualizarVista);
    periodoDiasHabiles.addEventListener('change', actualizarVista);
    periodoManual.addEventListener('change', actualizarVista);

    // 4. Inicializar estado al cargar
    actualizarVista();


    function handleMontoChange() {
        if (montoManualRadio.checked) {
            textareaContainer.style.display = 'block';
            inputContainerTotal.style.display = 'none';
        } else if (montoTotalRadio.checked) {
            textareaContainer.style.display = 'none';
            inputContainerTotal.style.display = 'block';
        }
    }

    if (montoManualRadio && montoTotalRadio) {
        montoManualRadio.addEventListener('change', handleMontoChange);
        montoTotalRadio.addEventListener('change', handleMontoChange);
        handleMontoChange();
    }
    //Manejo de ingreso masivo y manual
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

    procesarDatosBtn.addEventListener('click', () => {
        event.preventDefault();
        const resultado = procesarDatosTextareas(textareaFechas, textareaMontos);
        if (resultado.errores.length > 0) {
            alert(resultado.errores.join('\n'));
            return;
        }

        datosMasivos = resultado.datos;
        datosValidados = true;
        tablaDatosProcesados.innerHTML = datosMasivos.map(({ fecha, monto }) => `<tr><td>${fecha}</td><td>${monto}</td></tr>`).join('');
        resultadoProcesamiento.style.display = 'block';
    });
    facturasForm.addEventListener('submit', (event) => {
        // Antes de procesar el formulario, obtener la empresa seleccionada
        const selectEmpresaDisponible = document.getElementById('selectEmpresaDisponible');
        let empresaElegida = null;
        if (selectEmpresaDisponible) {
            empresaElegida = selectEmpresaDisponible.value;
        }
        // Guardar la empresa elegida en window para que facturas.js la pueda usar
        window.empresaElegida = empresaElegida;

        procesarFormularioFactura(event, facturasForm, datosMasivos, datosValidados); // Llama a la función

        // Mostrar el botón "Hacer Factura" al procesar el formulario
        const hacerFacturaDiv = document.getElementById('hacerFacturaFacturas');
        const botonesPuppeteer = document.getElementById('botones-puppeteer');
        if (hacerFacturaDiv) hacerFacturaDiv.classList.remove('hidden');
        // Ocultar los botones de puppeteer hasta que se haga click en "Hacer Factura"
        if (botonesPuppeteer) botonesPuppeteer.classList.add('hidden');
    });

    // Mostrar los botones de puppeteer al hacer click en "Hacer Factura"
    const habilitarBtnAFIP = document.getElementById('habilitarBtnAFIP');
    if (habilitarBtnAFIP) {
        habilitarBtnAFIP.addEventListener('click', () => {
            const botonesPuppeteer = document.getElementById('botones-puppeteer');
            if (botonesPuppeteer) {
                botonesPuppeteer.classList.remove('hidden');
            }
        });
    }

    // Ocultar "Hacer Factura" y "botones-puppeteer" al abrir el módulo
    const hacerFacturaDiv = document.getElementById('hacerFacturaFacturas');
    const botonesPuppeteer = document.getElementById('botones-puppeteer');
    if (hacerFacturaDiv) hacerFacturaDiv.classList.add('hidden');
    if (botonesPuppeteer) botonesPuppeteer.classList.add('hidden');

    window.electronAPI.onCodigoLocalStorageGenerado((codigo) => {
        implementarSeguro('respuesta', codigo);
        configurarBotonesExpandirTablas(); 
    });

    // === Escuchar el canal IPC para mostrar el resultado final de facturación ===
    window.electronAPI.onFacturaResultado((resultado) => {
        mostrarResultadoFactura(resultado);
    });

    configurarUsuarioEnFacturas();
    configurarEmpresasDisponibles(); 
}

function configurarUsuarioEnFacturas() {
    const selectUsuariosFacturas = document.getElementById('selectUsuarios');
    const usuarioSeleccionado = window.usuarioSeleccionado;

    if (selectUsuariosFacturas && usuarioSeleccionado) {
        const nombreCapitalizado = usuarioSeleccionado.nombre
            ? usuarioSeleccionado.nombre.charAt(0).toUpperCase() + usuarioSeleccionado.nombre.slice(1).toLowerCase()
            : 'Sin nombre';
        selectUsuariosFacturas.textContent = nombreCapitalizado;
        selectUsuariosFacturas.style.background = '#e9e9e9';
        selectUsuariosFacturas.style.color = '#222';
        selectUsuariosFacturas.style.padding = '4px 8px';
        selectUsuariosFacturas.style.fontWeight = 'bold';
    }
}

async function configurarEmpresasDisponibles() {
    const selectEmpresaDisponible = document.getElementById('selectEmpresaDisponible');
    const usuario = window.usuarioSeleccionado;

    if (!selectEmpresaDisponible || !usuario) return;

    // Modelo plano: el contribuyente ES la empresa. No hay cascada empresa→PDV;
    // hay UNA sola "empresa" = la razón social del contribuyente seleccionado.
    const razonSocial = usuario.razonSocial || usuario.nombre || '';

    selectEmpresaDisponible.innerHTML = '';
    const option = document.createElement('option');
    option.value = razonSocial;
    option.textContent = razonSocial || 'Sin razón social';
    selectEmpresaDisponible.appendChild(option);
    selectEmpresaDisponible.disabled = true;   // nada que elegir: es el contribuyente
    window.empresaElegida = razonSocial;

    // Tipo de contribuyente: siempre visible; preseleccionado si el cliente lo tiene.
    const selectTipo = document.getElementById('selectTipoContribuyenteFactura');
    if (selectTipo) selectTipo.value = usuario.tipoContribuyente || '';

    // Los PDV salen del contribuyente (cacheados, sin claves) vía IPC.
    await popularPuntosDeVentaFactura(usuario.cuit);
}

/**
 * Pobla el <select id="selectPuntoDeVentaFactura"> con los PDV cacheados del
 * contribuyente (modelo plano), pedidos por CUIT al backend
 * (contribuyente:puntosDeVenta — sin claves). Si no hay PDV, deshabilita.
 *
 * Si ya sabemos qué PDV ofrece HOY Comprobantes en línea (lo aprende cada factura
 * en el paso 0), se muestran solo esos: el ABM es un historial y trae PDV viejos
 * que AFIP ya no deja usar (ej. los de Monotributo de quien pasó a RI).
 *
 * @param {string} cuit
 * @param {string[]|null} [habilitadosForzados] lista recién devuelta por AFIP
 */
async function popularPuntosDeVentaFactura(cuit, habilitadosForzados = null) {
    const selectPdv = document.getElementById('selectPuntoDeVentaFactura');
    if (!selectPdv) return;

    if (!habilitadosForzados) mostrarAvisoPdv(null);
    selectPdv.innerHTML = '<option value="">Cargando puntos de venta…</option>';
    selectPdv.disabled = true;

    const pdvs = await pdvOfrecibles(cuit, habilitadosForzados);

    selectPdv.innerHTML = '';

    if (pdvs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— sin puntos de venta —';
        selectPdv.appendChild(opt);
        selectPdv.disabled = true;
        return;
    }

    pdvsMostrados = pdvs;
    pdvs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.numero;
        opt.textContent = etiquetaPdv(p);
        selectPdv.appendChild(opt);
    });
    selectPdv.disabled = false;
    selectPdv.selectedIndex = 0;
    alCambiarPdvFactura();
}

// PDV que está mostrando el desplegable (con su sistema, si lo sabemos).
let pdvsMostrados = [];

const NOMBRE_TIPO = { B: 'Responsable Inscripto', C: 'Monotributo' };

/**
 * Al elegir PDV, el tipo de contribuyente es la letra de ese PDV (sale del sistema
 * que trajo AFIP en el análisis) y queda TRABADO: es dato de AFIP, cambiarlo solo
 * sirve para que AFIP rechace la factura. Solo si el PDV no tiene letra conocida
 * (ej. creado después del último análisis) el usuario lo elige. Si la letra no
 * coincide con lo guardado del cliente, el cartel amarillo avisa que se corrige.
 */
function alCambiarPdvFactura() {
    mostrarAvisoPdv(null);
    const selectPdv = document.getElementById('selectPuntoDeVentaFactura');
    const selectTipo = document.getElementById('selectTipoContribuyenteFactura');
    if (!selectPdv || !selectTipo) return;

    const pdv = pdvsMostrados.find(p => p.numero === selectPdv.value);
    const letra = pdv ? letraDePdv(pdv) : null;
    trabarTipoContribuyente(letra);
    if (!letra) return;

    // Se compara con el tipo GUARDADO del cliente (no con lo que dejó el PDV anterior).
    const delCliente = window.usuarioSeleccionado && window.usuarioSeleccionado.tipoContribuyente;
    if (delCliente && delCliente !== letra) {
        mostrarAvisoPdv(
            `El punto de venta ${pdv.numero} es de ${NOMBRE_TIPO[letra]} (Factura ${letra}). ` +
            `El cliente figuraba como ${delCliente}: se corrige a ${letra}.`
        );
    }
}

/**
 * letra = 'B'|'C' → select gris con esa letra (viaja por el hidden, porque un
 * select disabled no entra en el FormData). null → select libre y obligatorio.
 */
function trabarTipoContribuyente(letra) {
    const selectTipo = document.getElementById('selectTipoContribuyenteFactura');
    const oculto = document.getElementById('tipoContribuyenteFacturaTrabado');
    const nota = document.getElementById('notaTipoContribuyenteFactura');
    if (!selectTipo) return;

    if (letra) {
        selectTipo.value = letra;
        selectTipo.disabled = true;
        if (oculto) { oculto.name = 'tipoContribuyenteElegido'; oculto.value = letra; }
    } else {
        // Al destrabar queda lo guardado del cliente (o vacío para que elija).
        if (selectTipo.disabled) {
            selectTipo.value = (window.usuarioSeleccionado && window.usuarioSeleccionado.tipoContribuyente) || '';
        }
        selectTipo.disabled = false;
        if (oculto) { oculto.removeAttribute('name'); oculto.value = ''; }
    }
    if (nota) nota.hidden = !letra;
}

function letraDePdv(p) {
    const sistema = normSistema(p.sistema);
    if (sistema === 'factura en linea - responsable inscripto') return 'B';
    if (sistema === 'factura en linea - monotributo') return 'C';
    return null;
}

const normSistema = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// La letra que va a salir depende del sistema del PDV (el backend decide igual):
// mostrarla evita elegir a ciegas cuando todos tienen el mismo domicilio.
function etiquetaPdv(p) {
    const sistema = normSistema(p.sistema);
    if (sistema === 'factura en linea - responsable inscripto') return `${p.numero} — Responsable Inscripto (Factura B)`;
    if (sistema === 'factura en linea - monotributo') return `${p.numero} — Monotributo (Factura C)`;
    return p.descripcion ? `${p.numero} — ${p.descripcion}` : p.numero;
}

// Aviso dentro del formulario, pegado al desplegable de PDV (null = sacarlo).
function mostrarAvisoPdv(texto) {
    const contenedor = document.getElementById('puntoDeVentaFacturaContainer');
    if (!contenedor) return;
    let aviso = document.getElementById('avisoPdvFactura');
    if (!texto) {
        if (aviso) aviso.remove();
        contenedor.classList.remove('pdv-a-revisar');
        return;
    }
    if (!aviso) {
        aviso = document.createElement('p');
        aviso.id = 'avisoPdvFactura';
        aviso.className = 'aviso-pdv-factura';
        contenedor.prepend(aviso);
    }
    aviso.textContent = texto;
    contenedor.classList.add('pdv-a-revisar');
}

/**
 * Vuelta del paso 0 con PDV_NO_HABILITADO: en vez de un error, se recarga el
 * desplegable con lo que AFIP ofreció y se pide elegir de nuevo.
 * @param {string[]} habilitados  números de PDV que ofrece Comprobantes en línea
 * @param {string} [elegido]      el PDV que se había elegido
 */
/**
 * Vuelta con TIPO_PDV_DISTINTO: AFIP dijo de qué tipo es el PDV y el backend ya
 * corrigió el cliente. Se recargan los PDV (con el sistema corregido → el tipo
 * queda trabado en la letra nueva) y se avisa en el cartel amarillo.
 * @param {{puntoVenta: string, letra: 'B'|'C'}} detalle
 */
async function mostrarTipoCorregidoFactura(detalle) {
    const usuario = window.usuarioSeleccionado;
    if (!usuario || !detalle) return;
    usuario.tipoContribuyente = detalle.letra;
    const selectPdv = document.getElementById('selectPuntoDeVentaFactura');
    const elegido = selectPdv ? selectPdv.value : null;
    await popularPuntosDeVentaFactura(usuario.cuit);
    if (selectPdv && elegido && pdvsMostrados.some(p => p.numero === elegido)) {
        selectPdv.value = elegido;
        alCambiarPdvFactura();
    }
    mostrarAvisoPdv(
        `AFIP indica que el punto de venta ${detalle.puntoVenta} es de ${NOMBRE_TIPO[detalle.letra]} ` +
        `(Factura ${detalle.letra}). Se corrigió el cliente: revisá y volvé a generar.`
    );
    if (selectPdv) selectPdv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function mostrarPdvHabilitadosFactura(habilitados, elegido) {
    const usuario = window.usuarioSeleccionado;
    if (!usuario) return;
    await popularPuntosDeVentaFactura(usuario.cuit, habilitados);
    mostrarAvisoPdv(
        `AFIP no habilita ${elegido ? `el punto de venta ${elegido}` : 'ese punto de venta'} para facturar. ` +
        'Estos son los que ofrece hoy: elegí uno y volvé a generar.'
    );
    // Al elegir otro PDV, alCambiarPdvFactura saca este aviso.
    const selectPdv = document.getElementById('selectPuntoDeVentaFactura');
    if (selectPdv) {
        selectPdv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        selectPdv.focus();
    }
}

function configurarBotonesExpandirTablas() {
    const botonesExpandir = document.querySelectorAll('.btn-expandir');
    botonesExpandir.forEach(boton => {
        boton.addEventListener('click', function() {
            const tipoTabla = this.getAttribute('data-tabla');
            const tablaContent = document.getElementById(`tabla-${tipoTabla}-content`);
            const textoExpandir = this.querySelector('.texto-expandir');
            const iconoExpandir = this.querySelector('.icono-expandir');
            
            if (!tablaContent) {
                console.warn(`No se encontró el elemento con id tabla-${tipoTabla}-content`);
                return;
            }
            
            if (tablaContent.classList.contains('tabla-colapsada')) {
                // Expandir tabla
                tablaContent.classList.remove('tabla-colapsada');
                tablaContent.classList.add('tabla-expandida');
                textoExpandir.textContent = 'Colapsar Tabla';
                iconoExpandir.textContent = '▲';
                this.classList.add('btn-activo');
            } else {
                // Colapsar tabla
                tablaContent.classList.remove('tabla-expandida');
                tablaContent.classList.add('tabla-colapsada');
                textoExpandir.textContent = 'Expandir Tabla';
                iconoExpandir.textContent = '▼';
                this.classList.remove('btn-activo');
            }
        });
    });
}

// Función para mostrar el resultado de facturación en el div correspondiente
function mostrarResultadoFactura(resultado) {
    let div = document.getElementById('facturaResultadoFinal');
    if (!div) {
        div = document.createElement('div');
        div.id = 'facturaResultadoFinal';
        div.style.margin = '32px 0 0 0';
        div.style.padding = '16px';
        div.style.border = '2px solid #4caf50';
        div.style.background = '#f6fff6';
        div.style.borderRadius = '8px';
        div.style.fontFamily = 'monospace';
        div.style.fontSize = '1rem';
        div.style.maxWidth = '700px';
        div.style.wordBreak = 'break-word';
        document.body.appendChild(div);
    }
    div.style.display = 'block';

    // Mostrar datos relevantes si existen
    let html = `<h3>Resultado de Facturación</h3>`;
    if (resultado && resultado.data) {
        html += `
            <ul style="font-family:inherit;font-size:1rem;">
                <li><b>Mensaje:</b> ${resultado.message || ''}</li>
                <li><b>Cantidad de Facturas:</b> ${resultado.data.cantidadFacturas ?? '-'}</li>
                <li><b>Suma Total:</b> ${resultado.data.suma ?? '-'}</li>
                <li><b>Detalle:</b><br><pre style="white-space:pre-wrap;font-family:inherit;">${resultado.data.detalle ?? ''}</pre></li>
            </ul>
        `;
    }
    // Mostrar el JSON crudo para referencia técnica
    html += `<details style="margin-top:12px;"><summary>Ver JSON completo</summary>
        <pre style="white-space: pre-wrap;">${JSON.stringify(resultado, null, 2)}</pre>
    </details>`;

    div.innerHTML = html;
}

// Exportar funciones para que puedan ser llamadas desde controlador.js al cambiar de usuario
window.configurarUsuarioEnFacturas = configurarUsuarioEnFacturas;
window.configurarEmpresasDisponibles = configurarEmpresasDisponibles;

// Vuelta del paso 0 con aviso de PDV (auth.js la reparte a la pantalla visible).
registrarManejadorPdv('selectPuntoDeVentaFactura', {
    noHabilitado: mostrarPdvHabilitadosFactura,
    tipoCorregido: mostrarTipoCorregidoFactura
});