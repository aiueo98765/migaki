/* ============================================================
   store.js — 保存庫と土台
   データは全部この端末の localStorage に入る。外には出ない。
   ============================================================ */

const KEY = 'migaki.v1';

/* 先に器だけ作る。defaults() の中の today() がここを覗くので、
   宣言より後に初期化すると参照できずに落ちる。 */
let S = null;

/* ───────── 日付 ───────── */

/** Date → "2026-11-03"（端末のローカル時刻で切る） */
function ymd(d){
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
/** "2026-11-03" → Date（正午に置いて夏時間や時差で日が滑るのを防ぐ） */
function fromYmd(s){
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d, 12, 0, 0);
}
/** n 日ずらした ymd */
function shiftYmd(s, n){
  const d = fromYmd(s); d.setDate(d.getDate()+n); return ymd(d);
}
/** a から b までの日数（b - a） */
function diffDays(a, b){
  return Math.round((fromYmd(b) - fromYmd(a)) / 86400000);
}
/** 「一日の始まり」を考慮した今日。深夜4時までは前日扱い。 */
function today(){
  const n = new Date();
  const cut = S ? (S.profile.dayStart ?? 4) : 4;
  if (n.getHours() < cut) n.setDate(n.getDate()-1);
  return ymd(n);
}
const DOW = ['日','月','火','水','木','金','土'];
function dowOf(s){ return fromYmd(s).getDay(); }
function labelOf(s){
  const d = fromYmd(s);
  return (d.getMonth()+1) + '月' + d.getDate() + '日(' + DOW[d.getDay()] + ')';
}
function relOf(s){
  const n = diffDays(s, today());
  if (n === 0) return '今日';
  if (n === 1) return '昨日';
  if (n === -1) return '明日';
  if (n > 0) return n + '日前';
  return (-n) + '日後';
}
function hm(min){
  min = Math.round(min);
  const h = Math.floor(min/60), m = min%60;
  if (h === 0) return m + '分';
  if (m === 0) return h + '時間';
  return h + '時間' + m + '分';
}

/* ───────── 実測と申告 ───────── */

/* 手で打ち込んだ分は、この割合しか点にならない。
   タイマーを回した分だけが満額で、段位にも積まれる。 */
const MANUAL_RATE = 0.5;

/* 後から書ける日数。今日と昨日まで。それより古い日は閉じる。 */
const BACKFILL_DAYS = 1;

/* 段位。累計の「実測」時間で上がる。上がるほど1分が重くなる。 */
const DAN = [
  { h:0,   n:'無位', m:1.00 },
  { h:3,   n:'三級', m:1.09 },
  { h:8,   n:'二級', m:1.18 },
  { h:16,  n:'一級', m:1.27 },
  { h:30,  n:'初段', m:1.36 },
  { h:55,  n:'二段', m:1.45 },
  { h:90,  n:'三段', m:1.54 },
  { h:150, n:'四段', m:1.63 },
  { h:240, n:'五段', m:1.72 },
  { h:400, n:'皆伝', m:1.81 },
  { h:650, n:'極',   m:1.90 },
];

/* ───────── 分類 ───────── */

