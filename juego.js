/* ================================================================
   OPERACIÓN ORO NEGRO · juego.js  (fase 1: presentación y etapas 1-3)
   Motor del juego: pantallas, partida guardada, GPS, mapa, sonido,
   cámara (falsa RA), partitura, rotor e inventario.
   ================================================================ */
(function () {
'use strict';

const $ = id => document.getElementById(id);
const app = $('app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/* ================= PARTIDA (se guarda en el móvil y en el Worker) ================= */
const CLAVE_LS = 'oroNegro.partida';
let S = null;
try { S = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); } catch (_) { S = null; }

function nuevaPartida() {
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  S = {
    id, version: CONFIG.VERSION,
    clave: NOMBRES_CLAVE[Math.floor(Math.random() * NOMBRES_CLAVE.length)],
    silueta: 'hombre', pantalla: 'P2', etapa: 0, historial: [],
    inventario: [], cuaderno: [], fallos: {}, pistas: {},
    permisos: {}, inicio: Date.now(), vistoApertura: !!(S && S.vistoApertura),
  };
  guardar(true);
}
let tGuardar = 0;
function guardar(inmediato) {
  if (!S) return;
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(S)); } catch (_) {}
  if (!CONFIG.WORKER_URL) return;
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => {
    fetch(CONFIG.WORKER_URL.replace(/\/$/, '') + '/partida/' + encodeURIComponent(S.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S),
    }).catch(() => {});
  }, inmediato ? 0 : 1500);
}
function inv(id, nombre, detalle) {
  if (!S.inventario.some(o => o.id === id)) S.inventario.push({ id, nombre, detalle: detalle || '' });
  guardar();
}
const tiene = id => S && S.inventario.some(o => o.id === id);

/* ================= COMPROBAR RESPUESTAS ================= */
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-ZÑ0-9]/g, '');
}
async function sha256(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function validar(prueba, respuesta) {
  const r = norm(respuesta);
  if (CONFIG.WORKER_URL) {
    try {
      const res = await fetch(CONFIG.WORKER_URL.replace(/\/$/, '') + '/validar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: S.id, prueba, respuesta: r }),
      });
      if (res.ok) { const j = await res.json(); return !!j.ok; }
    } catch (_) { /* sin conexión: se comprueba en el móvil */ }
  }
  try { return (HUELLAS[prueba] || []).includes(await sha256('oronegro:' + prueba + ':' + r)); }
  catch (_) { return false; }
}

/* ================= SONIDO ================= */
let actx = null;
function audio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (_) {}
  return actx;
}
function interferencia(dur = 2) {
  const c = audio(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / c.sampleRate, corte = (Math.sin(t * 23) > 0.6 || Math.random() < 0.002) ? 2.4 : 1;
    d[i] = (Math.random() * 2 - 1) * corte * (0.55 + 0.45 * Math.sin(t * 9));
  }
  const s = c.createBufferSource(); s.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
  const g = c.createGain(); const t0 = c.currentTime;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.08); g.gain.setValueAtTime(0.5, t0 + dur - 0.3); g.gain.linearRampToValueAtTime(0, t0 + dur);
  s.connect(bp).connect(g).connect(c.destination); s.start();
  // pitido de sintonía
  const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(900, t0 + 0.3); o.frequency.exponentialRampToValueAtTime(1400, t0 + 0.9);
  og.gain.setValueAtTime(0, t0 + 0.3); og.gain.linearRampToValueAtTime(0.08, t0 + 0.35); og.gain.linearRampToValueAtTime(0, t0 + 0.95);
  o.connect(og).connect(c.destination); o.start(t0 + 0.3); o.stop(t0 + 1);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
function clic() {
  const c = actx; if (!c) return;
  const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = 900; g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.03);
}
const NOTAS = [['MI', 329.63], ['RE', 293.66], ['LA', 440.00], ['SOL', 392.00], ['LA', 440.00]];
const DUR = [0.5, 0.5, 0.5, 0.5, 1.1];
let timersMelodia = [];
function melodia(alSonar, veces = 2) {
  const c = audio(); if (!c) return 0;
  timersMelodia.forEach(clearTimeout); timersMelodia = [];
  let t = c.currentTime + 0.3, ms = 300;
  for (let rep = 0; rep < veces; rep++) {
    NOTAS.forEach(([, f], i) => {
      [1, 2, 3].forEach((arm, ai) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = ai ? 'sine' : 'triangle'; o.frequency.value = f * arm;
        const v = [0.22, 0.06, 0.03][ai];
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + DUR[i] * 1.6);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + DUR[i] * 1.7);
      });
      if (alSonar) { const k = i; timersMelodia.push(setTimeout(() => alSonar(k), ms)); }
      t += DUR[i]; ms += DUR[i] * 1000;
    });
    t += 0.8; ms += 800;
  }
  if (alSonar) timersMelodia.push(setTimeout(() => alSonar(-1), ms));
  return ms;
}
function hablar(texto) { // voz provisional del propio teléfono (si la tiene)
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(texto.replace(/[«»]/g, '')); u.lang = 'es-ES'; u.rate = 0.95; speechSynthesis.speak(u); } catch (_) {}
}

