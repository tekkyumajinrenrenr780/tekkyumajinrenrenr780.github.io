/* v15: choose a valid saved hand by a randomly selected hero position before the game boots. */
(function () {
  'use strict';

  var POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  var STORAGE_KEY = 'pokerSequenceLabV1';
  var LAST_POSITION_KEY = 'pokerLastHeroPositionV15';

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
    return hand.game === 'cash' ? settings.cashEnabled !== false : settings.tournamentEnabled !== false;
  }

  function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function availablePositions(pool) {
    return POSITIONS.filter(function (position) {
      return pool.some(function (hand) { return hand.hero === position; });
    });
  }

  function chooseFromPool(pool) {
    if (!pool.length) return null;

    var grouped = {};
    pool.forEach(function (hand) {
      if (!grouped[hand.hero]) grouped[hand.hero] = [];
      grouped[hand.hero].push(hand);
    });

    var positions = availablePositions(pool);
    if (!positions.length) return randomItem(pool);

    try {
      var previous = sessionStorage.getItem(LAST_POSITION_KEY);
      if (positions.length > 1) {
        var withoutPrevious = positions.filter(function (position) { return position !== previous; });
        if (withoutPrevious.length) positions = withoutPrevious;
      }
    } catch (error) {}

    var selectedPosition = randomItem(positions);
    var selected = randomItem(grouped[selectedPosition]);
    try { sessionStorage.setItem(LAST_POSITION_KEY, selectedPosition); } catch (error) {}
    return selected;
  }

  var library = uniqueHands(window.POKER_ALL_HANDS_V14 || window.POKER_HANDS || []);
  window.POKER_ALL_HANDS_V15 = library.slice();

  var requestedId = '';
  try { requestedId = new URLSearchParams(window.location.search).get('hand') || ''; } catch (error) {}

  var requested = requestedId
    ? library.find(function (hand) { return hand.id === requestedId; })
    : null;

  var settings = readSettings();
  var gamePool = library.filter(function (hand) { return gameEnabled(hand, settings); });
  var preferredPool = settings.difficulty && settings.difficulty !== 'all'
    ? gamePool.filter(function (hand) { return hand.difficulty === settings.difficulty; })
    : gamePool;

  var pools = [preferredPool, gamePool, library].filter(function (pool) { return pool.length; });
  var randomPool = pools.find(function (pool) { return availablePositions(pool).length > 1; })
    || pools[0]
    || [];

  var selected = requested || chooseFromPool(randomPool);
  if (selected) {
    window.POKER_HANDS = [selected];
    window.POKER_SELECTED_HAND_V15 = selected;
  }
}());
