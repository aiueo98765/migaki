/* ============================================================
   gacha.js — 鍛錬石と札
   点が石になり、石が札になる。札は翌日の課業になって返ってくる。
   遊びだが、引いた物が全部「やる事」に化けるので逃げられない。
   ============================================================ */

const COST1 = 30, COST10 = 270;
const PITY  = 60;                       // ここまで引けば UR 確定
const RARE  = [
  { r:'N',  w:60, dup:5  },
  { r:'R',  w:28, dup:10 },
  { r:'SR', w:10, dup:25 },
  { r:'UR', w:2,  dup:60 },
];

/* ───────── 札の山 ───────── */

/* 称号：装備すると符に載る */
const TITLES = [
  ['N','三日目の男'],['N','記録者'],['N','朝の住人'],['N','反省だけは一流'],
  ['N','腹筋見習い'],['N','水を飲む男'],['N','早歩き'],['N','鏡を見た'],
  ['R','白紙を恐れる者'],['R','画面を伏せた男'],['R','七日の継続者'],['R','鉄を知る'],
  ['R','活字の友'],['R','背筋の人'],['R','誘いを断った男'],['R','冷水に入る者'],
  ['SR','三十日連続'],['SR','節制の番人'],['SR','自己最高更新者'],['SR','無言の実行者'],
  ['SR','画面を捨てた男'],['SR','一期無白紙'],
  ['UR','鬼に認められた男'],['UR','百日の鉄'],['UR','別格'],
];

/* 修行札：引くと課業になる。pt は達成時の加点。 */
const MISSIONS = [
  ['N','起きて10分以内に顔を洗う',4],
  ['N','水を1.5リットル飲む',4],
  ['N','背筋を伸ばして5分座る',4],
  ['N','部屋のゴミを全部捨てる',5],
  ['N','靴を磨く',5],
  ['N','今日の予定を紙に書く',4],
  ['R','スマホを1時間、別の部屋に置く',10],
  ['R','腕立てを合計100回',12],
  ['R','スクワットを合計100回',12],
  ['R','本を20ページ読む',10],
  ['R','20分歩く。音楽もスマホもなしで',10],
  ['R','SNSを一日開かない',14],
  ['R','知らない人に一言話しかける',12],
  ['R','爪と髭と髪を整える',8],
  ['R','食べた物を全部書き出す',8],
  ['SR','朝5時に起きる',20],
  ['SR','画面時間を60分以内に収める',22],
  ['SR','人を一人、自分から誘う',20],
  ['SR','嫌いな種目を一番先にやる',18],
  ['SR','やる事を全部終わらせる',20],
  ['SR','一日、言い訳を一度も口にしない',16],
  ['UR','三日連続で白紙を作らず、全課業を終える',45],
  ['UR','今期の自己最高を更新する',40],
];

/* 語録：集めるだけ。効き目は本人次第。 */
const WORDS = [
  ['N','やる気は結果だ。原因ではない。'],
  ['N','記録しない日は、無かった日だ。'],
  ['N','量が足りないのではない。回数が足りない。'],
  ['N','鏡は嘘をつかない。写真はもっとつかない。'],
  ['N','明日からやる人間に、明日は来ない。'],
  ['R','続かないのは意志ではなく、設計の失敗だ。'],
  ['R','意志で勝つな。距離で勝て。遠ざければ触らない。'],
  ['R','3日で変わるのは気分だ。30日で体が変わる。90日で顔が変わる。'],
  ['R','休むのは構わない。記録を止めるな。'],
  ['R','一番やりたくない物を最初に置け。残りが全部楽になる。'],
  ['SR','他人と比べて勝っても、負けた自分は残っている。'],
  ['SR','いま使っている時間が、そのまま3年後の顔になる。'],
  ['SR','強さは習慣の別名だ。'],
  ['SR','できない日の最低ラインを決めていない奴が、必ず消える。'],
  ['UR','今日の1点を軽く見た人間が、1年後に泣く。'],
  ['UR','変わった人間は、変わろうとしていた人間ではなく、記録を止めなかった人間だ。'],
];

/* 全札に鍵をつけて一覧にする */
const POOL = [
  ...TITLES.map((x,i)   => ({ id:'t'+i, kind:'title',  r:x[0], name:x[1] })),
  ...MISSIONS.map((x,i) => ({ id:'m'+i, kind:'mission', r:x[0], name:x[1], pt:x[2] })),
  ...WORDS.map((x,i)    => ({ id:'w'+i, kind:'word',   r:x[0], name:x[1] })),
];
const CARD = Object.fromEntries(POOL.map(c => [c.id, c]));
const KIND_NAME = { title:'称号', mission:'修行札', word:'語録' };

function byRare(r){ return POOL.filter(c => c.r === r); }

/* ───────── 引く ───────── */

function rollRare(forceUR){
  if (forceUR) return 'UR';
  const tw = sum(RARE.map(x => x.w));
  let n = Math.random() * tw;
  for (const x of RARE){ n -= x.w; if (n <= 0) return x.r; }
  return 'N';
}

function pullOne(forceUR, minR){
  let r = rollRare(forceUR);
  if (minR && RARE.findIndex(x => x.r === r) < RARE.findIndex(x => x.r === minR)) r = minR;
  const list = byRare(r);
  const c = list[Math.floor(Math.random()*list.length)];
  const have = S.gacha.owned[c.id] || 0;
  S.gacha.owned[c.id] = have + 1;
  const dup = have > 0;
  let back = 0;
  if (dup){
    back = (RARE.find(x => x.r === r) || {dup:5}).dup;
    S.gacha.coin += back;
  }
  return Object.assign({}, c, { dup, back, isNew: !dup });
}

