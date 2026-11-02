/* ============================================================
   insight.js — 教官の眼
   「何が点を動かしているか」と「お前が強い日はどういう形か」を
   記録そのものから出す。思いつきでは言わない。
   ============================================================ */

/* ───────── 日ごとの特徴量 ───────── */

/** 起床時刻を分で（無ければ null） */
function wakeMin(o){
  const w = o.v && o.v.wake;
  if (!w) return null;
  const [h,m] = String(w).split(':').map(Number);
  if (isNaN(h)) return null;
  const st = S.profile.dayStart || 4;
  let v = h*60 + (m||0) - st*60;
  if (v < 0) v += 1440;
  return v;
}

/** その日の最初の実測が「一日の始まり」から何分後か */
function firstActMin(d){
  const c = dayCurve(d);
  if (!c.segs || !c.segs.length) return null;
  return Math.min(...c.segs.map(s => s.s));
}

/** その日、最初に手を付けた分類 */
function firstActCat(d){
  const c = dayCurve(d);
  if (!c.segs || !c.segs.length) return null;
  return c.segs.slice().sort((a,b) => a.s - b.s)[0].cat;
}

/** 一日の特徴をまとめて取り出す */
function featuresOf(d){
  const o = S.days[d];
  if (!hasAny(o)) return null;
  const m = catMinutes(o);
  const st = stTotals(o);
  const r = sc(d);
  const td = o.todos || [];
  const w = sum(td.map(t => t.w||1));
  return {
    d,
    score: r.total,
    sleep: (o.v && o.v.sleep > 0) ? Number(o.v.sleep) : null,
    wake: wakeMin(o),
    screen: st.apps.length ? st.total : null,
    waste: m.waste,
    train: m.train, study: m.study, work: m.work,
    read: m.read, groom: m.groom, social: m.social,
    measured: measuredRate(o),
    todo: w ? sum(td.filter(t => t.done).map(t => t.w||1))/w : null,
    temper: CHECKS.filter(c => !c.bad && o.chk && o.chk[c.id]).length,
    first: firstActMin(d),
    firstCat: firstActCat(d),
  };
}

function allFeatures(){
  return loggedDays().map(featuresOf).filter(Boolean);
}

/* ───────── 効いている順 ───────── */

const FACTORS = [
  /* 名前は「大きいほどどうなるか」で付ける。起床は遅いほど値が大きいので「遅さ」。 */
  { k:'sleep',    n:'睡眠',        u:'分',  good:1 },
  { k:'wake',     n:'起床の遅さ',  u:'分',  good:-1 },
  { k:'screen',   n:'画面時間',    u:'分',  good:-1 },
  { k:'waste',    n:'だらだら',    u:'分',  good:-1 },
  { k:'measured', n:'実測率',      u:'',    good:1,  pct:true },
  { k:'first',    n:'腰の重さ',    u:'分',  good:-1, cap:true },
  { k:'train',    n:'鍛錬',        u:'分',  good:1 },
  { k:'study',    n:'学習',        u:'分',  good:1 },
  { k:'work',     n:'仕事',        u:'分',  good:1 },
  { k:'read',     n:'読書',        u:'分',  good:1 },
  { k:'social',   n:'対人',        u:'分',  good:1 },
  { k:'temper',   n:'節制の数',    u:'個',  good:1 },
  { k:'todo',     n:'やる事の完了率', u:'', good:1, pct:true },
];

/**
 * 各要因と点の関係。相関であって因果ではない、と必ず添える。
 * 返す: [{f, r, n, slope, swing}] 効いている順
 */
function weights(){
  const F = allFeatures();
  /* 一要因が、点の散らばり全体より大きく効くはずがない。そこで頭を押さえる。 */
  const ss = F.map(x => x.score).sort((a,b) => a-b);
  const sq = p => ss.length ? ss[clamp(Math.round((ss.length-1)*p),0,ss.length-1)] : 0;
  const cap = Math.max(1, sq(0.9) - sq(0.1));
  const out = [];
  for (const f of FACTORS){
    const pairs = F.filter(x => x[f.k] !== null && x[f.k] !== undefined && !isNaN(x[f.k]));
    if (pairs.length < 6) continue;
    const xs = pairs.map(x => x[f.k]), ys = pairs.map(x => x.score);
    const r = pearson(xs, ys);
    if (r === null) continue;
    const line = fitXY(xs.map((v,i) => [v, ys[i]]));
    const srt = xs.slice().sort((a,b) => a-b);
    const q = p => srt[clamp(Math.round((srt.length-1)*p), 0, srt.length-1)];
    let swing = line.b * (q(0.9) - q(0.1));       // 上位1割と下位1割で何点違うか
    swing = clamp(swing, -cap, cap);
    out.push({ f, r, n:pairs.length, slope:line.b, swing, lo:q(0.1), hi:q(0.9), mean:avg(xs) });
  }
  out.sort((a,b) => Math.abs(b.r) - Math.abs(a.r));
  return out.slice(0, 8);
}

