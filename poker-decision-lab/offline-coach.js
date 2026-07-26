/* Poker Decision Lab offline coach. No OpenAI/API request is made. */
(() => {
  "use strict";
  const VERSION = "2026.07.26-offline-v6";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  // Safety lock: even an old cached click handler cannot call the paid endpoint.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (/\/api\/analyze(?:$|[?#/])/i.test(url)) {
      return Promise.reject(new Error("API分析は無効です。保存済み分析を使用します。"));
    }
    return nativeFetch(input, options);
  };

  const RULES = [
    [120, d => d.street === "river" && /パッシブ|ブラフ.*少|タイト|正直/i.test(d.villain), "パッシブな相手のリバー", "大きなリバーベットはバリューに偏りやすいため、理論よりフォールドを増やします。自然なミスドローが十分に残るか確認します。", "少数の印象だけで断定せず、十分なサンプルがある場合に限定します。"],
    [115, d => d.game === "tournament" && /バブル|入賞|残り.*人|サテライト|賞金/i.test(d.action + " " + d.thought), "ICM・バブル", "チップEVでは参加できても賞金期待値ではフォールドへ移る場合があります。自分より短いスタックの人数と、相手にカバーされているかを確認します。", "中位スタックが大スタックと衝突するコストは特に大きくなります。"],
    [108, d => /コール.*多|降りない|station|ルーズコール/i.test(d.villain), "コール過多の相手", "ブラフを減らし、薄いバリューと大きめのバリューサイズを増やします。", "理論上のブラフ候補でも、フォールドしない相手には実行しません。"],
    [102, d => d.call > 0, "ポットオッズ", d => `コールに必要な最低勝率は概算で${Math.round(d.call / Math.max(.01, d.pot + 2*d.call) * 100)}%です。相手のバリューとブラフのコンボ数を比較します。`, "将来ストリートの追加支払いがある場合、単純なポットオッズだけでは不十分です。"],
    [100, d => d.street === "preflop" && d.stack <= 10, "10BB以下：プッシュ・フォールド", "通常サイズのレイズやコールより、オールインとフォールドを最初に比較します。位置、アンティ、後ろの人数でレンジを調整します。", "ミンレイズしてからフォールドするラインはスタックを大きく失いやすくなります。"],
    [96, d => d.street === "preflop" && d.stack > 10 && d.stack <= 15, "11〜15BB：リスチール", "オープンに対しては小さい3ベットより、オールインでフォールドエクイティを最大化する候補が増えます。", "コールドコール後はSPRが低く、ポストフロップ判断が曖昧になりやすい深さです。"],
    [95, d => /オーバーベット|over.?bet|125%|150%|ポット超/i.test(d.action), "オーバーベットへの対応", "レンジ上位と適切なブロッカーを持つブラフキャッチだけを残します。相手の自然なブラフ候補が存在するか確認します。", "ワンペアの絶対強度ではなく、相手のベットレンジに対する相対強度で判断します。"],
    [93, d => /オールイン|all.?in|jam|shove/i.test(d.action), "オールイン判断", "フォールドエクイティ、コールされた際のエクイティ、デッドマネーを分けて評価します。", "勝敗ではなく、投入時点の期待値で判断を検証します。"],
    [90, d => /チェックレイズ|check.?raise/i.test(d.action), "チェックレイズへの対応", "相手のバリュー、セミブラフ、純ブラフを分け、ポジションと残りスタックを含めてコール・再レイズ・フォールドを比較します。", "強いドローでも即オールインが最善とは限りません。"],
    [88, d => d.street === "river" && d.call > 0, "リバーのブラフキャッチ", "バリューコンボと自然なミスドローを数え、必要勝率を満たすだけのブラフがなければ強いワンペアでもフォールドします。", "ここまでコールしたというサンクコストは判断材料にしません。"],
    [86, d => d.street === "preflop" && /3.?bet|3ベット|リレイズ/i.test(d.action), "3ベットポット", "相手の位置とサイズからレンジを推定し、コール・4ベット・フォールドを比較します。AやKのブロッカーは4ベット候補を作ります。", "強そうだからコール、ではなく相手レンジに対するエクイティとポジションを確認します。"],
    [84, d => /マルチウェイ|3way|3ウェイ|複数人/i.test(d.action), "マルチウェイポット", "必要なハンド強度が上がりブラフ成功率が下がるため、ワンペアの薄いバリューと純ブラフを減らします。", "ヘッズアップ用のCB頻度をそのまま使わないでください。"],
    [82, d => d.texture.monotone, "モノトーンボード", "完成フラッシュの分布と高いスートカードのブロッカーを重視し、大きなサイズはナッツ級と適切なブラフ候補へ絞ります。", "弱いフラッシュやセットを過大評価しないでください。"],
    [81, d => d.texture.paired, "ペアボード", "トリップスを持つ側のレンジとフルハウスへ改善する組み合わせを確認します。レンジ優位側は小さいベットを高頻度で使える場合があります。", "ボードがペアになっただけで自動的にブラフを増やしません。"],
    [80, d => d.street === "preflop" && d.stack > 15 && d.stack <= 30, "16〜30BB：小さいオープン", "2〜2.2BB程度のオープンを基本にし、3ベットを受けた後の継続計画を先に決めます。", "大きなオープンはレンジ全体の運用を難しくします。"],
    [79, d => d.texture.connected, "連結したボード", "ストレートと強いドローが多いためチェックを増やし、ベットするレンジは大きめのサイズを使う候補が増えます。", "オーバーペアやトップペアの相対価値はドライボードより低下します。"],
    [76, d => d.position === "SB", "SB：コールを絞る", "SBはポストフロップで常に不利です。曖昧なコールを減らし、3ベットまたはフォールド中心にします。", "価格が安くても実現エクイティが低いハンドがあります。"],
    [75, d => d.street === "flop" && /CB|c.?bet|コンティニュエーション|フロップ.*ベット/i.test(d.action), "フロップCB", "レンジ優位、ナッツ優位、ボードの変化しやすさから頻度とサイズを決めます。ドライなA・Kハイは小さく広く、連結したボードはチェックを増やします。", "強いハンドだけ大きく打つとサイズからレンジが読まれます。"],
    [74, d => d.street === "turn" && /バレル|barrel|連続ベット|フロップ.*ベット.*ターン/i.test(d.action), "ターンの継続ベット", "ターンカードがどちらのレンジを改善したか確認します。ブラフは追加エクイティか強いブロッカーを持つコンボから選びます。", "フロップで打った事実だけを理由に自動的にターンも打ちません。"],
    [72, d => ["BTN","CO"].includes(d.position), "後半ポジションの優位", "相手のアクションを見てから判断できるため参加レンジが広がります。小さいオープンサイズでレンジ全体を効率的に運用します。", "ポジションが良いことは無条件に大きなポットを作る理由ではありません。"],
    [71, d => d.position === "BB", "BB：価格と相手レンジ", "すでに1BBを投資しているため必要勝率は低い一方、UTGなど強いレンジには支配されるハンドをフォールドします。", "ポットオッズが良いことと利益を実現できることは同じではありません。"],
    [70, d => d.texture.twoTone, "ツートーンボード", "フラッシュドローの組み合わせを数え、バリューとセミブラフの比率、スート完成時の継続計画を確認します。", "ドロー保護だけを理由に過度に大きくベットしません。"],
    [66, d => d.street === "preflop" && d.stack >= 100, "100BB以上：逆インプライドオッズ", "スーテッドコネクターやポケットペアの価値が上がる一方、弱いオフスートブロードウェイは大きなポットで支配されやすくなります。", "トップペアだけで大きなスタックを入れる計画を避けます。"],
    [60, d => d.street !== "preflop" && d.call === 0, "チェック可能な場面", "ベットの目的をバリュー、ブラフ、エクイティ否定のどれかで明確にし、コールされる弱いハンドまたは降ろす強いハンドを特定します。", "強そうだからベット、ではサイズとレンジの整合性を失います。"],
    [55, d => /負け|勝った|引かれ|結果|セットだった|フラッシュだった/i.test(d.thought), "結果バイアスの除去", "相手の実際のハンドを知る前の情報だけで期待値を評価します。", "一回のショーダウンから相手傾向を断定しません。"]
  ];

  function cards(text) {
    return String(text || "").replace(/10/gi,"T").replace(/♠/g,"s").replace(/♥/g,"h").replace(/♦/g,"d").replace(/♣/g,"c").match(/[2-9TJQKA][shdc]/gi) || [];
  }
  function texture(text) {
    const list = cards(text), suits = {}, ranks = {}, values = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"T":10,"J":11,"Q":12,"K":13,"A":14};
    list.forEach(c => { suits[c[1].toLowerCase()] = (suits[c[1].toLowerCase()]||0)+1; ranks[c[0].toUpperCase()] = (ranks[c[0].toUpperCase()]||0)+1; });
    const sv = Object.values(suits), rv = Object.values(ranks), sorted = [...new Set(list.map(c=>values[c[0].toUpperCase()]))].sort((a,b)=>a-b);
    let connected = false;
    for (let i=0;i<sorted.length-2;i++) if (sorted[i+2]-sorted[i] <= 4) connected = true;
    return {monotone:list.length>=3&&Math.max(0,...sv)===list.length,twoTone:list.length>=3&&Math.max(0,...sv)===list.length-1,paired:rv.some(v=>v>=2),connected};
  }
  function data() {
    return {game:$("reviewGame")?.value||"cash",street:$("reviewStreet")?.value||"preflop",position:$("reviewPosition")?.value||"BTN",stack:+($("reviewStack")?.value||0),hand:$("reviewHand")?.value.trim()||"",board:$("reviewBoard")?.value.trim()||"",pot:+($("reviewPot")?.value||0),call:+($("reviewCall")?.value||0),action:$("reviewAction")?.value.trim()||"",thought:$("reviewThought")?.value.trim()||"",villain:$("reviewVillain")?.value.trim()||""};
  }
  function analysis(d) {
    d.texture = texture(d.board);
    const style = $("coachStyle")?.value || "balanced", limit = style === "concise" ? 3 : style === "deep" ? 8 : 5;
    return RULES.filter(r => { try { return r[1](d); } catch { return false; } }).sort((a,b)=>b[0]-a[0]).slice(0,limit);
  }
  function renderManual() {
    const d = data(), found = analysis(d), out = $("reviewOutput");
    $("reviewEmpty")?.classList.add("hidden"); out?.classList.remove("hidden");
    const cardsText = cards(d.board), boardInfo = cardsText.length ? `入力カード ${cardsText.join(" ")}` : "ボードなし";
    const body = found.length ? found.map(r => { const rec = typeof r[3] === "function" ? r[3](d) : r[3]; return `<div class="review-card"><h3>${esc(r[2])}</h3><p><strong>推奨：</strong>${esc(rec)}</p><p><strong>注意：</strong>${esc(r[4])}</p></div>`; }).join("") : '<div class="review-card"><h3>一般原則</h3><p>相手レンジ、必要勝率、ポジション、スタック深度を分けて検証してください。</p></div>';
    if (out) out.innerHTML = `<div class="review-card"><h3>状況整理</h3><p>${d.game==="cash"?"キャッシュ":"トーナメント"} / ${esc(d.street)} / ${esc(d.position)} / ${d.stack}BB</p><p>ハンド: ${esc(d.hand||"未入力")}　${esc(boardInfo)}</p></div>${body}<div class="review-card"><h3>確認する3問</h3><ul><li>相手のバリューとブラフはそれぞれ何コンボありますか？</li><li>選択したサイズで弱いハンドからコールを得る、または強いハンドを降ろせますか？</li><li>基準戦略と相手傾向による調整を分けて説明できますか？</li></ul></div><div class="review-card"><h3>分析方式</h3><p>事前作成した保存済みルールの照合です。API通信と従量課金はありません。厳密なGTOソルバーではありません。</p><p class="small">${VERSION}</p></div>`;
    $("apiStatus").textContent = "完全オフライン";
  }
  function renderScenario() {
    const target = $("aiCurrentResponse"), lines = [
      `状況：${$("scenarioType")?.textContent||""} / ${$("scenarioTitle")?.textContent||""}`,
      `判断対象：${$("scenarioPrompt")?.textContent||""}`,
      `基準戦略：${$("gtoNote")?.textContent||"保存済みの基準解説を参照してください。"}`,
      `実戦調整：${$("exploitNote")?.textContent||"相手傾向に応じて頻度を調整します。"}`,
      `重要点：${$("keyPoint")?.textContent||"単独ハンドではなくレンジ全体で評価します。"}`
    ];
    target?.classList.remove("hidden");
    if (target) target.innerHTML = `<strong>保存済み詳細解説</strong><ul>${lines.map(x=>`<li>${esc(x)}</li>`).join("")}</ul><span class="small">${VERSION}</span>`;
    $("apiStatus").textContent = "完全オフライン";
  }
  function replaceButton(id, text, handler) {
    const old = $(id); if (!old) return;
    const fresh = old.cloneNode(true); fresh.textContent = text; old.replaceWith(fresh); fresh.addEventListener("click", handler);
  }
  function initialize() {
    if ($("apiStatus")) $("apiStatus").textContent = "完全オフライン";
    replaceButton("askAiCurrent", "保存済み解説を詳しく表示", renderScenario);
    replaceButton("runAiReview", "保存済みパターンで詳細分析", renderManual);
    replaceButton("runLocalReview", "保存済みパターンで分析", renderManual);
    const heading = [...document.querySelectorAll(".settings-card h3")].find(n => /LLMコーチ/.test(n.textContent));
    if (heading) {
      heading.textContent = "保存済み分析コーチ";
      const p = heading.parentElement.querySelector("p.small");
      if (p) p.textContent = "APIキーや従量課金は使用しません。出題別解説と一般的な判断ルールを端末内で照合します。";
    }
    const reviewIntro = document.querySelector("#review .section-heading p");
    if (reviewIntro) reviewIntro.textContent = "入力内容を保存済みのポーカー判断パターンと照合し、端末内だけで分析します。";
  }
  initialize();
})();
