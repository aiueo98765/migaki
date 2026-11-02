/* ============================================================
   rankview.js — 戦績の画面
   格、三日裁定、自己最高、対戦。
   ============================================================ */

function renderRank(){
  startBlade();
  renderHero();
  renderCycles();
  renderBests();
  renderVersus();
  renderLadder();
}

function renderHero(){
  const live = liveCycle();
  const box = $('#rankHero');
  box.textContent = '';
  box.style.setProperty('--hero-glow', live.rank.c + '4d');
  box.style.setProperty('--hero-ray', live.rank.c + '66');

  const l = el('div','rh-letter', live.rank.l);
  l.style.color = live.rank.c;
  box.append(l);
  box.append(el('div','rh-name', live.rank.n));

  const name = S.profile.name || '名無し';
  const ttl = equippedName();
  box.append(el('div','rh-sub',
    `${ttl ? ttl + ' ' : ''}${name}／第${live.i+1}期 平均 ${fmt(live.avg)} 点`
    + (live.left ? `・残り ${live.left} 日` : '・本日が最終日')));

  /* 極みと信用度 */
  const mr = overallMeasured();
  const chips = el('div','rh-chips');
  const chip = (k, v, cls) => {
    const s = el('span','rh-chip ' + (cls||''));
    s.append(el('u','', k));
    s.append(el('b','', v));
    chips.append(s);
  };
  chip('極み', kiwami() + ' / ' + kiwamiMax());
  chip('実測', Math.round(sum(Object.values(masteryHours()))) + ' 時間');
  chip('信用度', mr === null ? '—' : Math.round(mr*100) + '%', mr !== null && mr < 0.6 ? 'warn' : '');
  box.append(chips);

  box.append(el('div','rh-verdict', cycleVerdict(live)));

  const nx = nextRank(live.avg);
  const row = el('div','rh-next');
  const tr = el('div','rh-next-t');
  const i = el('i');
  if (nx){
    const lo = live.rank.at === -999 ? 0 : live.rank.at;
    i.style.width = clamp((live.avg - lo)/(nx.at - lo)*100, 0, 100) + '%';
    i.style.background = nx.c;
    tr.append(i); row.append(tr);
    row.append(el('span','', `${nx.l} まで ${fmt(nx.at - live.avg)} 点`));
  }else{
    i.style.width = '100%'; i.style.background = '#d9a441';
    tr.append(i); row.append(tr);
    row.append(el('span','','最上位'));
  }
  box.append(row);
}

function renderCycles(){
  const live = liveCycle();
  const now = $('#cycleNow');
  now.textContent = '';
  const L = el('div','cn-l');
  L.append(el('b','', `第${live.i+1}期（進行中）`));
  L.append(el('span','',
    `${labelOf(live.from)} 〜 ${labelOf(live.to)}`
    + (live.missed ? `・白紙 ${live.missed} 日` : '')));
  now.append(L);
  const R = el('div','cn-r');
  const b = el('b','', fmt(live.avg));
  b.style.color = live.rank.c;
  R.append(b);
  R.append(el('span','', live.rank.l + ' ' + live.rank.n));
  now.append(R);

  const ul = $('#cycleList');
  ul.textContent = '';
  if (!S.cycles.length){
    ul.append(el('li','empty','まだ締まった期がない。\n3日が過ぎると最初の裁定が出る。'));
    return;
  }
  S.cycles.slice(0, 20).forEach((c, idx) => {
    const r = RANKS.find(x => x.l === c.rank) || RANKS[0];
    const li = el('li','cy tap');
    li.style.setProperty('--i', idx);
    const rl = el('div','cy-r', c.rank);
    rl.style.color = r.c;
    li.append(rl);
    const bb = el('div','cy-b');
    bb.append(el('b','', `第${c.i+1}期 平均 ${c.avg} 点`));
    bb.append(el('span','', `${c.from.slice(5)} 〜 ${c.to.slice(5)}`
      + (c.missed ? `・白紙 ${c.missed} 日` : '')));
    li.append(bb);
    const prev = S.cycles[idx+1];
    if (prev){
      const d = c.avg - prev.avg;
      const dd = el('div','cy-d ' + (d > 5 ? 'up' : d < -5 ? 'dn' : 'eq'),
        (d > 0 ? '▲' : d < 0 ? '▼' : '—') + (d ? fmt(Math.abs(d)) : ''));
      li.append(dd);
    }
    li.onclick = () => sheet('第' + (c.i+1) + '期の裁定', m => {
      const p = el('div','fu-body');
      p.textContent = c.verdict;
      m.append(p);
      const g = el('div','dd-tags');
      for (const d of cycleDays(c.i)){
        const t = el('span','dd-tag');
        t.append(document.createTextNode(d.slice(5)));
        t.append(el('b','', hasAny(S.days[d]) ? String(sc(d).total) : '白紙'));
        if (!hasAny(S.days[d])) t.style.borderColor = '#5b2222';
        g.append(t);
      }
      m.append(g);
    });
    li.style.cursor = 'pointer';
    ul.append(li);
  });
}

