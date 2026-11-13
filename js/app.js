import { parseCalendar } from './parser.js';
import { computeStandings } from './standings.js';
import { extractItems } from './pdf-extract.js';

// Pagina del CSI da cui scaricare il PDF aggiornato (campionato della Fulgur).
const CSI_URL = 'https://live.centrosportivoitaliano.it/26/Pallavolo/Emilia-Romagna/Faenza/C36804/?j=NEU9REhMJjRGPWNpYiY0Rz1HSkxESCY0SD1GTUZER0cmNEk9YjJyMCBadjU2MSBScHByeXlyMENuJjRMPUVGSCY0Mj1l';
const STORE_KEY = 'volley-csi:v1';
const DEFAULT_TEAM = 'fulgur';
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const ICON = {
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

let state = { championships: [], team: DEFAULT_TEAM, tableChamp: null, calFilter: 'mine', removed: [] };

// ---------- Storage ----------
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      championships: state.championships, team: state.team, calFilter: state.calFilter, removed: state.removed || [],
    }));
  } catch { /* storage non disponibile: i dati restano solo in memoria */ }
}

// Tiene per ogni campionato la versione con la data di elaborazione più recente.
function mergeChampionships(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const c of list || []) {
      const prev = byId.get(c.id);
      if (!prev || (c.generatedAt || '') >= (prev.generatedAt || '')) byId.set(c.id, c);
    }
  }
  return [...byId.values()];
}

// ---------- Helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMine = (name) => name.toLowerCase().includes(state.team.toLowerCase());
const when = (m) => new Date(`${m.date}T${m.time || '21:00'}:00`);
const played = (m) => !!m.result;
const sortByDate = (a, b) => when(a) - when(b);
const fmtStamp = (iso) => {
  if (!iso) return '';
  const [d, t] = iso.split('T');
  const [y, mo, da] = d.split('-');
  return `${da}/${mo}/${y}${t ? ' ' + t.slice(0, 5) : ''}`;
};

function allMatches() {
  return state.championships.flatMap((c) => c.matches.map((m) => ({ ...m, champ: c })));
}

// Le partite giocate non riportano la palestra nel PDF: usiamo quella in cui
// la squadra di casa gioca di solito.
function venueOf(m) {
  if (m.venue) return { text: m.venue, guess: false };
  const same = m.champ.matches.find((x) => x.home === m.home && x.venue);
  return same ? { text: same.venue, guess: true } : null;
}
const mapsUrl = (venue) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;

function myTeamName() {
  for (const c of state.championships) {
    for (const m of c.matches) {
      if (isMine(m.home)) return m.home;
      if (isMine(m.away)) return m.away;
    }
  }
  return state.team;
}

function countdown(d) {
  const ms = d - Date.now();
  if (ms < 0) return 'in corso o appena giocata';
  const days = Math.floor(ms / 864e5);
  const hours = Math.floor((ms % 864e5) / 36e5);
  if (days === 0) return hours <= 1 ? 'tra poco!' : `oggi, tra ${hours} ore`;
  if (days === 1) return 'domani';
  return `tra ${days} giorni`;
}

function dateBlock(m) {
  const d = when(m);
  return `<div class="date"><div class="d">${d.getDate()}</div><div class="m">${MONTHS[d.getMonth()]}</div><div class="h">${esc(m.time || '')}</div></div>`;
}

