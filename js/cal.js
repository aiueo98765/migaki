/* ============================================================
   cal.js — 暦と推移
   日の色で一月を一目に。穴が空いていればそれも一目に見える。
   ============================================================ */

let monCur = null;      // "2026-11"
let calSel = null;      // 選んだ日
let trendKey = 'score';
let trendSpan = 30;

const TRENDS = [
  { k:'score',  n:'点数',   unit:'点',  get:d => sc(d).total,                          color:'#e23b3b' },
  { k:'train',  n:'鍛錬',   unit:'分',  get:d => catMinutes(day(d)).train,             color:'#e23b3b' },
  { k:'study',  n:'学習',   unit:'分',  get:d => catMinutes(day(d)).study,             color:'#4a7fe0' },
  { k:'screen', n:'画面',   unit:'分',  get:d => { const s = stTotals(day(d)); return s.apps.length ? s.total : null; }, color:'#8b5fd6', low:true },
  { k:'sleep',  n:'睡眠',   unit:'分',  get:d => { const v = day(d).v; return v && v.sleep > 0 ? Number(v.sleep) : null; }, color:'#49b0b8' },
  { k:'weight', n:'体重',   unit:'kg',  get:d => { const v = day(d).v; return v && v.weight > 0 ? Number(v.weight) : null; }, color:'#3fb27f' },
  { k:'waste',  n:'浪費',   unit:'分',  get:d => catMinutes(day(d)).waste,             color:'#6b7280', low:true },
];

function monOf(d){ return d.slice(0,7); }

function dayColor(d){
  if (!hasAny(S.days[d])) return null;
  const v = sc(d).total;
  if (v < 0)   return '#5b2222';
  if (v < 120) return '#3a4150';
  if (v < 260) return '#2f6b4f';
  return '#d9a441';
}

function renderCal(){
  if (!monCur) monCur = monOf(today());
  const [y, m] = monCur.split('-').map(Number);
  const first = new Date(y, m-1, 1, 12);
  const last  = new Date(y, m, 0, 12);
  const nDays = last.getDate();
  const pad   = first.getDay();

  $('#monLabel').textContent = y + '年' + m + '月';
  $('#monNext').disabled = monCur >= monOf(today());

  const g = $('#cal');
  g.textContent = '';
  for (let i = 0; i < 7; i++){
    g.append(el('div','cal-dow' + (i===0?' sun':i===6?' sat':''), DOW[i]));
  }
  for (let i = 0; i < pad; i++) g.append(el('div','cd void'));

  const mdays = [];
  for (let n = 1; n <= nDays; n++){
    const d = ymd(new Date(y, m-1, n, 12));
    mdays.push(d);
    const c = dayColor(d);
    const b = el('button','cd' + (c ? ' has' : '') + (d === today() ? ' today' : '') + (d === calSel ? ' sel' : ''));
    b.type = 'button';
    if (c) b.style.background = c;
    if (d > today()) b.style.opacity = '.35';
    b.append(el('span','cd-d', String(n)));
    if (c) b.append(el('span','cd-s', String(sc(d).total)));
    /* 期の頭に印 */
    if (diffDays(cycleStart(), d) % 3 === 0 && d >= cycleStart()){
      b.append(el('span','cd-cyc', '期'));
    }
    b.onclick = () => { calSel = d; renderCal(); };
    g.append(b);
  }

  /* 月の要約 */
  const st = statsFor(mdays.filter(d => d <= today()));
  /* 始める前の日は穴ではない */
  const holes = mdays.filter(d => d < today() && d >= cycleStart() && !hasAny(S.days[d])).length;
  $('#monStat').textContent = st.logged
    ? `記録 ${st.logged} 日 / 平均 ${fmt(st.avg)} 点 / 白紙 ${holes} 日`
    : '記録なし';

  renderCalDetail();
  renderTrend();
}

