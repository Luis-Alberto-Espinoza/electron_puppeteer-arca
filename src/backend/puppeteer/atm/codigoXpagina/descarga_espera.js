/**
 * ESPERA DE DESCARGAS DE ATM, por senal y no por reloj.
 *
 * Medido contra ATM el 2026-09-16, CUIT 30718609700, periodo 2026-08, en tres
 * corridas completas:
 *
 *   registros | el servidor tarda en empezar a mandar | archivo
 *           3 | 1,19s  1,20s  1,25s                   | 5 KB
 *          21 | 5,49s  5,58s  5,41s                   | 7,5 KB
 *        2468 | 407,6s 416,6s 404,7s                  | 441 KB
 *
 * Tres cosas que salen de esos numeros:
 *   1) ATM genera a razon de unos 6 registros por segundo, mas ~2s de arranque,
 *      y varia menos del 3% entre corridas. La cuenta sirve para ESTIMAR.
 *   2) La descarga en si no existe como problema: 441 KB bajan en 0,44s. El
 *      99,9% del tiempo es el servidor armando el archivo.
 *   3) Por eso el viejo tope de 60s para "mas de 500 registros" perdia el
 *      archivo: hacian falta 7 minutos.
 *
 * LA SENAL. Al clickear Exportar, ATM abre una pestana en blanco (a los ~0,11s,
 * siempre) y esa pestana vive EXACTAMENTE lo que dura la generacion: muere en
 * el mismo instante en que empiezan a llegar los bytes. Pestana viva = ATM
 * trabajando. Es la unica senal que hay durante la generacion, porque los
 * eventos de descarga recien hablan cuando el servidor mando la primera
 * respuesta.
 *
 * DOS TRAMPAS MEDIDAS, para que nadie las repita:
 *   - Puppeteer FILTRA esa pestana: ni browser.on('targetcreated') ni
 *     page.on('popup') disparan, porque nunca llega a ser una pagina de verdad.
 *     Hay que escuchar el CDP crudo con Target.setDiscoverTargets.
 *   - Mirar la carpeta de descargas NO distingue "el servidor esta pensando" de
 *     "no paso nada": en los dos casos la carpeta esta vacia. Ese era el bug.
 *
 * Y un dato para cuando encaremos el paralelo: Browser.downloadWillBegin trae
 * un frameId que es el targetId de la pestana que lo pidio, asi que se puede
 * saber de que servicio es cada archivo aunque haya varios bajando a la vez.
 */

const ESPERA_ARRANQUE_MS = 15000;   // si en 15s no hay ni pestana ni descarga, el click no prendio
const GRACIA_MUERTE_MS = 2000;      // la pestana muere ~40ms DESPUES del aviso de descarga; no decidir en esa rendija
const INACTIVIDAD_MS = 45000;       // ya bajando y 45s sin recibir un byte: se corto
const INTERVALO_MS = 250;
const INTERVALO_LOG_MS = 15000;

/**
 * Cuanto se estima que ATM va a tardar en generar, segun lo medido.
 * @param {number} cantidad - Registros que informo la consulta.
 * @returns {number} milisegundos estimados.
 */
function estimarGeneracionMs(cantidad) {
    return (2 + cantidad / 6) * 1000;
}

/**
 * Techo de seguridad: el triple de lo estimado, nunca menos de 1 minuto ni mas
 * de 30. No es la espera esperada, es el limite antes de dar el archivo por
 * perdido. La espera real la corta la senal.
 * @param {number} cantidad - Registros que informo la consulta.
 * @returns {number} milisegundos.
 */
function techoDescargaMs(cantidad) {
    const triple = estimarGeneracionMs(cantidad) * 3;
    return Math.min(Math.max(triple, 60000), 30 * 60 * 1000);
}

/**
 * Espera UNA descarga disparada por UN click, decidiendo por senal.
 *
 * @param {Object} opciones
 * @param {{foto: Function}} opciones.observador - De sonda.observar(), creado ANTES del click.
 * @param {number} opciones.techoMs - Limite duro antes de darla por perdida.
 * @param {string} opciones.queEs - "Excel" o "DIU", para los mensajes.
 * @param {Function} [opciones.log] - Donde escribir el avance.
 * @param {{ahora: Function, dormir: Function}} [opciones.reloj] - Inyectable para testear.
 * @returns {Promise<{ok: boolean, nombre?: string, bytes?: number, motivo?: string, ms: number}>}
 */
