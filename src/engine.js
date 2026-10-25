import { bearing, fmtDist, fmtClock } from './geometry.js';

// Early-warning horizon: a track that reaches a zone within WARN_T seconds is "warning"
export const WARN_T = 180;
const TICK = 0.25;      // real seconds between data ticks (derived values, cards, labels)
const TRAIL_SEC = 60;   // history trail length, simulated seconds
const VECTOR_SEC = 60;  // prediction vector length, simulated seconds

export function initEngine() {
  if (window.__rafId) cancelAnimationFrame(window.__rafId);
  if (window.__intId) clearInterval(window.__intId);
  window.__engineAbort?.abort();
  const { signal } = window.__engineAbort = new AbortController();

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

  // Zone outlines in the ENU frame (rotated rectangles along the 069° runway axis)
  const corners = z => [[z.a0, z.c0], [z.a1, z.c0], [z.a1, z.c1], [z.a0, z.c1]].map(([a, c]) => { const p = toXY(a, c); return [p.x, p.y]; });
  const PP = corners(ZP), PR = corners(ZR);

  // Colours come from CSS variables so the page and the canvas share one palette
  const css = (n, f) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;
  const C = {
    safe: css('--c-safe', '#19d38c'),
    warn: css('--c-warn', '#ffb020'),
    danger: css('--c-danger', '#ff4d4f'),
    select: css('--c-select', '#7dd3fc'),
    sweep: css('--c-sweep-rgb', '150,220,235'),
    ring: css('--c-ring-rgb', '96,170,200'),
    text: css('--c-radar-text', '#c9d6ea'),
    labelBg: css('--c-label-bg', 'rgba(6,12,24,.9)')
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };
  const cat = st => st === 3 ? 'd' : st >= 1 ? 'w' : 's';
  const colOf = st => st === 3 ? C.danger : st >= 1 ? C.warn : C.safe;
  const pad3 = v => String(Math.round(v) % 360).padStart(3, '0');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let listHold = false, listHover = false, listOrder = [], T = [], seq = 0, run = true, mult = 20, range = 40, snd = true, logs = [], last = performance.now(), sw = 0, dirty = true, ac, acc = 0, simT = 0;
  let selId = null, flashAt = 0, hoverId = null, showLabels = true, drag = null, dragMoved = false;
  let frames = 0, fpsAcc = 0;
  const filt = { s: true, w: true, d: true };
  const lblOff = {}; // label offsets dragged by the user, keyed by target id

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
    } catch { /* audio unavailable */ }
  }

  function log(l, m) {
    logs.unshift({ t: hm(), l, m });
    if (logs.length > 80) logs.pop();
    dirty = true;
    if (l != 'i') beep(l == 'd' ? 1000 : 700, .2);
  }

  const inRadarCover = (x, y) => radars.some(r => Math.hypot(x - r.x, y - r.y) <= r.r);

  function mk(o) {
    const id = 'UAV-' + String(++seq).padStart(3, '0');
    let x, y, bDeg, dKm;
    if (o.x !== undefined && o.y !== undefined) {
      x = o.x;
      y = o.y;
      bDeg = Math.round(bearing(x, y));
      dKm = (Math.hypot(x, y) / 1000).toFixed(1);
    } else {
      bDeg = Math.round(((o.b ?? 0) % 360 + 360) % 360);
      dKm = (o.d ?? 20).toFixed(1);
      const bRad = bDeg * D, r = (o.d ?? 20) * 1000;
      x = r * Math.sin(bRad);
      y = r * Math.cos(bRad);
    }

    const actualName = (o.n || id).replace(/[<>&"]/g, '');

    // Nếu mục tiêu ra khỏi tầm phủ Radar thì biến mất khỏi hệ thống
    if (!inRadarCover(x, y)) {
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
      inPAt: null,
      inRadar: true,
      dv: null,
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
    derive(t);
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
    log('w', `🔄 [Kịch bản] ${t.dispName} (${t.id}) đổi hướng bay (${Math.round(oldH)}° → ${Math.round(t.h)}°) và giảm vận tốc 4.5 m/s (${oldS} m/s → ${t.s} m/s)`);
    tick();
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
    t.w = false;
    sc.phase = 'parallel';
    sc.elapsed = 0;
    sc.maxSpeedLogged = false;
    log('i', `↺ [Kịch bản] ${t.dispName} (${t.id}) đặt lại bay song song cách vùng hạn chế 3.00 km (${t.s} m/s, hướng 069°)`);
    tick();
  }

  function seed() {
    T = []; seq = 0; logs = []; selId = null; hoverId = null;
    Object.keys(lblOff).forEach(k => delete lblOff[k]);
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

  // Zone distance / ETA on the runway-aligned rectangles (data logic of the earlier version)
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

  // Every tick computes t.dv once; radar labels and cards only read it
  function derive(t) {
    const inRF = rfStations.some(s => Math.hypot(t.x - s.x, t.y - s.y) <= s.r);
    const inCamera = cameras.some(c => Math.hypot(t.x - c.x, t.y - c.y) <= c.r);
    t.inRadar = inRadarCover(t.x, t.y);

    // Displayed name follows sensor coverage: radar only → UNKNOWN, + RF → PROBABLE [name], camera → [name]
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
      st = dP == 0 ? 3 : dR == 0 ? 2 : (m <= WARN_T || approachingRestricted) ? 1 : 0;
    }

    const inP = dP == 0;
    if (inP && t.inPAt == null) t.inPAt = simT;
    if (!inP) t.inPAt = null;

    const dv = {
      distanceArp: Math.hypot(t.x, t.y),
      bearingArp: bearing(t.x, t.y),
      distToProhibited: dP,
      distToRestricted: dR,
      etaProhibited: eP,
      etaRestricted: eR,
      inProhibitedFor: inP ? simT - t.inPAt : 0,
      inP,
      inR: dR == 0,
      status: st,
      alt: t.alt,
      speed: t.s,
      heading: t.h
    };
    t.dv = dv;

    if (st != t.st) {
      if (st == 3) log('d', `⚠ ${t.dispName} (${t.id}) ĐÃ XÂM NHẬP VÙNG CẤM BAY – cao ${t.alt} m, ${t.s} m/s`);
      else if (st == 2) log('w', `${t.dispName} (${t.id}) vào vùng hạn chế bay`);
      else if (st == 1) {
        if (approachingRestricted) {
          log('w', `${t.dispName} (${t.id}) tiến gần vùng hạn chế (cách ${fmtDist(dR)}) – nguy cơ xâm nhập`);
        } else {
          log('w', `${t.dispName} (${t.id}) có nguy cơ xâm nhập – dự báo ${m}s`);
        }
      }
      else if (t.st >= 0) log('i', `${t.dispName} (${t.id}) trở lại trạng thái an toàn`);
      t.st = st;
    }

    if (approachingRestricted && !t.wR) {
      t.wR = true;
      if (st == 1) log('w', `${t.dispName} (${t.id}) đang tiến sát vùng hạn chế (cách ${fmtDist(dR)})`);
    }
    if (!approachingRestricted) t.wR = false;

    if (eP && eP <= 60 && !t.w) {
      t.w = true;
      log('d', `${t.dispName} (${t.id}) ở hướng ${Math.round(dv.bearingArp)}°, cách vùng cấm ${fmtDist(dP)}, cao ${t.alt} m, ${t.s} m/s, khoảng ${eP}s nữa xâm nhập`);
    }
    if (eP === null || eP > 90) t.w = false;
  }

  function etaText(dv) {
    if (dv.inP) return { txt: 'Đã vào · ' + fmtClock(dv.inProhibitedFor), tip: 'Thời gian mục tiêu đã ở trong vùng cấm' };
    if (dv.etaProhibited == null) return { txt: '—', tip: 'Không hướng vào vùng' };
    return { txt: fmtClock(dv.etaProhibited), tip: 'Thời gian dự kiến tới vùng cấm (mm:ss)' };
  }

  const threat = (a, b) => {
    const ra = a.dv.status === 3 ? 0 : a.dv.status >= 1 ? 1 : 2, rb = b.dv.status === 3 ? 0 : b.dv.status >= 1 ? 1 : 2;
    if (ra !== rb) return ra - rb;
    if (ra === 0) return b.dv.inProhibitedFor - a.dv.inProhibitedFor;
    if (ra === 1) {
      const ea = Math.min(a.dv.etaProhibited ?? Infinity, a.dv.etaRestricted ?? Infinity);
      const eb = Math.min(b.dv.etaProhibited ?? Infinity, b.dv.etaRestricted ?? Infinity);
      if (ea !== eb) return ea - eb;
    }
    return a.dv.distanceArp - b.dv.distanceArp;
  };

  const shown = () => T.filter(t => t.inRadar && t.dv && filt[cat(t.dv.status)]);

  function tick() {
    T.forEach(derive);
    $('#upd').textContent = hm() + 'Z';
    render();
  }

  function render() {
    const all = T.filter(t => t.inRadar && t.dv);
    let w = 0, i = 0, safe = 0;
    all.forEach(t => {
      if (t.dv.status == 3) i++;
      else if (t.dv.status > 0) w++;
      else safe++;
    });

    $('#cSafe').textContent = safe;
    $('#cWarn').textContent = w;
    $('#cDanger').textContent = i;
    $('#ztDangerBadge').classList.toggle('active', i > 0);

    // While the pointer is over the list keep the previous order so cards do not move under it
    const visible = shown().sort(threat);
    if (listHover) {
      const rank = id => { const k = listOrder.indexOf(id); return k < 0 ? Infinity : k; };
      visible.sort((a, b) => (rank(a.id) - rank(b.id)) || 0);
    }
    listOrder = visible.map(t => t.id);
    $('#hT').textContent = 'Danh sách mục tiêu (' + (visible.length === all.length ? visible.length : visible.length + '/' + all.length) + ')';

    const listHtml = visible.map(t => {
      const a = t.dv;
      const open = t.id === selId;
      const e = etaText(a);
      const sym = `<span class="sym sym-${cat(a.status)}" aria-hidden="true"></span>`;
      const row = `<div class="cr" data-sel="${t.id}" role="button" tabindex="0" aria-expanded="${open}" title="${open ? 'Thu gọn' : 'Xem chi tiết & điều chỉnh'}">
          ${sym}
          <b class="cn">${t.dispName}</b>
          <span class="chip c${a.status}">${SN[a.status]}</span>
          <span class="cv">${fmtDist(a.distanceArp)}</span>
          <span class="cv">${a.alt} m</span>
          <span class="cv eta${a.inP ? ' in' : ''}" title="${e.tip}">${a.inP ? e.txt : 'ETA ' + e.txt}</span>
          <svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>`;
      if (!open) return `<article class="card s${a.status}" data-card-id="${t.id}">${row}</article>`;

      const sc = t.scenario;
      let scHtml = '';
      if (sc) {
        let badgeClass = 'sc-safe';
        let statusText = '';
        if (sc.phase === 'parallel') {
          const rem = Math.max(0, Math.ceil(sc.delay - sc.elapsed));
          statusText = `🟢 Bay song song 3km (An toàn · Đổi hướng & giảm vận tốc sau ${rem}s)`;
        } else if (sc.phase === 'turning') {
          badgeClass = 'sc-warn';
          statusText = `🟡 Đã đổi hướng (${Math.round(a.heading)}°) & Giảm tốc (-${sc.speedDrop} m/s: ${a.speed} m/s)`;
        } else {
          badgeClass = 'sc-accel';
          statusText = `⚡ Đang tăng tốc (${a.speed} m/s)`;
        }
        scHtml = `
          <div class="sc-box">
            <div class="sc-status ${badgeClass}">${statusText}</div>
            <div class="sc-actions">
              ${sc.phase === 'parallel'
                ? `<button class="sc-btn pri" data-trigger-sc="${t.id}" title="Kích hoạt đổi hướng và giảm vận tốc ngay">⚡ Đổi hướng & Giảm tốc ngay</button>`
                : `<button class="sc-btn" data-reset-sc="${t.id}" title="Đưa mục tiêu về điểm xuất phát ban đầu: bay song song trục đường băng 069°, cách biên vùng hạn chế 3 km, khôi phục vận tốc ban đầu và chạy lại kịch bản đổi hướng sau ${sc.delay}s">↺ Chạy lại kịch bản bay song song</button>`
              }
            </div>
          </div>
        `;
      }

      // Keep the flash animation running across re-renders by offsetting it with a negative delay
      const fl = performance.now() - flashAt;
      const flash = fl < 1200 ? ` flash" style="animation-delay:-${Math.round(fl)}ms` : "";
      return `<article class="card s${a.status} open${flash}" data-card-id="${t.id}">
        ${row}
        <div class="cd">
          <div class="target-subhead">
            <span class="idn">${t.id}</span>
            <span class="chip sens-${t.sensorLevel}">${t.sensorLabel}</span>
            <button class="icon-btn" data-del="${t.id}" title="Xoá mục tiêu" aria-label="Xoá ${t.dispName}"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <div class="gr">
            <span>CÁCH ARP<b>${fmtDist(a.distanceArp)}</b></span>
            <span>BRG TỪ ARP<b>${pad3(a.bearingArp)}°</b></span>
            <span>ĐỘ CAO<b>${a.alt} m</b></span>
            <span>TỐC ĐỘ<b>${a.speed} m/s</b></span>
            <span>HƯỚNG BAY<b>${pad3(a.heading)}°</b></span>
            <span class="m-p">ĐẾN VÙNG CẤM<b>${fmtDist(a.distToProhibited)}</b></span>
            <span class="m-r">ĐẾN VÙNG HẠN CHẾ<b>${fmtDist(a.distToRestricted)}</b></span>
            <span class="span-2 m-eta" title="${e.tip}">ETA VÙNG CẤM<b>${e.txt}</b></span>
          </div>
          ${scHtml}
          <div class="c-adj">
            <div class="adj-grp">
              <span class="adj-lbl">Độ cao</span>
              <div class="adj-btns">
                <button data-adj-alt="-50" data-id="${t.id}" title="Giảm 50m">-50m</button>
                <button data-adj-alt="-20" data-id="${t.id}" title="Giảm 20m">-20m</button>
                <button data-adj-alt="-10" data-id="${t.id}" title="Giảm 10m">-10m</button>
              </div>
              <b>${a.alt} m</b>
              <div class="adj-btns">
                <button data-adj-alt="10" data-id="${t.id}" title="Tăng 10m">+10m</button>
                <button data-adj-alt="20" data-id="${t.id}" title="Tăng 20m">+20m</button>
                <button data-adj-alt="50" data-id="${t.id}" title="Tăng 50m">+50m</button>
              </div>
            </div>
            <div class="adj-grp">
              <span class="adj-lbl">Tốc độ</span>
              <div class="adj-btns">
                <button data-adj-spd="-5" data-id="${t.id}" title="Giảm 5 m/s">-5</button>
                <button data-adj-spd="-2" data-id="${t.id}" title="Giảm 2 m/s">-2</button>
                <button data-adj-spd="-1" data-id="${t.id}" title="Giảm 1 m/s">-1</button>
              </div>
              <b>${a.speed} m/s</b>
              <div class="adj-btns">
                <button data-adj-spd="1" data-id="${t.id}" title="Tăng 1 m/s">+1</button>
                <button data-adj-spd="2" data-id="${t.id}" title="Tăng 2 m/s">+2</button>
                <button data-adj-spd="5" data-id="${t.id}" title="Tăng 5 m/s">+5</button>
              </div>
            </div>
          </div>
        </div>
      </article>`;
    }).join('') || `<div class="empty">${all.length ? 'Không có mục tiêu khớp bộ lọc.' : 'Không gian bay an toàn – chưa có mục tiêu.'}</div>`;

    // Hold the list while a button inside it is pressed so the click is not lost to a re-render
    if (!listHold) {
      const listEl = $('#list');
      const focusSel = document.activeElement?.closest?.('#list [data-sel]')?.dataset.sel;
      // FLIP: animate cards that moved after re-sorting instead of letting them jump
      const before = {};
      listEl.querySelectorAll('.card').forEach(c => { before[c.dataset.cardId] = c.getBoundingClientRect().top; });
      listEl.innerHTML = listHtml;
      if (focusSel) listEl.querySelector(`[data-sel="${focusSel}"]`)?.focus({ preventScroll: true });
      if (!reduceMotion) {
        listEl.querySelectorAll('.card').forEach(c => {
          const prev = before[c.dataset.cardId];
          const dy = prev == null ? 0 : prev - c.getBoundingClientRect().top;
          if (Math.abs(dy) > 2) c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.7,.3,1)' });
        });
      }
    }

    $('#logs').innerHTML = logs.map(l => `<div class="al ${l.l}"><time>${l.t}Z</time><span>${l.m}</span></div>`).join('') || '<div class="empty">Chưa có cảnh báo.</div>';
  }

  // ---------------------------------------------------------------------------
  // Radar rendering
  // ---------------------------------------------------------------------------
  let W = 0, H = 0, S = 1, dpr = 1, hatch = null;

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

  function makeHatch() {
    const p = document.createElement('canvas');
    p.width = p.height = 10;
    const q = p.getContext('2d');
    q.strokeStyle = rgba(C.danger, .35);
    q.lineWidth = 1.2;
    q.beginPath(); q.moveTo(0, 10); q.lineTo(10, 0); q.moveTo(-5, 5); q.lineTo(5, -5); q.moveTo(5, 15); q.lineTo(15, 5); q.stroke();
    return g.createPattern(p, 'repeat');
  }

  function polyPath(pts) {
    g.beginPath();
    pts.forEach(([x, y], k) => k ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y)));
    g.closePath();
  }

  const FONT = '12px "JetBrains Mono", ui-monospace, Consolas, monospace';
  const FONT_B = '600 ' + FONT;
  const LH = 16; // 12px × 1.35 line-height, rounded
  const PADX = 8, PADY = 5;
  const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // N NE E SE S SW W NW
  const DISTS = [30, 50, 70];

  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  function boxAt(x, y, w, h, di, r) {
    const [ux, uy] = DIRS[di];
    const k = ux && uy ? Math.SQRT1_2 : 1;
    const ax = x + ux * k * r, ay = y + uy * k * r;
    return { x: ax - w / 2 * (1 - ux), y: ay - h / 2 * (1 - uy), w, h };
  }

  function cost(b, obs) {
    let c = 0;
    for (const o of obs) c += overlap(b, o) * (o.wt || 1);
    const ox = Math.max(0, 4 - b.x) + Math.max(0, b.x + b.w - (W - 4));
    const oy = Math.max(0, 4 - b.y) + Math.max(0, b.y + b.h - (H - 4));
    return c + (ox * b.h + oy * b.w) * 4;
  }

  function labelLines(t, full) {
    const a = t.dv;
    const dist = fmtDist(a.distanceArp).replace(' ', '');
    if (!full) return [t.dispName.replace(/UAV-/, ''), `${a.alt}m · ${a.speed} · ${dist}`];
    const e = etaText(a);
    return [
      t.dispName,
      `${SN[a.status]} · HDG ${pad3(a.heading)}°`,
      `${a.alt} m · ${a.speed} m/s`,
      `ARP ${fmtDist(a.distanceArp)} · BRG ${pad3(a.bearingArp)}°`,
      a.inP ? `Vùng cấm: ${e.txt}` : `Vùng cấm ${fmtDist(a.distToProhibited)} · ETA ${e.txt}`
    ];
  }

  // DOM overlays on top of the canvas are obstacles for label placement
  function domObstacles() {
    const cr = cv.getBoundingClientRect();
    return ['.lg', '.hud-wrap', '.cv-tools'].map(s => $(s)).filter(Boolean).map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left - cr.left - 4, y: r.top - cr.top - 4, w: r.width + 8, h: r.height + 8 };
    });
  }

  function symbol(st, x, y, size) {
    const c = colOf(st);
    g.fillStyle = c;
    g.strokeStyle = '#fff';
    g.lineWidth = 1.3;
    g.beginPath();
    if (st === 3) {
      const r = size + 1.5;
      g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
    } else if (st >= 1) {
      const r = size + 1;
      g.moveTo(x, y - r); g.lineTo(x + r * .93, y + r * .62); g.lineTo(x - r * .93, y + r * .62);
    } else {
      g.arc(x, y, size, 0, Math.PI * 2);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  function draw(now) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H / 2, R = range * 1000 * S;
    const obs = domObstacles();

    // 1. Background
    g.fillStyle = '#020712';
    g.fillRect(0, 0, W, H);
    const bgG = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    bgG.addColorStop(0, '#061a26');
    bgG.addColorStop(1, '#020a14');
    g.fillStyle = bgG;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();

    // 2. Range rings, axes, bearing ticks
    const rs = range > 20 ? [10, 20, 30, 40, 50, 60].filter(v => v <= range) : [range / 4, range / 2, range * 3 / 4, range];
    g.font = FONT;
    g.textBaseline = 'alphabetic';
    g.strokeStyle = `rgba(${C.ring},.35)`;
    g.fillStyle = C.text;
    g.lineWidth = 1;
    rs.forEach(v => {
      g.setLineDash([4, 5]);
      g.beginPath(); g.arc(cx, cy, v * 1000 * S, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      const txt = v + ' km', tw = g.measureText(txt).width;
      const tx = cx + 5, ty = cy - v * 1000 * S - 4;
      g.fillText(txt, tx, ty);
      obs.push({ x: tx - 2, y: ty - 13, w: tw + 4, h: 16 });
    });
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    g.strokeStyle = `rgba(${C.ring},.8)`;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();

    g.textAlign = 'center';
    for (let b = 0; b < 360; b += 30) {
      const an = b * D;
      g.beginPath();
      g.moveTo(cx + R * Math.sin(an) * .97, cy - R * Math.cos(an) * .97);
      g.lineTo(cx + R * Math.sin(an), cy - R * Math.cos(an));
      g.stroke();
      const lx = cx + R * .925 * Math.sin(an), ly = cy - R * .925 * Math.cos(an) + 4;
      g.fillStyle = b === 0 ? '#fff' : C.text;
      g.font = b === 0 ? FONT_B : FONT;
      g.fillText(b === 0 ? '000 N' : String(b).padStart(3, '0'), lx, ly);
      obs.push({ x: lx - 22, y: ly - 13, w: 44, h: 17 });
    }
    g.textAlign = 'left';
    g.font = FONT;

    // 3. Sweep – neutral cyan, max 0.12 opacity, fading behind the beam, under zones and targets
    if (g.createConicGradient && !reduceMotion) {
      const a = sw - Math.PI / 2, tail = Math.PI / 2.5;
      const cg = g.createConicGradient(a - tail, cx, cy);
      const f = tail / (Math.PI * 2);
      cg.addColorStop(0, `rgba(${C.sweep},0)`);
      cg.addColorStop(f, `rgba(${C.sweep},.12)`);
      cg.addColorStop(f + .001, `rgba(${C.sweep},0)`);
      cg.addColorStop(1, `rgba(${C.sweep},0)`);
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(${C.sweep},.12)`;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); g.stroke();
    }

    // 4. Zones
    polyPath(PR);
    g.fillStyle = rgba(C.warn, .08); g.fill();
    g.strokeStyle = C.warn; g.lineWidth = 1.5; g.setLineDash([7, 5]); g.stroke(); g.setLineDash([]);
    polyPath(PP);
    g.fillStyle = rgba(C.danger, .15); g.fill();
    hatch = hatch || makeHatch();
    g.fillStyle = hatch; g.fill();
    g.strokeStyle = C.danger; g.lineWidth = 2; g.stroke();

    const axisAng = Math.atan2(-U.y, U.x); // runway axis on screen
    const zoneLabel = (txt, a, c, col) => {
      const p = toXY(a, c);
      g.save();
      g.translate(sx(p.x), sy(p.y));
      g.rotate(axisAng);
      g.font = '600 11px "Inter", system-ui, sans-serif';
      g.fillStyle = col;
      g.textAlign = 'left';
      g.fillText(txt, 0, 0);
      const tw = g.measureText(txt).width;
      g.restore();
      // Axis-aligned bounds of the rotated text, so target labels avoid it
      const ca = Math.cos(axisAng), sa = Math.sin(axisAng), ox = sx(p.x), oy = sy(p.y);
      const pts = [[0, -11], [tw, -11], [tw, 3], [0, 3]].map(([u, v]) => [ox + u * ca - v * sa, oy + u * sa + v * ca]);
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      obs.push({ x: Math.min(...xs) - 2, y: Math.min(...ys) - 2, w: Math.max(...xs) - Math.min(...xs) + 4, h: Math.max(...ys) - Math.min(...ys) + 4 });
    };
    // Only label the restricted band when it is wide enough on screen to hold the text
    if ((ZP.c0 - ZR.c0) * S >= 18) zoneLabel('VÙNG HẠN CHẾ', ZR.a0 + 1200, ZR.c0 + 1600, rgba(C.warn, .9));
    zoneLabel('VÙNG CẤM UAV', ZP.a0 + 1200, ZP.c0 + 1600, rgba(C.danger, .95));

    // ARP + runways: obstacle now, drawn last so nothing covers it
    const rwPts = RW.map(r => [sx(r.p[0]), sy(r.p[1])]);
    const xs = rwPts.map(p => p[0]).concat(cx), ys = rwPts.map(p => p[1]).concat(cy);
    const arpBox = { x: Math.min(...xs) - 10, y: Math.min(...ys) - 10, w: Math.max(...xs) - Math.min(...xs) + 20, h: Math.max(...ys) - Math.min(...ys) + 34, wt: 50 }; // never cover the airport
    obs.push(arpBox);

    const vis = shown();
    const blinkOn = reduceMotion || now % 1000 < 600;

    // 5. History trails (last TRAIL_SEC of flight, fading with age)
    vis.forEach(t => {
      g.fillStyle = colOf(t.dv.status);
      t.tr.forEach(p => {
        const age = simT - p[2];
        g.globalAlpha = Math.max(0, 1 - age / TRAIL_SEC) * .7;
        g.fillRect(sx(p[0]) - 1.25, sy(p[1]) - 1.25, 2.5, 2.5);
      });
    });
    g.globalAlpha = 1;

    // 6. Prediction vectors: distance flown in VECTOR_SEC, dashed 1px; plus a short heading stick
    vis.forEach(t => {
      const x = sx(t.x), y = sy(t.y), hx = Math.sin(t.h * D), hy = Math.cos(t.h * D), L = t.s * VECTOR_SEC;
      g.strokeStyle = colOf(t.dv.status);
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(x, y); g.lineTo(sx(t.x + hx * L), sy(t.y + hy * L)); g.stroke();
      g.setLineDash([]);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + hx * 8, y - hy * 8); g.lineTo(x + hx * 18, y - hy * 18); g.stroke();
    });

    // 7. Targets
    vis.forEach(t => {
      const x = sx(t.x), y = sy(t.y), st = t.dv.status;
      if (t.id === selId) {
        const p = reduceMotion ? 0 : (now / 1200) % 1;
        g.strokeStyle = C.select; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1 - p;
        g.beginPath(); g.arc(x, y, 13 + p * 14, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      } else if (t.id === hoverId) {
        g.strokeStyle = rgba(C.select, .6); g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = st === 3 && !blinkOn ? .25 : 1;
      symbol(st, x, y, 6);
      g.globalAlpha = 1;
      obs.push({ x: x - 9, y: y - 9, w: 18, h: 18 });
    });

    // 8–9. Labels with leader lines
    const placed = [];
    const order = vis.slice().sort((a, b) => (b.id === selId) - (a.id === selId) || (b.id === hoverId) - (a.id === hoverId) || threat(a, b));
    order.forEach(t => {
      const full = t.id === selId || t.id === hoverId;
      if (!full && !showLabels) { t._box = null; return; }
      const x = sx(t.x), y = sy(t.y);
      const lines = labelLines(t, full);
      g.font = FONT_B;
      let w = g.measureText(lines[0]).width;
      g.font = FONT;
      for (let k = 1; k < lines.length; k++) w = Math.max(w, g.measureText(lines[k]).width);
      w = Math.ceil(w) + PADX * 2;
      const h = lines.length * LH + PADY * 2;
      const others = placed.concat(obs);

      let box;
      const off = lblOff[t.id];
      if (off) {
        box = { x: x + off.dx, y: y + off.dy, w, h };
      } else {
        const prev = t._lp && t._lp.full === full ? boxAt(x, y, w, h, t._lp.di, t._lp.r) : null;
        if (prev && cost(prev, others) === 0) {
          box = prev;
        } else {
          let best = null, bestC = Infinity, bestP = null;
          search:
          for (const r of DISTS) {
            for (let di = 0; di < 8; di++) {
              const b = boxAt(x, y, w, h, di, r);
              const c = cost(b, others);
              if (c < bestC) { bestC = c; best = b; bestP = { di, r }; }
              if (c === 0) break search;
            }
          }
          box = best;
          t._lp = { ...bestP, full };
        }
      }
      placed.push(box);
      t._box = box;

      // Leader line from the symbol edge to the nearest point of the label
      const px = Math.max(box.x, Math.min(x, box.x + box.w)), py = Math.max(box.y, Math.min(y, box.y + box.h));
      const dl = Math.hypot(px - x, py - y);
      if (dl > 10) {
        g.strokeStyle = 'rgba(200,215,235,.55)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + (px - x) / dl * 9, y + (py - y) / dl * 9); g.lineTo(px, py); g.stroke();
      }

      const c = colOf(t.dv.status);
      g.fillStyle = C.labelBg;
      g.fillRect(box.x, box.y, box.w, box.h);
      g.strokeStyle = t.id === selId ? C.select : rgba(c, .85);
      g.lineWidth = t.id === selId ? 1.5 : 1;
      g.strokeRect(box.x + .5, box.y + .5, box.w - 1, box.h - 1);
      g.textBaseline = 'top';
      lines.forEach((s, k) => {
        g.font = k === 0 ? FONT_B : FONT;
        g.fillStyle = k === 0 ? c : C.text;
        g.fillText(s, box.x + PADX, box.y + PADY + k * LH + 2);
      });
      g.textBaseline = 'alphabetic';
    });

    // 10. ARP & runways on top
    g.lineWidth = 4;
    g.strokeStyle = '#dbe6f7';
    [[0, 1], [2, 3]].forEach(([i, j]) => {
      g.beginPath(); g.moveTo(rwPts[i][0], rwPts[i][1]); g.lineTo(rwPts[j][0], rwPts[j][1]); g.stroke();
    });
    g.fillStyle = '#3b82f6';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = '700 12px "Inter", system-ui, sans-serif';
    g.textAlign = 'center';
    const vw = g.measureText('VVTS').width + 10;
    g.fillStyle = 'rgba(6,12,24,.85)';
    g.fillRect(cx - vw / 2, cy + 9, vw, 17);
    g.fillStyle = '#fff';
    g.fillText('VVTS', cx, cy + 22);
    g.textAlign = 'left';
  }

  function loop(n) {
    const realDt = (n - last) / 1000;
    const dt = Math.min(realDt, .2); last = n; sw = (sw + dt * 1.1) % (Math.PI * 2);
    frames++; fpsAcc += realDt;
    if (fpsAcc >= 1) { $('#fps').textContent = Math.round(frames / fpsAcc); frames = 0; fpsAcc = 0; }

    if (run) {
      const k = dt * mult;
      simT += k;
      T.forEach(t => {
        t.x += t.s * Math.sin(t.h * D) * k;
        t.y += t.s * Math.cos(t.h * D) * k;
        const q = t.tr[t.tr.length - 1];
        if (!q || simT - q[2] >= 2) t.tr.push([t.x, t.y, simT]);
        while (t.tr.length && simT - t.tr[0][2] > TRAIL_SEC) t.tr.shift();
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
              if (Math.abs(newSpeed - t.s) > 0.05) t.s = Math.round(newSpeed * 10) / 10;
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
      if (!inRadarCover(t.x, t.y)) {
        log('i', `📡 ${t.dispName} (${t.id}) ra khỏi tầm phủ Radar – mục tiêu biến mất`);
        if (selId === t.id) selId = null;
        return false;
      }
      return true;
    });

    acc += dt;
    if (acc >= TICK || dirty || nl != T.length) { acc = 0; dirty = false; tick(); }
    draw(n);
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

  // ---------------------------------------------------------------------------
  // Selection: radar ↔ card
  // ---------------------------------------------------------------------------
  function select(id, fromRadar) {
    selId = fromRadar ? id : (selId === id ? null : id);
    if (fromRadar) flashAt = performance.now();
    render();
    if (selId && fromRadar) {
      const card = document.querySelector(`.card[data-card-id="${selId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    }
  }

  function pos(e) {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const x = (mx - W / 2) / S, y = -(my - H / 2) / S;
    return { mx, my, x, y, b: bearing(x, y), d: Math.hypot(x, y) };
  }

  function hit(mx, my) {
    const vis = shown();
    for (let k = vis.length - 1; k >= 0; k--) {
      const b = vis[k]._box;
      if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return { t: vis[k], label: true };
    }
    let best = null, bd = 14;
    vis.forEach(t => {
      const d = Math.hypot(sx(t.x) - mx, sy(t.y) - my);
      if (d <= bd) { bd = d; best = t; }
    });
    return best ? { t: best, label: false } : null;
  }

  cv.onmousedown = e => {
    const p = pos(e), h = hit(p.mx, p.my);
    dragMoved = false;
    if (h && h.label) drag = { id: h.t.id, gx: p.mx - h.t._box.x, gy: p.my - h.t._box.y, x0: p.mx, y0: p.my };
  };
  cv.onmousemove = e => {
    const p = pos(e);
    if (drag) {
      const t = T.find(x => x.id === drag.id);
      if (t && (dragMoved || Math.hypot(p.mx - drag.x0, p.my - drag.y0) > 3)) {
        dragMoved = true;
        lblOff[t.id] = { dx: p.mx - drag.gx - sx(t.x), dy: p.my - drag.gy - sy(t.y) };
      }
      cv.style.cursor = 'grabbing';
      return;
    }
    const h = hit(p.mx, p.my);
    hoverId = h ? h.t.id : null;
    cv.style.cursor = h ? (h.label ? 'grab' : 'pointer') : 'crosshair';
    $('#hud').textContent = `${(ARP.la + p.y / KY).toFixed(5)}°N  ${(ARP.lo + p.x / KX).toFixed(5)}°E · BRG ${p.b.toFixed(0)}° · ${(p.d / 1000).toFixed(1)} km`;
  };
  cv.onmouseleave = () => { hoverId = null; };
  window.addEventListener('mouseup', () => { drag = null; }, { signal });
  cv.ondblclick = e => {
    const p = pos(e), h = hit(p.mx, p.my);
    if (h && h.label) { delete lblOff[h.t.id]; h.t._lp = null; }
  };
  cv.onclick = e => {
    if (dragMoved) { dragMoved = false; return; }
    const p = pos(e);
    const h = hit(p.mx, p.my);
    if (h) {
      const t = h.t, a = t.dv;
      $('#hud').textContent = `Đã chọn ${t.dispName} (${t.id}) · Hướng: ${pad3(a.heading)}° · Cao: ${a.alt} m · V: ${a.speed} m/s – dùng nút ± trong thẻ để chỉnh`;
      select(t.id, true);
      return;
    }
    $('#fB').value = Math.round(p.b);
    $('#fD').value = (p.d / 1000).toFixed(1);
    $('#fH').value = Math.round((p.b + 180) % 360);
    $('#addForm').open = true;
    $('#hud').textContent = 'Đã chọn vị trí xuất hiện – bấm “+ Thêm UAV”';
  };

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------
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

  window.handleAddParallel = handleAddParallel;
  window.separateTargets = separateTargets;

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
  $('#bClr').onclick = () => { T = []; selId = null; dirty = true; };
  $('#bReset').onclick = () => { seed(); dirty = true; };
  $('#bPlay').onclick = e => {
    run = !run;
    const b = e.currentTarget;
    b.classList.toggle('paused', !run);
    b.setAttribute('aria-pressed', String(!run));
    b.querySelector('.lbl').textContent = run ? 'Tạm dừng' : 'Tiếp tục';
  };
  $('#sMult').onchange = e => mult = +e.target.value;
  $('#sRange').onchange = e => { range = +e.target.value; size(); };
  $('#bSnd').onclick = e => {
    snd = !snd;
    const b = e.currentTarget;
    b.classList.toggle('on', snd);
    b.setAttribute('aria-pressed', String(snd));
    b.querySelector('.lbl').textContent = 'Âm báo: ' + (snd ? 'Bật' : 'Tắt');
  };
  $('#bLbl').onclick = e => {
    showLabels = !showLabels;
    const b = e.currentTarget;
    b.classList.toggle('on', showLabels);
    b.setAttribute('aria-pressed', String(showLabels));
    b.querySelector('.lbl').textContent = 'Nhãn: ' + (showLabels ? 'Bật' : 'Tắt');
  };
  document.querySelectorAll('[data-filter]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.filter;
      filt[k] = !filt[k];
      b.classList.toggle('off', !filt[k]);
      b.setAttribute('aria-pressed', String(filt[k]));
      render();
    };
  });
  const tw = $('#tWarn');
  if (tw) tw.textContent = WARN_T;

  const listEl = $('#list');
  // Freeze the list while a card row or button is pressed, otherwise a 250 ms re-render between
  // pointerdown and pointerup replaces the element and the click never fires
  listEl.onpointerdown = e => { if (e.target.closest('button, [data-sel]')) listHold = true; };
  const release = () => { if (listHold) { listHold = false; dirty = true; } };
  window.addEventListener('pointerup', () => setTimeout(release, 0), { signal });
  window.addEventListener('pointercancel', release, { signal });
  listEl.onpointerenter = () => { listHover = true; };
  listEl.onpointerleave = () => { listHover = false; dirty = true; };
  listEl.onkeydown = e => {
    const row = e.target.closest('[data-sel]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(row.dataset.sel, false); }
  };
  listEl.onclick = e => {
    const btn = e.target.closest('button');
    if (!btn) {
      const row = e.target.closest('[data-sel]');
      if (row) select(row.dataset.sel, false);
      return;
    }
    const ds = btn.dataset;
    const d = ds.del;
    if (d) { T = T.filter(t => t.id != d); if (selId === d) selId = null; dirty = true; return; }

    const triggerSc = ds.triggerSc;
    if (triggerSc) {
      const t = T.find(x => x.id === triggerSc);
      if (t && t.scenario) {
        triggerManeuver(t);
      }
      return;
    }

    const resetSc = ds.resetSc;
    if (resetSc) {
      const t = T.find(x => x.id === resetSc);
      if (t && t.scenario) {
        resetParallelUAV(t);
      }
      return;
    }

    const adjAlt = ds.adjAlt;
    const targetId = ds.id;
    if (adjAlt && targetId) {
      const t = T.find(x => x.id === targetId);
      if (t) {
        const oldAlt = t.alt;
        t.alt = Math.max(10, Math.min(4000, Math.round(t.alt + (+adjAlt))));
        log('i', `Điều chỉnh độ cao ${t.dispName} (${t.id}): ${oldAlt} m → ${t.alt} m (${+adjAlt > 0 ? '+' : ''}${adjAlt} m)`);
        tick();
      }
      return;
    }

    const adjSpd = ds.adjSpd;
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
          log('i', `Điều chỉnh vận tốc ${t.dispName} (${t.id}): ${oldSpd} m/s → ${t.s} m/s`);
          tick();
        }
      }
      return;
    }
  };

  document.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button,.pane').forEach(x => x.classList.remove('on'));
      document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', 'false'));
      b.classList.add('on');
      b.setAttribute('aria-selected', 'true');
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

  window.addEventListener('resize', size, { signal });
  const ro = new ResizeObserver(size);
  ro.observe(cv);
  signal.addEventListener('abort', () => ro.disconnect());
  seed();
  size();
  tick();
  window.__rafId = requestAnimationFrame(loop);
}