function renderCalDetail(){
  const box = $('#calDetail');
  box.textContent = '';
  const d = calSel;
  if (!d){
    box.append(el('div','empty','日を押すとその日の中身が出る。\n過去の日も後から書ける。'));
    return;
  }
  const o = day(d);
  const r = sc(d);

  const h = el('div','dd-head');
  h.append(el('b','', labelOf(d)));
  h.append(el('em','', String(r.total)));
  h.append(el('span','', relOf(d) + ' / 第' + (cycleIndex(d)+1) + '期'));
  box.append(h);

  if (r.empty){
    box.append(el('div','dd-note','白紙だ。期の判定では ' + missPenalty() + ' 点として数える。'));
  }else{
    const mins = catMinutes(o);
    const sec1 = el('div','dd-sec');
    sec1.append(el('h3','','活動'));
    const t1 = el('div','dd-tags');
    let any = false;
    for (const c of CATS){
      if (!mins[c.id]) continue;
      any = true;
      const t = el('span','dd-tag');
      t.style.borderColor = c.color + '66';
      t.append(document.createTextNode(c.name));
      t.append(el('b','', String(mins[c.id])));
      t1.append(t);
    }
    if (!any) t1.append(el('span','dd-tag','なし'));
    sec1.append(t1);
    box.append(sec1);

    const st = stTotals(o);
    const extra = [];
    if (o.v && o.v.sleep) extra.push(['睡眠', hm(o.v.sleep)]);
    if (o.v && o.v.wake)  extra.push(['起床', o.v.wake]);
    if (o.v && o.v.weight)extra.push(['体重', o.v.weight + 'kg']);
    if (st.apps.length)   extra.push(['画面', st.total + '分']);
    if (o.todos && o.todos.length) extra.push(['やる事', o.todos.filter(x=>x.done).length + '/' + o.todos.length]);
    if (extra.length){
      const sec2 = el('div','dd-sec');
      sec2.append(el('h3','','体と画面'));
      const t2 = el('div','dd-tags');
      for (const [k,v] of extra){
        const t = el('span','dd-tag');
        t.append(document.createTextNode(k));
        t.append(el('b','', v));
        t2.append(t);
      }
      sec2.append(t2);
      box.append(sec2);
    }

    const on = CHECKS.filter(c => o.chk && o.chk[c.id]);
    if (on.length){
      const sec3 = el('div','dd-sec');
      sec3.append(el('h3','','節制'));
      const t3 = el('div','dd-tags');
      for (const c of on){
        const t = el('span','dd-tag');
        t.style.borderColor = c.bad ? '#5b2222' : '#1e4435';
        t.append(document.createTextNode(c.name));
        t3.append(t);
      }
      sec3.append(t3);
      box.append(sec3);
    }

    if (o.note && o.note.trim()){
      const sec4 = el('div','dd-sec');
      sec4.append(el('h3','','書いた事'));
      sec4.append(el('div','dd-note', o.note));
      box.append(sec4);
    }
    const sec5 = el('div','dd-sec');
    sec5.append(el('h3','','裁定'));
    sec5.append(el('div','dd-note', dayVerdict(d)));
    box.append(sec5);
  }

  if (d <= today()){
    const b = el('button','btn-sub dd-go', r.empty ? 'この日を埋める' : 'この日を直す');
    b.type = 'button';
    b.onclick = () => { cur = d; show('today'); renderToday(); window.scrollTo(0,0); };
    box.append(b);
  }
}

/* ───────── 推移の図 ───────── */

function renderTrendTabs(){
  const w = $('#trendTabs');
  w.textContent = '';
  for (const t of TRENDS){
    const b = el('button','' + (t.k === trendKey ? 'on' : ''));
    b.type = 'button'; b.textContent = t.n;
    b.onclick = () => { trendKey = t.k; renderTrendTabs(); renderTrend(); };
    w.append(b);
  }
  for (const n of [30, 90]){
    const b = el('button','' + (n === trendSpan ? 'on' : ''));
    b.type = 'button'; b.textContent = n + '日';
    b.onclick = () => { trendSpan = n; renderTrendTabs(); renderTrend(); };
    w.append(b);
  }
}

