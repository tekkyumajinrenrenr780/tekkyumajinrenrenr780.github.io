(function () {
  'use strict';

  var POSITIONS = ['UTG','MP','CO','BTN','SB','BB'];
  var LABELS = {
    FOLD:'FOLD', CHECK:'CHECK', CALL:'CALL', BET:'BET', RAISE:'RAISE',
    OPEN:'OPEN', '3-BET':'3-BET', '4-BET':'4-BET',
    'CHECK-RAISE':'CHECK-RAISE', 'ALL-IN':'ALL-IN', LIMP:'LIMP'
  };
  var table = document.querySelector('.poker-table');
  if (!table) return;

  var timers = [];
  var generation = 0;
  var ticker = null;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    generation += 1;
  }

  function later(fn, delay) {
    var currentGeneration = generation;
    var timer = setTimeout(function () {
      if (currentGeneration === generation) fn();
    }, delay);
    timers.push(timer);
  }

  function seatFor(position) {
    return document.querySelector('.seat-' + String(position || '').toLowerCase());
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatBB(value) {
    var n = numberValue(value);
    if (!n) return '';
    return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + ' BB';
  }

  function parseAmount(text, context) {
    var source = String(text || '').replace(/〜/g, '–');
    var range = source.match(/([0-9]+(?:\.[0-9]+)?)\s*[–~\-]\s*([0-9]+(?:\.[0-9]+)?)\s*BB/i);
    if (range) return range[1] + '–' + range[2] + ' BB';

    var exact = source.match(/([0-9]+(?:\.[0-9]+)?)\s*BB/i);
    if (exact) return exact[1] + ' BB';

    var percent = source.match(/(?:約)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (context && context.toCall > 0) return formatBB(context.toCall);
    if (percent) return percent[1] + '% POT';
    return '';
  }

  function classify(text, context) {
    var source = String(text || '').trim();
    var type = '';

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
    else if (/継続|continue/i.test(source)) type = context && context.toCall > 0 ? 'CALL' : 'CHECK';

    if (!type) return null;

    var amount = parseAmount(source, context || {});
    if (type === 'CHECK' || type === 'FOLD') amount = '';
    if (type === 'CALL' && !amount && context && context.toCall > 0) amount = formatBB(context.toCall);
    return {type:type, amount:amount, source:source};
  }

  function expandRange(start, end) {
    var a = POSITIONS.indexOf(start);
    var b = POSITIONS.indexOf(end);
    if (a < 0 || b < 0) return [];
    return POSITIONS.slice(Math.min(a,b), Math.max(a,b) + 1);
  }

  function addAction(list, actor, text, context) {
    if (POSITIONS.indexOf(actor) < 0) return;
    var parsed = classify(text, context || {});
    if (!parsed) return;
    var key = actor + ':' + parsed.type + ':' + parsed.amount;
    if (!list.some(function (item) { return item.key === key; })) {
      list.push({key:key, actor:actor, type:parsed.type, amount:parsed.amount, source:parsed.source});
    }
  }

  function parseActions(text, detail, context) {
    var source = String(text || '').replace(/。/g, '、').trim();
    var actions = [];
    var hero = detail && (detail.hero || (detail.hand && detail.hand.hero));
    var villain = detail && (detail.villain || (detail.hand && detail.hand.villain));
    var match;

    var rangePattern = /(UTG|MP|CO|BTN|SB|BB)\s*[〜~–-]\s*(UTG|MP|CO|BTN|SB|BB)\s*(?:が)?\s*(?:フォールド|fold)/ig;
    while ((match = rangePattern.exec(source))) {
      expandRange(match[1].toUpperCase(), match[2].toUpperCase()).forEach(function (pos) {
        addAction(actions, pos, 'フォールド', context);
      });
    }

    var listFoldPattern = /((?:(?:UTG|MP|CO|BTN|SB|BB)(?:\s*[・と、]\s*)?){1,6})\s*(?:が)?\s*(?:フォールド|fold)/ig;
    while ((match = listFoldPattern.exec(source))) {
      (match[1].match(/UTG|MP|CO|BTN|SB|BB/ig) || []).forEach(function (pos) {
        addAction(actions, pos.toUpperCase(), 'フォールド', context);
      });
    }

    if (/ブラインド(?:は|が)?フォールド/.test(source)) {
      ['SB','BB'].forEach(function (pos) {
        if (pos !== hero && pos !== villain) addAction(actions, pos, 'フォールド', context);
      });
    }

    if (/全員(?:が)?フォールド/.test(source) && hero) {
      POSITIONS.slice(0, Math.max(0, POSITIONS.indexOf(hero))).forEach(function (pos) {
        addAction(actions, pos, 'フォールド', context);
      });
    }

    if (/^(?:BB|SB|BTN|CO|MP|UTG)?\s*チェック後/.test(source) && hero) {
      addAction(actions, hero, 'チェック', {toCall:0});
    }

    source.split(/[、;]/).map(function (part) { return part.trim(); }).filter(Boolean).forEach(function (clause) {
      var positions = clause.match(/UTG|MP|CO|BTN|SB|BB/ig) || [];
      if (!/フォールド|チェックレイズ|チェック|コール|オールイン|4\s*ベット|3\s*ベット|リレイズ|レイズ|オープン|ベット|リンプ|fold|check|call|raise|bet/i.test(clause)) return;
      if (positions.length) {
        positions.forEach(function (pos) { addAction(actions, pos.toUpperCase(), clause, context); });
      } else if (/チェックバック/.test(clause) && hero) {
        addAction(actions, hero, clause, {toCall:0});
      }
    });

    return actions;
  }

  function inferFoldsBeforeResponder(hero, responder, existing) {
    var heroIndex = POSITIONS.indexOf(hero);
    var responderIndex = POSITIONS.indexOf(responder);
    if (heroIndex < 0 || responderIndex < 0 || responderIndex <= heroIndex) return [];
    return POSITIONS.slice(heroIndex + 1, responderIndex)
      .filter(function (pos) { return !existing.some(function (action) { return action.actor === pos; }); })
      .map(function (actor) {
        var parsed = classify('フォールド', {});
        return {actor:actor, type:parsed.type, amount:'', source:'フォールド'};
      });
  }

  function ensureBubble(seat) {
    var bubble = seat.querySelector('.seat-action-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'seat-action-bubble';
      seat.appendChild(bubble);
    }
    return bubble;
  }

  function ensureTicker() {
    if (ticker && ticker.isConnected) return ticker;
    ticker = document.querySelector('.action-ticker-v12');
    if (!ticker) {
      ticker = document.createElement('div');
      ticker.className = 'action-ticker-v12';
      ticker.setAttribute('aria-live', 'polite');
      table.insertAdjacentElement('afterend', ticker);
    }
    return ticker;
  }

  function hideAllBubbles() {
    document.querySelectorAll('.seat-action-bubble').forEach(function (bubble) {
      bubble.className = 'seat-action-bubble';
      bubble.innerHTML = '';
    });
    document.querySelectorAll('.seat').forEach(function (seat) {
      seat.classList.remove('action-active','action-fold','action-check','action-call','action-bet','action-raise','action-open','action-3-bet','action-4-bet','action-check-raise','action-all-in','action-limp');
    });
  }

  function resetTable() {
    hideAllBubbles();
    document.querySelectorAll('.seat').forEach(function (seat) {
      seat.classList.remove('folded');
    });
    var node = ensureTicker();
    node.className = 'action-ticker-v12';
    node.innerHTML = '<span class="ticker-label">ACTION</span><strong>現在のアクションを表示します</strong>';
  }

  function typeClass(type) {
    return 'action-' + String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function showAction(action) {
    hideAllBubbles();
    var seat = seatFor(action.actor);
    if (!seat) return;

    var cls = typeClass(action.type);
    var bubble = ensureBubble(seat);
    seat.classList.add('action-active', cls);
    if (action.type === 'FOLD') seat.classList.add('folded');

    bubble.className = 'seat-action-bubble visible ' + cls;
    bubble.innerHTML =
      '<span class="action-name">' + (LABELS[action.type] || action.type) + '</span>' +
      (action.amount ? '<span class="action-amount">' + action.amount + '</span>' : '');

    var node = ensureTicker();
    node.className = 'action-ticker-v12 visible ' + cls;
    node.innerHTML =
      '<span class="ticker-player">' + action.actor + '</span>' +
      '<strong>' + (LABELS[action.type] || action.type) + '</strong>' +
      (action.amount ? '<span class="ticker-amount">' + action.amount + '</span>' : '');

    later(function () {
      bubble.className = 'seat-action-bubble';
      bubble.innerHTML = '';
      seat.classList.remove('action-active', cls);
    }, 760);
  }

  function playSequence(actions, startDelay) {
    actions.forEach(function (action, index) {
      later(function () { showAction(action); }, (startDelay || 80) + index * 620);
    });
  }

  function handleStep(detail) {
    try {
      clearTimers();
      resetTable();
      var step = detail && detail.step;
      if (!step) return;
      var context = {toCall:numberValue(step.toCall), pot:numberValue(step.pot)};
      var source = [step.villainAction, step.situation].filter(Boolean).join('、');
      playSequence(parseActions(source, detail, context), 120);
    } catch (error) {
      console.warn('Action display skipped:', error);
    }
  }

  function handleHeroAction(detail) {
    try {
      clearTimers();
      var context = {toCall:numberValue(detail && detail.step && detail.step.toCall), pot:numberValue(detail && detail.step && detail.step.pot)};
      var heroAction = classify(detail && detail.choice && detail.choice.label, context);
      if (heroAction) showAction({actor:detail.hero, type:heroAction.type, amount:heroAction.amount, source:heroAction.source});

      if (detail && detail.choice && !detail.choice.ends) {
        var responses = parseActions(detail.after, detail, {toCall:0, pot:context.pot})
          .filter(function (action) { return action.actor !== detail.hero; });

        if (detail.step && detail.step.street === 'preflop') {
          var responder = responses.find(function (action) {
            return action.type === 'CALL' || action.type === 'RAISE' || action.type === 'ALL-IN';
          });
          if (responder) responses = inferFoldsBeforeResponder(detail.hero, responder.actor, responses).concat(responses);
        }
        playSequence(responses, 860);
      }
    } catch (error) {
      console.warn('Hero action display skipped:', error);
    }
  }

  window.addEventListener('poker:step', function (event) { handleStep(event.detail); });
  window.addEventListener('poker:hero-action', function (event) { handleHeroAction(event.detail); });
  window.addEventListener('poker:hand-finished', clearTimers);
  window.addEventListener('pageshow', function () {
    var snapshot = window.PokerSequenceRuntime && window.PokerSequenceRuntime.snapshot
      ? window.PokerSequenceRuntime.snapshot()
      : window.POKER_SEQUENCE_SNAPSHOT;
    if (snapshot && snapshot.step) handleStep(snapshot);
  });

  resetTable();
  var initial = window.PokerSequenceRuntime && window.PokerSequenceRuntime.snapshot
    ? window.PokerSequenceRuntime.snapshot()
    : window.POKER_SEQUENCE_SNAPSHOT;
  if (initial && initial.step) handleStep(initial);
}());