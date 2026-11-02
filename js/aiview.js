/* ============================================================
   aiview.js — 教官の画面
   要約・分析・未来予想・相談。
   ============================================================ */

let futDays = 90;
let chatBusy = false;

function renderAI(){
  renderSummary();
  renderPlan();
  renderShape();
  renderWeights();
  renderFindings();
  renderFutSeg();
  renderFuture();
  renderChatMode();
  renderChat();
  renderChatSug();
}

function renderSummary(){
  const s = summary();
  const g = $('#sumGrid');
  g.textContent = '';
  $('#sumSub').textContent = s.all.logged ? `記録 ${s.all.logged} 日ぶん` : '記録なし';

  for (const it of s.items){
    const d = el('div','sg');
    d.append(el('span','', it.k));
    const b = el('b','');
    b.append(document.createTextNode(String(it.v)));
    b.append(el('em','', it.u));
    if (it.d !== null && it.d !== undefined && Math.abs(it.d) >= 1){
      /* 矢印は増減そのもの、色は良し悪し。画面時間は減った方が良い。 */
      const rose = it.d > 0;
      const good = it.down ? !rose : rose;
      const sp = el('span', good ? 'up' : 'dn', (rose ? '▲' : '▼') + fmt(Math.abs(it.d)));
      sp.style.fontSize = '10px';
      b.append(sp);
    }
    d.append(b);
    g.append(d);
  }
}

/* ───────── 作戦 ───────── */

let planBusy = false;

function renderPlan(){
  const box = $('#planBox');
  box.textContent = '';
  const p = planLive();
  const btn = $('#btnPlan');
  btn.textContent = planBusy ? '組んでいる…' : (p ? '組み直す' : '組ませる');
  btn.disabled = planBusy;

  if (!p){
    $('#planSub').textContent = hasKey() ? '本物の Claude が組む' : '記録から組む（鍵があれば Claude が組む）';
    box.append(el('div','empty',
      '作戦がない。\n押せば、記録を読んで次の3日を組む。\n組まれた指示はそのまま「本日の課業」に出る。'));
    return;
  }

  const pr = planProgress();
  $('#planSub').textContent = `${p.from.slice(5)} 〜 ${p.to.slice(5)}・${p.by}が作成・${pr.done}/${pr.all} 済`;

  /* 狙い */
  const aim = el('div','plan-aim');
  aim.append(el('u','','この3日で変える一点'));
  aim.append(el('b','', p.aim));
  if (p.why) aim.append(el('p','', p.why));
  box.append(aim);

  /* 進み */
  const bar = el('div','plan-bar');
  const i = el('i'); i.style.width = Math.round(pr.rate*100) + '%';
  bar.append(i);
  box.append(bar);

  /* 3日 */
  const grid = el('div','plan-days');
  p.days.forEach((g, n) => {
    const col = el('div','pd' + (g.d === today() ? ' now' : '') + (g.d < today() ? ' past' : ''));
    col.style.setProperty('--i', n);
    const h = el('div','pd-h');
    h.append(el('b','', (n+1) + '日目'));
    h.append(el('span','', labelOf(g.d).replace(/\(.\)$/, m => m)));
    col.append(h);
    const ul = el('ul','pd-l');
    const done = day(g.d).plan || [];
    for (const it of g.items){
      const li = el('li','pi' + (done.includes(it.id) ? ' done' : ''));
      const bx = el('i','pi-b','✓');
      if (it.cat) bx.style.borderColor = CAT[it.cat].color + '99';
      li.append(bx);
      const b = el('div','pi-t');
      b.append(document.createTextNode(it.text));
      if (it.min) b.append(el('em','', ' ' + it.min + '分 計測'));
      li.append(b);
      if (canEdit(g.d)){
        li.classList.add('tap');
        li.onclick = () => {
          togglePlanItem(g.d, it.id);
          dropScoreCache(g.d); save();
          renderPlan(); refreshTop();
          if (!$('#view-today').hidden) renderToday();
        };
      }
      ul.append(li);
    }
    if (!g.items.length) ul.append(el('li','pi','—'));
    col.append(ul);
    grid.append(col);
  });
  box.append(grid);

  if (p.note){
    const n = el('div','plan-note');
    n.textContent = p.note;
    box.append(n);
  }

  const drop = el('button','btn-ghost');
  drop.type='button'; drop.textContent = '作戦を捨てる';
  drop.onclick = () => { clearPlan(); renderPlan(); if (!$('#view-today').hidden) renderToday(); };
  box.append(drop);
}

