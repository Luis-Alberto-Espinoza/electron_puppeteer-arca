// Consulta de Planes de Pago de ATM: elegir el impuesto, contar los planes VIGENTES y bajar cada uno.
//
// La tabla se busca por su título ("Listado de Planes") y la columna por su nombre ("Estado"):
// antes era "la 2ª <table> de la página, 3ª columna".
const { frameOficina, clicReal } = require('./menuOficinaVirtual.js');

const INTERVALO_MS = 200;
const MARCA = 'data-tabla-anterior';   // marca que ponemos en las filas antes de cambiar de impuesto

/** Corre en la página: el listbox "Listado de Planes", sus filas y la posición de la columna Estado. */
function leerListadoPlanes() {
  const listado = Array.from(document.querySelectorAll('.z-listbox'))
    .find(l => /Listado de Planes/.test((l.querySelector('.z-auxheader') || {}).textContent || ''));
  if (!listado) return null;
  const encabezados = Array.from(listado.querySelectorAll('.z-listheader')).map(h => h.textContent.trim());
  return { listado, filas: Array.from(listado.querySelectorAll('.z-listitem')), columnaEstado: encabezados.indexOf('Estado') };
}

/** Deja leerListadoPlanes disponible en la página (sin eval adentro de ATM). */
async function instalarLector(frame) {
  await frame.evaluate(`window.__leerListadoPlanes = ${leerListadoPlanes.toString()};`);
}

/**
 * Elige el impuesto en "1 - Seleccione el impuesto…" (botón por texto) y espera a que ATM
 * RECARGUE el "Listado de Planes".
 *
 * Al tocar un impuesto la tabla "pestañea" (ATM la rearma): antes de contar hay que esperar eso.
 * window.zk.processing en esta pantalla no sirve (se probó en vivo 2026-10-23: contaba a los 0,4 s
 * la tabla vieja → "sin planes" en todos). Señal: marcamos las filas actuales; cuando ATM rearma la
 * tabla, las filas marcadas desaparecen. Si la tabla estaba vacía (no hay qué marcar) o ATM deja las
 * mismas filas, se da por buena a los `esperaSinCambioMs`. Después, medio segundo quieta.
 *
 * @returns {Promise<{filas: number, ms: number, cambio: boolean}>} para el log
 */
async function elegirImpuesto(page, impuesto, { esperaSinCambioMs = 4000, timeout = 30000 } = {}) {
  const frame = await frameOficina(page);
  await instalarLector(frame);
  const inicio = Date.now();

  // Huella = el texto de las filas: si cambia, ATM ya puso la tabla del impuesto nuevo.
  const huella = () => frame.evaluate(() => {
    const datos = window.__leerListadoPlanes();
    return datos ? datos.filas.map(f => f.textContent.trim()).join('|') : null;
  });
  const huellaAntes = await huella();

  const clic = await frame.evaluate((texto, marca) => {
    const datos = window.__leerListadoPlanes();
    if (datos) datos.filas.forEach(f => f.setAttribute(marca, '1'));
    const boton = Array.from(document.querySelectorAll('.z-button')).find(b => b.textContent.trim() === texto);
    if (!boton) return false;
    boton.click();
    return true;
  }, impuesto, MARCA);
  if (!clic) throw new Error(`No está el botón "${impuesto}" en Consulta de Planes de Pago.`);

  // 1) Esperar el pestañeo: ATM rearmó la tabla si las filas marcadas ya no están (había filas)
  //    o si cambió el contenido. Si no cambió nada (ej. vacía → vacía), se da por buena al tope.
  const habiaFilas = !!huellaAntes;
  let cambio = false;
  while (Date.now() - inicio < esperaSinCambioMs) {
    await new Promise(resolve => setTimeout(resolve, INTERVALO_MS));
    const quedanMarcadas = await frame.evaluate((marca) => !!document.querySelector(`.z-listitem[${marca}]`), MARCA);
    if ((habiaFilas && !quedanMarcadas) || (await huella()) !== huellaAntes) { cambio = true; break; }
  }

  // 2) Que la tabla quede quieta (misma cantidad de filas) medio segundo.
  let anterior = -1;
  let quietaDesde = Date.now();
  while (Date.now() - inicio < timeout) {
    const cantidad = await frame.evaluate(() => {
      const datos = window.__leerListadoPlanes();
      return datos ? datos.filas.length : -1;
    });
    if (cantidad !== anterior) { anterior = cantidad; quietaDesde = Date.now(); }
    // Filas: alcanza con medio segundo quieta. Cero filas: recién al tope (el pestañeo pasa por vacía).
    if (cantidad >= 0 && Date.now() - quietaDesde >= 500 && (cantidad > 0 || Date.now() - inicio >= esperaSinCambioMs)) {
      const ms = Date.now() - inicio;
      console.log(`[PlanDePago] ${impuesto}: tabla lista en ${ms} ms (${cantidad} fila(s)${cambio ? '' : ', sin cambio visible'})`);
      return { filas: cantidad, ms, cambio };
    }
    await new Promise(resolve => setTimeout(resolve, INTERVALO_MS));
  }
  throw new Error(`ATM no terminó de cargar los planes de "${impuesto}".`);
}

