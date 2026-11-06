/* Tests du moteur « Oiseau, compte ! » — lancer avec : node test.js */
'use strict';
const assert = require('node:assert');
const E = require('./engine.js');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ok -', msg); }

// ---------- Jeu de cartes ----------
console.log('Composition du jeu :');
{
  const deck = E.createDeck();
  ok(deck.length === 40, '40 cartes au total');
  for (const v of E.VALUES) ok(deck.filter(c => c.value === v).length === 4, '4 cartes de valeur ' + v);
  for (const col of E.COLORS) ok(deck.filter(c => c.color === col).length === 10, '10 cartes ' + col);
}

// ---------- Mise en place ----------
console.log('Mise en place :');
{
  const s = E.newGame({ numPlayers: 1, rng: E.mulberry32(42) });
  ok(s.players.length === 1 && s.solo, 'mode solo avec 1 joueur');
  ok(s.players[0].hand.length === 3, '3 cartes en main');
  ok(s.table.length === 4, '4 cartes exposées (la volière)');
  ok(s.drawPile.length === 40 - 3 - 4, 'pioche = 33 cartes');
  ok(s.current === 0 && s.phase === 'play', 'le joueur commence');
}
{
  const s = E.newGame({ numPlayers: 4, rng: E.mulberry32(7) });
  ok(s.players.every(p => p.hand.length === 3), '3 cartes distribuées à chacun (2-4 joueurs)');
  ok(s.drawPile.length === 40 - 12 - 4, 'pioche = 24 cartes');
  ok(s.current === (s.dealer + 1) % 4, 'le joueur à gauche du donneur commence');
}
{
  // Règle des « 10 » : si 3 ou 4 cartes 10 exposées, on recycle et on réexpose.
  // Pile truquée (pop() prend la fin du tableau) : 1,2,3,4 | 10,10,10,10 | 10,10,10,5 | 9,8,7,6
  const pile = [9, 8, 7, 6, 10, 10, 10, 5, 10, 10, 10, 10, 1, 2, 3, 4].map((v, i) => ({ id: i, value: v, color: 'bleu' }));
  const four = E.drawInitialTable(pile, E.mulberry32(1));
  ok(four.map(c => c.value).sort((a, b) => a - b).join(',') === '1,2,3,4',
    'règle des 10 : volières à 3+ dizaines recyclées, volière finale = 1,2,3,4');
  let worst = 0;
  for (let seed = 0; seed < 500; seed++) {
    const st = E.newGame({ numPlayers: 2, rng: E.mulberry32(seed) });
    const tens = st.table.filter(c => c.value === 10).length;
    worst = Math.max(worst, tens);
    ok(tens <= 2, 'graine ' + seed + ' : volière avec ' + tens + ' dix (<= 2)');
    if (tens > 2) break;
  }
  ok(worst <= 2, 'aucune volière initiale avec 3+ cartes 10 sur 500 parties');
}

// ---------- Captures ----------
console.log('Règles de prise :');
const base = { sum: true, sub: false, parity: false };
{
  const table = [{ value: 5, color: 'jaune' }, { value: 3, color: 'jaune' }, { value: 1, color: 'jaune' }];
  const opts = E.genCaptureSubsets(table, 5, base);
  ok(opts.length === 1 && opts[0][0] === 0, 'valeur identique prioritaire : jouer 5 ramasse le 5 (et pas 3+1)');
  const opts4 = E.genCaptureSubsets(table, 4, base);
  ok(opts4.length === 1 && opts4[0].includes(1) && opts4[0].includes(2), 'jouer 4 ramasse 3+1 (somme)');
  const opts9 = E.genCaptureSubsets(table, 9, base);
  ok(opts9.length === 1 && opts9[0].length === 3, 'jouer 9 ramasse les 3 cartes (5+3+1)');
  const opts6 = E.genCaptureSubsets(table, 6, base);
  ok(opts6.length === 1 && opts6[0].includes(0) && opts6[0].includes(2), 'jouer 6 ramasse 5+1');
  const opts2 = E.genCaptureSubsets(table, 2, base);
  ok(opts2.length === 0, 'jouer 2 ne ramasse rien ici');
}
{
  // Variante 2 : paires ou impaires uniquement
  const table = [{ value: 4 }, { value: 2 }, { value: 5 }, { value: 1 }, { value: 3 }].map((c, i) => ({ id: i, ...c, color: 'bleu' }));
  const opts = E.genCaptureSubsets(table, 6, { sum: true, sub: false, parity: true });
  const has = (a, b) => opts.some(o => o.length === 2 && o.includes(a) && o.includes(b));
  ok(has(0, 1), 'variante 2 : 6 peut ramasser 4+2 (paires)');
  ok(has(2, 3), 'variante 2 : 6 peut ramasser 5+1 (impaires)');
  ok(!opts.some(o => o.length === 3), 'variante 2 : 3+1+2 (mixte) interdit');
}
{
  // Variante 3 : soustraction (8 = 10 - 2)
  const table = [{ id: 0, value: 10, color: 'bleu' }, { id: 1, value: 2, color: 'jaune' }, { id: 2, value: 3, color: 'orange' }];
  const opts = E.genCaptureSubsets(table, 8, { sum: false, sub: true, parity: false });
  ok(opts.length === 1 && opts[0].includes(0) && opts[0].includes(1), 'variante 3 : jouer 8 ramasse 10 et 2 (10-2=8)');
}