async function doPlan(){
  if (planBusy) return;
  planBusy = true; renderPlan();
  let p = null, err = null;
  try{
    if (hasKey()) p = await askPlan();
  }catch(e){ err = e.message; }
  if (!p) p = buildPlan();
  planBusy = false;
  savePlan(p);
  dropScoreCache();
  renderPlan(); refreshTop();
  if (!$('#view-today').hidden) renderToday();
  if (err) toast('Claude に繋がらなかった（' + err + '）。内蔵で組んだ','bad');
  else toast(`${p.by}が ${p.from.slice(5)} からの3日を組んだ`, 'gold');
}

/* ───────── 良い日の型 ───────── */

function renderShape(){
  const box = $('#shapeBox');
  box.textContent = '';
  const s = goodShape();
  if (s.thin){
    $('#shapeSub').textContent = `記録 ${s.n} 日`;
    box.append(el('div','empty','記録が6日に届いていない。\n強い日と弱い日を比べるには、まず日数が要る。'));
    return;
  }
  $('#shapeSub').textContent = `強い ${s.k} 日（平均 ${fmt(s.hiAvg)} 点）対 弱い ${s.k} 日（${fmt(s.loAvg)} 点）`;

  if (s.firstCat){
    const f = el('div','shape-first');
    f.append(el('b','', CAT[s.firstCat.cat].name));
    f.append(document.createTextNode(` から始めている。強い日 ${s.firstCat.of} 日のうち ${s.firstCat.n} 日がそうだ。`));
    f.style.borderLeftColor = CAT[s.firstCat.cat].color;
    box.append(f);
  }

  s.rows.forEach((r, i) => {
    const row = el('div','sp');
    row.style.setProperty('--i', i);
    row.append(el('span','sp-n', r.name));
    const v = el('div','sp-v');
    v.append(el('b','', r.hiV));
    v.append(el('u','', '対'));
    v.append(el('s','', r.loV));
    row.append(v);
    const g = el('div','sp-g');
    const gi = el('i'); gi.style.width = clamp(r.gap*100, 6, 100) + '%';
    g.append(gi);
    row.append(g);
    box.append(row);
  });

  const t = el('p','hint');
  t.textContent = '左が強い日、右が弱い日の平均。これはお前自身の記録から出た型だ。真似る相手は他人ではない。';
  box.append(t);
}

/* ───────── 効いている順 ───────── */

function renderWeights(){
  const ul = $('#weighList');
  ul.textContent = '';
  const W = weights();
  if (!W.length){
    ul.append(el('li','empty','材料が足りない。\n同じ項目が6日ぶん揃うと出る。'));
    return;
  }
  const mx = Math.max(...W.map(w => Math.abs(w.r)));
  W.forEach((w, i) => {
    const li = el('li','wg');
    li.style.setProperty('--i', i);
    li.append(el('span','wg-n', w.f.n));
    const t = el('div','wg-t');
    const neg = w.r < 0;
    const bar = el('i', neg ? 'neg' : '');
    bar.style.width = clamp(Math.abs(w.r)/mx*50, 3, 50) + '%';
    bar.style[neg ? 'right' : 'left'] = '50%';
    t.append(el('u','mid'));
    t.append(bar);
    li.append(t);
    const v = el('span','wg-v' + (w.swing >= 0 ? ' up' : ' dn'));
    v.textContent = sgn(w.swing) + '点';
    li.append(v);
    li.title = `相関 ${w.r.toFixed(2)}（${w.n} 日）`;
    ul.append(li);
  });
  const p = el('li','wg-foot');
  p.textContent = '数字は「その項目が上位1割の日と下位1割の日で、点が何点違うか」。'
    + '左に伸びるほど点を削っている。項目どうしは絡み合っているので、足し合わせてはいけない。';
  ul.append(p);
}

function renderFindings(){
  const F = analyze();
  S.ai.lastFind = F.length;
  const ul = $('#findList');
  ul.textContent = '';
  const SEV = { 3:'致命', 2:'注意', 1:'情報', 0:'良' };
  F.forEach((f, idx) => {
    const li = el('li','fd sev' + f.sev);
    li.style.setProperty('--i', idx);
    const h = el('div','fd-h');
    h.append(el('b','', f.title));
    h.append(el('span','', SEV[f.sev]));
    li.append(h);
    li.append(el('div','fd-t', f.text));
    if (f.fix) li.append(el('div','fd-fix', '→ ' + f.fix));
    ul.append(li);
  });
  if (!F.length) ul.append(el('li','empty','穴は見つからなかった。これは珍しい。'));
}

