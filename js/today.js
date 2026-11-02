/* ============================================================
   today.js — 今日の画面
   主役はタイマー。回した時間だけが満額で点になる。
   手で打った分は「申告」として残り、半分しか通らない。
   ============================================================ */

let cur = null;        // 見ている日
let curCat = 'study';  // 選んでいる分類
let locked = false;    // その日はもう書けない

/* ───────── 持ち越し ───────── */

/** 前日の終わっていないやる事を今日に引き継ぐ（一度だけ） */
function carryTodos(d){
  const o = dayRW(d);
  if (o.carried) return 0;
  const prev = S.days[shiftYmd(d,-1)];
  if (!prev || !prev.todos) { o.carried = true; return 0; }
  const left = prev.todos.filter(t => !t.done);
  for (const t of left){
    o.todos.push({ id:uid(), text:t.text, w:t.w, done:false, carry:(t.carry||0)+1 });
  }
  o.carried = true;
  if (left.length) save();
  return left.length;
}

/* ───────── 描く ───────── */

function renderToday(){
  if (!cur) cur = today();
  if (cur === today()) carryTodos(cur);
  dropScoreCache(cur);
  locked = !canEdit(cur);

  const o = day(cur);
  const r = sc(cur);

  $('#dayLabel').textContent = labelOf(cur);
  $('#dayRel').textContent = relOf(cur);
  $('#dayNext').disabled = cur >= today();

  const lb = $('#lockBar');
  lb.hidden = !locked;
  if (locked) lb.textContent = editLockReason(cur);
  $('#view-today').classList.toggle('is-locked', locked);

  renderScore(r);
  renderChase();
  renderMissions();
  renderCats(r);
  renderRun();
  renderActs(o, r);
  renderDan();
  renderTodos(o);
  renderVitals(o);
  renderScreen(o);
}

function renderScore(r){
  const t = scoreTier(r.total);
  const n = $('#dayScore');
  countTo(n, r.total);
  n.parentElement.className = 'score-num ' + t.k;
  $('#dayJudge').textContent = dayVerdict(cur);

  /* 分類の棒。実測と申告を塗り分ける。 */
  const bars = $('#scoreBars');
  bars.textContent = '';
  for (const c of CATS){
    const x = r.cats[c.id];
    if (!x) continue;
    if (c.rate < 0 && x.min === 0) continue;
    if (c.rate > 0 && x.goal === 0 && x.min === 0) continue;
    const row = el('div','sb');
    row.append(el('span','sb-n', c.name));
    const tr = el('div','sb-t');
    const base = x.goal > 0 ? x.goal : 60;
    const im = el('i','sb-timer');
    im.style.width = clamp((x.timer||0)/base*100, 0, 100) + '%';
    im.style.background = c.color;
    const id2 = el('i','sb-manual');
    id2.style.width = clamp((x.manual||0)/base*100, 0, 100 - clamp((x.timer||0)/base*100,0,100)) + '%';
    id2.style.background = c.color;
    tr.append(im, id2);
    row.append(tr);
    row.append(el('span','sb-v', x.goal > 0 ? x.min + '/' + x.goal : String(x.min)));
    bars.append(row);
  }
  if (!bars.children.length) bars.append(el('div','sb', '活動がまだ無い'));

  /* 内訳 */
  const br = $('#scoreBreak');
  br.textContent = '';
  for (const [k,v] of Object.entries(r.parts)){
    if (Math.abs(v) < 0.5) continue;
    const d = el('div','brk ' + (v > 0 ? 'plus' : 'minus'));
    d.append(el('span','', PART_NAMES[k] || k));
    d.append(el('b','', sgn(v)));
    if (k === 'kiwami' && r.mul){
      d.append(el('u','', '×' + (r.mul.kiwami * r.mul.streak).toFixed(2)));
    }
    br.append(d);
  }
}

