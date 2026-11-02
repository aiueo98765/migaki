/* ============================================================
   chase.js — 追走
   「今この時刻で、最高の日のお前は何点持っていたか」

   日の中の積み上げを時刻で追う。実測したセッションには時刻が残って
   いるので、過去の自分と同じ時刻に並べられる。
   相手は他人ではない。先に走っている自分だ。
   ============================================================ */

let chaseMode = 'best';     // best | avg7

/** その日の始まり（Date） */
function dayStartAt(d){
  const b = fromYmd(d);
  b.setHours(S.profile.dayStart || 4, 0, 0, 0);
  return b;
}

/** 今が一日の何分目か */
function nowMin(){
  const b = dayStartAt(today());
  return clamp((Date.now() - b.getTime()) / 60000, 0, 1440);
}

/**
 * その日の積み上げを時刻順に。実測したセッションだけ（時刻があるのはそれだけ）。
 * 返す: { pts:[{m,p}], total, n }
 */
function dayCurve(d){
  const o = day(d);
  const base = dayStartAt(d).getTime();
  const M = mast();
  const H = hardness();
  const segs = [];
  for (const a of (o.acts || [])){
    if (a.src !== 'timer' || !a.at) continue;
    const c = CAT[a.cat];
    if (!c) continue;
    const end = new Date(a.at).getTime();
    if (isNaN(end)) continue;
    const st = end - (a.min || 0) * 60000;
    const mul = c.rate > 0 ? (M[a.cat] ? M[a.cat].mul : 1) : H.waste;
    segs.push({
      s: clamp((st - base)/60000, 0, 1440),
      e: clamp((end - base)/60000, 0, 1440),
      gain: (a.min || 0) * c.rate * mul,
      cat: a.cat,
    });
  }
  segs.sort((a,b) => a.s - b.s);
  const pts = [{ m:0, p:0 }];
  let acc = 0;
  for (const s of segs){
    pts.push({ m:s.s, p:acc });
    acc += s.gain;
    pts.push({ m:s.e, p:acc });
  }
  return { pts, total: acc, n: segs.length, segs };
}

/** 曲線の、ある時刻での値 */
function curveAt(cv, m){
  const p = cv.pts;
  if (!p.length) return 0;
  if (m <= p[0].m) return p[0].p;
  for (let i = 1; i < p.length; i++){
    if (p[i].m >= m){
      const a = p[i-1], b = p[i];
      if (b.m === a.m) return b.p;
      return a.p + (b.p - a.p) * (m - a.m)/(b.m - a.m);
    }
  }
  return p[p.length-1].p;
}

/** 実測の入っている過去の日 */
function curveDays(){
  return loggedDays().filter(d => d < today() && dayCurve(d).n > 0);
}

/** 追いかける相手 */
function ghostOf(mode){
  const ds = curveDays();
  if (!ds.length) return null;
  if (mode === 'best'){
    let bd = ds[0], bv = -1e9;
    for (const d of ds){ const v = dayCurve(d).total; if (v > bv){ bv = v; bd = d; } }
    return { kind:'best', day:bd, label:`最高の日（${labelOf(bd)}）`, curve:dayCurve(bd) };
  }
  /* 直近7日の同時刻平均 */
  const use = ds.slice(-7);
  const cvs = use.map(dayCurve);
  const pts = [];
  for (let m = 0; m <= 1440; m += 10){
    pts.push({ m, p: avg(cvs.map(c => curveAt(c, m))) });
  }
  return {
    kind:'avg7', day:null,
    label:`直近 ${use.length} 日の同時刻平均`,
    curve:{ pts, total: pts[pts.length-1].p, n: use.length },
  };
}

/* ───────── 描く ───────── */