/**
 * Cuenta los planes con Estado "VIGENTE" del "Listado de Planes".
 * @returns {Promise<number>}
 */
async function contarFilasVigentes(page) {
  const frame = await frameOficina(page);
  await instalarLector(frame);
  const vigentes = await frame.evaluate(() => {
    const datos = window.__leerListadoPlanes();
    if (!datos || datos.columnaEstado < 0) return -1;
    return datos.filas.filter(f => {
      const celda = f.querySelectorAll('.z-listcell')[datos.columnaEstado];
      return celda && celda.textContent.trim().toUpperCase() === 'VIGENTE';
    }).length;
  });
  if (vigentes < 0) throw new Error('No se encontró la tabla "Listado de Planes" (o su columna Estado).');
  return vigentes;
}

/**
 * Cierra los carteles de ZK que haya (con el botón Aceptar/OK/Cerrar o la X) y devuelve sus textos.
 * Ej. Debora (2026-10-23): "LISTA DE ERRORES … plan creado para débito directo con adhesión activa…"
 * al elegir el plan: con el cartel abierto el clic en "Imprimir Constancia" no le llegaba a ATM.
 */
async function cerrarCarteles(frame) {
  const leidos = [];
  for (let intento = 0; intento < 3; intento++) {
    const texto = await frame.evaluate(() => {
      const visible = (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
      const cartel = Array.from(document.querySelectorAll('.z-window-modal, .z-messagebox-window, .z-window-highlighted')).find(visible);
      return cartel ? cartel.innerText.replace(/\s+/g, ' ').trim() : null;
    });
    if (!texto) break;
    leidos.push(texto);
    const cerro = await clicReal(frame, () => {
      const visible = (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
      const cartel = Array.from(document.querySelectorAll('.z-window-modal, .z-messagebox-window, .z-window-highlighted')).find(visible);
      if (!cartel) return null;
      return Array.from(cartel.querySelectorAll('.z-button, button'))
        .find(b => /^(aceptar|ok|cerrar|continuar)$/i.test(b.textContent.trim()))
        || cartel.querySelector('.z-window-close, .z-window-icon');
    });
    if (!cerro) await frame.page().keyboard.press('Escape').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return leidos;
}

/**
 * Selecciona el plan VIGENTE nº `indice` (desde 0), cierra el cartel que ATM muestre (si hay) y hace
 * clic REAL en "Imprimir Constancia" (mouse: el clic por código no siempre le llega a ZK).
 * @returns {Promise<{plan: string, avisos: string[]}>} número de plan y textos de los carteles cerrados
 */
async function descargarFilaVigentePorIndice(page, indice, enviarProgreso = () => {}) {
  const frame = await frameOficina(page);
  await instalarLector(frame);
  enviarProgreso('info', `Iniciando descarga para el plan de pago #${indice + 1}...`);

  const eleccion = await frame.evaluate((idx) => {
    const datos = window.__leerListadoPlanes();
    if (!datos || datos.columnaEstado < 0) return { ok: false, error: 'No se encontró la tabla "Listado de Planes".' };
    const vigentes = datos.filas.filter(f => {
      const celda = f.querySelectorAll('.z-listcell')[datos.columnaEstado];
      return celda && celda.textContent.trim().toUpperCase() === 'VIGENTE';
    });
    if (idx >= vigentes.length) return { ok: false, error: `Plan #${idx + 1} fuera de rango: hay ${vigentes.length} vigente(s).` };
    const celdas = vigentes[idx].querySelectorAll('.z-listcell');
    vigentes[idx].click();
    return { ok: true, plan: celdas[1] ? celdas[1].textContent.trim() : '' };
  }, indice);
  if (!eleccion.ok) throw new Error(eleccion.error);
  await new Promise(resolve => setTimeout(resolve, 1500));

  const avisos = await cerrarCarteles(frame);
  if (avisos.length) console.log(`[PlanDePago] plan ${eleccion.plan}: ATM avisó →`, avisos.join(' | '));

  // Esperar a que el botón esté a la vista y habilitado (al elegir el plan ATM lo rearma).
  await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-button'))
    .some(b => b.textContent.trim() === 'Imprimir Constancia' && !b.disabled && b.offsetParent !== null),
    { timeout: 10000, polling: INTERVALO_MS })
    .catch(() => { throw new Error('"Imprimir Constancia" no se habilitó después de elegir el plan.'); });
  const clic = await clicReal(frame, () => Array.from(document.querySelectorAll('.z-button'))
    .find(b => b.textContent.trim() === 'Imprimir Constancia' && !b.disabled && b.offsetParent !== null) || null);
  if (!clic) throw new Error('No se pudo hacer clic en "Imprimir Constancia".');

  // Un cartel que salga DESPUÉS del clic también se cierra (y se anota).
  await new Promise(resolve => setTimeout(resolve, 800));
  avisos.push(...await cerrarCarteles(frame));

  enviarProgreso('info', `Clic para descarga del plan #${indice + 1} completado.`);
  return { plan: eleccion.plan, avisos };
}

/**
 * Para el log cuando un PDF no llega: qué quedó en pantalla (carteles, estado del botón, fila elegida)
 * y qué pestañas hay abiertas.
 */
async function diagnosticarPantalla(page) {
  const frame = await frameOficina(page);
  const pantalla = await frame.evaluate(() => {
    const visible = (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
    const boton = Array.from(document.querySelectorAll('.z-button')).find(b => b.textContent.trim() === 'Imprimir Constancia');
    const elegida = document.querySelector('.z-listitem[aria-selected="true"], .z-listitem-selected');
    return {
      carteles: Array.from(document.querySelectorAll('.z-window-modal, .z-messagebox-window, .z-notification'))
        .filter(visible).map(w => w.innerText.replace(/\s+/g, ' ').slice(0, 200)),
      botonImprimir: boton ? { deshabilitado: !!boton.disabled, visible: visible(boton) } : 'no está',
      filaElegida: elegida ? elegida.innerText.replace(/\s+/g, ' ').slice(0, 160) : 'ninguna'
    };
  }).catch(e => ({ error: e.message }));
  const pestanas = (await page.browser().pages()).map(p => p.url());
  return { ...pantalla, pestanas };
}

module.exports = { elegirImpuesto, contarFilasVigentes, descargarFilaVigentePorIndice, leerListadoPlanes, diagnosticarPantalla };
