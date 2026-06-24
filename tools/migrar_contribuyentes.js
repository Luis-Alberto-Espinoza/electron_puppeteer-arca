#!/usr/bin/env node
/**
 * Migración users.json (modelo viejo) → contribuyentes.json (modelo plano).
 * Tarea 6 de docs/modelo_cliente/plan_contribuyente_plano.md.
 *
 * - NO toca users.json (lo deja intacto; backup .bak por las dudas). Escribe un
 *   archivo NUEVO `contribuyentes.json` → cero big-bang, la app vieja sigue
 *   andando hasta que migremos cada flujo (Tareas 7-10).
 * - Idempotente: lee users.json y regenera la salida determinísticamente.
 * - Las empresas representadas SIN cuit no son migrables (sin PK) → van a un
 *   reporte `pendientes_cuit.json` para completarlas después.
 *
 * Uso:
 *   node tools/migrar_contribuyentes.js [carpeta_userData] [--dry]
 *   (default carpeta: ~/.config/afip_atm ; --dry = solo muestra, no escribe)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { normalizarContribuyente } = require('../src/backend/cliente/contribuyenteRepo.js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const DATA_DIR = args.find(a => !a.startsWith('--')) || path.join(os.homedir(), '.config', 'afip_atm');
const usersPath = path.join(DATA_DIR, 'users.json');
const outContrib = path.join(DATA_DIR, 'contribuyentes.json');
const outPend = path.join(DATA_DIR, 'pendientes_cuit.json');
const backupPath = path.join(DATA_DIR, 'users.json.bak');

const S = v => (v == null ? null : String(v));
const ESTADOS = new Set(['no_aplica', 'pendiente', 'validado', 'invalido', 'requiere_actualizacion']);

/** Persona física por prefijo de CUIT (20/23/24/27) vs jurídica (30/33/34). */
function tipoPorCuit(cuit) {
    return ['30', '33', '34'].includes(String(cuit).slice(0, 2)) ? 'juridica' : 'fisica';
}

/** Deriva el estado nuevo (enum) desde lo viejo (estado string + bool valida). */
function estadoDe(clave, estadoViejo, valida) {
    if (!clave) return 'no_aplica';
    if (ESTADOS.has(estadoViejo) && estadoViejo !== 'no_aplica') return estadoViejo;
    if (valida === true) return 'validado';
    if (valida === false) return 'invalido';
    return 'pendiente';
}

/** ¿La empresa embebida es la propia persona? (mismo cuit, o razón social ~ nombre). */
function pareceSelf(u, e) {
    const ec = S(e.cuit);
    if (ec && ec === S(u.cuit)) return true;
    if (ec) return false; // tiene cuit distinto → no es self
    const rs = (e.razonSocial || '').toUpperCase().replace(/[^A-Z]/g, '');
    const a = ((u.apellido || '') + (u.nombre || '')).toUpperCase().replace(/[^A-Z]/g, '');
    const b = ((u.nombre || '') + (u.apellido || '')).toUpperCase().replace(/[^A-Z]/g, '');
    return !!rs && (rs.includes(a) || rs.includes(b) || a.includes(rs));
}

/** Une PDV de dos listas por número (sin duplicar). */
function unionPdv(a, b) {
    const map = new Map();
    for (const p of [...(a || []), ...(b || [])]) {
        if (p && p.numero != null) map.set(String(p.numero), p);
    }
    return [...map.values()];
}

/** Merge de dos personas con el MISMO cuit (los 2 top-level repetidos). */
function mergePersona(a, b) {
    const preferEstado = (e1, e2) => (e1 === 'validado' ? e1 : (e2 === 'validado' ? e2 : (e1 && e1 !== 'no_aplica' ? e1 : e2)));
    return normalizarContribuyente({
        ...a,
        razonSocial: (b.razonSocial || '').length > (a.razonSocial || '').length ? b.razonSocial : a.razonSocial,
        claveAFIP: a.claveAFIP || b.claveAFIP,
        estado_afip: preferEstado(a.estado_afip, b.estado_afip),
        claveATM: a.claveATM || b.claveATM,
        estado_atm: preferEstado(a.estado_atm, b.estado_atm),
        tipoContribuyente: a.tipoContribuyente || b.tipoContribuyente,
        representanteAfipCuit: a.representanteAfipCuit || b.representanteAfipCuit,
        puntosDeVenta: unionPdv(a.puntosDeVenta, b.puntosDeVenta)
    });
}

