/* ============================================================
   ai.js — 鬼教官の頭
   記録から傾向を暴き、このままの未来を描き、質問に答える。
   鍵がなくても全部動く。鍵を入れたときだけ本物の Claude に繋ぐ。
   ============================================================ */

/* ───────── 相関（傾きを見るだけ。因果とは言わない） ───────── */

function pearson(xs, ys){
  const n = Math.min(xs.length, ys.length);
  if (n < 4) return null;
  const mx = avg(xs.slice(0,n)), my = avg(ys.slice(0,n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++){
    const a = xs[i]-mx, b = ys[i]-my;
    sxy += a*b; sxx += a*a; syy += b*b;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx*syy);
}

/** 最小二乗の直線 y = a + b x（点を [x,y] で渡す） */
function fitXY(pts){
  const n = pts.length;
  if (n < 3) return { a: n ? avg(pts.map(p => p[1])) : 0, b: 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [px, py] of pts){ sx += px; sy += py; sxy += px*py; sxx += px*px; }
  const d = n*sxx - sx*sx;
  if (!d) return { a: avg(pts.map(p => p[1])), b: 0 };
  const b = (n*sxy - sx*sy) / d;
  return { a: (sy - b*sx)/n, b };
}

/** 等間隔に並んだ値の最小二乗 */
function fitLine(ys){
  const n = ys.length;
  if (n < 3) return { a: avg(ys), b: 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++){ sx += i; sy += ys[i]; sxy += i*ys[i]; sxx += i*i; }
  const d = n*sxx - sx*sx;
  if (!d) return { a: avg(ys), b: 0 };
  const b = (n*sxy - sx*sy) / d;
  return { a: (sy - b*sx)/n, b };
}

/* ───────── 分析 ───────── */

/**
 * 記録を洗って気になる点を出す。
 * sev: 3 致命 / 2 注意 / 1 情報 / 0 良い
 */
function analyze(){
  const F = [];
  const ds = loggedDays();
  if (ds.length < 2){
    F.push({ id:'cold', sev:1, title:'材料が足りない',
      text:'記録が ' + ds.length + ' 日しかない。分析は3日分からまともに動く。言い当てられたくないなら、このまま記録しなければいい。',
      fix:'今日の活動を2つ、やる事を3つ入れるだけでいい。それで最初の裁定が出る。' });
    return F;
  }

  const L14 = lastDays(14), L7 = lastDays(7), P7 = lastDays(7, shiftYmd(today(),-7));
  const s14 = statsFor(L14), s7 = statsFor(L7), p7 = statsFor(P7);
  const g = S.profile.goals;

  /* ── 1. 失速・加速 ── */
  if (s7.logged >= 3 && p7.logged >= 3){
    const d = s7.avg - p7.avg;
    if (d <= -40) F.push({ id:'fall', sev:3, title:'落ちている',
      text:`直近7日の平均は ${fmt(s7.avg)} 点。その前の7日は ${fmt(p7.avg)} 点。${fmt(-d)} 点落ちた。これは調子の波ではなく、基準を下げた結果だ。`,
      fix:'落ちた分類を一つだけ戻せ。全部やろうとして全部やらないのが毎回の負け筋だ。' });
    else if (d <= -15) F.push({ id:'fall2', sev:2, title:'じり貧',
      text:`7日平均が ${fmt(p7.avg)} 点 → ${fmt(s7.avg)} 点。緩やかに下がっている。急落より厄介だ、気づかないまま3ヶ月進む。`,
      fix:'一番楽な習慣を一つ、時間を決めて固定しろ。' });
    else if (d >= 40) F.push({ id:'rise', sev:0, title:'伸びている',
      text:`7日平均が ${fmt(p7.avg)} 点 → ${fmt(s7.avg)} 点。${fmt(d)} 点の上昇だ。ここで気を抜く人間が大半だという事だけ覚えておけ。`,
      fix:'今の生活の形をそのまま明日に写せ。新しい事を足すのはまだ早い。' });
  }

  /* ── 1.5 実測率 ── */
  {
    const mr = overallMeasured();
    const mr7 = (() => {
      let t = 0, all = 0;
      for (const d of L7){
        for (const a of (day(d).acts || [])){
          if (CAT[a.cat] && CAT[a.cat].rate < 0) continue;
          all += a.min || 0;
          if (a.src === 'timer') t += a.min || 0;
        }
      }
      return all ? t/all : null;
    })();
    if (mr !== null && mr < 0.4) F.push({ id:'measure', sev:3, title:'ほとんど申告で埋めている',
      text:`通算の実測率は ${Math.round(mr*100)}%。残りは後から手で打った数字だ。申告は点が半分になるだけでなく、段位にも積まれない。`
         + `つまり今のやり方では、どれだけ書いても強くならない。`,
      fix:'次の一回だけでいい。やる前にタイマーを押せ。終わってから思い出して書くのをやめるだけで、同じ時間が倍の点になる。' });
    else if (mr !== null && mr < 0.75) F.push({ id:'measure2', sev:2, title:'申告が混じっている',
      text:`通算の実測率 ${Math.round(mr*100)}%`
         + (mr7 !== null ? `、直近7日は ${Math.round(mr7*100)}%` : '')
         + '。申告の分は半分しか通らず、段位にも積まれない。符にも信用度として載るので、相手にも見えている。',
      fix:'決まってやる事（朝の鍛錬など）だけでも、先にタイマーを押す形にしろ。' });
    else if (mr !== null && mr >= 0.9) F.push({ id:'measuregood', sev:0, title:'数字が実測で埋まっている',
      text:`実測率 ${Math.round(mr*100)}%。この記録は後から作った物ではない。符の数字も、そのまま信じていい。`,
      fix:'実測した時間だけが段位に積まれる。今の積み方なら段位は上がり続ける。' });
  }

  /* ── 2. 曜日の穴 ── */
  if (ds.length >= 10){
    const byDow = Array.from({length:7}, () => []);
    for (const d of ds) byDow[dowOf(d)].push(sc(d).total);
    const ok = byDow.map((a,i) => ({ i, n:a.length, m:avg(a) })).filter(x => x.n >= 2);
    if (ok.length >= 4){
      const lo = ok.reduce((a,b) => b.m < a.m ? b : a);
      const hi = ok.reduce((a,b) => b.m > a.m ? b : a);
      if (hi.m - lo.m >= 60) F.push({ id:'dow', sev:2, title:DOW[lo.i] + '曜に崩れる',
        text:`${DOW[lo.i]}曜の平均は ${fmt(lo.m)} 点。最も強い${DOW[hi.i]}曜は ${fmt(hi.m)} 点で、差は ${fmt(hi.m-lo.m)} 点ある。${lo.n} 回の${DOW[lo.i]}曜で毎回これなら、気分ではなく予定の問題だ。`,
        fix:`${DOW[lo.i]}曜の課業を半分に減らして、代わりに必ず終わる形にしろ。ゼロの日を作らない方が効く。` });
    }
  }

  /* ── 3. 画面と積み上げ ── */
  const stDays = L14.filter(d => hasAny(S.days[d]) && stTotals(S.days[d]).apps.length);
  if (stDays.length >= 5){
    const xs = stDays.map(d => stTotals(S.days[d]).total);
    const ys = stDays.map(d => sc(d).parts.build);
    const r = pearson(xs, ys);
    const over = stDays.filter(d => stTotals(S.days[d]).total > S.profile.stLimit).length;
    if (r !== null && r <= -0.4) F.push({ id:'stcorr', sev:3, title:'画面が時間を食っている',
      text:`画面時間が長い日ほど積み上げが落ちている（相関 ${r.toFixed(2)}、${stDays.length} 日分）。平均 ${fmt(avg(xs))} 分を画面に出している。これは1年で ${fmt(avg(xs)*365/60)} 時間だ。`,
      fix:'一番長いアプリを1つ、就寝前だけ触る形に移せ。消す必要はない、置き場を変えるだけだ。' });
    else if (over >= Math.ceil(stDays.length*0.6)) F.push({ id:'stover', sev:2, title:'上限を守れていない',
      text:`画面の上限は ${S.profile.stLimit} 分だが、記録した ${stDays.length} 日のうち ${over} 日で超えた。上限は守る物で、眺める物ではない。`,
      fix:'上限を現実に合わせて上げ、そこから毎期10分ずつ下げろ。守れない数字は数字として機能しない。' });
    else if (avg(xs) <= S.profile.stLimit*0.7) F.push({ id:'stgood', sev:0, title:'画面は抑えられている',
      text:`画面の平均は ${fmt(avg(xs))} 分で上限の ${Math.round(avg(xs)/Math.max(1,S.profile.stLimit)*100)}% だ。ここは崩れていない。`,
      fix:'空いた時間が何に向かっているか見ろ。減らしただけで積んでいないなら意味は半分だ。' });
  }else if (stDays.length === 0){
    F.push({ id:'stnone', sev:2, title:'画面時間を記録していない',
      text:'スクリーンタイムが一日も入っていない。見たくない数字を見ないのは、一番安い逃げ方だ。',
      fix:'スマホの設定からスクリーンタイム（Android なら Digital Wellbeing）を開いて、上位3つを写すだけ。15秒で終わる。' });
  }

  /* ── 4. 睡眠と翌日 ── */
  const pairs = [];
  for (const d of ds){
    const nx = shiftYmd(d, 1);
    const sl = S.days[d].v && Number(S.days[d].v.sleep);
    if (sl > 0 && hasAny(S.days[nx])) pairs.push([sl, sc(nx).total]);
  }
  if (pairs.length >= 5){
    const r = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
    const m = avg(pairs.map(p => p[0]));
    if (r !== null && r >= 0.4) F.push({ id:'sleep', sev:2, title:'睡眠が翌日を決めている',
      text:`睡眠が長い日の翌日ほど点が高い（相関 ${r.toFixed(2)}、${pairs.length} 組）。平均睡眠は ${hm(m)}。根性の問題だと思っていた日の半分は、寝不足だ。`,
      fix:`就寝時刻を一つ決めて、そこだけ守れ。起床は後からついてくる。目標は ${hm(S.profile.sleepGoal)}。` });
    else if (m < S.profile.sleepGoal - 45) F.push({ id:'sleepshort', sev:2, title:'単純に寝ていない',
      text:`平均睡眠 ${hm(m)}。目標は ${hm(S.profile.sleepGoal)} で、毎日 ${hm(S.profile.sleepGoal-m)} 足りない。削った時間で何かを得ているなら構わないが、記録はそう言っていない。`,
      fix:'夜に足すのをやめて朝に移せ。同じ量なら朝の方が取り返しがつく。' });
  }

  /* ── 5. 放置されている分類 ── */
  const gaps = CATS.filter(c => c.rate > 0 && (g[c.id] ?? c.goal) > 0).map(c => {
    const goal = (g[c.id] ?? c.goal) * Math.max(1, s14.logged);
    return { c, got: s14.mins[c.id], goal, rate: goal ? s14.mins[c.id]/goal : 1 };
  }).sort((a,b) => a.rate - b.rate);
  if (gaps.length && s14.logged >= 3){
    const w = gaps[0];
    if (w.rate < 0.3) F.push({ id:'gap', sev:3, title:w.c.name + 'を捨てている',
      text:`14日で「${w.c.name}」は ${hm(w.got)}。目標なら ${hm(w.goal)} のはずだ。達成率 ${Math.round(w.rate*100)}%。捨てる判断なら目標から外せ。残したまま触らないのが一番の毒だ。`,
      fix:`${w.c.name}を1日 ${Math.max(10, Math.round((g[w.c.id] ?? w.c.goal)/3))} 分まで下げて、毎日やる形にしろ。` });
    else if (w.rate < 0.6) F.push({ id:'gap2', sev:2, title:w.c.name + 'が薄い',
      text:`14日の「${w.c.name}」は達成率 ${Math.round(w.rate*100)}%（${hm(w.got)} / ${hm(w.goal)}）。他は回っているのにここだけ落ちている。`,
      fix:`${w.c.name}を一番強い曜日に寄せろ。毎日やらなくても、週に3回あれば形になる。` });
    const b = gaps[gaps.length-1];
    if (b.rate > 1.4 && gaps.length > 1) F.push({ id:'skew', sev:1, title:b.c.name + 'に偏っている',
      text:`「${b.c.name}」は目標の ${Math.round(b.rate*100)}% まで積んでいる。得意な事を伸ばすのは悪くないが、点を稼いでいるのは1本の柱だけだ。それが折れた期に全部落ちる。`,
      fix:`${b.c.name}を10分削って、一番薄い「${gaps[0].c.name}」に回せ。合計は変わらないのに点は上がる。` });
  }

  /* ── 6. 先延ばし ── */
  const stale = [];
  for (const d of L14){
    for (const t of (day(d).todos || [])) if (!t.done && (t.carry||0) >= 2) stale.push(t);
  }
  const names = [...new Set(stale.map(t => t.text))];
  if (names.length){
    F.push({ id:'stale', sev:3, title:'居座っているやる事がある',
      text:`${names.length} 件が3日以上そのままだ。${names.slice(0,3).map(n => '「'+n+'」').join('、')}${names.length>3 ? ' ほか' : ''}。やりたくないのではなく、大きすぎて始められないだけだ。`,
      fix:`${names[0]}を「15分で終わる最初の一手」に書き換えろ。終わらない物は、分け方が間違っている。` });
  }

  /* ── 7. 記録の穴 ── */
  const holes = L14.filter(d => d < today() && d >= cycleStart() && !hasAny(S.days[d])).length;
  if (holes >= 6) F.push({ id:'hole', sev:3, title:'記録が続いていない',
    text:`直近14日のうち ${holes} 日が白紙だ。期の判定では白紙は ${missPenalty()} 点として数える。やっていない日より、記録しない日の方が点が低い理由が分かるか。見えない日は直せないからだ。`,
    fix:'寝る前の1分だけ決めろ。活動を1つ入れるだけで、その日は白紙を抜ける。' });
  else if (holes >= 3) F.push({ id:'hole2', sev:2, title:'抜けた日がある',
    text:`直近14日で ${holes} 日落としている。3日で区切る仕組みでは、1日の穴が平均を ${fmt(Math.abs(missPenalty())/3)} 点押し下げる。`,
    fix:'落とした日を後から埋めろ。暦から日付を選べば今でも書ける。' });

  /* ── 8. やる事の完了率 ── */
  if (!isNaN(s14.todoRate) && s14.todoRate > 0){
    if (s14.todoRate < 0.5) F.push({ id:'todo', sev:3, title:'やる事を立て過ぎている',
      text:`14日のやる事の完了率は ${Math.round(s14.todoRate*100)}%。半分も終わっていない。これは怠けではなく見積もりの失敗だ。毎日「できなかった」で終わる設計になっている。`,
      fix:'1日3件までにしろ。全部終わる日が続けば、自然に増やせる。' });
    else if (s14.todoRate >= 0.9) F.push({ id:'todogood', sev:0, title:'やる事は終わらせている',
      text:`完了率 ${Math.round(s14.todoRate*100)}%。言った事はやる人間になっている。ただし、簡単な事しか書いていない可能性もある。`,
      fix:'1件だけ、気の重い物を混ぜろ。全部終わる日が続くなら、負荷が足りていない。' });
  }

  /* ── 9. 節制の崩れ ── */
  for (const c of CHECKS){
    const n = s14.chk[c.id] || 0;
    if (!s14.logged) break;
    const rate = n / s14.logged;
    if (c.bad && rate >= 0.5) F.push({ id:'bad-'+c.id, sev:2, title:c.name + 'が常態化している',
      text:`記録した ${s14.logged} 日のうち ${n} 日で「${c.name}」が付いている。例外ではなく、既に生活の形だ。`,
      fix:c.id === 'latenight' ? '就寝の1時間前に充電器を部屋の外へ置け。意志ではなく距離で解決する。'
                               : '食べない選択が続くと、鍛錬の分が全部無駄になる。先に食事を固定しろ。' });
    if (!c.bad && c.pt >= 10 && s14.logged >= 5 && rate <= 0.3) F.push({ id:'temper-'+c.id, sev:1, title:c.name + 'が守れていない',
      text:`「${c.name}」は ${s14.logged} 日中 ${n} 日だけ。ここは1日 ${c.pt} 点で、節制の中では最も重い。`,
      fix:'引き金になっている時間帯を一つ特定しろ。たいてい夜、一人、画面の前だ。' });
  }

  /* ── 10. 連続記録 ── */
  const st = streakAt(today()) || streakAt(shiftYmd(today(),-1));
  if (st >= 7) F.push({ id:'streak', sev:0, title:st + '日続いている',
    text:`連続 ${st} 日。この数字の価値は、途切れた時に初めて分かる。`,
    fix:'続けるコツは量を落とす事だ。忙しい日は5分でいい、ゼロにするな。' });

  /* ── 11. 自己最高の鮮度 ── */
  const bs = bests();
  if (bs.length){
    const fresh = bs.filter(isFresh).length;
    const top = bs[0];
    if (fresh === 0 && ds.length >= 10) F.push({ id:'pb', sev:2, title:'自己最高が更新されていない',
      text:`最高点は ${top.date ? labelOf(top.date) : '—'} の ${fmt(top.val)} 点。直近7日で更新した記録は一つもない。維持は後退の始まりだ。`,
      fix:`今週のうち1日だけ、${fmt(top.val)} 点を超える日を作れ。全部の日を上げる必要はない。` });
  }

  /* 重い順に並べる */
  const order = { 3:0, 2:1, 1:2, 0:3 };
  F.sort((a,b) => order[a.sev] - order[b.sev]);
  return F;
}

/* ───────── 未来予想 ───────── */

const HORIZONS = [
  { d:30,  name:'30日後' },
  { d:90,  name:'90日後' },
  { d:365, name:'1年後' },
];

/**
 * 直近の傾きをそのまま延ばす。希望は足さない。
 */
function forecast(days){
  const ds = loggedDays();
  const win = ds.slice(-21);
  const have = win.length;

  /* 記録のある日だけでなく、暦の日で見る（白紙も数える）。
     ただし今日はまだ途中なので、空なら外す。 */
  let span = have ? lastDays(Math.min(21, diffDays(ds[0], today())+1)) : [];
  if (span.length && !hasAny(S.days[today()])) span = span.slice(0, -1);
  const series = span.map(d => hasAny(S.days[d]) ? sc(d).total : missPenalty());
  const line = fitLine(series);
  const now  = series.length ? line.a + line.b*(series.length-1) : 0;

  /* 傾きをそのまま 365 倍すると、誰も取らない点数が出てしまう。
     傾きは効き続けずに頭打ちになるものとして、実際に出した点の幅に収める。 */
  const TAU = 45;
  const eff = TAU * (1 - Math.exp(-days/TAU));
  let then = now + line.b * eff;
  if (series.length){
    const lo = Math.min(...series), hi = Math.max(...series);
    then = clamp(then, lo - 30, hi + 60);
  }
  const capped = Math.abs((now + line.b*days) - then) > 20;

  /* 日あたりの積み上げ時間（分） */
  const s = statsFor(span);
  const perDay = {};
  for (const c of CATS) perDay[c.id] = span.length ? s.mins[c.id]/span.length : 0;
  const stPerDay = s.stAvg * (s.stDays ? 1 : 0);

  const logRate = span.length ? s.logged/span.length : 0;

  return {
    days, series, line, capped,
    now, then: then,
    rankNow: rankOf(now), rankThen: rankOf(then),
    perDay, stPerDay, logRate,
    hours: Object.fromEntries(CATS.map(c => [c.id, perDay[c.id]*days/60])),
    stHours: stPerDay*days/60,
    buildHours: sum(CATS.filter(c => c.rate>0).map(c => perDay[c.id]))*days/60,
    wasteHours: perDay.waste*days/60,
    trend: line.b,
    thin: span.length < 5,
  };
}

/** 未来の描写。甘くしない。 */
function futureText(f){
  const d = f.days;
  const H = HORIZONS.find(h => h.d === d) || { name: d+'日後' };
  const out = [];

  if (f.thin){
    return '記録が5日に届いていない。この状態で未来を描いても占いになる。あと数日、正直に入れろ。';
  }

  const tr = f.trend;
  const dir = tr > 1.5 ? 'up' : tr < -1.5 ? 'down' : 'flat';

  /* 立ち上がり */
  if (dir === 'down'){
    out.push(`今の傾きは1日あたり ${fmt(tr,1)} 点。${H.name}には平均 ${fmt(f.then)} 点、格は ${f.rankThen.l}「${f.rankThen.n}」まで落ちる。`);
  }else if (dir === 'up'){
    out.push(`今の傾きは1日あたり ${sgn(Math.round(tr*10)/10)} 点。${H.name}には平均 ${fmt(f.then)} 点、${f.rankThen.l}「${f.rankThen.n}」に届く。ただしこれは、今日と同じ日を ${d} 回繰り返した場合の話だ。`);
  }else{
    out.push(`傾きはほぼ横ばい（1日 ${fmt(tr,1)} 点）。${H.name}も平均 ${fmt(f.then)} 点、${f.rankThen.l}「${f.rankThen.n}」のままだ。${d} 日かけて同じ場所に立っている自分を想像してみろ。`);
  }
  if (f.capped){
    out.push('（傾きをそのまま ' + d + ' 倍すれば、もっと極端な数字が出る。だが人は際限なく落ちも伸びもしない。'
      + 'お前が実際に出した点の幅に収めてある。）');
  }

  /* 中身 */
  const hrs = f.hours;
  const lines = [];
  for (const c of CATS){
    if (c.rate < 0) continue;
    const h = hrs[c.id];
    if (h < 1) continue;
    lines.push(`${c.name} ${fmt(h)} 時間`);
  }
  if (lines.length) out.push(`今の1日平均のまま進めば、この ${d} 日で積む量は ` + lines.join('、') + '。');

  if (f.stHours >= 1){
    out.push(`その横で、画面に ${fmt(f.stHours)} 時間を出す。${fmt(f.stHours/8)} 日ぶんの労働時間だ。`);
  }
  if (f.wasteHours >= 1){
    out.push(`だらだらに ${fmt(f.wasteHours)} 時間。これは残るものが何もない時間だ。`);
  }
  if (f.logRate < 0.7){
    out.push(`記録率は ${Math.round(f.logRate*100)}%。この調子なら ${d} 日のうち ${Math.round(d*(1-f.logRate))} 日は白紙で、何をしていたかも思い出せない。`);
  }

  /* 突きつけ */
  const kick = {
    30: [
      '1ヶ月だ。周りは誰もお前の1ヶ月に興味がない。だから1ヶ月で変わっても誰も褒めない。それでも変わるか。',
      '30日後の自分は、今日の自分の決定を全部引き受けている。文句は言えない相手だ。',
    ],
    90: [
      '3ヶ月は、体つきと顔つきが変わる長さだ。変わっていなければ、3ヶ月なにもしなかったという意味になる。',
      '90日で人は別人になれる。ならなかった人間の9割は、記録を止めた人間だ。',
    ],
    365: [
      '1年だ。この傾きのまま1年経った自分に会ったとして、お前は目を合わせられるか。',
      '1年後、同じ画面を同じ姿勢で見ている可能性は決して低くない。それが一番ありうる未来だ。',
      '1年は長い。長いから、毎日の1点が効いてくる。今日の1点を軽く見た人間が1年後に泣く。',
    ],
  }[d] || ['この先も、今日の延長でしかない。'];
  out.push(pick(kick, 'f' + d + Math.round(f.now)));

  return out.join('\n');
}

/** 一つだけ直したらどう変わるか */
function futureAlt(f){
  const A = analyze().filter(x => x.sev >= 2);
  if (!A.length) return null;
  const top = A[0];

  /* 直した時の上積みを粗く見積もる */
  let gain = 0, how = top.fix;
  if (top.id.startsWith('st'))      gain = Math.max(20, f.stPerDay * 0.4 * 1.1);
  else if (top.id.startsWith('hole')) gain = Math.abs(missPenalty()) * (1 - f.logRate);
  else if (top.id.startsWith('gap'))  gain = 40;
  else if (top.id === 'stale')        gain = 25;
  else if (top.id === 'todo')         gain = 30;
  else if (top.id.startsWith('sleep')) gain = 28;
  else                                gain = 25;

  const then = f.then + gain;
  const r = rankOf(then);
  return {
    title: top.title + 'を潰した場合',
    text: `平均は ${fmt(f.then)} 点 → ${fmt(then)} 点、格は ${f.rankThen.l} → ${r.l}「${r.n}」。\n`
        + `${how}\n`
        + `他は何も変えなくていい。一つで ${fmt(gain)} 点動くという事は、残り全部より重いという事だ。`,
  };
}

/* ───────── 進捗の要約 ───────── */

function summary(){
  const ds = loggedDays();
  const all = statsFor(ds);
  const s7 = statsFor(lastDays(7));
  const p7 = statsFor(lastDays(7, shiftYmd(today(),-7)));
  const live = liveCycle();
  const st = streakAt(today()) || streakAt(shiftYmd(today(),-1));
  const tot = sum(CATS.filter(c => c.rate>0).map(c => all.mins[c.id]));

  const mr = overallMeasured();
  /* d は増減そのもの。down が true の物は、減った方が良い。 */
  const items = [
    { k:'今期の平均', v:fmt(live.avg), u:'点', d:null },
    { k:'7日平均',   v:fmt(s7.avg), u:'点', d:(p7.logged>=2 ? s7.avg-p7.avg : null) },
    { k:'連続',       v:st, u:'日', d:null },
    { k:'極み',       v:kiwami(), u:'/'+kiwamiMax(), d:null },
    { k:'実測した時間', v:Math.round(sum(Object.values(masteryHours()))), u:'時間', d:null },
    { k:'実測率',     v:mr === null ? '—' : Math.round(mr*100), u:'%', d:null },
    { k:'記録した日', v:ds.length, u:'日', d:null },
    { k:'やる事完了', v:isNaN(s7.todoRate)?'—':Math.round(s7.todoRate*100), u:'%', d:null },
    { k:'画面 7日平均', v:s7.stDays?fmt(s7.stAvg):'—', u:'分',
      d:(p7.stDays&&s7.stDays ? s7.stAvg-p7.stAvg : null), down:true },
    { k:'睡眠 7日平均', v:s7.sleepAvg?fmt(s7.sleepAvg):'—', u:'分',
      d:(p7.sleepAvg&&s7.sleepAvg ? s7.sleepAvg-p7.sleepAvg : null) },
  ];
  return { items, all, s7, live, st };
}

/* ───────── 相談 ───────── */

/** 今の状態を短い文にまとめる（教官の目） */
function brief(){
  const ds = loggedDays();
  const all = statsFor(ds);
  const s7 = statsFor(lastDays(7));
  const live = liveCycle();
  const t = today();
  const r = sc(t);
  const L = [];
  const act = CATS.filter(c => r.cats[c.id] && r.cats[c.id].min > 0)
                  .map(c => `${c.name}${r.cats[c.id].min}分`).join('/');
  L.push(`[今日 ${t} ${DOW[dowOf(t)]}曜] 点数 ${r.total}、` + (act || '活動なし'));
  const o = day(t);
  if (o.todos && o.todos.length) L.push(`やる事 ${o.todos.filter(x=>x.done).length}/${o.todos.length} 完了`);
  const stt = stTotals(o);
  if (stt.apps.length) L.push(`画面 ${stt.total}分（上限 ${S.profile.stLimit}）` + (stt.apps.length ? '：' + stt.apps.map(a=>a.name+a.min).join('/') : ''));
  if (o.v && o.v.sleep) L.push(`睡眠 ${o.v.sleep}分`);
  const on = CHECKS.filter(c => o.chk && o.chk[c.id]).map(c => c.name);
  if (on.length) L.push('節制：' + on.join('/'));
  L.push(`[今期] 第${live.i+1}期 平均 ${Math.round(live.avg)} 点 ${live.rank.l}（残り${live.left}日、白紙${live.missed}日）`);
  L.push(`[7日] 平均 ${Math.round(s7.avg)} 点、記録 ${s7.logged}/7 日、画面平均 ${Math.round(s7.stAvg)} 分`);
  L.push(`[通算] 記録 ${ds.length} 日、平均 ${Math.round(all.avg)} 点、最高 ${all.max} 点、` +
    CATS.filter(c=>c.rate>0).map(c => `${c.name}${Math.round(all.mins[c.id]/60)}h`).join('/'));
  const mr = overallMeasured();
  L.push(`[実測] 実測率 ${mr === null ? '—' : Math.round(mr*100)+'%'}（手で打った申告は点が半分、段位に積まれない）、` +
    `極み ${kiwami()}/${kiwamiMax()}、段位 ` +
    Object.entries(mast()).map(([k,v]) => `${CAT[k].name}${v.name}(×${v.mul.toFixed(2)}/${fmt(v.hours,1)}h)`).join('、'));
  L.push('[目標] ' + CATS.map(c => `${c.name}${S.profile.goals[c.id]}分`).join('/') +
    `、睡眠${S.profile.sleepGoal}分、画面上限${S.profile.stLimit}分、厳しさ「${hardness().name}」`);
  const pl = planLive();
  if (pl){
    const pr = planProgress();
    L.push(`[作戦] ${pl.from}〜${pl.to}・狙いは「${pl.aim}」・${pr.done}/${pr.all} 済`);
  }
  const F = analyze().slice(0,4);
  if (F.length) L.push('[見つけた穴] ' + F.map(f => `${f.title}（重さ${f.sev}）`).join('、'));
  return L.join('\n');
}

const PERSONA =
`お前は「鬼教官」。ユーザーの自己鍛錬（男磨き）の記録を見て指導する教官だ。

守る事：
- 日本語。短く断定する。1回の返事は4〜8行。長い説教はしない。
- 厳しいが、侮辱はしない。人格ではなく行動と数字を叩く。
- 必ず渡された記録の数字を引用して話す。数字がない話は憶測だと断る。
- 慰めない。だが絶望もさせない。必ず「次の一手」を具体的に1つだけ渡す。その一手は今日か明日に15分以内で始められる物にする。
- 「頑張れ」「応援している」のような中身のない言葉は使わない。
- 医療・投薬・極端な断食や減量、投資の助言はしない。体の不調や心の不調を訴えられたら、鍛錬の話を止めて医者や専門家にかかるよう短く勧める。
- 記録にない事を聞かれたら「記録がない」とはっきり言う。作らない。`;

/** 鍵があるか */
function hasKey(){ return !!(S.ai.key && S.ai.key.trim()); }

/** 本物の Claude に投げる */
async function askClaude(text){
  const msgs = S.ai.chat.filter(m => m.who === 'me' || m.who === 'ai')
    .slice(-12)
    .map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));
  msgs.push({ role:'user', content: text });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': S.ai.key.trim(),
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true',
    },
    body: JSON.stringify({
      model: S.ai.model || 'claude-opus-5-5',
      max_tokens: 900,
      system: PERSONA + '\n\n--- 今のユーザーの記録 ---\n' + brief(),
      messages: msgs,
    }),
  });
  if (!res.ok){
    let d = '';
    try{ const j = await res.json(); d = (j.error && j.error.message) || ''; }catch(e){}
    throw new Error(res.status + (d ? '：' + d : ''));
  }
  const j = await res.json();
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
}