/* ================= GPS ================= */
let pos = null, vigiaId = null;
const oyentesGPS = new Set();
function iniciarGPS() {
  if (vigiaId !== null || !('geolocation' in navigator)) return;
  vigiaId = navigator.geolocation.watchPosition(p => {
    pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    oyentesGPS.forEach(f => { try { f(pos); } catch (_) {} });
  }, e => { if (e.code === 1) { S.permisos.ubicacion = false; guardar(); } }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}
function distancia(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function rumbo(a, b) {
  const r = x => x * Math.PI / 180, y = Math.sin(r(b.lon - a.lon)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lon - a.lon));
  return ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'][Math.round(((Math.atan2(y, x) * 180 / Math.PI + 360) % 360) / 45) % 8];
}
const dentro = (p, lugar) => p && distancia(p, lugar) <= CONFIG.RADIO_GEOVALLA + Math.min(p.acc || 0, 20);

/* ================= PANTALLAS: navegación ================= */
let limpiezas = [];
function alSalir(f) { limpiezas.push(f); }
function limpiar() { limpiezas.forEach(f => { try { f(); } catch (_) {} }); limpiezas = []; timersMelodia.forEach(clearTimeout); timersMelodia = []; try { speechSynthesis.cancel(); } catch (_) {} }
function ir(id, opc) {
  if (id === 'E4_1') id = 'FIN1';
  limpiar();
  S.historial = S.historial || [];
  const vengoDe = S.pantalla;
  if (!(opc && opc.atras) && vengoDe && vengoDe !== id && !/^P[12]$/.test(id) && vengoDe !== 'P1') {
    S.historial.push(vengoDe); if (S.historial.length > 60) S.historial.shift();
    try { history.pushState({ oro: 1 }, ''); } catch (_) {}
  }
  S.pantalla = id; if (!/^P[12]$/.test(id)) S.pantallaGuardada = id; guardar();
  const f = PANT[id] || PANT.P2;
  const enPresentacion = /^P(1|2)$/.test(id);
  $('barra').hidden = enPresentacion;
  $('bAtras').hidden = !S.historial.length;
  const m = id.match(/^E(\d+)|^R(\d+)/);
  $('barraT').textContent = m ? 'Oro Negro · Etapa ' + (m[1] || m[2]) : (id === 'FIN1' ? 'Oro Negro' : 'Oro Negro · Presentación');
  document.documentElement.classList.toggle('oscuro', id === 'P1');
  app.innerHTML = ''; window.scrollTo(0, 0);
  f();
}
function pinta(html) { app.innerHTML = html; }
const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', f); };

/* Piezas de interfaz */
const prov = (t, osc) => `<div class="prov${osc ? ' osc' : ''}">${esc(t)}</div>`;
const voz = (quien, texto, id) => `<div class="voz"><span><b>${esc(quien)}</b> · voz provisional</span><button class="btn2" id="${id}">Escuchar</button></div>`;
function conVoz(id, texto) { on(id, () => hablar(texto)); }
const chip = (t, cls) => `<span class="chip ${cls || ''}">${esc(t)}</span>`;
const aviso = (cls, tit, txt) => `<div class="aviso ${cls}"><b>${esc(tit)}</b>${esc(txt)}</div>`;

/* ================= MAPA ================= */
function crearMapa(div, destino, conRuta) {
  if (!window.L) { div.innerHTML = prov('MAPA (sin conexión): ' + destino.nombre); return null; }
  const m = L.map(div, { zoomControl: false, attributionControl: true }).setView([destino.lat, destino.lon], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  L.circleMarker([destino.lat, destino.lon], { radius: 10, color: '#9a4a12', weight: 3, fillColor: '#f0a040', fillOpacity: 0.9 }).addTo(m).bindTooltip(destino.nombre, { permanent: true, direction: 'top', offset: [0, -10] });
  let yo = null, linea = null;
  const act = p => {
    if (!p) return;
    if (!yo) yo = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2b6fd6', fillOpacity: 1 }).addTo(m);
    else yo.setLatLng([p.lat, p.lon]);
    if (conRuta) {
      const pts = [[p.lat, p.lon], [destino.lat, destino.lon]];
      if (!linea) { linea = L.polyline(pts, { color: '#9a4a12', weight: 4, dashArray: '8 8' }).addTo(m); m.fitBounds(pts, { padding: [40, 40], maxZoom: 18 }); }
      else linea.setLatLngs(pts);
    }
  };
  act(pos); oyentesGPS.add(act);
  alSalir(() => { oyentesGPS.delete(act); m.remove(); });
  setTimeout(() => m.invalidateSize(), 200);
  return m;
}

/* ================= VOLVER ATRÁS ================= */
function atras() {
  if (!$('modal').hidden) { $('mCerrar').click(); return; }
  const prev = S.historial && S.historial.pop();
  ir(prev || 'P2', { atras: true });
}
$('bAtras').onclick = () => atras();
// La flecha «atrás» del móvil o del navegador también retrocede dentro del juego
window.addEventListener('popstate', () => atras());

/* ================= MODALES: mapa e inventario ================= */
function modal(html, alAbrir) {
  $('modalHoja').innerHTML = html + '<button class="btn sec" id="mCerrar">Cerrar</button>';
  $('modal').hidden = false;
  const cerrar = () => { $('modal').hidden = true; if (modalLimpiar) { modalLimpiar(); modalLimpiar = null; } };
  $('mCerrar').onclick = cerrar; $('modal').onclick = e => { if (e.target.id === 'modal') cerrar(); };
  if (alAbrir) alAbrir();
}
let modalLimpiar = null;
function destinoActual() { const n = Math.min(10, Math.max(1, S.etapa || 1)); return { n, ...LUGARES[n] }; }
$('bMapa').onclick = () => {
  const d = destinoActual();
  modal(`<div class="eti">Mapa · etapa ${d.n}</div><h2>${esc(d.nombre)}</h2><div class="mapa" id="mMapa"></div><p class="peq">${esc(d.punto)}</p>`, () => {
    const prevLimp = limpiezas.length;
    crearMapa($('mMapa'), d, true);
    const mias = limpiezas.splice(prevLimp);
    modalLimpiar = () => mias.forEach(f => f());
  });
};
$('bInv').onclick = () => {
  const items = S.inventario.map(o => `<div><b>${esc(o.nombre)}</b>${o.detalle ? `<span class="peq">${esc(o.detalle)}</span>` : ''}</div>`).join('') || '<p class="peq">Todavía no lleva nada.</p>';
  const cuad = S.cuaderno.length ? `<div class="caja"><div class="eti">Cuaderno de frecuencias</div>${S.cuaderno.map(c => `<div style="font-family:var(--mono)">${c.f} · ${esc(c.nombre)}</div>`).join('')}</div>` : '';
  modal(`<div class="eti">Inventario · Agente ${esc(S.clave)}</div><div class="inv">${items}</div>${cuad}`);
};

/* ================= RUTA genérica hacia la etapa n ================= */
function pantallaRuta(n, textoExtra) {
  const L_ = LUGARES[n];
  S.etapa = n; guardar();
  pinta(`
    <div class="eti">Destino · etapa ${n}</div><h1>${esc(L_.nombre)}</h1>
    <div class="mapa" id="mapa"></div>
    <div class="datos"><div><span class="eti">Distancia</span><b id="dist">—</b></div><div><span class="eti">A pie</span><b id="min">—</b></div></div>
    <p id="txtRuta">Camine hasta ${esc(L_.nombre)}. Cuando llegue oirá la interferencia y empezará la misión.</p>
    ${textoExtra || ''}
    <button class="btn sec" id="aqui">Ya estoy aquí (sin GPS)</button>
    <p class="peq">Entre edificios el GPS puede fallar varios metros.</p>`);
  iniciarGPS();
  crearMapa($('mapa'), L_, true);
  let llegado = false;
  const act = p => {
    const d = distancia(p, L_); $('dist').textContent = d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
    $('min').textContent = Math.max(1, Math.round(d / 75)) + ' min';
    if (!llegado && dentro(p, L_)) { llegado = true; interferencia(); ir('E' + n + '_1'); }
  };
  if (pos) act(pos);
  oyentesGPS.add(act); alSalir(() => oyentesGPS.delete(act));
  on('aqui', () => { audio(); interferencia(); ir('E' + n + '_1'); });
}

/* Pantalla «aviso de misión» común */
function pantallaAviso(n, tit, txt, sig) {
  S.etapa = n; guardar();
  pinta(`
    <div class="mi6"><div class="eti">Transmisión entrante · MI6</div><h2 style="color:#fff">${esc(tit)}</h2>
    <p class="cita" style="color:#e8e1d0">${esc(txt)}</p></div>
    ${voz('Control (MI6)', txt, 'vAviso')}
    <div class="mapa" id="mapa" style="height:200px"></div>
    <button class="btn" id="sig">Empezar misión</button>`);
  conVoz('vAviso', txt);
  crearMapa($('mapa'), LUGARES[n], false);
  on('sig', () => ir(sig));
}

/* Comprobación de ubicación en la pantalla «colóquese» (con alternativa A1) */
function vigilarPunto(n, chipId, distId) {
  const L_ = LUGARES[n];
  const act = p => {
    const c = $(chipId); if (!c) return;
    if (dentro(p, L_)) { c.className = 'chip ok'; c.textContent = 'Ubicación correcta'; if ($(distId)) $(distId).textContent = ''; }
    else { c.className = 'chip warn'; c.textContent = 'Fuera del punto'; if ($(distId)) $(distId).textContent = `Está a ${Math.round(distancia(p, L_))} m. Camine hacia el ${rumbo(p, L_)}.`; }
  };
  iniciarGPS(); if (pos) act(pos); oyentesGPS.add(act); alSalir(() => oyentesGPS.delete(act));
}

/* ================= PANTALLAS ================= */
const PANT = {};

/* ---------- PRESENTACIÓN ---------- */
PANT.P1 = () => { // Apertura (vídeo provisional: subtítulos de la voz en off)
  const frases = TXT.vozEnOff.match(/[^.]+\./g).map(s => s.trim());
  pinta(`
    ${prov('VÍDEO DE APERTURA (provisional). Secuencia de fotos e ilustraciones de época en sepia: mapa de Europa en guerra · tanques y cañones · mineral de wolframio · bocamina y mineros · Verín en 1942 · sacos y camiones · sombras de espías · título.', true)}
    <div class="caja" style="background:#000;color:#fff;border:0;min-height:120px;font:16px/1.5 var(--serif);display:flex;align-items:center;justify-content:center;text-align:center" id="subt"></div>
    <div class="fila"><button class="btn2" id="voz">Escuchar voz (provisional)</button><span style="flex:1"></span><button class="btn2" id="saltar">Saltar ›</button></div>`);
  let i = 0; const sub = $('subt');
  const paso = () => { if (i < frases.length) { sub.textContent = frases[i++]; t = setTimeout(paso, Math.max(2600, frases[i - 1].length * 70)); } else fin(); };
  let t = setTimeout(paso, 300);
  const fin = () => { S.vistoApertura = true; guardar(); ir('P2'); };
  alSalir(() => clearTimeout(t));
  on('voz', () => hablar(TXT.vozEnOff));
  on('saltar', fin);
};

PANT.P2 = () => { // Portada
  const hay = !!(S && S.pantallaGuardada && !/^P[12]$/.test(S.pantallaGuardada));
  pinta(`
    ${prov('IMAGEN DE PORTADA (provisional): Verín en los años 40, en sepia; sacos de carbón y una silueta de mujer con sombrero.')}
    <h1 style="font-size:36px">Operación<br>Oro Negro</h1>
    <p>${esc(TXT.portada)}</p>
    <button class="btn" id="empezar">Empezar</button>
    <button class="btn osc" id="seguir" ${hay ? '' : 'disabled'}>Continuar partida</button>
    ${hay ? `<p class="peq">Partida guardada: agente ${esc(S.clave)}, etapa ${S.etapa || 0}.</p>` : ''}
    <button class="enlace" id="intro" style="text-align:center">Ver la introducción</button>`);
  on('empezar', () => {
    audio();
    if (hay && !confirmarNueva()) return;
    nuevaPartida(); ir('P3');
  });
  on('seguir', () => { audio(); ir(S.pantallaGuardada); });
  on('intro', () => { audio(); ir('P1'); });
};
function confirmarNueva() { return true; } // (la portada solo ofrece «Continuar» si hay partida; «Empezar» crea una nueva)

PANT.P3 = () => {
  pinta(`
    <div class="fila"><span class="eti">MI6 · Londres</span><span style="flex:1"></span><span class="chip" style="color:#a62b22;border-color:#a62b22">ALTO SECRETO</span></div>
    <h1>Su misión, agente</h1>
    ${voz('Control (MI6)', '', 'v')}
    <p class="cita">${esc(TXT.encargo1)}</p><p class="cita"><b>${esc(TXT.encargo2)}</b></p>
    ${prov('IMAGEN (provisional): mineral de wolframio (negro y brillante) junto a un saco de carbón; sello del MI6.')}
    <button class="btn" id="sig">Continuar</button>`);
  conVoz('v', TXT.encargo1 + ' ' + TXT.encargo2); on('sig', () => ir('P4'));
};

PANT.P4 = () => {
  pinta(`
    <span class="eti">MI6 · Londres</span><h1>Aliados y enemiga</h1>
    ${voz('Control (MI6)', '', 'v')}
    ${aviso('ok', 'Sus aliados', TXT.aliados)}
    <div class="aviso mal" style="display:grid;grid-template-columns:96px 1fr;gap:12px">
      <div class="prov" style="min-height:120px;font-size:11px">Silueta de mujer con sombrero (sin rostro)</div>
      <div><b>Su enemiga</b><div style="font:700 18px/1.2 var(--serif);color:var(--tinta)">Greta von Clausewitz</div><p style="color:var(--tinta);font-size:14px">${esc(TXT.enemigaDesc)}</p></div>
    </div>
    <p class="cita" style="font-style:italic">${esc(TXT.enemigaAviso)}</p>
    <button class="btn" id="sig">Continuar</button>`);
  conVoz('v', TXT.aliados + ' Su enemiga: Greta von Clausewitz. ' + TXT.enemigaDesc + ' ' + TXT.enemigaAviso);
  on('sig', () => ir('P5'));
};

const SILUETA = {
  hombre: '<svg viewBox="0 0 60 80"><circle cx="30" cy="20" r="11" fill="#6b6357"/><path d="M8 80c0-20 10-32 22-32s22 12 22 32z" fill="#6b6357"/><rect x="17" y="6" width="26" height="5" rx="2" fill="#4a443c"/><rect x="21" y="0" width="18" height="8" rx="2" fill="#4a443c"/></svg>',
  mujer: '<svg viewBox="0 0 60 80"><circle cx="30" cy="22" r="10" fill="#6b6357"/><path d="M10 80c0-18 9-30 20-30s20 12 20 30z" fill="#6b6357"/><ellipse cx="30" cy="12" rx="17" ry="4" fill="#4a443c"/><ellipse cx="30" cy="9" rx="9" ry="5" fill="#4a443c"/></svg>',
};
PANT.P5 = () => {
  pinta(`
    <span class="eti">Su credencial</span><h1>Su nombre en clave</h1>
    <div class="cred"><div class="foto" id="foto">${SILUETA[S.silueta]}</div>
      <div><div class="eti">Secret Intelligence Service</div><div>MI6 · Reino Unido</div><br>
      <div class="eti">Agente</div><div class="clave">${esc(S.clave)}</div><br>
      <div class="eti">Destino</div><div>Verín (Ourense)</div></div>
      <div style="grid-column:1/-1"><b>Misión: Operación Oro Negro</b><br><span class="peq">Nombre asignado al azar entre 15 posibles.</span></div></div>
    <span class="eti">Foto de su credencial</span>
    <div class="seg"><button id="sH" class="${S.silueta === 'hombre' ? 'on' : ''}">Hombre</button><button id="sM" class="${S.silueta === 'mujer' ? 'on' : ''}">Mujer</button></div>
    <p class="peq">Solo cambia la silueta de la credencial y del diploma.</p>
    <button class="btn" id="sig">Aceptar misión</button>
    <p class="cita" style="font-style:italic;text-align:center;color:var(--gris)">«Su primer contacto le espera en el Hotel Café Aurora.»</p>`);
  const elegir = s => { S.silueta = s; guardar(); $('foto').innerHTML = SILUETA[s]; $('sH').className = s === 'hombre' ? 'on' : ''; $('sM').className = s === 'mujer' ? 'on' : ''; };
  on('sH', () => elegir('hombre')); on('sM', () => elegir('mujer'));
  on('sig', () => { inv('credencial', 'Credencial MI6 · Agente ' + S.clave, 'Secret Intelligence Service. Destino: Verín.'); ir('P6'); });
};

PANT.P6 = () => {
  pinta(`
    <h1>Cómo se juega</h1>
    <ol class="lista-num">${TXT.comoSeJuega.map((t, i) => `<li><i>${i + 1}</i><span>${esc(t)}</span></li>`).join('')}</ol>
    <div class="caja"><div class="eti">Este sonido anuncia una misión</div><br>
      <button class="btn2" id="oir">Escuchar el aviso</button>
      <p class="peq" style="margin-top:8px">Cuando lo oiga, mire el móvil: ha llegado a un punto de la misión.</p></div>
    <p class="peq">Lleve la batería cargada y el volumen alto. Con auriculares se oye mejor.</p>
    <button class="btn" id="sig">Siguiente</button>`);
  on('oir', () => interferencia()); on('sig', () => ir('P7'));
};

PANT.P7 = () => {
  pinta(`
    <h1>Antes de salir a la calle</h1>
    <p>Para cumplir su misión, el juego necesita cuatro permisos. Su teléfono se los pedirá ahora, uno a uno.</p>
    ${TXT.permisos.map(([k, v]) => `<div class="caja"><b>${esc(k)}</b><p class="peq" style="color:var(--tinta)">${esc(v)}</p></div>`).join('')}
    <button class="btn" id="dar">Dar permisos</button>
    <p class="peq" style="text-align:center">Puede cambiarlos cuando quiera en los Ajustes del teléfono.</p>`);
  on('dar', async () => {
    $('dar').disabled = true; $('dar').textContent = 'Pidiendo permisos…';
    audio();
    // P8 · ubicación
    S.permisos.ubicacion = await new Promise(res => {
      if (!('geolocation' in navigator)) return res(false);
      navigator.geolocation.getCurrentPosition(() => res(true), e => res(e.code !== 1), { enableHighAccuracy: true, timeout: 15000 });
    });
    // P9 · cámara  ·  P10 · micrófono
    const pedir = async c => { try { const st = await navigator.mediaDevices.getUserMedia(c); st.getTracks().forEach(t => t.stop()); return true; } catch (e) { return false; } };
    S.permisos.camara = navigator.mediaDevices ? await pedir({ video: { facingMode: 'environment' } }) : false;
    S.permisos.microfono = navigator.mediaDevices ? await pedir({ audio: true }) : false;
    guardar();
    if (S.permisos.ubicacion) iniciarGPS();
    ir(S.permisos.ubicacion && S.permisos.camara && S.permisos.microfono ? 'P12' : 'P11');
  });
};

PANT.P11 = () => {
  const faltan = [['ubicacion', 'ubicación'], ['camara', 'cámara'], ['microfono', 'micrófono']].filter(([k]) => !S.permisos[k]).map(([, v]) => v);
  pinta(`
    ${chip('Falta un permiso', 'warn')}
    <h2>Sin ${esc(faltan.join(' / ') || 'algún permiso')} el juego pierde parte de su magia</h2>
    <p>Puede activarlo ahora en los Ajustes del teléfono o seguir jugando en modo manual.</p>
    <div class="caja"><div class="eti">En modo manual</div>${TXT.manual.map(([k, v]) => `<p style="margin-top:6px"><b>${esc(k)}</b> ${esc(v)}</p>`).join('')}</div>
    <div class="caja"><div class="eti">Cómo activarlo</div>
      <p style="margin-top:6px"><b>Android (Chrome):</b> toque el icono a la izquierda de la dirección → Permisos → active el que falta. Si no aparece: Ajustes del móvil → Aplicaciones → Chrome → Permisos.</p>
      <p style="margin-top:6px"><b>iPhone (Safari):</b> toque «aA» en la barra de dirección → Configuración del sitio web → permita el que falta.</p></div>
    <button class="btn" id="otra">Ya lo he activado: volver a probar</button>
    <button class="btn sec" id="manual">Seguir en modo manual</button>`);
  on('otra', () => ir('P7')); on('manual', () => { iniciarGPS(); ir('P12'); });
};

PANT.P12 = () => {
  pantallaRuta(1, `<div>${chip('Credencial MI6 · Agente ' + S.clave + ' · nuevo', 'ok')}</div>`);
};

/* ---------- RUTAS ---------- */
PANT.R1 = () => pantallaRuta(1);
PANT.R2 = () => pantallaRuta(2);
PANT.R3 = () => pantallaRuta(3);
PANT.R4 = () => pantallaRuta(4);

/* ---------- ETAPA 1 · HOTEL CAFÉ AURORA ---------- */
PANT.E1_1 = () => pantallaAviso(1, E1.titulo, E1.aviso, 'E1_2');

PANT.E1_2 = () => {
  pinta(`
    <span class="eti">Punto de observación</span><h1>Colóquese frente a la cristalera del café</h1>
    ${prov(E1.fotoPunto)}
    <ol class="lista-num">${E1.pasos.map((t, i) => `<li><i>${i + 1}</i><span>${esc(t)}</span></li>`).join('')}</ol>
    <div><span class="chip" id="chipU">Buscando ubicación…</span> <span class="peq" id="distU"></span></div>
    <button class="btn" id="cam">Activar cámara</button>
    <button class="btn sec" id="aqui">Ya estoy aquí: continuar sin GPS</button>
    <p class="peq">La primera vez, el teléfono pedirá permiso para usar la cámara.</p>`);
  vigilarPunto(1, 'chipU', 'distU');
  on('cam', () => ir('E1_3')); on('aqui', () => ir('E1_3'));
};

/* Falsa RA del Aurora: cámara + marco ajustable + vídeo del café en la cristalera */
const MARCO0 = { x: 0.12, y: 0.34, w: 0.76, h: 0.285 };   // cristalera apaisada ≈ 2:1
function cargarMarco() { try { const m = JSON.parse(localStorage.getItem('oroNegro.marcoAurora') || 'null'); if (m && m.w > 0.05) return m; } catch (_) {} return { ...MARCO0 }; }
function guardarMarco(m) { try { localStorage.setItem('oroNegro.marcoAurora', JSON.stringify(m)); } catch (_) {} }
let vidCafe = null;
function videoCafe() {
  if (vidCafe) return vidCafe;
  vidCafe = document.createElement('video');
  Object.assign(vidCafe, { src: CONFIG.VIDEO_CAFE, muted: true, loop: true, playsInline: true, preload: 'auto' });
  vidCafe.setAttribute('playsinline', ''); vidCafe.setAttribute('muted', '');
  return vidCafe;
}

PANT.E1_3 = () => {   // pantallas 3, 4 y 5 (y alternativa A2)
  const M = cargarMarco();
  pinta(`
    <p id="instr">Encaje el marco naranja en la cristalera del café (la del panel de Banksy) y la línea en el dintel. La columna de azulejos queda a la izquierda. Puede mover el marco y estirarlo desde las esquinas.</p>
    <div class="visor" id="visor">
      <video class="cam" id="cam" playsinline muted autoplay></video>
      <div class="dintel" id="dintel"></div>
      <span class="etq" id="etqCol">columna de azulejos</span>
      <div class="guia" id="guia"><i class="a" data-c="a"></i><i class="b" data-c="b"></i><i class="c" data-c="c"></i><i class="d" data-c="d"></i></div>
      <canvas id="ventana" hidden></canvas>
      <div class="hud"><span id="nivel">Nivel: —</span><span id="hudGps">GPS —</span></div>
      <div class="sub" id="sub" hidden>${esc(E1.subtitulo)}</div>
    </div>
    <button class="btn" id="alin">Alineado</button>
    <div class="fila" id="filaA"><button class="btn2" id="sinAlin">Ver sin alinear</button><button class="btn2" id="resetM">Restablecer marco</button></div>
    <div class="fila" id="filaB" hidden><button class="btn" id="partitura" style="flex:1">Ver la partitura</button></div>
    <div class="fila" id="filaC" hidden><button class="btn2" id="repetir">Repetir melodía</button><button class="btn2" id="volver">Volver a alinear</button></div>
    <div class="aviso mal" id="errCam" hidden></div>`);
  const visor = $('visor'), guia = $('guia');
  const colocar = () => {
    Object.assign(guia.style, { left: M.x * 100 + '%', top: M.y * 100 + '%', width: M.w * 100 + '%', height: M.h * 100 + '%' });
    $('dintel').style.top = Math.max(0, M.y - 0.02) * 100 + '%';
    Object.assign($('etqCol').style, { left: Math.max(0, M.x * 100 - 2) + '%', top: (M.y + M.h + 0.02) * 100 + '%', transform: 'translateX(-60%)' });
  };
  colocar();
  // cámara
  let stream = null;
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1706 } }, audio: false });
      $('cam').srcObject = stream; await $('cam').play().catch(() => {});
      S.permisos.camara = true;
    } catch (e) {
      S.permisos.camara = false;
      $('errCam').hidden = false;
      $('errCam').textContent = 'Sin cámara: verá el café a pantalla completa.';
      setTimeout(() => abrir(true), 600);
    }
    guardar();
  })();
  alSalir(() => { if (stream) stream.getTracks().forEach(t => t.stop()); });
  // GPS en el visor
  const act = p => { const h = $('hudGps'); if (h) h.textContent = 'GPS ' + Math.round(distancia(p, LUGARES[1])) + ' m'; };
  if (pos) act(pos); oyentesGPS.add(act); alSalir(() => oyentesGPS.delete(act));
  // nivel
  const nivel = e => {
    if (e.beta == null) return;
    const ok = Math.abs(e.beta - 90) < 10 && Math.abs(e.gamma) < 6;
    $('nivel').textContent = ok ? 'Nivel: recto ✓' : (Math.abs(e.gamma) >= 6 ? 'Enderece el móvil' : (e.beta < 90 ? 'Levante el móvil' : 'Baje un poco el móvil'));
    guia.classList.toggle('ok', ok);
  };
  window.addEventListener('deviceorientation', nivel); alSalir(() => window.removeEventListener('deviceorientation', nivel));
  // marco ajustable con los dedos
  const punteros = new Map(); let gesto = null;
  const rel = e => { const r = visor.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const limitar = () => { M.w = Math.min(1, Math.max(0.08, M.w)); M.h = Math.min(1, Math.max(0.05, M.h)); M.x = Math.min(1 - M.w * 0.2, Math.max(-M.w * 0.8, M.x)); M.y = Math.min(1 - M.h * 0.2, Math.max(-M.h * 0.8, M.y)); };
  guia.addEventListener('pointerdown', e => {
    e.preventDefault(); try { guia.setPointerCapture(e.pointerId); } catch (_) {}
    punteros.set(e.pointerId, rel(e));
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; gesto = { t: 'pinza', d0: Math.hypot(a.x - b.x, a.y - b.y), c0: { ...M } }; }
    else gesto = { t: e.target.dataset.c ? 'esq' : 'mover', esq: e.target.dataset.c, p0: rel(e), c0: { ...M } };
  });
  guia.addEventListener('pointermove', e => {
    if (!punteros.has(e.pointerId) || !gesto) return;
    punteros.set(e.pointerId, rel(e)); const c0 = gesto.c0;
    if (gesto.t === 'pinza' && punteros.size >= 2) {
      const [a, b] = [...punteros.values()], f = Math.hypot(a.x - b.x, a.y - b.y) / gesto.d0, cx = c0.x + c0.w / 2, cy = c0.y + c0.h / 2;
      M.w = c0.w * f; M.h = c0.h * f; M.x = cx - M.w / 2; M.y = cy - M.h / 2;
    } else if (gesto.t === 'mover') { const p = rel(e); M.x = c0.x + p.x - gesto.p0.x; M.y = c0.y + p.y - gesto.p0.y; }
    else if (gesto.t === 'esq') {
      const p = rel(e), dx = p.x - gesto.p0.x, dy = p.y - gesto.p0.y, q = gesto.esq;
      if (q === 'a' || q === 'c') { M.x = c0.x + dx; M.w = c0.w - dx; } else M.w = c0.w + dx;
      if (q === 'a' || q === 'b') { M.y = c0.y + dy; M.h = c0.h - dy; } else M.h = c0.h + dy;
    }
    limitar(); colocar();
  });
  const fin = e => { punteros.delete(e.pointerId); if (punteros.size === 1) { const [, p] = [...punteros.entries()][0]; gesto = { t: 'mover', p0: p, c0: { ...M } }; } else if (!punteros.size) { gesto = null; guardarMarco(M); } };
  guia.addEventListener('pointerup', fin); guia.addEventListener('pointercancel', fin);
  on('resetM', () => { Object.assign(M, MARCO0); colocar(); guardarMarco(M); });

  // ventana al pasado
  const cv = $('ventana'), g = cv.getContext('2d'); const v = videoCafe();
  let anim = 0, t0 = 0, completo = false;
  const dibujar = () => {
    const W = cv.width, H = cv.height, t = (performance.now() - t0) / 1000, fade = Math.min(1, t / 1.2);
    g.globalAlpha = 1; g.fillStyle = '#0d0b09'; g.fillRect(0, 0, W, H);
    if (v.readyState >= 2 && v.videoWidth) {
      g.globalAlpha = fade;
      const iw = v.videoWidth, ih = v.videoHeight;
      if (completo) { const k = Math.min(W / iw, H / ih); g.drawImage(v, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k); }
      else { const ar = W / H; let sw = ih * ar, sh = ih, sx, sy = 0; if (sw > iw) { sw = iw; sh = iw / ar; sy = (ih - sh) / 2; sx = 0; } else sx = Math.max(0, Math.min(iw - sw, 0.54 * iw - sw / 2)); g.drawImage(v, sx, sy, sw, sh, 0, 0, W, H); }
      g.globalAlpha = fade * 0.1; for (let k = 0; k < 160; k++) { g.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
    }
    anim = requestAnimationFrame(dibujar);
  };
  const abrir = pc => {
    completo = pc;
    if (pc) Object.assign(cv.style, { left: 0, top: 0, width: '100%', height: '100%' });
    else Object.assign(cv.style, { left: M.x * 100 + '%', top: M.y * 100 + '%', width: M.w * 100 + '%', height: M.h * 100 + '%' });
    guia.hidden = true; $('dintel').hidden = true; $('etqCol').hidden = true;
    cv.hidden = false; const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    try { v.currentTime = 0; const pr = v.play(); if (pr) pr.catch(() => {}); } catch (_) {}
    t0 = performance.now(); cancelAnimationFrame(anim); dibujar();
    $('alin').hidden = true; $('filaA').hidden = true; $('filaB').hidden = false; $('filaC').hidden = false; $('sub').hidden = false;
    $('instr').textContent = pc ? 'El café de los años 40, a pantalla completa.' : 'Ventana al pasado: el café ocupa solo la cristalera; el resto es la calle de hoy.';
    // Secuencia (provisional, un solo vídeo): ambiente → el Pianista mira al agente y suena la frase → Greta se gira
    setTimeout(() => melodia(), 2500);
  };
  on('alin', () => { audio(); abrir(false); });
  on('sinAlin', () => { audio(); abrir(true); });
  on('repetir', () => melodia());
  on('volver', () => {
    cancelAnimationFrame(anim); cv.hidden = true; $('sub').hidden = true; guia.hidden = false; $('dintel').hidden = false; $('etqCol').hidden = false;
    $('alin').hidden = false; $('filaA').hidden = false; $('filaB').hidden = true; $('filaC').hidden = true;
  });
  on('partitura', () => ir('E1_6'));
  alSalir(() => { cancelAnimationFrame(anim); try { v.pause(); } catch (_) {} });
};

