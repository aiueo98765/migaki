/* ============================================================
   score.js — 採点
   一日を点数に落とす。甘くはしない。
   目標に届かない分はきちんと引く。
   ============================================================ */

/* 厳しさの段。未達ペナルティと浪費の効き方が変わる。 */
const HARD = [
  { name:'普通',   short:0.35, waste:0.9, st:0.6 },
  { name:'厳しい', short:0.60, waste:1.3, st:1.0 },
  { name:'鬼',     short:0.95, waste:1.8, st:1.5 },
];

function hardness(){ return HARD[clamp(S.profile.hard|0, 0, 2)]; }

/* 内訳の呼び名 */
const PART_NAMES = {
  build:'積み上げ', kiwami:'極み', short:'未達', waste:'浪費', screen:'画面',
  sleep:'睡眠', temper:'節制', todo:'やる事', mission:'修行札', plan:'作戦',
};

/** 分類ごとの合計分 */
function catMinutes(o){
  const m = {};
  for (const c of CATS) m[c.id] = 0;
  for (const a of (o.acts || [])) if (m[a.cat] !== undefined) m[a.cat] += (a.min || 0);
  return m;
}

/** スクリーンタイムの合計分と、無目的消費の分 */
function stTotals(o){
  const apps = (o.st && o.st.apps) || [];
  let total = 0, junk = 0;
  for (const a of apps){
    total += a.min || 0;
    if (ST_JUNK.includes(a.name)) junk += a.min || 0;
  }
  return { total, junk, apps };
}

/**
 * 一日の採点。
 * 返す形:
 *  { total, parts:{積み上げ,未達,浪費,画面,睡眠,節制,やる事,連続}, cats:{id:{min,goal,pt}}, empty }
 */
function scoreDay(d){
  const o = S.days[d];
  const H = hardness();
  const g = S.profile.goals;
  const empty = !hasAny(o);
  const r = {
    total: 0, empty,
    parts: { build:0, kiwami:0, short:0, waste:0, screen:0, sleep:0, temper:0, todo:0, mission:0, plan:0 },
    cats: {},
  };
  if (empty) return r;

  const mins = catMinutes(o);
  const split = catSplit(o);
  const M = mast();

  /* ── 積み上げと未達 ──
     点になるのは実測。手で打った分は MANUAL_RATE しか通らない。
     段位と連続は倍率として後から乗せる。極めるほど同じ1分が重くなる。 */
  let base = 0, boosted = 0;
  for (const c of CATS){
    const x = split[c.id];
    const goal = Math.max(0, g[c.id] ?? c.goal);
    let pt;
    if (c.rate < 0){
      /* 浪費は申告でも割り引かない。引かれる側を自己申告で軽くできたら意味がない。 */
      pt = x.raw * c.rate * H.waste;
      r.parts.waste += pt;
      r.cats[c.id] = { min:x.raw, eff:x.raw, goal, pt, timer:x.timer, manual:x.manual };
      continue;
    }
    const eff = effMin(x);
    /* 目標の1.5倍を超えた分も6割は通る。極める人間を頭打ちにしない。 */
    const cap = goal * 1.5 || 60;
    const e2 = Math.min(eff, cap) + Math.max(0, eff - cap) * 0.6;
    const raw = e2 * c.rate;
    base    += raw;
    boosted += raw * (M[c.id] ? M[c.id].mul : 1);
    pt = raw;
    /* 未達は引く。目標0のものは引かない */
    if (goal > 0 && eff < goal){
      const s = -(goal - eff) * c.rate * H.short;
      r.parts.short += s;
      pt += s;
    }
    r.cats[c.id] = { min:x.raw, eff, goal, pt, timer:x.timer, manual:x.manual, away:x.away };
  }
  const sm = streakMul(d);
  r.parts.build  = base;
  r.parts.kiwami = boosted * sm - base;     // 段位と連続で増えた分
  r.mul = { streak: sm, kiwami: base ? boosted/base : 1 };

  /* ── スクリーンタイム ── */
  const st = stTotals(o);
  const lim = Math.max(0, S.profile.stLimit || 0);
  if (st.apps.length){
    const over = Math.max(0, st.total - lim);
    /* 「だらだら」で既に引いた分は画面から二重に引かない。
       X を眺めた時間を浪費にも書いていたら、同じ時間を二度罰する事になる。 */
    const already = Math.min(over, mins.waste);
    const net = over - already;
    /* 上限内でも無目的消費は少し引く。超えた分は本気で引く。 */
    r.parts.screen = -(net * 1.1 * H.st) - (Math.min(st.junk, lim) * 0.18 * H.st);
    /* 上限の半分で収めたら褒美 */
    if (st.total <= lim * 0.5) r.parts.screen += 12;
    r.stDouble = already;
  }
  r.st = st;

  /* ── 睡眠 ── */
  const sl = Number(o.v && o.v.sleep);
  if (sl > 0){
    const goal = S.profile.sleepGoal || 420;
    if (sl < goal)           r.parts.sleep = -(goal - sl) * 0.09;
    else if (sl > goal + 90) r.parts.sleep = -(sl - goal - 90) * 0.07;
    else                     r.parts.sleep = 10;
    /* 目標起床より早ければ加点 */
    const w = o.v.wake, wg = S.profile.wakeGoal;
    if (w && wg){
      const mi = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
      const dw = mi(wg) - mi(w);
      r.parts.sleep += clamp(dw * 0.12, -16, 16);
    }
  }

  /* ── 節制 ── */
  for (const c of CHECKS){
    if (o.chk && o.chk[c.id]) r.parts.temper += c.pt;
  }

  /* ── やる事 ── */
  const td = (o.todos || []);
  if (td.length){
    const w  = sum(td.map(t => t.w || 1));
    const dw = sum(td.filter(t => t.done).map(t => t.w || 1));
    const rate = w ? dw / w : 0;
    /* 8割できて±0。全部なら加点、半分なら減点。 */
    r.parts.todo = (rate - 0.8) * 55;
    /* 持ち越し（前から居座っているやる事）は重く引く */
    const stale = td.filter(t => !t.done && (t.carry || 0) >= 2).length;
    r.parts.todo -= stale * 7;
    r.todoRate = rate;
  }

  /* ── 済ませた修行札と作戦 ── */
  r.parts.mission = missionBonus(d);
  r.parts.plan = planBonus(d);

  r.measured = measuredRate(o);
  r.total = Math.round(sum(Object.values(r.parts)));
  return r;
}

