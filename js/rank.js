/* ============================================================
   rank.js — 階級と三日裁定
   3日を一期として締め、格付けし直す。
   未記録の日は 0 ではなく負債として数える。逃げ道を作らない。
   ============================================================ */

const RANKS = [
  { l:'F',  n:'論外',       at:-999, c:'#7a3030', say:'まだ何も始まっていない。' },
  { l:'E',  n:'凡夫',       at:0,    c:'#6b7280', say:'いる。それだけだ。' },
  { l:'D',  n:'半人前',     at:60,   c:'#7c6a4a', say:'形になりかけている。' },
  { l:'C',  n:'並の男',     at:120,  c:'#4a7fe0', say:'世間の真ん中。つまり埋もれる。' },
  { l:'B',  n:'芯が通る',   at:180,  c:'#49b0b8', say:'崩れにくくなってきた。' },
  { l:'A',  n:'一目置かれる', at:240, c:'#3fb27f', say:'周りが気づき始める頃だ。' },
  { l:'S',  n:'別格',       at:300,  c:'#8b5fd6', say:'同じ土俵に人が少ない。' },
  { l:'SS', n:'怪物',       at:370,  c:'#d9a441', say:'ここまで来たら、落ちる方が難しい。' },
];

function rankOf(avgScore){
  let r = RANKS[0];
  for (const x of RANKS) if (avgScore >= x.at) r = x;
  return r;
}
function nextRank(avgScore){
  const i = RANKS.indexOf(rankOf(avgScore));
  return RANKS[i+1] || null;
}

/* 未記録の日をいくらの負債として数えるか */
function missPenalty(){
  return [-20, -40, -70][clamp(S.profile.hard|0, 0, 2)];
}

/* ───────── 期の区切り ───────── */

function cycleStart(){ return S.profile.startedAt || today(); }

/** d が属する期の番号（0 始まり） */
function cycleIndex(d){
  return Math.floor(diffDays(cycleStart(), d) / 3);
}
/** 期 i の日（3つ） */
function cycleDays(i){
  const s = shiftYmd(cycleStart(), i*3);
  return [s, shiftYmd(s,1), shiftYmd(s,2)];
}
function currentCycle(){ return cycleIndex(today()); }

/** 期の集計。未記録は負債として平均に入れる。 */
function evalCycle(i){
  const days = cycleDays(i);
  const t = today();
  const vals = days.map(d => {
    if (d > t) return null;                        // 未来は数えない
    if (hasAny(S.days[d])) return sc(d).total;
    /* 今日はまだ終わっていない。終わる前から白紙の罰は与えない。 */
    return d === t ? 0 : missPenalty();
  });
  const live = vals.filter(v => v !== null);
  const a = live.length ? avg(live) : 0;
  const missed = days.filter(d => d < t && !hasAny(S.days[d])).length;
  const r = rankOf(a);
  return {
    i, days, from:days[0], to:days[2],
    vals, avg:a, total:sum(live),
    missed, logged: live.length - missed,
    closed: days[2] < today(),
    partial: live.length < 3,
    rank: r,
  };
}

/** 直前の期（比較用） */
function prevEval(i){ return i > 0 ? evalCycle(i-1) : null; }

/** 期の裁定文。前期との差を踏まえて厳しく言う。 */
function cycleVerdict(ev){
  const p = prevEval(ev.i);
  const d = p ? ev.avg - p.avg : null;
  const seed = 'c' + ev.i + ':' + Math.round(ev.avg);
  const out = [];

  if (ev.missed >= 2){
    out.push(`3日のうち ${ev.missed} 日が白紙だ。記録しない日は、無かった日と同じに扱う。`);
  }else if (ev.missed === 1){
    out.push('1日落とした。3日で区切る意味は、1日の穴が3分の1になるという事だ。');
  }

  if (d !== null){
    if (d >= 50)      out.push(`前期から ${fmt(d)} 点の上昇。偶然ではない動きだ。次はこれを基準線にしろ。`);
    else if (d >= 12) out.push(`前期から ${fmt(d)} 点。伸びてはいるが、まだ誤差で説明できる幅だ。`);
    else if (d > -12) out.push('前期とほぼ同じ。横ばいは、同じ所で3日使ったという事だ。');
    else if (d > -50) out.push(`前期から ${fmt(d)} 点の後退。理由を一つ挙げてみろ。言えないなら原因は気分だ。`);
    else              out.push(`前期から ${fmt(d)} 点の崩落。何かを諦めた3日だった。`);
  }

  out.push(pick([
    `格は ${ev.rank.l}「${ev.rank.n}」。${ev.rank.say}`,
    `${ev.rank.l}「${ev.rank.n}」で締める。`,
  ], seed));

  const nx = nextRank(ev.avg);
  if (nx) out.push(`${nx.l}「${nx.n}」まで平均で ${fmt(nx.at - ev.avg)} 点、3日の合計なら ${fmt((nx.at - ev.avg)*3)} 点の上積みだ。`);
  else    out.push('この上はない。守る側に回った。落ちたら言い訳はできない。');

  return out.join('\n');
}

