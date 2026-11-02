/* ============================================================
   main.js — 起動と画面切り替え
   ============================================================ */

let view = 'today';
let lastKnownDay = null;

/* ───────── 画面 ───────── */

function show(v){
  view = v;
  for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.view === v);
  for (const s of $$('.view')) s.hidden = (s.id !== 'view-' + v);
  if (v !== 'rank') stopBlade();
  if (v === 'today'){ renderToday(); }
  if (v === 'cal')  { renderCal(); }
  if (v === 'rank') { renderRank(); }
  if (v === 'ai')   { renderAI(); }
  if (v === 'gacha'){ renderGacha(); }
  refreshTop();
  renderTimerBar();
  tick();
}

function refreshTop(){
  const live = liveCycle();
  $('#rkLetter').textContent = live.rank.l;
  $('#rkLetter').style.color = live.rank.c;
  $('#rkName').textContent = live.rank.n + '（' + fmt(live.avg) + '点）';
  $('#rkCycle').textContent = `第${live.i+1}期・残り${live.left}日`
    + (equippedName() ? '・' + equippedName() : '');
  $('#coinNum').textContent = fmt(S.gacha.coin);
}

/* ───────── シート ───────── */

function sheet(title, build){
  $('#sheetTitle').textContent = title;
  const m = $('#sheetMain');
  m.textContent = '';
  build(m);
  $('#sheet').hidden = false;
}
function closeSheet(){ $('#sheet').hidden = true; }

/* ───────── 設定 ───────── */