function matchRow(m, { highlight = true } = {}) {
  const v = venueOf(m);
  const mineGame = isMine(m.home) || isMine(m.away);
  const r = m.result;
  const nameCls = (team, won) => ['name', isMine(team) ? 'mine' : '', won ? 'won' : ''].join(' ');
  let outcome = '';
  if (r && mineGame) {
    const myWin = isMine(m.home) ? r.home > r.away : r.away > r.home;
    outcome = `<span class="pill ${myWin ? 'v' : 'p'}">${myWin ? 'Vinta' : 'Persa'}</span>`;
  }
  const meta = [
    m.round ? `<span>${esc(m.phase || '')} · G${m.round}</span>` : '',
    state.championships.length > 1 ? `<span>${esc(m.champ.title)}</span>` : '',
    m.changed ? '<span class="pill warn" title="Il CSI segnala una variazione su questa gara">variazione</span>' : '',
    outcome,
    r && m.sets.length ? `<span class="sets">${m.sets.map(([a, b]) => `${a}-${b}`).join(' · ')}</span>` : '',
    !r && v ? `<span>${esc(v.text)}${v.guess ? ' (probabile)' : ''}</span>` : '',
  ].filter(Boolean).join('');
  return `
    <div class="match ${highlight && mineGame ? 'mine-row' : ''}">
      ${dateBlock(m)}
      <div class="teams">
        <div class="row"><span class="${nameCls(m.home, r && r.home > r.away)}">${esc(m.home)}</span>${r ? `<span class="sc">${r.home}</span>` : ''}</div>
        <div class="row"><span class="${nameCls(m.away, r && r.away > r.home)}">${esc(m.away)}</span>${r ? `<span class="sc">${r.away}</span>` : ''}</div>
        <div class="meta">${meta}</div>
      </div>
      ${v ? `<a class="maplink" href="${mapsUrl(v.text)}" target="_blank" rel="noopener" aria-label="Apri la palestra in Maps: ${esc(v.text)}" title="${esc(v.text)}">${ICON.map}</a>` : '<span></span>'}
    </div>`;
}

// ---------- Calendar export (.ics) ----------
function icsFor(matches) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const escIcs = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//app_volley_csi//IT', 'CALSCALE:GREGORIAN'];
  for (const m of matches) {
    const start = when(m);
    const end = new Date(start.getTime() + 2 * 36e5);
    const v = venueOf(m);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.champ.id}-${m.id}@app-volley-csi`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escIcs(`🏐 ${m.home} - ${m.away}`)}`,
      v ? `LOCATION:${escIcs(v.text)}` : '',
      `DESCRIPTION:${escIcs(`${m.champ.title} · ${m.phase || ''} giornata ${m.round || ''}${v ? `\n${mapsUrl(v.text)}` : ''}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}