/* ───────── 期の締めと石の払い出し ───────── */

/** 済んだ期を確定し、石を払う。起動時と記録の変更時に呼ぶ。 */
function settle(){
  const cur = currentCycle();
  const done = new Set(S.cycles.map(c => c.i));
  let got = 0, newCycles = [];

  for (let i = 0; i < cur; i++){
    const ev = evalCycle(i);
    if (done.has(i)){
      /* 既に締めた期も、あとから記録を足したら数字を直す */
      const rec = S.cycles.find(c => c.i === i);
      if (rec.avg !== Math.round(ev.avg)){
        rec.avg = Math.round(ev.avg);
        rec.rank = ev.rank.l;
        rec.missed = ev.missed;
      }
      continue;
    }
    S.cycles.push({
      i, from:ev.from, to:ev.to,
      avg: Math.round(ev.avg), rank: ev.rank.l, missed: ev.missed,
      verdict: cycleVerdict(ev),
    });
    /* 期の褒美 */
    const b = cycleBonus(ev);
    S.gacha.coin += b;
    got += b;
    newCycles.push(i);
  }
  S.cycles.sort((a,b) => b.i - a.i);

  /* 日ごとの石（済んだ日ぶんを一度だけ） */
  for (const d of loggedDays()){
    if (d >= today()) continue;                // 今日はまだ締めない
    if (S.meta.coinPaid[d]) continue;
    const n = Math.max(0, Math.round(sc(d).total / 10));
    S.gacha.coin += n;
    S.meta.coinPaid[d] = n;
    got += n;
  }

  if (got > 0) save();
  return { got, newCycles };
}

function cycleBonus(ev){
  const i = RANKS.indexOf(ev.rank);
  const base = [0, 10, 20, 35, 55, 80, 120, 180][i] || 0;
  return Math.max(0, base - ev.missed * 10);
}

/** 今の期の進み（締まっていない期） */
function liveCycle(){
  const ev = evalCycle(currentCycle());
  const left = ev.days.filter(d => d > today()).length;
  return Object.assign(ev, { left });
}

/* ───────── 自己最高 ───────── */

function bests(){
  const ds = loggedDays();
  const out = [];
  const push = (name, val, date, unit) => out.push({ name, val, date, unit });

  if (!ds.length) return out;

  /* 最高点の日 */
  let bd = ds[0], bv = -1e9;
  for (const d of ds){ const v = sc(d).total; if (v > bv){ bv = v; bd = d; } }
  push('一日の最高点', bv, bd, '点');

  /* 分類ごとの一日最高 */
  for (const c of CATS){
    if (c.rate < 0) continue;
    let m = 0, md = null;
    for (const d of ds){ const v = catMinutes(S.days[d])[c.id]; if (v > m){ m = v; md = d; } }
    if (m > 0) push(c.name + 'の最長', m, md, '分');
  }

  /* 最長連続記録 */
  let best = 0, run = 0, bEnd = null, prev = null;
  for (const d of ds){
    run = (prev && diffDays(prev, d) === 1) ? run+1 : 1;
    if (run > best){ best = run; bEnd = d; }
    prev = d;
  }
  push('最長連続記録', best, bEnd, '日');

  /* 期の最高平均 */
  if (S.cycles.length){
    const b = S.cycles.reduce((x,y) => y.avg > x.avg ? y : x);
    push('期の最高平均', b.avg, b.to, '点');
  }

  /* スクリーンタイムの最少（記録のある日の中で） */
  const stDays = ds.filter(d => stTotals(S.days[d]).apps.length);
  if (stDays.length){
    let lo = 1e9, ld = null;
    for (const d of stDays){ const v = stTotals(S.days[d]).total; if (v < lo){ lo = v; ld = d; } }
    push('画面の最少', lo, ld, '分');
  }

  /* 節制の最長連続 */
  for (const c of CHECKS){
    if (c.bad) continue;
    let bs = 0, r2 = 0, e2 = null, pv = null;
    for (const d of ds){
      const on = S.days[d].chk && S.days[d].chk[c.id];
      if (on && pv && diffDays(pv, d) === 1) r2++; else if (on) r2 = 1; else r2 = 0;
      if (r2 > bs){ bs = r2; e2 = d; }
      pv = d;
    }
    if (bs >= 2) push(c.name + 'の連続', bs, e2, '日');
  }

  /* 累計 */
  const all = statsFor(ds);
  const tot = sum(CATS.filter(c => c.rate > 0).map(c => all.mins[c.id]));
  push('積み上げた総時間', Math.round(tot/60), ds[ds.length-1], '時間');

  return out;
}