/** d で終わる連続記録日数（d を含む） */
function streakAt(d){
  let n = 0, c = d;
  while (hasAny(S.days[c])){ n++; c = shiftYmd(c, -1); if (n > 400) break; }
  return n;
}

/* ── 点数の読み（キャッシュつき。記録が変われば捨てる） ── */
let _sc = new Map();
function sc(d){
  if (_sc.has(d)) return _sc.get(d);
  const v = scoreDay(d);
  _sc.set(d, v);
  return v;
}
function dropScoreCache(d){
  if (d) _sc.delete(d); else _sc.clear();
}

/* ───────── 点数の見え方 ───────── */

/* k は CSS の級。上の帯の .top と当たらない名前にしてある。 */
function scoreTier(n){
  if (n < 0)   return { k:'neg',  w:'赤字' };
  if (n < 120) return { k:'mid',  w:'並以下' };
  if (n < 260) return { k:'good', w:'上' };
  return { k:'best', w:'別格' };
}

/** 一日の評。短く、容赦なく。 */
function dayVerdict(d){
  const r = sc(d);
  if (r.empty) return '何も記録がない。やらなかったのか、記録すらしなかったのか。どちらも同じだ。';

  const p = r.parts;
  const worst = Object.entries(p)
    .filter(([k,v]) => v < 0)
    .sort((a,b) => a[1] - b[1])[0];
  const names = PART_NAMES;
  const seed = d + ':' + r.total;

  if (r.total < 0){
    const lines = [
      '引いた方が多い一日だ。生きていただけで、前には進んでいない。',
      '収支が赤だ。今日のお前は、昨日のお前から借金しただけだ。',
      'これを一年続ければどうなるか、計算しなくても分かるだろう。',
    ];
    let s = pick(lines, seed);
    if (worst) s += `最も食われたのは「${names[worst[0]]}」で ${fmt(worst[1])} 点。`;
    return s;
  }
  if (r.total < 120){
    const lines = [
      '動いてはいる。だが「やった」と言える量ではない。',
      '平均的だ。平均的な男は平均的な人生を送る。',
      '及第点すら怪しい。足りないのは根性ではなく時間の置き場だ。',
    ];
    let s = pick(lines, seed);
    if (worst) s += `「${names[worst[0]]}」で ${fmt(worst[1])} 点落としている。`;
    return s;
  }
  if (r.total < 260){
    const lines = [
      '良い。だがこの水準を三日続けて初めて意味を持つ。',
      '積めている。問題は明日も同じ事ができるかだ。',
      '合格だ。喜ぶのは三日後にしろ。',
    ];
    let s = pick(lines, seed);
    if (worst && worst[1] < -20) s += `ただし「${names[worst[0]]}」は見逃さない。${fmt(worst[1])} 点だ。`;
    return s;
  }
  const lines = [
    '文句なしだ。この日を基準にしろ。これより下は後退だと思え。',
    '上出来。ここまでやれる男が、なぜ毎日やらないのか。',
    '今日のお前は強い。だが強さは習慣の別名だ。',
  ];
  return pick(lines, seed);
}

/* ───────── まとめた数字 ───────── */

/** 期間の統計。days は ymd の配列。 */
function statsFor(days){
  const have = days.filter(d => hasAny(S.days[d]));
  const scores = have.map(d => sc(d).total);
  const mins = {};
  for (const c of CATS) mins[c.id] = 0;
  let stTotal = 0, stDays = 0, sleep = [], todoR = [], chk = {};
  for (const c of CHECKS) chk[c.id] = 0;

  for (const d of have){
    const o = S.days[d];
    const m = catMinutes(o);
    for (const c of CATS) mins[c.id] += m[c.id];
    const st = stTotals(o);
    if (st.apps.length){ stTotal += st.total; stDays++; }
    if (o.v && o.v.sleep > 0) sleep.push(Number(o.v.sleep));
    const r = sc(d);
    if (r.todoRate !== undefined) todoR.push(r.todoRate);
    for (const c of CHECKS) if (o.chk && o.chk[c.id]) chk[c.id]++;
  }
  return {
    days: days.length, logged: have.length,
    avg: avg(scores), total: sum(scores),
    max: scores.length ? Math.max(...scores) : 0,
    min: scores.length ? Math.min(...scores) : 0,
    mins, stAvg: stDays ? stTotal/stDays : 0, stDays,
    sleepAvg: avg(sleep), todoRate: avg(todoR), chk,
    scores, list: have,
  };
}