function downloadIcs(matches, name) {
  const blob = new Blob([icsFor(matches)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Views ----------
function renderTeam() {
  const el = document.getElementById('view-team');
  const mine = allMatches().filter((m) => isMine(m.home) || isMine(m.away)).sort(sortByDate);
  if (!mine.length) {
    el.innerHTML = `<div class="card empty">Nessuna partita trovata per “${esc(state.team)}”.<br>Carica un calendario dalla sezione <b>Aggiorna</b>.</div>`;
    return;
  }
  const upcoming = mine.filter((m) => !played(m) && when(m) >= new Date(Date.now() - 3 * 36e5));
  const pending = mine.filter((m) => !played(m) && !upcoming.includes(m));
  const done = mine.filter(played).reverse();
  const next = upcoming[0];

  let html = '';
  if (next) {
    const d = when(next);
    const v = venueOf(next);
    const atHome = isMine(next.home);
    html += `
      <div class="card hero">
        <div class="label">Prossima partita · ${atHome ? 'in casa' : 'in trasferta'}</div>
        <div class="when">${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ore ${esc(next.time || '?')}</div>
        <div class="countdown">${countdown(d)}${next.changed ? ' · ⚠ gara con variazione' : ''}</div>
        <div class="vs">
          <div class="t ${isMine(next.home) ? 'mine' : ''}">${esc(next.home)}</div>
          <div class="x">vs</div>
          <div class="t ${isMine(next.away) ? 'mine' : ''}">${esc(next.away)}</div>
        </div>
        ${v ? `<div class="venue">📍 ${esc(v.text)}${v.guess ? ' (probabile)' : ''}</div>` : '<div class="venue">📍 Palestra da definire</div>'}
        <div class="actions">
          ${v ? `<a class="btn primary" href="${mapsUrl(v.text)}" target="_blank" rel="noopener">${ICON.map} Apri in Maps</a>` : ''}
          <button class="btn" data-ics="next">${ICON.cal} Aggiungi al calendario</button>
        </div>
      </div>`;
  }

  // Riepilogo dalla classifica del campionato principale
  const champ = state.championships.find((c) => c.matches.some((m) => isMine(m.home) || isMine(m.away)));
  if (champ) {
    const row = computeStandings(champ.matches).find((r) => isMine(r.team));
    if (row) {
      html += `<div class="card stats">
        <div><b>${row.pos}°</b><span>posizione</span></div>
        <div><b>${row.points}</b><span>punti</span></div>
        <div><b>${row.won}</b><span>vinte</span></div>
        <div><b>${row.lost}</b><span>perse</span></div>
      </div>`;
    }
  }

  if (upcoming.length) {
    html += `<h2>Prossime (${upcoming.length})</h2><div class="card list">${upcoming.map((m) => matchRow(m, { highlight: false })).join('')}</div>`;
    html += `<div><button class="btn" data-ics="all">${ICON.cal} Esporta tutte le partite nel calendario</button></div>`;
  }
  if (pending.length) {
    html += `<h2>In attesa di risultato</h2><div class="card list">${pending.map((m) => matchRow(m, { highlight: false })).join('')}</div>`;
  }
  if (done.length) {
    html += `<h2>Risultati</h2><div class="card list">${done.map((m) => matchRow(m, { highlight: false })).join('')}</div>`;
  }
  el.innerHTML = html;

  el.querySelector('[data-ics="next"]')?.addEventListener('click', () => downloadIcs([next], 'prossima-partita.ics'));
  el.querySelector('[data-ics="all"]')?.addEventListener('click', () => downloadIcs(upcoming, 'partite-fulgur.ics'));
}

function renderTable() {
  const el = document.getElementById('view-table');
  if (!state.championships.length) {
    el.innerHTML = '<div class="card empty">Nessun campionato caricato.</div>';
    return;
  }
  const champ = state.championships.find((c) => c.id === state.tableChamp) ||
    state.championships.find((c) => c.matches.some((m) => isMine(m.home) || isMine(m.away))) ||
    state.championships[0];
  const rows = computeStandings(champ.matches);
  const playedCount = champ.matches.filter(played).length;

  el.innerHTML = `
    ${state.championships.length > 1 ? `<select id="champ-select" aria-label="Campionato">${state.championships.map((c) => `<option value="${esc(c.id)}" ${c.id === champ.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>` : ''}
    <h2>${esc(champ.title)}</h2>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>#</th><th class="team">Squadra</th><th>Pt</th><th>G</th><th>V</th><th>P</th><th>Set</th><th>Forma</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="${isMine(r.team) ? 'mine' : ''}">
              <td>${r.pos}</td>
              <td class="team" title="${esc(r.team)}">${esc(r.team)}</td>
              <td class="pts">${r.points}</td>
              <td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td>
              <td>${r.setsWon}-${r.setsLost}</td>
              <td><span class="form">${r.form.map((f) => `<i class="${f}" title="${f === 'V' ? 'Vinta' : 'Persa'}"></i>`).join('')}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="note">Classifica calcolata dai ${playedCount} risultati del PDF del CSI (elaborato il ${fmtStamp(champ.generatedAt)}): 3 punti per il 3-0 e il 3-1, 2 punti a chi vince 3-2 e 1 a chi perde. Eventuali penalizzazioni non sono nel PDF: in caso di dubbio fa fede la <a href="${CSI_URL}" target="_blank" rel="noopener">classifica sul sito CSI</a>.</p>`;

  el.querySelector('#champ-select')?.addEventListener('change', (e) => {
    state.tableChamp = e.target.value;
    renderTable();
  });
}

function renderCalendar() {
  const el = document.getElementById('view-calendar');
  const matches = allMatches().filter((m) => state.calFilter === 'all' || isMine(m.home) || isMine(m.away));
  const groups = new Map();
  for (const m of matches) {
    const key = `${m.champ.id}|${m.phase === 'Ritorno' ? 1 : 0}|${String(m.round).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { title: `${m.phase || ''} · giornata ${m.round ?? '?'}`, champ: m.champ.title, list: [] });
    groups.get(key).list.push(m);
  }
  const keys = [...groups.keys()].sort();
  el.innerHTML = `
    <div class="seg" role="group" aria-label="Filtro partite">
      <button data-f="mine" aria-pressed="${state.calFilter === 'mine'}">Solo ${esc(myTeamName())}</button>
      <button data-f="all" aria-pressed="${state.calFilter === 'all'}">Tutte le partite</button>
    </div>
    ${keys.map((k) => {
      const g = groups.get(k);
      return `<h2>${esc(g.title)}${state.championships.length > 1 ? ` · ${esc(g.champ)}` : ''}</h2>
        <div class="card list">${g.list.sort(sortByDate).map((m) => matchRow(m, { highlight: state.calFilter === 'all' })).join('')}</div>`;
    }).join('') || '<div class="card empty">Nessuna partita.</div>'}`;

  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    state.calFilter = b.dataset.f;
    saveStore();
    renderCalendar();
  }));
}

