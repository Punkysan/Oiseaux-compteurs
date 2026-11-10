/* Nombre mystère — interface web (navigateur). */
(function () {
  'use strict';
  const E = window.NombreMystere;
  const VERSION = '1.6.1'; // synchronisé avec le fichier VERSION à la racine
  const $ = (s) => document.querySelector(s);

  let state = null;
  let ui = { selNum: null, selCell: null, revealed: null };
  let soundOn = true;
  let audioCtx = null;
  let botBusy = false;
  let lastCfg = null;

  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function pname(i) { return state.players[i].name; }

  function currentIsHuman() {
    return state && state.phase === 'play' && !state.players[state.current].isBot;
  }
  function humanCount() { return state ? state.players.filter((p) => !p.isBot).length : 0; }
  function humanTurn() {
    if (!currentIsHuman()) return false;
    return humanCount() <= 1 || ui.revealed === state.current;
  }
  function needsReveal() {
    return currentIsHuman() && humanCount() > 1 && ui.revealed !== state.current;
  }

  // ---------- Sons ----------
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
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sfx(name) {
    ensureAudio();
    if (!soundOn || !audioCtx) return;
    if (name === 'good') { tone(523, 0, 0.1, 'triangle'); tone(784, 0.09, 0.14, 'triangle'); }
    else if (name === 'bad') { tone(196, 0, 0.18, 'sawtooth', 0.04); }
    else if (name === 'myst') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.16, 'square', 0.05)); }
    else if (name === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.18, 'triangle')); }
  }
  document.addEventListener('click', ensureAudio, { once: true });

  // ---------- Menu ----------
  function updateMenuVisibility() {
    const hotseat = $('#cfg-mode').value.endsWith('h');
    $('#field-names').hidden = !hotseat;
    $('#field-difficulty').hidden = hotseat;
  }

  function readConfig() {
    const mode = $('#cfg-mode').value;
    const allHuman = mode.endsWith('h');
    const numPlayers = parseInt(mode.replace(/\D/g, ''), 10) || 2;
    let names;
    if (allHuman) {
      names = $('#cfg-names').value.split(',').map((s) => s.trim()).filter(Boolean);
      while (names.length < numPlayers) names.push('Joueur ' + (names.length + 1));
      names = names.slice(0, numPlayers);
    } else {
      names = ['Toi'];
      for (let i = 1; i < numPlayers; i++) names.push('Robot ' + i);
    }
    return {
      numPlayers, names, allHuman,
      matchRounds: parseInt($('#cfg-rounds').value, 10) || 1,
      difficulty: $('#cfg-difficulty').value,
    };
  }

  function showScreen(name) {
    $('#screen-menu').hidden = name !== 'menu';
    $('#screen-game').hidden = name !== 'game';
  }

  function startGame(cfg) {
    lastCfg = cfg;
    state = E.newGame(Object.assign({}, cfg, { rng: Math.random }));
    ui = { selNum: null, selCell: null, revealed: null };
    $('#log').innerHTML = '';
    showScreen('game');
    log('❓ Manche ' + state.round + '/' + state.matchRounds + ' — 8 dessins à compter + la case « ? ».');
    render();
    maybeBotLoop();
  }

  // ---------- Rendu ----------
  function render() {
    if (!state) return;
    renderScorebar();
    renderGrid();
    renderPad();
    renderMessage();
  }

  function renderScorebar() {
    const bar = $('#scorebar');
    bar.innerHTML = '';
    const tag = el('span', 'score-chip round-tag', 'Manche ' + state.round + '/' + state.matchRounds);
    bar.appendChild(tag);
    for (const p of state.players) {
      const chip = el('span', 'score-chip' + (state.current === p.id && state.phase === 'play' ? ' active' : ''));
      chip.appendChild(el('span', null, (p.isBot ? '🤖 ' : '🧒 ') + p.name));
      chip.appendChild(el('span', null, '⭐ ' + p.roundScore + ' (total ' + p.score + ')'));
      bar.appendChild(chip);
    }
  }

  function renderGrid() {
    const g = $('#grid');
    g.innerHTML = '';
    const active = humanTurn();
    for (const cell of state.cells) {
      const i = cell.index;
      const placed = state.placed[i] !== undefined;
      const d = el('div', 'cell' + (cell.kind === 'mystery' ? ' mystery' : '') + (placed ? ' placed' : '') + (ui.selCell === i ? ' selected' : ''));
      d.dataset.idx = String(i);
      d.appendChild(el('div', 'draw', cell.kind === 'mystery' ? '❓' : cell.emoji.repeat(cell.value)));
      d.appendChild(el('div', 'slot', placed ? String(state.placed[i]) : ''));
      if (active && !placed) d.addEventListener('click', () => onCellClick(i));
      g.appendChild(d);
    }
  }

  function renderPad() {
    const pad = $('#pad');
    pad.innerHTML = '';
    const active = humanTurn();
    for (let n = 1; n <= 9; n++) {
      const used = !!state.used[n];
      const b = el('button', 'num' + (used ? ' used' : '') + (ui.selNum === n ? ' selected' : ''), String(n));
      b.dataset.num = String(n);
      b.disabled = !active || used;
      if (active && !used) b.addEventListener('click', () => onPadClick(n));
      pad.appendChild(b);
    }
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
      box.appendChild(el('div', null, '📱 Passe la tablette à ' + cur.name + '… (🔄 retourne l\'écran si besoin)'));
      const b = el('button', 'action-btn reveal-btn', '👀 C\'est mon tour, ' + cur.name + ' !');
      b.addEventListener('click', () => { ui.revealed = state.current; render(); });
      box.appendChild(b);
      return;
    }
    if (ui.selNum === null && ui.selCell === null) {
      box.appendChild(el('div', null, 'À toi, ' + cur.name + ' ! Choisis une étiquette (1-9), puis une case vide.'));
    } else if (ui.selNum !== null && ui.selCell === null) {
      box.appendChild(el('div', null, 'Étiquette ' + ui.selNum + ' choisie — maintenant, clique sur une case vide.'));
    } else {
      box.appendChild(el('div', null, 'Case choisie — maintenant, choisis une étiquette (1-9).'));
    }
  }

  // ---------- Interactions ----------
  function onPadClick(n) {
    if (!humanTurn()) return;
    ui.selNum = n;
    if (ui.selCell !== null) { const c = ui.selCell; ui.selCell = null; doPlace(c, n); return; }
    render();
  }

  function onCellClick(i) {
    if (!humanTurn()) return;
    if (state.placed[i] !== undefined) return;
    ui.selCell = i;
    if (ui.selNum !== null) { const n = ui.selNum; ui.selNum = null; doPlace(i, n); return; }
    render();
  }

  function doPlace(cellIndex, num) {
    let ev;
    try {
      ev = E.placeNumber(state, state.current, cellIndex, num);
    } catch (err) {
      const box = $('#message');
      box.classList.add('flash');
      box.appendChild(el('div', null, '⛔ ' + err.message));
      return;
    }
    ui.selNum = null; ui.selCell = null; ui.revealed = null;
    handleEvents(ev, cellIndex);
    render();
    maybeBotLoop();
  }

  // ---------- Événements ----------
  function log(msg) {
    const box = $('#log');
    box.prepend(el('div', 'log-line', msg));
    while (box.children.length > 30) box.removeChild(box.lastChild);
  }

  function handleEvents(ev, cellIndex) {
    for (const e of ev) {
      if (e.type === 'correct') {
        log('✅ ' + pname(e.player) + ' pose ' + e.num + ' sur la case ' + (e.cell + 1) + (e.mystery ? ' — c\'est la case « ? » !' : '') + ' (+' + e.points + ' pt)');
        sfx(e.mystery ? 'myst' : 'good');
        animateCell(e.cell, 'pop');
        if (e.mystery) showMyst(pname(e.player), e.num);
      } else if (e.type === 'wrong') {
        log('❌ ' + pname(e.player) + ' essaie ' + e.num + ' sur la case ' + (e.cell + 1) + ' : non, ce n\'est pas ça.');
        sfx('bad');
        animateCell(e.cell, 'shake');
      } else if (e.type === 'roundOver') {
        onRoundOver();
      }
    }
  }

  function animateCell(i, cls) {
    const d = document.querySelector('#grid .cell[data-idx="' + i + '"]');
    if (!d) return;
    d.classList.add(cls);
    setTimeout(() => d.classList.remove(cls), 450);
  }

  function showMyst(name, num) {
    const b = $('#myst-banner');
    b.textContent = '🎉 Nombre mystère trouvé : ' + num + ' (par ' + name + ') !';
    b.hidden = false;
    setTimeout(() => { b.hidden = true; }, 2000);
  }

  function onRoundOver() {
    const res = E.finishRound(state);
    sfx('win');
    setTimeout(() => showEndModal(res), 900);
  }

  // ---------- Modale de fin ----------
  function showEndModal(res) {
    const matchOver = state.round >= state.matchRounds;
    $('#end-title').textContent = matchOver ? '🏆 Fin du match' : 'Fin de la manche ' + res.round;
    const body = $('#end-body');
    body.innerHTML = '';

    const table = el('table', 'score-table');
    const head = el('tr');
    for (const h of ['Joueur', 'Points de la manche', 'Total']) head.appendChild(el('th', null, h));
    table.appendChild(head);
    for (const s of res.scores) {
      const tr = el('tr', res.winners.includes(s.player) ? 'winner' : '');
      tr.appendChild(el('td', null, (state.players[s.player].isBot ? '🤖 ' : '🧒 ') + s.name + (res.winners.includes(s.player) ? ' 🏆' : '')));
      tr.appendChild(el('td', null, String(s.roundScore)));
      tr.appendChild(el('td', null, String(s.total)));
      table.appendChild(tr);
    }
    body.appendChild(table);
    body.appendChild(el('div', null, res.winners.length
      ? 'Vainqueur de la manche : ' + res.winners.map((i) => state.players[i].name).join(', ') + ' !'
      : 'Égalité !'));

    // Grille résolue (justification) + nombre mystère
    body.appendChild(el('div', 'mystery-line', '❓ Le nombre mystère était ' + res.mystery.value + ' (case ' + (res.mystery.cell + 1) + ')'));
    const mini = el('div'); mini.id = 'end-grid';
    for (const cell of state.cells) {
      const m = el('div', 'mini' + (cell.kind === 'mystery' ? ' mystery' : ''));
      m.appendChild(el('div', null, String(state.placed[cell.index] !== undefined ? state.placed[cell.index] : cell.value)));
      m.appendChild(el('div', 'em', cell.kind === 'mystery' ? '❓' : cell.emoji.repeat(Math.min(cell.value, 3)) + (cell.value > 3 ? '…' : '')));
      mini.appendChild(m);
    }
    body.appendChild(mini);

    if (matchOver) {
      const mw = E.matchWinner(state);
      body.appendChild(el('div', null, mw.winners.length
        ? '🏆 Vainqueur du match : ' + mw.winners.map((i) => state.players[i].name).join(', ') + ' avec ' + Math.max(...mw.entries.map((e) => e.total)) + ' points !'
        : 'Match nul !'));
    }

    const btns = $('#end-buttons');
    btns.innerHTML = '';
    if (!matchOver) {
      const next = el('button', 'big-btn', 'Manche suivante ▶');
      next.addEventListener('click', () => {
        $('#modal-end').hidden = true;
        E.nextRound(state);
        ui = { selNum: null, selCell: null, revealed: null };
        log('❓ Manche ' + state.round + '/' + state.matchRounds + ' — nouvelle grille !');
        render();
        maybeBotLoop();
      });
      btns.appendChild(next);
    }
    const again = el('button', 'big-btn', '🔄 Rejouer');
    again.addEventListener('click', () => { $('#modal-end').hidden = true; if (lastCfg) startGame(lastCfg); });
    btns.appendChild(again);
    const menu = el('button', 'big-btn secondary', '🏠 Menu');
    menu.addEventListener('click', () => { $('#modal-end').hidden = true; state = null; showScreen('menu'); });
    btns.appendChild(menu);

    $('#modal-end').hidden = false;
  }

  // ---------- Boucle des robots ----------
  async function maybeBotLoop() {
    if (botBusy || !state) return;
    botBusy = true;
    while (state && state.phase === 'play' && state.players[state.current].isBot) {
      render();
      await sleep(1100);
      if (!state || state.phase !== 'play' || !state.players[state.current].isBot) break;
      const a = E.botChooseAction(state, state.current, state.rng);
      const ev = E.placeNumber(state, state.current, a.cell, a.num);
      ui.revealed = null;
      handleEvents(ev, a.cell);
      render();
      await sleep(500);
    }
    botBusy = false;
    render();
  }

  // ---------- Init ----------
  function init() {
    $('#cfg-mode').addEventListener('change', updateMenuVisibility);
    updateMenuVisibility();
    $('#btn-play').addEventListener('click', () => startGame(readConfig()));
    $('#btn-new').addEventListener('click', () => { state = null; showScreen('menu'); });
    $('#btn-rules').addEventListener('click', () => { $('#modal-rules').hidden = false; });
    $('#btn-close-rules').addEventListener('click', () => { $('#modal-rules').hidden = true; });
    $('#modal-rules').addEventListener('click', (e) => { if (e.target === $('#modal-rules')) $('#modal-rules').hidden = true; });
    $('#btn-flip').addEventListener('click', () => { $('#game-flip').classList.toggle('flipped'); });
    $('#btn-sound').addEventListener('click', function () {
      soundOn = !soundOn;
      this.textContent = soundOn ? '🔊' : '🔇';
      if (soundOn) ensureAudio();
    });
    const ver = $('#ver');
    if (ver) ver.textContent = 'v' + VERSION;
    showScreen('menu');
    window.NMUI = { getState: function () { return state; }, version: VERSION };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
