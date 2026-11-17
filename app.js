'use strict';
/* Egzamin IOŚ – aplikacja do nauki. Bez zależności, dane tylko lokalnie (localStorage). */
const APP_VERSION = '1.0.4';

/* ---------- narzędzia ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snip = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const pad2 = n => String(n).padStart(2, '0');
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? b : c;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Nie udało się zapisać danych w przeglądarce (brak miejsca lub tryb prywatny).'); return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

function toast(msg, action) {
  const box = $('#toast'); const el = document.createElement('div'); el.className = 't';
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  box.appendChild(el);
  setTimeout(() => el.remove(), action ? 15000 : 3500);
}

function modal(title, body, buttons) {
  return new Promise(res => {
    const m = $('#modal');
    m.innerHTML = `<div class="mback"><div class="mbox" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="mbody">${esc(body)}</div><div class="mbtns">` +
      buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('') + '</div></div></div>';
    m.querySelectorAll('button').forEach(b => b.onclick = () => { m.innerHTML = ''; res(buttons[+b.dataset.i].value); });
  });
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function pickFile() {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => res(i.files[0] ? await i.files[0].text() : null);
    i.click();
  });
}

/* ---------- dane ---------- */
let DS = null;            // aktywny zbiór pytań
let DS_SRC = '';          // skąd pochodzi
let Q = [];               // pytania (tablica)
let byId = new Map();     // id -> pytanie
let attempts = [];        // [czas, id, ok(1/0), pierwsza_próba(1/0)]
let state = { seq: null };
let settings = { size: 'm', theme: 'auto', withoutKey: false, limit: 20 };
let session = null;       // bieżąca sesja nauki
let cur = null;           // bieżące pytanie w sesji

const K = n => 'gios:' + DS.zbior + ':' + n;
const optKeys = p => Object.keys(p.odpowiedzi).sort();