function svgPartitura() {
  const ys = [80, 85, 65, 70, 65], xs = [90, 140, 190, 240, 290];
  let s = '<svg viewBox="0 0 340 130" style="width:100%;height:auto;background:#fff;border:1px solid var(--borde);border-radius:8px">';
  for (let i = 0; i < 5; i++) s += `<line x1="10" x2="330" y1="${40 + i * 10}" y2="${40 + i * 10}" stroke="#1f1b16" stroke-width="1"/>`;
  s += '<text x="14" y="86" font-size="62" font-family="serif" fill="#1f1b16">𝄞</text>';
  xs.forEach((x, i) => {
    if (i === 1) s += `<line x1="${x - 12}" x2="${x + 12}" y1="90" y2="90" stroke="#1f1b16"/>`;
    s += `<g id="nota${i}"><ellipse cx="${x}" cy="${ys[i]}" rx="7" ry="5" transform="rotate(-20 ${x} ${ys[i]})" fill="#1f1b16"/><line x1="${x + 6}" x2="${x + 6}" y1="${ys[i]}" y2="${ys[i] - 32}" stroke="#1f1b16" stroke-width="1.6"/></g>`;
    s += `<text x="${x}" y="120" text-anchor="middle" font-size="15" font-weight="700" font-family="system-ui" fill="#9a4a12">${NOTAS[i][0]}</text>`;
  });
  return s + '</svg>';
}