async function esperarDescarga({ observador, techoMs, queEs, log = () => {}, reloj }) {
    const ahora = reloj ? reloj.ahora : () => Date.now();
    const dormir = reloj ? reloj.dormir : (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const inicio = ahora();
    let ultimoLog = inicio;
    let ultimoCambio = inicio;
    let huellaPrevia = '';
    let sinNadaDesde = null;

    while (true) {
        await dormir(INTERVALO_MS);

        const foto = observador.foto();
        const transcurrido = ahora() - inicio;

        const completa = foto.descargas.find(d => d.estado === 'completed');
        if (completa) {
            return { ok: true, nombre: completa.nombre, bytes: completa.recibidos, ms: transcurrido };
        }

        const cancelada = foto.descargas.find(d => d.estado === 'canceled');
        if (cancelada) {
            return { ok: false, motivo: `ATM cancelo la descarga de "${cancelada.nombre}"`, ms: transcurrido };
        }

        // Ni pestana ni descarga: o el click no prendio, o ATM cerro la pestana
        // con las manos vacias. Se exige que la nada dure un rato, porque la
        // pestana muere unos milisegundos DESPUES de avisar la descarga.
        const nada = foto.pestanasVivas === 0 && foto.descargas.length === 0;
        sinNadaDesde = nada ? (sinNadaDesde ?? ahora()) : null;

        if (sinNadaDesde !== null) {
            const yaHabiaNacido = foto.pestanasNacidas > 0;
            const limite = yaHabiaNacido ? GRACIA_MUERTE_MS : ESPERA_ARRANQUE_MS;
            if (ahora() - sinNadaDesde >= limite) {
                const motivo = yaHabiaNacido
                    ? `ATM cerro la pestana del ${queEs} sin entregar el archivo`
                    : `el click del ${queEs} no abrio ninguna pestana en ${ESPERA_ARRANQUE_MS / 1000}s: el boton no respondio`;
                return { ok: false, motivo, ms: transcurrido };
            }
        }

        // Ya hay bytes en camino: el latido pasa a ser el progreso.
        if (foto.descargas.length) {
            const huella = foto.descargas.map(d => `${d.nombre}:${d.estado}:${d.recibidos}`).join('|');
            if (huella !== huellaPrevia) {
                huellaPrevia = huella;
                ultimoCambio = ahora();
            } else if (ahora() - ultimoCambio >= INACTIVIDAD_MS) {
                return {
                    ok: false,
                    motivo: `la descarga del ${queEs} se quedo ${INACTIVIDAD_MS / 1000}s sin recibir un byte`,
                    ms: transcurrido
                };
            }
        }

        if (transcurrido >= techoMs) {
            return {
                ok: false,
                motivo: `ATM no entrego el ${queEs} en ${Math.round(techoMs / 1000)}s (techo de seguridad)`,
                ms: transcurrido
            };
        }

        if (ahora() - ultimoLog >= INTERVALO_LOG_MS) {
            ultimoLog = ahora();
            const estado = foto.descargas.length
                ? `bajando ${foto.descargas.map(d => `${d.nombre} ${d.recibidos}b`).join(', ')}`
                : (foto.pestanasVivas ? 'ATM sigue generando el archivo' : 'sin senal todavia');
            log(`esperando el ${queEs}: ${Math.round(transcurrido / 1000)}s, ${estado}`);
        }
    }
}

/**
 * Enciende la vigilancia de descargas sobre el navegador de esta pagina.
 *
 * Lo unico que toca del navegador es Browser.setDownloadBehavior con
 * eventsEnabled, apuntando a la MISMA carpeta que ya uso el llamador.
 *
 * No escribe en consola: todo va a una bitacora en memoria que se vuelca con
 * resumen(), y el llamador la vuelca solo cuando algo salio mal. Cuando el
 * periodo sale bien, no hace falta ver nacer y morir cada pestana.
 *
 * @param {Object} opciones
 * @param {import('puppeteer').Page} opciones.page - Pagina de la Oficina Virtual.
 * @param {string} opciones.downloadDir - La MISMA carpeta que configuro el llamador.
 * @param {string} opciones.etiqueta - Nombre del subservicio, para el prefijo del log.
 */
async function iniciarSondaDescargas({ page, downloadDir, etiqueta }) {
    const inicio = Date.now();
    const bitacora = [];
    const anotar = (texto) => {
        const cuando = ((Date.now() - inicio) / 1000).toFixed(2).padStart(7, ' ');
        bitacora.push(`${cuando}s  ${texto}`);
    };

    const pestanas = new Map();   // targetId -> { nace, muere }
    const descargas = new Map();  // guid -> { nombre, willBegin, recibidos, totalBytes, estado, fin }

    const inerte = {
        marcar() {},
        observar() { return { foto: () => ({ pestanasNacidas: 0, pestanasVivas: 0, descargas: [] }) }; },
        resumen() {},
        async cerrarHuerfanas() { return 0; },
        async detener() {}
    };

    let cdp = null;
    try {
        cdp = await page.browser().target().createCDPSession();
    } catch (error) {
        console.warn(`[${etiqueta}]       No se pudo vigilar las descargas: ${error.message}`);
        return inerte;
    }

    // La pestana que manejamos NO es un popup: nunca hay que contarla como
    // senal ni, sobre todo, cerrarla por huerfana.
    let idPaginaPrincipal = null;
    try {
        const sesionPagina = await page.target().createCDPSession();
        const info = await sesionPagina.send('Target.getTargetInfo');
        idPaginaPrincipal = info.targetInfo.targetId;
        await sesionPagina.detach();
    } catch (error) {
        anotar(`no pude identificar la pestana principal: ${error.message}`);
    }

    try {
        await cdp.send('Browser.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadDir,
            eventsEnabled: true
        });
    } catch (error) {
        anotar(`Browser.setDownloadBehavior NO acepto eventsEnabled: ${error.message}`);
    }

    try {
        await cdp.send('Target.setDiscoverTargets', { discover: true });
    } catch (error) {
        anotar(`Target.setDiscoverTargets fallo: ${error.message}`);
    }

    const alCrearTarget = ({ targetInfo }) => {
        if (targetInfo.type !== 'page' || targetInfo.targetId === idPaginaPrincipal) return;
        pestanas.set(targetInfo.targetId, { nace: Date.now() });
        anotar(`nace pestana ${targetInfo.targetId.slice(0, 8)}`);
    };

    const alDestruirTarget = ({ targetId }) => {
        const pestana = pestanas.get(targetId);
        if (!pestana || pestana.muere) return;
        pestana.muere = Date.now();
        anotar(`muere pestana ${targetId.slice(0, 8)} (vivio ${((pestana.muere - pestana.nace) / 1000).toFixed(2)}s)`);
    };

    const alEmpezarDescarga = (ev) => {
        descargas.set(ev.guid, {
            nombre: ev.suggestedFilename, willBegin: Date.now(),
            recibidos: 0, totalBytes: 0, estado: 'inProgress'
        });
        anotar(`empieza descarga "${ev.suggestedFilename}"`);
    };

    const alProgresarDescarga = (ev) => {
        const descarga = descargas.get(ev.guid);
        if (!descarga) return;

        descarga.recibidos = ev.receivedBytes;
        descarga.totalBytes = ev.totalBytes || descarga.totalBytes;
        if (ev.state === descarga.estado) return;

        descarga.estado = ev.state;
        if (ev.state === 'completed' || ev.state === 'canceled') {
            descarga.fin = Date.now();
            anotar(`${ev.state} "${descarga.nombre}" (${ev.receivedBytes} bytes en ${((descarga.fin - descarga.willBegin) / 1000).toFixed(2)}s)`);
        }
    };

    cdp.on('Target.targetCreated', alCrearTarget);
    cdp.on('Target.targetDestroyed', alDestruirTarget);
    cdp.on('Browser.downloadWillBegin', alEmpezarDescarga);
    cdp.on('Browser.downloadProgress', alProgresarDescarga);

    return {
        /** Deja una marca en la bitacora. */
        marcar(texto) {
            anotar(texto);
        },

        /**
         * Marca el instante y devuelve una ventana para mirar SOLO lo que pase
         * de aca en adelante. Se crea ANTES del click, asi lo que dejo la
         * consulta anterior no puede contaminarla.
         */
        observar(texto) {
            const arranque = Date.now();
            anotar(texto);

            return {
                arranque,
                foto() {
                    const nacidas = [...pestanas.values()].filter(p => p.nace >= arranque);
                    return {
                        pestanasNacidas: nacidas.length,
                        pestanasVivas: nacidas.filter(p => !p.muere).length,
                        descargas: [...descargas.values()]
                            .filter(d => d.willBegin >= arranque)
                            .map(d => ({
                                nombre: d.nombre, estado: d.estado,
                                recibidos: d.recibidos, totales: d.totalBytes
                            }))
                    };
                }
            };
        },

        /**
         * Cierra las pestanas que quedaron vivas: si nos rendimos con ATM
         * todavia generando, esa pestana puede entregar el archivo mas tarde y
         * meterlo en la carpeta del servicio siguiente, donde el renombrador lo
         * adoptaria como propio.
         */
        async cerrarHuerfanas() {
            const vivas = [...pestanas.entries()].filter(([id, p]) => !p.muere && id !== idPaginaPrincipal);
            for (const [id] of vivas) {
                try {
                    await cdp.send('Target.closeTarget', { targetId: id });
                    anotar(`pestana huerfana ${id.slice(0, 8)} cerrada`);
                } catch (error) {
                    anotar(`no pude cerrar la pestana ${id.slice(0, 8)}: ${error.message}`);
                }
            }
            return vivas.length;
        },

        /** Vuelca la bitacora. El llamador la usa solo cuando algo salio mal. */
        resumen() {
            console.log(`[${etiqueta}]       ┌─ cronologia ─────────────────────────────────────`);
            for (const renglon of bitacora) {
                console.log(`[${etiqueta}]       │ ${renglon}`);
            }
            console.log(`[${etiqueta}]       └──────────────────────────────────────────────────`);
        },

        async detener() {
            try {
                cdp.off('Target.targetCreated', alCrearTarget);
                cdp.off('Target.targetDestroyed', alDestruirTarget);
                cdp.off('Browser.downloadWillBegin', alEmpezarDescarga);
                cdp.off('Browser.downloadProgress', alProgresarDescarga);
                await cdp.detach();
            } catch (error) {
                // La sesion pudo cerrarse sola con la recarga; no es motivo de aborto.
            }
        }
    };
}

module.exports = {
    iniciarSondaDescargas,
    esperarDescarga,
    estimarGeneracionMs,
    techoDescargaMs
};
