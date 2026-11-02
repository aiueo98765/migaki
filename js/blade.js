/* ============================================================
   blade.js — 刃
   積み上げた物が形になる。これだけは数字ではなく、見た目で分かる。

     長さ … 実測した累計時間
     研ぎ … 極み（段位の合計）。鈍ら か 鏡面 か
     欠け … 白紙にした日
     染み … 赤字で終えた日
     焔   … 連続記録
   ============================================================ */

let bladeRaf = null;
let bladeT0 = 0;

/** 刃の状態を数字から作る */
function bladeState(){
  const mh = masteryHours();
  const hours = sum(Object.values(mh));
  const k = kiwami(), kMax = kiwamiMax();
  const st = streakAt(today()) || streakAt(shiftYmd(today(),-1));

  /* 直近30日の傷 */
  const L30 = lastDays(30);
  const nicks = [], stains = [];
  for (const d of L30){
    if (d >= today()) continue;
    if (d < cycleStart()) continue;
    if (!hasAny(S.days[d])){ nicks.push(d); continue; }
    if (sc(d).total < 0) stains.push(d);
  }

  /* 長さは対数で伸ばす。最初の数時間でも手応えが出るように。 */
  const len = clamp(Math.log1p(hours) / Math.log1p(650), 0, 1);
  return {
    hours, k, kMax, st,
    len: 0.30 + len * 0.70,
    polish: kMax ? clamp(k / kMax, 0, 1) : 0,
    nicks, stains,
    rank: liveCycle().rank,
    measured: overallMeasured(),
  };
}