// ---------- Déroulement d'un tour ----------
console.log('Déroulement :');
function riggedState(hand, table, pile) {
  const s = E.newGame({ numPlayers: 2, names: ['A', 'B'], rng: E.mulberry32(3) });
  s.players[0].hand = hand; s.players[1].hand = [{ id: 100, value: 9, color: 'bleu' }, { id: 101, value: 9, color: 'jaune' }, { id: 102, value: 9, color: 'orange' }];
  s.table = table; s.drawPile = pile || [{ id: 200, value: 7, color: 'violet' }];
  s.current = 0; s.dealer = 1; s.starter = 0;
  return s;
}
{
  const s = riggedState(
    [{ id: 1, value: 5, color: 'bleu' }, { id: 2, value: 1, color: 'jaune' }, { id: 3, value: 9, color: 'orange' }],
    [{ id: 10, value: 5, color: 'jaune' }, { id: 11, value: 3, color: 'jaune' }, { id: 12, value: 2, color: 'jaune' }],
    [{ id: 200, value: 7, color: 'violet' }]
  );
  const legal = E.legalPlaysForPlayer(s, 0);
  ok(legal.plis.length === 1 && legal.plis[0].handIndex === 0, 'seul le 5 peut faire un pli (identique prioritaire)');
  const ev = E.playTurn(s, 0, { type: 'pli', handIndex: 0, tableIndices: [0] });
  ok(s.players[0].captured.length === 2, 'pli : carte jouée + carte ramassée = 2 cartes capturées');
  ok(s.players[0].hand.length === 3, 'repioche pour revenir à 3 cartes');
  ok(s.current === 1, 'tour passe au joueur suivant');
  ok(ev.some(e => e.type === 'pli') && ev.some(e => e.type === 'draw'), 'événements pli + pioche');
  // capture invalide parmi des options valides : jouer 4 peut ramasser 3+1, mais pas le 5
  const s2 = riggedState([{ id: 1, value: 4, color: 'bleu' }], [{ id: 10, value: 3, color: 'jaune' }, { id: 11, value: 1, color: 'jaune' }, { id: 12, value: 5, color: 'orange' }], []);
  assert.throws(() => E.playTurn(s2, 0, { type: 'pli', handIndex: 0, tableIndices: [2] }), /Capture illégale/);
  passed++; console.log('  ok - capture de somme invalide rejetée');
}
{
  // Piou-Piou : ramasser toute la volière
  const s = riggedState(
    [{ id: 1, value: 10, color: 'bleu' }, { id: 2, value: 1, color: 'jaune' }, { id: 3, value: 9, color: 'orange' }],
    [{ id: 10, value: 4, color: 'jaune' }, { id: 11, value: 6, color: 'violet' }],
    []
  );
  const ev = E.playTurn(s, 0, { type: 'pli', handIndex: 0, tableIndices: [0, 1] });
  ok(s.players[0].piouPiou === 1, 'Piou-Piou ! comptabilisé quand toute la volière est ramassée');
  ok(ev.some(e => e.type === 'piou-piou'), 'événement piou-piou émis');
  // la volière est vide : le joueur suivant doit poser une carte
  const legal = E.legalPlaysForPlayer(s, 1);
  ok(legal.mustExpose && legal.plis.length === 0, 'volière vide : le joueur suivant doit poser une carte au centre');
  assert.throws(() => E.playTurn(s, 1, { type: 'pli', handIndex: 0, tableIndices: [] }), /Pli impossible/);
  passed++; console.log('  ok - pli impossible sur volière vide rejeté');
  const ev2 = E.playTurn(s, 1, { type: 'expose', handIndex: 0 });
  ok(ev2.some(e => e.type === 'expose') && s.table.length === 1, 'pose d\'une carte dans la volière quand aucun pli possible');
}
{
  // On ne peut pas poser quand un pli est possible
  const s = riggedState([{ id: 1, value: 5, color: 'bleu' }], [{ id: 10, value: 5, color: 'jaune' }], []);
  assert.throws(() => E.playTurn(s, 0, { type: 'expose', handIndex: 0 }), /Un pli est possible/);
  passed++; console.log('  ok - poser une carte est interdit quand un pli est possible');
}