/**
 * n 回引く。石が足りなければ null。
 * 10連は R 以上が1枚保証、天井に届けば UR 確定。
 */
function pull(n){
  const cost = n === 10 ? COST10 : COST1 * n;
  if (S.gacha.coin < cost) return null;
  S.gacha.coin -= cost;

  const out = [];
  for (let i = 0; i < n; i++){
    S.gacha.pulls++;
    S.gacha.pity++;
    const forceUR = S.gacha.pity >= PITY;
    const last = (n === 10 && i === 9 && !out.some(c => c.r !== 'N')) ? 'R' : null;
    const c = pullOne(forceUR, last);
    if (forceUR) S.gacha.pity = 0;
    if (c.r === 'UR') S.gacha.pity = 0;
    out.push(c);
  }
  S.gacha.lastPull = today();

  /* 称号を初めて引いたら自動で装備する */
  const t = out.find(c => c.kind === 'title' && c.isNew);
  if (t && !S.gacha.equipped) S.gacha.equipped = t.id;

  save();
  return out;
}

function owned(kind){
  return POOL.filter(c => c.kind === kind && S.gacha.owned[c.id]);
}
function ownedCount(){
  return POOL.filter(c => S.gacha.owned[c.id]).length;
}
function equippedName(){
  const c = S.gacha.equipped && CARD[S.gacha.equipped];
  return c ? c.name : '';
}

/* ───────── 本日の課業 ───────── */

/**
 * 課業は2種類。
 *  base : 目標から自動で出る。分が入れば勝手に済む。
 *  card : 持っている修行札から日替わりで出る。手で押して済ます。
 */
function missionsFor(d){
  const o = day(d);
  const r = sc(d);
  const out = [];

  /* 目標のある分類を、足りない順に3つ */
  const lack = CATS.filter(c => c.rate > 0 && (S.profile.goals[c.id] || 0) > 0)
    .map(c => {
      const goal = S.profile.goals[c.id];
      /* 通った分（申告は半分）で見る。点の付き方と食い違わせない。 */
      const x = r.cats[c.id];
      const got = x ? Math.round(x.eff) : 0;
      const raw = x ? x.min : 0;
      return { c, goal, got, raw, done: got >= goal };
    });
  const undone = lack.filter(x => !x.done).sort((a,b) => (b.goal-b.got) - (a.goal-a.got));
  const done   = lack.filter(x => x.done);
  for (const x of [...undone.slice(0,3), ...done]){
    out.push({
      key: 'base:' + x.c.id,
      kind: 'base',
      text: `${x.c.name}を ${x.goal} 分`,
      sub: `${x.got} / ${x.goal} 分`
         + (x.raw !== x.got ? `（申告 ${x.raw} 分のうち通ったのは ${x.got} 分）` : ''),
      color: x.c.color,
      done: x.done,
      auto: true,
    });
  }

  /* 睡眠と画面の最低線 */
  const sl = Number(o.v && o.v.sleep);
  out.push({
    key:'base:sleep', kind:'base',
    text:`${hm(S.profile.sleepGoal)} 寝る`,
    sub: sl > 0 ? hm(sl) : '未記録',
    color:'#49b0b8', done: sl >= S.profile.sleepGoal, auto:true,
  });
  const st = stTotals(o);
  out.push({
    key:'base:st', kind:'base',
    text:`画面を ${S.profile.stLimit} 分以内`,
    sub: st.apps.length ? st.total + ' 分' : '未記録',
    color:'#8b5fd6', done: st.apps.length > 0 && st.total <= S.profile.stLimit, auto:true,
  });

  /* 作戦。教官が組んだ物は一番上に出す。 */
  const pl = planLive();
  if (pl){
    const grp = pl.days.find(x => x.d === d);
    if (grp){
      const done = (o.plan || []);
      for (const it of grp.items){
        out.unshift({
          key:'plan:' + it.id, kind:'plan', item:it,
          text: it.text,
          sub: `作戦・${pl.by}` + (it.cat ? `・${CAT[it.cat].name}` : ''),
          pt: 10 + Math.round((it.min||0)/12),
          color: it.cat ? CAT[it.cat].color : '#d9a441',
          done: done.includes(it.id), auto:false,
        });
      }
    }
  }

  /* 修行札（持っている物から日替わりで最大2枚） */
  const deck = owned('mission');
  if (deck.length){
    const n = Math.min(2, deck.length);
    const taken = new Set();
    for (let i = 0; i < n; i++){
      let k = hash(d + ':' + i) % deck.length;
      let guard = 0;
      while (taken.has(k) && guard++ < deck.length){ k = (k+1) % deck.length; }
      taken.add(k);
      const c = deck[k];
      out.push({
        key:'card:' + c.id, kind:'card', card:c,
        text:c.name, sub:'修行札 ' + c.r, pt:c.pt,
        color: c.r === 'UR' ? '#d9a441' : c.r === 'SR' ? '#8b5fd6' : c.r === 'R' ? '#4a7fe0' : '#6b7280',
        done: (o.miss || []).includes(c.id), auto:false,
      });
    }
  }
  return out;
}

/** 修行札の達成を切り替える */
function toggleMission(d, cardId){
  const o = dayRW(d);
  if (!o.miss) o.miss = [];
  const i = o.miss.indexOf(cardId);
  if (i >= 0){ o.miss.splice(i,1); return false; }
  o.miss.push(cardId);
  return true;
}

/** 達成した修行札の加点（score.js からは独立。日の点に足す） */
function missionBonus(d){
  const o = day(d);
  return sum((o.miss || []).map(id => (CARD[id] && CARD[id].pt) || 0));
}