PANT.E1_6 = () => {   // pantallas 6 y 7 (pistas) y alternativa A3
  const p = S.pistas.e1 || 0;
  pinta(`
    <span class="eti">El mensaje del Pianista</span><h1>La partitura</h1>
    ${svgPartitura()}
    <button class="btn2" id="rep">Repetir melodía</button>
    <label for="resp"><b>Escriba el mensaje que esconden las notas</b></label>
    <input type="text" id="resp" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Escriba aquí…">
    <div id="msg"></div>
    <button class="btn" id="comp">Comprobar</button>
    <button class="enlace" id="pedir">Necesito una pista</button>
    <div class="pistas" id="pistas" ${p ? '' : 'hidden'}><span class="eti" id="pEti"></span><ol id="pLista"></ol><button class="btn2" id="otra">Otra pista</button><p class="peq" style="margin-top:6px">Usar pistas no penaliza.</p></div>`);
  const iluminar = k => { for (let i = 0; i < 5; i++) { const n = $('nota' + i); if (n) n.querySelector('ellipse').setAttribute('fill', i === k ? '#9a4a12' : '#1f1b16'); } };
  const pintaP = () => { const n = S.pistas.e1 || 0; $('pistas').hidden = !n; $('pEti').textContent = `Pista ${n} de 3`; $('pLista').innerHTML = E1.pistas.slice(0, n).map(t => `<li>${esc(t)}</li>`).join(''); $('otra').disabled = n >= 3; };
  pintaP();
  on('rep', () => melodia(iluminar, 1));
  on('pedir', () => { S.pistas.e1 = Math.max(1, S.pistas.e1 || 0); guardar(); pintaP(); });
  on('otra', () => { S.pistas.e1 = Math.min(3, (S.pistas.e1 || 0) + 1); guardar(); pintaP(); });
  const comprobar = async () => {
    const r = $('resp').value; if (!norm(r)) return;
    $('comp').disabled = true;
    const ok = await validar('e1', r);
    $('comp').disabled = false;
    if (ok) { inv('ficha', 'Ficha de Greta', 'Expediente MI6: zurda, fuma, odia el café frío. Nunca rechaza una copa.'); ir('E1_8'); return; }
    S.fallos.e1 = (S.fallos.e1 || 0) + 1; guardar();
    $('msg').innerHTML = `<div class="aviso mal"><b>${esc(E1.fallo)}</b>${esc(E1.falloAyuda)}<br><span class="peq">Intento ${Math.min(3, S.fallos.e1)} de 3. ${S.fallos.e1 < 3 ? 'Después del tercero se abrirá una pista.' : ''}</span></div>`;
    if (S.fallos.e1 >= 3 && !S.pistas.e1) { S.pistas.e1 = 1; guardar(); pintaP(); }
  };
  on('comp', comprobar);
  $('resp').addEventListener('keydown', e => { if (e.key === 'Enter') comprobar(); });
};

