(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var STREET_JA = {preflop:'プリフロップ', flop:'フロップ', turn:'ターン', river:'リバー'};
  var STORAGE_KEY = 'pokerSequenceLabV1';
  var DEFAULT_STATE = {
    history: [], handCounter: 1, aStreak: 0, bestStreak: 0,
    settings: {cashEnabled:true, tournamentEnabled:true, difficulty:'intermediate', adaptiveMode:true}
  };
  var HANDS = Array.isArray(window.POKER_HANDS) ? window.POKER_HANDS : [];
  var state = loadState();
  var current = null;
  var stepIndex = 0;
  var decisions = [];
  var awaitingNext = false;

  function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      var base = cloneDefault();
      base.history = Array.isArray(raw.history) ? raw.history : [];
      base.handCounter = Number(raw.handCounter) || 1;
      base.aStreak = Number(raw.aStreak) || 0;
      base.bestStreak = Number(raw.bestStreak) || 0;
      base.settings = Object.assign({}, DEFAULT_STATE.settings, raw.settings || {});
      return base;
    } catch (error) {
      return cloneDefault();
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) {}
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function (ch) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch];
    });
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, {detail: detail})); } catch (error) {}
  }

  function snapshot() {
    if (!current) return null;
    return {
      hand: current,
      step: current.steps[stepIndex],
      stepIndex: stepIndex,
      decisions: decisions.slice(),
      awaitingNext: awaitingNext
    };
  }

  window.PokerSequenceRuntime = {snapshot: snapshot};

  function cardHtml(card) {
    if (!card) return '<span class="card-face placeholder">?</span>';
    var suit = card.slice(-1);
    var rank = card.slice(0, -1);
    var red = '♥♦'.indexOf(suit) >= 0 ? ' red' : '';
    return '<span class="card-face' + red + '">' + esc(rank + suit) + '</span>';
  }

  function renderCards(node, cards, count) {
    if (!node) return;
    var list = Array.isArray(cards) ? cards.slice() : [];
    while (list.length < (count || 0)) list.push('');
    node.innerHTML = list.map(cardHtml).join('');
  }

  function grade(score) {
    if (score >= 90) return ['A', '非常に良いライン', ''];
    if (score >= 75) return ['B', '概ね妥当', 'b'];
    if (score >= 55) return ['C', '改善余地あり', 'c'];
    return ['D', '大きな見直しが必要', 'd'];
  }

  function availableHands() {
    var settings = state.settings;
    var list = HANDS.filter(function (hand) {
      return hand.game === 'cash' ? settings.cashEnabled : settings.tournamentEnabled;
    });
    if (settings.difficulty !== 'all') {
      var filtered = list.filter(function (hand) { return hand.difficulty === settings.difficulty; });
      if (filtered.length) list = filtered;
    }
    return list.length ? list : HANDS;
  }

  function streetStats() {
    var map = {};
    state.history.forEach(function (hand) {
      (hand.decisions || []).forEach(function (decision) {
        if (!map[decision.street]) map[decision.street] = {sum:0, n:0};
        map[decision.street].sum += Number(decision.score) || 0;
        map[decision.street].n += 1;
      });
    });
    var result = {};
    Object.keys(map).forEach(function (key) { result[key] = map[key].sum / map[key].n; });
    return result;
  }

  function weakStreet() {
    var stats = streetStats();
    var entries = Object.keys(stats).map(function (key) { return [key, stats[key]]; });
    entries.sort(function (a, b) { return a[1] - b[1]; });
    return entries.length ? entries[0][0] : 'river';
  }

  function chooseHand() {
    var list = availableHands();
    if (!list.length) return null;
    var alternatives = list.filter(function (hand) { return !current || hand.id !== current.id; });
    if (alternatives.length) list = alternatives;
    if (state.settings.adaptiveMode && state.history.length >= 2) {
      var weak = weakStreet();
      var weighted = [];
      list.forEach(function (hand) {
        var containsWeak = (hand.steps || []).some(function (step) { return step.street === weak; });
        var count = containsWeak ? 3 : 1;
        for (var i = 0; i < count; i += 1) weighted.push(hand);
      });
      if (weighted.length) list = weighted;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function showFatal(message) {
    var intro = byId('handIntro');
    if (intro) intro.innerHTML = '<strong>起動エラー</strong><br>' + esc(message);
    var buttons = byId('decisionButtons');
    if (buttons) buttons.innerHTML = '<button class="action-button" type="button" id="retryBoot">再読み込み</button>';
    var retry = byId('retryBoot');
    if (retry) retry.onclick = function () { location.reload(); };
  }

  function startHand(hand) {
    if (!hand || !Array.isArray(hand.steps) || !hand.steps.length) {
      showFatal('保存済みシナリオを読み込めませんでした。ページを再読み込みしてください。');
      return;
    }
    current = hand;
    stepIndex = 0;
    decisions = [];
    awaitingNext = false;

    byId('finalReport').classList.add('hidden');
    byId('decisionArea').classList.remove('hidden');
    byId('selectionNotice').classList.add('hidden');
    byId('handIntro').textContent = hand.intro || '';
    byId('gameBadge').textContent = hand.game === 'cash' ? 'Cash ' + hand.stack + 'BB' : 'Tournament ' + hand.stack + 'BB';
    byId('difficultyBadge').textContent = hand.difficulty ? hand.difficulty.charAt(0).toUpperCase() + hand.difficulty.slice(1) : 'All';
    byId('handNumber').textContent = 'HAND #' + String(state.handCounter).padStart(3, '0');
    renderStep();
  }

  function renderStep() {
    if (!current || !current.steps[stepIndex]) return;
    var step = current.steps[stepIndex];
    awaitingNext = false;

    byId('streetLabel').textContent = (STREET_JA[step.street] || step.street).toUpperCase();
    byId('decisionTitle').textContent = (STREET_JA[step.street] || step.street) + 'の判断';
    byId('stepCounter').textContent = (stepIndex + 1) + ' / ' + current.steps.length;
    byId('situationText').textContent = step.situation || '';
    byId('factPosition').textContent = current.hero || '—';
    byId('factPot').textContent = step.pot + ' BB';
    byId('factVillain').textContent = step.villainAction || '—';
    byId('factCall').textContent = step.toCall + ' BB';
    byId('decisionPrompt').textContent = step.prompt || 'あなたのアクションは？';
    byId('potSize').textContent = step.pot + ' BB';
    byId('toCall').textContent = step.toCall + ' BB';
    byId('effectiveStack').textContent = step.stack + ' BB';
    byId('heroPosition').textContent = current.hero || '—';
    byId('tableAction').textContent = step.villainAction || 'あなたのアクションです。';

    renderCards(byId('holeCards'), current.hand || [], 2);
    renderCards(byId('boardCards'), step.board || [], step.street === 'preflop' ? 0 : 5);

    document.querySelectorAll('.seat').forEach(function (seat) { seat.classList.remove('hero', 'villain'); });
    var heroSeat = document.querySelector('.seat-' + String(current.hero || '').toLowerCase());
    var villainSeat = document.querySelector('.seat-' + String(current.villain || '').toLowerCase());
    if (heroSeat) heroSeat.classList.add('hero');
    if (villainSeat) villainSeat.classList.add('villain');

    ['UTG','MP','CO','BTN','SB','BB'].forEach(function (position) {
      var node = byId('seat' + position);
      if (node) node.textContent = Math.max(0, Math.round(Number(step.stack) || 0)) + ' BB';
    });

    document.querySelectorAll('.street-progress span').forEach(function (node, index) {
      node.classList.toggle('done', index < stepIndex);
      node.classList.toggle('current', index === stepIndex);
    });

    renderActionHistory();
    var buttons = byId('decisionButtons');
    buttons.innerHTML = '';
    (step.choices || []).forEach(function (choice) {
      var button = document.createElement('button');
      button.className = 'action-button';
      button.type = 'button';
      button.textContent = choice.label;
      button.onclick = function () { selectChoice(choice, button); };
      buttons.appendChild(button);
    });

    byId('selectionNotice').classList.add('hidden');
    byId('selectionNotice').innerHTML = '';
    var detail = {hand:current, step:step, stepIndex:stepIndex, decisions:decisions.slice()};
    window.POKER_SEQUENCE_SNAPSHOT = detail;
    emit('poker:step', detail);
  }

  function renderActionHistory() {
    var list = byId('actionHistory');
    if (!decisions.length) {
      list.innerHTML = '<li class="empty-history">まだあなたのアクションはありません。</li>';
      return;
    }
    list.innerHTML = decisions.map(function (decision, index) {
      var step = current.steps[index];
      return '<li><strong>' + esc(STREET_JA[decision.street] || decision.street) + '</strong>：' + esc(decision.choice.label) + '<br><span class="small">' + esc(step.after || '') + '</span></li>';
    }).join('');
  }

  function selectChoice(choice, button) {
    if (awaitingNext || !current) return;
    awaitingNext = true;
    document.querySelectorAll('.action-button').forEach(function (node) { node.disabled = true; });
    button.classList.add('selected');

    var step = current.steps[stepIndex];
    decisions.push({street:step.street, choice:choice});
    renderActionHistory();
    var isLast = stepIndex === current.steps.length - 1 || Boolean(choice.ends);
    var detail = {
      hand:current, step:step, stepIndex:stepIndex,
      hero:current.hero, villain:current.villain,
      choice:choice, after:step.after || '', isLast:isLast,
      decisions:decisions.slice()
    };
    window.POKER_SEQUENCE_SNAPSHOT = Object.assign({}, detail, {phase:'hero-action'});
    emit('poker:hero-action', detail);

    var notice = byId('selectionNotice');
    notice.classList.remove('hidden');
    notice.innerHTML = '<p><strong>' + esc(choice.label) + '</strong>を記録しました。' + esc(step.after || '') + '</p>' +
      '<button id="continueButton" class="button primary" type="button">' + (isLast ? 'ハンド全体を評価' : '次のストリートへ') + '</button>';
    byId('continueButton').onclick = function () {
      if (isLast) finishHand();
      else {
        stepIndex += 1;
        renderStep();
        var panel = document.querySelector('.decision-panel');
        window.scrollTo({top:Math.max(0, panel ? panel.offsetTop : 0), behavior:'smooth'});
      }
    };
  }

  function lineComment(avg, consistency, weakest) {
    if (avg >= 90 && consistency >= 85) return '各ストリートでベットの目的がつながっています。';
    if (consistency < 60) return '判断がストリート間でぶれています。特に' + (STREET_JA[weakest.street] || weakest.street) + 'を見直してください。';
    return (STREET_JA[weakest.street] || weakest.street) + 'が全体スコアを下げています。前のストリートから次の計画を立ててください。';
  }

  function finishHand() {
    if (!decisions.length) return;
    var scores = decisions.map(function (decision) { return Number(decision.choice.score) || 0; });
    var avg = Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length);
    var variance = scores.reduce(function (sum, score) { return sum + Math.pow(score - avg, 2); }, 0) / scores.length;
    var consistency = Math.max(0, Math.round(avg - Math.sqrt(variance) * 0.35));
    var gradeInfo = grade(avg);
    var strongest = decisions.reduce(function (a, b) { return a.choice.score >= b.choice.score ? a : b; });
    var weakest = decisions.reduce(function (a, b) { return a.choice.score <= b.choice.score ? a : b; });
    var completed = decisions[decisions.length - 1].street;

    state.aStreak = gradeInfo[0] === 'A' ? state.aStreak + 1 : 0;
    state.bestStreak = Math.max(state.bestStreak, state.aStreak);
    state.history.unshift({
      timestamp:new Date().toISOString(), handId:current.id, title:current.title,
      game:current.game, score:avg, grade:gradeInfo[0], consistency:consistency,
      completed:completed,
      decisions:decisions.map(function (decision) {
        return {street:decision.street, label:decision.choice.label, score:decision.choice.score};
      })
    });
    state.history = state.history.slice(0, 100);
    state.handCounter += 1;
    saveState();
    renderMetrics();
    renderDashboard();

    byId('decisionArea').classList.add('hidden');
    var report = byId('finalReport');
    report.classList.remove('hidden');
    var reviews = decisions.map(function (decision, index) {
      var step = current.steps[index];
      var best = (step.choices || []).find(function (choice) { return choice.id === step.best; }) || decision.choice;
      return '<article class="street-review"><div class="street-review-head"><h3>' + (index + 1) + '. ' + esc(STREET_JA[decision.street] || decision.street) + '</h3><span class="street-score">' + decision.choice.score + '点</span></div>' +
        '<p><strong>あなた：</strong>' + esc(decision.choice.label) + '</p><p>' + esc(decision.choice.analysis || '') + '</p>' +
        '<p class="recommend"><strong>推奨：</strong>' + esc(best.label) + ' — ' + esc(best.analysis || '') + '</p></article>';
    }).join('');
    report.innerHTML = '<div class="score-hero"><div class="grade ' + gradeInfo[2] + '">' + gradeInfo[0] + '</div><div><h2>' + gradeInfo[1] + '：' + avg + '点</h2><p>ライン一貫性 ' + consistency + '点／100点</p></div></div>' +
      '<div class="summary-grid"><div class="summary-card"><span>最も良かった判断</span><strong>' + esc(STREET_JA[strongest.street] || strongest.street) + '：' + esc(strongest.choice.label) + '</strong></div>' +
      '<div class="summary-card"><span>最大の改善ポイント</span><strong>' + esc(STREET_JA[weakest.street] || weakest.street) + '：' + esc(weakest.choice.label) + '</strong></div></div>' +
      '<div class="street-review"><div class="street-review-head"><h3>全体ラインの評価</h3><span class="street-score">' + consistency + '</span></div><p>' + esc(current.overall || '') + '</p><p>' + esc(lineComment(avg, consistency, weakest)) + '</p></div>' +
      reviews + '<div class="report-actions"><button id="replayHand" class="button" type="button">同じハンドを再挑戦</button><button id="nextFullHand" class="button primary" type="button">別のハンドへ</button></div>';
    byId('replayHand').onclick = function () { startHand(current); };
    byId('nextFullHand').onclick = function () { startHand(chooseHand()); };
    emit('poker:hand-finished', {hand:current, decisions:decisions.slice()});
  }

  function renderMetrics() {
    var history = state.history;
    var avg = history.length ? Math.round(history.reduce(function (sum, hand) { return sum + (Number(hand.score) || 0); }, 0) / history.length) : null;
    byId('totalHands').textContent = history.length;
    byId('averageScore').textContent = avg == null ? '--' : avg;
    byId('bestStreak').textContent = state.bestStreak;
    byId('topLeak').textContent = history.length ? (STREET_JA[weakStreet()] || weakStreet()) : '未判定';
  }

  function renderDashboard() {
    var stats = streetStats();
    byId('streetScores').innerHTML = STREETS.map(function (street) {
      var value = stats[street];
      return '<div class="street-score-row"><div class="street-score-row-head"><span>' + STREET_JA[street] + '</span><strong>' + (value == null ? '--' : Math.round(value)) + '</strong></div><div class="progress-track"><div class="progress-fill" style="width:' + (value == null ? 0 : Math.max(3, value)) + '%"></div></div></div>';
    }).join('');

    var history = state.history;
    var items = [];
    if (!history.length) items.push(['データ待ち', 'ハンドを完了すると、ストリート別の傾向を表示します。']);
    else {
      var weak = weakStreet();
      items.push(['重点課題：' + STREET_JA[weak], STREET_JA[weak] + 'の平均判断が最も低くなっています。']);
      var recent = history.slice(0, 10);
      var consistency = Math.round(recent.reduce(function (sum, hand) { return sum + (Number(hand.consistency) || 0); }, 0) / recent.length);
      items.push(['ライン一貫性', '直近平均は' + consistency + '点です。']);
    }
    byId('insights').innerHTML = items.map(function (item) { return '<div class="insight"><strong>' + esc(item[0]) + '</strong><p>' + esc(item[1]) + '</p></div>'; }).join('');
    byId('historyBody').innerHTML = history.slice(0, 30).map(function (hand) {
      var decisionsList = hand.decisions || [];
      var weakDecision = decisionsList.slice().sort(function (a, b) { return a.score - b.score; })[0];
      return '<tr><td>' + new Date(hand.timestamp).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) + '</td><td>' + esc(hand.title) + '</td><td>' + esc(STREET_JA[hand.completed] || hand.completed) + '</td><td>' + esc(hand.grade + ' / ' + hand.score) + '</td><td>' + (weakDecision ? esc(STREET_JA[weakDecision.street] + ' ' + weakDecision.score + '点') : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="small">履歴はまだありません。</td></tr>';
  }

  function syncSettings() {
    Object.keys(state.settings).forEach(function (key) {
      var node = byId(key);
      if (!node) return;
      if (node.type === 'checkbox') node.checked = Boolean(state.settings[key]);
      else node.value = state.settings[key];
    });
  }

  function saveSettings() {
    state.settings = {
      cashEnabled:byId('cashEnabled').checked,
      tournamentEnabled:byId('tournamentEnabled').checked,
      difficulty:byId('difficulty').value,
      adaptiveMode:byId('adaptiveMode').checked
    };
    if (!state.settings.cashEnabled && !state.settings.tournamentEnabled) state.settings.cashEnabled = true;
    saveState();
    syncSettings();
    byId('saveMessage').textContent = '保存しました';
    setTimeout(function () { byId('saveMessage').textContent = ''; }, 1500);
  }

  function bind() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.onclick = function () {
        document.querySelectorAll('.tab,.tab-panel').forEach(function (node) { node.classList.remove('active'); });
        tab.classList.add('active');
        var panel = byId(tab.dataset.tab);
        if (panel) panel.classList.add('active');
        if (tab.dataset.tab === 'dashboard') renderDashboard();
      };
    });
    byId('newHandTop').onclick = function () { startHand(chooseHand()); };
    byId('saveSettings').onclick = saveSettings;
    byId('clearHistory').onclick = function () {
      if (confirm('成績履歴をすべて削除しますか？')) {
        state.history = [];
        state.aStreak = 0;
        state.bestStreak = 0;
        saveState();
        renderMetrics();
        renderDashboard();
      }
    };
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./service-worker.js?v=11', {updateViaCache:'none'}).catch(function () {});
      });
    }
  }

  function boot() {
    try {
      bind();
      syncSettings();
      renderMetrics();
      renderDashboard();
      startHand(chooseHand());
      document.documentElement.setAttribute('data-poker-boot', 'ok');
    } catch (error) {
      console.error(error);
      document.documentElement.setAttribute('data-poker-boot', 'failed');
      showFatal(error && error.message ? error.message : '不明な起動エラー');
    }
  }

  boot();
})();