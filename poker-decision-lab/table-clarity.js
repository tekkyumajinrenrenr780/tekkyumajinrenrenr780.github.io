(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const table = document.querySelector('.poker-table');
  const tablePanel = document.querySelector('.table-panel');
  if (!table || !tablePanel) return;

  const ACTIONS = [
    [/オールイン|all[ -]?in|jam|shove/i, 'ALL-IN'],
    [/チェックレイズ|check[ -]?raise/i, 'CHECK-RAISE'],
    [/3\s*ベット|3[ -]?bet/i, '3-BET'],
    [/4\s*ベット|4[ -]?bet/i, '4-BET'],
    [/リレイズ|再レイズ/i, 'RE-RAISE'],
    [/オープン/i, 'OPEN'],
    [/レイズ|raise/i, 'RAISE'],
    [/ベット|bet/i, 'BET'],
    [/コール|call/i, 'CALL'],
    [/チェック|check/i, 'CHECK'],
    [/フォールド|fold/i, 'FOLD'],
    [/リンプ|limp/i, 'LIMP']
  ];

  function parseNumber(text) {
    const match = String(text || '').match(/([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) : 0;
  }

  function parseAction(text, fallbackAmount = 0) {
    const source = String(text || '').replace(/〜/g, '–').trim();
    const action = ACTIONS.find(([pattern]) => pattern.test(source));
    const actionName = action ? action[1] : 'ACTION';
    const bbMatch = source.match(/([0-9]+(?:\.[0-9]+)?)\s*BB/i);
    const rangeMatch = source.match(/([0-9]+(?:\.[0-9]+)?)\s*[–~-]\s*([0-9]+(?:\.[0-9]+)?)\s*BB/i);
    const percentMatch = source.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);

    let amount = '';
    if (rangeMatch) amount = `${rangeMatch[1]}–${rangeMatch[2]} BB`;
    else if (bbMatch) amount = `${bbMatch[1]} BB`;
    else if (fallbackAmount > 0 && ['BET','RAISE','OPEN','3-BET','4-BET','ALL-IN','CALL'].includes(actionName)) {
      amount = `${Number.isInteger(fallbackAmount) ? fallbackAmount : fallbackAmount.toFixed(1)} BB`;
    }

    let detail = source;
    if (percentMatch) detail = `約${percentMatch[1]}% POT`;
    else detail = detail.replace(/^.*?が/, '').replace(/^.*?：/, '').trim();

    return { actionName, amount, detail };
  }

  function ensureBubble(seat) {
    if (!seat) return null;
    let bubble = seat.querySelector('.seat-action-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'seat-action-bubble';
      bubble.setAttribute('aria-live', 'polite');
      seat.appendChild(bubble);
    }
    return bubble;
  }

  function setBubble(seat, parsed, visible = true) {
    const bubble = ensureBubble(seat);
    if (!bubble) return;
    bubble.innerHTML = [
      `<span class="action-name">${parsed.actionName}</span>`,
      parsed.amount ? `<span class="action-amount">${parsed.amount}</span>` : '',
      parsed.detail && parsed.detail.toUpperCase() !== parsed.actionName ? `<span class="action-detail">${parsed.detail}</span>` : ''
    ].join('');
    bubble.classList.toggle('visible', visible);
  }

  function hideNonActiveBubbles(heroSeat, villainSeat) {
    document.querySelectorAll('.seat-action-bubble').forEach(bubble => {
      if (bubble.parentElement !== heroSeat && bubble.parentElement !== villainSeat) {
        bubble.classList.remove('visible');
      }
    });
  }

  function latestHeroAction() {
    const items = Array.from(document.querySelectorAll('#actionHistory li')).filter(li => !li.classList.contains('empty-history'));
    if (!items.length) return '';
    const item = items.at(-1);
    const copy = item.cloneNode(true);
    copy.querySelectorAll('span').forEach(node => node.remove());
    const firstLine = (copy.textContent || '').trim();
    return firstLine.replace(/^(プリフロップ|フロップ|ターン|リバー)\s*[：:]/, '').trim();
  }

  function updateTableClarity() {
    const heroSeat = document.querySelector('.seat.hero');
    const villainSeat = document.querySelector('.seat.villain');
    hideNonActiveBubbles(heroSeat, villainSeat);

    const villainText = ($('factVillain')?.textContent || $('tableAction')?.textContent || '').trim();
    const toCall = parseNumber($('toCall')?.textContent);
    const villainPosition = villainSeat?.querySelector('span')?.textContent?.trim() || '';
    const mentionsVillain = villainPosition && new RegExp(`(^|[^A-Z])${villainPosition}([^A-Z]|$)`, 'i').test(villainText);
    const hasDirectAction = /チェック|ベット|レイズ|オープン|コール|フォールド|オールイン|3\s*ベット|4\s*ベット/i.test(villainText);

    if (villainSeat) {
      if (mentionsVillain && hasDirectAction) {
        setBubble(villainSeat, parseAction(villainText, toCall), true);
      } else {
        setBubble(villainSeat, { actionName: 'WAITING', amount: '', detail: '相手のアクション待ち' }, true);
      }
    }

    const heroText = latestHeroAction();
    if (heroSeat && heroText) {
      setBubble(heroSeat, parseAction(heroText, 0), true);
    } else if (heroSeat) {
      const bubble = ensureBubble(heroSeat);
      bubble?.classList.remove('visible');
    }

    table.setAttribute('aria-label', `${villainPosition || '相手'}のアクション: ${villainText || 'なし'}`);
  }

  function addLegend() {
    if (tablePanel.querySelector('.table-clarity-legend')) return;
    const legend = document.createElement('div');
    legend.className = 'table-clarity-legend';
    legend.innerHTML = '<span><i class="hero-dot"></i>YOU</span><span><i class="villain-dot"></i>相手</span><span>吹き出し＝直前のアクション</span>';
    table.insertAdjacentElement('afterend', legend);
  }

  addLegend();
  updateTableClarity();

  let framePending = false;
  const scheduleUpdate = () => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      updateTableClarity();
    });
  };

  const contentObserver = new MutationObserver(scheduleUpdate);
  [
    $('factVillain'),
    $('tableAction'),
    $('toCall'),
    $('actionHistory'),
    $('selectionNotice'),
    $('holeCards')
  ].filter(Boolean).forEach(node => contentObserver.observe(node, {
    subtree: true,
    childList: true,
    characterData: true
  }));

  const seatObserver = new MutationObserver(scheduleUpdate);
  document.querySelectorAll('.seat').forEach(seat => seatObserver.observe(seat, {
    attributes: true,
    attributeFilter: ['class']
  }));

  window.addEventListener('pageshow', updateTableClarity);
})();
