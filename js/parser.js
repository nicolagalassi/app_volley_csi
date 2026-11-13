// Parser del PDF "Calendario" esportato da live.centrosportivoitaliano.it.
//
// Riceve gli elementi di testo estratti con pdf.js ({ str, x, y, size, page })
// e restituisce il campionato con tutte le partite. È una funzione pura, così
// la usano sia l'app nel browser sia lo script tools/parse-pdf.mjs.
//
// Layout del PDF (coordinate in punti, A4):
//   x ≈ 51-56   data (gg/mm/aa), ora (hh:mm), "Andata/Ritorno giornata N"
//   x ≈ 123     squadra di casa, poi squadra ospite
//   x ≈ 341     palestra (1-3 righe, con il codice gara tra parentesi)
//   x ≈ 430-510 punteggi dei singoli set (riga di casa / riga ospite)
//   x ≈ 525     set vinti, "-" se non giocata, "(!)" se c'è una variazione

const RE_DATE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const RE_TIME = /^(\d{1,2}):(\d{2})$/;
const RE_ROUND = /^(Andata|Ritorno)\s+giornata\s+(\d+)$/i;
const RE_NUM = /^\d+$/;
const RE_CODE = /\(([A-Z]{2,}\d+)\)\s*$/;

const X_LEFT_MAX = 100;   // colonna data/ora/giornata
const X_TEAM_MAX = 330;   // colonna squadre
const X_SETS_MIN = 400;   // colonna punteggi set
const X_RESULT_MIN = 515; // colonna set vinti / flag

function isFooter(s) {
  return /centrosportivoitaliano\.it/i.test(s) || /^Elaborato il/i.test(s);
}

/**
 * @param {{str:string,x:number,y:number,size:number,page:number}[]} items
 *   in ordine di lettura (come li restituisce pdf.js pagina per pagina)
 */
export function parseCalendar(items) {
  const header = [];
  let generatedAt = null;
  let phase = null;   // "Andata" | "Ritorno"
  let round = null;   // numero giornata
  let started = false;
  const matches = [];
  let cur = null;

  const finish = () => {
    if (!cur) return;
    matches.push(finalize(cur));
    cur = null;
  };

  for (const it of items) {
    const s = it.str.replace(/\s+/g, ' ').trim();
    if (!s) continue;

    const gen = s.match(/^Elaborato il\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/i);
    if (gen) {
      generatedAt = `${gen[3]}-${gen[2]}-${gen[1]}T${gen[4]}:${gen[5]}`;
      continue;
    }
    if (isFooter(s)) continue;

    if (!started) {
      if (s === 'Calendario') { started = true; continue; }
      if (RE_ROUND.test(s)) started = true;
      else { header.push(s); continue; }
    }

    const r = s.match(RE_ROUND);
    if (r && it.x < X_LEFT_MAX) {
      finish();
      phase = r[1][0].toUpperCase() + r[1].slice(1).toLowerCase();
      round = Number(r[2]);
      continue;
    }

    const d = s.match(RE_DATE);
    if (d && it.x < X_LEFT_MAX) {
      finish();
      cur = {
        phase, round,
        date: `20${d[3]}-${d[2]}-${d[1]}`,
        time: null,
        teams: [],      // [{ name, y }]
        venue: [],
        setItems: [],   // [{ v, x, y }]
        resultItems: [],// [{ v, y }]
        flag: false,
      };
      continue;
    }
    if (!cur) continue;

    if (RE_TIME.test(s) && it.x < X_LEFT_MAX) {
      const [, h, m] = s.match(RE_TIME);
      cur.time = `${h.padStart(2, '0')}:${m}`;
      continue;
    }

    if (it.x >= X_RESULT_MIN) {
      if (s === '(!)') cur.flag = true;
      else if (RE_NUM.test(s)) cur.resultItems.push({ v: Number(s), y: it.y });
      continue;
    }
    if (it.x >= X_SETS_MIN) {
      if (RE_NUM.test(s)) cur.setItems.push({ v: Number(s), x: it.x, y: it.y });
      continue;
    }
    if (it.x >= X_LEFT_MAX && it.x < X_TEAM_MAX && cur.teams.length < 2) {
      cur.teams.push({ name: s, y: it.y });
      continue;
    }
    if (it.x >= X_TEAM_MAX) {
      cur.venue.push(s);
      continue;
    }
  }
  finish();

  const title = header.filter(h => !/CSI|EMILIA/i.test(h)).slice(-1)[0] || header.join(' ');
  return {
    id: slug(title),
    title,
    organizer: header[0] || '',
    competition: header.slice(1, -1).join(' '),
    generatedAt,
    matches,
  };
}

function finalize(c) {
  const [home, away] = c.teams;
  const venueText = c.venue.join(' ').replace(/\s+/g, ' ').trim();
  const codeMatch = venueText.match(RE_CODE);
  const code = codeMatch ? codeMatch[1] : null;
  const venue = codeMatch ? venueText.replace(RE_CODE, '').trim() : venueText;

  // Assegna ogni numero alla riga (casa/ospite) più vicina in verticale.
  const side = (y) => !home || !away ? 0
    : Math.abs(y - home.y) <= Math.abs(y - away.y) ? 0 : 1;

  let result = null;
  let sets = [];
  if (c.resultItems.length >= 2) {
    const res = [null, null];
    for (const r of c.resultItems) res[side(r.y)] = r.v;
    if (res[0] != null && res[1] != null) result = { home: res[0], away: res[1] };
  }
  if (c.setItems.length) {
    const rows = [[], []];
    for (const s of c.setItems) rows[side(s.y)].push(s);
    rows.forEach(r => r.sort((a, b) => a.x - b.x));
    const n = Math.min(rows[0].length, rows[1].length);
    for (let i = 0; i < n; i++) sets.push([rows[0][i].v, rows[1][i].v]);
  }
  // Se mancano i set vinti ma ci sono i parziali, li ricaviamo.
  if (!result && sets.length) {
    result = {
      home: sets.filter(([a, b]) => a > b).length,
      away: sets.filter(([a, b]) => b > a).length,
    };
  }

  return {
    id: code || `${c.phase || ''}${c.round || ''}-${slug(home?.name || '')}-${slug(away?.name || '')}`,
    code,
    phase: c.phase,
    round: c.round,
    date: c.date,
    time: c.time,
    home: home?.name || '?',
    away: away?.name || '?',
    venue: venue || null,
    result,
    sets,
    changed: c.flag,
  };
}

export function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