/* ───────── 本物に作戦を組ませる ───────── */

const PLAN_SPEC =
`次の3日の作戦を組め。守る形式：

返すのは JSON だけ。前置きも説明文も付けない。コードフェンスも使うな。
{
  "aim": "この3日で変える一点。15字以内",
  "why": "なぜそこなのか。記録の数字を必ず1つ以上引いて2文で",
  "note": "教官の言葉。3〜5行。断定する。慰めない",
  "days": [
    { "items": [ {"text":"具体的な指示。40字以内","cat":"train|study|work|read|groom|social|null","min":45} ] }
  ]
}

規則：
- days はちょうど3つ。1日あたり item は2〜3個。
- text は今日か明日に始められる具体行動にする。「頑張る」「意識する」は禁止。
- 変える点は3日通して一つに絞る。一度に多く変えた計画は必ず崩れる。
- 段位が近い分類があるなら、そこを3日で突いて上げさせる。
- min はタイマーで計る分。計らない指示は 0。
- cat は分類の id か null。それ以外を書くな。`;

/** Claude に作戦を組ませる。失敗したら内蔵に落とす。 */
async function askPlan(){
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': S.ai.key.trim(),
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true',
    },
    body: JSON.stringify({
      model: S.ai.model || 'claude-opus-5-5',
      max_tokens: 1600,
      system: PERSONA + '\n\n--- 今のユーザーの記録 ---\n' + brief()
            + '\n\n--- 分析 ---\n' + analyze().slice(0,6).map(f => `${f.title}（重さ${f.sev}）：${f.text}`).join('\n')
            + '\n\n--- 良い日の型 ---\n' + shapeBrief(),
      messages: [{ role:'user', content: PLAN_SPEC }],
    }),
  });
  if (!res.ok){
    let d = '';
    try{ const j = await res.json(); d = (j.error && j.error.message) || ''; }catch(e){}
    throw new Error(res.status + (d ? '：' + d : ''));
  }
  const j = await res.json();
  const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  const o = JSON.parse(txt.replace(/^```(?:json)?/,'').replace(/```$/,'').trim());

  /* 形を検めてから入れる。言われた通りに受け取らない。 */
  if (!o || !Array.isArray(o.days) || o.days.length !== 3) throw new Error('形が違う');
  const days = planDays();
  const ok = o.days.map((g, i) => ({
    d: days[i],
    items: (Array.isArray(g.items) ? g.items : []).slice(0,3).map(it => ({
      id: uid(),
      text: String(it.text || '').slice(0,80),
      cat: (it.cat && CAT[it.cat]) ? it.cat : null,
      min: clamp(Math.round(Number(it.min) || 0), 0, 600),
      done: false,
    })).filter(it => it.text),
  }));
  if (!ok.some(g => g.items.length)) throw new Error('中身が空だ');

  return {
    by: 'Claude',
    madeAt: new Date().toISOString(),
    from: days[0], to: days[2],
    aim: String(o.aim || '').slice(0,40) || '一点だけ変える',
    why: String(o.why || '').slice(0,400),
    note: String(o.note || '').slice(0,900),
    days: ok,
  };
}