function validate(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.pytania) || !d.pytania.length) throw new Error('Plik nie zawiera listy "pytania".');
  const seen = new Set();
  d.pytania.forEach((p, i) => {
    const w = `Pytanie #${i + 1}: `;
    if (p.id === undefined || p.id === null || p.id === '') throw new Error(w + 'brak pola "id".');
    if (seen.has(String(p.id))) throw new Error(w + 'powtórzone id ' + p.id + '.');
    seen.add(String(p.id));
    if (!p.pytanie || typeof p.pytanie !== 'string') throw new Error(w + 'brak treści ("pytanie").');
    if (!p.odpowiedzi || typeof p.odpowiedzi !== 'object' || Object.keys(p.odpowiedzi).length < 2) throw new Error(w + '"odpowiedzi" muszą zawierać co najmniej 2 opcje.');
    if (p.poprawna !== undefined && p.poprawna !== null && p.poprawna !== '' && !(String(p.poprawna).toLowerCase() in p.odpowiedzi)) throw new Error(w + 'poprawna odpowiedź "' + p.poprawna + '" nie występuje wśród opcji.');
  });
}
function normalize(d) {
  d.zbior = String(d.zbior || 'domyslny');
  d.pytania.forEach(p => {
    p.poprawna = p.poprawna ? String(p.poprawna).toLowerCase() : null;
    p.komentarz = p.komentarz || null;
    p.uwaga = p.uwaga || null;
  });
  return d;
}
async function loadBundled() {
  const el = document.getElementById('embedded-data');
  if (el) return JSON.parse(el.textContent);
  const r = await fetch('data/questions.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function initData() {
  let bundled = null, err = null;
  try { bundled = await loadBundled(); validate(bundled); } catch (e) { err = e; bundled = null; }
  const ov = store.get('gios:override', null);
  let use = bundled; DS_SRC = 'wbudowany w aplikację';
  if (ov) {
    try {
      validate(ov);
      if (!bundled || String(ov.wersja || '') >= String(bundled.wersja || '')) { use = ov; DS_SRC = 'własny plik (zaimportowany)'; }
    } catch (e) { /* uszkodzony plik – ignoruj */ }
  }
  if (!use) throw err || new Error('Brak danych');
  DS = normalize(use);
  Q = DS.pytania; byId = new Map(Q.map(p => [String(p.id), p]));
  attempts = store.get(K('attempts'), []);
  state = store.get(K('state'), { seq: null });
  const s = store.get('gios:settings', null); if (s) settings = Object.assign(settings, s);
}
const saveAttempts = () => store.set(K('attempts'), attempts);
const saveState = () => store.set(K('state'), state);
const saveSettings = () => store.set('gios:settings', settings);
function record(id, ok, first) { attempts.push([Date.now(), id, ok ? 1 : 0, first ? 1 : 0]); saveAttempts(); }

/* ---------- statystyki ---------- */
function perQuestion() {
  const m = new Map();
  for (const [ts, id, ok, first] of attempts) {
    if (!first) continue;
    const k = String(id); if (!byId.has(k)) continue;
    let s = m.get(k); if (!s) { s = { n: 0, w: 0, last: [], ts: 0 }; m.set(k, s); }
    s.n++; if (!ok) s.w++; s.last.push(ok); if (s.last.length > 3) s.last.shift(); s.ts = ts;
  }
  return m;
}
function statusOf(s) {
  if (!s || !s.n) return 'new';
  if (s.last[s.last.length - 1] === 0) return 'hard';
  if (s.n >= 2 && s.last.slice(-2).every(x => x === 1)) return 'mastered';
  return 'learning';
}
const STATUS = { new: 'Nowe', hard: 'Do powtórki', learning: 'W nauce', mastered: 'Opanowane' };
function firstTotals(from) {
  let n = 0, ok = 0;
  for (const [ts, id, o, first] of attempts) { if (first && byId.has(String(id)) && (!from || ts >= from)) { n++; ok += o; } }
  return { n, ok, bad: n - ok };
}
function statusCounts(pq) {
  const c = { new: 0, hard: 0, learning: 0, mastered: 0 };
  for (const p of Q) c[statusOf(pq.get(String(p.id)))]++;
  return c;
}

/* ---------- sesje nauki ---------- */
const pool = () => Q.filter(p => p.poprawna || settings.withoutKey);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildQueue(mode, limit) {
  const pq = perQuestion(); const st = p => statusOf(pq.get(String(p.id)));
  let list;
  if (mode === 'seq') {
    list = Q.slice();
    let at = Math.max(0, list.findIndex(p => String(p.id) === String(state.seq)));
    list = list.slice(at).concat(list.slice(0, at));
  } else if (mode === 'mix') {
    const w = { new: 3, hard: 4, learning: 2, mastered: 0.5 };
    list = pool().map(p => ({ p, k: -Math.log(Math.random()) / w[st(p)] })).sort((a, b) => a.k - b.k).map(x => x.p);
  } else if (mode === 'new') list = shuffle(pool().filter(p => st(p) === 'new'));
  else if (mode === 'wrong') list = shuffle(pool().filter(p => st(p) === 'hard'));
  else if (mode === 'hardest') {
    list = pool().filter(p => (pq.get(String(p.id)) || {}).w > 0)
      .sort((a, b) => { const x = pq.get(String(a.id)), y = pq.get(String(b.id)); return (y.w / y.n) - (x.w / x.n) || y.n - x.n; });
  } else list = [];
  return limit > 0 ? list.slice(0, limit) : list;
}
function startSession(mode, opts = {}) {
  let queue;
  if (mode === 'one') queue = [byId.get(String(opts.id))];
  else if (mode === 'set') queue = opts.queue;
  else queue = buildQueue(mode, settings.limit);
  if (!queue || !queue.length || !queue[0]) { toast('Brak pytań w tym trybie.'); return; }
  session = { mode, queue, idx: 0, ok: 0, bad: 0, skipped: 0, wrongIds: [], returnTo: opts.returnTo || '#/', done: false };
  showQuestion(0);
}
function showQuestion(i) {
  session.idx = i;
  const p = session.queue[i];
  cur = { p, wrong: new Set(), solved: false, revealed: false, first: true, unverified: false, picked: null, retrying: false };
  if (session.mode === 'seq') { state.seq = p.id; saveState(); }
  if (location.hash === '#/q') { drawQ(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } else location.hash = '#/q';
}
function finishSession() {
  const s = session; s.done = true;
  if (s.mode === 'one') { session = null; go(s.returnTo || '#/'); return; }
  go('#/summary');
}
function nextQuestion() {
  if (session.idx + 1 >= session.queue.length) finishSession(); else showQuestion(session.idx + 1);
}

const actions = {
  pick({ k }) {
    if (!cur || cur.solved || cur.revealed || cur.unverified || cur.wrong.has(k)) return;
    const p = cur.p;
    if (!p.poprawna) { cur.unverified = true; cur.picked = k; drawQ(); return; }
    const ok = k === p.poprawna;
    record(p.id, ok, cur.first);
    if (cur.first) { if (ok) session.ok++; else { session.bad++; session.wrongIds.push(p.id); } }
    cur.first = false; cur.retrying = false;
    if (ok) cur.solved = true; else cur.wrong.add(k);
    drawQ(true);
  },
  retry() { if (!cur || cur.solved || cur.revealed || !cur.wrong.size) return; cur.retrying = true; drawQ(); window.scrollTo(0, 0); },
  reveal() {
    if (!cur || cur.solved || cur.revealed || cur.unverified || !cur.p.poprawna) return;
    if (cur.first) { // podpowiedź bez własnej próby = pytanie, którego odpowiedzi użytkownik nie znał (błąd w statystykach)
      record(cur.p.id, false, true); session.bad++; session.wrongIds.push(cur.p.id); cur.first = false; cur.hinted = true;
    }
    cur.revealed = true; drawQ(true);
  },
  next() { nextQuestion(); },
  skip() { session.skipped++; nextQuestion(); },
  quit() {
    if (session.mode === 'one') { finishSession(); return; }
    session.done = true; go('#/summary');
  },
  exit() {
    try { window.close(); } catch (e) { /* ignoruj */ }
    setTimeout(() => { if (!document.hidden) toast('Przeglądarka nie pozwala aplikacji zamknąć się samej. Zamknij ją gestem lub przyciskiem systemowym – postęp jest zapisany.'); }, 400);
  },
  start({ mode }) { startSession(mode); },
  open({ id }) { startSession('one', { id, returnTo: location.hash }); },
  goto() {
    const v = $('#goto').value.trim(); const p = byId.get(v);
    if (!p) { toast('Nie ma pytania o numerze ' + (v || '…') + '.'); return; }
    startSession('one', { id: p.id, returnTo: '#/' });
  },
  again() {
    const ids = session ? session.wrongIds.slice() : [];
    const queue = ids.map(id => byId.get(String(id))).filter(Boolean);
    startSession('set', { queue });
  },
};

/* ---------- widoki ---------- */
const view = () => $('#view');
function go(h) { if (location.hash === h) route(); else location.hash = h; }

function viewHome() {
  const pq = perQuestion(); const sc = statusCounts(pq); const N = Q.length;
  const withKey = Q.filter(p => p.poprawna).length;
  const today = firstTotals(new Date().setHours(0, 0, 0, 0));
  const cnt = {
    mix: pool().length,
    seq: N,
    new: pool().filter(p => statusOf(pq.get(String(p.id))) === 'new').length,
    wrong: pool().filter(p => statusOf(pq.get(String(p.id))) === 'hard').length,
    hardest: pool().filter(p => (pq.get(String(p.id)) || {}).w > 0).length,
  };
  const seqAt = state.seq != null && byId.has(String(state.seq)) ? state.seq : Q[0].id;
  const mode = (m, title, sub, rec) => `<button class="mode ${rec ? 'rec' : ''}" data-act="start" data-mode="${m}" ${cnt[m] ? '' : 'disabled'}>
      <span class="t"><b>${title}</b><span>${sub}</span></span><span class="n">${cnt[m]}</span></button>`;
  const bar = ['mastered', 'learning', 'hard', 'new'].map(k => `<i class="c-${k}" style="width:${pct(sc[k], N)}%" title="${STATUS[k]}: ${sc[k]}"></i>`).join('');
  view().innerHTML = `
    <h1>Egzamin IOŚ – nauka</h1>
    <p class="muted small">${esc(DS.nazwa || '')} · ${N} pytań, w tym ${withKey} z kluczem odpowiedzi</p>
    <div class="card">
      <div class="bar" role="img" aria-label="Postęp nauki">${bar}</div>
      <div class="legend">${['mastered', 'learning', 'hard', 'new'].map(k => `<span><i class="dot c-${k}"></i>${STATUS[k]}: <b>${sc[k]}</b></span>`).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">Dziś: ${today.n} ${plural(today.n, 'odpowiedź', 'odpowiedzi', 'odpowiedzi')}${today.n ? `, ${pct(today.ok, today.n)}% poprawnych` : ''}.</p>
    </div>
    <h2>Wybierz tryb nauki</h2>
    <div class="row" style="margin-bottom:10px"><label class="small muted">Długość sesji
      <select id="limit">${[[10, '10 pytań'], [20, '20 pytań'], [50, '50 pytań'], [100, '100 pytań'], [0, 'bez limitu']].map(([v, l]) => `<option value="${v}" ${settings.limit === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${mode('mix', 'Mieszany (zalecany)', 'Nowe i trudne pytania pojawiają się częściej, opanowane rzadziej', true)}
    ${mode('seq', 'Po kolei', `Wszystkie pytania w kolejności z pliku, od nr ${esc(seqAt)}`)}
    ${mode('new', 'Jeszcze nieodpowiadane', 'Pytania, na które jeszcze nie odpowiadałeś(aś)')}
    ${mode('wrong', 'Do powtórki', 'Ostatnia odpowiedź na te pytania była błędna')}
    ${mode('hardest', 'Najtrudniejsze dla mnie', 'Pytania z najwyższym odsetkiem błędów')}
    <div class="card row" style="margin-top:14px"><label for="goto">Otwórz pytanie nr</label>
      <input type="number" id="goto" min="1" inputmode="numeric" style="width:6.5rem"><button class="btn" data-act="goto">Otwórz</button></div>
    ${withKey < N && !settings.withoutKey ? `<p class="small muted">${N - withKey} pytań nie ma jeszcze klucza odpowiedzi – tryby losowe je pomijają (tryb „Po kolei” i otwieranie po numerze je pokazują; można to zmienić w Ustawieniach).</p>` : ''}`;
  $('#limit').onchange = e => { settings.limit = +e.target.value; saveSettings(); };
  $('#goto').onkeydown = e => { if (e.key === 'Enter') actions.goto(); };
}

function viewQuestion() {
  if (!session || !cur || session.done) { go('#/'); return; }
  drawQ();
}
function drawQ(scroll) {
  const s = session, p = cur.p, N = s.queue.length;
  const answered = cur.solved || cur.revealed;
  const keys = optKeys(p);
  const opts = keys.map(k => {
    let cls = '', mk = '', dis = false;
    if (answered) {
      dis = true;
      if (k === p.poprawna) { cls = 'ok'; mk = '✓'; } else if (cur.wrong.has(k)) { cls = 'bad'; mk = '✗'; } else cls = 'dim';
    } else if (cur.unverified) { dis = true; cls = k === cur.picked ? 'sel' : 'dim'; }
    else if (cur.wrong.has(k)) { cls = 'bad'; mk = '✗'; dis = true; }
    return `<button class="opt ${cls}" data-act="pick" data-k="${esc(k)}" ${dis ? 'disabled' : ''}><span class="let">${esc(k)}</span><span class="txt">${esc(p.odpowiedzi[k])}</span><span class="mk">${mk}</span></button>`;
  }).join('');

  let fb = '';
  const extra = (answered || cur.unverified) ? (p.komentarz ? `<div class="expl"><h3>Wyjaśnienie</h3>${esc(p.komentarz)}</div>` : '') + (p.uwaga ? `<div class="note"><b>Uwaga:</b> ${esc(p.uwaga)}</div>` : '') : '';
  const nextLabel = s.mode === 'one' ? 'Zamknij' : (s.idx + 1 >= N ? 'Zakończ sesję' : 'Dalej');
  if (cur.solved) fb = `<div class="fb ok"><div class="msg">✓ Dobra odpowiedź${cur.wrong.size ? ' (po ponownej próbie)' : ''}</div>${extra}<div class="btns"><button class="btn pri" data-act="next" id="nextBtn">${nextLabel}</button></div></div>`;
  else if (cur.revealed) fb = `<div class="fb info"><div class="msg">Właściwa odpowiedź: ${esc(p.poprawna.toUpperCase())}</div>${cur.hinted ? '<p class="small muted" style="margin:0 0 8px">Pokazano odpowiedź bez próby – w statystykach liczy się jako odpowiedź, której nie znałeś(aś).</p>' : ''}${extra}<div class="btns"><button class="btn pri" data-act="next" id="nextBtn">${nextLabel}</button></div></div>`;
  else if (cur.unverified) fb = `<div class="fb info"><div class="msg">Brak klucza odpowiedzi dla tego pytania – nie można sprawdzić.</div>${extra}<div class="btns"><button class="btn pri" data-act="next" id="nextBtn">${nextLabel}</button></div></div>`;
  else if (cur.wrong.size && cur.retrying) fb = `<div class="fb bad"><div class="msg">Spróbuj jeszcze raz – wybierz inną odpowiedź.</div><div class="btns"><button class="btn" data-act="reveal">Pokaż właściwą odpowiedź <span class="kh">(P)</span></button></div></div>`;
  else if (cur.wrong.size) fb = `<div class="fb bad"><div class="msg">✗ Błędna odpowiedź</div><div class="btns"><button class="btn pri" data-act="retry">Spróbuj ponownie <span class="kh">(R)</span></button><button class="btn" data-act="reveal">Pokaż właściwą odpowiedź <span class="kh">(P)</span></button></div></div>`;
  else fb = `<div class="btns" style="margin-top:6px">${p.poprawna ? '<button class="btn ghost" data-act="reveal">Pokaż odpowiedź (liczy się jako błąd) <span class="kh">(P)</span></button>' : ''}${s.mode !== 'one' ? '<button class="btn ghost" data-act="skip">Pomiń pytanie <span class="kh">(S)</span></button>' : ''}</div>`;

  view().innerHTML = `
    <div class="qhead"><span class="no">Pytanie nr ${esc(p.id)}</span><span class="sp"></span>
      ${s.mode !== 'one' ? `<span class="tally muted">${s.idx + 1}/${N} · <span class="good">✓ ${s.ok}</span> · <span class="badc">✗ ${s.bad}</span></span>` : ''}
      <button class="btn ghost" data-act="quit" style="min-height:36px;padding:4px 12px" aria-label="Zakończ">✕</button></div>
    ${s.mode !== 'one' ? `<div class="prog"><i style="width:${pct(s.idx, N)}%"></i></div>` : '<div style="height:10px"></div>'}
    <p class="qtext">${esc(p.pytanie)}</p>
    ${opts}${fb}
    <p class="kbd">Skróty: ${keys.map(k => esc(k)).join(' / ')} – wybór odpowiedzi · Enter – dalej · R – ponów (po błędnej odpowiedzi) · P – pokaż odpowiedź · S – pomiń</p>`;
  if (scroll) { const f = $('.fb'); if (f) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function viewSummary() {
  const s = session;
  if (!s) { go('#/'); return; }
  const n = s.ok + s.bad;
  const wrong = s.wrongIds.map(id => byId.get(String(id))).filter(Boolean);
  view().innerHTML = `
    <h1>Koniec sesji</h1>
    <div class="grid">
      <div class="stat"><b>${n}</b><span>odpowiedzi (pierwsza próba)</span></div>
      <div class="stat"><b class="good">${s.ok}</b><span>poprawnych</span></div>
      <div class="stat"><b class="badc">${s.bad}</b><span>błędnych</span></div>
      <div class="stat"><b>${pct(s.ok, n)}%</b><span>skuteczność</span></div>
    </div>
    ${s.skipped ? `<p class="muted small">Pominięte pytania: ${s.skipped}.</p>` : ''}
    ${wrong.length ? `<h2>Pytania do powtórki</h2>` + wrong.map(p => `<button class="qrow" data-act="open" data-id="${esc(p.id)}"><span class="id">${esc(p.id)}</span><span class="tx">${esc(snip(p.pytanie, 140))}</span></button>`).join('') : '<p>Bez błędów w tej sesji – dobra robota.</p>'}
    <div class="btns" style="margin-top:12px">
      ${wrong.length ? '<button class="btn pri" data-act="again">Powtórz błędne</button>' : ''}
      <button class="btn ${wrong.length ? '' : 'pri'}" data-act="start" data-mode="${s.mode === 'set' || s.mode === 'one' ? 'mix' : s.mode}">Kolejna sesja</button>
      <button class="btn" onclick="location.hash='#/'">Do menu</button>
    </div>`;
}

function chartDaily(days) {
  const W = 520, H = 250, L = 46, R = 10, T = 14, B = 34; const iw = W - L - R, ih = H - T - B;
  const maxN = Math.max(...days.map(d => d.n), 5); const bw = Math.min(34, iw / days.length * 0.6);
  const x = i => L + (days.length === 1 ? iw / 2 : iw * (i + 0.5) / days.length);
  const y = v => T + ih * (1 - v / 100);
  const grid = [0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 5}" text-anchor="end">${v}%</text>`).join('');
  const bars = days.map((d, i) => `<rect x="${x(i) - bw / 2}" y="${T + ih * (1 - d.n / maxN)}" width="${bw}" height="${ih * d.n / maxN}" rx="3"><title>${d.label}: ${d.n} odpowiedzi</title></rect>`).join('');
  const pts = days.map((d, i) => [x(i), y(pct(d.ok, d.n))]);
  const line = pts.length > 1 ? `<polyline class="ln" points="${pts.map(p => p.join(',')).join(' ')}"/>` : '';
  const dots = days.map((d, i) => `<circle class="pt" cx="${pts[i][0]}" cy="${pts[i][1]}" r="4.5"><title>${d.label}: ${pct(d.ok, d.n)}% poprawnych (${d.ok}/${d.n})</title></circle>`).join('');
  const step = Math.ceil(days.length / 6);
  const labels = days.map((d, i) => i % step === 0 || i === days.length - 1 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${d.label}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Skuteczność w kolejnych dniach nauki"><g class="gl">${grid}</g><g class="bars">${bars}</g>${line}${dots}${labels}</svg>`;
}

function viewStats() {
  const pq = perQuestion(); const sc = statusCounts(pq); const N = Q.length;
  const all = firstTotals(); const wk = firstTotals(Date.now() - 7 * 864e5);
  const seen = N - sc.new;
  const byDay = new Map();
  for (const [ts, id, ok, first] of attempts) {
    if (!first || !byId.has(String(id))) continue;
    const k = dayKey(ts); const d = byDay.get(k) || { n: 0, ok: 0, ts }; d.n++; d.ok += ok; byDay.set(k, d);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30)
    .map(([k, d]) => ({ label: k.slice(8) + '.' + k.slice(5, 7), n: d.n, ok: d.ok }));
  const hard = [...pq.entries()].filter(([, s]) => s.w > 0)
    .sort((a, b) => (b[1].w / b[1].n) - (a[1].w / a[1].n) || b[1].n - a[1].n).slice(0, 15);
  const bar = ['mastered', 'learning', 'hard', 'new'].map(k => `<i class="c-${k}" style="width:${pct(sc[k], N)}%"></i>`).join('');
  view().innerHTML = `
    <h1>Statystyki</h1>
    <div class="grid">
      <div class="stat"><b>${all.n}</b><span>odpowiedzi łącznie (pierwsza próba)</span></div>
      <div class="stat"><b class="good">${all.ok}</b><span>poprawnych</span></div>
      <div class="stat"><b class="badc">${all.bad}</b><span>błędnych</span></div>
      <div class="stat"><b>${all.n ? pct(all.ok, all.n) + '%' : '–'}</b><span>skuteczność ogółem</span></div>
      <div class="stat"><b>${wk.n ? pct(wk.ok, wk.n) + '%' : '–'}</b><span>skuteczność – ostatnie 7 dni (${wk.n} odp.)</span></div>
      <div class="stat"><b>${seen}/${N}</b><span>pytań, na które odpowiadano</span></div>
    </div>
    <div class="card"><h3>Stan opanowania pytań</h3>
      <div class="bar">${bar}</div>
      <div class="legend">${['mastered', 'learning', 'hard', 'new'].map(k => `<span><i class="dot c-${k}"></i>${STATUS[k]}: <b>${sc[k]}</b></span>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">Opanowane = dwie ostatnie odpowiedzi na pytanie (pierwsze próby) były poprawne. Do powtórki = ostatnia odpowiedź była błędna.</p></div>
    <div class="card"><h3>Zmiany w czasie</h3>
      ${days.length ? chartDaily(days) + '<p class="small muted" style="margin:6px 0 0">Linia – odsetek poprawnych odpowiedzi danego dnia, słupki – liczba odpowiedzi. Ostatnie dni, w których się uczyłeś(aś).</p>' : '<p class="muted">Wykres pojawi się po pierwszych odpowiedziach.</p>'}</div>
    <div class="card"><h3>Najtrudniejsze pytania</h3>
      ${hard.length ? `<table class="t"><tr><th>Nr</th><th>Pytanie</th><th>Błędy</th></tr>` + hard.map(([id, s]) => `<tr class="click" data-act="open" data-id="${esc(id)}"><td class="num">${esc(id)}</td><td>${esc(snip(byId.get(id).pytanie, 90))}</td><td class="num">${s.w}/${s.n} (${pct(s.w, s.n)}%)</td></tr>`).join('') + '</table>' : '<p class="muted">Brak błędnych odpowiedzi – na razie nie ma czego pokazać.</p>'}
      <p class="small muted" style="margin:8px 0 0">Liczone są pierwsze odpowiedzi na pytanie w danej sesji – ponowne próby po błędzie nie zaniżają wyniku.</p></div>`;
}

let listFilter = 'all', listText = '';
function viewList() {
  view().innerHTML = `<h1>Pytania</h1>
    <input type="search" id="lq" placeholder="Szukaj po numerze lub treści…" value="${esc(listText)}">
    <div class="chips" id="chips">${[['all', 'Wszystkie'], ['new', 'Nowe'], ['hard', 'Do powtórki'], ['learning', 'W nauce'], ['mastered', 'Opanowane'], ['nokey', 'Bez klucza']].map(([k, l]) => `<button class="chip ${listFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <p class="small muted" id="lcount"></p><div id="rows"></div>`;
  const pq = perQuestion();
  const draw = () => {
    const t = listText.trim().toLowerCase();
    const rows = Q.filter(p => {
      const st = statusOf(pq.get(String(p.id)));
      if (listFilter === 'nokey') { if (p.poprawna) return false; }
      else if (listFilter !== 'all' && st !== listFilter) return false;
      if (!t) return true;
      return String(p.id) === t || p.pytanie.toLowerCase().includes(t) || Object.values(p.odpowiedzi).some(o => o.toLowerCase().includes(t));
    });
    $('#lcount').textContent = rows.length + ' ' + plural(rows.length, 'pytanie', 'pytania', 'pytań');
    $('#rows').innerHTML = rows.map(p => {
      const s = pq.get(String(p.id)); const st = statusOf(s);
      return `<button class="qrow" data-act="open" data-id="${esc(p.id)}"><span class="id">${esc(p.id)}</span>
        <span class="tx">${esc(snip(p.pytanie, 160))}<small>${s ? `Błędy: ${s.w}/${s.n}` : 'Nieodpowiadane'}${p.poprawna ? '' : ' · brak klucza'}</small></span>
        <span class="tag ${st}">${STATUS[st]}</span></button>`;
    }).join('');
  };
  $('#lq').oninput = e => { listText = e.target.value; draw(); };
  $('#chips').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; listFilter = b.dataset.f; $('#chips').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); draw(); };
  draw();
}

function viewSettings() {
  const withKey = Q.filter(p => p.poprawna).length;
  const sel = (id, val, items) => `<select id="${id}">${items.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  view().innerHTML = `<h1>Ustawienia</h1>
    <div class="card"><h3>Wygląd</h3><div class="row">
      <label class="small muted">Rozmiar tekstu<br>${sel('fs', settings.size, [['s', 'Mały'], ['m', 'Średni'], ['l', 'Duży'], ['xl', 'Bardzo duży']])}</label>
      <label class="small muted">Motyw<br>${sel('theme', settings.theme, [['auto', 'Automatyczny'], ['light', 'Jasny'], ['dark', 'Ciemny']])}</label></div></div>
    <div class="card"><h3>Nauka</h3>
      <label class="row"><input type="checkbox" id="wk" ${settings.withoutKey ? 'checked' : ''}> <span>Uwzględniaj pytania bez klucza odpowiedzi w trybach losowych</span></label></div>
    <div class="card"><h3>Pytania (dane wejściowe)</h3>
      <p class="small muted">Aktywny zbiór: <b>${esc(DS.nazwa || DS.zbior)}</b><br>wersja ${esc(DS.wersja || '–')} · ${Q.length} pytań (${withKey} z kluczem) · źródło: ${esc(DS_SRC)}</p>
      <div class="btns"><button class="btn" id="impQ">Wczytaj plik z pytaniami (JSON)</button>
      <button class="btn ghost ${store.get('gios:override', null) ? '' : 'hidden'}" id="rstQ">Wróć do wbudowanych pytań</button></div>
      <p class="small muted" style="margin:8px 0 0">Wczytany plik jest zapamiętany w tym urządzeniu. Postęp jest przypisany do identyfikatora zbioru („zbior”) i numerów pytań – po dodaniu kluczy odpowiedzi lub komentarzy do tego samego zbioru postęp zostaje.</p></div>
    <div class="card"><h3>Kopia zapasowa postępu</h3>
      <p class="small muted">Dane są tylko w tej przeglądarce/aplikacji (${attempts.length} zapisanych odpowiedzi). Kopię można przenieść na inne urządzenie.</p>
      <div class="btns"><button class="btn" id="expP">Pobierz kopię postępu</button><button class="btn" id="impP">Wczytaj kopię postępu</button></div></div>
    <div class="card"><h3>Usuwanie danych</h3>
      <button class="btn danger" id="rstP">Wyzeruj mój postęp</button></div>
    <p class="small muted">Wersja aplikacji ${APP_VERSION}</p>`;
  $('#fs').onchange = e => { settings.size = e.target.value; saveSettings(); applyLook(); };
  $('#theme').onchange = e => { settings.theme = e.target.value; saveSettings(); applyLook(); };
  $('#wk').onchange = e => { settings.withoutKey = e.target.checked; saveSettings(); };
  $('#impQ').onclick = importQuestions;
  $('#rstQ').onclick = async () => { store.del('gios:override'); toast('Przywrócono wbudowane pytania.'); await initData(); route(); };
  $('#expP').onclick = () => { download(`postep-egzamin-ios-${DS.zbior}-${dayKey(Date.now())}.json`, { format: 'gios-postep', zbior: DS.zbior, attempts, state }); toast('Kopia postępu została pobrana.'); };
  $('#impP').onclick = importProgress;
  $('#rstP').onclick = async () => {
    if (await modal('Wyzerować postęp?', 'Wszystkie zapisane odpowiedzi i statystyki zostaną usunięte. Tej operacji nie można cofnąć (chyba że masz kopię postępu).', [{ label: 'Anuluj', value: false }, { label: 'Wyzeruj', value: true, cls: 'danger' }])) {
      attempts = []; state = { seq: null }; saveAttempts(); saveState(); toast('Postęp został wyzerowany.'); route();
    }
  };
}

async function importQuestions() {
  const txt = await pickFile(); if (txt == null) return;
  try {
    const d = JSON.parse(txt); validate(d);
    if (!store.set('gios:override', d)) return;
    await initData(); toast(`Wczytano ${d.pytania.length} pytań.`); route();
  } catch (e) { modal('Nie udało się wczytać pliku', e.message, [{ label: 'OK', value: 1, cls: 'pri' }]); }
}
async function importProgress() {
  const txt = await pickFile(); if (txt == null) return;
  let d; try { d = JSON.parse(txt); if (d.format !== 'gios-postep' || !Array.isArray(d.attempts)) throw 0; } catch (e) { modal('To nie jest kopia postępu', 'Wybierz plik pobrany przyciskiem „Pobierz kopię postępu”.', [{ label: 'OK', value: 1, cls: 'pri' }]); return; }
  if (d.zbior !== DS.zbior) { modal('Inny zbiór pytań', `Kopia dotyczy zbioru „${d.zbior}”, a aktywny jest „${DS.zbior}”.`, [{ label: 'OK', value: 1, cls: 'pri' }]); return; }
  const c = await modal('Wczytać kopię postępu?', `Kopia zawiera ${d.attempts.length} odpowiedzi, a w aplikacji jest ich teraz ${attempts.length}.`,
    [{ label: 'Anuluj', value: 0 }, { label: 'Zastąp', value: 'replace', cls: 'danger' }, { label: 'Połącz', value: 'merge', cls: 'pri' }]);
  if (!c) return;
  if (c === 'replace') attempts = d.attempts;
  else { const seen = new Set(attempts.map(a => a[0] + ':' + a[1])); for (const a of d.attempts) if (!seen.has(a[0] + ':' + a[1])) attempts.push(a); attempts.sort((x, y) => x[0] - y[0]); }
  if (d.state) state = Object.assign(state, d.state);
  saveAttempts(); saveState(); toast('Postęp został wczytany.'); route();
}

/* ---------- routing i start ---------- */
const routes = { home: viewHome, q: viewQuestion, stats: viewStats, list: viewList, settings: viewSettings, summary: viewSummary };
function route() {
  if (!DS) return;
  const name = (location.hash || '#/').slice(2).split('?')[0] || 'home';
  const fn = routes[name] || viewHome;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (name === 'q' || name === 'summary' ? 'home' : name)));
  fn(); window.scrollTo(0, 0);
  const h = name === 'q' ? null : view().querySelector('h1'); // przycisk wyjścia z aplikacji (✕) w prawym górnym rogu
  if (h) { h.classList.add('hx'); h.insertAdjacentHTML('beforeend', '<button class="btn ghost xbtn" data-act="exit" aria-label="Wyjdź z aplikacji" title="Wyjdź z aplikacji">✕</button>'); }
}
function applyLook() {
  const r = document.documentElement;
  r.classList.remove('fs-s', 'fs-l', 'fs-xl'); if (settings.size !== 'm') r.classList.add('fs-' + settings.size);
  r.dataset.theme = settings.theme;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const f = actions[b.dataset.act]; if (f) f(b.dataset);
});
document.addEventListener('keydown', e => {
  if (location.hash !== '#/q' || !cur || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase(); const keys = optKeys(cur.p);
  const answered = cur.solved || cur.revealed || cur.unverified;
  let idx = keys.indexOf(k); if (idx < 0 && /^[1-9]$/.test(k) && +k <= keys.length) idx = +k - 1;
  if (idx >= 0 && !answered) { actions.pick({ k: keys[idx] }); e.preventDefault(); }
  else if ((k === 'enter' || k === 'arrowright') && answered) { e.preventDefault(); actions.next(); }
  else if (k === 'r') actions.retry();
  else if (k === 'p') actions.reveal();
  else if (k === 's' && !answered && !cur.wrong.size && session.mode !== 'one') actions.skip();
});
window.addEventListener('hashchange', route);

(async function main() {
  try {
    const s = store.get('gios:settings', null); if (s) settings = Object.assign(settings, s); applyLook();
    await initData(); applyLook(); route();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  } catch (e) {
    view().innerHTML = `<h1>Nie można wczytać pytań</h1><p>${esc(e.message)}</p><p class="muted">Jeśli otwierasz plik bezpośrednio z dysku, użyj wersji „offline” (pojedynczy plik HTML) albo uruchom aplikację z serwera. Możesz też wczytać plik pytań (JSON) w Ustawieniach.</p><p><button class="btn pri" onclick="location.hash='#/settings'">Ustawienia</button></p>`;
    routes.settings = () => { view().innerHTML = '<p>Brak danych.</p>'; };
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      const ask = w => toast('Dostępna nowa wersja aplikacji.', { label: 'Odśwież', fn: () => w.postMessage('skip') });
      if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
      });
    }).catch(() => { });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
  }
})();