function migrar() {
    const data = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const U = Array.isArray(data.users) ? data.users : [];
    const mapa = new Map();      // cuit -> contribuyente
    const pendientes = [];       // representadas sin cuit
    const log = { personas: 0, dupTopLevel: 0, representadas: 0, fundidas: 0, pendientes: 0 };

    // ── Pass 1: personas / top-level ────────────────────────────────────────
    for (const u of U) {
        const cuit = S(u.cuit);
        if (!cuit) continue;
        const selfEmp = (u.empresas || []).find(e => pareceSelf(u, e));
        const razon = (selfEmp && selfEmp.razonSocial)
            || [u.apellido, u.nombre].filter(Boolean).join(' ').trim()
            || u.nombre || '';

        const c = normalizarContribuyente({
            id: u.id,
            cuit,
            tipo: tipoPorCuit(cuit),
            razonSocial: razon,
            nombre: u.nombre || null,
            apellido: u.apellido || null,
            cuil: u.cuil || null,
            tipoContribuyente: u.tipoContribuyente || null,
            claveAFIP: u.claveAFIP || null,
            estado_afip: estadoDe(u.claveAFIP, u.estado_afip, u.claveAfipValida),
            errorAfip: u.errorAfip || null,
            claveATM: u.claveATM || null,
            estado_atm: estadoDe(u.claveATM, u.estado_atm, u.claveAtmValida),
            errorAtm: u.errorAtm || null,
            puntosDeVenta: (selfEmp && selfEmp.puntosDeVenta) || [],
            puntosDeVentaActualizados: (selfEmp && selfEmp.puntosDeVentaActualizados) || null,
            fechaCreacion: u.fechaCreacion || null,
            fechaModificacion: u.fechaModificacion || null
        });

        if (mapa.has(cuit)) { mapa.set(cuit, mergePersona(mapa.get(cuit), c)); log.dupTopLevel++; }
        else { mapa.set(cuit, c); log.personas++; }
    }

    // ── Pass 2: empresas representadas CON cuit ──────────────────────────────
    for (const u of U) {
        for (const e of (u.empresas || [])) {
            const ec = S(e.cuit);
            if (!ec || ec === S(u.cuit)) continue; // self o sin cuit → no acá

            const previo = mapa.get(ec);           // ¿ya existe como suelto? (LANDES/OHR/EL PAPI)
            const base = previo || normalizarContribuyente({ cuit: ec, tipo: 'juridica', razonSocial: e.razonSocial });

            base.tipo = 'juridica';
            base.razonSocial = e.razonSocial || base.razonSocial;  // nombre formal del embebido
            base.representanteAfipCuit = S(u.cuit);
            // Decisión 1: la empresa entra a AFIP por su representante → sin clave AFIP propia.
            base.claveAFIP = null;
            base.estado_afip = 'no_aplica';
            base.errorAfip = null;
            // claveATM: la del suelto (validada) manda; si no hay, la del embebido.
            base.claveATM = base.claveATM || e.claveATM || null;
            if (!base.claveATM) base.estado_atm = 'no_aplica';
            base.puntosDeVenta = unionPdv(base.puntosDeVenta, e.puntosDeVenta);

            mapa.set(ec, normalizarContribuyente(base));
            if (previo) log.fundidas++; else log.representadas++;
        }
    }

    // ── Pass 3: representadas SIN cuit → pendientes ──────────────────────────
    for (const u of U) {
        for (const e of (u.empresas || [])) {
            if (S(e.cuit) || pareceSelf(u, e)) continue;
            pendientes.push({
                representanteCuit: S(u.cuit),
                representante: [u.nombre, u.apellido].filter(Boolean).join(' ').trim(),
                razonSocial: e.razonSocial || null
            });
            log.pendientes++;
        }
    }

    const contribuyentes = [...mapa.values()];

    // ── Salida ───────────────────────────────────────────────────────────────
    console.log('Carpeta:', DATA_DIR);
    console.log('Entrada: users.json con', U.length, 'usuarios');
    console.log('Resultado:');
    console.log('  contribuyentes generados :', contribuyentes.length);
    console.log('    · personas/top-level    :', log.personas);
    console.log('    · top-level fundidos     :', log.dupTopLevel, '(CUIT repetido)');
    console.log('    · representadas nuevas   :', log.representadas);
    console.log('    · fundidas suelto+repr   :', log.fundidas, '(LANDES/OHR/EL PAPI)');
    console.log('  con representanteAfipCuit  :', contribuyentes.filter(c => c.representanteAfipCuit).length);
    console.log('  pendientes (sin cuit)      :', log.pendientes, '→ pendientes_cuit.json');

    if (DRY) { console.log('\n[--dry] No se escribió nada.'); return; }

    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(usersPath, backupPath);
        console.log('\nBackup creado:', backupPath);
    } else {
        console.log('\nBackup ya existía (no se pisa):', backupPath);
    }
    fs.writeFileSync(outContrib, JSON.stringify({ contribuyentes }, null, 2), 'utf8');
    fs.writeFileSync(outPend, JSON.stringify({ pendientes }, null, 2), 'utf8');
    console.log('Escrito:', outContrib);
    console.log('Escrito:', outPend);
    console.log('\nusers.json quedó INTACTO. La app vieja sigue funcionando.');
}

migrar();
