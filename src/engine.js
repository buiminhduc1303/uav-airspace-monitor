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
  const ZR = { a0: ZP.a0 - 7000, a1: ZP.a1 + 7000, c0: ZP.c0 - 4500, c1: ZP.c1 + 4500 };

  const toXY = (a, c) => ({
    x: a * U.x + c * V.x,
    y: a * U.y + c * V.y
  });

  // 4 Radars: R = 25 km / radar, placed 17.5 km from ARP in 4 directions
  const radars = [
    { id: 'R1', name: 'Radar R1 – Bắc', x: 0, y: 17500, r: 25000 },
    { id: 'R2', name: 'Radar R2 – Đông', x: 17500, y: 0, r: 25000 },
    { id: 'R3', name: 'Radar R3 – Nam', x: 0, y: -17500, r: 25000 },
    { id: 'R4', name: 'Radar R4 – Tây', x: -17500, y: 0, r: 25000 },
  ];

  // 14 Camera EO/IR/PTZ: R = 6 km / camera (7 Bắc C-N1..N7, 7 Nam C-S1..S7)
  const cameras = [];
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    const a = ZP.a0 + t * (ZP.a1 - ZP.a0);
    const pN = toXY(a, ZP.c0);
    cameras.push({ id: 'C-N' + (k + 1), name: 'C-N' + (k + 1), side: 'N', x: pN.x, y: pN.y, r: 6000 });
    const pS = toXY(a, ZP.c1);
    cameras.push({ id: 'C-S' + (k + 1), name: 'C-S' + (k + 1), side: 'S', x: pS.x, y: pS.y, r: 6000 });
  }

  // 8 RF stations: R = 12 km / station
  const rfStations = [
    { id: 'RF-N1', name: 'RF-N1', ...toXY(ZP.a0 + 0.18 * (ZP.a1 - ZP.a0), ZP.c0), r: 12000 },
    { id: 'RF-N2', name: 'RF-N2', ...toXY(ZP.a0 + 0.50 * (ZP.a1 - ZP.a0), ZP.c0), r: 12000 },
    { id: 'RF-N3', name: 'RF-N3', ...toXY(ZP.a0 + 0.82 * (ZP.a1 - ZP.a0), ZP.c0), r: 12000 },
    { id: 'RF-S1', name: 'RF-S1', ...toXY(ZP.a0 + 0.18 * (ZP.a1 - ZP.a0), ZP.c1), r: 12000 },
    { id: 'RF-S2', name: 'RF-S2', ...toXY(ZP.a0 + 0.50 * (ZP.a1 - ZP.a0), ZP.c1), r: 12000 },
    { id: 'RF-S3', name: 'RF-S3', ...toXY(ZP.a0 + 0.82 * (ZP.a1 - ZP.a0), ZP.c1), r: 12000 },
    { id: 'RF-W', name: 'RF-W', ...toXY(ZP.a0 - 4500, (ZP.c0 + ZP.c1) / 2), r: 12000 },
    { id: 'RF-E', name: 'RF-E', ...toXY(ZP.a1 + 4500, (ZP.c0 + ZP.c1) / 2), r: 12000 }
  ];

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
    } catch (e) { }
  }

  function log(l, m) {
    logs.unshift({ t: hm(), l, m });
    if (logs.length > 80) logs.pop();
    dirty = true;
    if (l != 'i') beep(l == 'd' ? 1000 : 700, .2);
  }

  function mk(o) {
    const id = 'UAV-' + String(++seq).padStart(3, '0');
    let x, y, bDeg, dKm;
    if (o.x !== undefined && o.y !== undefined) {
      x = o.x;
      y = o.y;
      bDeg = Math.round((Math.atan2(x, y) / D + 360) % 360);
      dKm = (Math.hypot(x, y) / 1000).toFixed(1);
    } else {
      bDeg = Math.round(((o.b ?? 0) % 360 + 360) % 360);
      dKm = (o.d ?? 20).toFixed(1);
      const bRad = bDeg * D, r = (o.d ?? 20) * 1000;
      x = r * Math.sin(bRad);
      y = r * Math.cos(bRad);
    }

    const inRadar = radars.some(rad => Math.hypot(x - rad.x, y - rad.y) <= rad.r);
    const actualName = (o.n || id).replace(/[<>&"]/g, '');

    // Nếu mục tiêu ra khỏi tầm phủ Radar thì biến mất khỏi hệ thống
    if (!inRadar) {
      log('w', `Mục tiêu ${actualName} ngoài tầm phủ Radar (${dKm} km) – biến mất khỏi hệ thống`);
      return null;
    }

    const initialSpeed = o.s || 20;
    const maxSpeed = o.maxSpeed || Math.max(initialSpeed, 25);
    const isParallel = !!o.isParallel;

    const t = {
      id,
      name: actualName,
      dispName: 'UNKNOWN',
      sensorLevel: 'none',
      sensorLabel: 'NGOÀI TẦM',
      x,
      y,
      h: ((o.h % 360) + 360) % 360,
      s: initialSpeed,
      initialSpeed,
      maxSpeed,
      alt: o.a ?? 150,
      tr: [],
      st: -1,
      w: false,
      wR: false,
      inRadar: true,
      wasInRadar: true,
      an: {},
      isParallel,
      scenario: o.scenario || (isParallel ? {
        phase: 'parallel',
        elapsed: 0,
        delay: o.delay ?? 15,
        initialSpeed,
        speedDrop: 4.5,
        targetTurnHeading: 110,
        originalHeading: ((o.h % 360) + 360) % 360,
        accelRate: 0.8,
        maxSpeed,
        accelStartTime: (o.delay ?? 15) + 3,
        maxSpeedLogged: false
      } : null)
    };

    T.push(t);
    log('i', `Mục tiêu ${actualName} (${id}) xuất hiện trong tầm Radar – hướng ${bDeg}°, cách ARP ${dKm} km, cao ${t.alt} m, hướng ${Math.round(t.h)}°, ${t.s} m/s`);
    return t;
  }

  function addParallelUAV(opts = {}) {
    // North boundary is c = ZR.c0 (-9857.5 m). 3 km outside is c = ZR.c0 - 3000
    const targetC = ZR.c0 - 3000;
    // Start along-track at a = -16000 (southwest end of corridor, inside radar coverage)
    const targetA = opts.a ?? -16000;
    const p = toXY(targetA, targetC);
    const initialSpeed = opts.s ?? 20;
    const maxSpeed = opts.maxSpeed ?? 25;
    const delay = opts.delay ?? 15;
    const speedDrop = 4.5; // Giảm 4-5 m/s so với ban đầu
    const targetTurnHeading = 110; // Đổi hướng bay vào khu vực hạn chế / sân bay

    let parallelName = opts.name;
    if (!parallelName) {
      let count = 5;
      while (T.some(t => t.name === `UAV-X${count}`)) {
        count++;
      }
      parallelName = `UAV-X${count}`;
    }

    const t = mk({
      n: parallelName,
      x: p.x,
      y: p.y,
      h: 69, // Song song hoàn toàn với đường biên vùng hạn chế (trục 069°)
      s: initialSpeed,
      maxSpeed: maxSpeed,
      a: opts.alt ?? 150,
      isParallel: true,
      scenario: {
        phase: 'parallel', // 'parallel' -> 'turning' -> 'accelerating'
        elapsed: 0,
        delay,
        initialSpeed,
        speedDrop,
        targetTurnHeading,
        originalHeading: 69,
        accelRate: 0.8,
        maxSpeed,
        accelStartTime: delay + 3,
        maxSpeedLogged: false
      }
    });

    if (t) {
      log('i', `🟢 Mục tiêu ${t.name} (${t.id}) triển khai bay song song và cách vùng hạn chế 3.00 km (hướng 069°, ${t.s} m/s) – Trạng thái: AN TOÀN (đường xanh)`);
      dirty = true;
    }
    return t;
  }

  function triggerManeuver(t) {
    if (!t.scenario) return;
    const sc = t.scenario;
    const oldH = t.h;
    const oldS = t.s;
    t.h = sc.targetTurnHeading;
    t.s = Math.max(2, Math.round((sc.initialSpeed - sc.speedDrop) * 10) / 10);
    sc.phase = 'turning';
    sc.elapsed = sc.delay;
    sc.accelStartTime = sc.delay + 3;
    sc.maxSpeedLogged = false;
    dirty = true;
    log('w', `🔄 [Kịch bản] ${t.dispName} (${t.id}) đổi hướng bay (${Math.round(oldH)}° → ${Math.round(t.h)}°) và giảm vận tốc 4.5 m/s (${oldS} m/s → ${t.s} m/s)`);
    render();
  }

  function resetParallelUAV(t) {
    if (!t.scenario) return;
    const sc = t.scenario;
    const targetC = ZR.c0 - 3000;
    const targetA = -16000;
    const p = toXY(targetA, targetC);
    t.x = p.x;
    t.y = p.y;
    t.h = sc.originalHeading;
    t.s = sc.initialSpeed;
    t.tr = [];
    t.st = 0;
    t.w = false;
    t.wR = false;
    sc.phase = 'parallel';
    sc.elapsed = 0;
    sc.maxSpeedLogged = false;
    dirty = true;
    log('i', `↺ [Kịch bản] ${t.dispName} (${t.id}) đặt lại bay song song cách vùng hạn chế 3.00 km (${t.s} m/s, hướng 069°)`);
    render();
  }

  function seed() {
    T = []; seq = 0; logs = [];
    // Mục tiêu UAV bay song song cách vùng hạn chế 3km (Đường xanh, tên giống UAV khác: UAV-X5)
    addParallelUAV({
      name: 'UAV-X5',
      s: 20,
      maxSpeed: 25,
      alt: 150,
      delay: 15
    });

    mk({ n: 'UAV-X1', b: 265, d: 30, h: 85, s: 20, maxSpeed: 25, a: 150 });
    mk({ n: 'UAV-X2', b: 120, d: 32, h: 200, s: 25, maxSpeed: 30, a: 300 });
    mk({ n: 'UAV-X3', b: 45, d: 28, h: 225, s: 28, maxSpeed: 35, a: 120 });
    mk({ n: 'UAV-X4', b: 330, d: 35, h: 60, s: 18, maxSpeed: 25, a: 200 });
    mk({ n: 'SWALLOW', b: 180, d: 30, h: 0, s: 20, maxSpeed: 25, a: 50 });
    mk({ n: 'SPARROW', b: 210, d: 25, h: 45, s: 15, maxSpeed: 20, a: 30 });
  }

  function an(t) {
    const inRadar = radars.some(r => Math.hypot(t.x - r.x, t.y - r.y) <= r.r);
    const inRF = rfStations.some(s => Math.hypot(t.x - s.x, t.y - s.y) <= s.r);
    const inCamera = cameras.some(c => Math.hypot(t.x - c.x, t.y - c.y) <= c.r);

    t.inRadar = inRadar;
    t.inRF = inRF;
    t.inCamera = inCamera;

    const b = (Math.atan2(t.x, t.y) / D + 360) % 360;
    const d = Math.hypot(t.x, t.y);

    // If outside radar coverage: target is invisible and untracked
    if (!inRadar) {
      t.dispName = 'UNKNOWN';
      t.sensorLevel = 'none';
      t.sensorLabel = 'NGOÀI TẦM';
      t.an = { eP: null, eR: null, dP: dz(ZP, t.x, t.y), dR: dz(ZR, t.x, t.y), d, b };
      t.st = 0;
      return 0;
    }

    let dispName, sensorLevel, sensorLabel;
    if (inCamera) {
      dispName = t.name;
      sensorLevel = 'cam';
      sensorLabel = 'EO/IR';
    } else if (inRF) {
      dispName = 'PROBABLE ' + t.name;
      sensorLevel = 'rf';
      sensorLabel = 'RADAR + RF';
    } else {
      dispName = 'UNKNOWN';
      sensorLevel = 'radar';
      sensorLabel = 'RADAR';
    }

    t.dispName = dispName;
    t.sensorLevel = sensorLevel;
    t.sensorLabel = sensorLabel;

    // Log when target enters radar coverage for the first time
    if (!t.wasInRadar) {
      t.wasInRadar = true;
      log('i', `📡 Radar phát hiện mục tiêu xuất hiện: ${dispName} (${t.id}) – cách ARP ${fm(d)}, cao ${t.alt} m, ${t.s} m/s`);
    }

    if (t.prevSensorLevel !== undefined && t.prevSensorLevel !== sensorLevel) {
      if (sensorLevel === 'cam') {
        log('i', `📷 Camera EO/IR nhận dạng chính xác mục tiêu: ${t.name} (${t.id})`);
      } else if (sensorLevel === 'rf' && t.prevSensorLevel === 'radar') {
        log('i', `📶 Trạm RF phát hiện tín hiệu: PROBABLE ${t.name} (${t.id})`);
      }
    }
    t.prevSensorLevel = sensorLevel;

    const eP = eta(ZP, t), eR = eta(ZR, t), dP = dz(ZP, t.x, t.y), dR = dz(ZR, t.x, t.y);
    const m = Math.min(eP ?? 1e9, eR ?? 1e9);

    // Check if heading towards restricted zone and distance <= 3000m
    const approachingRestricted = eR !== null && dR > 0 && dR <= 3000;

    // For parallel flying target in safe phase, enforce st = 0
    let st;
    if (t.isParallel && t.scenario && t.scenario.phase === 'parallel') {
      st = 0;
    } else {
      st = dP == 0 ? 3 : dR == 0 ? 2 : (m <= 180 || approachingRestricted) ? 1 : 0;
    }
    t.an = { eP, eR, dP, dR, d, b };

    if (st != t.st) {
      if (st == 3) log('d', `⚠ ${t.dispName} (${t.id}) ĐÃ XÂM NHẬP VÙNG CẤM BAY – cao ${t.alt} m, ${t.s} m/s`);
      else if (st == 2) log('w', `${t.dispName} (${t.id}) vào vùng hạn chế bay`);
      else if (st == 1) {
        if (approachingRestricted) {
          log('w', `${t.dispName} (${t.id}) tiến gần vùng hạn chế (cách ${fm(dR)}) – nguy cơ xâm nhập`);
        } else {
          log('w', `${t.dispName} (${t.id}) có nguy cơ xâm nhập – dự báo ${m}s`);
        }
      }
      else if (t.st >= 0) log('i', `${t.dispName} (${t.id}) trở lại trạng thái an toàn`);
      t.st = st;
    }

    if (approachingRestricted && !t.wR) {
      t.wR = true;
      if (st == 1) log('w', `${t.dispName} (${t.id}) đang tiến sát vùng hạn chế (cách ${fm(dR)})`);
    }
    if (!approachingRestricted) t.wR = false;

    if (eP && eP <= 60 && !t.w) {
      t.w = true;
      log('d', `${t.dispName} (${t.id}) ở hướng ${Math.round(t.an.b)}°, cách vùng cấm ${fm(dP)}, cao ${t.alt} m, ${t.s} m/s, khoảng ${eP}s nữa xâm nhập`);
    }
    if (eP === null || eP > 90) t.w = false;

    return st;
  }

  function render() {
    const visible = T.filter(t => t.inRadar);
    let w = 0, i = 0, safe = 0;
    visible.forEach(t => {
      if (t.st == 3) i++;
      else if (t.st > 0) w++;
      else safe++;
    });

    const elSafe = $('#cSafe');
    const elWarn = $('#cWarn');
    const elDanger = $('#cDanger');
    const ztDangerBadge = $('#ztDangerBadge');

    if (elSafe) elSafe.textContent = safe;
    if (elWarn) elWarn.textContent = w;
    if (elDanger) elDanger.textContent = i;
    if (ztDangerBadge) {
      ztDangerBadge.classList.toggle('active', i > 0);
    }

    $('#nT').textContent = visible.length;
    $('#nW').textContent = w;
    $('#nI').textContent = i;
    const bg = $('#bg');
    if (bg) bg.textContent = i + w;
    $('#hT').textContent = 'Danh sách mục tiêu (' + visible.length + ')';

    $('#list').innerHTML = visible.map(t => {
      const a = t.an || {};
      const sc = t.scenario;
      let scHtml = '';
      if (sc) {
        let badgeClass = 'sc-safe';
        let statusText = '';
        if (sc.phase === 'parallel') {
          const rem = Math.max(0, Math.ceil(sc.delay - sc.elapsed));
          badgeClass = 'sc-safe';
          statusText = `🟢 Bay song song 3km (An toàn · Đổi hướng & giảm vận tốc sau ${rem}s)`;
        } else if (sc.phase === 'turning') {
          badgeClass = 'sc-warn';
          statusText = `🟡 Đã đổi hướng (${Math.round(t.h)}°) & Giảm tốc (-${sc.speedDrop} m/s: ${t.s} m/s)`;
        } else {
          badgeClass = 'sc-accel';
          statusText = `⚡ Đang tăng tốc (${t.s} m/s)`;
        }
        scHtml = `
          <div class="sc-box">
            <div class="sc-status ${badgeClass}">${statusText}</div>
            <div class="sc-actions">
              ${sc.phase === 'parallel'
                ? `<button class="sc-btn pri" data-trigger-sc="${t.id}" title="Kích hoạt đổi hướng và giảm vận tốc ngay">⚡ Đổi hướng & Giảm tốc ngay</button>`
                : `<button class="sc-btn" data-reset-sc="${t.id}" title="Đặt lại về vị trí song song 3km ban đầu">↺ Đặt lại song song 3km</button>`
              }
            </div>
          </div>
        `;
      }

      return `<div class="card s${t.st}" data-card-id="${t.id}">
        <div class="ch">
          <b>${t.dispName}</b><span class="id">${t.id}</span>
          <span class="chip sens-${t.sensorLevel}">${t.sensorLabel}</span>
          <span class="chip c${t.st}">${SN[t.st]}</span>
          <button data-del="${t.id}" title="Xoá">✕</button>
        </div>
        <div class="target-subhead">
          <span class="hd-badge">Hướng bay: <b>${t.h.toFixed(0)}°</b></span>
        </div>
        <div class="gr">
          <span>CÁCH ARP<b>${fm(a.d)}</b></span>
          <span>BRG TỪ ARP<b>${a.b !== undefined ? a.b.toFixed(0) : '--'}°</b></span>
          <span>ĐỘ CAO<b>${t.alt} m</b></span>
          <span>TỐC ĐỘ<b>${t.s} m/s</b></span>
          <span>HƯỚNG BAY<b>${t.h.toFixed(0)}°</b></span>
          <span>CÁCH VÙNG CẤM<b>${fm(a.dP)}</b></span>
          <span>CÁCH VÙNG HẠN CHẾ<b>${fm(a.dR)}</b></span>
          <span class="span-2">ETA VÙNG CẤM<b>${a.eP === 0 ? 'ĐÃ VÀO' : a.eP == null ? '--' : a.eP + ' s'}</b></span>
        </div>
        ${scHtml}
        <div class="c-adj">
          <div class="adj-grp">
            <span class="adj-lbl">Độ cao:</span>
            <button data-adj-alt="-50" data-id="${t.id}" title="Giảm 50m">-50m</button>
            <button data-adj-alt="-20" data-id="${t.id}" title="Giảm 20m">-20m</button>
            <button data-adj-alt="-10" data-id="${t.id}" title="Giảm 10m">-10m</button>
            <b>${t.alt} m</b>
            <button data-adj-alt="10" data-id="${t.id}" title="Tăng 10m">+10m</button>
            <button data-adj-alt="20" data-id="${t.id}" title="Tăng 20m">+20m</button>
            <button data-adj-alt="50" data-id="${t.id}" title="Tăng 50m">+50m</button>
          </div>
          <div class="adj-grp">
            <span class="adj-lbl">Tốc độ:</span>
            <button data-adj-spd="-5" data-id="${t.id}" title="Giảm 5 m/s">-5</button>
            <button data-adj-spd="-2" data-id="${t.id}" title="Giảm 2 m/s">-2</button>
            <button data-adj-spd="-1" data-id="${t.id}" title="Giảm 1 m/s">-1</button>
            <b>${t.s} m/s</b>
            <button data-adj-spd="1" data-id="${t.id}" title="Tăng 1 m/s">+1</button>
            <button data-adj-spd="2" data-id="${t.id}" title="Tăng 2 m/s">+2</button>
            <button data-adj-spd="5" data-id="${t.id}" title="Tăng 5 m/s">+5</button>
          </div>
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

    // Zones
    poly(ZR, 'rgba(255,176,32,.10)', 'rgba(255,176,32,.85)');
    poly(ZP, 'rgba(255,77,79,.14)', 'rgba(255,77,79,.95)');

    // North Arrow (BẮC) in top-left
    const nx = 45, ny = 65;
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(nx, ny + 28);
    g.lineTo(nx, ny);
    g.lineTo(nx - 4, ny + 8);
    g.moveTo(nx, ny);
    g.lineTo(nx + 4, ny + 8);
    g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold 11px ui-monospace,Consolas,monospace';
    g.textAlign = 'center';
    g.fillText('BẮC', nx, ny - 6);
    g.textAlign = 'left';

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
    const placedBoxes = [];

    // Chỉ hiển thị các mục tiêu nằm trong tầm phủ của Radar
    const visibleTargets = T.filter(t => t.inRadar);

    visibleTargets.forEach(t => {
      const c = SC[t.st] || '#19d38c', x = sx(t.x), y = sy(t.y), a = t.an || {};
      g.fillStyle = c;
      t.tr.forEach((p, k) => {
        g.globalAlpha = k / t.tr.length * .6;
        g.fillRect(sx(p[0]) - 1, sy(p[1]) - 1, 2.5, 2.5);
      });
      g.globalAlpha = 1;

      // Projected trajectory line: green for safe parallel, warning color if entering/approaching
      const L = Math.min(a.eP ?? 600, 600) * t.s, hx = Math.sin(t.h * D), hy = Math.cos(t.h * D);
      g.strokeStyle = c; g.globalAlpha = .8; g.setLineDash([4, 4]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(sx(t.x + hx * L), sy(t.y + hy * L)); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;

      // Heading vector tick
      g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x - hx * 26, y + hy * 26); g.stroke();

      if (t.st >= 2) {
        const p = (now / 700) % 1;
        g.globalAlpha = 1 - p; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 8 + p * 22, 0, 7); g.stroke(); g.globalAlpha = 1;
      }

      g.fillStyle = c; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();

      const isParallelSafe = t.isParallel && t.scenario && t.scenario.phase === 'parallel';
      const ln = [
        t.dispName,
        `Hướng bay: ${Math.round(t.h)}°`,
        `${fm(a.d)} (ARP) · ${t.alt} m · ${t.s} m/s`,
        isParallelSafe
          ? `Song song ZR (cách 3.00 km) · AN TOÀN`
          : (a.eP === 0 ? 'ĐÃ XÂM NHẬP VÙNG CẤM' : (a.eP == null ? 'Vùng cấm: ' + fm(a.dP) : 'Vùng cấm: ' + fm(a.dP) + ' · ETA ' + a.eP + 's'))
      ];
      g.font = '11px ui-monospace,Consolas,monospace';
      const bw = Math.max(...ln.map(s => g.measureText(s).width)) + 16;
      const bh = 64;

      // Candidate positions for label tag to avoid overlap with other boxes
      const candidates = [
        { bx: x + 14, by: y - 18 },             // Top-Right
        { bx: x + 14, by: y + 10 },             // Bottom-Right
        { bx: x - bw - 14, by: y - 18 },        // Top-Left
        { bx: x - bw - 14, by: y + 10 },        // Bottom-Left
        { bx: x - bw / 2, by: y - bh - 16 },    // Top-Center
        { bx: x - bw / 2, by: y + 20 },         // Bottom-Center
        { bx: x + 14, by: y - bh - 24 },        // Far Top-Right
        { bx: x - bw - 14, by: y - bh - 24 },   // Far Top-Left
        { bx: x + 14, by: y + bh + 14 },        // Far Bottom-Right
        { bx: x - bw - 14, by: y + bh + 14 }    // Far Bottom-Left
      ];

      let best = candidates[0];
      let minOverlap = Infinity;

      for (const cand of candidates) {
        const cx_box = Math.max(8, Math.min(W - bw - 8, cand.bx));
        const cy_box = Math.max(8, Math.min(H - bh - 8, cand.by));

        let overlap = 0;
        for (const pb of placedBoxes) {
          const ox = Math.max(0, Math.min(cx_box + bw, pb.x + pb.w) - Math.max(cx_box, pb.x));
          const oy = Math.max(0, Math.min(cy_box + bh, pb.y + pb.h) - Math.max(cy_box, pb.y));
          overlap += ox * oy;
        }

        // Avoid obscuring the UAV symbol itself
        if (cx_box <= x + 8 && cx_box + bw >= x - 8 && cy_box <= y + 8 && cy_box + bh >= y - 8) {
          overlap += 4000;
        }

        if (overlap < minOverlap) {
          minOverlap = overlap;
          best = { bx: cx_box, by: cy_box };
          if (overlap === 0) break;
        }
      }

      placedBoxes.push({ x: best.bx, y: best.by, w: bw, h: bh });

      // Leader pointer line from target dot to label box
      const leaderX = best.bx > x ? best.bx : best.bx + bw;
      const leaderY = best.by + bh / 2;
      g.strokeStyle = 'rgba(180,220,255,.35)';
      g.lineWidth = 1;
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(leaderX, leaderY);
      g.stroke();
      g.setLineDash([]);

      g.fillStyle = 'rgba(5,12,28,.90)';
      g.fillRect(best.bx, best.by, bw, bh);
      g.strokeStyle = c;
      g.lineWidth = 1;
      g.strokeRect(best.bx, best.by, bw, bh);

      g.fillStyle = c;
      g.fillText(ln[0], best.bx + 8, best.by + 14);
      g.fillStyle = '#64b5f6';
      g.fillText(ln[1], best.bx + 8, best.by + 27);
      g.fillStyle = '#dbe6f7';
      g.fillText(ln[2], best.bx + 8, best.by + 40);
      g.fillText(ln[3], best.bx + 8, best.by + 53);
    });
  }

  function loop(n) {
    const dt = Math.min((n - last) / 1000, .2); last = n; sw = (sw + dt * 1.1) % (Math.PI * 2);
    if (run) {
      const k = dt * mult;
      T.forEach(t => {
        t.x += t.s * Math.sin(t.h * D) * k;
        t.y += t.s * Math.cos(t.h * D) * k;
        const q = t.tr[t.tr.length - 1];
        if (!q || Math.hypot(t.x - q[0], t.y - q[1]) > 400) {
          t.tr.push([t.x, t.y]);
          if (t.tr.length > 50) t.tr.shift();
        }
      });

      // Update scenario UAVs (maneuvers, speed changes)
      T.forEach(t => {
        if (t.scenario) {
          const sc = t.scenario;
          sc.elapsed += dt;

          if (sc.phase === 'parallel') {
            if (sc.elapsed >= sc.delay) {
              triggerManeuver(t);
            }
          } else if (sc.phase === 'turning') {
            if (sc.elapsed >= sc.accelStartTime) {
              sc.phase = 'accelerating';
              dirty = true;
            }
          } else if (sc.phase === 'accelerating') {
            if (t.s < t.maxSpeed) {
              const accelFactor = mult > 20 ? 3 : 1;
              const newSpeed = Math.min(t.maxSpeed, t.s + sc.accelRate * dt * accelFactor);
              if (Math.abs(newSpeed - t.s) > 0.05) {
                t.s = Math.round(newSpeed * 10) / 10;
                dirty = true;
              }
              if (t.s >= t.maxSpeed && !sc.maxSpeedLogged) {
                sc.maxSpeedLogged = true;
                log('w', `⚡ [Kịch bản] ${t.dispName} (${t.id}) tăng tốc đạt giới hạn vận tốc: ${t.s} m/s`);
              }
            }
          }
        }
      });

      // Target separation & anti-overlap position nudge (< 2.5 km)
      const sepDist = 2500;
      for (let i = 0; i < T.length; i++) {
        for (let j = i + 1; j < T.length; j++) {
          const t1 = T[i], t2 = T[j];
          const dx = t1.x - t2.x, dy = t1.y - t2.y;
          const dist = Math.hypot(dx, dy);
          if (dist < sepDist && dist > 1) {
            const push = ((sepDist - dist) / sepDist) * 10 * k;
            const nx = dx / dist, ny = dy / dist;
            t1.x += nx * push;
            t1.y += ny * push;
            t2.x -= nx * push;
            t2.y -= ny * push;
          }
        }
      }
    }

    const nl = T.length;
    // Nếu mục tiêu ra khỏi tầm phủ Radar thì biến mất
    T = T.filter(t => {
      const inRadar = radars.some(r => Math.hypot(t.x - r.x, t.y - r.y) <= r.r);
      if (!inRadar) {
        log('i', `📡 ${t.dispName || t.name} (${t.id}) ra khỏi tầm phủ Radar – mục tiêu biến mất`);
        return false;
      }
      return true;
    });

    T.forEach(an); acc += dt;
    if (acc > .25 || dirty || nl != T.length) { acc = 0; dirty = false; render(); }
    draw();
    window.__rafId = requestAnimationFrame(loop);
  }

  function separateTargets() {
    if (T.length <= 1) {
      log('i', '↔ Không có đủ mục tiêu để phân tách');
      return;
    }
    const n = T.length;
    T.forEach((t, i) => {
      const sector = (i * (360 / n) + 25) % 360;
      const targetRadius = 20000 + (i % 3) * 6000;
      t.x = targetRadius * Math.sin(sector * D);
      t.y = targetRadius * Math.cos(sector * D);
      t.h = (sector + 180 + (i % 2 === 0 ? 15 : -15) + 360) % 360;
      t.tr = [];
    });
    dirty = true;
    log('i', `↔ Đã phân tách ${n} mục tiêu UAV`);
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
    const r = cv.getBoundingClientRect();
    const mouseScreenX = e.clientX - r.left;
    const mouseScreenY = e.clientY - r.top;
    const clickedTarget = T.find(t => Math.hypot(sx(t.x) - mouseScreenX, sy(t.y) - mouseScreenY) <= 18);
    if (clickedTarget) {
      $('#hud').textContent = `Đã chọn ${clickedTarget.dispName} (${clickedTarget.id}) · Hướng: ${Math.round(clickedTarget.h)}° · Cao: ${clickedTarget.alt} m · V: ${clickedTarget.s} m/s – dùng nút ± dưới thẻ để chỉnh`;
      const card = document.querySelector(`.card[data-card-id="${clickedTarget.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        card.style.outline = '2px solid var(--ac)';
        setTimeout(() => card.style.outline = '', 2000);
      }
      return;
    }
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
    mk({
      n: $('#fN').value || '',
      b: gv('#fB'),
      d: gv('#fD'),
      h: gv('#fH'),
      s: gv('#fS') || 20,
      maxSpeed: gv('#fMaxS') || 25,
      a: gv('#fA') || 150
    });
    $('#fN').value = '';
  };

  const handleAddParallel = () => {
    let count = 5;
    while (T.some(t => t.name === `UAV-X${count}`)) {
      count++;
    }
    const defaultName = `UAV-X${count}`;

    addParallelUAV({
      name: $('#fN').value ? $('#fN').value : defaultName,
      s: gv('#fS') || 20,
      maxSpeed: gv('#fMaxS') || 25,
      alt: gv('#fA') || 150,
      delay: 15
    });
    $('#fN').value = '';
  };

  const bAddParallel = $('#bAddParallel');
  if (bAddParallel) bAddParallel.onclick = handleAddParallel;
  const bAddParallelForm = $('#bAddParallelForm');
  if (bAddParallelForm) bAddParallelForm.onclick = handleAddParallel;

  window.handleAddParallel = handleAddParallel;
  window.separateTargets = separateTargets;

  $('#bAim').onclick = () => $('#fH').value = (gv('#fB') + 180) % 360;
  $('#bRnd').onclick = () => {
    const b = Math.round(Math.random() * 359);
    mk({
      b,
      d: +(15 + Math.random() * 25).toFixed(1),
      h: (b + 180 + Math.round(Math.random() * 50 - 25)) % 360,
      s: 10 + Math.round(Math.random() * 25),
      maxSpeed: 30,
      a: 50 + Math.round(Math.random() * 400)
    });
  };
  $('#bClr').onclick = () => { T = []; dirty = true; };
  $('#bReset').onclick = () => { seed(); dirty = true; };
  const bSep = $('#bSep');
  if (bSep) bSep.onclick = separateTargets;
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
      if (d) { T = T.filter(t => t.id != d); dirty = true; return; }

      const triggerSc = e.target.dataset.triggerSc;
      if (triggerSc) {
        const t = T.find(x => x.id === triggerSc);
        if (t && t.scenario) {
          triggerManeuver(t);
        }
        return;
      }

      const resetSc = e.target.dataset.resetSc;
      if (resetSc) {
        const t = T.find(x => x.id === resetSc);
        if (t && t.scenario) {
          resetParallelUAV(t);
        }
        return;
      }

      const adjAlt = e.target.dataset.adjAlt;
      const targetId = e.target.dataset.id;
      if (adjAlt && targetId) {
        const t = T.find(x => x.id === targetId);
        if (t) {
          const oldAlt = t.alt;
          t.alt = Math.max(10, Math.min(4000, Math.round(t.alt + (+adjAlt))));
          dirty = true;
          log('i', `Điều chỉnh độ cao ${t.dispName} (${t.id}): ${oldAlt} m → ${t.alt} m (${+adjAlt > 0 ? '+' : ''}${adjAlt} m)`);
          render();
        }
        return;
      }

      const adjSpd = e.target.dataset.adjSpd;
      if (adjSpd && targetId) {
        const t = T.find(x => x.id === targetId);
        if (t) {
          const oldSpd = t.s;
          const maxAllowed = t.maxSpeed || 80;
          const newSpd = Math.max(2, Math.min(maxAllowed, Math.round((t.s + (+adjSpd)) * 10) / 10));
          if (newSpd === t.s && +adjSpd > 0) {
            log('w', `Mục tiêu ${t.dispName} (${t.id}) đã ở vận tốc tối đa (${t.s} m/s)`);
          } else {
            t.s = newSpd;
            dirty = true;
            log('i', `Điều chỉnh vận tốc ${t.dispName} (${t.id}): ${oldSpd} m/s → ${t.s} m/s`);
            render();
          }
        }
        return;
      }
    };
  }

  document.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button,.pane').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const target = $('#' + b.dataset.p);
      if (target) target.classList.add('on');
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