PANT.E1_8 = () => {   // acierto: zoom a Greta
  pinta(`
    ${aviso('ok', 'Correcto', E1.correcto)}
    <div class="visor" id="visor"><canvas id="cz" style="left:0;top:0;width:100%;height:100%"></canvas><div class="sub">${esc(E1.zoomSub)}</div></div>
    <button class="btn" id="ficha">Ver su ficha</button>
    <p class="peq">Al terminar el vídeo, la ficha se abre sola.</p>`);
  const cv = $('cz'), g = cv.getContext('2d'), v = videoCafe();
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  try { const pr = v.play(); if (pr) pr.catch(() => {}); } catch (_) {}
  const t0 = performance.now(); let anim = 0;
  const GX = 0.79, GY = 0.52, ZMAX = 3.2;   // posición de Greta en el vídeo (lado derecho)
  const dib = () => {
    const W = cv.width, H = cv.height, t = (performance.now() - t0) / 1000;
    g.fillStyle = '#0d0b09'; g.fillRect(0, 0, W, H);
    if (v.readyState >= 2 && v.videoWidth) {
      const iw = v.videoWidth, ih = v.videoHeight, e = ease(t / 5), z = Math.exp(Math.log(ZMAX) * e);
      const base = Math.min(W / iw, H / ih), k = base * z;
      const cx = iw * (0.5 + (GX - 0.5) * e), cy = ih * (0.5 + (GY - 0.5) * e);
      g.drawImage(v, W / 2 - cx * k, H / 2 - cy * k, iw * k, ih * k);
      g.globalAlpha = 0.1; for (let q = 0; q < 160; q++) { g.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); } g.globalAlpha = 1;
    }
    anim = requestAnimationFrame(dib);
  };
  dib();
  const tt = setTimeout(() => ir('E1_9'), 6500);
  alSalir(() => { cancelAnimationFrame(anim); clearTimeout(tt); try { v.pause(); } catch (_) {} });
  on('ficha', () => ir('E1_9'));
};