/* ───────── 良い日の型 ───────── */

const SHAPE = [
  { k:'wake',     n:'起床',         f:v => clock(v), better:'early' },
  { k:'first',    n:'最初の一本まで', f:v => hm(v),   better:'early' },
  { k:'sleep',    n:'睡眠',         f:v => hm(v),    better:'more' },
  { k:'screen',   n:'画面',         f:v => fmt(v)+' 分', better:'less' },
  { k:'waste',    n:'だらだら',     f:v => fmt(v)+' 分', better:'less' },
  { k:'measured', n:'実測率',       f:v => Math.round(v*100)+'%', better:'more' },
  { k:'train',    n:'鍛錬',         f:v => fmt(v)+' 分', better:'more' },
  { k:'study',    n:'学習',         f:v => fmt(v)+' 分', better:'more' },
  { k:'temper',   n:'節制',         f:v => fmt(v,1)+' 個', better:'more' },
];

/** 「一日の始まり」からの分を時刻に戻す */
function clock(m){
  const st = S.profile.dayStart || 4;
  const t = (st*60 + m) % 1440;
  return String(Math.floor(t/60)).padStart(2,'0') + ':' + String(Math.round(t%60)).padStart(2,'0');
}

/**
 * 上位3分の1と下位3分の1を比べる。
 * 返す: { n, hi, lo, rows:[{name, hiV, loV, gap, better}], firstCat }
 */
function goodShape(){
  const F = allFeatures().filter(x => x.score !== null);
  if (F.length < 6) return { thin:true, n:F.length };
  const srt = F.slice().sort((a,b) => b.score - a.score);
  const k = Math.max(2, Math.floor(F.length/3));
  const hi = srt.slice(0, k), lo = srt.slice(-k);

  const rows = [];
  for (const s of SHAPE){
    const hv = hi.map(x => x[s.k]).filter(v => v !== null && v !== undefined && !isNaN(v));
    const lv = lo.map(x => x[s.k]).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (hv.length < 2 || lv.length < 2) continue;
    const a = avg(hv), b = avg(lv);
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-6);
    const gap = Math.abs(a-b) / scale;
    if (gap < 0.12) continue;                  // 差が無い物は出さない
    rows.push({ name:s.n, hiV:s.f(a), loV:s.f(b), raw:a, rawLo:b, gap, better:s.better, k:s.k });
  }
  rows.sort((a,b) => b.gap - a.gap);

  /* 良い日に最初に手を付けている分類 */
  const fc = {};
  for (const x of hi) if (x.firstCat) fc[x.firstCat] = (fc[x.firstCat]||0)+1;
  const top = Object.entries(fc).sort((a,b) => b[1]-a[1])[0];

  return {
    n: F.length, k,
    hiAvg: avg(hi.map(x => x.score)), loAvg: avg(lo.map(x => x.score)),
    rows: rows.slice(0, 7),
    firstCat: top ? { cat:top[0], n:top[1], of:hi.length } : null,
  };
}

/* ───────── 作戦 ───────── */

/** 次の3日（今の期の残り＋次の期の頭） */
function planDays(){
  const t = today();
  const live = liveCycle();
  const rest = live.days.filter(d => d >= t);
  const out = rest.slice(0, 3);
  let d = live.days[2];
  while (out.length < 3){ d = shiftYmd(d, 1); out.push(d); }
  return out;
}

/**
 * 記録から次の3日を組む。鍵が無くてもここまでは出る。
 * 一度に変えるのは1つ。並べ立てても人は動かない。
 */
