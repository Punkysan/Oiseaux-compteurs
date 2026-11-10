/* Oiseau, compte ! — interface web (navigateur uniquement). */
(function () {
  'use strict';
  const E = window.OiseauEngine;
  const $ = (s) => document.querySelector(s);

  let state = null;
  let ui = { selHand: null, selTable: new Set() };
  let draggedHandIndex = null;
  let soundOn = true;
  let audioCtx = null;
  let botBusy = false;
  let lastCfg = null;

  // ---------- Petites aides ----------
  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function pname(i) { return state.players[i].name; }
  function currentIsHuman() {
    return state && state.phase === 'play' && state.current >= 0 && !state.players[state.current].isBot;
  }
  function humanCount() {
    return state ? state.players.filter((p) => !p.isBot).length : 0;
  }
  // Vrai quand c'est à un humain ET que sa main est révélée (hotseat : appui sur « Voir ma main »).
  function humanTurn() {
    if (!currentIsHuman()) return false;
    return humanCount() <= 1 || ui.revealed === state.current;
  }
  function needsReveal() {
    return currentIsHuman() && humanCount() > 1 && ui.revealed !== state.current;
  }

  // ---------- Sons (WebAudio, aucun fichier externe) ----------
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function tone(freq, delay, dur, type, gain) {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sfx(name) {
    ensureAudio();
    if (!soundOn || !audioCtx) return;
    if (name === 'pli') { tone(440, 0, 0.09, 'triangle'); tone(660, 0.07, 0.1, 'triangle'); }
    else if (name === 'expose') { tone(220, 0, 0.08, 'sine', 0.05); }
    else if (name === 'draw') { tone(330, 0, 0.05, 'sine', 0.03); }
    else if (name === 'piou') { tone(523, 0, 0.1, 'square', 0.045); tone(659, 0.1, 0.1, 'square', 0.045); tone(784, 0.2, 0.2, 'square', 0.045); }
    else if (name === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.16, 'triangle')); }
  }
  document.addEventListener('click', ensureAudio, { once: true });

  // ---------- Menu ----------
  function updateMenuVisibility() {
    const raw = $('#cfg-players').value;
    const solo = raw === '1';
    const hotseat = raw.endsWith('h');
    $('#field-rounds').hidden = solo;
    $('#field-matchmode').hidden = solo;
    $('#field-scoring').hidden = solo;
    $('#field-difficulty').hidden = solo || hotseat;
    $('#field-name').hidden = hotseat;
    $('#field-names').hidden = !hotseat;
    $('#field-seuil').hidden = solo || $('#cfg-scoring').value !== 'le5';
  }

  function readConfig() {
    const raw = $('#cfg-players').value;
    const allHuman = raw.endsWith('h');
    const numPlayers = parseInt(raw, 10);
    let names;
    if (allHuman) {
      names = $('#cfg-names').value.split(',').map((s) => s.trim()).filter(Boolean);
      while (names.length < numPlayers) names.push('Joueur ' + (names.length + 1));
      names = names.slice(0, numPlayers);
    } else {
      names = [$('#cfg-name').value.trim() || 'Toi'];
      for (let i = 1; i < numPlayers; i++) names.push('Robot ' + i);
    }
    return {
      numPlayers,
      names,
      allHuman,
      humanIndex: 0,
      variants: {
        parity: $('#v-parity').checked,
        sub: $('#v-sub').checked,
        complement10: $('#v-comp10').checked,
        noDraw: $('#v-nodraw').checked,
        piouPiouPoint: $('#v-pioupoint').checked,
      },
      scoring: $('#cfg-scoring').value,
      scoringParam: parseInt($('#cfg-seuil').value, 10) || 5,
      difficulty: $('#cfg-difficulty').value,
      matchRounds: numPlayers === 1 ? 1 : parseInt($('#cfg-rounds').value, 10),
      matchMode: $('#cfg-matchmode').value,
    };
  }

  function showScreen(name) {
    $('#screen-menu').hidden = name !== 'menu';
    $('#screen-game').hidden = name !== 'game';
  }

  function startGame(cfg) {
    lastCfg = cfg;
    state = E.newGame(Object.assign({}, cfg, { rng: Math.random }));
    ui = { selHand: null, selTable: new Set(), revealed: null };
    $('#log').innerHTML = '';
    showScreen('game');
    const solo = state.solo;
    log(solo
      ? '🐦 Partie solo lancée : réalise le plus de « Piou-Piou ! » possible !'
      : '🐦 Partie lancée avec ' + state.players.length + ' joueurs. Manche ' + state.roundNumber + '/' + state.match.rounds + '.');
    render();
    animateDeal();
    maybeBotLoop();
  }

  // ---------- Cartes ----------
  // Visuels officiels (assets/cartes/) avec repli sur le design CSS si l'image est absente.
  const ASSETS = 'assets/cartes/';
  function cardEl(card, opts) {
    opts = opts || {};
    const d = el('div', 'card c-' + (card ? card.color : 'back') + (opts.small ? ' small' : '') + (opts.back ? ' back' : '') + (opts.cls ? ' ' + opts.cls : ''));
    const img = new Image();
    img.className = 'card-img';
    img.alt = card ? E.cardLabel(card) : 'Carte cachée';
    img.draggable = false;
    if (opts.back || !card) {
      img.src = ASSETS + 'dos.png';
      img.onerror = () => { img.remove(); };
      img.onload = () => { d.innerHTML = ''; d.appendChild(img); };
      d.appendChild(el('span', 'back-bird', '🐣'));
      d.appendChild(img);
      d.title = 'Carte cachée';
      return d;
    }
    img.src = ASSETS + card.value + '-' + card.color + '.png';
    img.onerror = () => { img.remove(); };
    img.onload = () => { d.innerHTML = ''; d.appendChild(img); };
    const tl = el('span', 'corner tl', String(card.value));
    const br = el('span', 'corner br', String(card.value));
    const bird = el('span', 'bird', '🐦');
    const val = el('span', 'val', String(card.value));
    d.appendChild(tl); d.appendChild(bird); d.appendChild(val); d.appendChild(br);
    d.appendChild(img);
    d.title = E.cardLabel(card);
    if (card.id !== undefined) d.dataset.cardId = String(card.id);
    return d;
  }

  // ---------- Rendu ----------
  function render() {
    if (!state) return;
    renderScorebar();
    renderOpponents();
    renderTable();
    renderHand();
  }

  function renderScorebar() {
    const bar = $('#scorebar');
    bar.innerHTML = '';
    const tag = el('span', 'score-chip', 'Manche ' + state.roundNumber + '/' + state.match.rounds + (state.solo ? ' · solo' : ''));
    tag.classList.add('round-tag');
    bar.appendChild(tag);
    for (const p of state.players) {
      const chip = el('span', 'score-chip' + (state.current === p.id && state.phase === 'play' ? ' active' : '') + (p.out ? ' out' : ''));
      chip.appendChild(el('span', null, (p.isBot ? '🤖 ' : '🧒 ') + p.name));
      chip.appendChild(el('span', null, '🂠 ' + p.captured.length));
      if (p.piouPiou > 0 || state.rules.piouPiouPoint || state.solo) chip.appendChild(el('span', null, '🐣 ' + p.piouPiou));
      if (state.rules.complement10 && p.comp10 > 0) chip.appendChild(el('span', null, '➕10 × ' + p.comp10));
      bar.appendChild(chip);
    }
  }

  function renderOpponents() {
    const wrap = $('#opponents');
    wrap.innerHTML = '';
    for (let i = 0; i < state.players.length; i++) {
      if (i === state.current) continue; // le joueur courant a sa zone en bas
      const p = state.players[i];
      const box = el('div', 'opponent' + (state.current === p.id && state.phase === 'play' ? ' active' : ''));
      box.id = 'opp-' + p.id;
      box.appendChild(el('div', 'opp-name', (p.isBot ? '🤖 ' : '🧒 ') + p.name));
      const backs = el('div', 'backs');
      for (let k = 0; k < p.hand.length; k++) backs.appendChild(cardEl(null, { back: true, small: true }));
      box.appendChild(backs);
      const pile = el('div', 'pile');
      pile.id = 'opp-pile-' + p.id;
      pile.appendChild(cardEl(null, { back: true, small: true }));
      pile.appendChild(el('div', 'pile-count', '🂠 ' + p.captured.length));
      box.appendChild(pile);
      const stats = el('div', 'stats');
      stats.appendChild(el('span', null, '🂠 ' + p.captured.length));
      stats.appendChild(el('span', null, '🐣 ' + p.piouPiou));
      box.appendChild(stats);
      wrap.appendChild(box);
    }
  }

  function renderTable() {
    const pioche = $('#pioche');
    pioche.innerHTML = '';
    pioche.appendChild(cardEl(null, { back: true }));
    pioche.appendChild(el('div', 'pioche-count', 'Pioche : ' + state.drawPile.length));

    const vol = $('#voliere');
    vol.innerHTML = '';
    const selectable = humanTurn() && ui.selHand !== null;

    state.table.forEach((card, i) => {
      const d = cardEl(card);
      if (selectable) {
        d.classList.add('clickable');
        if (ui.selTable.has(i)) d.classList.add('selected');
        d.addEventListener('click', () => onTableClick(i));
      }
      vol.appendChild(d);
    });
  }

  function renderHand() {
    const wrap = $('#hand');
    wrap.innerHTML = '';
    const cur = state.players[state.current];
    $('#hand-label').textContent = state.phase === 'play' && cur ? 'Main de ' + cur.name : 'Main';
    const pile = $('#pile-human');
    if (pile) {
      pile.innerHTML = '';
      pile.appendChild(cardEl(null, { back: true, small: true }));
      pile.appendChild(el('div', 'pile-count', '🂠 ' + (cur ? cur.captured.length : 0)));
      pile.title = cur ? 'Cartes ramassées par ' + cur.name : '';
    }
    const mine = humanTurn();
    const hand = state.phase === 'play' && cur ? cur.hand : [];
    if (!mine) {
      for (let k = 0; k < hand.length; k++) wrap.appendChild(cardEl(null, { back: true }));
    } else {
      hand.forEach((card, i) => {
        const d = cardEl(card);
        d.classList.add('clickable');
        d.draggable = true;
        d.addEventListener('dragstart', (e) => onCardDragStart(e, i));
        d.addEventListener('dragend', onCardDragEnd);
        if (ui.selHand === i) d.classList.add('selected');
        d.addEventListener('click', () => onHandClick(i));
        wrap.appendChild(d);
      });
    }
    renderMessage();
  }

  function renderMessage() {
    const box = $('#message');
    box.innerHTML = '';
    box.classList.remove('flash');
    if (!state) return;
    if (state.phase !== 'play') {
      box.appendChild(el('div', null, '🏁 Manche terminée !'));
      return;
    }
    const cur = state.players[state.current];
    if (cur.isBot) {
      box.appendChild(el('div', null, '🤖 ' + cur.name + ' réfléchit…'));
      return;
    }
    if (needsReveal()) {
      box.appendChild(el('div', null, '📱 Passe la tablette à ' + cur.name + '…'));
      const b = el('button', 'action-btn reveal-btn', '👀 Voir ma main');
      b.addEventListener('click', () => { ui.revealed = state.current; render(); });
      box.appendChild(b);
      return;
    }
    const legal = E.legalPlaysForPlayer(state, state.current);
    if (ui.selHand === null) {
      box.appendChild(el('div', null, 'À toi de jouer, ' + cur.name + ' ! Choisis une carte en main.'));
      return;
    }
    const card = cur.hand[ui.selHand];
    box.appendChild(el('div', null,
      'Carte choisie : ' + E.cardLabel(card) + '. Sélectionne des cartes de la volière à ramasser avec cette carte et valide le pli — ou pose la carte dans la volière.'));
    const actions = el('div', 'actions');
    const okBtn = el('button', 'action-btn validate', '✔ Valider le pli (' + ui.selTable.size + ' carte' + (ui.selTable.size > 1 ? 's' : '') + ')');
    okBtn.disabled = ui.selTable.size === 0;
    okBtn.addEventListener('click', validatePli);
    const exposeBtn = el('button', 'action-btn expose', '➕ Poser cette carte dans la volière');
    exposeBtn.addEventListener('click', exposeSelected);
    const cancelBtn = el('button', 'action-btn cancel', '✖ Annuler');
    cancelBtn.addEventListener('click', () => { ui.selHand = null; ui.selTable = new Set(); render(); });
    actions.appendChild(okBtn);
    actions.appendChild(exposeBtn);
    actions.appendChild(cancelBtn);
    box.appendChild(actions);
  }

  // ---------- Interactions ----------
  function onHandClick(i) {
    if (!humanTurn()) return;
    const legal = E.legalPlaysForPlayer(state, state.current);
    const pl = legal.plis.find((p) => p.handIndex === i);
    if (pl && pl.options.length === 1 && pl.options[0].length === 1) {
      doAction({ type: 'pli', handIndex: i, tableIndices: pl.options[0] });
      return;
    }
    ui.selHand = i;
    ui.selTable = new Set();
    render();
  }

  function onTableClick(i) {
    if (ui.selHand === null || !humanTurn()) return;
    if (ui.selTable.has(i)) ui.selTable.delete(i);
    else ui.selTable.add(i);
    render();
  }

  function validatePli() {
    if (ui.selHand === null || ui.selTable.size === 0) return;
    doAction({ type: 'pli', handIndex: ui.selHand, tableIndices: Array.from(ui.selTable) });
  }

  function exposeSelected() {
    if (ui.selHand === null) return;
    doAction({ type: 'expose', handIndex: ui.selHand });
  }

  function doAction(action) {
    const before = snapshotCardPositions();
    let ev;
    try {
      ev = E.playTurn(state, state.current, action);
    } catch (err) {
      const box = $('#message');
      box.classList.add('flash');
      box.appendChild(el('div', null, '⛔ ' + err.message));
      return;
    }
    ui.selHand = null;
    ui.selTable = new Set();
    ui.revealed = null;
    handleEvents(ev);
    render();
    animateEvents(ev, before);
    maybeBotLoop();
  }

  // ---------- Événements de jeu ----------
  function log(msg) {
    const box = $('#log');
    const line = el('div', 'log-line', msg);
    box.prepend(line);
    while (box.children.length > 40) box.removeChild(box.lastChild);
  }

  function handleEvents(ev) {
    for (const e of ev) {
      if (e.type === 'pli') {
        log('🖐 ' + pname(e.player) + ' joue ' + E.cardLabel(e.played) + ' et ramasse ' + e.captured.map(E.cardLabel).join(' + ') + '.');
        sfx('pli');
      } else if (e.type === 'expose') {
        log('➕ ' + pname(e.player) + ' pose ' + E.cardLabel(e.card) + ' dans la volière.');
        sfx('expose');
      } else if (e.type === 'draw') {
        sfx('draw');
      } else if (e.type === 'piou-piou') {
        showPiou(pname(e.player));
        log('🐣 ' + pname(e.player) + ' dit « Piou-Piou ! » et ramasse toute la volière !');
        sfx('piou');
      } else if (e.type === 'comp10') {
        log('⭐ ' + pname(e.player) + ' fait un complément à 10 : +1 point !');
        sfx('piou');
      } else if (e.type === 'redeal') {
        log('🔄 Le donneur redistribue 3 cartes à ' + pname(e.player) + ' (variante 5).');
      } else if (e.type === 'roundOver') {
        onRoundOver();
      }
    }
  }

  function showPiou(name) {
    const b = $('#piou-banner');
    b.textContent = '🐣 PIOU-PIOU ! ' + name + ' ramasse toute la volière !';
    b.hidden = false;
    setTimeout(() => { b.hidden = true; }, 1800);
  }

  function onRoundOver() {
    const res = E.finishRound(state);
    sfx('win');
    let best = null;
    if (state.solo) {
      const score = res.scores[0].score;
      try {
        best = parseInt(localStorage.getItem('oiseauCompte.bestSolo') || '0', 10) || 0;
        if (score > best) {
          localStorage.setItem('oiseauCompte.bestSolo', String(score));
          best = score;
        }
      } catch (e) { best = null; }
    }
    setTimeout(() => showEndModal(res, best), 900);
  }

  // ---------- Modale de fin ----------
  function appendCapturedBlock(container, player, cards, label) {
    const wrap = el('div', 'captured-block');
    wrap.appendChild(el('h3', null, '🂠 Cartes ramassées par ' + player.name + ' (' + cards.length + ' carte' + (cards.length > 1 ? 's' : '') + ') — ' + label));
    const row = el('div', 'captured-row');
    if (cards.length === 0) row.appendChild(el('span', null, 'aucune'));
    for (const c of cards) row.appendChild(cardEl({ value: c.value, color: c.color }, { small: true }));
    wrap.appendChild(row);
    container.appendChild(wrap);
  }

  function showEndModal(res, bestSolo) {
    const matchOver = state.roundNumber >= state.match.rounds;
    $('#end-title').textContent = state.solo
      ? '🏁 Fin de la partie — défi « Piou-Piou ! »'
      : (matchOver ? '🏆 Fin du match' : 'Fin de la manche ' + res.round);

    const body = $('#end-body');
    body.innerHTML = '';

    if (state.solo) {
      const score = res.scores[0].score;
      body.appendChild(el('div', 'solo-score', '🐣 ' + score + ' « Piou-Piou ! »'));
      body.appendChild(el('div', null, res.scores[0].detail + '.'));
      if (bestSolo !== null && bestSolo !== undefined) {
        body.appendChild(el('div', null, '🏅 Record personnel : ' + bestSolo + ' « Piou-Piou ! »' + (score >= bestSolo ? ' — nouveau record ! 🎉' : '.')));
      }
    } else {
      const table = el('table', 'score-table');
      const head = el('tr');
      for (const h of ['Joueur', 'Détail', 'Score', '🐣']) {
        head.appendChild(el('th', null, h));
      }
      table.appendChild(head);
      for (const s of res.scores) {
        const tr = el('tr', res.winners.includes(s.player) ? 'winner' : '');
        tr.appendChild(el('td', null, (state.players[s.player].isBot ? '🤖 ' : '🧒 ') + s.name + (res.winners.includes(s.player) ? ' 🏆' : '')));
        tr.appendChild(el('td', null, s.detail));
        tr.appendChild(el('td', null, String(s.score)));
        tr.appendChild(el('td', null, String(s.piouPiou)));
        table.appendChild(tr);
      }
      body.appendChild(table);
      body.appendChild(el('div', null, res.winners.length > 0
        ? 'Vainqueur de la manche : ' + res.winners.map((i) => state.players[i].name).join(', ') + ' !'
        : 'Égalité !'));
      // Justification : si un robot remporte la manche, on affiche ses cartes capturées.
      for (const id of res.winners.filter((i) => state.players[i].isBot)) {
        const snap = res.capturedSnapshots ? res.capturedSnapshots[id] : state.players[id].captured;
        appendCapturedBlock(body, state.players[id], snap, 'manche ' + res.round);
      }

      if (matchOver) {
        const mw = E.matchWinner(state);
        const block = el('div', 'match-block');
        block.appendChild(el('h3', null, mw.mode === 'cumul' ? 'Cumul des points sur toutes les manches' : 'Manches remportées'));
        const t2 = el('table', 'score-table');
        const h2 = el('tr');
        h2.appendChild(el('th', null, 'Joueur'));
        h2.appendChild(el('th', null, mw.mode === 'cumul' ? 'Points totaux' : 'Manches gagnées'));
        t2.appendChild(h2);
        for (const entry of mw.entries) {
          const tr = el('tr', mw.winners.includes(entry.player) ? 'winner' : '');
          tr.appendChild(el('td', null, (state.players[entry.player].isBot ? '🤖 ' : '🧒 ') + entry.name + (mw.winners.includes(entry.player) ? ' 🏆' : '')));
          tr.appendChild(el('td', null, String(mw.mode === 'cumul' ? entry.total : entry.wins)));
          t2.appendChild(tr);
        }
        block.appendChild(t2);
        block.appendChild(el('div', null, mw.winners.length > 0
          ? '🏆 Vainqueur du match : ' + mw.winners.map((i) => state.players[i].name).join(', ') + ' !'
          : 'Match nul !'));
        body.appendChild(block);
        // Justification : si un robot remporte le match, on affiche ses cartes de la dernière manche
        // (uniquement en multi-manches, sinon la justification de manche suffit).
        if (state.match.rounds > 1) {
          const last = state.match.results[state.match.results.length - 1];
          for (const id of mw.winners.filter((i) => state.players[i].isBot)) {
            const snap = last && last.capturedSnapshots ? last.capturedSnapshots[id] : state.players[id].captured;
            appendCapturedBlock(body, state.players[id], snap, 'dernière manche');
          }
        }
      }
    }

    const btns = $('#end-buttons');
    btns.innerHTML = '';
    if (!matchOver && !state.solo) {
      const next = el('button', 'big-btn', 'Manche suivante ▶');
      next.addEventListener('click', () => {
        $('#modal-end').hidden = true;
        E.nextRound(state);
        ui = { selHand: null, selTable: new Set(), revealed: null };
        log('🎬 Manche ' + state.roundNumber + '/' + state.match.rounds + ' — le donneur est ' + state.players[state.dealer].name + '.');
        render();
        animateDeal();
        maybeBotLoop();
      });
      btns.appendChild(next);
    }
    const again = el('button', 'big-btn', '🔄 Rejouer');
    again.addEventListener('click', () => {
      $('#modal-end').hidden = true;
      if (lastCfg) startGame(lastCfg);
    });
    btns.appendChild(again);
    const menu = el('button', 'big-btn secondary', '🏠 Menu');
    menu.addEventListener('click', () => {
      $('#modal-end').hidden = true;
      state = null;
      showScreen('menu');
    });
    btns.appendChild(menu);

    $('#modal-end').hidden = false;
  }

  // ---------- Animations (les cartes se déplacent) ----------
  function rectOf(node) { return node ? node.getBoundingClientRect() : null; }

  function snapshotCardPositions() {
    const map = {};
    document.querySelectorAll('.card[data-card-id]').forEach((d) => {
      map[d.dataset.cardId] = d.getBoundingClientRect();
    });
    return map;
  }

  function pileAnchor(pi) {
    return pi === 0 ? $('#pile-human') : $('#opp-pile-' + pi);
  }

  function flyGhost(ghost, fromRect, toRect, delay, dur) {
    if (!fromRect || !toRect) { ghost.remove(); return; }
    dur = dur || 650;
    ghost.removeAttribute('data-card-id');
    ghost.classList.add('ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: fromRect.left + 'px',
      top: fromRect.top + 'px',
      width: fromRect.width + 'px',
      height: fromRect.height + 'px',
      margin: '0',
      zIndex: 300,
      pointerEvents: 'none',
    });
    document.body.appendChild(ghost);
    const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
    const dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
    const s = Math.max(0.25, Math.min(1, toRect.width / Math.max(1, fromRect.width)));
    setTimeout(() => {
      ghost.style.transition = 'transform ' + dur + 'ms ease-in-out, opacity ' + dur + 'ms ease-in-out';
      ghost.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + s + ')';
      ghost.style.opacity = '0.85';
      setTimeout(() => ghost.remove(), dur + 80);
    }, delay || 0);
  }

  function flyCard(card, fromRect, toRect, delay, dur) {
    flyGhost(cardEl(card), fromRect, toRect, delay, dur);
  }

  function flyBack(fromRect, toRect, delay, dur) {
    flyGhost(cardEl(null, { back: true }), fromRect, toRect, delay, dur);
  }

  function animateEvents(ev, before) {
    if (!state) return;
    let delay = 0;
    for (const e of ev) {
      if (e.type === 'pli') {
        const dest = rectOf(pileAnchor(e.player));
        const fromPlayed = before[String(e.played.id)];
        if (fromPlayed) flyCard(e.played, fromPlayed, dest, delay);
        e.captured.forEach((c, k) => {
          const from = before[String(c.id)];
          if (from) flyCard(c, from, dest, delay + 140 + k * 90);
        });
        delay += 420;
      } else if (e.type === 'expose') {
        const from = before[String(e.card.id)];
        const dest = rectOf($('#voliere'));
        if (from) flyCard(e.card, from, dest, delay);
        delay += 320;
      } else if (e.type === 'draw') {
        const from = rectOf($('#pioche'));
        const dest = e.player === 0 ? rectOf($('#hand')) : rectOf($('#opp-' + e.player));
        if (from && dest) flyBack(from, dest, delay, 500);
        delay += 160;
      }
    }
  }

  function animateDeal() {
    const from = rectOf($('#pioche'));
    const vol = rectOf($('#voliere'));
    if (!from || !vol) return;
    state.players.forEach((p, i) => {
      const dest = i === 0 ? rectOf($('#hand')) : rectOf($('#opp-' + i));
      if (!dest) return;
      for (let k = 0; k < p.hand.length; k++) flyBack(from, dest, i * 140 + k * 110, 600);
    });
    state.table.forEach((c, k) => flyCard(c, from, vol, 450 + k * 150, 600));
  }

  // ---------- Glisser-déposer : poser une carte dans la volière ----------
  function onCardDragStart(e, i) {
    if (!humanTurn()) { e.preventDefault(); return; }
    draggedHandIndex = i;
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    } catch (err) { /* environnements de test sans dataTransfer */ }
    if (e.target && e.target.classList) e.target.classList.add('dragging');
  }

  function onCardDragEnd(e) {
    draggedHandIndex = null;
    if (e.target && e.target.classList) e.target.classList.remove('dragging');
    const dz = $('#table-area');
    if (dz) dz.classList.remove('drop-zone');
  }

  function initDropZone() {
    const dz = $('#table-area');
    if (!dz) return;
    dz.addEventListener('dragover', (e) => {
      if (draggedHandIndex !== null && humanTurn()) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        dz.classList.add('drop-zone');
      }
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drop-zone'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drop-zone');
      const i = draggedHandIndex;
      draggedHandIndex = null;
      if (i === null || !humanTurn()) return;
      doAction({ type: 'expose', handIndex: i });
    });
  }

  // ---------- Boucle des robots ----------
  async function maybeBotLoop() {
    if (botBusy || !state) return;
    botBusy = true;
    while (state && state.phase === 'play' && state.players[state.current].isBot) {
      render();
      await sleep(1100);
      if (!state || state.phase !== 'play' || !state.players[state.current].isBot) break;
      const before = snapshotCardPositions();
      const action = E.botChooseAction(state, state.current, state.rng);
      const ev = E.playTurn(state, state.current, action);
      ui.revealed = null;
      handleEvents(ev);
      render();
      animateEvents(ev, before);
      await sleep(550);
    }
    botBusy = false;
    render();
  }

  // ---------- Modale règles ----------
  function fillRulesActive() {
    const box = $('#rules-active');
    box.innerHTML = '';
    if (!state) return;
    const parts = [];
    const r = state.rules;
    if (r.parity) parts.push('Variante 2 (paires/impaires)');
    if (r.sub) parts.push('Variante 3 (soustraction)');
    if (r.complement10) parts.push('Variante 4 (complément à 10 = 1 point)');
    if (r.noDraw) parts.push('Variante 5 (pas de pioche)');
    if (r.piouPiouPoint) parts.push('Variante 1 (Piou-Piou = 1 point bonus)');
    if (!state.solo) parts.push('Score : ' + $('#cfg-scoring').selectedOptions[0].textContent);
    if (parts.length) {
      box.appendChild(el('div', null, 'Variantes actives dans cette partie : ' + parts.join(' · ')));
    }
  }

  // ---------- Initialisation ----------
  function init() {
    $('#cfg-players').addEventListener('change', updateMenuVisibility);
    $('#cfg-scoring').addEventListener('change', updateMenuVisibility);
    updateMenuVisibility();

    $('#btn-play').addEventListener('click', () => startGame(readConfig()));
    $('#btn-new').addEventListener('click', () => { state = null; showScreen('menu'); });
    $('#btn-rules').addEventListener('click', () => { fillRulesActive(); $('#modal-rules').hidden = false; });
    $('#btn-close-rules').addEventListener('click', () => { $('#modal-rules').hidden = true; });
    $('#btn-sound').addEventListener('click', function () {
      soundOn = !soundOn;
      this.textContent = soundOn ? '🔊' : '🔇';
      if (soundOn) ensureAudio();
    });
    $('#modal-rules').addEventListener('click', (e) => {
      if (e.target === $('#modal-rules')) $('#modal-rules').hidden = true;
    });
    initDropZone();
    showScreen('menu');
    // Poignée de débogage / test (lecture seule).
    window.OiseauUI = { getState: function () { return state; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