function renderUpdate() {
  const el = document.getElementById('view-update');
  el.innerHTML = `
    <h2>Aggiorna risultati e classifica</h2>
    <div class="card">
      <ol class="steps">
        <li><b>Apri la pagina del campionato sul sito CSI</b>
          <p>Si apre nel browser del telefono (il sito non permette all'app di leggerlo da sola).</p>
          <a class="btn primary" href="${CSI_URL}" target="_blank" rel="noopener">${ICON.ext} Apri sito CSI</a></li>
        <li><b>Scarica il PDF del calendario</b>
          <p>Dalla pagina scarica il calendario in PDF: contiene già tutti i risultati e i set aggiornati.</p></li>
        <li><b>Caricalo qui</b>
          <p>Su Android puoi anche usare <i>Condividi → Fulgur Volley</i> direttamente dal PDF, se l'app è installata.</p>
          <label class="drop" id="drop">
            <input type="file" id="file" accept="application/pdf,.pdf" multiple>
            <b>📄 Scegli il PDF</b>
            <span>oppure trascinalo qui</span>
          </label></li>
      </ol>
    </div>

    <h2>Campionati caricati</h2>
    <div class="card">
      ${state.championships.map((c) => `
        <div class="champ">
          <div>
            <b>${esc(c.title)}</b>
            <span>${esc(c.competition || '')} · ${c.matches.filter(played).length}/${c.matches.length} giocate · dati del ${fmtStamp(c.generatedAt)}</span>
          </div>
          <button class="icon-btn" data-del="${esc(c.id)}" aria-label="Rimuovi ${esc(c.title)}">${ICON.trash}</button>
        </div>`).join('') || '<div class="empty">Nessun campionato.</div>'}
    </div>
    <p class="note">Puoi caricare i PDF di più campionati: le partite della tua squadra vengono raggruppate in un'unica lista.</p>

    <h2>La mia squadra</h2>
    <div class="card pad">
      <select id="team-select" aria-label="La mia squadra">
        ${teamOptions().map((t) => `<option value="${esc(t)}" ${isMine(t) ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>
    </div>`;

  const input = el.querySelector('#file');
  input.addEventListener('change', () => importFiles([...input.files]));
  const drop = el.querySelector('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    importFiles([...e.dataTransfer.files]);
  });
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const c = state.championships.find((x) => x.id === b.dataset.del);
    if (!c || !confirm(`Rimuovere "${c.title}"?`)) return;
    state.championships = state.championships.filter((x) => x.id !== c.id);
    state.removed = [...new Set([...(state.removed || []), c.id])];
    saveStore();
    renderAll();
  }));
  el.querySelector('#team-select')?.addEventListener('change', (e) => {
    state.team = e.target.value;
    saveStore();
    renderAll();
    toast(`Squadra impostata: ${e.target.value}`);
  });
}

function teamOptions() {
  const set = new Set();
  for (const c of state.championships) for (const m of c.matches) { set.add(m.home); set.add(m.away); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function renderAll() {
  const name = myTeamName();
  document.getElementById('team-title').textContent = name;
  document.title = `${name} · Volley CSI`;
  const latest = state.championships.map((c) => c.generatedAt).filter(Boolean).sort().pop();
  document.getElementById('data-stamp').textContent = latest
    ? `Dati CSI del ${fmtStamp(latest)}`
    : 'Nessun dato: carica un calendario';
  renderTeam();
  renderTable();
  renderCalendar();
  renderUpdate();
}

// ---------- Import ----------
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function importFiles(files) {
  const pdfs = files.filter((f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')));
  if (!pdfs.length) { toast('Seleziona un file PDF', true); return; }
  toast('Lettura del PDF…');
  try {
    const pdfjs = await loadPdfjs();
    const msgs = [];
    for (const f of pdfs) {
      const items = await extractItems(pdfjs, new Uint8Array(await f.arrayBuffer()));
      const c = parseCalendar(items);
      if (!c.matches.length) throw new Error(`"${f.name}" non sembra un calendario del CSI`);
      c.importedAt = new Date().toISOString();
      const prev = state.championships.find((x) => x.id === c.id);
      const before = prev ? prev.matches.filter(played).length : 0;
      state.championships = [...state.championships.filter((x) => x.id !== c.id), c];
      state.removed = (state.removed || []).filter((id) => id !== c.id);
      const now = c.matches.filter(played).length;
      msgs.push(`${c.title}: ${now} risultati${prev ? ` (${now - before >= 0 ? '+' : ''}${now - before} nuovi)` : ''}`);
    }
    saveStore();
    renderAll();
    showTab('team');
    toast(`Aggiornato ✓ ${msgs.join(' · ')}`);
  } catch (err) {
    console.error(err);
    toast(`Impossibile leggere il PDF: ${err.message}`, true);
  }
}

// PDF condiviso dall'app di sistema (Android, Web Share Target).
async function checkSharedFile() {
  if (!new URLSearchParams(location.search).has('shared') || !('caches' in window)) return;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open('share-inbox');
    const keys = await cache.keys();
    const files = [];
    for (const req of keys) {
      const res = await cache.match(req);
      const blob = await res.blob();
      files.push(new File([blob], decodeURIComponent(req.url.split('/').pop()) || 'calendario.pdf', { type: 'application/pdf' }));
      await cache.delete(req);
    }
    if (files.length) await importFiles(files);
  } catch (err) {
    console.error(err);
  }
}

// ---------- UI plumbing ----------
let toastTimer;
function toast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 6000 : 3500);
}

function showTab(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  try { sessionStorage.setItem('tab', name); } catch { /* ignora */ }
  window.scrollTo(0, 0);
}

async function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  const saved = loadStore();
  if (saved) {
    state.team = saved.team || DEFAULT_TEAM;
    state.calFilter = saved.calFilter || 'mine';
    state.removed = saved.removed || [];
  }
  let bundled = [];
  try {
    const res = await fetch('data/campionati.json', { cache: 'no-cache' });
    if (res.ok) bundled = (await res.json()).championships || [];
  } catch { /* offline: usiamo i dati salvati */ }
  state.championships = mergeChampionships(bundled, saved?.championships)
    .filter((c) => !(state.removed || []).includes(c.id));
  saveStore();
  renderAll();

  let tab = 'team';
  try { tab = sessionStorage.getItem('tab') || 'team'; } catch { /* ignora */ }
  showTab(tab);

  await checkSharedFile();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