function renderFutSeg(){
  const w = $('#futSeg');
  w.textContent = '';
  for (const h of HORIZONS){
    const b = el('button','' + (h.d === futDays ? 'on' : ''));
    b.type = 'button'; b.textContent = h.name;
    b.onclick = () => { futDays = h.d; renderFutSeg(); renderFuture(); };
    w.append(b);
  }
}

function renderFuture(){
  const f = forecast(futDays);
  const box = $('#future');
  box.textContent = '';

  const H = HORIZONS.find(h => h.d === futDays);
  const head = el('div','fu-head');
  head.append(el('b','', H.name + 'のお前'));
  head.append(el('span','', `今の傾き ${sgn(Math.round(f.trend*10)/10)} 点/日`));
  box.append(head);

  if (!f.thin){
    const st = el('div','fu-stats');
    const mk = (k, v) => { const d = el('div','fu-s'); d.append(el('span','',k)); d.append(el('b','',v)); st.append(d); };
    mk('推定の格', f.rankThen.l + ' ' + f.rankThen.n);
    mk('平均点', fmt(f.then) + ' 点');
    mk('積む時間', fmt(f.buildHours) + ' 時間');
    if (f.stHours >= 1)  mk('画面に出す', fmt(f.stHours) + ' 時間');
    if (f.wasteHours >= 1) mk('消える時間', fmt(f.wasteHours) + ' 時間');
    mk('白紙の日', Math.round(futDays*(1-f.logRate)) + ' 日');
    box.append(st);
  }

  const b = el('div','fu-body');
  b.textContent = futureText(f);
  box.append(b);

  const alt = futureAlt(f);
  if (alt){
    const a = el('div','fu-alt');
    a.append(el('h3','', '— ' + alt.title + ' —'));
    const p = el('p','');
    p.textContent = alt.text;
    a.append(p);
    box.append(a);
  }
}

/* ───────── 相談 ───────── */

function renderChatMode(){
  $('#chatMode').textContent = hasKey()
    ? '本物の Claude（' + (S.ai.model || '').replace('claude-','') + '）'
    : '内蔵（鍵なしでも記録を読んで答える）';
}

function renderChat(){
  const log = $('#chatLog');
  log.textContent = '';
  if (!S.ai.chat.length){
    const m = el('div','msg ai');
    m.textContent = '来たか。記録は見てある。何を聞きたい。\n答えは全部お前の数字から出す。言い訳の相手はしない。';
    log.append(m);
  }
  for (const m of S.ai.chat){
    const d = el('div','msg ' + m.who);
    d.textContent = m.text;
    log.append(d);
  }
  log.scrollTop = log.scrollHeight;
}

function renderChatSug(){
  const w = $('#chatSug');
  w.textContent = '';
  const subs = ['今日どうだった','何からやる','スマホを減らしたい','このままだとどうなる','やる気が出ない','ランクを上げたい'];
  for (const s of subs){
    const b = el('button');
    b.type = 'button'; b.textContent = s;
    b.onclick = () => { $('#chatText').value = s; $('#chatForm').requestSubmit(); };
    w.append(b);
  }
}

async function sendChat(text){
  if (chatBusy) return;
  text = text.trim();
  if (!text) return;

  S.ai.chat.push({ who:'me', text });
  if (S.ai.chat.length > 60) S.ai.chat = S.ai.chat.slice(-60);
  save();
  renderChat();

  const log = $('#chatLog');
  const wait = el('div','msg ai wait', '…');
  log.append(wait);
  log.scrollTop = log.scrollHeight;
  chatBusy = true;

  let out;
  try{
    if (hasKey()) out = await askClaude(text);
    else { await new Promise(r => setTimeout(r, 260)); out = askLocal(text); }
    if (!out) out = '返す言葉がない。質問を変えろ。';
  }catch(e){
    out = '繋がらなかった（' + e.message + '）。\n鍵か回線を確かめろ。内蔵の判定で続けるなら、設定から鍵を消せばいい。\n\n' + askLocal(text);
  }
  chatBusy = false;
  wait.remove();
  S.ai.chat.push({ who:'ai', text: out });
  save();
  renderChat();
}

function bindAI(){
  $('#btnPlan').onclick = doPlan;
  $('#btnAnalyze').onclick = () => { dropScoreCache(); dropMastCache(); renderAI(); toast('洗い直した'); };
  $('#chatForm').onsubmit = e => {
    e.preventDefault();
    const t = $('#chatText').value;
    $('#chatText').value = '';
    sendChat(t);
  };
}
