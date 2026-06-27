/**
 * KIT DE INSPECCIÓN PARA SCRAPING
 * ================================
 * El mismo código sirve en DOS lugares:
 *
 *  1) CONSOLA DEL NAVEGADOR (DevTools): copiás TODO este archivo, lo pegás,
 *     Enter, y después llamás a las funciones. Ej:  $inspect.full()
 *
 *  2) PUPPETEER (desde Node): inyectás el archivo en la página y lo llamás:
 *        await page.addScriptTag({ path: 'tools/scraping-inspector.js' });
 *        const informe = await page.evaluate(() => window.$inspect.full());
 *        console.log(JSON.stringify(informe, null, 2));
 *
 * Por qué funciona igual en los dos: lo que escribís en la consola ES el mismo
 * JavaScript que corre dentro de page.evaluate(). La única regla en Puppeteer:
 * devolvé SIEMPRE datos serializables (objetos/arrays/strings/números),
 * nunca un elemento del DOM ni una función.
 */

(function () {
  // --- helpers internos ---

  // Genera un selector "usable" para volver a encontrar el elemento después.
  function selectorDe(el) {
    if (el.id) return '#' + el.id;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    // fallback: nth-of-type dentro del padre
    const tag = el.tagName.toLowerCase();
    const padre = el.parentElement;
    if (!padre) return tag;
    const hermanos = [...padre.children].filter(h => h.tagName === el.tagName);
    const i = hermanos.indexOf(el) + 1;
    return `${tag}:nth-of-type(${i})`;
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  }

  function texto(el) {
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  const $inspect = {
    /** Todos los <select> con sus <option> (value + texto + cuál está seleccionada). */
    selects() {
      return [...document.querySelectorAll('select')].map(sel => ({
        selector: selectorDe(sel),
        name: sel.name || null,
        id: sel.id || null,
        visible: visible(sel),
        seleccionado: sel.value,
        opciones: [...sel.options].map(o => ({
          value: o.value,
          texto: texto(o),
          seleccionada: o.selected,
        })),
      }));
    },

    /** Todos los inputs / textarea con su tipo, name, placeholder y valor actual. */
    inputs() {
      return [...document.querySelectorAll('input, textarea')].map(el => ({
        selector: selectorDe(el),
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        valor: el.value,
        visible: visible(el),
        disabled: el.disabled,
      }));
    },

    /** Botones y cosas clickeables (button, input[type=submit/button], [role=button]). */
    botones() {
      const sel = 'button, input[type="submit"], input[type="button"], [role="button"]';
      return [...document.querySelectorAll(sel)].map(el => ({
        selector: selectorDe(el),
        texto: texto(el) || el.value || null,
        type: el.type || null,
        visible: visible(el),
        disabled: el.disabled,
      }));
    },

    /** Links (útil para ver navegación / menús). */
    links() {
      return [...document.querySelectorAll('a[href]')]
        .map(a => ({ selector: selectorDe(a), texto: texto(a), href: a.href, visible: visible(a) }))
        .filter(l => l.texto); // descarto links sin texto (iconos, etc.)
    },

    /** Formularios y a dónde apuntan. */
    forms() {
      return [...document.querySelectorAll('form')].map(f => ({
        selector: selectorDe(f),
        action: f.action || null,
        method: f.method || null,
        campos: f.elements.length,
      }));
    },

    /**
     * iframes de la página. Marca si son accesibles (mismo origen) o no.
     * Si son accesibles, intenta inspeccionar lo que tienen adentro.
     * OJO en Puppeteer: los iframes NO se manejan con evaluate sino con
     * page.frames() / frame.contentFrame() (ver nota al final del archivo).
     */
    iframes() {
      return [...document.querySelectorAll('iframe, frame')].map(f => {
        const info = {
          selector: selectorDe(f),
          src: f.src || null,
          name: f.name || null,
          visible: visible(f),
          accesible: false,
          contenido: null,
        };
        try {
          const doc = f.contentDocument; // tira error si es cross-origin
          if (doc) {
            info.accesible = true;
            info.contenido = {
              url: doc.location.href,
              selects: doc.querySelectorAll('select').length,
              inputs: doc.querySelectorAll('input, textarea').length,
              botones: doc.querySelectorAll('button, [role="button"]').length,
            };
          }
        } catch (e) {
          info.accesible = false; // cross-origin: bloqueado por el navegador
        }
        return info;
      });
    },

    /**
     * ESPÍA DE EVENTOS. Empieza a registrar qué se desencadena en la página:
     * - window.open  (popups reales / nuevas pestañas)
     * - cambios en el DOM  (modales / dropdowns / "ventanas" falsas que aparecen)
     * - fetch y XMLHttpRequest  (llamadas al servidor)
     * - navegación  (cambio de URL, pushState)
     *
     * Uso:
     *   $inspect.watch();      // 1) activás el espía
     *   // ...hacés el click a mano (consola) o con page.click (Puppeteer)...
     *   $inspect.report();     // 2) ves todo lo que pasó (array serializable)
     *   $inspect.stop();       // 3) lo apagás
     */
    watch() {
      if (window.__spy) return 'ya estaba activo, usá $inspect.report()';
      const log = [];
      const stamp = (tipo, datos) => log.push({ t: Date.now(), tipo, ...datos });

      // 1) popups reales
      const openOrig = window.open;
      window.open = function (url, ...rest) {
        stamp('window.open', { url: url || null });
        return openOrig.apply(this, [url, ...rest]);
      };

      // 2) DOM: nodos nuevos visibles (modales, dropdowns)
      const mo = new MutationObserver(muts => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) { // Element
              stamp('dom+', { tag: n.tagName.toLowerCase(), id: n.id || null, clase: n.className || null });
            }
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });

      // 3) red: fetch
      const fetchOrig = window.fetch;
      window.fetch = function (...args) {
        stamp('fetch', { url: String(args[0]) });
        return fetchOrig.apply(this, args);
      };

      // 3) red: XHR
      const xhrOrig = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        stamp('xhr', { method, url: String(url) });
        return xhrOrig.apply(this, [method, url, ...rest]);
      };

      // 4) navegación
      const pushOrig = history.pushState;
      history.pushState = function (...args) {
        stamp('navegacion', { url: String(args[2]) });
        return pushOrig.apply(this, args);
      };
      window.addEventListener('popstate', () => stamp('navegacion', { url: location.href }));

      window.__spy = {
        log,
        restore() {
          window.open = openOrig;
          window.fetch = fetchOrig;
          XMLHttpRequest.prototype.open = xhrOrig;
          history.pushState = pushOrig;
          mo.disconnect();
        },
      };
      return 'espía activo. Hacé tu click y después $inspect.report()';
    },

    /** Devuelve lo que registró el espía (array serializable). */
    report() {
      return window.__spy ? window.__spy.log : [];
    },

    /** Apaga el espía y deja todo como estaba. */
    stop() {
      if (window.__spy) { window.__spy.restore(); delete window.__spy; return 'espía apagado'; }
      return 'no había espía activo';
    },

    /** Informe completo, todo junto. Esto es lo que devolvés desde page.evaluate(). */
    full() {
      return {
        url: location.href,
        titulo: document.title,
        selects: this.selects(),
        inputs: this.inputs(),
        botones: this.botones(),
        links: this.links(),
        forms: this.forms(),
        iframes: this.iframes(),
      };
    },

    /** Versión "linda" para leer en la consola del navegador (tablas). */
    print() {
      console.log('%cURL:', 'font-weight:bold', location.href);
      console.group('SELECTS'); console.table(this.selects().map(s => ({ ...s, opciones: s.opciones.length }))); console.groupEnd();
      console.group('INPUTS'); console.table(this.inputs()); console.groupEnd();
      console.group('BOTONES'); console.table(this.botones()); console.groupEnd();
      return this.full();
    },
  };

  // Lo dejo accesible como global para llamarlo desde consola o desde evaluate.
  window.$inspect = $inspect;
})();

