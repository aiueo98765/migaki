/* ============================================================
   measure.js — 実測
   自己申告をやめるための土台。
   点になるのは「回している間に実際に流れた時間」だ。
   画面を離れれば止まり、離れた回数も残る。
   ============================================================ */

/* ───────── 走っているタイマー ───────── */

let tickTimer = null;

function timerRunning(){ return !!S.timer; }

function startTimer(cat, label){
  if (S.timer){ toast('先に今のを止めろ','bad'); return false; }
  if (!canEdit(today())){ toast('今日の記録が閉じている','bad'); return false; }
  S.timer = {
    cat, label: (label || '').trim() || CAT[cat].name,
    day: today(),
    startMs: Date.now(),
    accMs: 0,
    awayMs: 0, awayN: 0, awayAt: 0,
  };
  saveNow();
  return true;
}

/** 今の経過（ミリ秒）。離れている間は進まない。 */
function timerElapsed(){
  const t = S.timer;
  if (!t) return 0;
  if (t.awayAt) return t.accMs;                 // 離席中は止まっている
  return t.accMs + (Date.now() - t.startMs);
}

/** 画面から離れた */
function timerAway(){
  const t = S.timer;
  if (!t || t.awayAt) return;
  t.accMs += Date.now() - t.startMs;
  t.awayAt = Date.now();
  t.awayN++;
  saveNow();
}
/** 戻ってきた */
function timerBack(){
  const t = S.timer;
  if (!t || !t.awayAt) return;
  t.awayMs += Date.now() - t.awayAt;
  t.awayAt = 0;
  t.startMs = Date.now();
  saveNow();
}

/** 止めて記録に落とす。1分に満たなければ捨てる。 */
function stopTimer(){
  const t = S.timer;
  if (!t) return null;
  if (t.awayAt) timerBack();
  const ms = timerElapsed();
  const min = Math.floor(ms / 60000);
  S.timer = null;

  if (min < 1){ saveNow(); return { min:0, dropped:true }; }

  const o = dayRW(t.day);
  o.acts.push({
    id: uid(), cat: t.cat, label: t.label, min,
    src: 'timer',
    away: t.awayN,
    awayMin: Math.round(t.awayMs/60000),
    at: new Date().toISOString(),
  });
  dropScoreCache(t.day);
  saveNow();
  return { min, away: t.awayN, awayMin: Math.round(t.awayMs/60000), cat: t.cat, label: t.label, day: t.day };
}

/** 捨てる */
function cancelTimer(){
  S.timer = null;
  saveNow();
}

/* 画面を離れたら自動で止める。これが「ながら計測」を潰す。 */
function watchVisibility(){
  document.addEventListener('visibilitychange', () => {
    if (!S.timer) return;
    if (document.visibilityState === 'hidden') timerAway();
    else timerBack();
    renderTimerBar();
  });
  window.addEventListener('blur',  () => { if (S.timer) { timerAway(); renderTimerBar(); } });
  window.addEventListener('focus', () => { if (S.timer) { timerBack(); renderTimerBar(); } });
}

/* ───────── 書ける日 ───────── */

/** その日はまだ書けるか（今日と、前日まで） */
function canEdit(d){
  const n = diffDays(d, today());
  return n >= 0 && n <= BACKFILL_DAYS;
}
function editLockReason(d){
  if (d > today()) return 'まだ来ていない日だ。';
  return `${BACKFILL_DAYS+1} 日より前の記録は閉じてある。後から書けるなら、それは記録ではなく作文だ。`;
}

/* ───────── 実測と申告 ───────── */

/** その日の分類ごとの分。実測と申告を分けて返す。 */
function catSplit(o){
  const m = {};
  for (const c of CATS) m[c.id] = { timer:0, manual:0, raw:0, away:0 };
  for (const a of (o.acts || [])){
    const x = m[a.cat];
    if (!x) continue;
    const k = (a.src === 'timer') ? 'timer' : 'manual';
    x[k] += a.min || 0;
    x.raw += a.min || 0;
    x.away += a.away || 0;
  }
  return m;
}

/** 点に効く分（申告は半分）。 */
function effMin(x){
  return x.timer + x.manual * MANUAL_RATE;
}

/** その日の実測率（0〜1）。記録が無ければ null。 */
function measuredRate(o){
  let t = 0, all = 0;
  for (const a of (o.acts || [])){
    if (CAT[a.cat] && CAT[a.cat].rate < 0) continue;   // 浪費は数に入れない
    all += a.min || 0;
    if (a.src === 'timer') t += a.min || 0;
  }
  return all ? t/all : null;
}

/* ───────── 段位 ───────── */

/** 分類ごとの累計実測時間（時間） */
function masteryHours(){
  const h = {};
  for (const c of CATS) h[c.id] = 0;
  for (const d of Object.keys(S.days)){
    for (const a of (S.days[d].acts || [])){
      if (a.src !== 'timer') continue;             // 申告は段位に積まれない
      if (h[a.cat] === undefined) continue;
      h[a.cat] += (a.min || 0) / 60;
    }
  }
  return h;
}

function danOf(hours){
  let i = 0;
  for (let k = 0; k < DAN.length; k++) if (hours >= DAN[k].h) i = k;
  return i;
}

/** 分類ごとの段位。{id:{lv,name,mul,hours,next,toNext}} */
function mastery(){
  const h = masteryHours();
  const out = {};
  for (const c of CATS){
    if (c.rate < 0) continue;
    const lv = danOf(h[c.id]);
    const nx = DAN[lv+1] || null;
    out[c.id] = {
      lv, name: DAN[lv].n, mul: DAN[lv].m, hours: h[c.id],
      next: nx, toNext: nx ? nx.h - h[c.id] : 0,
      from: DAN[lv].h,
    };
  }
  return out;
}
let _mast = null, _mastKey = '';
function mast(){
  const k = Object.keys(S.days).length + ':' + (S.days[today()] ? (S.days[today()].acts||[]).length : 0);
  if (_mast && _mastKey === k) return _mast;
  _mast = mastery(); _mastKey = k;
  return _mast;
}
function dropMastCache(){ _mast = null; _mastKey = ''; }

/** 極み値 ＝ 全分類の段位の合計。符に載る。 */
function kiwami(){
  const m = mast();
  return sum(Object.values(m).map(x => x.lv));
}
function kiwamiMax(){
  return CATS.filter(c => c.rate > 0).length * (DAN.length-1);
}

/** 連続で付く倍率。続けた人間が得をする。 */
function streakMul(d){
  return 1 + Math.min(streakAt(d), 60) * 0.004;     // 60日で 1.24 倍
}