function openSettings(){
  sheet('設定', m => {
    const fld = (label, note) => {
      const f = el('div','fld');
      f.append(el('span','', label));
      if (note) f.append(el('em','', note));
      m.append(f);
      return f;
    };
    const sect = t => m.append(el('div','sect-h', t));

    /* ── 自分 ── */
    sect('自分');
    {
      const f = fld('名前', '符に載る名前。相手に見える。');
      const i = el('input'); i.type = 'text'; i.value = S.profile.name; i.placeholder = '名無し';
      i.onchange = () => { S.profile.name = i.value.trim(); save(); refreshTop(); renderRank(); };
      f.append(i);
    }
    {
      const f = fld('厳しさ', '未達と浪費の引き方、白紙の重さが変わる。');
      const w = el('div','seg');
      HARD.forEach((h, i) => {
        const b = el('button','' + (i === S.profile.hard ? 'on' : ''));
        b.type = 'button'; b.textContent = h.name;
        b.onclick = () => {
          S.profile.hard = i; dropScoreCache(); save();
          openSettings(); refreshTop();
          toast('厳しさを「' + h.name + '」にした');
        };
        w.append(b);
      });
      f.append(w);
      f.append(el('em','', `白紙の日は ${missPenalty()} 点として期の平均に入る。`));
    }
    {
      const f = fld('一日の区切り', 'この時刻までは前日として記録する。');
      const r = el('div','fld-row');
      const i = el('input'); i.type = 'number'; i.min = 0; i.max = 12; i.value = S.profile.dayStart;
      i.onchange = () => { S.profile.dayStart = clamp(Number(i.value)||0, 0, 12); save(); renderToday(); refreshTop(); };
      r.append(i); r.append(el('i','','時'));
      f.append(r);
    }
    {
      const f = fld('期の開始日', '3日の区切りの基準。変えると過去の期が組み替わる。');
      const i = el('input'); i.type = 'text'; i.value = S.profile.startedAt;
      i.placeholder = '2026-11-03';
      i.onchange = () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(i.value.trim())){ toast('形は 2026-11-03','bad'); i.value = S.profile.startedAt; return; }
        S.profile.startedAt = i.value.trim();
        S.cycles = [];
        settle(); save(); refreshTop(); renderCal();
        toast('期を組み替えた');
      };
      f.append(i);
    }

    /* ── 目標 ── */
    sect('一日の目標');
    {
      const f = fld('', '0 にすると、その分類は未達で引かれなくなる。');
      const g = el('div','goal-grid');
      for (const c of CATS){
        if (c.rate < 0) continue;
        const row = el('div','gr');
        const n = el('div','gr-n');
        const dot = el('i'); dot.style.background = c.color;
        n.append(dot, document.createTextNode(c.name));
        n.append(el('span','', ''));
        row.append(n);
        const i = el('input'); i.type = 'number'; i.min = 0; i.max = 1440; i.step = 5;
        i.value = S.profile.goals[c.id];
        i.onchange = () => {
          S.profile.goals[c.id] = clamp(Math.round(Number(i.value)||0), 0, 1440);
          dropScoreCache(); save(); refreshTop();
        };
        row.append(i);
        row.append(el('span','gr-u','分'));
        g.append(row);
      }
      f.append(g);
      f.append(el('em','', CATS.map(c => c.name + 'は' + c.hint).join('／')));
    }
    {
      const f = fld('睡眠の目標');
      const r = el('div','fld-row');
      const i = el('input'); i.type = 'number'; i.min = 0; i.max = 900; i.step = 10; i.value = S.profile.sleepGoal;
      i.onchange = () => { S.profile.sleepGoal = clamp(Number(i.value)||0,0,900); dropScoreCache(); save(); };
      r.append(i); r.append(el('i','','分'));
      f.append(r);
    }
    {
      const f = fld('起床の目標', 'これより早く起きた分は加点、遅い分は減点。');
      const i = el('input'); i.type = 'time'; i.step = 300; i.value = S.profile.wakeGoal || '';
      i.onchange = () => { S.profile.wakeGoal = i.value; dropScoreCache(); save(); };
      f.append(i);
    }
    {
      const f = fld('画面時間の上限', '超えた分は 1 分あたり 1 点以上引く。');
      const r = el('div','fld-row');
      const i = el('input'); i.type = 'number'; i.min = 0; i.max = 1440; i.step = 10; i.value = S.profile.stLimit;
      i.onchange = () => { S.profile.stLimit = clamp(Number(i.value)||0,0,1440); dropScoreCache(); save(); };
      r.append(i); r.append(el('i','','分'));
      f.append(r);
    }

    /* ── AI ── */
    sect('鬼教官');
    {
      const f = fld('Anthropic の API キー',
        '空でも相談は動く（内蔵の判定が答える）。入れると本物の Claude が相手になる。キーはこの端末の localStorage にだけ残り、Anthropic 以外には送らない。');
      const i = el('input'); i.type = 'text'; i.value = S.ai.key;
      i.placeholder = 'sk-ant-...';
      i.autocomplete = 'off'; i.spellcheck = false;
      i.onchange = () => { S.ai.key = i.value.trim(); save(); renderChatMode(); toast(hasKey() ? '本物に繋ぐ' : '内蔵に戻した'); };
      f.append(i);
    }
    {
      const f = fld('使うモデル', '上は賢く高い。下は速く安い。');
      const w = el('div','seg');
      const MODELS = [
        ['claude-opus-5-5','Opus 5.5'],
        ['claude-sonnet-5-5','Sonnet 5.5'],
        ['claude-haiku-5-5','Haiku 5.5'],
      ];
      for (const [id, n] of MODELS){
        const b = el('button','' + (S.ai.model === id ? 'on' : ''));
        b.type = 'button'; b.textContent = n;
        b.onclick = () => { S.ai.model = id; save(); openSettings(); renderChatMode(); };
        w.append(b);
      }
      f.append(w);
    }
    {
      const f = fld('相談の記録');
      const b = el('button','btn-ghost');
      b.type = 'button'; b.textContent = `会話を消す（${S.ai.chat.length} 件）`;
      b.onclick = () => { S.ai.chat = []; save(); renderChat(); toast('消した'); openSettings(); };
      f.append(b);
    }

    /* ── データ ── */
    sect('記録そのもの');
    {
      const f = fld('書き出し', 'この端末から出すには自分で保存する。自動では何処にも送らない。');
      const r = el('div','fld-row');
      const b1 = el('button','btn-sub'); b1.type = 'button'; b1.textContent = 'ファイルに保存';
      b1.onclick = exportData;
      const b2 = el('button','btn-sub'); b2.type = 'button'; b2.textContent = '読み込む';
      b2.onclick = importData;
      r.append(b1, b2);
      f.append(r);
      const ds = loggedDays();
      f.append(el('em','', `記録 ${ds.length} 日・期 ${S.cycles.length} 件・札 ${ownedCount()} 種`));
    }
    {
      const f = fld('全消し', '戻せない。');
      const b = el('button','btn-sub danger');
      b.type = 'button'; b.textContent = '全部消す';
      b.onclick = () => {
        sheet('本当に消すか', mm => {
          const ds = loggedDays();
          mm.append(el('p','fu-body',
            `${ds.length} 日ぶんの記録、${S.cycles.length} 件の期、${ownedCount()} 種の札、石 ${S.gacha.coin} 個。全部消える。戻せない。\n先に書き出しておけ。`));
          const r = el('div','fld-row');
          const no = el('button','btn-sub'); no.type='button'; no.textContent = 'やめる';
          no.onclick = openSettings;
          const yes = el('button','btn-sub danger'); yes.type='button'; yes.textContent = '消す';
          yes.onclick = () => {
            localStorage.removeItem(KEY);
            S = defaults();
            dropScoreCache(); dropMastCache();
            saveNow(); closeSheet();
            cur = today(); calSel = null; monCur = monOf(today());
            show('today');
            toast('消した。ここから始めろ');
          };
          r.append(no, yes);
          mm.append(r);
        });
      };
      f.append(b);
    }
    {
      const f = fld('この仕組み');
      const b = el('button','btn-ghost'); b.type='button'; b.textContent = '採点の中身を見る';
      b.onclick = openHelp;
      f.append(b);
    }
  });
}

