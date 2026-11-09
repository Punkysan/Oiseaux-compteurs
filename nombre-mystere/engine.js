/* Nombre mystère — moteur de jeu pur (navigateur + Node).
   Règle : placer les nombres de 1 à 9 sur une grille de 9 cases (3x3).
   Huit cases contiennent un dessin représentant une quantité (à compter) ;
   la 9e case contient un point d'interrogation et reçoit le nombre restant
   (le « nombre mystère », qui vaut 2 points). Chaque nombre 1-9 n'est utilisé qu'une fois. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NombreMystere = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SIZE = 9; // grille 3x3
  const EMOJIS = ['🐦', '⭐', '🍎', '⚽', '🎈', '🐟', '🍓', '🌸', '🐸', '🍩'];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* Génère une grille : 8 cases « dessin » avec des valeurs distinctes (1-9),
     1 case « mystère » avec la valeur restante. Les valeurs couvrent exactement 1..9. */
  function createPuzzle(rng) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    const mysteryIndex = Math.floor(rng() * SIZE);
    const mysteryValue = nums[8];
    const drawValues = nums.slice(0, 8);
    const emojis = shuffle(EMOJIS.slice(), rng);
    const cells = [];
    let d = 0;
    for (let i = 0; i < SIZE; i++) {
      if (i === mysteryIndex) {
        cells.push({ index: i, kind: 'mystery', value: mysteryValue });
      } else {
        cells.push({ index: i, kind: 'draw', value: drawValues[d], emoji: emojis[d] });
        d++;
      }
    }
    return cells;
  }

  function newGame(options) {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    const allHuman = !!opts.allHuman;
    const n = Math.min(4, Math.max(2, opts.numPlayers | 0));
    const names = (opts.names || []).slice(0, n);
    while (names.length < n) {
      const i = names.length;
      names.push(allHuman ? 'Joueur ' + (i + 1) : (i === 0 ? 'Toi' : 'Robot ' + i));
    }
    const players = names.map((name, i) => ({
      id: i, name, isBot: allHuman ? false : i !== 0, score: 0, roundScore: 0,
    }));
    const state = {
      players,
      cells: createPuzzle(rng),
      placed: {},          // index de case -> nombre posé
      used: {},            // nombre -> true (étiquettes 1..9 à usage unique)
      current: Math.floor(rng() * n),
      phase: 'play',
      round: 1,
      matchRounds: opts.matchRounds || 1,
      difficulty: opts.difficulty === 'easy' ? 'easy' : 'normal',
      rng,
      results: [],
      _finished: false,
    };
    return state;
  }

  function unplacedCells(state) {
    return state.cells.map((c) => c.index).filter((i) => state.placed[i] === undefined);
  }

  function availableNumbers(state) {
    const out = [];
    for (let n = 1; n <= 9; n++) if (!state.used[n]) out.push(n);
    return out;
  }

  /* Pose l'étiquette `num` sur la case `cellIndex` pour le joueur `pi`.
     Retourne les événements du coup. */
  function placeNumber(state, pi, cellIndex, num) {
    if (state.phase !== 'play') throw new Error('La manche est terminée');
    if (pi !== state.current) throw new Error("Ce n'est pas à ce joueur de jouer");
    const cell = state.cells[cellIndex];
    if (!cell) throw new Error('Case invalide');
    if (state.placed[cellIndex] !== undefined) throw new Error('Case déjà étiquetée');
    if (state.used[num]) throw new Error('Ce nombre est déjà utilisé');
    if (!(num >= 1 && num <= 9)) throw new Error('Nombre invalide (1 à 9)');

    const events = [];
    if (num === cell.value) {
      state.placed[cellIndex] = num;
      state.used[num] = true;
      const points = cell.kind === 'mystery' ? 2 : 1;
      state.players[pi].score += points;
      state.players[pi].roundScore += points;
      events.push({ type: 'correct', player: pi, cell: cellIndex, num, points, mystery: cell.kind === 'mystery' });
    } else {
      events.push({ type: 'wrong', player: pi, cell: cellIndex, num });
    }
    state.current = (state.current + 1) % state.players.length;
    if (Object.keys(state.placed).length === SIZE) {
      state.phase = 'roundOver';
      events.push({ type: 'roundOver' });
    }
    return events;
  }

  function finishRound(state) {
    if (state._finished) return state.results[state.results.length - 1];
    state._finished = true;
    const scores = state.players.map((p) => ({ player: p.id, name: p.name, roundScore: p.roundScore, total: p.score }));
    const max = Math.max(...scores.map((s) => s.roundScore));
    const winners = scores.filter((s) => s.roundScore === max).map((s) => s.player);
    const mysteryCell = state.cells.find((c) => c.kind === 'mystery');
    const result = { round: state.round, scores, winners, mystery: { cell: mysteryCell.index, value: mysteryCell.value } };
    state.results.push(result);
    return result;
  }

  function nextRound(state) {
    state.round++;
    state.cells = createPuzzle(state.rng);
    state.placed = {};
    state.used = {};
    state.phase = 'play';
    state._finished = false;
    for (const p of state.players) p.roundScore = 0;
  }

  function matchWinner(state) {
    const totals = state.players.map((p) => ({ player: p.id, name: p.name, total: p.score }));
    const max = Math.max(...totals.map((t) => t.total));
    return { entries: totals, winners: totals.filter((t) => t.total === max).map((t) => t.player) };
  }

  function botChooseAction(state, pi, rng) {
    const r = rng || Math.random;
    const cells = unplacedCells(state);
    const avail = availableNumbers(state);
    const cell = cells[Math.floor(r() * cells.length)];
    if (state.difficulty === 'easy') {
      return { cell, num: avail[Math.floor(r() * avail.length)] };
    }
    return { cell, num: state.cells[cell].value }; // normal : toujours juste
  }

  return {
    SIZE, EMOJIS, mulberry32, shuffle, createPuzzle,
    newGame, placeNumber, unplacedCells, availableNumbers,
    finishRound, nextRound, matchWinner, botChooseAction,
  };
});
