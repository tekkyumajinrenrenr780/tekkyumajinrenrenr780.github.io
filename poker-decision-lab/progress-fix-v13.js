/* v13: auto-progress after a completed action and localize action labels. */
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

  function addAutoNote(delay) {
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
    addAutoNote(delay);

    timer = setTimeout(function () {
      var button = document.getElementById('continueButton');
      if (button && !button.disabled && document.body.contains(button)) button.click();
      timer = null;
    }, delay);
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