const CATS = [
  { id:'train',  name:'鍛錬',   color:'#e23b3b', goal:45,  rate:1.8,  hint:'筋トレ・走る・格闘技' },
  { id:'study',  name:'学習',   color:'#4a7fe0', goal:120, rate:1.0,  hint:'勉強・資格・言語' },
  { id:'work',   name:'仕事',   color:'#8b5fd6', goal:120, rate:0.9,  hint:'仕事・制作・副業' },
  { id:'read',   name:'読書',   color:'#49b0b8', goal:30,  rate:1.4,  hint:'本・長文・思考' },
  { id:'groom',  name:'身嗜み', color:'#3fb27f', goal:20,  rate:1.6,  hint:'肌・髪・服・姿勢・歯' },
  { id:'social', name:'対人',   color:'#d9a441', goal:30,  rate:1.5,  hint:'人と会う・話す・誘う' },
  { id:'waste',  name:'浪費',   color:'#6b7280', goal:0,   rate:-1.3, hint:'だらだら・無目的スマホ' },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

/* よく使う活動の雛形（押すと一発で積める） */
const QUICKS = [
  { cat:'train',  label:'筋トレ',     min:45 },
  { cat:'train',  label:'ランニング', min:30 },
  { cat:'study',  label:'勉強',       min:60 },
  { cat:'work',   label:'仕事',       min:120 },
  { cat:'read',   label:'読書',       min:30 },
  { cat:'groom',  label:'風呂と手入れ', min:20 },
  { cat:'social', label:'人と会う',   min:60 },
  { cat:'waste',  label:'だらだら',   min:60 },
];

/* 毎日の節制チェック。bad は「やってしまった」側。 */
const CHECKS = [
  { id:'nofap',  name:'抜いてない', pt:14, bad:false },
  { id:'nosugar',name:'間食なし',   pt:8,  bad:false },
  { id:'noalc',  name:'酒なし',     pt:8,  bad:false },
  { id:'cold',   name:'冷水',       pt:6,  bad:false },
  { id:'sun',    name:'日を浴びた', pt:6,  bad:false },
  { id:'posture',name:'姿勢を意識', pt:4,  bad:false },
  { id:'latenight', name:'夜更かし', pt:-14, bad:true },
  { id:'skipmeal',  name:'食事を抜いた', pt:-8, bad:true },
];
const CHK = Object.fromEntries(CHECKS.map(c => [c.id, c]));

/* スクリーンタイムの候補（手入力の補助） */
const ST_APPS = ['X','Instagram','TikTok','YouTube','LINE','Discord','ゲーム','ブラウザ','Reddit','Netflix','2ch系','出会い系'];
/* これに入るアプリは「無目的消費」とみなして重く見る */
const ST_JUNK = ['X','Instagram','TikTok','YouTube','Reddit','ゲーム','Netflix','2ch系','出会い系'];

/* ───────── 既定のデータ ───────── */

function blankDay(){
  return { acts:[], todos:[], st:{ apps:[] }, v:{}, chk:{}, note:'', miss:[], plan:[] };
}

function defaults(){
  return {
    ver: 1,
    profile: {
      name: '',
      startedAt: today(),
      dayStart: 4,          // 何時までを前日扱いにするか
      goals: Object.fromEntries(CATS.map(c => [c.id, c.goal])),
      sleepGoal: 420,       // 分
      stLimit: 120,         // スクリーンタイムの上限（分）
      wakeGoal: '06:30',
      hard: 1,              // 厳しさ 0:普通 1:厳しい 2:鬼
    },
    days: {},               // ymd -> day
    cycles: [],             // 確定した3日期
    gacha: { coin:0, pulls:0, pity:0, owned:{}, equipped:null, lastPull:null },
    /* 走っているタイマー。保存してあるので、閉じても消えない。 */
    timer: null,            // { cat, label, day, startMs, accMs, awayMs, awayN, awayAt }
    plan: null,             // 教官が組んだ次の3日
    rival: null,            // 相手の符
    ai: { key:'', model:'claude-opus-5-5', chat:[], lastFind:null },
    seen: { intro:false },
    meta: { coinPaid:{} },  // ymd -> 石を払い出した日（二重払いを防ぐ）
  };
}

/* ───────── 読み書き ───────── */

S = defaults();

let loadBroke = false;

function load(){
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try{
    S = deepFill(JSON.parse(raw), defaults());
    return true;
  }catch(e){
    /* 読めなかった物を黙って既定値で上書きすると、記録が永久に消える。
       壊れた中身を別の鍵に退避して、保存を止める。 */
    console.warn('読み込めなかった', e);
    try{ localStorage.setItem(KEY + '.broken', raw); }catch(e2){}
    loadBroke = true;
    return false;
  }
}

/** 足りない鍵を既定値で埋める（版が上がっても壊れないように） */
function deepFill(o, d){
  if (o === null || o === undefined) return d;
  if (d === null || d === undefined) return o;   // 既定に形が無い物はそのまま通す
  if (Array.isArray(d)) return Array.isArray(o) ? o : d;
  if (typeof d !== 'object') return typeof o === typeof d ? o : d;
  if (typeof o !== 'object' || Array.isArray(o)) return d;
  const r = {};
  for (const k of new Set([...Object.keys(d), ...Object.keys(o)])){
    r[k] = (k in d) ? deepFill(o[k], d[k]) : o[k];
  }
  return r;
}

let saveTimer = null;
function save(){
  if (loadBroke) return;          // 壊れた記録の上に書かない
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{ localStorage.setItem(KEY, JSON.stringify(S)); }
    catch(e){ toast('保存できなかった。容量が尽きたかも', 'bad'); }
  }, 180);
}
function saveNow(){
  if (loadBroke) return;
  clearTimeout(saveTimer);
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){}
}

/* ───────── 日の取り出し ───────── */

/** その日のデータ。無ければ作るが、書き込まない（空の日を量産しない） */
function day(d){
  return S.days[d] || blankDay();
}
/** 書き込む用。無ければその場で作って登録する */
function dayRW(d){
  if (!S.days[d]) S.days[d] = blankDay();
  return S.days[d];
}
/** 記録がある日を古い順に */
function loggedDays(){
  return Object.keys(S.days).filter(d => hasAny(S.days[d])).sort();
}
function hasAny(o){
  if (!o) return false;
  return (o.acts && o.acts.length > 0)
      || (o.todos && o.todos.length > 0)
      || (o.st && o.st.apps && o.st.apps.length > 0)
      || (o.v && Object.values(o.v).some(v => v !== '' && v !== null && v !== undefined))
      || (o.chk && Object.values(o.chk).some(Boolean))
      || (o.note && o.note.trim() !== '');
}
/** 直近 n 日の ymd（今日を含む、古い順） */
function lastDays(n, from){
  const end = from || today();
  const out = [];
  for (let i = n-1; i >= 0; i--) out.push(shiftYmd(end, -i));
  return out;
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/* ───────── 小物 ───────── */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

function el(tag, cls, txt){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined && txt !== null) e.textContent = txt;
  return e;
}
function esc(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function sum(a){ return a.reduce((x,y) => x+y, 0); }
function avg(a){ return a.length ? sum(a)/a.length : 0; }
function fmt(n, d){
  const k = d === undefined ? 0 : d;
  return (Math.round(n * 10**k) / 10**k).toLocaleString('ja-JP');
}
function sgn(n){ return n > 0 ? '+' + fmt(n) : fmt(n); }

let toastTimer = null;
function toast(msg, kind){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/** 文字列から決まった数を作る（同じ日には同じ言葉が出るように） */
function hash(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
/** 配列から hash で一つ選ぶ */
function pick(arr, seed){
  return arr[hash(seed) % arr.length];
}