/** その自己最高が直近7日で出たものか */
function isFresh(b){
  return b.date && diffDays(b.date, today()) <= 7;
}

/* ───────── 対戦の符 ───────── */

function myCard(){
  const ds = loggedDays();
  const all = statsFor(ds);
  const cyc = S.cycles.slice(0, 10).map(c => c.avg);
  const live = liveCycle();
  const mh = masteryHours();
  const mr = overallMeasured();
  return {
    n: S.profile.name || '名無し',
    t: S.gacha.equipped || '',
    c: cyc,
    l: Math.round(live.avg),
    d: ds.length,
    s: ds.length ? streakAt(today()) || streakAt(shiftYmd(today(),-1)) : 0,
    m: Math.round(all.avg),
    h: all.max,
    g: Math.round(sum(CATS.filter(x => x.rate > 0).map(x => all.mins[x.id]))/60),
    k: kiwami(),                                        // 極み値
    e: Math.round(sum(Object.values(mh))),              // 実測した総時間
    v: mr === null ? 0 : Math.round(mr*100),            // 実測率（信用度）
    r: rankOf(live.avg).l,
    at: today(),
  };
}

/** 通算の実測率。符に載る信用度。 */
function overallMeasured(){
  let t = 0, all = 0;
  for (const d of Object.keys(S.days)){
    for (const a of (S.days[d].acts || [])){
      if (CAT[a.cat] && CAT[a.cat].rate < 0) continue;
      all += a.min || 0;
      if (a.src === 'timer') t += a.min || 0;
    }
  }
  return all ? t/all : null;
}

function encodeCard(c){
  const json = JSON.stringify(c);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return 'MG1.' + b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeCard(s){
  s = String(s).trim();
  if (!s.startsWith('MG1.')) throw new Error('形が違う');
  let b = s.slice(4).replace(/-/g,'+').replace(/_/g,'/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  const o = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof o !== 'object' || !o) throw new Error('中身が読めない');
  return o;
}

/** 自分と相手を並べた結果 */
function versus(){
  const me = myCard();
  const you = S.rival;
  if (!you) return null;
  const rows = [
    { k:'極み',       a:me.k, b:you.k ?? 0, unit:'' },
    { k:'実測した時間', a:me.e, b:you.e ?? 0, unit:'時間' },
    { k:'今期の平均', a:me.l, b:you.l ?? 0, unit:'点' },
    { k:'通算の平均', a:me.m, b:you.m ?? 0, unit:'点' },
    { k:'一日の最高', a:me.h, b:you.h ?? 0, unit:'点' },
    { k:'連続記録',   a:me.s, b:you.s ?? 0, unit:'日' },
  ];
  const win = rows.filter(r => r.a > r.b).length;
  const lose = rows.filter(r => r.a < r.b).length;
  let verdict;
  if (win > lose)      verdict = `${rows.length} 項目のうち ${win} 勝 ${lose} 敗。勝っているが、相手も記録を続けている。止まった瞬間に抜かれる。`;
  else if (win < lose) verdict = `${win} 勝 ${lose} 敗。負けている。相手が特別なのではない、お前が積んでいないだけだ。`;
  else                 verdict = `${win} 勝 ${lose} 敗の互角。互角で満足するなら、ここで止まる。`;
  const worst = rows.filter(r => r.a < r.b).sort((x,y) => (x.a-x.b) - (y.a-y.b))[0];
  if (worst) verdict += `\n一番離されているのは「${worst.k}」で ${fmt(worst.b - worst.a)}${worst.unit} の差だ。`;

  /* 信用度。実測率が低い符は、数字そのものが怪しい。 */
  const mv = me.v ?? 0, yv = you.v ?? 0;
  if (yv < 60 && (you.e ?? 0) >= 0) verdict += `\n相手の実測率は ${yv}%。残りは手で打った申告だ。この符の数字は、その分だけ割り引いて見ろ。`;
  if (mv < 60) verdict += `\nお前の実測率は ${mv}%。人の符を疑う前に、自分の数字を実測で埋めろ。`;
  return { me, you, rows, win, lose, verdict, mv, yv };
}