PANT.E1_9 = () => {
  pinta(`
    <div class="fila"><span class="eti">Expediente MI6</span><span style="flex:1"></span><span class="chip" style="color:#a62b22;border-color:#a62b22">CONFIDENCIAL</span></div>
    <h1>Greta von Clausewitz</h1>
    <div style="display:grid;grid-template-columns:120px 1fr;gap:12px">
      <div class="prov" style="min-height:150px;font-size:11px">FOTO: retrato de Greta von Clausewitz (años 40, sepia)</div>
      <div><div class="eti">Bando</div><p>Alemania nazi</p><br><div class="eti">Misión</div><p>Dirige la red de aprovisionamiento de wolframio en Verín.</p></div>
    </div>
    <div class="caja"><div class="eti">Rasgos</div><p>${esc(E1.ficha.rasgos)}</p><br><div class="eti">Debilidad</div><p><b>${esc(E1.ficha.debilidad)}</b></p></div>
    ${prov('IMAGEN: muestra de su firma «G.v.C.», letra inclinada a la izquierda')}
    <div>${chip('Guardada en el inventario', 'ok')}</div>
    <button class="btn" id="sig">Continuar</button>`);
  on('sig', () => ir('E1_10'));
};

PANT.E1_10 = () => {
  pinta(`
    <span class="eti">Mensaje del Pianista</span>
    ${voz('El Pianista', E1.pianista, 'v')}
    <p class="cita">${esc(E1.pianista)}</p>
    <div class="caja"><div class="eti">Santo y seña</div><p class="cita"><b>${esc(E1.santoYSena)}</b></p></div>
    <div><div class="eti">Inventario</div><div class="fila" style="margin-top:6px">${chip('Credencial MI6')}${chip('Ficha de Greta · nuevo', 'ok')}</div></div>
    <div class="mapa" id="mapa" style="height:200px"></div>
    <button class="btn" id="sig">Ir a la farmacia</button>`);
  inv('santo', 'Santo y seña para Don Manuel', E1.santoYSena);
  conVoz('v', E1.pianista); crearMapa($('mapa'), LUGARES[2], true);
  on('sig', () => ir('R2'));
};