/* ───────── 入出力 ───────── */

function exportData(){
  saveNow();
  const blob = new Blob([JSON.stringify(S, null, 1)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'migaki-' + today() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('書き出した','good');
}

function importData(){
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.json,application/json';
  i.onchange = () => {
    const f = i.files && i.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try{
        const o = JSON.parse(String(rd.result));
        if (!o || typeof o !== 'object' || !o.days) throw new Error('形が違う');
        S = deepFill(o, defaults());
        loadBroke = false;          // 読める記録が入ったので保存を再開する
        dropScoreCache(); dropMastCache();
        settle(); saveNow(); closeSheet();
        cur = today(); monCur = monOf(today()); calSel = null;
        show('today');
        toast(`${loggedDays().length} 日ぶん読み込んだ`,'good');
      }catch(e){
        toast('読めなかった：' + e.message, 'bad');
      }
    };
    rd.readAsText(f);
  };
  i.click();
}

/* ───────── 説明 ───────── */

function openHelp(){
  sheet('採点の中身', m => {
    const H = hardness();
    const p = t => { const d = el('div','fu-body'); d.textContent = t; m.append(d); };
    const s = t => m.append(el('div','sect-h', t));

    s('実測と申告');
    p(
`点になるのは、タイマーを回している間に実際に流れた時間だ。
画面を離れると自動で止まり、離席の回数も記録に残る。

押し忘れた分は手で書けるが、それは「申告」として ${MANUAL_RATE*100}% しか通らない。段位にも積まれない。
後から思い出して打った数字は、やった事の証拠にならないからだ。
浪費だけは申告でも割り引かない。引かれる側を自己申告で軽くできたら意味がない。

書けるのは今日と昨日まで。それより古い日は閉じる。後から書ける記録は、記録ではなく作文だ。`);

    s('段位（極み）');
    p(
`分類ごとに、実測した累計時間で段位が上がる。上がるほど同じ1分が重くなる。
${DAN.map(d => `${d.n}　${d.h} 時間以上　×${d.m.toFixed(2)}`).join('\n')}

さらに連続記録で全体に倍率が付く（60 日で ×1.24）。
極み値 ＝ 全分類の段位の合計（上限 ${kiwamiMax()}）。符に載って相手と並ぶ。`);

    s('一日の点');
    p(
`積み上げ ＝ 通った分 × 重み。重みは 鍛錬 ${CAT.train.rate}／学習 ${CAT.study.rate}／仕事 ${CAT.work.rate}／読書 ${CAT.read.rate}／身嗜み ${CAT.groom.rate}／対人 ${CAT.social.rate}。
目標の 1.5 倍を超えた分も 0.6 倍は通る。極める人間を頭打ちにしない。
極み ＝ 積み上げに段位と連続の倍率を掛けて増えた分。

未達 ＝ (目標 − 通った分) × 重み × ${H.short}。厳しさ「${H.name}」の係数だ。
浪費 ＝ 分 × ${CAT.waste.rate} × ${H.waste}。だらだらは積むより速く削る。
画面 ＝ 上限超過分 × 1.1 × ${H.st}。上限内でも無目的なアプリは少し引く。上限の半分で収めれば +12。
　　　 ただし同じ日に「だらだら」で書いた分は差し引く。X を眺めた時間を両方に書いても、罰は一度だけだ。
睡眠 ＝ 不足 1 分で −0.09、寝すぎも引く。目標起床より早ければ最大 +16。
節制 ＝ ${CHECKS.filter(c=>!c.bad).map(c=>c.name+' +'+c.pt).join('／')}／${CHECKS.filter(c=>c.bad).map(c=>c.name+' '+c.pt).join('／')}。
やる事 ＝ (重みつき完了率 − 0.8) × 55。8 割で±0。3 日以上居座った物は 1 件 −7。
修行札 ＝ 札ごとの加点。`);

    s('三日裁定');
    p(
`開始日から 3 日ずつを一期として締める。期の平均で格が決まる。
記録しなかった日は 0 ではなく ${missPenalty()} 点として平均に入る。やらなかった日より、書かなかった日の方が低い。見えない日は直せないからだ。
締めた期の格に応じて鍛錬石が入る。白紙 1 日ごとに石は 10 減る。`);

    s('階級');
    p(RANKS.slice().reverse().map(r => `${r.l}　${r.n}　${r.at === -999 ? '0 未満' : r.at + ' 以上'}`).join('\n'));

    s('石と札');
    p(
`前日までの点の 1/10 が石になる。期の締めでも入る。
一回 ${COST1} 石、十連 ${COST10} 石。十連は R 以上が 1 枚保証。${PITY} 回で UR 確定。
重複は石に戻る（N ${RARE[0].dup}／R ${RARE[1].dup}／SR ${RARE[2].dup}／UR ${RARE[3].dup}）。
修行札は持っている物から毎日 2 枚、日付で決まって課業に出る。`);

    s('スクリーンタイムについて');
    p(
`Web ページから端末のスクリーンタイムを自動で読む方法は無い。iOS も Android も外に出す口を持っていない。
だから手で写す。iPhone は 設定 → スクリーンタイム → すべてのアクティビティ、Android は 設定 → Digital Wellbeing。上位 3 つで充分だ。15 秒で終わる。
自動化したければ iOS のショートカットで「スクリーンタイム」を開く所までは組めるが、数字の取り出しは手になる。`);

    s('記録の置き場');
    p(
`全部この端末の中（localStorage）にある。サーバーには何も送らない。
例外は 2 つ。API キーを入れた時の相談（Anthropic に送る）と、符を自分で誰かに送る時だけだ。
端末を変える時は書き出して持っていけ。ブラウザの履歴削除で消える事がある。`);
  });
}

/* ───────── はじめに ───────── */

function openIntro(){
  sheet('磨', m => {
    const p = t => { const d = el('div','fu-body'); d.textContent = t; m.append(d); };
    p(
`ここは記録所だ。励ましはない。

ここは自己申告の場所ではない。
点になるのは、やる前にタイマーを押して、実際に流れた時間だけだ。
画面を離れれば止まる。離席の回数も残る。

押し忘れた分は手で書けるが「申告」として ${MANUAL_RATE*100}% しか通らず、段位には積まれない。
書けるのは今日と昨日まで。それより古い日は閉じる。

実測した時間が積まれると段位が上がる。上がるほど同じ1分が重くなる。
極めるほど点が伸びる作りだ。段位の合計は「極み」として符に載り、友達と並べて競える。

3 日ごとに格が付く。記録しなかった日は ${missPenalty()} 点として数える。
点の 1/10 が鍛錬石になり、石で引いた修行札は翌日の課業として戻ってくる。

教官への相談は鍵なしでも動く。記録を読んで答える。
設定に API キーを入れれば、本物の Claude が相手になる。`);

    const f = el('div','fld');
    f.append(el('span','','名前（符に載る。後で変えられる）'));
    const i = el('input'); i.type='text'; i.placeholder='名無し';
    f.append(i);
    m.append(f);

    const f2 = el('div','fld');
    f2.append(el('span','','厳しさ'));
    const w = el('div','seg');
    let hard = 1;
    HARD.forEach((h, k) => {
      const b = el('button','' + (k === hard ? 'on' : ''));
      b.type='button'; b.textContent = h.name;
      b.onclick = () => { hard = k; for (const x of $$('button', w)) x.classList.remove('on'); b.classList.add('on'); };
      w.append(b);
    });
    f2.append(w);
    f2.append(el('em','','後から変えられる。迷うなら真ん中だ。'));
    m.append(f2);

    const go = el('button','btn-primary big');
    go.type = 'button'; go.textContent = '始める';
    go.onclick = () => {
      S.profile.name = i.value.trim();
      S.profile.hard = hard;
      S.profile.startedAt = today();
      S.seen.intro = true;
      dropScoreCache(); saveNow();
      closeSheet();
      show('today');
      toast('始めた。何かやる前に、計測を押せ');
    };
    m.append(go);
  });
}

/* ───────── 日付が変わったら ───────── */

function watchDay(){
  setInterval(() => {
    const t = today();
    if (t !== lastKnownDay){
      lastKnownDay = t;
      dropScoreCache();
      settle();
      if (cur && cur < t) cur = t;
      show(view);
      toast('日が変わった。' + labelOf(t) + ' だ');
    }
  }, 30000);
}

/* ───────── 起動 ───────── */

function boot(){
  const had = load();
  lastKnownDay = today();
  cur = today();
  monCur = monOf(today());

  const got = settle();

  bindToday();
  bindCal();
  bindRank();
  bindAI();
  bindGacha();

  for (const b of $$('#tabs button')) b.onclick = () => { show(b.dataset.view); window.scrollTo(0,0); };
  $('#topRank').onclick = () => { show('rank'); window.scrollTo(0,0); };
  $('#btnSettings').onclick = openSettings;
  for (const e of $$('[data-close]')) e.onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  show('today');

  if (loadBroke){
    sheet('記録が読めなかった', m => {
      const p = el('div','fu-body');
      p.textContent =
`保存してあった記録を読み出せなかった。中身が壊れている。

上書きして消してしまわないよう、保存は止めてある。
今この画面で何をしても、元の記録には触らない。

壊れた中身は localStorage の「${KEY}.broken」に取ってある。
書き出したファイルがあるなら、設定から読み込め。それが一番早い。`;
      m.append(p);
      const b = el('button','btn-sub');
      b.type = 'button'; b.textContent = '書き出したファイルを読み込む';
      b.onclick = importData;
      m.append(b);
      const b2 = el('button','btn-sub danger');
      b2.type = 'button'; b2.textContent = '諦めて最初から始める';
      b2.onclick = () => { loadBroke = false; localStorage.removeItem(KEY); S = defaults(); saveNow(); closeSheet(); openIntro(); };
      m.append(b2);
    });
  }
  else if (!had || !S.seen.intro){ openIntro(); }
  else if (got.got > 0){
    const n = got.newCycles.length;
    toast(`鍛錬石 +${got.got}` + (n ? `・期が ${n} 件締まった` : ''), 'gold');
    if (n){
      const c = S.cycles[0];
      setTimeout(() => sheet(`第${c.i+1}期の裁定`, m => {
        const r = RANKS.find(x => x.l === c.rank) || RANKS[0];
        const l = el('div','rh-letter', c.rank);
        l.style.color = r.c; l.style.textAlign = 'center';
        m.append(l);
        m.append(el('div','rh-name', r.n));
        const p = el('div','fu-body'); p.textContent = c.verdict; m.append(p);
        const b = el('button','btn-primary'); b.type='button'; b.textContent = '受け取る';
        b.onclick = closeSheet;
        m.append(b);
      }), 700);
    }
  }

  /* 締まった期の裁定は、鍵があれば本物に書かせる（後から差し替える） */
  if (got.newCycles.length && hasKey()){
    const c = S.cycles[0];
    askVerdict(evalCycle(c.i))
      .then(t => { if (t){ c.verdict = t; c.by = 'Claude'; save(); if (view === 'rank') renderRank(); } })
      .catch(() => {});
  }

  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (!$('#view-today').hidden) renderChase();
      if (!$('#view-cal').hidden) renderTrend();
    }, 160);
  });

  watchDay();
  window.addEventListener('beforeunload', saveNow);
}

document.addEventListener('DOMContentLoaded', boot);