function renderTrend(){
  const T = TRENDS.find(t => t.k === trendKey) || TRENDS[0];
  const cv = $('#trendChart');
  const days = lastDays(trendSpan);
  const raw = days.map(d => hasAny(S.days[d]) ? T.get(d) : null);

  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 320, H = 160;
  cv.width = W*dpr; cv.height = H*dpr;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  x.clearRect(0,0,W,H);

  const vals = raw.filter(v => v !== null && v !== undefined && !isNaN(v));
  const foot = $('#chartFoot');
  foot.textContent = '';
  if (vals.length < 2){
    x.fillStyle = '#5f6775';
    x.font = '12px "Noto Sans JP",sans-serif';
    x.textAlign = 'center';
    x.fillText('記録が足りない（' + vals.length + ' 日）', W/2, H/2);
    return;
  }

  const pad = { l:30, r:8, t:10, b:18 };
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (trendKey === 'score') lo = Math.min(lo, 0);
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;
  lo -= span*0.12; hi += span*0.12;

  const px = i => pad.l + (W-pad.l-pad.r) * (i/(days.length-1));
  const py = v => pad.t + (H-pad.t-pad.b) * (1 - (v-lo)/(hi-lo));

  /* 目盛り */
  x.strokeStyle = '#2a2e37'; x.lineWidth = 1;
  x.fillStyle = '#5f6775';
  x.font = '9px "Oswald",sans-serif';
  x.textAlign = 'right';
  for (let k = 0; k <= 3; k++){
    const v = lo + (hi-lo)*k/3;
    const y = py(v);
    x.beginPath(); x.moveTo(pad.l, y); x.lineTo(W-pad.r, y); x.stroke();
    x.fillText(fmt(v, trendKey === 'weight' ? 1 : 0), pad.l-4, y+3);
  }
  /* 0 の線 */
  if (lo < 0 && hi > 0){
    x.strokeStyle = '#4a2a2a'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(pad.l, py(0)); x.lineTo(W-pad.r, py(0)); x.stroke();
  }
  /* 目標・上限の線 */
  let ref = null, refName = '';
  if (trendKey === 'screen'){ ref = S.profile.stLimit; refName = '上限'; }
  if (trendKey === 'sleep'){  ref = S.profile.sleepGoal; refName = '目標'; }
  if (trendKey === 'train' || trendKey === 'study'){ ref = S.profile.goals[trendKey]; refName = '目標'; }
  if (ref !== null && ref > lo && ref < hi){
    x.strokeStyle = '#d9a441'; x.setLineDash([3,3]); x.lineWidth = 1;
    x.beginPath(); x.moveTo(pad.l, py(ref)); x.lineTo(W-pad.r, py(ref)); x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#d9a441'; x.textAlign = 'left';
    x.fillText(refName, pad.l+2, py(ref)-3);
  }

  /* 折れ線（記録のない日で切る） */
  x.strokeStyle = T.color; x.lineWidth = 2;
  x.lineJoin = 'round'; x.lineCap = 'round';
  let open = false;
  x.beginPath();
  raw.forEach((v,i) => {
    if (v === null || v === undefined || isNaN(v)){ open = false; return; }
    if (!open){ x.moveTo(px(i), py(v)); open = true; }
    else x.lineTo(px(i), py(v));
  });
  x.stroke();

  /* 点 */
  raw.forEach((v,i) => {
    if (v === null || v === undefined || isNaN(v)) return;
    x.fillStyle = T.color;
    x.beginPath(); x.arc(px(i), py(v), raw.length > 45 ? 1.6 : 2.4, 0, 7); x.fill();
  });

  /* 傾き。記録の無い日で詰めずに、暦の位置のまま当てる。 */
  const pts = [];
  raw.forEach((v,i) => { if (v !== null && v !== undefined && !isNaN(v)) pts.push([i, v]); });
  const line = fitXY(pts);
  x.strokeStyle = '#ffffff33'; x.lineWidth = 1.5; x.setLineDash([5,4]);
  x.beginPath();
  x.moveTo(px(0), py(clamp(line.a, lo, hi)));
  x.lineTo(px(days.length-1), py(clamp(line.a + line.b*(days.length-1), lo, hi)));
  x.stroke(); x.setLineDash([]);

  /* 下の数字 */
  const mk = (k,v) => { const s = el('span'); s.append(document.createTextNode(k+' ')); s.append(el('b','',v)); return s; };
  const good = T.low ? line.b < 0 : line.b > 0;
  foot.append(mk('平均', fmt(avg(vals), trendKey==='weight'?1:0) + T.unit));
  foot.append(mk('最高', fmt(Math.max(...vals), trendKey==='weight'?1:0) + T.unit));
  foot.append(mk('最低', fmt(Math.min(...vals), trendKey==='weight'?1:0) + T.unit));
  const tr = el('span');
  tr.append(document.createTextNode('傾き '));
  const tb = el('b','', sgn(Math.round(line.b*10)/10) + T.unit + '/日');
  tb.style.color = good ? '#3fb27f' : (Math.abs(line.b) < 0.1 ? '#5f6775' : '#e23b3b');
  tr.append(tb);
  foot.append(tr);
  foot.append(mk('記録', vals.length + '/' + days.length + '日'));
}

function bindCal(){
  $('#monPrev').onclick = () => {
    const [y,m] = monCur.split('-').map(Number);
    const d = new Date(y, m-2, 1, 12);
    monCur = monOf(ymd(d)); renderCal();
  };
  $('#monNext').onclick = () => {
    if (monCur >= monOf(today())) return;
    const [y,m] = monCur.split('-').map(Number);
    const d = new Date(y, m, 1, 12);
    monCur = monOf(ymd(d)); renderCal();
  };
  renderTrendTabs();
  window.addEventListener('resize', () => {
    if (!$('#view-cal').hidden) renderTrend();
  });
}
