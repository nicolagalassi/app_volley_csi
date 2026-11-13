// Classifica calcolata dai risultati.
//
// Punteggio (regola standard della pallavolo, usata dal CSI):
//   vittoria 3-0 o 3-1 → 3 punti a chi vince, 0 a chi perde
//   vittoria 3-2       → 2 punti a chi vince, 1 a chi perde
// A parità di punti: vittorie, quoziente set, quoziente punti.
// Penalizzazioni o decisioni del giudice non sono nel PDF: in quel caso la
// classifica ufficiale online può differire.

export function pointsFor(won, lost) {
  if (won === 3 && lost <= 1) return 3;
  if (won === 3 && lost === 2) return 2;
  if (won === 2 && lost === 3) return 1;
  return 0;
}

export function computeStandings(matches) {
  const table = new Map();
  const row = (name) => {
    if (!table.has(name)) {
      table.set(name, {
        team: name, played: 0, won: 0, lost: 0, points: 0,
        setsWon: 0, setsLost: 0, ptsWon: 0, ptsLost: 0, form: [],
      });
    }
    return table.get(name);
  };

  // Tutte le squadre compaiono, anche se non hanno ancora giocato.
  for (const m of matches) { row(m.home); row(m.away); }

  const played = matches
    .filter(m => m.result && (m.result.home === 3 || m.result.away === 3))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  for (const m of played) {
    const h = row(m.home), a = row(m.away);
    const { home: hs, away: as } = m.result;
    for (const [r, w, l, sets] of [[h, hs, as, m.sets.map(([x, y]) => [x, y])], [a, as, hs, m.sets.map(([x, y]) => [y, x])]]) {
      r.played++;
      r.setsWon += w; r.setsLost += l;
      r.points += pointsFor(w, l);
      if (w > l) r.won++; else r.lost++;
      for (const [p, q] of sets) { r.ptsWon += p; r.ptsLost += q; }
      r.form.push(w > l ? 'V' : 'P');
    }
  }

  const ratio = (a, b) => (b === 0 ? (a === 0 ? 0 : Infinity) : a / b);
  return [...table.values()].sort((x, y) =>
    y.points - x.points ||
    y.won - x.won ||
    ratio(y.setsWon, y.setsLost) - ratio(x.setsWon, x.setsLost) ||
    ratio(y.ptsWon, y.ptsLost) - ratio(x.ptsWon, x.ptsLost) ||
    x.team.localeCompare(y.team)
  ).map((r, i) => ({ ...r, pos: i + 1, form: r.form.slice(-5) }));
}
