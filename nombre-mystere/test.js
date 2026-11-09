/* Tests du moteur « Nombre mystère » — lancer avec : node nombre-mystere/test.js (depuis la racine) */
'use strict';
const assert = require('node:assert');
const path = require('path');
const E = require(path.join(__dirname, 'engine.js'));

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ok -', msg); }

console.log('Génération de la grille :');
for (let seed = 0; seed < 3; seed++) {
  const cells = E.createPuzzle(E.mulberry32(seed));
  ok(cells.length === 9, 'grille de 9 cases (graine ' + seed + ')');
  const values = cells.map((c) => c.value).sort((a, b) => a - b);
  ok(values.join(',') === '1,2,3,4,5,6,7,8,9', 'les 9 valeurs couvrent exactement 1..9 (graine ' + seed + ')');
  ok(cells.filter((c) => c.kind === 'mystery').length === 1, 'exactement une case « ? » (graine ' + seed + ')');
  const draws = cells.filter((c) => c.kind === 'draw');
  ok(draws.length === 8 && new Set(draws.map((c) => c.value)).size === 8, '8 dessins à valeurs distinctes (graine ' + seed + ')');
  ok(draws.every((c) => c.emoji && c.value >= 1 && c.value <= 9), 'chaque dessin a un emoji et une quantité 1..9 (graine ' + seed + ')');
}
{
  let allOk = true;
  for (let seed = 0; seed < 500; seed++) {
    const cells = E.createPuzzle(E.mulberry32(seed));
    const values = cells.map((c) => c.value).sort((a, b) => a - b).join(',');
    if (cells.length !== 9 || values !== '1,2,3,4,5,6,7,8,9' || cells.filter((c) => c.kind === 'mystery').length !== 1) allOk = false;
  }
  ok(allOk, '500 grilles valides : 9 cases, valeurs = permutation de 1..9, une seule case « ? »');
}

console.log('Mise en place et coups :');
{
  const s = E.newGame({ numPlayers: 2, names: ['Léa', 'Tom'], allHuman: true, rng: E.mulberry32(1), matchRounds: 1 });
  ok(s.players.length === 2 && s.players.every((p) => !p.isBot), 'mode hotseat : 2 humains, aucun robot');
  ok(s.players[0].name === 'Léa' && s.players[1].name === 'Tom', 'prénoms conservés');
  ok(s.phase === 'play' && s.cells.length === 9, 'partie lancée, grille prête');
}
{
  const s = E.newGame({ numPlayers: 2, rng: E.mulberry32(2) });
  ok(s.players[1].isBot && !s.players[0].isBot, 'mode par défaut : Toi contre 1 robot');
}
{
  // coups corrects / incorrects
  const s = E.newGame({ numPlayers: 2, names: ['A', 'B'], allHuman: true, rng: E.mulberry32(3) });
  const pi = s.current;
  const cellIdx = E.unplacedCells(s)[0];
  const trueValue = s.cells[cellIdx].value;
  const other = E.availableNumbers(s).find((n) => n !== trueValue);
  const evWrong = E.placeNumber(s, pi, cellIdx, other);
  ok(evWrong[0].type === 'wrong' && s.placed[cellIdx] === undefined && !s.used[other], 'mauvais nombre : rien n\'est posé, le nombre reste disponible');
  ok(s.current === (pi + 1) % 2, 'le tour passe après un mauvais coup');
  const evOk = E.placeNumber(s, (pi + 1) % 2, cellIdx, trueValue);
  ok(evOk[0].type === 'correct' && s.placed[cellIdx] === trueValue && s.used[trueValue], 'bon nombre : étiquette posée, nombre consommé');
  const pts = s.cells[cellIdx].kind === 'mystery' ? 2 : 1;
  ok(s.players[(pi + 1) % 2].roundScore === pts, 'points : ' + pts + (pts === 2 ? ' (case « ? » = 2 points)' : ''));
  assert.throws(() => E.placeNumber(s, s.current, cellIdx, 5), /déjà étiquetée/);
  passed++; console.log('  ok - case déjà étiquetée : coup refusé');
  assert.throws(() => E.placeNumber(s, s.current, E.unplacedCells(s)[0], trueValue), /déjà utilisé/);
  passed++; console.log('  ok - nombre déjà utilisé : coup refusé');
  assert.throws(() => E.placeNumber(s, (s.current + 1) % 2, E.unplacedCells(s)[0], 1), /pas à ce joueur/);
  passed++; console.log('  ok - mauvais joueur : coup refusé');
}
{
  // manche complète : on pose les 9 bons nombres
  const rng = E.mulberry32(42);
  const s = E.newGame({ numPlayers: 2, names: ['A', 'B'], allHuman: true, rng, matchRounds: 3 });
  let guard = 0;
  while (s.phase === 'play' && guard++ < 50) {
    const cells = E.unplacedCells(s);
    const c = cells[Math.floor(rng() * cells.length)];
    E.placeNumber(s, s.current, c, s.cells[c].value);
  }
  ok(s.phase === 'roundOver', 'manche terminée après les 9 étiquettes');
  const res = E.finishRound(s);
  ok(res.winners.length >= 1 && res.scores.length === 2, 'vainqueur de manche déterminé');
  ok(res.mystery && res.mystery.value >= 1 && res.mystery.value <= 9, 'nombre mystère exposé : ' + res.mystery.value);
  const sumRound = res.scores.reduce((a, x) => a + x.roundScore, 0);
  ok(sumRound === 10, 'total des points d\'une manche = 8 + 2 (mystère) = 10, reçu : ' + sumRound);
  E.nextRound(s);
  ok(s.round === 2 && s.phase === 'play' && Object.keys(s.placed).length === 0, 'manche suivante : nouvelle grille, étiquettes réinitialisées');
  ok(s.players.every((p) => p.roundScore === 0 && p.score > 0), 'scores de manche remis à zéro, totaux conservés');
}

console.log('Parties complètes simulées (robots) :');
{
  for (let n = 2; n <= 4; n++) {
    for (const diff of ['easy', 'normal']) {
      for (let seed = 1; seed <= 10; seed++) {
        const rng = E.mulberry32(seed * 991 + n);
        const s = E.newGame({ numPlayers: n, rng, difficulty: diff, matchRounds: 1 });
        let turns = 0;
        while (s.phase === 'play' && turns++ < 200) {
          const a = E.botChooseAction(s, s.current, rng);
          E.placeNumber(s, s.current, a.cell, a.num);
        }
        ok(s.phase === 'roundOver', `partie ${n} joueurs (${diff}), graine ${seed} terminée en ${turns} coups`);
        const res = E.finishRound(s);
        ok(res.scores.reduce((a, x) => a + x.roundScore, 0) <= 10, 'points cohérents');
      }
    }
  }
  // robot normal = toujours juste
  const s = E.newGame({ numPlayers: 2, rng: E.mulberry32(7), difficulty: 'normal' });
  const a = E.botChooseAction(s, s.current, E.mulberry32(1));
  ok(s.cells[a.cell].value === a.num, 'robot normal : propose toujours la bonne étiquette');
}

console.log('\nTous les tests ont réussi (' + passed + ' assertions).');
