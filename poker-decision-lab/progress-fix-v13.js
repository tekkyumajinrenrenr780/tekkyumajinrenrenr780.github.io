/* v14: auto-progress, localized action labels, and guaranteed different-hand routing. */
(function () {
  'use strict';

  var timer = null;
  var LABELS = {
    'FOLD':'フォールド', 'CHECK':'チェック', 'CALL':'コール', 'BET':'ベット',
    'RAISE':'レイズ', 'OPEN':'オープン', '3-BET':'3ベット', '4-BET':'4ベット',
    'CHECK-RAISE':'チェックレイズ', 'ALL-IN':'オールイン', 'LIMP':'リンプ'
  };

  function clearProgressTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function translateActions() {
    document.querySelectorAll('.action-name, .action-ticker-v12 strong').forEach(function (node) {
      var raw = String(node.textContent || '').trim().toUpperCase();
      if (LABELS[raw]) node.textContent = LABELS[raw];
    });
  }

  function addAutoNote() {
    var notice = document.getElementById('selectionNotice');
    if (!notice || notice.querySelector('.auto-progress-note')) return;
    var note = document.createElement('span');
    note.className = 'auto-progress-note';
    note.textContent = '相手のアクション表示後、自動で次のストリートへ進みます。';
    notice.appendChild(note);
  }

  function scheduleNext(detail) {
    clearProgressTimer();
    if (!detail || detail.isLast || (detail.choice && detail.choice.ends)) return;

    var street = detail.step && detail.step.street;
    var delay = street === 'preflop' ? 3600 : 2400;
    addAutoNote();

    timer = setTimeout(function () {
      var button = document.getElementById('continueButton');
      if (button && !button.disabled && document.body.contains(button)) button.click();
      timer = null;
    }, delay);
  }

  function readSettings() {
    try {
      var stored = JSON.parse(localStorage.getItem('pokerSequenceLabV1') || '{}');
      return Object.assign({
        cashEnabled:true,
        tournamentEnabled:true,
        difficulty:'intermediate'
      }, stored.settings || {});
    } catch (error) {
      return {cashEnabled:true, tournamentEnabled:true, difficulty:'intermediate'};
    }
  }

  function currentHandId() {
    try {
      var runtime = window.PokerSequenceRuntime;
      var snapshot = runtime && typeof runtime.snapshot === 'function' ? runtime.snapshot() : null;
      if (snapshot && snapshot.hand) return snapshot.hand.id;
    } catch (error) {}
    try { return new URLSearchParams(window.location.search).get('hand'); } catch (error) { return null; }
  }

  function gameEnabled(hand, settings) {
    return hand.game === 'cash' ? settings.cashEnabled : settings.tournamentEnabled;
  }

  function uniqueHands(list) {
    var seen = {};
    return (list || []).filter(function (hand) {
      if (!hand || !hand.id || seen[hand.id]) return false;
      seen[hand.id] = true;
      return true;
    });
  }

  function nextFromPool(pool, currentId) {
    var list = uniqueHands(pool);
    if (!list.length) return null;

    var currentIndex = list.findIndex(function (hand) { return hand.id === currentId; });
    if (currentIndex >= 0 && list.length > 1) return list[(currentIndex + 1) % list.length];

    return list.find(function (hand) { return hand.id !== currentId; }) || null;
  }

  function chooseDifferentHand(currentId) {
    var allHands = uniqueHands(window.POKER_ALL_HANDS_V14 || window.POKER_HANDS || []);
    var settings = readSettings();
    var gamePool = allHands.filter(function (hand) { return gameEnabled(hand, settings); });
    var preferredPool = gamePool;

    if (settings.difficulty && settings.difficulty !== 'all') {
      preferredPool = gamePool.filter(function (hand) { return hand.difficulty === settings.difficulty; });
    }

    var pools = [preferredPool, gamePool, allHands];
    for (var i = 0; i < pools.length; i += 1) {
      var next = nextFromPool(pools[i], currentId);
      if (next && next.id !== currentId) return next;
    }
    return null;
  }

  function goToDifferentHand(button) {
    clearProgressTimer();
    var next = chooseDifferentHand(currentHandId());
    if (!next) {
      if (button) {
        button.disabled = false;
        button.textContent = '別のハンドがありません';
      }
      return;
    }

    var url = new URL(window.location.href);
    url.searchParams.set('v', '14');
    url.searchParams.set('hand', next.id);
    url.searchParams.set('reload', String(Date.now()));
    window.location.assign(url.toString());
  }

  window.addEventListener('poker:hero-action', function (event) {
    scheduleNext(event.detail);
    setTimeout(translateActions, 0);
  });
  window.addEventListener('poker:step', function () {
    clearProgressTimer();
    setTimeout(translateActions, 0);
  });
  window.addEventListener('poker:hand-finished', clearProgressTimer);
  window.addEventListener('pageshow', function () { setTimeout(translateActions, 0); });

  document.addEventListener('click', function (event) {
    var nextHandButton = event.target && event.target.closest
      ? event.target.closest('#newHandTop, #nextFullHand')
      : null;

    if (nextHandButton) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      nextHandButton.disabled = true;
      nextHandButton.textContent = '別のハンドを読込中…';
      goToDifferentHand(nextHandButton);
      return;
    }

    if (event.target && event.target.id === 'continueButton') clearProgressTimer();
  }, true);

  var panel = document.querySelector('.table-panel');
  if (panel && window.MutationObserver) {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        translateActions();
      });
    }).observe(panel, {subtree:true, childList:true, characterData:true});
  }
}());