/** 良い日の型を文にする（作戦の材料） */
function shapeBrief(){
  const s = goodShape();
  if (s.thin) return `記録が ${s.n} 日しかなく、型は出ていない。`;
  const L = [`上位 ${s.k} 日の平均 ${Math.round(s.hiAvg)} 点、下位 ${s.k} 日の平均 ${Math.round(s.loAvg)} 点。`];
  for (const r of s.rows) L.push(`${r.name}：強い日 ${r.hiV} ／ 弱い日 ${r.loV}`);
  if (s.firstCat) L.push(`強い日の ${s.firstCat.n}/${s.firstCat.of} は ${CAT[s.firstCat.cat].name} から始めている。`);
  return L.join('\n');
}

/** 期の裁定を Claude に書かせる */
async function askVerdict(ev){
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': S.ai.key.trim(),
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true',
    },
    body: JSON.stringify({
      model: S.ai.model || 'claude-opus-5-5',
      max_tokens: 500,
      system: PERSONA + '\n\n--- 今のユーザーの記録 ---\n' + brief(),
      messages: [{ role:'user', content:
`第${ev.i+1}期（${ev.from}〜${ev.to}）が締まった。裁定を書け。
平均 ${Math.round(ev.avg)} 点、格 ${ev.rank.l}「${ev.rank.n}」、白紙 ${ev.missed} 日。
3日の点：${ev.vals.map(v => v === null ? '—' : Math.round(v)).join(' / ')}

4〜6行。数字を引いて断定しろ。最後に次の3日で変える一点だけを言え。` }],
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const j = await res.json();
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
}

/* ───────── 鍵なしの教官（内蔵） ───────── */

const INTENTS = [
  { id:'today',  kw:['今日','きょう','どうだった','評価','採点','点数','何点'] },
  { id:'what',   kw:['何をすれ','なにをすれ','何から','なにから','どうすれ','次','優先','一番'] },
  { id:'screen', kw:['スマホ','スクリーン','画面','sns',' sns','インスタ','tiktok','youtube','ツイ'] },
  { id:'train',  kw:['筋トレ','鍛錬','運動','走','ジム','体','筋肉','痩せ','体重'] },
  { id:'study',  kw:['勉強','学習','資格','暗記','試験','受験'] },
  { id:'sleep',  kw:['睡眠','寝','眠','夜更かし','起き','朝'] },
  { id:'lazy',   kw:['やる気','だる','しんど','つら','無理','めんど','続かな','サボ','休み','飽き'] },
  { id:'future', kw:['未来','将来','このまま','なる','予想','1年','一年','半年'] },
  { id:'rank',   kw:['ランク','階級','格','上が','昇格','裁定'] },
  { id:'rival',  kw:['ライバル','相手','勝','負','比べ','対戦'] },
  { id:'praise', kw:['褒め','ほめ','すごい','できた','達成','やった'] },
  { id:'mote',   kw:['モテ','女','恋愛','彼女','見た目','顔','服','清潔'] },
  { id:'dan',    kw:['段位','極み','倍率','タイマー','実測','信用','申告','ズル','ごまか','嘘'] },
  { id:'how',    kw:['使い方','どうやって','機能','石','ガチャ','符','記録の'] },
];

function intentOf(t){
  const s = t.toLowerCase();
  for (const it of INTENTS) if (it.kw.some(k => s.includes(k))) return it.id;
  return 'default';
}

/** 鍵なしでも、記録を読んで答える */
function askLocal(text){
  const id = intentOf(text);
  const t = today();
  const r = sc(t);
  const o = day(t);
  const live = liveCycle();
  const s7 = statsFor(lastDays(7));
  const ds = loggedDays();
  const F = analyze();
  const seed = text + t;
  const L = [];

  const topFix = () => {
    const f = F.find(x => x.sev >= 2) || F[0];
    return f ? `${f.title}。${f.fix}` : '今日の活動を1つ記録しろ。それが最初の一手だ。';
  };

  switch (id){
    case 'today':
      if (r.empty){ L.push('今日は白紙だ。評価する物がない。', '活動を1つ、分を入れてから出直せ。'); break; }
      L.push(`今日は ${r.total} 点。${scoreTier(r.total).w}だ。`);
      L.push(dayVerdict(t));
      {
        const neg = Object.entries(r.parts).filter(([k,v]) => v < -5)
          .sort((a,b) => a[1]-b[1]).slice(0,2);
        const nm = { short:'未達', waste:'浪費', screen:'画面', sleep:'睡眠', todo:'やる事' };
        if (neg.length) L.push('引かれた所：' + neg.map(([k,v]) => `${nm[k]||k} ${fmt(v)}`).join('、') + '。');
      }
      L.push('次の一手：' + topFix());
      break;

    case 'what':
      L.push('順番で言う。');
      F.filter(x => x.sev >= 2).slice(0,3).forEach((f,i) => L.push(`${i+1}. ${f.title} → ${f.fix}`));
      if (!F.some(x => x.sev >= 2)) L.push('1. 大穴はない。今日と同じ形を明日に写せ。それが一番効く。');
      {
        const lack = CATS.filter(c => c.rate > 0).map(c => ({ c, d:(S.profile.goals[c.id]||0) - (r.cats[c.id] ? r.cats[c.id].min : 0) }))
          .filter(x => x.d > 0).sort((a,b) => b.d - a.d)[0];
        if (lack) L.push(`今日この時点で一番足りないのは「${lack.c.name}」、あと ${lack.d} 分だ。`);
      }
      break;

    case 'screen': {
      const st = stTotals(o);
      if (!st.apps.length && !s7.stDays){
        L.push('画面時間の記録が一つもない。だから何も言えない。');
        L.push('iPhone なら 設定 → スクリーンタイム、Android なら 設定 → Digital Wellbeing。上位3つのアプリの分をここに写せ。');
        break;
      }
      if (st.apps.length){
        const over = st.total - S.profile.stLimit;
        L.push(`今日は ${st.total} 分。上限 ${S.profile.stLimit} 分に対して ${over > 0 ? fmt(over)+' 分の超過' : fmt(-over)+' 分の余裕'}だ。`);
        const top = st.apps.slice().sort((a,b) => b.min - a.min)[0];
        if (top) L.push(`一番食っているのは ${top.name} の ${top.min} 分。1年なら ${fmt(top.min*365/60)} 時間だ。`);
      }
      if (s7.stDays) L.push(`7日平均は ${fmt(s7.stAvg)} 分。`);
      L.push('減らし方は決めてある。消すな、遠ざけろ。ホーム画面から外して、検索しないと開けない所に置く。これだけで半分になる。');
      break;
    }

    case 'train': {
      const m7 = s7.mins.train;
      const goal = S.profile.goals.train * Math.max(1, s7.logged);
      L.push(`7日で鍛錬は ${hm(m7)}。目標なら ${hm(goal)} だ。`);
      if (m7 < goal*0.5) L.push('半分も届いていない。器具も時間も関係ない、始める合図が決まっていないだけだ。');
      else if (m7 >= goal) L.push('量は足りている。次は強度だ。同じ重さを10回挙げ続けても体は変わらない。');
      const w = ds.map(d => day(d).v && Number(day(d).v.weight)).filter(x => x > 0);
      if (w.length >= 3) L.push(`体重は ${w[0]} → ${w[w.length-1]} kg（${sgn(w[w.length-1]-w[0])}）。`);
      L.push('一手：起きて最初にやる種目を1つ決めろ。腕立て20回でいい。考える前に終わる物にする。');
      break;
    }

    case 'study': {
      const m7 = s7.mins.study, goal = S.profile.goals.study * Math.max(1, s7.logged);
      L.push(`7日の学習は ${hm(m7)}、目標 ${hm(goal)} に対して ${Math.round(m7/Math.max(1,goal)*100)}%。`);
      const st = s7.stDays ? s7.stAvg*7 : 0;
      if (st > m7) L.push(`同じ7日で画面に ${hm(st)} 出している。学習より画面が長い。これが答えだ。`);
      L.push('一手：机に着く時刻を1つ決めろ。やる内容は決めなくていい。着いてから決めれば動く。');
      break;
    }

    case 'sleep': {
      const sl = s7.sleepAvg;
      if (!sl){ L.push('睡眠の記録がない。これを入れないと、調子の良い日と悪い日の理由が永久に分からない。'); break; }
      L.push(`7日の平均睡眠は ${hm(sl)}。目標は ${hm(S.profile.sleepGoal)} だ。`);
      if (sl < S.profile.sleepGoal - 30) L.push(`毎日 ${hm(S.profile.sleepGoal - sl)} 足りない。寝不足は意志を削る。やる気がないのではなく、寝ていない。`);
      const ln = s7.chk.latenight || 0;
      if (ln) L.push(`7日のうち ${ln} 日で夜更かしが付いている。`);
      L.push('一手：起床を固定しろ。就寝は後からついてくる。逆は絶対に揃わない。');
      break;
    }

    case 'lazy':
      L.push(pick([
        'やる気は結果だ。原因ではない。動いた後に出てくる物を、動く前に探すな。',
        '気分が乗る日を待つ設計は必ず失敗する。乗らない日の最低ラインを決めろ。',
        '続かないのは意志ではなく量の問題だ。今の目標が重すぎる。',
      ], seed));
      {
        const sl = s7.sleepAvg;
        if (sl && sl < S.profile.sleepGoal - 45) L.push(`そもそも睡眠が ${hm(sl)} しかない。これで気力の話をしても意味がない。先に寝ろ。`);
        if (s7.stDays && s7.stAvg > S.profile.stLimit) L.push(`画面が1日 ${fmt(s7.stAvg)} 分だ。意志が吸われている先はそこだ。`);
      }
      L.push('一手：今日の課業を「5分だけやる」に書き換えろ。5分で止めていい。止めなかったら勝ちだ。');
      L.push('休むのは構わない。だが記録は止めるな。白紙は休みではなく、消えた日だ。');
      break;

    case 'future': {
      const f = forecast(365);
      L.push(futureText(f));
      const alt = futureAlt(f);
      if (alt) L.push('— ' + alt.title + ' —', alt.text);
      break;
    }

    case 'rank': {
      const nx = nextRank(live.avg);
      L.push(`今は ${live.rank.l}「${live.rank.n}」、今期の平均 ${fmt(live.avg)} 点だ。`);
      if (nx){
        const need = nx.at - live.avg;
        L.push(`${nx.l}「${nx.n}」まで平均で ${fmt(need)} 点。残り ${live.left} 日で埋めるなら、1日 ${fmt(need*3/Math.max(1,live.left))} 点の上積みが要る。`);
        L.push(`${fmt(need*3/Math.max(1,live.left))} 点は、鍛錬 ${Math.ceil(need*3/Math.max(1,live.left)/CAT.train.rate)} 分ぶんだ。`);
      }else L.push('最上位だ。ここから先は上がる楽しみがない。落ちない苦しみだけが残る。');
      L.push('白紙の日は ' + missPenalty() + ' 点として平均に入る。上げるより、落とさない方が速い。');
      break;
    }

    case 'rival': {
      const v = versus();
      if (!v){ L.push('相手が登録されていない。戦績の画面で自分の符を写して相手に送れ。相手の符を貼れば並べて出す。'); break; }
      L.push(`${v.me.n} 対 ${v.you.n}：${v.win} 勝 ${v.lose} 敗。`);
      L.push(v.verdict);
      break;
    }

    case 'praise': {
      if (r.total >= 260) L.push(`${r.total} 点だ。認める。ここまでやれる日があると分かった以上、やらない日は選択だ。`);
      else if (r.total >= 120) L.push(`${r.total} 点。悪くない。だが褒めるのは3日続けてからだ。1日は偶然で説明できる。`);
      else L.push(`${r.total} 点で褒められようとするな。自分に甘い基準を持った時点で、伸びは止まる。`);
      const bs = bests().filter(isFresh);
      if (bs.length) L.push('直近7日で更新した記録：' + bs.map(b => `${b.name} ${fmt(b.val)}${b.unit}`).join('、') + '。これは事実だから、受け取っていい。');
      break;
    }

    case 'mote':
      L.push('顔を変える話ではない。清潔と姿勢と体つき、この3つで印象の大半が決まる。全部記録できる物だ。');
      {
        const gm = s7.mins.groom, so = s7.mins.social;
        L.push(`7日の身嗜みは ${hm(gm)}、対人は ${hm(so)}。`);
        if (gm < 60) L.push('身嗜みが週1時間に届いていない。肌と髪と歯は、金より回数で効く。');
        if (so < 60) L.push('人と話した時間が足りない。鍛えた体を見せる相手がいないなら、半分は無駄になる。');
      }
      L.push('一手：今週1回、人を誘う予定を入れろ。対人は机の上では伸びない。');
      break;

    case 'dan': {
      const m = mast();
      const mr = overallMeasured();
      L.push(`極み ${kiwami()} / ${kiwamiMax()}。実測率 ${mr === null ? '—' : Math.round(mr*100)+'%'}。`);
      L.push(Object.entries(m).map(([k,v]) => `${CAT[k].name} ${v.name}（×${v.mul.toFixed(2)}）`).join('／'));
      const nx = Object.entries(m).filter(([k,v]) => v.next).sort((a,b) => a[1].toNext - b[1].toNext)[0];
      if (nx) L.push(`一番近いのは ${CAT[nx[0]].name}。${nx[1].next.n} まで実測であと ${fmt(nx[1].toNext,1)} 時間だ。`);
      L.push('段位はタイマーで回した時間だけで上がる。手で打った申告は一切積まれない。');
      L.push('ごまかす余地は残してある。タイマーを押して放置すればいい。だが離席は数えて記録に残るし、積み上げた段位は自分以外の誰も見ていない。騙せるのは自分だけだ。');
      break;
    }

    case 'how':
      L.push('使い方はこうだ。');
      L.push('1. やる前にタイマーを押す。回っている間の実時間だけが満額で点になる。画面を離れたら止まる。');
      L.push('2. 押し忘れた分は「手で書く」から申告できる。ただし点は半分で、段位には積まれない。');
      L.push('3. やる事を3件まで。終わらせた割合が点になる。');
      L.push('4. 寝る前に睡眠・節制・画面時間を入れる。15秒だ。書けるのは今日と昨日まで。');
      L.push('5. 3日で期が締まり、格が付く。石が入る。石でガチャを引くと称号と修行札が出る。');
      L.push('6. 符を交換すれば相手と並べられる。符には極みと信用度（実測率）が載る。');
      break;

    default: {
      L.push(pick([
        '聞き方が曖昧だ。だが記録は曖昧じゃない。今の状態を言う。',
        '質問の意味は分からん。代わりに数字を見せる。',
      ], seed));
      L.push(`今日 ${r.total} 点、今期 ${fmt(live.avg)} 点 ${live.rank.l}、連続 ${streakAt(t) || streakAt(shiftYmd(t,-1))} 日。`);
      L.push('次の一手：' + topFix());
      L.push('具体的に聞きたければ「今日どうだった」「何からやる」「スマホ」「睡眠」「このままだとどうなる」のどれかを打て。');
    }
  }

  if (!hasKey() && Math.random() < 0.18){
    L.push('（設定に API キーを入れれば、ここから先は本物の Claude が相手になる）');
  }
  return L.filter(Boolean).join('\n');
}