function buildPlan(){
  const t = today();
  const days = planDays();
  const F = analyze();
  const sh = goodShape();
  const W = weights();
  const M = mast();
  const s7 = statsFor(lastDays(7));

  /* ── この3日で変える一点 ── */
  const top = F.find(x => x.sev >= 2) || F[0];
  const aim = top ? top.title : '形を崩さない';
  const why = top ? top.text : '大きな穴は無い。今の形を3日そのまま写す。';

  /* ── 段位が一番近い分類。ここを突く。 ── */
  const near = Object.entries(M).filter(([k,v]) => v.next)
    .sort((a,b) => a[1].toNext - b[1].toNext)[0];

  /* ── 良い日の型から1つ ── */
  const shapeRow = sh.rows && sh.rows[0];

  const items = [];
  const mk = (text, cat, min) => ({ id: uid(), text, cat: cat||null, min: min||0, done:false });

  /* 1日目：穴を塞ぐ */
  const d0 = [];
  if (top && top.fix){
    /* 直し方の一文目だけを指示にする。長い指示は読まれない。 */
    const one = top.fix.replace(/^→\s*/,'').split('。')[0] + '。';
    d0.push(mk(one.slice(0,60), null, 0));
  }
  if (near){
    const [cid, mv] = near;
    const per = Math.max(20, Math.round(mv.toNext*60/3));
    d0.push(mk(`${CAT[cid].name}をタイマーで ${per} 分。${mv.next.n} まで実測 ${fmt(mv.toNext,1)} 時間`, cid, per));
  }
  if (sh.firstCat) d0.push(mk(`一本目は ${CAT[sh.firstCat.cat].name} から。強い日の ${sh.firstCat.n}/${sh.firstCat.of} はそうしている`, sh.firstCat.cat, 0));

  /* 2日目：型をなぞる */
  const d1 = [];
  if (shapeRow){
    const dir = shapeRow.better === 'early' ? '前に倒す' : shapeRow.better === 'less' ? '減らす' : '増やす';
    d1.push(mk(`${shapeRow.name}を ${shapeRow.hiV} に寄せる（弱い日は ${shapeRow.loV}）。${dir}`, null, 0));
  }
  if (near){
    const [cid, mv] = near;
    const per = Math.max(20, Math.round(mv.toNext*60/3));
    d1.push(mk(`${CAT[cid].name}をタイマーで ${per} 分。2本目`, cid, per));
  }
  /* 減らせば効く物のうち、数で言い切れる物だけ指示にする */
  const worstW = W.find(x => (x.f.k === 'screen' || x.f.k === 'waste') && x.swing < -15);
  if (worstW) d1.push(mk(`${worstW.f.n}を ${fmt(worstW.lo)} 分以下に抑える（いつもは ${fmt(worstW.mean)} 分）`, null, 0));

  /* 3日目：締める */
  const d2 = [];
  if (near){
    const [cid, mv] = near;
    const per = Math.max(20, Math.round(mv.toNext*60/3));
    d2.push(mk(`${CAT[cid].name}をタイマーで ${per} 分。これで ${mv.next.n} に届く`, cid, per));
  }
  d2.push(mk('白紙を作らない。寝る前に必ず一行入れる', null, 0));
  d2.push(mk(`実測率 ${Math.round((overallMeasured()||0)*100)}% を上げる。この3日は手打ちを一度も使わない`, null, 0));

  const groups = [d0, d1, d2];
  const plan = {
    by: '内蔵',
    madeAt: new Date().toISOString(),
    from: days[0], to: days[2],
    aim, why,
    note: planNote(top, near, s7),
    days: days.map((d,i) => ({ d, items: groups[i].filter(Boolean).slice(0,3) })),
  };
  return plan;
}

function planNote(top, near, s7){
  const L = [];
  L.push(`この3日で変えるのは一つだけだ。${top ? '「'+top.title+'」' : '形の維持'}。`);
  L.push('並べ立てた計画は必ず崩れる。崩れるのは意志が弱いからではなく、一度に多く変えたからだ。');
  if (near) L.push(`同時に、${CAT[near[0]].name}の段位を ${near[1].next.n} まで上げる。倍率が ${near[1].next.m.toFixed(2)} になれば、同じ1分の価値が変わる。`);
  L.push(`直近7日の平均は ${fmt(s7.avg)} 点。3日後にこれを上回っていなければ、この作戦は失敗だ。`);
  return L.join('\n');
}

function savePlan(p){
  S.plan = p;
  save();
}
function clearPlan(){
  S.plan = null;
  save();
}
/** 今の作戦は生きているか */
function planLive(){
  const p = S.plan;
  if (!p || !p.days || !p.days.length) return null;
  if (p.to < today()) return null;
  return p;
}
/** 作戦の進み */
function planProgress(){
  const p = planLive();
  if (!p) return null;
  let all = 0, done = 0;
  for (const g of p.days){
    for (const it of g.items){
      all++;
      if ((day(g.d).plan || []).includes(it.id)) done++;
    }
  }
  return { all, done, rate: all ? done/all : 0 };
}
/** 作戦の項目を切り替える */
function togglePlanItem(d, id){
  const o = dayRW(d);
  if (!o.plan) o.plan = [];
  const i = o.plan.indexOf(id);
  if (i >= 0){ o.plan.splice(i,1); return false; }
  o.plan.push(id);
  return true;
}
/** 済ませた作戦の加点 */
function planBonus(d){
  const p = S.plan;
  if (!p) return 0;
  const g = p.days.find(x => x.d === d);
  if (!g) return 0;
  const done = day(d).plan || [];
  return sum(g.items.filter(it => done.includes(it.id)).map(it => 10 + Math.round((it.min||0)/12)));
}