/** 数字を回して見せる */
function countTo(node, to){
  const from = Number(node.dataset.v || 0);
  node.dataset.v = to;
  if (reduceMotion() || from === to){ node.textContent = to; return; }
  const t0 = performance.now(), ms = 520;
  const step = now => {
    const p = clamp((now - t0)/ms, 0, 1);
    const e = 1 - Math.pow(1-p, 3);
    node.textContent = Math.round(from + (to-from)*e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function reduceMotion(){
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderMissions(){
  const ms = missionsFor(cur);
  const ul = $('#missionList');
  ul.textContent = '';
  const done = ms.filter(m => m.done).length;
  $('#missionSub').textContent = done + ' / ' + ms.length + ' 済';

  ms.forEach((m, i) => {
    const li = el('li','mi' + (m.done ? ' done' : ''));
    li.style.setProperty('--i', i);
    const box = el('div','mi-box','✓');
    if (!m.done) box.style.borderColor = m.color + '88';
    li.append(box);
    const b = el('div','mi-body');
    b.append(el('div','mi-t', m.text));
    const s = el('div','mi-s');
    s.append(el('span','', m.sub));
    if (m.pt) s.append(el('em','', '+' + m.pt + ' 点'));
    if (m.auto) s.append(el('span','', '自動'));
    b.append(s);
    li.append(b);

    if (m.kind === 'plan') li.classList.add('is-plan');
    if (!m.auto && !locked){
      li.classList.add('tap');
      li.onclick = () => {
        if (m.kind === 'plan') togglePlanItem(cur, m.item.id);
        else toggleMission(cur, m.card.id);
        dropScoreCache(cur); save(); renderToday(); refreshTop();
      };
    }
    ul.append(li);
  });
}

function renderCats(r){
  const p = $('#catPills');
  p.textContent = '';
  for (const c of CATS){
    const b = el('button','cp' + (c.id === curCat ? ' on' : ''));
    b.type = 'button';
    if (c.id === curCat) b.style.background = c.color;
    const i = el('i'); i.style.background = c.id === curCat ? '#fff' : c.color;
    b.append(i, el('span','', c.name));
    const m = r.cats[c.id] ? r.cats[c.id].min : 0;
    if (m) b.append(el('span','cp-m', String(m)));
    b.onclick = () => { curCat = c.id; renderCats(r); renderQuick(); };
    p.append(b);
  }
  renderQuick();
}

function renderQuick(){
  const q = $('#quickRow');
  q.textContent = '';
  const mine = QUICKS.filter(x => x.cat === curCat);
  /* 過去に書いた物も候補に出す（よく使う順） */
  const freq = {};
  for (const d of loggedDays().slice(-60)){
    for (const a of (S.days[d].acts || [])){
      if (a.cat !== curCat) continue;
      freq[a.label] = (freq[a.label] || 0) + 1;
    }
  }
  const past = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,5)
    .filter(([l]) => !mine.some(m => m.label === l))
    .map(([l]) => ({ cat:curCat, label:l }));

  for (const x of [...mine, ...past]){
    const b = el('button','qk');
    b.type = 'button';
    b.textContent = x.label;
    b.onclick = () => { $('#actLabel').value = x.label; doStart(); };
    q.append(b);
  }
}

/* ───────── 計測 ───────── */

function renderRun(){
  const t = S.timer;
  const box = $('#runBox');
  const start = $('#startBox');
  const run = !!t;
  box.hidden = !run;
  start.hidden = run;
  $('#declBox').hidden = run || locked;
  if (locked){ start.hidden = true; }

  if (run){
    const c = CAT[t.cat] || CATS[0];
    $('#runWhat').textContent = c.name + '・' + t.label;
    box.style.setProperty('--c', c.color);
  }
  renderTimerBar();
  tick();
}

function fmtClock(ms){
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60;
  const p = n => String(n).padStart(2,'0');
  return h ? h + ':' + p(m) + ':' + p(x) : p(m) + ':' + p(x);
}

function tick(){
  clearInterval(tickTimer);
  if (!S.timer) return;
  const paint = () => {
    const t = S.timer;
    if (!t){ clearInterval(tickTimer); return; }
    const ms = timerElapsed();
    const txt = fmtClock(ms);
    const away = t.awayN ? `離席 ${t.awayN} 回` : '';
    const rt = $('#runTime'), ra = $('#runAway');
    if (rt) rt.textContent = txt;
    if (ra) ra.textContent = (t.awayAt ? '離席中・止まっている' : away);
    const bt = $('#tbTime'), ba = $('#tbAway');
    if (bt) bt.textContent = txt;
    if (ba) ba.textContent = t.awayAt ? '止' : (t.awayN ? '離' + t.awayN : '');
    $('#runBox').classList.toggle('away', !!t.awayAt);
    $('#timerBar').classList.toggle('away', !!t.awayAt);
  };
  paint();
  tickTimer = setInterval(paint, 1000);
}

function renderTimerBar(){
  const t = S.timer;
  const bar = $('#timerBar');
  bar.hidden = !t;
  document.body.classList.toggle('has-tbar', !!t);
  if (!t) return;
  const c = CAT[t.cat] || CATS[0];
  $('#tbDot').style.background = c.color;
  $('#tbWhat').textContent = c.name + '・' + t.label;
  bar.style.setProperty('--c', c.color);
}

function doStart(){
  if (locked){ toast(editLockReason(cur),'bad'); return; }
  if (cur !== today()){ toast('計測は今日だけだ','bad'); return; }
  const l = $('#actLabel').value;
  if (!startTimer(curCat, l)) return;
  $('#actLabel').value = '';
  renderToday(); refreshTop();
  toast('計測を始めた。画面を離れたら止まる', 'good');
}

function doStop(){
  const res = stopTimer();
  dropMastCache(); dropScoreCache();
  renderToday(); refreshTop();
  if (!res) return;
  if (res.dropped){ toast('1分に満たない。捨てた','bad'); return; }
  const m = mast()[res.cat];
  let msg = `${CAT[res.cat].name} ${hm(res.min)} を実測した`;
  if (res.away) msg += `（離席 ${res.away} 回）`;
  toast(msg, 'good');
  /* 段位が上がったら知らせる */
  checkDanUp();
}

let _danSnapshot = null;
function snapDan(){
  _danSnapshot = Object.fromEntries(Object.entries(mast()).map(([k,v]) => [k, v.lv]));
}
function checkDanUp(){
  if (!_danSnapshot) { snapDan(); return; }
  const now = mast();
  for (const [k,v] of Object.entries(now)){
    if (v.lv > (_danSnapshot[k] ?? 0)){
      setTimeout(() => toast(`${CAT[k].name} が ${v.name} に上がった。1分の重みが ×${v.mul.toFixed(2)} になる`, 'gold'), 900);
    }
  }
  snapDan();
}

/* ───────── 活動の一覧 ───────── */

function renderActs(o, r){
  const ul = $('#actList');
  ul.textContent = '';
  const acts = (o.acts || []).slice().reverse();
  const tot = sum((o.acts||[]).filter(a => CAT[a.cat] && CAT[a.cat].rate > 0).map(a => a.min));
  const w = sum((o.acts||[]).filter(a => a.cat === 'waste').map(a => a.min));
  const mr = measuredRate(o);
  $('#actSub').textContent = acts.length
    ? `実測 ${mr === null ? '—' : Math.round(mr*100) + '%'}・積み ${hm(tot)}` + (w ? ` / 浪費 ${hm(w)}` : '')
    : '';

  if (!acts.length){
    ul.append(el('li','empty','まだ何も積んでいない。\n分類を選んで、計測を始めろ。'));
    return;
  }
  acts.forEach((a, i) => {
    const c = CAT[a.cat] || CATS[0];
    const li = el('li','ai-row');
    li.style.setProperty('--i', i);
    const d = el('i','ai-dot'); d.style.background = c.color;
    li.append(d);
    const l = el('span','ai-l');
    l.append(document.createTextNode(a.label || c.name));
    if (a.src === 'timer'){
      const b = el('b','tag tag-m','実測');
      if (a.away) b.title = `離席 ${a.away} 回`;
      l.append(b);
      if (a.away) l.append(el('b','tag tag-a','離' + a.away));
    }else{
      l.append(el('b','tag tag-d','申告'));
    }
    li.append(l);
    li.append(el('span','ai-c', c.name));
    li.append(el('span','ai-m' + (a.src === 'timer' ? '' : ' dim'), String(a.min)));
    if (!locked){
      const x = el('button','ai-x','✕'); x.type = 'button';
      x.onclick = () => {
        const t = dayRW(cur);
        t.acts = t.acts.filter(y => y.id !== a.id);
        dropScoreCache(cur); dropMastCache(); save(); renderToday(); refreshTop();
      };
      li.append(x);
    }
    ul.append(li);
  });
}

function addAct(cat, label, min){
  if (locked){ toast(editLockReason(cur),'bad'); return; }
  min = Math.round(Number(min) || 0);
  if (min <= 0){ toast('分を入れろ','bad'); return; }
  const o = dayRW(cur);
  o.acts.push({ id:uid(), cat, label:(label||'').trim() || CAT[cat].name, min, src:'manual' });
  dropScoreCache(cur); save();
  renderToday(); refreshTop();
  toast(`${CAT[cat].name} ${min}分 を申告した（点は半分）`, CAT[cat].rate < 0 ? 'bad' : '');
}

/* ───────── 段位 ───────── */

function renderDan(){
  const m = mast();
  const ul = $('#danList');
  ul.textContent = '';
  $('#danSub').textContent = `極み ${kiwami()} / ${kiwamiMax()}・実測した時間だけが積まれる`;

  for (const c of CATS){
    if (c.rate < 0) continue;
    const x = m[c.id];
    const li = el('li','dn');
    const lv = el('div','dn-lv', x.name);
    lv.style.color = x.lv ? c.color : 'var(--ink-3)';
    li.append(lv);
    const b = el('div','dn-b');
    const h = el('div','dn-h');
    h.append(el('b','', c.name));
    h.append(el('span','', `${fmt(x.hours,1)} 時間・×${x.mul.toFixed(2)}`));
    b.append(h);
    const tr = el('div','dn-t');
    const i = el('i');
    const span = x.next ? (x.next.h - x.from) : 1;
    i.style.width = (x.next ? clamp((x.hours - x.from)/span*100, 0, 100) : 100) + '%';
    i.style.background = c.color;
    tr.append(i);
    b.append(tr);
    b.append(el('div','dn-n', x.next
      ? `${x.next.n} まで ${fmt(x.toNext,1)} 時間`
      : 'ここが上限だ'));
    li.append(b);
    ul.append(li);
  }
}

/* ───────── やる事 ───────── */

function renderTodos(o){
  const td = o.todos || [];
  const w = sum(td.map(t => t.w || 1));
  const dw = sum(td.filter(t => t.done).map(t => t.w || 1));
  const pct = w ? Math.round(dw/w*100) : 0;
  $('#todoBar').style.width = pct + '%';
  $('#todoPct').textContent = td.length ? pct + '%' : '—';
  $('#todoSub').textContent = td.length ? `${td.filter(t=>t.done).length} / ${td.length} 件` : '';

  const ul = $('#todoList');
  ul.textContent = '';
  if (!td.length){
    ul.append(el('li','empty','やる事が無い。\n3件までにしろ。多く立てた日は必ず半分残る。'));
  }
  const W = { 1:'軽', 2:'並', 3:'重', 5:'山場' };
  td.forEach((t, i) => {
    const li = el('li','mi' + (t.done ? ' done' : '') + (locked ? '' : ' tap'));
    li.style.setProperty('--i', i);
    li.append(el('div','mi-box','✓'));
    const b = el('div','mi-body');
    b.append(el('div','mi-t', t.text));
    const s = el('div','mi-s');
    s.append(el('span','', W[t.w] || '並'));
    if (t.carry) s.append(el('em','', t.carry + '日持ち越し'));
    b.append(s);
    li.append(b);
    if (!locked){
      const x = el('button','mi-del','✕'); x.type = 'button';
      x.onclick = (ev) => {
        ev.stopPropagation();
        const o2 = dayRW(cur);
        o2.todos = o2.todos.filter(y => y.id !== t.id);
        dropScoreCache(cur); save(); renderToday(); refreshTop();
      };
      li.append(x);
      li.onclick = () => {
        t.done = !t.done;
        dropScoreCache(cur); save(); renderToday(); refreshTop();
      };
    }
    ul.append(li);
  });

  /* 居座っている物を名指しする */
  const cb = $('#carryBox');
  cb.textContent = '';
  const stale = td.filter(t => !t.done && (t.carry||0) >= 2);
  if (stale.length){
    const d = el('div','carry-box');
    d.append(el('b','', stale.length + ' 件'));
    d.append(document.createTextNode(
      `が ${Math.max(...stale.map(t=>t.carry))} 日居座っている。「${stale[0].text}」。`
      + 'やりたくないのではなく、大きすぎて始められないだけだ。15分で終わる最初の一手に書き換えろ。'));
    cb.append(d);
  }
}

/* ───────── 体と節制 ───────── */

function renderVitals(o){
  const v = o.v || {};
  $('#vSleep').value  = v.sleep ?? '';
  $('#vWake').value   = v.wake ?? '';
  $('#vWeight').value = v.weight ?? '';
  $('#vMood').value   = v.mood ?? 3;
  $('#vMoodV').textContent = v.mood ?? 3;
  $('#dayNote').value = o.note || '';
  for (const id of ['#vSleep','#vWake','#vWeight','#vMood','#dayNote']) $(id).disabled = locked;

  const row = $('#chkRow');
  row.textContent = '';
  CHECKS.forEach((c, i) => {
    const on = !!(o.chk && o.chk[c.id]);
    const b = el('button','chk' + (on ? ' on' : '') + (c.bad ? ' bad' : ''));
    b.type = 'button';
    b.style.setProperty('--i', i);
    b.append(el('i','', on ? (c.bad ? '!' : '✓') : '○'));
    b.append(document.createTextNode(c.name));
    b.append(el('span','', (c.pt > 0 ? '+' : '') + c.pt));
    b.disabled = locked;
    b.onclick = () => {
      const t = dayRW(cur);
      if (!t.chk) t.chk = {};
      t.chk[c.id] = !t.chk[c.id];
      dropScoreCache(cur); save(); renderToday(); refreshTop();
    };
    row.append(b);
  });
}

/* ───────── スクリーンタイム ───────── */

function renderScreen(o){
  const st = stTotals(o);
  const lim = S.profile.stLimit || 1;
  const over = st.total > lim;
  countTo($('#stTotal'), st.total);
  $('#stTotal').parentElement.className = 'st-total' + (over ? ' over' : '');
  $('#stLimitTag').textContent = `上限 ${lim} 分`;
  $('#stSub').textContent = st.apps.length ? (over ? `${st.total-lim} 分の超過` : `${lim-st.total} 分の余裕`) : '未記録';

  const scale = Math.max(lim * 1.5, st.total, 1);
  const g = $('#stGauge');
  g.style.width = clamp(st.total/scale*100, 0, 100) + '%';
  g.className = over ? 'over' : '';
  $('#stMark').style.left = clamp(lim/scale*100, 0, 100) + '%';

  const ul = $('#stList');
  ul.textContent = '';
  const apps = st.apps.slice().sort((a,b) => b.min - a.min);
  if (!apps.length){
    ul.append(el('li','empty','画面時間が入っていない。\n見たくない数字を見ないのが、一番安い逃げ方だ。'));
  }
  const mx = apps.length ? apps[0].min : 1;
  apps.forEach((a, i) => {
    const li = el('li','sa');
    li.style.setProperty('--i', i);
    li.append(el('span','sa-n', a.name));
    const tr = el('div','sa-t');
    const ic = el('i', ST_JUNK.includes(a.name) ? 'bad' : '');
    ic.style.width = clamp(a.min/mx*100, 3, 100) + '%';
    tr.append(ic); li.append(tr);
    li.append(el('span','sa-m', String(a.min)));
    if (!locked){
      const x = el('button','sa-x','✕'); x.type = 'button';
      x.onclick = () => {
        const t = dayRW(cur);
        t.st.apps = t.st.apps.filter(y => y.name !== a.name);
        dropScoreCache(cur); save(); renderToday(); refreshTop();
      };
      li.append(x);
    }
    ul.append(li);
  });

  /* 候補（過去に入れたアプリも足す） */
  const dl = $('#stAppList');
  dl.textContent = '';
  const seen = new Set(ST_APPS);
  for (const d of loggedDays().slice(-60))
    for (const a of ((S.days[d].st && S.days[d].st.apps) || [])) seen.add(a.name);
  for (const n of seen){ const op = el('option'); op.value = n; dl.append(op); }

  $('#stApp').disabled = $('#stMin').disabled = $('#stAdd').disabled = locked;

  const h = $('#stHint');
  if (!apps.length){
    h.textContent = 'iPhone：設定 → スクリーンタイム → すべてのアクティビティ。Android：設定 → Digital Wellbeing。上位3つを写すだけでいい。ここだけは端末が外に出さないので、手で写すしかない。';
  }else if (over){
    const top = apps[0];
    h.textContent = `${top.name} が ${top.min} 分。消さなくていい。ホーム画面から外して、検索しないと開けない所に置け。意志ではなく距離で勝つ。`;
  }else{
    h.textContent = '上限内だ。空いた時間が何に向かったか、活動記録と見比べろ。';
  }
}

/* ───────── 操作をつなぐ ───────── */

function bindToday(){
  $('#dayPrev').onclick = () => { cur = shiftYmd(cur, -1); renderToday(); };
  $('#dayNext').onclick = () => { if (cur < today()){ cur = shiftYmd(cur, 1); renderToday(); } };

  $('#actStart').onclick = doStart;
  $('#actLabel').onkeydown = e => { if (e.key === 'Enter') doStart(); };
  $('#runStop').onclick = doStop;
  $('#tbStop').onclick  = doStop;
  $('#runDrop').onclick = () => {
    const ms = timerElapsed();
    if (ms > 5*60000 && !confirm(fmtClock(ms) + ' を捨てる。いいか。')) return;
    cancelTimer(); renderToday(); refreshTop();
    toast('捨てた','bad');
  };

  /* 分の増減 */
  $$('.minbox button').forEach(b => {
    b.onclick = () => {
      const i = $('#actMin');
      i.value = clamp((Number(i.value)||0) + Number(b.dataset.min), 0, 1440);
    };
  });
  $('#actAdd').onclick = () => {
    addAct(curCat, $('#actLabel').value || '', Number($('#actMin').value));
    $('#actLabel').value = '';
  };

  /* やる事 */
  $('#todoForm').onsubmit = e => {
    e.preventDefault();
    if (locked){ toast(editLockReason(cur),'bad'); return; }
    const t = $('#todoText').value.trim();
    if (!t) return;
    const o = dayRW(cur);
    o.todos.push({ id:uid(), text:t, w:Number($('#todoWeight').value)||2, done:false, carry:0 });
    $('#todoText').value = '';
    dropScoreCache(cur); save(); renderToday(); refreshTop();
  };

  /* 体と節制 */
  const vset = (id, key, num) => {
    const e = $(id);
    const h = () => {
      if (locked) return;
      const o = dayRW(cur);
      if (!o.v) o.v = {};
      const val = e.value;
      o.v[key] = (val === '') ? '' : (num ? Number(val) : val);
      dropScoreCache(cur); save();
      if (key === 'mood') $('#vMoodV').textContent = val;
      else { renderScore(sc(cur)); renderMissions(); refreshTop(); }
    };
    if (key === 'mood') e.oninput = h;
    e.onchange = h;
  };
  vset('#vSleep','sleep',true);
  vset('#vWake','wake',false);
  vset('#vWeight','weight',true);
  vset('#vMood','mood',true);

  $('#dayNote').onchange = () => {
    if (locked) return;
    dayRW(cur).note = $('#dayNote').value;
    save();
  };

  /* スクリーンタイム */
  const addSt = () => {
    if (locked){ toast(editLockReason(cur),'bad'); return; }
    const n = $('#stApp').value.trim();
    const m = Math.round(Number($('#stMin').value) || 0);
    if (!n){ toast('アプリ名を入れろ','bad'); return; }
    if (m <= 0){ toast('分を入れろ','bad'); return; }
    const o = dayRW(cur);
    if (!o.st) o.st = { apps:[] };
    const ex = o.st.apps.find(a => a.name === n);
    if (ex) ex.min = m; else o.st.apps.push({ name:n, min:m });
    $('#stApp').value = ''; $('#stMin').value = '';
    dropScoreCache(cur); save(); renderToday(); refreshTop();
  };
  $('#stAdd').onclick = addSt;
  $('#stMin').onkeydown = e => { if (e.key === 'Enter') addSt(); };
  $('#stApp').onkeydown = e => { if (e.key === 'Enter') $('#stMin').focus(); };

  watchVisibility();
  snapDan();
}