/* ---------- ETAPA 2 · FARMACIA ---------- */
PANT.E2_1 = () => pantallaAviso(2, E2.titulo, E2.aviso, 'E2_2');

PANT.E2_2 = () => {
  pinta(`
    <span class="eti">Punto de encuentro</span><h1>Preséntese en la puerta de la farmacia</h1>
    ${prov(E2.fotoPunto)}
    <ol class="lista-num">${E2.pasos.map((t, i) => `<li><i>${i + 1}</i><span>${esc(t)}</span></li>`).join('')}</ol>
    <div><span class="chip" id="chipU">Buscando ubicación…</span> <span class="peq" id="distU"></span></div>
    <button class="btn" id="sig">Llamar a la puerta</button>
    <button class="btn sec" id="aqui">Ya estoy aquí: continuar sin GPS</button>`);
  vigilarPunto(2, 'chipU', 'distU');
  on('sig', () => ir('E2_3')); on('aqui', () => ir('E2_3'));
};

PANT.E2_3 = () => {   // santo y seña (y alternativa A2)
  let sel = -1;
  pinta(`
    <span class="eti">El santo y seña</span><h1>¿Qué le dice a Don Manuel?</h1>
    <p>Hable bajo. Solo la frase que acordó con el Pianista le abrirá la puerta.</p>
    ${E2.opciones.map((o, i) => `<div class="opcion" data-i="${i}"><i></i><span>${esc(o)}</span></div>`).join('')}
    <div id="msg"></div>
    <button class="btn" id="decir" disabled>Decir la frase</button>
    <button class="enlace" id="pianista">Volver a escuchar el mensaje del Pianista</button>`);
  app.querySelectorAll('.opcion').forEach(el => el.addEventListener('click', () => {
    sel = +el.dataset.i; app.querySelectorAll('.opcion').forEach(x => x.classList.toggle('sel', x === el)); $('decir').disabled = false; $('msg').innerHTML = '';
  }));
  on('pianista', () => modal(`<span class="eti">Mensaje del Pianista</span><p class="cita">${esc(E1.pianista)}</p><div class="caja"><div class="eti">Santo y seña</div><p class="cita"><b>${esc(E1.santoYSena)}</b></p></div><button class="btn2" id="mv">Escuchar</button>`, () => conVoz('mv', E1.pianista)));
  on('decir', async () => {
    if (sel < 0) return;
    $('decir').disabled = true;
    const ok = await validar('e2', E2.opciones[sel]);
    if (ok) { ir('E2_4'); return; }
    $('decir').disabled = false;
    $('msg').innerHTML = `${prov('IMAGEN: puerta cerrada de la farmacia')}<div class="aviso mal" style="margin-top:8px"><b>${esc(E2.fallo)}</b>${esc(E2.falloAyuda)}<br><span class="peq">Intentos ilimitados.</span></div>`;
  });
};

PANT.E2_4 = () => {
  pinta(`
    <span class="eti">Don Manuel</span>
    ${prov('FOTO (sepia): la puerta de la farmacia, ahora entreabierta. Don Manuel no se ve: solo se oye su voz.', true)}
    ${voz('Don Manuel, tras la puerta', E2.donManuel, 'v')}
    <p class="cita">${esc(E2.donManuel)}</p>
    <button class="btn" id="sig">Recoger el jarabe</button>`);
  conVoz('v', E2.donManuel); setTimeout(() => hablar(E2.donManuel), 400);
  on('sig', () => ir('E2_5'));
};

PANT.E2_5 = () => {
  pinta(`
    <span class="eti">Entrega de Don Manuel</span><h1>El jarabe del Pianista</h1>
    ${prov(E2.frascoImg)}
    <div class="caja"><div class="eti">Instrucciones</div><p class="cita">${esc(E2.instrucciones)}</p><br>
    <div class="eti">Etiqueta del frasco</div><p class="cita" style="font-size:22px;letter-spacing:.1em"><b>DORMIDIÑA</b></p></div>
    <p>Guárdelo: lo necesitará más adelante.</p>
    <div>${chip('Frasco · guardado en el inventario', 'ok')}</div>
    <button class="btn" id="sig">Continuar</button>`);
  inv('frasco', 'Frasco «DORMIDIÑA»', E2.instrucciones);
  on('sig', () => ir('E2_6'));
};

PANT.E2_6 = () => {
  pinta(`
    <span class="eti">Mensaje de Don Manuel</span>
    ${voz('Don Manuel', E2.siguiente, 'v')}
    <p class="cita">${esc(E2.siguiente)}</p>
    <div><div class="eti">Inventario</div><div class="fila" style="margin-top:6px">${chip('Credencial MI6')}${chip('Ficha de Greta')}${chip('Frasco · nuevo', 'ok')}</div></div>
    <div class="mapa" id="mapa" style="height:200px"></div>
    <button class="btn" id="sig">Ir a la Plaza de la Merced</button>`);
  conVoz('v', E2.siguiente); crearMapa($('mapa'), LUGARES[3], true);
  on('sig', () => ir('R3'));
};

/* ---------- ETAPA 3 · ROTOR ---------- */
PANT.E3_1 = () => pantallaAviso(3, E3.titulo, E3.aviso, 'E3_2');

PANT.E3_2 = () => {
  pinta(`
    <span class="eti">La clave</span><h1>Busque las letras</h1>
    <div class="caja"><div class="eti">Don Manuel le dijo</div><p class="cita">${esc(E3.donManuel)}</p></div>
    ${prov(E3.ambiente)}
    <div><span class="chip" id="chipU">Buscando ubicación…</span> <span class="peq" id="distU"></span></div>
    <button class="btn" id="sig">Abrir el rotor</button>
    <button class="btn sec" id="aqui">Ya estoy aquí: continuar sin GPS</button>`);
  vigilarPunto(3, 'chipU', 'distU');
  on('sig', () => ir('E3_3')); on('aqui', () => ir('E3_3'));
};

