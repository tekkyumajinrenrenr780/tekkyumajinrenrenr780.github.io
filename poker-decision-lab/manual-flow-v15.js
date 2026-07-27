/* v15: every hero decision is manual; evaluation is shown only after the hand ends. */
(function () {
  'use strict';

  var POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  var STORAGE_KEY = 'pokerSequenceLabV1';

  function uniqueHands(list) {
    var seen = {};
    return (list || []).filter(function (hand) {
      if (!hand || !hand.id || seen[hand.id]) return false;
      seen[hand.id] = true;
      return true;
    });
  }

  function readSettings() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.assign({cashEnabled:true, tournamentEnabled:true, difficulty:'intermediate'}, stored.settings || {});
    } catch (error) {
      return {cashEnabled:true, tournamentEnabled:true, difficulty:'intermediate'};
    }
  }

  function currentHand() {
    var snapshot = window.PokerSequenceRuntime && window.PokerSequenceRuntime.snapshot
      ? window.PokerSequenceRuntime.snapshot()
      : window.POKER_SEQUENCE_SNAPSHOT;
    return snapshot && snapshot.hand ? snapshot.hand : window.POKER_SELECTED_HAND_V15;
  }

  function enabledForGame(hand, settings) {
    return hand.game === 'cash' ? settings.cashEnabled !== false : settings.tournamentEnabled !== false;
  }

  function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function chooseNextHand() {
    var library = uniqueHands(window.POKER_ALL_HANDS_V15 || window.POKER_ALL_HANDS_V14 || []);
    var current = currentHand();
    var currentId = current && current.id;
    var currentPosition = current && current.hero;
    var settings = readSettings();

    var gamePool = library.filter(function (hand) { return enabledForGame(hand, settings); });
    var preferredPool = settings.difficulty && settings.difficulty !== 'all'
      ? gamePool.filter(function (hand) { return hand.difficulty === settings.difficulty; })
      : gamePool;

    var pools = [preferredPool, gamePool, library];
    for (var i = 0; i < pools.length; i += 1) {
      var pool = uniqueHands(pools[i]).filter(function (hand) { return hand.id !== currentId; });
      if (!pool.length) continue;

      var positions = POSITIONS.filter(function (position) {
        return pool.some(function (hand) { return hand.hero === position; });
      });
      if (positions.length > 1 && currentPosition) {
        var otherPositions = positions.filter(function (position) { return position !== currentPosition; });
        if (otherPositions.length) positions = otherPositions;
      }

      var selectedPosition = positions.length ? randomItem(positions) : null;
      var positionPool = selectedPosition
        ? pool.filter(function (hand) { return hand.hero === selectedPosition; })
        : pool;
      if (positionPool.length) return randomItem(positionPool);
    }
    return null;
  }

  function navigateToHand(hand, button) {
    if (!hand) {
      if (button) {
        button.disabled = false;
        button.textContent = '別のハンドがありません';
      }
      return;
    }
    var url = new URL(window.location.href);
    url.searchParams.set('v', '15');
    url.searchParams.set('hand', hand.id);
    url.searchParams.set('reload', String(Date.now()));
    window.location.assign(url.toString());
  }

  function markManualFlow() {
    var notice = document.getElementById('selectionNotice');
    if (!notice || notice.classList.contains('hidden') || notice.querySelector('.manual-flow-note-v15')) return;
    var note = document.createElement('span');
    note.className = 'manual-flow-note-v15';
    note.textContent = '次のストリートへ進むにはボタンを押してください。評価はハンド終了後にまとめて表示します。';
    notice.appendChild(note);
  }

  document.addEventListener('click', function (event) {
    var nextHandButton = event.target && event.target.closest
      ? event.target.closest('#newHandTop, #nextFullHand')
      : null;

    if (nextHandButton) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      nextHandButton.disabled = true;
      nextHandButton.textContent = 'ランダムなポジションを選択中…';
      navigateToHand(chooseNextHand(), nextHandButton);
      return;
    }
  }, true);

  window.addEventListener('poker:hero-action', function () {
    setTimeout(markManualFlow, 0);
  });

  var observer = new MutationObserver(markManualFlow);
  var selectionNotice = document.getElementById('selectionNotice');
  if (selectionNotice) observer.observe(selectionNotice, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
}());