/*
 * ============================================================================
 * COSAS QUE NO SE PUEDEN HACER DESDE evaluate() — van en Node (Puppeteer)
 * ============================================================================
 *
 * 1) ESPIAR UN CLICK Y VER QUÉ DESENCADENA:
 *      await page.addScriptTag({ path: 'tools/scraping-inspector.js' });
 *      await page.evaluate(() => $inspect.watch());   // activo el espía
 *      await page.click('#miBoton');                  // disparo el click real
 *      await page.waitForTimeout(800);                // dejo que reaccione
 *      const eventos = await page.evaluate(() => $inspect.report());
 *      console.log(eventos);                          // qué pasó tras el click
 *
 * 2) POPUP REAL (window.open / target=_blank): NO aparece en evaluate.
 *    Lo agarrás con el evento de Puppeteer ANTES de hacer el click:
 *      const [popup] = await Promise.all([
 *        new Promise(r => page.once('popup', r)),     // espero la nueva ventana
 *        page.click('#abrePopup'),
 *      ]);
 *      await popup.waitForSelector('select');
 *      const informe = await popup.evaluate(() => $inspect.full());
 *
 * 3) IFRAME: no se inspecciona con page.evaluate, sino entrando al frame:
 *      const frame = page.frames().find(f => f.url().includes('parte-del-src'));
 *      // o:  const frame = await (await page.$('iframe')).contentFrame();
 *      const informe = await frame.evaluate(() => $inspect.full());
 *      // ojo: addScriptTag inyecta en el frame principal; para el iframe quizá
 *      // tengas que pegar el código con frame.evaluate de la función directa.
 *
 * Regla mental: evaluate() vive DENTRO de un documento. Popups e iframes son
 * OTROS documentos → se manejan desde Node con page/frame/popup.
 */