function drawBlade(ts){
  const cv = $('#blade');
  if (!cv || $('#view-rank').hidden) { bladeRaf = null; return; }

  const B = bladeState();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 320;
  const H = Math.round(clamp(W * 0.42, 158, 240));
  if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)){
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
    cv.style.height = H + 'px';
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,W,H);

  if (!bladeT0) bladeT0 = ts || 0;
  const t = ((ts || 0) - bladeT0) / 1000;

  /* ── 下地 ── */
  const bg = g.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#0b0c0f');
  bg.addColorStop(1,'#121318');
  g.fillStyle = bg; g.fillRect(0,0,W,H);

  /* 焔。連続記録が長いほど、刃の下が燃える。 */
  const ember = Math.min(B.st, 45) / 45;
  if (ember > 0.02){
    const eg = g.createRadialGradient(W*0.52, H*0.78, 2, W*0.52, H*0.78, W*0.62);
    eg.addColorStop(0, `rgba(226,80,40,${0.22*ember})`);
    eg.addColorStop(.5, `rgba(180,50,20,${0.10*ember})`);
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg; g.fillRect(0,0,W,H);
  }

  /* ── 骨格 ── */
  const padL = 14, padR = 16;
  const span = W - padL - padR;
  const bladeLen = span * B.len;
  const x0 = padL + 30;                       // 鎺（はばき）の位置
  const xT = x0 + bladeLen;                   // 切先
  const yBase = H * 0.74;
  const rise = H * 0.21;
  const sori = H * 0.095;                     // 反り
  const wMax = clamp(H * 0.098, 9, 21);

  const cx = u => x0 + (xT - x0) * u;
  const cy = u => yBase - rise*u - sori*Math.sin(Math.PI*u);
  const wAt = u => {
    if (u < 0.90) return wMax * (1 - 0.20*u);
    const v = (u - 0.90) / 0.10;
    return wMax * (1 - 0.18) * Math.sqrt(Math.max(0, 1 - v*v));
  };

  const N = 120;
  const spine = [], edge = [];
  for (let i = 0; i <= N; i++){
    const u = i/N;
    spine.push([cx(u), cy(u) - wAt(u)]);
    edge.push([cx(u), cy(u)]);
  }

  const outline = () => {
    g.beginPath();
    g.moveTo(spine[0][0], spine[0][1]);
    for (const p of spine) g.lineTo(p[0], p[1]);
    for (let i = edge.length-1; i >= 0; i--) g.lineTo(edge[i][0], edge[i][1]);
    g.closePath();
  };

  /* ── 鋼 ── */
  g.save();
  outline();
  g.clip();

  const steel = g.createLinearGradient(0, cy(0)-wMax*1.3, 0, cy(0)+2);
  const dull = 1 - B.polish;
  steel.addColorStop(0,    mix('#4a505c', '#9aa4b4', B.polish));
  steel.addColorStop(0.42, mix('#2f343d', '#6e7889', B.polish));
  steel.addColorStop(0.72, mix('#3a404a', '#aeb8c8', B.polish));
  steel.addColorStop(1,    mix('#5a616e', '#eef3fa', B.polish));
  g.fillStyle = steel;
  g.fillRect(0,0,W,H);

  /* 地肌。研ぐほど消える。 */
  g.globalAlpha = 0.20 * dull;
  g.strokeStyle = '#11141a'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++){
    const u = (i*37 % 100)/100;
    g.beginPath();
    g.moveTo(cx(u), cy(u) - wAt(u)*0.95);
    g.lineTo(cx(Math.min(1,u+0.06)), cy(Math.min(1,u+0.06)) - wAt(u)*0.2);
    g.stroke();
  }
  g.globalAlpha = 1;

  /* 刃文。研ぎが進むほどはっきり出る。 */
  if (B.polish > 0.04){
    g.beginPath();
    for (let i = 0; i <= N; i++){
      const u = i/N;
      const w = wAt(u);
      const wave = Math.sin(u*13 + 0.6) * w*0.17 + Math.sin(u*31) * w*0.07;
      const y = cy(u) - w*0.40 + wave;
      i ? g.lineTo(cx(u), y) : g.moveTo(cx(u), y);
    }
    g.strokeStyle = `rgba(242,248,255,${0.16 + 0.45*B.polish})`;
    g.lineWidth = 1.1 + B.polish;
    g.stroke();
    /* 刃文の下は白く曇る */
    g.globalAlpha = 0.14 + 0.2*B.polish;
    g.fillStyle = '#eaf2ff';
    g.beginPath();
    for (let i = 0; i <= N; i++){
      const u = i/N, w = wAt(u);
      const wave = Math.sin(u*13 + 0.6) * w*0.17 + Math.sin(u*31) * w*0.07;
      i ? g.lineTo(cx(u), cy(u) - w*0.40 + wave) : g.moveTo(cx(u), cy(u) - w*0.40 + wave);
    }
    for (let i = N; i >= 0; i--) g.lineTo(cx(i/N), cy(i/N)+1);
    g.closePath(); g.fill();
    g.globalAlpha = 1;
  }

  /* 染み。赤字で終えた日。 */
  for (const d of B.stains){
    const u = 0.08 + (hash(d) % 1000)/1000 * 0.86;
    const w = wAt(u);
    const rg = g.createRadialGradient(cx(u), cy(u)-w*0.5, 0, cx(u), cy(u)-w*0.5, w*1.5);
    rg.addColorStop(0,'rgba(60,22,18,.80)');
    rg.addColorStop(1,'rgba(60,22,18,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx(u), cy(u)-w*0.5, w*1.5, 0, 7); g.fill();
  }

  /* 走る光。研ぎが進むほど鋭く速い。 */
  const sweepW = 46 + 90*B.polish;
  const sp = ((t * (0.16 + 0.1*B.polish)) % 1.35) - 0.2;
  const sx = x0 + bladeLen * sp;
  const lg = g.createLinearGradient(sx - sweepW/2, 0, sx + sweepW/2, 0);
  lg.addColorStop(0,'rgba(255,255,255,0)');
  lg.addColorStop(.5,`rgba(255,255,255,${0.10 + 0.34*B.polish})`);
  lg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = lg; g.fillRect(0,0,W,H);

  g.restore();

  /* ── 刃先の線 ── */
  g.beginPath();
  for (let i = 0; i <= N; i++){ const u = i/N; i ? g.lineTo(cx(u), cy(u)) : g.moveTo(cx(u), cy(u)); }
  g.strokeStyle = `rgba(255,255,255,${0.35 + 0.6*B.polish})`;
  g.lineWidth = 1 + 0.9*B.polish;
  g.shadowColor = `rgba(190,220,255,${0.5*B.polish})`;
  g.shadowBlur = 10*B.polish;
  g.stroke();
  g.shadowBlur = 0;

  /* 焔が刃先に乗る */
  if (ember > 0.05){
    g.beginPath();
    for (let i = 0; i <= N; i++){ const u = i/N; i ? g.lineTo(cx(u), cy(u)+1.5) : g.moveTo(cx(u), cy(u)+1.5); }
    g.strokeStyle = `rgba(232,110,50,${0.30*ember + 0.12*Math.sin(t*2.1)*ember})`;
    g.lineWidth = 2.4;
    g.shadowColor = 'rgba(232,90,30,.7)'; g.shadowBlur = 12*ember;
    g.stroke(); g.shadowBlur = 0;
  }

  /* ── 棟の欠け。記録しなかった日。 ── */
  g.fillStyle = '#0b0c0f';
  g.strokeStyle = 'rgba(0,0,0,.6)';
  for (const d of B.nicks){
    const u = 0.06 + (hash('n'+d) % 1000)/1000 * 0.88;
    const w = wAt(u);
    const x = cx(u), y = cy(u) - w;
    const s = clamp(w*0.55, 2.5, 7);
    g.beginPath();
    g.moveTo(x - s, y - 0.5);
    g.lineTo(x, y + s*0.95);
    g.lineTo(x + s, y - 0.5);
    g.closePath();
    g.fill();
  }

  /* ── 柄 ── */
  const hx = padL, hy = cy(0), hw = x0 - padL, hh = wMax*1.5;
  g.fillStyle = '#1a1c22';
  g.beginPath(); g.roundRect(hx, hy - hh*0.78, hw - 7, hh, 3); g.fill();
  g.strokeStyle = '#2b2f38'; g.lineWidth = 1; g.stroke();
  /* 柄巻き */
  g.strokeStyle = '#13151a';
  for (let i = 0; i < 5; i++){
    const xx = hx + 4 + i*(hw-13)/5;
    g.beginPath(); g.moveTo(xx, hy - hh*0.78); g.lineTo(xx + 5, hy + hh*0.22); g.stroke();
  }
  /* 鍔 */
  g.fillStyle = mix('#3a3f49','#7d6a3a', B.polish*0.6);
  g.beginPath(); g.roundRect(x0 - 8, hy - hh*1.0, 6, hh*1.45, 2); g.fill();

  /* ── 格を刻む ── */
  g.save();
  g.globalAlpha = 0.5 + 0.35*B.polish;
  g.fillStyle = B.rank.c;
  g.font = `700 ${Math.round(H*0.17)}px Oswald, sans-serif`;
  g.textBaseline = 'alphabetic';
  g.shadowColor = B.rank.c; g.shadowBlur = 14;
  g.fillText(B.rank.l, x0 + 12, cy(0.08) - wMax*1.9);
  g.shadowBlur = 0;
  g.restore();

  if (!reduceMotion()) bladeRaf = requestAnimationFrame(drawBlade);
  else bladeRaf = null;
}