function renderChase(){
  const seg = $('#chaseSeg');
  seg.textContent = '';
  for (const [k,n] of [['best','最高の日'],['avg7','7日平均']]){
    const b = el('button','' + (k === chaseMode ? 'on' : ''));
    b.type='button'; b.textContent = n;
    b.onclick = () => { chaseMode = k; renderChase(); };
    seg.append(b);
  }

  const me = dayCurve(cur || today());
  const gh = ghostOf(chaseMode);
  const isToday = (cur || today()) === today();
  const now = isToday ? nowMin() : 1440;

  const read = $('#chaseRead');
  read.textContent = '';

  if (!gh){
    $('#chaseSub').textContent = '相手がまだいない';
    read.append(el('div','empty',
      '実測した日が一日も無いので、並べる相手がいない。\nタイマーで一度でも計れば、明日からここに過去の自分が走る。'));
    drawChase(me, null, now);
    return;
  }

  const mine = curveAt(me, now);
  const his  = curveAt(gh.curve, now);
  const d = mine - his;
  $('#chaseSub').textContent = gh.label;

  const big = el('div','chase-d ' + (d >= 0 ? 'up' : 'dn'));
  big.append(el('b','', (d >= 0 ? '+' : '') + fmt(d)));
  big.append(el('span','', '点　同時刻の差'));
  read.append(big);

  const L = [];
  const hhmm = m => {
    const t = new Date(dayStartAt(today()).getTime() + m*60000);
    return String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0');
  };
  L.push(`${hhmm(now)} の時点で、お前は ${fmt(mine)} 点。${gh.kind === 'best' ? '最高の日' : '直近の平均'}のお前は ${fmt(his)} 点だった。`);
  if (d < -40){
    /* 相手が今の自分の点に達した時刻 */
    let hit = null;
    for (let m = 0; m <= 1440; m += 5) if (curveAt(gh.curve, m) >= mine){ hit = m; break; }
    if (hit !== null && hit < now) L.push(`あの日のお前は ${hhmm(hit)} には今の点に届いていた。${fmt((now-hit)/60,1)} 時間ぶん遅れている。`);
    else L.push('差は広がっている。巻き返すなら、今からの一本が一番安い。');
  }else if (d < 0){
    L.push('まだ届いていないが、射程だ。今から一本回せば抜ける。');
  }else if (d < 60){
    L.push('前に出ている。だがあの日のお前は、この後も止まらなかった。');
  }else{
    L.push('はっきり上回っている。今日が新しい基準になる。');
  }
  if (me.n === 0) L.push('ただし今日はまだ実測が一本も無い。この線はゼロのままだ。');
  const p = el('p','chase-t'); p.textContent = L.join('\n');
  read.append(p);

  drawChase(me, gh, now);
}

function drawChase(me, gh, now){
  const cv = $('#chaseChart');
  if (!cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 320, H = 168;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,W,H);

  const pad = { l:34, r:10, t:12, b:20 };
  const xMax = 1440;
  const all = [...me.pts.map(p=>p.p), ...(gh ? gh.curve.pts.map(p=>p.p) : [0])];
  let hi = Math.max(1, ...all), lo = Math.min(0, ...all);
  hi += (hi-lo)*0.12;

  const px = m => pad.l + (W-pad.l-pad.r) * (m/xMax);
  const py = v => pad.t + (H-pad.t-pad.b) * (1 - (v-lo)/(hi-lo));

  /* 目盛り */
  g.strokeStyle = 'rgba(255,255,255,.055)'; g.lineWidth = 1;
  g.fillStyle = '#5f6775'; g.font = '9px Oswald, sans-serif';
  for (let k = 0; k <= 3; k++){
    const v = lo + (hi-lo)*k/3, y = py(v);
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W-pad.r, y); g.stroke();
    g.textAlign = 'right'; g.fillText(fmt(v), pad.l-4, y+3);
  }
  /* 時刻 */
  g.textAlign = 'center';
  const st = S.profile.dayStart || 4;
  for (let h = 0; h <= 24; h += 6){
    const m = h*60;
    const lbl = String((st + h) % 24).padStart(2,'0');
    g.fillText(lbl, px(m), H-6);
    g.strokeStyle = 'rgba(255,255,255,.04)';
    g.beginPath(); g.moveTo(px(m), pad.t); g.lineTo(px(m), H-pad.b); g.stroke();
  }

  const line = (pts, color, dash, fill) => {
    if (!pts.length) return;
    g.save();
    if (dash) g.setLineDash(dash);
    g.beginPath();
    pts.forEach((p,i) => i ? g.lineTo(px(p.m), py(p.p)) : g.moveTo(px(p.m), py(p.p)));
    g.strokeStyle = color; g.lineWidth = 2; g.lineJoin='round'; g.lineCap='round';
    g.stroke();
    if (fill){
      g.lineTo(px(pts[pts.length-1].m), py(lo));
      g.lineTo(px(pts[0].m), py(lo));
      g.closePath();
      const fg = g.createLinearGradient(0, pad.t, 0, H-pad.b);
      fg.addColorStop(0, fill); fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fg; g.fill();
    }
    g.restore();
  };

  if (gh) line(gh.curve.pts, 'rgba(217,164,65,.85)', [5,4], null);
  /* 今より先は描かない */
  const mp = me.pts.filter(p => p.m <= now);
  if (mp.length) mp.push({ m:now, p:curveAt(me, now) });
  line(mp, '#e23b3b', null, 'rgba(226,59,59,.22)');

  /* 今の線 */
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.setLineDash([2,3]); g.lineWidth = 1;
  g.beginPath(); g.moveTo(px(now), pad.t); g.lineTo(px(now), H-pad.b); g.stroke();
  g.setLineDash([]);

  /* 今の点 */
  if (mp.length){
    const y = py(curveAt(me, now));
    g.fillStyle = '#e23b3b';
    g.beginPath(); g.arc(px(now), y, 3.6, 0, 7); g.fill();
    g.strokeStyle = 'rgba(226,59,59,.35)'; g.lineWidth = 6;
    g.beginPath(); g.arc(px(now), y, 3.6, 0, 7); g.stroke();
  }
  if (gh){
    const y = py(curveAt(gh.curve, now));
    g.fillStyle = '#d9a441';
    g.beginPath(); g.arc(px(now), y, 3, 0, 7); g.fill();
  }
}