// ---------- Scores ----------
console.log('Scores :');
{
  ok(E.countPiles10([{ value: 10 }, { value: 9 }, { value: 1 }, { value: 8 }, { value: 2 }, { value: 5 }, { value: 5 }]) === 4, 'variante 7 : 10 / 9+1 / 8+2 / 5+5 = 4 piles');
  ok(E.longestRun([1, 2, 3, 5, 7, 8]) === 3, 'variante 9 : plus grande suite = 3 (1-2-3)');
  const cards = [{ value: 7 }, { value: 7 }, { value: 7 }, { value: 2 }, { value: 2 }, { value: 5 }];
  const byValue = {}; for (const c of cards) byValue[c.value] = (byValue[c.value] || 0) + 1;
  const carre = Object.values(byValue).reduce((a, c) => a + c * c, 0);
  ok(carre === 14, 'variante 10+ : brelan(9) + paire(4) + solo(1) = 14 points');
  const s = E.newGame({ numPlayers: 2, rng: E.mulberry32(5) });
  s.players[0].captured = cards.map((c, i) => ({ id: i, ...c, color: 'bleu' }));
  s.players[1].captured = [];
  s.scoring = 'sum';
  const sc = E.scoreRound(s);
  ok(sc[0].score === 30, 'variante 8 : somme des valeurs = 7+7+7+2+2+5 = 30');
}
{
  const s = E.newGame({ numPlayers: 1, rng: E.mulberry32(9) });
  s.players[0].piouPiou = 3;
  const sc = E.scoreRound(s);
  ok(sc[0].score === 3, 'mode solo : score = nombre de « Piou-Piou ! »');
}

// ---------- Parties complètes simulées (robots) ----------
console.log('Parties complètes simulées :');
{
  const variantSets = [
    {},
    { parity: true },
    { sub: true },
    { complement10: true },
    { noDraw: true },
    { parity: true, sub: true, complement10: true, piouPiouPoint: true },
  ];
  for (let n = 1; n <= 4; n++) {
    for (let vi = 0; vi < variantSets.length; vi++) {
      for (let seed = 1; seed <= 5; seed++) {
        const rng = E.mulberry32(seed * 1000 + n * 100 + vi);
        const s = E.newGame({
          numPlayers: n, rng, variants: variantSets[vi],
          scoring: ['cards', 'sum', 'piles10', 'suite', 'pointsCarres'][seed % 5],
          matchRounds: 1,
        });
        let turns = 0;
        while (s.phase === 'play' && turns++ < 5000) {
          const a = E.botChooseAction(s, s.current, rng);
          assert.ok(a, 'le robot trouve une action');
          E.playTurn(s, s.current, a);
        }
        ok(s.phase === 'roundOver', `partie ${n} joueur(s), variante ${vi}, graine ${seed} terminée en ${turns} tours`);
        const total = s.drawPile.length + s.table.length +
          s.players.reduce((a, p) => a + p.hand.length + p.captured.length, 0);
        ok(total === 40, `conservation des 40 cartes (${total})`);
        const res = E.finishRound(s);
        ok(res.scores.length === s.players.length && res.winners.length >= 1, 'score et vainqueur de manche calculés');
      }
    }
  }
}

// ---------- Match en plusieurs manches ----------
console.log('Match multi-manches :');
{
  const rng = E.mulberry32(77);
  const s = E.newGame({ numPlayers: 3, rng, matchRounds: 3, matchMode: 'manches' });
  let rounds = 0;
  while (rounds < 3) {
    let turns = 0;
    while (s.phase === 'play' && turns++ < 5000) E.playTurn(s, s.current, E.botChooseAction(s, s.current, rng));
    ok(s.phase === 'roundOver', 'manche ' + (rounds + 1) + ' terminée');
    E.finishRound(s);
    rounds++;
    if (rounds < 3) {
      const prevStarter = s.starter;
      E.nextRound(s);
      ok(s.dealer === prevStarter, 'le donneur suivant est le joueur qui avait commencé la manche');
      ok(s.phase === 'play' && s.roundNumber === rounds + 1, 'nouvelle manche lancée');
    }
  }
  const mw = E.matchWinner(s);
  ok(mw.winners.length >= 1, 'vainqueur du match déterminé (' + mw.winners.map(i => s.players[i].name).join(', ') + ')');
}

console.log('\nTous les tests ont réussi (' + passed + ' assertions).');