/** 2色を混ぜる（#rrggbb のみ） */
function mix(a, b, t){
  t = clamp(t, 0, 1);
  const p = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const [r1,g1,b1] = p(a), [r2,g2,b2] = p(b);
  const h = n => Math.round(n).toString(16).padStart(2,'0');
  return '#' + h(r1+(r2-r1)*t) + h(g1+(g2-g1)*t) + h(b1+(b2-b1)*t);
}

function startBlade(){
  if (bladeRaf) cancelAnimationFrame(bladeRaf);
  bladeT0 = 0;
  bladeRaf = requestAnimationFrame(drawBlade);
  if (reduceMotion()) drawBlade(0);
  renderBladeText();
}
function stopBlade(){
  if (bladeRaf) cancelAnimationFrame(bladeRaf);
  bladeRaf = null;
}

function renderBladeText(){
  const B = bladeState();
  const tags = $('#bladeTags');
  tags.textContent = '';
  const tag = (k, v, cls) => {
    const s = el('span','btag ' + (cls||''));
    s.append(el('u','', k));
    s.append(el('b','', v));
    tags.append(s);
  };
  tag('長さ', fmt(B.hours,1) + ' 時間');
  tag('研ぎ', B.k + ' / ' + B.kMax, B.polish >= 0.5 ? 'good' : '');
  tag('欠け', B.nicks.length + ' 箇所', B.nicks.length ? 'bad' : 'good');
  tag('染み', B.stains.length + ' 箇所', B.stains.length ? 'bad' : 'good');
  tag('焔',   B.st + ' 日', B.st >= 7 ? 'fire' : '');

  const L = [];
  if (B.hours < 1){
    L.push('まだ鉄の塊だ。実測した時間が一つも無い。');
    L.push('タイマーを押せ。押した分だけ伸びる。ここに嘘は入らない。');
  }else{
    if (B.polish < 0.15)      L.push(`${fmt(B.hours,1)} 時間ぶんの長さはある。だが鈍らだ。研ぎ（段位）が ${B.k} しかない。`);
    else if (B.polish < 0.45) L.push(`${fmt(B.hours,1)} 時間。刃文が出てきた。ここからは長さより研ぎが効く。`);
    else if (B.polish < 0.8)  L.push(`${fmt(B.hours,1)} 時間、研ぎ ${B.k}。もう人に見せられる刃だ。`);
    else                      L.push(`${fmt(B.hours,1)} 時間、研ぎ ${B.k}。ここまで来ると、折れる方が難しい。`);

    if (B.nicks.length >= 5)  L.push(`棟に ${B.nicks.length} 箇所の欠けがある。全部、記録しなかった日だ。欠けは研いでも戻らない。`);
    else if (B.nicks.length)  L.push(`欠けが ${B.nicks.length} 箇所。白紙にした日の数だ。`);
    if (B.stains.length >= 4) L.push(`染みが ${B.stains.length} 箇所。赤字で終えた日がこれだけある。`);
    if (B.st >= 14)           L.push(`${B.st} 日連続で焔が消えていない。`);
    else if (B.st === 0)      L.push('焔が消えている。連続記録が途切れた。');
    if (B.measured !== null && B.measured < 0.6)
      L.push(`ただし実測率は ${Math.round(B.measured*100)}%。申告した時間はこの刃に一切入っていない。`);
  }
  $('#bladeRead').textContent = L.join('\n');
}