function renderBests(){
  const ul = $('#bestList');
  ul.textContent = '';
  const bs = bests();
  if (!bs.length){
    ul.append(el('li','empty','記録がまだない。'));
    return;
  }
  for (const b of bs){
    const li = el('li','bl' + (isFresh(b) ? ' fresh' : ''));
    li.append(el('span','bl-n', b.name));
    li.append(el('span','bl-v', fmt(b.val) + b.unit));
    li.append(el('span','bl-d', b.date ? b.date.slice(5) + (isFresh(b) ? ' 新' : '') : '—'));
    ul.append(li);
  }
}

function renderVersus(){
  const w = $('#vsWrap');
  w.textContent = '';
  const v = versus();
  if (!v){
    w.append(el('div','empty','相手がいない。\n自分の符を写して送り、返ってきた符を貼れ。\n過去の自分と戦いたいだけなら上の「自己最高」を見ろ。'));
    return;
  }
  const head = el('div','dd-head');
  head.append(el('b','', `${v.me.n} 対 ${v.you.n}`));
  head.append(el('em','', `${v.win}–${v.lose}`));
  head.append(el('span','', (v.you.at ? v.you.at + ' 時点の符' : '')
    + (v.you.t && CARD[v.you.t] ? '／' + CARD[v.you.t].name : '')
    + `／信用度 自 ${v.mv}% 対 ${v.yv}%`));
  w.append(head);

  for (const r of v.rows){
    const mx = Math.max(Math.abs(r.a), Math.abs(r.b), 1);
    const row = el('div','vs-row');

    const mk = (val, color) => {
      const s = el('div','vs-side');
      const bar = el('div','vs-bar');
      const i = el('i');
      i.style.width = clamp(Math.abs(val)/mx*100, 2, 100) + '%';
      i.style.background = color;
      bar.append(i);
      bar.append(el('em','', fmt(val)));
      s.append(bar);
      return s;
    };
    const a = mk(r.a, r.a >= r.b ? '#e23b3b' : '#4a4f5a');
    const b = mk(r.b, r.b >  r.a ? '#d9a441' : '#4a4f5a');
    row.append(a);
    row.append(el('div','vs-mid', r.k));
    row.append(b);
    w.append(row);
  }
  const vv = el('div','vs-verdict');
  vv.textContent = v.verdict;
  w.append(vv);

  const rm = el('button','btn-ghost');
  rm.type = 'button'; rm.textContent = '相手を外す';
  rm.style.marginTop = '8px';
  rm.onclick = () => { S.rival = null; save(); renderVersus(); };
  w.append(rm);
}

function renderLadder(){
  const live = liveCycle();
  const ul = $('#ladder');
  ul.textContent = '';
  for (const r of RANKS.slice().reverse()){
    const on = r === live.rank;
    const li = el('li','ld' + (on ? ' on' : ''));
    const l = el('span','ld-l', r.l);
    l.style.color = r.c;
    li.append(l);
    li.append(el('span','ld-n', r.n));
    li.append(el('span','ld-r', r.at === -999 ? '0 未満' : r.at + ' 以上'));
    ul.append(li);
  }
}

function bindRank(){
  $('#vsCopy').onclick = async () => {
    const code = encodeCard(myCard());
    try{
      await navigator.clipboard.writeText(code);
      toast('符を写した。相手に送れ','good');
    }catch(e){
      sheet('自分の符', m => {
        const ta = el('textarea');
        ta.rows = 4; ta.value = code; ta.readOnly = true;
        ta.onclick = () => ta.select();
        m.append(ta);
        m.append(el('p','hint','押して全部選んで、手で写してくれ。'));
      });
    }
  };
  $('#vsLoad').onclick = () => {
    const s = $('#vsCode').value.trim();
    if (!s){ toast('符を貼れ','bad'); return; }
    try{
      const c = decodeCard(s);
      S.rival = c;
      save();
      $('#vsCode').value = '';
      renderVersus();
      toast(`${c.n || '相手'} を登録した`,'good');
    }catch(e){
      toast('符が読めない。全部貼れているか確認しろ','bad');
    }
  };
  $('#vsCode').onkeydown = e => { if (e.key === 'Enter') $('#vsLoad').click(); };
}
