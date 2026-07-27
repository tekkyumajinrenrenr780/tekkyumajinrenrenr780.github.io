/* v14: guarantee that New Hand and Next Hand load a different saved scenario. */
(function () {
  'use strict';

  var allHands = Array.isArray(window.POKER_HANDS) ? window.POKER_HANDS.slice() : [];
  window.POKER_ALL_HANDS_V14 = allHands;

  var params = new URLSearchParams(window.location.search);
  var requestedHandId = params.get('hand');

  if (requestedHandId) {
    var requestedHand = allHands.find(function (hand) { return hand.id === requestedHandId; });
    if (requestedHand) window.POKER_HANDS = [requestedHand];
  }

  function loadSettings() {
    try {
      var stored = JSON.parse(localStorage.getItem('pokerSequenceLabV1') || '{}');
      return Object.assign({
        cashEnabled: true,
        tournamentEnabled: true,
        difficulty: 'intermediate'
      }, stored.settings || {});
    } catch (error) {
      return {cashEnabled:true, tournamentEnabled:true, difficulty:'intermediate'};
    }
  }

  function gameEnabled(hand, settings) {
    return hand.game === 'cash' ? settings.cashEnabled : settings.tournamentEnabled;
  }

  function uniqueHands(list) {
    var seen = {};
    return list.filter(function (hand) {
      if (!hand || !hand.id || seen[hand.id]) return false;
      seen[hand.id] = true;
      return true;
    });
  }

  function nextFromPool(pool, currentId) {
    var list = uniqueHands(pool);
    if (!list.length) return null;
    if (!currentId) return list[0];

    var currentIndex = list.findIndex(function (hand) { return hand.id === currentId; });
    if (currentIndex >= 0 && list.length > 1) return list[(currentIndex + 1) % list.length];

    var alternative = list.find(function (hand) { return hand.id !== currentId; });
    return alternative || null;
  }

  function chooseDifferentHand(currentId) {
    var settings = loadSettings();
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

  function currentHandId() {
    try {
      var runtime = window.PokerSequenceRuntime;
      var snapshot = runtime && typeof runtime.snapshot === 'function' ? runtime.snapshot() : null;
      return snapshot && snapshot.hand ? snapshot.hand.id : requestedHandId;
    } catch (error) {
      return requestedHandId;
    }
  }

  function navigateToNextHand(button) {
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

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest
      ? event.target.closest('#newHandTop, #nextFullHand')
      : null;
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    target.disabled = true;
    target.textContent = '別のハンドを読込中…';
    navigateToNextHand(target);
  }, true);
}());
