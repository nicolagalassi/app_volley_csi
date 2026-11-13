import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractItems } from '../js/pdf-extract.js';
import { parseCalendar } from '../js/parser.js';
import { computeStandings, pointsFor } from '../js/standings.js';

const PDF = new URL('./fixtures/calendario-open-misto-eccellenza.pdf', import.meta.url);
const champ = parseCalendar(await extractItems(pdfjs, new Uint8Array(fs.readFileSync(PDF))));
const fulgur = champ.matches.filter((m) => /fulgur/i.test(m.home + m.away));

test('legge intestazione e tutte le partite', () => {
  assert.equal(champ.title, 'Open Misto / Eccellenza');
  assert.equal(champ.generatedAt, '2026-11-13T11:42');
  assert.equal(champ.matches.length, 56); // 8 squadre, 14 giornate x 4 partite
  assert.equal(fulgur.length, 14);
});

test('legge risultati e parziali dei set', () => {
  const m = champ.matches.find((x) => x.home === 'Fulgur Mixer' && x.away === 'SBT Volley Clai');
  assert.deepEqual(m.result, { home: 3, away: 0 });
  assert.deepEqual(m.sets, [[25, 11], [25, 22], [25, 20]]);
  assert.equal(m.date, '2026-11-11');
  assert.equal(m.time, '21:15');

  const four = champ.matches.find((x) => x.home === 'Ciupino' && x.away === 'Furie Rosse');
  assert.deepEqual(four.result, { home: 3, away: 1 });
  assert.deepEqual(four.sets, [[25, 19], [25, 21], [20, 25], [25, 17]]);

  const away = champ.matches.find((x) => x.home === 'C.U.S.B. Cesena' && x.away === 'Pallavolo Faenza');
  assert.deepEqual(away.result, { home: 0, away: 3 });
});

test('legge palestra su più righe, codice gara e variazioni', () => {
  const m = champ.matches.find((x) => x.code === 'PVMEC11');
  assert.equal(m.home, 'Fulgur Mixer');
  assert.equal(m.away, 'Pallavolo Faenza');
  assert.equal(m.phase, 'Andata');
  assert.equal(m.round, 3);
  assert.equal(m.venue, 'Palestra Scuole Elementari di Villanova Via Giuseppe Ungaretti, 11 - 48012 Bagnacavallo RA');
  assert.equal(m.result, null);

  const moved = champ.matches.find((x) => x.home === 'Furie Rosse' && x.away === 'Fulgur Mixer' && x.phase === 'Andata');
  assert.equal(moved.changed, true);
  assert.equal(moved.date, '2027-01-22');
});

test('punti secondo il punteggio', () => {
  assert.equal(pointsFor(3, 0), 3);
  assert.equal(pointsFor(3, 1), 3);
  assert.equal(pointsFor(3, 2), 2);
  assert.equal(pointsFor(2, 3), 1);
  assert.equal(pointsFor(1, 3), 0);
});

test('classifica calcolata dai risultati', () => {
  const t = computeStandings(champ.matches);
  assert.equal(t.length, 8);
  const f = t.find((r) => r.team === 'Fulgur Mixer');
  assert.equal(f.points, 3);
  assert.equal(f.played, 1);
  assert.equal(f.setsWon, 3);
  assert.equal(f.ptsWon, 75);
  // Ciupino ha vinto 3-1: 3 punti ma quoziente set peggiore delle vittorie per 3-0
  assert.equal(t.find((r) => r.team === 'Ciupino').pos, 4);
  assert.equal(t.find((r) => r.team === 'Furie Rosse').points, 0);
});

test('vittoria al tie-break: 2 punti e 1 punto', () => {
  const t = computeStandings([
    { home: 'A', away: 'B', date: '2026-01-01', result: { home: 3, away: 2 }, sets: [] },
  ]);
  assert.deepEqual(t.map((r) => [r.team, r.points]), [['A', 2], ['B', 1]]);
});
