(() => {
  'use strict';

  const POSITIONS = ['UTG','MP','CO','BTN','SB','BB'];
  const ACTION_LABELS = {
    FOLD:['FOLD','×'], CHECK:['CHECK','✓'], CALL:['CALL','●'], BET:['BET','●'],
    RAISE:['RAISE','↑'], OPEN:['OPEN','↑'], '3-BET':['3-BET','↑↑'], '4-BET':['4-BET','↑↑↑'],
    'CHECK-RAISE':['CHECK-RAISE','↗'], 'ALL-IN':['ALL-IN','⚡'], LIMP:['LIMP','→'], WAITING:['WAITING','…']
  };
  const $ = id => document.getElementById(id);
  const table = document.querySelector('.poker-table');
  if (!table) return;

  let timers = [];
  let animationGeneration = 0;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    animationGeneration++;
  }
  function later(fn, delay) {
    const generation = animationGeneration;
    const timer = setTimeout(() => { if (generation === animationGeneration) fn(); }, delay);
    timers.push(timer);
  }
  function seatFor(position) { return document.querySelector(`.seat-${String(position || '').toLowerCase()}`); }
  function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
  function formatBB(value) { const n = num(value); return n ? `${Number.isInteger(n) ? n : n.toFixed(1)} BB` : ''; }

  function parseAmount(text, context = {}) {
    const source = String(text || '').replace(/〜/g, '–');
    const range = source.match(/([0-9]+(?:\.[0-9]+)?)\s*[–~\-]\s*([0-9]+(?:\.[0-9]+)?)\s*BB/i);
    if (range) return `${range[1]}–${range[2]} BB`;
    const exact = source.match(/([0-9]+(?:\.[0-9]+)?)\s*BB/i);
    if (exact) return `${exact[1]} BB`;
    const percent = source.match(/(?:約)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (context.toCall > 0) return formatBB(context.toCall);
    if (percent) return `${percent[1]}% POT`;
    return '';
  }

  function classify(text, context = {}) {
    const source = String(text || '').trim();
    let type = 'WAITING';

    if (/フォールド|fold/i.test(source)) type = 'FOLD';
    else if (/オールイン|all[ -]?in|jam|shove/i.test(source)) type = 'ALL-IN';
    else if (/チェックレイズ|check[ -]?raise/i.test(source)) type = 'CHECK-RAISE';
    else if (/4\s*ベット|4[ -]?bet/i.test(source)) type = '4-BET';
    else if (/3\s*ベット|3[ -]?bet/i.test(source)) type = '3-BET';
    else if (/リレイズ|再レイズ/i.test(source)) type = 'RAISE';
    else if (/オープン/i.test(source)) type = 'OPEN';
    else if (/レイズ|raise/i.test(source)) type = 'RAISE';
    else if (/ベット|bet/i.test(source)) type = 'BET';
    else if (/コール|call/i.test(source)) type = 'CALL';
    else if (/チェック|check/i.test(source)) type = 'CHECK';
    else if (/リンプ|limp/i.test(source)) type = 'LIMP';
    else if (/継続|continue/i.test(source)) type = context.toCall > 0 ? 'CALL' : 'CHECK';

    let amount = parseAmount(source, context);
    if (type === 'CHECK' || type === 'FOLD' || type === 'WAITING') amount = '';
    if (type === 'CALL' && !amount && context.toCall > 0) amount = formatBB(context.toCall);
    return {type, amount, source};
  }

  function expandRange(start, end) {
    const a = POSITIONS.indexOf(start), b = POSITIONS.indexOf(end);
    if (a < 0 || b < 0) return [];
    const lo = Math.min(a,b), hi = Math.max(a,b);
    return POSITIONS.slice(lo, hi + 1);
  }

  function addAction(list, actor, text, context = {}) {
    if (!POSITIONS.includes(actor)) return;
    const parsed = classify(text, context);
    if (parsed.type === 'WAITING') return;
    const key = `${actor}:${parsed.type}:${parsed.amount}`;
    if (!list.some(item => item.key === key)) list.push({key, actor, ...parsed});
  }

  function parseActions(text, detail = {}, context = {}) {
    const source = String(text || '').replace(/。/g, '、').trim();
    const result = [];
    const hero = detail.hand?.hero || detail.hero;
    const villain = detail.hand?.villain || detail.villain;

    const rangePattern = /(UTG|MP|CO|BTN|SB|BB)\s*[〜~–-]\s*(UTG|MP|CO|BTN|SB|BB)\s*(?:が)?\s*(?:フォールド|fold)/ig;
    let match;
    while ((match = rangePattern.exec(source))) {
      expandRange(match[1].toUpperCase(), match[2].toUpperCase()).forEach(pos => addAction(result, pos, 'フォールド', context));
    }

    const listFoldPattern = /((?:(?:UTG|MP|CO|BTN|SB|BB)(?:\s*[・と、]\s*)?){1,6})\s*(?:が)?\s*(?:フォールド|fold)/ig;
    while ((match = listFoldPattern.exec(source))) {
      const positions = match[1].match(/UTG|MP|CO|BTN|SB|BB/ig) || [];
      positions.forEach(pos => addAction(result, pos.toUpperCase(), 'フォールド', context));
    }

    if (/ブラインド(?:は|が)?フォールド/.test(source)) {
      ['SB','BB'].filter(p => p !== hero && p !== villain).forEach(p => addAction(result, p, 'フォールド', context));
    }
    if (/全員(?:が)?フォールド/.test(source) && hero) {
      const heroIndex = POSITIONS.indexOf(hero);
      POSITIONS.slice(0, Math.max(0, heroIndex)).forEach(p => addAction(result, p, 'フォールド', context));
    }

    if (/^(?:BB|SB|BTN|CO|MP|UTG)?\s*チェック後/.test(source) && hero) addAction(result, hero, 'チェック', {toCall:0});

    const clauses = source.split(/[、;]/).map(s => s.trim()).filter(Boolean);
    clauses.forEach(clause => {
      const positions = clause.match(/UTG|MP|CO|BTN|SB|BB/ig) || [];
      const hasAction = /フォールド|チェックレイズ|チェック|コール|オールイン|4\s*ベット|3\s*ベット|リレイズ|レイズ|オープン|ベット|リンプ|fold|check|call|raise|bet/i.test(clause);
      if (!hasAction) return;
      if (positions.length) positions.forEach(pos => addAction(result, pos.toUpperCase(), clause, context));
      else if (/チェックバック/.test(clause) && hero) addAction(result, hero, clause, {toCall:0});
    });

    if (detail.step?.street === 'preflop') {
      const opener = result.find(item => ['OPEN','RAISE','3-BET','4-BET'].includes(item.type));
      if (opener) {
        const openerIndex = POSITIONS.indexOf(opener.actor);
        POSITIONS.slice(0, Math.max(0, openerIndex)).forEach(pos => {
          if (pos !== hero) addAction(result, pos, 'フォールド', context);
        });
      }
    }
    return result;
  }

  function inferFoldsBeforeResponder(hero, responder, existing) {
    const heroIndex = POSITIONS.indexOf(hero), responseIndex = POSITIONS.indexOf(responder);
    if (heroIndex < 0 || responseIndex < 0 || responseIndex <= heroIndex) return [];
    return POSITIONS.slice(heroIndex + 1, responseIndex)
      .filter(pos => !existing.some(action => action.actor === pos))
      .map(actor => ({actor, ...classify('フォールド', {})}));
  }

  function ensureBubble(seat) {
    let bubble = seat.querySelector('.seat-action-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'seat-action-bubble';
      seat.appendChild(bubble);
    }
    return bubble;
  }

  function ensureAnnouncer() {
    let node = table.querySelector('.action-announcer');
    if (!node) {
      node = document.createElement('div');
      node.className = 'action-announcer';
      table.appendChild(node);
    }
    return node;
  }

  function resetTableActions() {
    document.querySelectorAll('.seat').forEach(seat => {
      seat.classList.remove('action-active','action-fold','action-check','action-call','action-bet','action-raise','action-open','action-3-bet','action-4-bet','action-check-raise','action-all-in','action-limp','folded');
      const bubble = ensureBubble(seat);
      bubble.className = 'seat-action-bubble';
      bubble.innerHTML = '';
    });
    const announcer = ensureAnnouncer();
    announcer.classList.remove('visible');
    announcer.innerHTML = '';
    table.querySelectorAll('.moving-chip').forEach(n => n.remove());
  }

  function typeClass(type) { return `action-${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }

  function animateChip(seat, action) {
    if (!action.amount || !['CALL','BET','RAISE','OPEN','3-BET','4-BET','CHECK-RAISE','ALL-IN','LIMP'].includes(action.type)) return;
    const tableRect = table.getBoundingClientRect();
    const seatRect = seat.getBoundingClientRect();
    const chip = document.createElement('span');
    chip.className = `moving-chip ${typeClass(action.type)}`;
    chip.textContent = action.amount;
    chip.style.left = `${seatRect.left - tableRect.left + seatRect.width / 2}px`;
    chip.style.top = `${seatRect.top - tableRect.top + seatRect.height / 2}px`;
    table.appendChild(chip);
    const dx = tableRect.width / 2 - (seatRect.left - tableRect.left + seatRect.width / 2);
    const dy = tableRect.height / 2 - (seatRect.top - tableRect.top + seatRect.height / 2);
    const animation = chip.animate([
      {transform:'translate(-50%,-50%) scale(.75)', opacity:0},
      {transform:'translate(-50%,-50%) scale(1)', opacity:1, offset:.2},
      {transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.82)`, opacity:.95}
    ], {duration:620, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards'});
    animation.onfinish = () => later(() => chip.remove(), 450);
  }

  function showAction(action) {
    const seat = seatFor(action.actor);
    if (!seat) return;
    const bubble = ensureBubble(seat);
    const [label, icon] = ACTION_LABELS[action.type] || [action.type, ''];
    const cls = typeClass(action.type);

    seat.classList.remove('action-active','action-fold','action-check','action-call','action-bet','action-raise','action-open','action-3-bet','action-4-bet','action-check-raise','action-all-in','action-limp');
    void seat.offsetWidth;
    seat.classList.add('action-active', cls);
    if (action.type === 'FOLD') seat.classList.add('folded');

    bubble.className = `seat-action-bubble visible ${cls}`;
    bubble.innerHTML = `<span class="action-icon">${icon}</span><span class="action-name">${label}</span>${action.amount ? `<span class="action-amount">${action.amount}</span>` : ''}`;

    const announcer = ensureAnnouncer();
    announcer.innerHTML = `<strong>${action.actor}</strong><span>${label}${action.amount ? ` ${action.amount}` : ''}</span>`;
    announcer.classList.remove('visible');
    void announcer.offsetWidth;
    announcer.classList.add('visible', cls);

    animateChip(seat, action);
    later(() => {
      seat.classList.remove('action-active');
      announcer.classList.remove('visible', cls);
    }, 700);
  }

  function playSequence(actions, startDelay = 80) {
    actions.forEach((action, index) => later(() => showAction(action), startDelay + index * 420));
  }

  function handleStep(detail) {
    clearTimers();
    resetTableActions();
    const step = detail.step;
    const context = {toCall:num(step?.toCall), pot:num(step?.pot)};
    const source = [step?.villainAction, step?.situation].filter(Boolean).join('、');
    const actions = parseActions(source, detail, context);
    playSequence(actions);
  }

  function handleHeroAction(detail) {
    clearTimers();
    const context = {toCall:num(detail.step?.toCall), pot:num(detail.step?.pot)};
    const heroAction = classify(detail.choice?.label, context);
    showAction({actor:detail.hero, ...heroAction});

    if (!detail.choice?.ends) {
      const responses = parseActions(detail.after, detail, {toCall:0, pot:num(detail.step?.pot)}).filter(a => a.actor !== detail.hero);
      if (detail.step?.street === 'preflop') {
        const responder = responses.find(action => action.type === 'CALL' || action.type === 'RAISE' || action.type === 'ALL-IN');
        if (responder) responses.unshift(...inferFoldsBeforeResponder(detail.hero, responder.actor, responses));
      }
      playSequence(responses, 760);
    }
  }

  function addLegend() {
    const panel = document.querySelector('.table-panel');
    if (!panel || panel.querySelector('.table-clarity-legend')) return;
    const legend = document.createElement('div');
    legend.className = 'table-clarity-legend';
    legend.innerHTML = '<span><i class="hero-dot"></i>YOU</span><span><i class="villain-dot"></i>主な相手</span><span>各席の吹き出し＝そのプレイヤーの行動</span>';
    table.insertAdjacentElement('afterend', legend);
  }

  window.addEventListener('poker:step', event => handleStep(event.detail));
  window.addEventListener('poker:hero-action', event => handleHeroAction(event.detail));
  window.addEventListener('poker:hand-finished', () => clearTimers());
  window.addEventListener('pageshow', () => {
    const snapshot = window.PokerSequenceRuntime?.snapshot?.() || window.POKER_SEQUENCE_SNAPSHOT;
    if (snapshot?.step) handleStep(snapshot);
  });

  addLegend();
  const initial = window.PokerSequenceRuntime?.snapshot?.() || window.POKER_SEQUENCE_SNAPSHOT;
  if (initial?.step) handleStep(initial);
})();
