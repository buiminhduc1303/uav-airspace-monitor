export function initEngine() {
  if (window.__rafId) cancelAnimationFrame(window.__rafId);
  if (window.__intId) clearInterval(window.__intId);

  const $ = s => document.querySelector(s);
  const cv = $('#cv');
  if (!cv) return;
  const g = cv.getContext('2d');

  const D = Math.PI / 180;
  const dms = (d, m, s) => d + m / 60 + s / 3600;
  
  const ARP = { la: dms(10, 49, 14), lo: dms(106, 39, 39) };
  const KX = 111320 * Math.cos(ARP.la * D);
  const KY = 110574;
  
  const xy = (la, lo) => [(lo - ARP.lo) * KX, (la - ARP.la) * KY];
  
  const RW = [
    ['07L', 10, 48, 54.07, 106, 38, 13.65, 69],
    ['25R', 10, 49, 29.48, 106, 39, 47.43, 249],
    ['07R', 10, 48, 40.93, 106, 38, 12.58, 69],
    ['25L', 10, 49, 25, 106, 40, 10, 249]
  ].map(r => ({ n: r[0], p: xy(dms(r[1], r[2], r[3]), dms(r[4], r[5], r[6])), h: r[7] }));
  
  const U = { x: Math.sin(69 * D), y: Math.cos(69 * D) };
  const V = { x: Math.cos(69 * D), y: -Math.sin(69 * D) };
  const AC = RW.map(r => [r.p[0] * U.x + r.p[1] * U.y, r.p[0] * V.x + r.p[1] * V.y]);
  
  const a0 = Math.min(...AC.map(q => q[0]));
  const a1 = Math.max(...AC.map(q => q[0]));
  const c0 = Math.min(...AC.map(q => q[1]));
  const c1 = Math.max(...AC.map(q => q[1]));
  
  const ZP = { a0: a0 - 15000, a1: a1 + 15000, c0: c0 - 5000, c1: c1 + 5000 };
  const ZR = { a0: ZP.a0 - 3000, a1: ZP.a1 + 3000, c0: ZP.c0 - 3000, c1: ZP.c1 + 3000 };
  
  const SN = ['AN TOÀN', 'CẢNH BÁO', 'VÙNG HẠN CHẾ', 'VÙNG CẤM'];
  const SC = ['#19d38c', '#ffb020', '#ffb020', '#ff4d4f'];
  
  let T = [], seq = 0, run = true, mult = 20, range = 40, mode = 'radar', snd = true, logs = [], last = performance.now(), sw = 0, dirty = true, ac, acc = 0;
  
  const dz = (z, x, y) => {
    const a = x * U.x + y * U.y, c = x * V.x + y * V.y;
    return Math.hypot(Math.max(z.a0 - a, 0, a - z.a1), Math.max(z.c0 - c, 0, c - z.c1));
  };
  
  const eta = (z, t) => {
    if (dz(z, t.x, t.y) == 0) return 0;
    const vx = t.s * Math.sin(t.h * D), vy = t.s * Math.cos(t.h * D);
    for (let s = 2; s <= 3600; s += 2) {
      if (dz(z, t.x + vx * s, t.y + vy * s) == 0) return s;
    }
    return null;
  };
  
  const fm = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
  const hm = () => new Date().toISOString().substr(11, 8);
  
  function beep(f, d) {
    if (!snd) return;
    try {
      ac = ac || new AudioContext();
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f;
      g.gain.value = .05;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + d);
    } catch (e) {}
  }
  
  function log(l, m) {
    logs.unshift({ t: hm(), l, m });
    if (logs.length > 80) logs.pop();
    dirty = true;
    if (l != 'i') beep(l == 'd' ? 1000 : 700, .2);
  }
  
  function mk(o) {
    const id = 'UAV-' + String(++seq).padStart(3, '0'), b = o.b * D, r = o.d * 1000;
    const t = { 
      id, 
      name: (o.n || id).replace(/[<>&"]/g, ''), 
      x: r * Math.sin(b), 
      y: r * Math.cos(b), 
      h: ((o.h % 360) + 360) % 360, 
      s: o.s, 
      alt: o.a, 
      tr: [], 
      st: -1, 
      w: false,
      wR: false,
      an: {} 
    };
    T.push(t);
    log('i', `${t.name} (${id}) xuất hiện – hướng ${Math.round(o.b)}°, cách ARP ${o.d} km, bay hướng ${Math.round(t.h)}°, ${t.s} m/s`);
    return t;
  }
  
  function seed() {
    T = []; seq = 0; logs = [];
    mk({ n: 'UAV-X1', b: 265, d: 30, h: 85, s: 20, a: 150 });
    mk({ n: 'UAV-X2', b: 120, d: 35, h: 200, s: 25, a: 300 });
    mk({ n: 'UAV-X3', b: 45, d: 28, h: 225, s: 28, a: 120 });
    mk({ n: 'UAV-X4', b: 330, d: 40, h: 60, s: 18, a: 200 });
    mk({ n: 'SWALLOW', b: 180, d: 32, h: 0, s: 20, a: 50 });
    mk({ n: 'SPARROW', b: 210, d: 25, h: 45, s: 15, a: 30 });
  }
  
  function an(t) {
    const eP = eta(ZP, t), eR = eta(ZR, t), dP = dz(ZP, t.x, t.y), dR = dz(ZR, t.x, t.y);
    const m = Math.min(eP ?? 1e9, eR ?? 1e9);
    
    // Check if heading towards restricted zone and distance <= 3000m
    const approachingRestricted = eR !== null && dR > 0 && dR <= 3000;
    
    let st = dP == 0 ? 3 : dR == 0 ? 2 : (m <= 180 || approachingRestricted) ? 1 : 0;
    t.an = { eP, eR, dP, dR, d: Math.hypot(t.x, t.y), b: (Math.atan2(t.x, t.y) / D + 360) % 360 };
    
    if (st != t.st) {
      if (st == 3) log('d', `⚠ ${t.name} ĐÃ XÂM NHẬP VÙNG CẤM BAY – cao ${t.alt} m, ${t.s} m/s`);
      else if (st == 2) log('w', `${t.name} vào vùng hạn chế bay`);
      else if (st == 1) {
         if (approachingRestricted) {
             log('w', `${t.name} tiến gần vùng hạn chế (cách ${fm(dR)}) – nguy cơ xâm nhập`);
         } else {
             log('w', `${t.name} có nguy cơ xâm nhập – dự báo ${m}s`);
         }
      }
      else if (t.st >= 0) log('i', `${t.name} trở lại trạng thái an toàn`);
      t.st = st;
    }
    
    if (approachingRestricted && !t.wR) {
        t.wR = true;
        if (st == 1) log('w', `${t.name} đang tiến sát vùng hạn chế (cách ${fm(dR)})`);
    }
    if (!approachingRestricted) t.wR = false;
    
    if (eP && eP <= 60 && !t.w) {
      t.w = true;
      log('d', `${t.name} đang ở hướng ${Math.round(t.an.b)}°, cách vùng cấm ${fm(dP)}, di chuyển ${t.s} m/s, khoảng ${eP}s nữa sẽ xâm nhập vùng cấm`);
    }
    if (eP === null || eP > 90) t.w = false;
    
    return st;
  }
  
  function render() {
    let w = 0, i = 0;
    T.forEach(t => { if (t.st == 3) i++; else if (t.st > 0) w++; });
    
    $('#nT').textContent = T.length;
    $('#nW').textContent = w;
    $('#nI').textContent = i;
    $('#bg').textContent = i + w;
    $('#hT').textContent = 'Danh sách mục tiêu (' + T.length + ')';
    
    $('#list').innerHTML = T.map(t => {
      const a = t.an;
      return `<div class="card s${t.st}">
        <div class="ch">
          <b>${t.name}</b><span class="id">${t.id}</span>
          <span class="chip c${t.st}">${SN[t.st]}</span>
          <button data-del="${t.id}" title="Xoá">✕</button>
        </div>
        <div class="gr">
          <span>BRG<b>${a.b.toFixed(0)}°</b></span>
          <span>CÁCH ARP<b>${fm(a.d)}</b></span>
          <span>CÁCH VÙNG CẤM<b>${fm(a.dP)}</b></span>
          <span>TỐC ĐỘ<b>${t.s} m/s</b></span>
          <span>HDG<b>${t.h.toFixed(0)}°</b></span>
          <span>ETA VÙNG CẤM<b>${a.eP === 0 ? 'ĐÃ VÀO' : a.eP == null ? '--' : a.eP + ' s'}</b></span>
        </div>
      </div>`;
    }).join('') || '<div class="al">Không gian bay an toàn – chưa có mục tiêu.</div>';
    
    $('#logs').innerHTML = logs.map(l => `<div class="al ${l.l}"><time>${l.t}Z</time>${l.m}</div>`).join('') || '<div class="al">Chưa có cảnh báo.</div>';
  }
  
  let W = 0, H = 0, S = 1, dpr = 1;
  
  function size() {
    dpr = devicePixelRatio || 1;
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    S = Math.min(W, H) / 2 * .92 / (range * 1000);
  }
  
  const sx = x => W / 2 + x * S;
  const sy = y => H / 2 - y * S;
  
  function poly(z, fill, stroke) {
    g.beginPath();
    [[z.a0, z.c0], [z.a1, z.c0], [z.a1, z.c1], [z.a0, z.c1]].forEach(([a, c], k) => {
      const x = sx(a * U.x + c * V.x), y = sy(a * U.y + c * V.y);
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = stroke;
    g.setLineDash([8, 5]);
    g.lineWidth = 1.5;
    g.stroke();
    g.setLineDash([]);
  }
  
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H / 2, R = range * 1000 * S;
    
    g.fillStyle = mode == 'radar' ? '#020712' : '#0b1a2c';
    g.fillRect(0, 0, W, H);
    
    if (mode == 'radar') {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, '#04202a');
      gr.addColorStop(1, '#020a14');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, R, 0, 7);
      g.fill();
    } else {
      g.strokeStyle = 'rgba(80,130,200,.15)';
      g.lineWidth = 1;
      const st = range > 20 ? 5000 : range > 10 ? 2000 : 1000;
      for (let k = -range * 1000; k <= range * 1000; k += st) {
        g.beginPath(); g.moveTo(sx(k), 0); g.lineTo(sx(k), H);
        g.moveTo(0, sy(k)); g.lineTo(W, sy(k)); g.stroke();
      }
    }
    
    poly(ZR, 'rgba(255,176,32,.10)', 'rgba(255,176,32,.85)');
    poly(ZP, 'rgba(255,77,79,.14)', 'rgba(255,77,79,.95)');
    
    g.font = '11px ui-monospace,Consolas,monospace';
    g.fillStyle = 'rgba(255,176,32,.9)';
    g.fillText('KHU VỰC HẠN CHẾ BAY', sx(-ZR.a1 * 0) - 60, sy(ZR.c1 * V.y + ZR.a1 * U.y * 0) + 0 - 0 + 0);
    
    const rs = range > 20 ? [10, 20, 30, 40, 50, 60].filter(v => v <= range) : [range / 4, range / 2, range * 3 / 4, range];
    
    g.strokeStyle = 'rgba(60,200,150,.45)';
    g.fillStyle = 'rgba(120,220,180,.8)';
    g.lineWidth = 1;
    rs.forEach(v => {
      g.setLineDash([4, 5]);
      g.beginPath(); g.arc(cx, cy, v * 1000 * S, 0, 7); g.stroke();
      g.setLineDash([]);
      g.fillText(v + ' km', cx + 4, cy - v * 1000 * S - 3);
    });
    
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    
    g.strokeStyle = 'rgba(60,200,150,.9)';
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    
    g.fillStyle = '#9fe8c8';
    g.textAlign = 'center';
    for (let b = 0; b < 360; b += 30) {
      const an = b * D, r1 = R;
      g.beginPath();
      g.moveTo(cx + r1 * Math.sin(an) * .97, cy - r1 * Math.cos(an) * .97);
      g.lineTo(cx + r1 * Math.sin(an), cy - r1 * Math.cos(an));
      g.stroke();
      g.fillText(String(b).padStart(3, '0'), cx + (R * .93) * Math.sin(an), cy - (R * .93) * Math.cos(an) + 4);
    }
    g.textAlign = 'left';
    
    if (mode == 'radar' && g.createConicGradient) {
      const a = sw - Math.PI / 2;
      const c = g.createConicGradient(a - Math.PI / 3, cx, cy);
      c.addColorStop(0, 'rgba(25,211,140,0)');
      c.addColorStop(1 / 6, 'rgba(25,211,140,.3)');
      c.addColorStop(1 / 6 + .002, 'rgba(25,211,140,0)');
      c.addColorStop(1, 'rgba(25,211,140,0)');
      g.fillStyle = c;
      g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      g.strokeStyle = '#19d38c'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); g.stroke();
    }
    
    g.lineWidth = 4;
    g.strokeStyle = '#dbe6f7';
    [[0, 1], [2, 3]].forEach(([i, j]) => {
      g.beginPath(); g.moveTo(sx(RW[i].p[0]), sy(RW[i].p[1])); g.lineTo(sx(RW[j].p[0]), sy(RW[j].p[1])); g.stroke();
    });
    
    g.fillStyle = '#cfe0ff';
    g.font = '10px ui-monospace,monospace';
    RW.forEach(r => g.fillText(r.n, sx(r.p[0]) + 5, sy(r.p[1]) - 5));
    
    g.fillStyle = '#2f80ff';
    g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 11px system-ui'; g.fillText('TSN', cx + 8, cy + 14);
    
    const now = performance.now();
    T.forEach(t => {
      const c = SC[t.st], x = sx(t.x), y = sy(t.y), a = t.an;
      g.fillStyle = c;
      t.tr.forEach((p, k) => {
        g.globalAlpha = k / t.tr.length * .6;
        g.fillRect(sx(p[0]) - 1, sy(p[1]) - 1, 2.5, 2.5);
      });
      g.globalAlpha = 1;
      
      const L = Math.min(a.eP ?? 600, 600) * t.s, hx = Math.sin(t.h * D), hy = Math.cos(t.h * D);
      g.strokeStyle = c; g.globalAlpha = .7; g.setLineDash([3, 4]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(sx(t.x + hx * L), sy(t.y + hy * L)); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
      
      g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x - hx * 26, y + hy * 26); g.stroke();
      
      if (t.st >= 2) {
        const p = (now / 700) % 1;
        g.globalAlpha = 1 - p; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 8 + p * 22, 0, 7); g.stroke(); g.globalAlpha = 1;
      }
      
      g.fillStyle = c; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      
      const ln = [t.name, `${fm(a.dP)} · ${t.s} m/s`, a.eP === 0 ? 'ĐÃ XÂM NHẬP' : 'ETA ' + (a.eP == null ? '--' : a.eP + ' s')];
      g.font = '11px ui-monospace,Consolas,monospace';
      const bw = Math.max(...ln.map(s => g.measureText(s).width)) + 14;
      g.fillStyle = 'rgba(5,12,28,.88)'; g.fillRect(x + 12, y - 14, bw, 48);
      g.strokeStyle = c; g.lineWidth = 1; g.strokeRect(x + 12, y - 14, bw, 48);
      g.fillStyle = c; g.fillText(ln[0], x + 19, y - 1);
      g.fillStyle = '#dbe6f7'; g.fillText(ln[1], x + 19, y + 12); g.fillText(ln[2], x + 19, y + 25);
    });
  }
  
  function loop(n) {
    const dt = Math.min((n - last) / 1000, .2); last = n; sw = (sw + dt * 1.1) % (Math.PI * 2);
    if (run) T.forEach(t => {
      const k = dt * mult;
      t.x += t.s * Math.sin(t.h * D) * k;
      t.y += t.s * Math.cos(t.h * D) * k;
      const q = t.tr[t.tr.length - 1];
      if (!q || Math.hypot(t.x - q[0], t.y - q[1]) > 400) {
        t.tr.push([t.x, t.y]);
        if (t.tr.length > 50) t.tr.shift();
      }
    });
    const nl = T.length;
    T = T.filter(t => {
      if (Math.hypot(t.x, t.y) > 90000) { log('i', `${t.name} rời khỏi vùng giám sát`); return false; }
      return true;
    });
    T.forEach(an); acc += dt;
    if (acc > .4 || dirty || nl != T.length) { acc = 0; dirty = false; render(); }
    draw();
    window.__rafId = requestAnimationFrame(loop);
  }
  
  function pos(e) {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - W / 2) / S, y = -(e.clientY - r.top - H / 2) / S;
    return { x, y, b: (Math.atan2(x, y) / D + 360) % 360, d: Math.hypot(x, y) };
  }
  
  cv.onmousemove = e => {
    const p = pos(e);
    $('#hud').textContent = `${(ARP.la + p.y / KY).toFixed(5)}°N  ${(ARP.lo + p.x / KX).toFixed(5)}°E · BRG ${p.b.toFixed(0)}° · ${(p.d / 1000).toFixed(1)} km`;
  };
  cv.onclick = e => {
    const p = pos(e);
    $('#fB').value = Math.round(p.b);
    $('#fD').value = (p.d / 1000).toFixed(1);
    $('#fH').value = Math.round((p.b + 180) % 360);
    $('#hud').textContent = 'Đã chọn vị trí xuất hiện – bấm “+ Thêm UAV”';
  };
  
  const gv = id => {
      const el = $(id);
      return el ? +el.value : 0;
  };
  
  $('#bAdd').onclick = () => {
    mk({ n: $('#fN').value || '', b: gv('#fB'), d: gv('#fD'), h: gv('#fH'), s: gv('#fS') || 20, a: gv('#fA') });
    $('#fN').value = '';
  };
  $('#bAim').onclick = () => $('#fH').value = (gv('#fB') + 180) % 360;
  $('#bRnd').onclick = () => {
    const b = Math.round(Math.random() * 359);
    mk({ b, d: +(15 + Math.random() * 25).toFixed(1), h: (b + 180 + Math.round(Math.random() * 50 - 25)) % 360, s: 10 + Math.round(Math.random() * 25), a: 50 + Math.round(Math.random() * 400) });
  };
  $('#bClr').onclick = () => { T = []; dirty = true; };
  $('#bReset').onclick = () => { seed(); dirty = true; };
  $('#bPlay').onclick = e => { run = !run; e.target.textContent = run ? '⏸ Tạm dừng' : '▶ Tiếp tục'; };
  $('#sMult').onchange = e => mult = +e.target.value;
  $('#sRange').onchange = e => { range = +e.target.value; size(); };
  $('#vRadar').onclick = () => { mode = 'radar'; $('#vRadar').className = 'on'; $('#vMap').className = ''; };
  $('#vMap').onclick = () => { mode = 'map'; $('#vMap').className = 'on'; $('#vRadar').className = ''; };
  $('#bSnd').onclick = e => { snd = !snd; e.target.classList.toggle('on', snd); };
  
  const listEl = $('#list');
  if (listEl) {
      listEl.onclick = e => {
        const d = e.target.dataset.del;
        if (d) { T = T.filter(t => t.id != d); dirty = true; }
      };
  }
  
  document.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button,.pane').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const target = $('#' + b.dataset.p);
      if(target) target.classList.add('on');
    };
  });
  
  window.__intId = setInterval(() => {
    const n = Date.now();
    const utcEl = $('#utc');
    const ictEl = $('#ict');
    if (utcEl) utcEl.textContent = new Date(n).toISOString().substr(11, 8);
    if (ictEl) ictEl.textContent = new Date(n + 7 * 36e5).toISOString().substr(11, 8);
  }, 1000);
  
  window.addEventListener('resize', size);
  seed();
  size();
  window.__rafId = requestAnimationFrame(loop);
}