PANT.E3_3 = () => {   // pantallas 3 a 6 y alternativa A2 (pistas)
  const AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', idx = [0, 0, 0];
  pinta(`
    <span class="eti">El rotor</span><h1>Sintonice la emisora</h1>
    <p>Gire cada rueda hasta una letra. Al alinearla, su número aparece en el recuadro.</p>
    <div class="rotor"><div class="cuerpo" id="cuerpo"><div class="nums"><span class="eti" style="font-size:9px">Números</span><b id="n0">1</b><b id="n1">1</b><b id="n2">1</b></div></div>
      <div class="estado"><span class="piloto" id="piloto"></span><span id="estTxt">111 · Solo estática</span></div></div>
    <div class="aviso neutro" id="av"><b>Sin señal</b>Pruebe con las letras de la casa. No hay límite de intentos.</div>
    <div id="exito" hidden style="display:flex;flex-direction:column;gap:10px">
      <div>${chip('Rotor · 363 · guardado en el inventario', 'ok')}</div>
      <button class="btn" id="mensaje">Escuchar el mensaje</button>
    </div>
    <button class="enlace" id="pedir">Necesito una pista</button>
    <div class="pistas" id="pistas" hidden><span class="eti" id="pEti"></span><ol id="pLista"></ol><button class="btn2" id="otra">Otra pista</button></div>`);
  // estática
  const c = audio(); let ruido = null;
  if (c) {
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 3 : 1);
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
    ruido = c.createGain(); ruido.gain.value = 0.25; src.connect(bp).connect(ruido).connect(c.destination); src.start();
    alSalir(() => { try { src.stop(); } catch (_) {} });
  }
  const nivel = v => { if (ruido) ruido.gain.setTargetAtTime(v, c.currentTime, 0.15); };
  let bloqueado = false, ultima = null; const timers = [0, 0, 0];
  const cuerpo = $('cuerpo'), nums = cuerpo.firstElementChild;
  for (let i = 0; i < 3; i++) {
    const r = document.createElement('div'); r.className = 'rueda';
    r.innerHTML = `<button class="flecha" aria-label="Rueda ${i + 1} arriba">▲</button><div class="tambor" id="t${i}"><span class="v" id="p${i}"></span><span class="l" id="l${i}"></span><span class="v" id="s${i}"></span></div><button class="flecha" aria-label="Rueda ${i + 1} abajo">▼</button>`;
    cuerpo.insertBefore(r, nums);
    r.children[0].onclick = () => girar(i, -1); r.children[2].onclick = () => girar(i, 1);
    const t = r.children[1]; let y0 = null, ac = 0;
    t.addEventListener('pointerdown', e => { y0 = e.clientY; ac = 0; try { t.setPointerCapture(e.pointerId); } catch (_) {} });
    t.addEventListener('pointermove', e => { if (y0 === null) return; const p = Math.trunc((e.clientY - y0) / 28) - ac; if (p) { ac += p; girar(i, -Math.sign(p), Math.abs(p)); } });
    t.addEventListener('pointerup', () => { y0 = null; }); t.addEventListener('pointercancel', () => { y0 = null; });
    pintarR(i);
  }
  function girar(i, dir, veces = 1) { if (bloqueado) return; for (let k = 0; k < veces; k++) { idx[i] = (idx[i] + dir + 26) % 26; clic(); } pintarR(i, true); }
  function pintarR(i, mov) {
    const k = idx[i]; $('p' + i).textContent = AB[(k + 25) % 26]; $('l' + i).textContent = AB[k]; $('s' + i).textContent = AB[(k + 1) % 26];
    const n = $('n' + i); clearTimeout(timers[i]);
    if (mov) { n.classList.add('oc'); timers[i] = setTimeout(() => { n.textContent = k + 1; n.classList.remove('oc'); comprobar(); }, 450); } else n.textContent = k + 1;
  }
  alSalir(() => timers.forEach(clearTimeout));
  async function comprobar() {
    if ([0, 1, 2].some(i => $('n' + i).classList.contains('oc'))) return;
    const comb = idx.map(k => AB[k]).join(''), num = idx.map(k => k + 1).join('');
    if (comb === ultima) return; ultima = comb;
    const em = E3.emisoras[comb], av = $('av'), pil = $('piloto');
    if (em && comb === 'CFC' && !(await validar('e3', comb))) return;
    if (em) {
      pil.style.background = { ok: '#7fc48a', av: '#f0a040', mal: '#e06a5f' }[em.clase];
      $('estTxt').textContent = `${em.f} · ${em.titulo.replace('Correcto · ', '')}`;
      av.className = 'aviso ' + em.clase; av.innerHTML = `<b>${esc(em.titulo)}</b>${esc(em.texto)}`;
      if (!S.cuaderno.some(x => x.f === em.f)) { S.cuaderno.push({ f: em.f, nombre: em.nombre }); }
      inv('cuaderno', 'Cuaderno de frecuencias', 'Registra las emisoras oídas.');
      nivel(0.03);
      if (comb === 'CFC') { bloqueado = true; inv('rotor', 'Rotor · 363', 'Guardado en C-F-C. Frecuencia de emisión del MI6.'); $('exito').hidden = false; $('pedir').hidden = true; $('pistas').hidden = true; }
      guardar();
    } else {
      pil.style.background = '#8d867a'; $('estTxt').textContent = `${num} · Solo estática`;
      av.className = 'aviso neutro'; av.innerHTML = '<b>Sin señal</b>Nadie emite en esta frecuencia. Siga probando: no hay límite de intentos.';
      nivel(0.25);
    }
  }
  const pintaP = () => { const n = S.pistas.e3 || 0; $('pistas').hidden = !n; $('pEti').textContent = `Pista ${n} de 4`; $('pLista').innerHTML = E3.pistas.slice(0, n).map(t => `<li>${esc(t)}</li>`).join(''); $('otra').disabled = n >= 4; };
  on('pedir', () => { S.pistas.e3 = Math.max(1, S.pistas.e3 || 0); guardar(); pintaP(); });
  on('otra', () => { S.pistas.e3 = Math.min(4, (S.pistas.e3 || 0) + 1); guardar(); pintaP(); });
  on('mensaje', () => ir('E3_7'));
};

PANT.E3_7 = () => {
  pinta(`
    <span class="eti">Mensaje del MI6</span>
    ${voz('Control (MI6)', E3.mi6, 'v')}
    <p class="cita">${esc(E3.mi6)}</p>
    <div><div class="eti">Inventario</div><div class="fila" style="margin-top:6px">${chip('Rotor · 363 · nuevo', 'ok')}${chip('Cuaderno de frecuencias · nuevo', 'ok')}</div></div>
    <div class="mapa" id="mapa" style="height:200px"></div>
    <button class="btn" id="sig">Ir a la Plazuela del Pozo</button>`);
  conVoz('v', E3.mi6); setTimeout(() => hablar(E3.mi6), 400); crearMapa($('mapa'), LUGARES[4], true);
  on('sig', () => ir('R4'));
};

/* ---------- Fin de la fase 1 (las etapas 4-10 llegarán en las fases 2 y 3) ---------- */
PANT.FIN1 = () => {
  pinta(`
    <span class="eti">Versión de prueba · fase 1</span><h1>Ha llegado a la Plazuela del Pozo</h1>
    <p>Las etapas 4 a 10 están en preparación. Su partida queda guardada aquí: cuando se publiquen, podrá continuar desde este punto.</p>
    <div class="caja"><div class="eti">Agente</div><p class="clave">${esc(S.clave)}</p></div>
    <button class="btn sec" id="inicio">Volver a la portada</button>`);
  on('inicio', () => ir('P2'));
};

/* ================= ARRANQUE ================= */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
let bloqueoPantalla = null;
async function noApagar() { try { if (navigator.wakeLock && document.visibilityState === 'visible') bloqueoPantalla = await navigator.wakeLock.request('screen'); } catch (_) {} }
document.addEventListener('visibilitychange', noApagar); document.addEventListener('click', noApagar, { once: true });

if (!S) { nuevaPartida(); S.pantalla = 'P1'; }
if (S.permisos && S.permisos.ubicacion) iniciarGPS();
ir('P1');   // siempre empieza con la introducción («Saltar ›» lleva a la portada)
})();
