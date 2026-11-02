/* ============================================================
   gachaview.js — 報酬の画面
   石を使い、札を引き、集める。引いた修行札は翌日の課業になる。
   ============================================================ */

function renderGacha(){
  $('#gCoin').textContent = fmt(S.gacha.coin);
  const todayPay = S.meta.coinPaid[shiftYmd(today(),-1)];
  $('#gRate').textContent = `点の 1/10 が石になる${todayPay !== undefined ? `・昨日は +${todayPay}` : ''}・期の締めで追加`;

  $('#pull1').disabled  = S.gacha.coin < COST1;
  $('#pull10').disabled = S.gacha.coin < COST10;

  $('#pityBar').style.width = clamp(S.gacha.pity/PITY*100, 0, 100) + '%';
  $('#pityTxt').textContent = `UR 確定まで ${Math.max(0, PITY - S.gacha.pity)} 回 / 通算 ${S.gacha.pulls} 回`;

  renderColl('title',   '#collTitles',   '#titleSub');
  renderColl('mission', '#collMissions', null);
  renderWords();
}

function renderColl(kind, sel, subSel){
  const w = $(sel);
  w.textContent = '';
  const all = POOL.filter(c => c.kind === kind);
  const have = all.filter(c => S.gacha.owned[c.id]);
  if (subSel) $(subSel).textContent = `${have.length} / ${all.length}`
    + (equippedName() ? `・装備「${equippedName()}」` : '・未装備');

  for (const c of all){
    const n = S.gacha.owned[c.id] || 0;
    const eq = S.gacha.equipped === c.id;
    const b = el('button','ci ' + (n ? 'have' : 'lock') + (eq ? ' eq' : ''));
    b.type = 'button';
    b.append(el('small','', c.r));
    b.append(document.createTextNode(n ? c.name : '？？？'));
    if (n > 1) b.append(el('small','', '×' + n));
    if (c.kind === 'mission' && n) b.append(el('small','', '+' + c.pt));

    if (!n){
      b.onclick = () => toast(c.r + ' の札。引けば中身が見える');
    }else if (kind === 'title'){
      b.onclick = () => {
        S.gacha.equipped = eq ? null : c.id;
        save(); renderGacha(); refreshTop();
        toast(eq ? '称号を外した' : `称号「${c.name}」を付けた`, eq ? '' : 'gold');
      };
    }else{
      b.onclick = () => toast(`「${c.name}」・達成で +${c.pt} 点`);
    }
    w.append(b);
  }
  if (kind === 'mission' && have.length){
    const p = el('p','hint',
      `持っている ${have.length} 枚から、毎日2枚が「本日の課業」に出る。日付で決まるので選べない。`);
    p.style.flex = '1 0 100%';
    p.style.marginTop = '2px';
    w.append(p);
  }
}

function renderWords(){
  const w = $('#collWords');
  w.textContent = '';
  const all = POOL.filter(c => c.kind === 'word');
  const have = all.filter(c => S.gacha.owned[c.id]);
  $('#wordSub').textContent = `${have.length} / ${all.length}`;
  if (!have.length){
    w.append(el('div','empty','まだ一つもない。'));
    return;
  }
  for (const c of have){
    const d = el('div','wd ' + c.r);
    d.append(document.createTextNode(c.name));
    d.append(el('em','', c.r + '・' + (S.gacha.owned[c.id] > 1 ? S.gacha.owned[c.id] + '枚' : '1枚')));
    w.append(d);
  }
}

function doPull(n){
  const out = pull(n);
  if (!out){
    toast('石が足りない。点を積め','bad');
    return;
  }
  const st = $('#gachaStage');
  st.textContent = '';
  out.forEach((c, i) => {
    const d = el('div','gc ' + c.r + (c.isNew ? ' new' : ''));
    d.style.setProperty('--i', i);
    d.append(el('span','gc-r', c.r));
    d.append(el('span','gc-k', KIND_NAME[c.kind] + (c.dup ? '・重複 +' + c.back + '石' : '')));
    d.append(el('div','gc-t', c.name));
    if (c.kind === 'mission') d.append(el('div','gc-d', '達成で +' + c.pt + ' 点。翌日の課業に出る'));
    if (c.kind === 'title')   d.append(el('div','gc-d', '押すと装備できる'));
    if (c.kind === 'word')    d.append(el('div','gc-d', '語録に収まった'));
    if (c.kind === 'title' && c.isNew){
      d.onclick = () => { S.gacha.equipped = c.id; save(); renderGacha(); refreshTop(); toast(`称号「${c.name}」を付けた`,'gold'); };
      d.style.cursor = 'pointer';
    }
    st.append(d);
  });

  const ur = out.filter(c => c.r === 'UR').length;
  const sr = out.filter(c => c.r === 'SR').length;
  const nw = out.filter(c => c.isNew).length;
  if (ur) toast(`UR が ${ur} 枚。運は使った。次は腕で稼げ`,'gold');
  else if (sr) toast(`SR ${sr} 枚・新規 ${nw} 枚`,'good');
  else toast(`新規 ${nw} 枚`, nw ? '' : 'bad');

  renderGacha();
  refreshTop();
}

function bindGacha(){
  $('#pull1').onclick  = () => doPull(1);
  $('#pull10').onclick = () => doPull(10);
}
