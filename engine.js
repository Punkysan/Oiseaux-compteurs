/* Oiseau, compte ! — moteur de jeu pur (sans DOM).
   Fonctionne dans le navigateur (window.OiseauEngine) et dans Node (module.exports).
   Règles issues du document officiel « Oiseaux-compteurs — Oiseau compte » (MENJS). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OiseauEngine = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const COLORS = ['bleu', 'jaune', 'orange', 'violet'];
  const COLOR_LABELS = { bleu: 'bleu', jaune: 'jaune', orange: 'orange', violet: 'violet' };
  const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const HAND_SIZE = 3;
  const TABLE_START = 4;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createDeck() {
    const deck = [];
    let id = 0;
    for (const color of COLORS) {
      for (const v of VALUES) deck.push({ id: id++, value: v, color });
    }
    return deck;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function cardLabel(c) { return c.value + ' ' + COLOR_LABELS[c.color]; }

  function sameSet(a, b) {
    return a.length === b.length && a.every(x => b.includes(x));
  }

  /* Toutes les captures possibles sur la table pour une carte jouée de valeur `value`.
     - Règle de base : une carte exposée de valeur identique (prioritaire), ou un sous-ensemble
       dont la somme vaut `value`.
     - Variante 2 (parity) : les cartes ramassées doivent être toutes paires ou toutes impaires.
     - Variante 3 (sub) : remplace la somme par une soustraction (plus grande carte - le reste = value). */
  function genCaptureSubsets(table, value, rules) {
    const identical = [];
    for (let i = 0; i < table.length; i++) {
      if (table[i].value === value) identical.push([i]);
    }
    if (identical.length > 0) return identical;

    const out = [];
    const n = table.length;
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    order.sort((a, b) => table[b].value - table[a].value);

    function rec(start, chosen, sum, maxV) {
      if (chosen.length > 0) {
        if (rules.sum && sum === value) out.push(chosen.slice());
        if (rules.sub && maxV - (sum - maxV) === value) out.push(chosen.slice());
      }
      for (let k = start; k < n; k++) {
        const i = order[k];
        const v = table[i].value;
        if (sum + v > 20) continue; // borne: somme utile max = 10 (somme) ou 2*max - value <= 19
        chosen.push(i);
        rec(k + 1, chosen, sum + v, Math.max(maxV, v));
        chosen.pop();
      }
    }
    rec(0, [], 0, 0);

    if (rules.parity) {
      return out.filter(idxs => {
        const p = table[idxs[0]].value % 2;
        return idxs.every(i => table[i].value % 2 === p);
      });
    }
    return out;
  }

  /* Coups légaux du joueur pi : liste des plis possibles, ou obligation de poser une carte. */
  function legalPlaysForPlayer(state, pi) {
    const p = state.players[pi];
    const table = state.table;
    if (table.length === 0 || p.hand.length === 0) return { plis: [], mustExpose: table.length === 0 && p.hand.length > 0 };
    const plis = [];
    for (let h = 0; h < p.hand.length; h++) {
      const options = genCaptureSubsets(table, p.hand[h].value, state.rules);
      if (options.length > 0) plis.push({ handIndex: h, card: p.hand[h], options });
    }
    return { plis, mustExpose: plis.length === 0 };
  }

  /* 4 cartes exposées ; si 3 ou 4 « 10 » sont présents, on les remet dans la pioche,
     on mélange et on expose 4 nouvelles cartes. */
  function drawInitialTable(pile, rng) {
    let four = [pile.pop(), pile.pop(), pile.pop(), pile.pop()];
    let guard = 0;
    while (four.filter(c => c.value === 10).length >= 3 && guard++ < 200) {
      pile.push(...four);
      shuffle(pile, rng);
      four = [pile.pop(), pile.pop(), pile.pop(), pile.pop()];
    }
    return four;
  }

  function setupRound(state, rng) {
    const n = state.players.length;
    const deck = shuffle(createDeck(), rng);
    state.drawPile = deck;
    state.table = [];
    for (const p of state.players) {
      p.hand = []; p.captured = []; p.piouPiou = 0; p.comp10 = 0; p.out = false;
    }
    if (state.solo) state.dealer = 0;
    state.starter = state.solo ? 0 : (state.dealer + 1) % n;
    state.current = state.starter;
    for (let k = 0; k < HAND_SIZE; k++) {
      for (const p of state.players) p.hand.push(state.drawPile.pop());
    }
    state.table = drawInitialTable(state.drawPile, rng);
    state.phase = 'play';
    state._finished = false;
  }

  function newGame(options) {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    const solo = opts.numPlayers === 1;
    const n = solo ? 1 : Math.min(4, Math.max(2, opts.numPlayers | 0));
    const defaultNames = solo ? ['Toi'] : Array.from({ length: n }, (_, i) => i === 0 ? (opts.names && opts.names[0]) || 'Toi' : 'Robot ' + i);
    const names = (opts.names && opts.names.length ? opts.names.slice(0, n) : defaultNames);
    const humanIndex = opts.humanIndex !== undefined ? opts.humanIndex : 0;
    const players = names.map((name, i) => ({
      id: i, name, isBot: opts.allHuman ? false : i !== humanIndex,
      hand: [], captured: [], piouPiou: 0, comp10: 0, out: false,
    }));
    const v = opts.variants || {};
    const state = {
      solo,
      players,
      table: [],
      drawPile: [],
      dealer: solo ? 0 : Math.floor(rng() * n),
      starter: 0,
      current: 0,
      rules: {
        sum: !v.sub,
        sub: !!v.sub,
        parity: !!v.parity,
        complement10: !!v.complement10,
        noDraw: !!v.noDraw,
        piouPiouPoint: !!v.piouPiouPoint,
      },
      scoring: opts.scoring || 'cards',
      scoringParam: opts.scoringParam !== undefined ? opts.scoringParam : 5,
      difficulty: opts.difficulty === 'easy' ? 'easy' : 'normal',
      match: {
        rounds: solo ? 1 : (opts.matchRounds || 1),
        mode: opts.matchMode || 'manches',
        results: [],
      },
      roundNumber: 1,
      phase: 'setup',
      _finished: false,
      rng,
    };
    setupRound(state, rng);
    return state;
  }

  function nextRound(state) {
    state.dealer = state.starter; // le donneur suivant est le joueur qui a commencé la manche
    state.roundNumber++;
    setupRound(state, state.rng);
  }

  /* Joue un tour. action = {type:'pli', handIndex, tableIndices} | {type:'expose', handIndex}.
     Retourne la liste des événements du tour. */
  function playTurn(state, pi, action) {
    if (state.phase !== 'play') throw new Error('La manche est terminée');
    if (pi !== state.current) throw new Error("Ce n'est pas à ce joueur de jouer");
    const events = [];
    const p = state.players[pi];
    const legal = legalPlaysForPlayer(state, pi);

    if (action.type === 'pli') {
      const pl = legal.plis.find(x => x.handIndex === action.handIndex);
      if (!pl) throw new Error('Pli impossible avec cette carte');
      const opt = pl.options.find(o => sameSet(o, action.tableIndices));
      if (!opt) throw new Error('Capture illégale');
      const played = p.hand.splice(action.handIndex, 1)[0];
      const tableBefore = state.table.length;
      const taken = [];
      for (const i of [...opt].sort((a, b) => b - a)) taken.unshift(state.table.splice(i, 1)[0]);
      p.captured.push(played, ...taken);
      events.push({ type: 'pli', player: pi, played, captured: taken });
      if (taken.length === tableBefore) {
        p.piouPiou++;
        events.push({ type: 'piou-piou', player: pi });
      }
      const sumTaken = taken.reduce((a, c) => a + c.value, 0);
      if (state.rules.complement10 && played.value + sumTaken === 10) {
        p.comp10++;
        events.push({ type: 'comp10', player: pi });
      }
    } else if (action.type === 'expose') {
      if (legal.plis.length > 0) throw new Error('Un pli est possible : vous devez ramasser des cartes');
      if (action.handIndex < 0 || action.handIndex >= p.hand.length) throw new Error('Carte invalide');
      const card = p.hand.splice(action.handIndex, 1)[0];
      state.table.push(card);
      events.push({ type: 'expose', player: pi, card });
    } else {
      throw new Error('Action inconnue');
    }

    if (!state.rules.noDraw && state.drawPile.length > 0 && p.hand.length < HAND_SIZE) {
      p.hand.push(state.drawPile.pop());
      events.push({ type: 'draw', player: pi });
    }
    endTurn(state, events);
    return events;
  }

  function allHandsEmpty(state) {
    return state.drawPile.length === 0 && state.players.every(p => p.hand.length === 0);
  }

  function endTurn(state, events) {
    const n = state.players.length;
    state.current = (state.current + 1) % n;
    let guard = 0;
    while (guard++ < 10000) {
      if (allHandsEmpty(state)) {
        state.phase = 'roundOver';
        events.push({ type: 'roundOver' });
        return;
      }
      const cur = state.players[state.current];
      if (cur.hand.length === 0) {
        if (state.drawPile.length === 0) {
          cur.out = true;
          state.current = (state.current + 1) % n;
          continue;
        }
        if (state.rules.noDraw) {
          // Variante 5 : le donneur redistribue 3 cartes à chaque joueur sans main.
          for (const p of state.players) {
            if (p.hand.length === 0 && state.drawPile.length >= HAND_SIZE) {
              for (let k = 0; k < HAND_SIZE; k++) p.hand.push(state.drawPile.pop());
              events.push({ type: 'redeal', player: p.id });
            }
          }
          if (state.players[state.current].hand.length === 0) {
            state.players[state.current].out = true;
            state.current = (state.current + 1) % n;
            continue;
          }
          return;
        }
        while (state.drawPile.length > 0 && cur.hand.length < HAND_SIZE) cur.hand.push(state.drawPile.pop());
        return;
      }
      return;
    }
    state.phase = 'roundOver';
    events.push({ type: 'roundOver' });
  }

  // ---------- Scores ----------

  function subsetSumIndices(vals, used, target, start) {
    if (target === 0) return [];
    for (let i = start; i < vals.length; i++) {
      if (used[i] || vals[i] > target) continue;
      used[i] = true;
      const rest = subsetSumIndices(vals, used, target - vals[i], i + 1);
      if (rest) return [i, ...rest];
      used[i] = false;
    }
    return null;
  }

  function countPiles10(cards) {
    const vals = cards.map(c => c.value).sort((a, b) => b - a);
    const used = new Array(vals.length).fill(false);
    let piles = 0;
    for (let i = 0; i < vals.length; i++) {
      if (used[i]) continue;
      if (vals[i] === 10) { used[i] = true; piles++; continue; }
      used[i] = true;
      const rest = subsetSumIndices(vals, used, 10 - vals[i], i + 1);
      if (rest) { for (const j of rest) used[j] = true; piles++; }
      else used[i] = false;
    }
    return piles;
  }

  function longestRun(values) {
    const set = new Set(values);
    let best = 0;
    for (const v of set) {
      if (set.has(v - 1)) continue;
      let len = 1;
      while (set.has(v + len)) len++;
      best = Math.max(best, len);
    }
    return best;
  }

  function pairPoints(cards) {
    const byValue = {};
    for (const c of cards) byValue[c.value] = (byValue[c.value] || 0) + 1;
    return Object.values(byValue).reduce((a, c) => a + Math.floor(c / 2), 0);
  }

  function colorMajorityPoints(state, player) {
    let pts = 0;
    for (const color of COLORS) {
      const counts = state.players.map(p => p.captured.filter(c => c.color === color).length);
      const mine = counts[player.id];
      const max = Math.max(...counts);
      if (mine === max && counts.filter(c => c === max).length === 1) pts++;
    }
    return pts;
  }

  function carrePoints(cards) {
    const byValue = {};
    for (const c of cards) byValue[c.value] = (byValue[c.value] || 0) + 1;
    return Object.values(byValue).reduce((a, c) => a + c * c, 0);
  }

  function scoreRound(state) {
    const s = state.scoring;
    const param = state.scoringParam;
    return state.players.map(p => {
      const cards = p.captured;
      let score, detail;
      if (state.solo) {
        score = p.piouPiou + (state.rules.complement10 ? p.comp10 : 0);
        detail = p.piouPiou + ' « Piou-Piou ! »' + (state.rules.complement10 && p.comp10 ? ' + ' + p.comp10 + ' complément(s) à 10' : '');
      } else {
        switch (s) {
          case 'le5': {
            score = cards.filter(c => c.value <= param).length;
            detail = score + ' carte(s) ≤ ' + param;
            break;
          }
          case 'piles10': {
            score = countPiles10(cards);
            detail = score + ' pile(s) de 10';
            break;
          }
          case 'sum': {
            score = cards.reduce((a, c) => a + c.value, 0);
            detail = 'somme de ' + score;
            break;
          }
          case 'suite': {
            score = longestRun(cards.map(c => c.value));
            detail = 'suite de longueur ' + score;
            break;
          }
          case 'suiteMono': {
            score = Math.max(...COLORS.map(col => longestRun(cards.filter(c => c.color === col).map(c => c.value))));
            detail = 'suite monochrome de longueur ' + score;
            break;
          }
          case 'points10': {
            const pairs = pairPoints(cards);
            const cols = colorMajorityPoints(state, p);
            score = pairs + cols;
            detail = pairs + ' paire(s) + ' + cols + ' couleur(s) majoritaire(s)';
            break;
          }
          case 'pointsCarres': {
            score = carrePoints(cards);
            detail = score + ' points (1/4/9/16)';
            break;
          }
          case 'cards':
          default: {
            score = cards.length + (state.rules.piouPiouPoint ? p.piouPiou : 0);
            detail = cards.length + ' carte(s)' + (state.rules.piouPiouPoint && p.piouPiou ? ' + ' + p.piouPiou + ' point(s) Piou-Piou' : '');
            break;
          }
        }
      }
      return { player: p.id, name: p.name, score, detail, piouPiou: p.piouPiou, comp10: p.comp10, cards: cards.length };
    });
  }

  function finishRound(state) {
    if (state._finished) return state.match.results[state.match.results.length - 1];
    state._finished = true;
    const scores = scoreRound(state);
    const max = Math.max(...scores.map(x => x.score));
    const winners = scores.filter(x => x.score === max).map(x => x.player);
    // Snapshot des cartes capturées : permet d'afficher la justification du vainqueur.
    const capturedSnapshots = state.players.map(p => p.captured.map(c => ({ value: c.value, color: c.color })));
    const result = { round: state.roundNumber, scores, winners, capturedSnapshots };
    state.match.results.push(result);
    return result;
  }

  function matchWinner(state) {
    if (state.match.mode === 'cumul') {
      const totals = state.players.map(p => ({
        player: p.id, name: p.name,
        total: state.match.results.reduce((a, r) => a + (r.scores.find(x => x.player === p.id) || { score: 0 }).score, 0),
      }));
      const max = Math.max(...totals.map(t => t.total));
      return { mode: 'cumul', entries: totals, winners: totals.filter(t => t.total === max).map(t => t.player) };
    }
    const wins = state.players.map(p => ({
      player: p.id, name: p.name,
      wins: state.match.results.filter(r => r.winners.includes(p.id)).length,
    }));
    const max = Math.max(...wins.map(w => w.wins));
    return { mode: 'manches', entries: wins, winners: max > 0 ? wins.filter(w => w.wins === max).map(w => w.player) : [] };
  }

  // ---------- Robot ----------

  function botChooseAction(state, pi, rng) {
    const r = rng || Math.random;
    const legal = legalPlaysForPlayer(state, pi);
    const p = state.players[pi];
    const easy = state.difficulty === 'easy';
    if (legal.mustExpose || legal.plis.length === 0) {
      if (easy) return { type: 'expose', handIndex: Math.floor(r() * p.hand.length) };
      let best = [];
      let bestV = Infinity;
      for (let i = 0; i < p.hand.length; i++) {
        const v = p.hand[i].value;
        if (v < bestV) { bestV = v; best = [i]; }
        else if (v === bestV) best.push(i);
      }
      return { type: 'expose', handIndex: best[Math.floor(r() * best.length)] };
    }
    if (easy) {
      // Niveau facile (6-7 ans) : le robot choisit un pli au hasard parmi tous les plis légaux.
      const all = [];
      for (const pl of legal.plis) for (const opt of pl.options) all.push({ type: 'pli', handIndex: pl.handIndex, tableIndices: opt.slice() });
      return all[Math.floor(r() * all.length)];
    }
    let bestKey = null;
    const cands = [];
    for (const pl of legal.plis) {
      for (const opt of pl.options) {
        const sum = opt.reduce((a, i) => a + state.table[i].value, 0);
        const key = [opt.length, sum];
        if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
          bestKey = key; cands.length = 0; cands.push({ type: 'pli', handIndex: pl.handIndex, tableIndices: opt.slice() });
        } else if (key[0] === bestKey[0] && key[1] === bestKey[1]) {
          cands.push({ type: 'pli', handIndex: pl.handIndex, tableIndices: opt.slice() });
        }
      }
    }
    return cands[Math.floor(r() * cands.length)];
  }

  return {
    COLORS, COLOR_LABELS, VALUES, HAND_SIZE, TABLE_START,
    mulberry32, createDeck, shuffle, cardLabel,
    genCaptureSubsets, legalPlaysForPlayer, drawInitialTable,
    newGame, setupRound, nextRound, playTurn,
    scoreRound, finishRound, matchWinner,
    countPiles10, longestRun, botChooseAction,
  };
});
