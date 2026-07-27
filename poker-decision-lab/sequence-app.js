(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const STREET_JA = {preflop:'プリフロップ', flop:'フロップ', turn:'ターン', river:'リバー'};
  const STORAGE_KEY = 'pokerSequenceLabV1';
  const DEFAULT = {
    history: [], handCounter: 1, aStreak: 0, bestStreak: 0,
    settings: {cashEnabled:true, tournamentEnabled:true, difficulty:'intermediate', adaptiveMode:true}
  };
  const HANDS = window.POKER_HANDS || [];

  let state = load();
  let current = null;
  let stepIndex = 0;
  let decisions = [];
  let awaitingNext = false;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {...DEFAULT, ...raw, settings:{...DEFAULT.settings, ...(raw.settings || {})}};
    } catch {
      return structuredClone(DEFAULT);
    }
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, {detail})); }
  function runtimeSnapshot() {
    return current ? {hand:current, step:current.steps[stepIndex], stepIndex, decisions:[...decisions], awaitingNext} : null;
  }
  window.PokerSequenceRuntime = {snapshot: runtimeSnapshot};

  function cardHtml(card) {
    if (!card) return '<span class="card-face placeholder">?</span>';
    const suit = card.slice(-1), rank = card.slice(0, -1), red = '♥♦'.includes(suit) ? ' red' : '';
    return `<span class="card-face${red}">${rank}${suit}</span>`;
  }
  function renderCards(node, cards, count = 0) {
    const a = [...cards];
    while (a.length < count) a.push('');
    node.innerHTML = a.map(cardHtml).join('');
  }
  function grade(score) {
    return score >= 90 ? ['A','非常に良いライン',''] : score >= 75 ? ['B','概ね妥当','b'] : score >= 55 ? ['C','改善余地あり','c'] : ['D','大きな見直しが必要','d'];
  }
  function availableHands() {
    const s = state.settings;
    let list = HANDS.filter(h => h.game === 'cash' ? s.cashEnabled : s.tournamentEnabled);
    if (s.difficulty !== 'all') {
      const filtered = list.filter(h => h.difficulty === s.difficulty);
      if (filtered.length) list = filtered;
    }
    return list.length ? list : HANDS;
  }
  function chooseHand() {
    let list = availableHands().filter(h => h.id !== current?.id);
    if (!list.length) list = availableHands();
    if (state.settings.adaptiveMode && state.history.length >= 2) {
      const weak = weakStreet(), weighted = [];
      list.forEach(h => {
        const n = h.steps.some(s => s.street === weak) ? 3 : 1;
        for (let i = 0; i < n; i++) weighted.push(h);
      });
      list = weighted;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  function startHand(hand) {
    current = hand;
    stepIndex = 0;
    decisions = [];
    awaitingNext = false;
    $('finalReport').classList.add('hidden');
    $('decisionArea').classList.remove('hidden');
    $('selectionNotice').classList.add('hidden');
    $('handIntro').textContent = hand.intro;
    $('gameBadge').textContent = hand.game === 'cash' ? `Cash ${hand.stack}BB` : `Tournament ${hand.stack}BB`;
    $('difficultyBadge').textContent = hand.difficulty[0].toUpperCase() + hand.difficulty.slice(1);
    $('handNumber').textContent = `HAND #${String(state.handCounter).padStart(3, '0')}`;
    renderStep();
  }

  function renderStep() {
    const s = current.steps[stepIndex];
    awaitingNext = false;
    $('streetLabel').textContent = STREET_JA[s.street].toUpperCase();
    $('decisionTitle').textContent = `${STREET_JA[s.street]}の判断`;
    $('stepCounter').textContent = `${stepIndex + 1} / ${current.steps.length}`;
    $('situationText').textContent = s.situation;
    $('factPosition').textContent = current.hero;
    $('factPot').textContent = `${s.pot} BB`;
    $('factVillain').textContent = s.villainAction;
    $('factCall').textContent = `${s.toCall} BB`;
    $('decisionPrompt').textContent = s.prompt;
    $('potSize').textContent = `${s.pot} BB`;
    $('toCall').textContent = `${s.toCall} BB`;
    $('effectiveStack').textContent = `${s.stack} BB`;
    $('heroPosition').textContent = current.hero;
    $('tableAction').textContent = s.villainAction;
    renderCards($('holeCards'), current.hand);
    renderCards($('boardCards'), s.board, s.street === 'preflop' ? 0 : 5);

    document.querySelectorAll('.seat').forEach(n => n.classList.remove('hero', 'villain'));
    document.querySelector(`.seat-${current.hero.toLowerCase()}`)?.classList.add('hero');
    document.querySelector(`.seat-${current.villain.toLowerCase()}`)?.classList.add('villain');
    ['UTG','MP','CO','BTN','SB','BB'].forEach(p => {
      const n = $(`seat${p}`);
      if (n) n.textContent = `${Math.max(0, Math.round(s.stack))} BB`;
    });
    document.querySelectorAll('.street-progress span').forEach((n, i) => {
      n.classList.toggle('done', i < stepIndex);
      n.classList.toggle('current', i === stepIndex);
    });

    renderActionHistory();
    $('decisionButtons').innerHTML = '';
    s.choices.forEach(choice => {
      const b = document.createElement('button');
      b.className = 'action-button';
      b.type = 'button';
      b.textContent = choice.label;
      b.onclick = () => selectChoice(choice, b);
      $('decisionButtons').appendChild(b);
    });
    $('selectionNotice').classList.add('hidden');
    $('selectionNotice').innerHTML = '';

    const detail = {hand:current, step:s, stepIndex, decisions:[...decisions]};
    window.POKER_SEQUENCE_SNAPSHOT = detail;
    emit('poker:step', detail);
  }

  function renderActionHistory() {
    const list = $('actionHistory');
    if (!decisions.length) {
      list.innerHTML = '<li class="empty-history">まだあなたのアクションはありません。</li>';
      return;
    }
    list.innerHTML = decisions.map((d, i) => `<li><strong>${STREET_JA[d.street]}</strong>：${esc(d.choice.label)}<br><span class="small">${esc(current.steps[i].after)}</span></li>`).join('');
  }

  function selectChoice(choice, button) {
    if (awaitingNext) return;
    awaitingNext = true;
    document.querySelectorAll('.action-button').forEach(b => b.disabled = true);
    button.classList.add('selected');
    const step = current.steps[stepIndex];
    decisions.push({street:step.street, choice});
    renderActionHistory();
    const isLast = stepIndex === current.steps.length - 1 || choice.ends;

    const actionDetail = {
      hand:current,
      step,
      stepIndex,
      hero:current.hero,
      villain:current.villain,
      choice,
      after:step.after,
      isLast,
      decisions:[...decisions]
    };
    window.POKER_SEQUENCE_SNAPSHOT = {...actionDetail, phase:'hero-action'};
    emit('poker:hero-action', actionDetail);

    const notice = $('selectionNotice');
    notice.classList.remove('hidden');
    notice.innerHTML = `<p><strong>${esc(choice.label)}</strong>を記録しました。${esc(step.after)}</p><button id="continueButton" class="button primary" type="button">${isLast ? 'ハンド全体を評価' : '次のストリートへ'}</button>`;
    $('continueButton').onclick = () => {
      if (isLast) finishHand();
      else {
        stepIndex++;
        renderStep();
        const panel = document.querySelector('.decision-panel');
        window.scrollTo({top:Math.max(0, panel?.offsetTop || 0), behavior:'smooth'});
      }
    };
  }

  function finishHand() {
    const scores = decisions.map(d => d.choice.score);
    const avg = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
    const variance = scores.reduce((a,b) => a + Math.pow(b-avg, 2), 0) / scores.length;
    const consistency = Math.max(0, Math.round(avg - Math.sqrt(variance) * .35));
    const [g,title,cls] = grade(avg);
    const strongest = decisions.reduce((a,b) => a.choice.score >= b.choice.score ? a : b);
    const weakest = decisions.reduce((a,b) => a.choice.score <= b.choice.score ? a : b);
    const completed = decisions[decisions.length - 1].street;
    state.aStreak = g === 'A' ? state.aStreak + 1 : 0;
    state.bestStreak = Math.max(state.bestStreak, state.aStreak);
    state.history.unshift({timestamp:new Date().toISOString(), handId:current.id, title:current.title, game:current.game, score:avg, grade:g, consistency, completed, decisions:decisions.map(d => ({street:d.street, label:d.choice.label, score:d.choice.score}))});
    state.history = state.history.slice(0, 100);
    state.handCounter++;
    save();
    renderMetrics();
    renderDashboard();
    $('decisionArea').classList.add('hidden');
    const report = $('finalReport');
    report.classList.remove('hidden');
    report.innerHTML = `<div class="score-hero"><div class="grade ${cls}">${g}</div><div><h2>${title}：${avg}点</h2><p>ライン一貫性 ${consistency}点／100点</p></div></div><div class="summary-grid"><div class="summary-card"><span>最も良かった判断</span><strong>${STREET_JA[strongest.street]}：${esc(strongest.choice.label)}</strong></div><div class="summary-card"><span>最大の改善ポイント</span><strong>${STREET_JA[weakest.street]}：${esc(weakest.choice.label)}</strong></div></div><div class="street-review"><div class="street-review-head"><h3>全体ラインの評価</h3><span class="street-score">${consistency}</span></div><p>${esc(current.overall)}</p><p>${lineComment(avg,consistency,weakest)}</p></div>${decisions.map((d,i) => {const step=current.steps[i], best=step.choices.find(x => x.id === step.best); return `<article class="street-review"><div class="street-review-head"><h3>${i+1}. ${STREET_JA[d.street]}</h3><span class="street-score">${d.choice.score}点</span></div><p><strong>あなた：</strong>${esc(d.choice.label)}</p><p>${esc(d.choice.analysis)}</p><p class="recommend"><strong>推奨：</strong>${esc(best.label)} — ${esc(best.analysis)}</p></article>`;}).join('')}<div class="report-actions"><button id="replayHand" class="button" type="button">同じハンドを再挑戦</button><button id="nextFullHand" class="button primary" type="button">別のハンドへ</button></div>`;
    $('replayHand').onclick = () => startHand(current);
    $('nextFullHand').onclick = () => startHand(chooseHand());
    emit('poker:hand-finished', {hand:current, decisions:[...decisions]});
    window.scrollTo({top:Math.max(0, report.offsetTop - 100), behavior:'smooth'});
  }

  function lineComment(avg, consistency, weakest) {
    if (avg >= 90 && consistency >= 85) return '各ストリートでベットの目的がつながっており、結果ではなくレンジとポット設計で判断できています。';
    if (consistency < 60) return `判断の強弱がストリート間でぶれています。特に${STREET_JA[weakest.street]}で、前のアクションから何を継続させるかを明確にしてください。`;
    return `${STREET_JA[weakest.street]}が全体スコアを下げています。前ストリートで作ったレンジとSPRから、次の判断を先に計画すると改善します。`;
  }
  function streetStats() {
    const map = {};
    state.history.forEach(h => (h.decisions || []).forEach(d => {map[d.street] ??= {sum:0,n:0}; map[d.street].sum += d.score; map[d.street].n++;}));
    return Object.fromEntries(Object.entries(map).map(([k,v]) => [k,v.sum/v.n]));
  }
  function weakStreet() { return Object.entries(streetStats()).sort((a,b) => a[1]-b[1])[0]?.[0] || 'river'; }
  function renderMetrics() {
    const h = state.history, avg = h.length ? Math.round(h.reduce((a,b) => a+b.score,0)/h.length) : null;
    $('totalHands').textContent = h.length;
    $('averageScore').textContent = avg ?? '--';
    $('bestStreak').textContent = state.bestStreak;
    $('topLeak').textContent = h.length ? STREET_JA[weakStreet()] : '未判定';
  }
  function renderDashboard() {
    const stats = streetStats();
    $('streetScores').innerHTML = STREETS.map(s => {const v=stats[s]; return `<div class="street-score-row"><div class="street-score-row-head"><span>${STREET_JA[s]}</span><strong>${v == null ? '--' : Math.round(v)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${v == null ? 0 : Math.max(3,v)}%"></div></div></div>`;}).join('');
    const h = state.history, weak = weakStreet(), items = [];
    if (!h.length) items.push(['データ待ち','ハンドを完了すると、ストリート別の傾向を表示します。']);
    else {
      items.push([`重点課題：${STREET_JA[weak]}`,`${STREET_JA[weak]}の平均判断が最も低くなっています。前ストリートからの計画を言語化してください。`]);
      const low = h.flatMap(x => x.decisions || []).filter(d => d.score < 60);
      if (low.length) items.push(['低スコア判断',`${low.length}件あります。結果ではなく、ポット・レンジ・残りスタックで再評価してください。`]);
      items.push(['ライン一貫性',`直近平均は${Math.round(h.slice(0,10).reduce((a,b) => a+b.consistency,0)/Math.min(10,h.length))}点です。`]);
    }
    $('insights').innerHTML = items.map(x => `<div class="insight"><strong>${x[0]}</strong><p>${x[1]}</p></div>`).join('');
    $('historyBody').innerHTML = h.slice(0,30).map(x => {const weakD=[...(x.decisions||[])].sort((a,b)=>a.score-b.score)[0]; return `<tr><td>${new Date(x.timestamp).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>${esc(x.title)}</td><td>${STREET_JA[x.completed]||x.completed}</td><td>${x.grade} / ${x.score}</td><td>${weakD ? `${STREET_JA[weakD.street]} ${weakD.score}点` : '—'}</td></tr>`;}).join('') || '<tr><td colspan="5" class="small">履歴はまだありません。</td></tr>';
  }
  function syncSettings() { Object.entries(state.settings).forEach(([k,v]) => {const n=$(k); if(n) n.type==='checkbox' ? n.checked=v : n.value=v;}); }
  function saveSettings() {
    state.settings = {cashEnabled:$('cashEnabled').checked, tournamentEnabled:$('tournamentEnabled').checked, difficulty:$('difficulty').value, adaptiveMode:$('adaptiveMode').checked};
    if (!state.settings.cashEnabled && !state.settings.tournamentEnabled) state.settings.cashEnabled = true;
    save(); syncSettings(); $('saveMessage').textContent = '保存しました'; setTimeout(() => $('saveMessage').textContent = '', 1500);
  }
  function bind() {
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      document.querySelectorAll('.tab,.tab-panel').forEach(n => n.classList.remove('active'));
      t.classList.add('active'); $(t.dataset.tab).classList.add('active');
      if (t.dataset.tab === 'dashboard') renderDashboard();
    });
    $('newHandTop').onclick = () => startHand(chooseHand());
    $('saveSettings').onclick = saveSettings;
    $('clearHistory').onclick = () => {if(confirm('成績履歴をすべて削除しますか？')){state.history=[];state.aStreak=0;state.bestStreak=0;save();renderMetrics();renderDashboard();}};
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js?v=10', {updateViaCache:'none'}).catch(console.warn));
  }
  function boot() { bind(); syncSettings(); renderMetrics(); renderDashboard(); startHand(chooseHand()); }
  boot();
})();
