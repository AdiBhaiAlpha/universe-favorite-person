/* The Universe Has A Favorite Person
   Single-file observatory engine: canvas starfield + cinematic state machine.
   No dependencies. Respects prefers-reduced-motion. Deterministic per name.
*/
(() => {
  'use strict';

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: false });

  const scenes = {
    landing: document.getElementById('scene-landing'),
    status: document.getElementById('scene-status'),
    constellation: document.getElementById('scene-constellation'),
    science: document.getElementById('scene-science'),
    final: document.getElementById('scene-final'),
  };
  const form = document.getElementById('observe-form');
  const input = document.getElementById('name-input');
  const hint = document.getElementById('form-hint');
  const sharedHint = document.getElementById('shared-hint');
  const statusText = document.getElementById('status-text');
  const statusName = document.getElementById('status-name');
  const meterFill = document.getElementById('meter-fill');
  const constName = document.getElementById('const-name');
  const catalogLine = document.getElementById('catalog-line');
  const scienceLine = document.getElementById('science-line');
  const scienceLine2 = document.getElementById('science-line-2');
  const continueBtn = document.getElementById('continue-btn');
  const restartBtn = document.getElementById('restart-btn');
  const shareBtn = document.getElementById('share-btn');
  const copiedMsg = document.getElementById('copied-msg');
  const coordsEl = document.getElementById('coords');
  const clockEl = document.getElementById('clock');
  const letterVeil = document.getElementById('letter-veil');
  const letterDear = document.getElementById('letter-dear');
  const letterSeal = document.getElementById('letter-seal');
  const letterP1 = document.getElementById('letter-p1');
  const letterP2 = document.getElementById('letter-p2');
  const letterP3 = document.getElementById('letter-p3');
  const letterKeep = document.getElementById('letter-keep');
  const letterObserve = document.getElementById('letter-observe');
  const letterX = document.getElementById('letter-x');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- tiny utils ----------
  function sanitizeName(raw) {
    if (typeof raw !== 'string') return '';
    // strip control chars, collapse whitespace, trim, cap length
    let s = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > 40) s = s.slice(0, 40).trimEnd();
    return s;
  }
  function hashSeed(str) {
    // FNV-1a 32-bit over normalized name
    const n = str.normalize('NFC').toLowerCase();
    let h = 0x811c9dc5;
    for (let i = 0; i < n.length; i++) {
      h ^= n.codePointAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ---------- starfield state ----------
  let W = 0, H = 0, DPR = 1;
  let stars = [];
  let travelers = []; // subset refs
  let edges = [];
  let animId = 0;
  let timers = [];
  let phase = 'idle'; // idle | traveling | formed | dimmed
  let travelStart = 0;
  let lineProgress = 0;
  let lineStart = 0;
  let dimAmount = 0; // 0 full, 1 dimmed for final
  let currentName = '';
  let letterOpen = false;

  // Confession letters — deterministic pick by name seed. {name} is interpolated.
  const LETTERS = [
    [
      'I pointed the telescope at the sky and asked it to find you. It did not hesitate — as if it had been keeping your coordinates all along.',
      'Here is my honest finding: ordinary days bend a little toward you. The walk home feels shorter, small things feel lighter, and the stars seem oddly pleased with themselves.',
      'I am done pretending this is astronomy. This is a confession wearing a lab coat. {name} — you are the favorite person, and I am simply the observer who finally said it.',
    ],
    [
      'The first observation was science. This one is not. The telescope is switched off — this is just me, writing plainly.',
      'I have checked the data twice: nearly every good day has your fingerprints on it. That cannot be a coincidence, so I have stopped calling it one.',
      'Consider this my published result, on the record: {name}, you are loved — deliberately, and without further review.',
    ],
    [
      'You were never supposed to read the field notes. But the universe kept filing you under “favorite”, and keeping that secret started to feel dishonest.',
      'What I know is this: the sky rearranged itself for you without a single complaint — which is more than I can say for myself, since I have been rearranging my sentences around you for months.',
      'So, plainly: {name}, I love the way the world leans toward you. And I would like to lean that way too.',
    ],
  ];
  let currentSeed = 0;
  let timeBase = performance.now();

  function later(fn, ms) {
    const id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function starCount() {
    const area = Math.max(1, W * H);
    const n = Math.round(area / 4200);
    return Math.max(160, Math.min(850, n));
  }

  function buildField() {
    const rng = Math.random;
    stars = [];
    const n = starCount();
    for (let i = 0; i < n; i++) {
      const big = rng() > 0.965;
      stars.push({
        x: rng() * W,
        y: rng() * H,
        r: big ? 1.4 + rng() * 0.9 : 0.3 + rng() * 1.1,
        a: 0.25 + rng() * 0.65,
        sp: 0.4 + rng() * 1.4,
        ph: rng() * Math.PI * 2,
        sx: 0, sy: 0, tx: 0, ty: 0,
        delay: 0, dur: 1,
        isTraveler: false,
      });
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = w; H = h;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const hadField = stars.length > 0;
    const prevTravelers = travelers.length;
    buildField();
    // If mid-constellation, re-place instantly on new geometry
    if (hadField && (phase === 'formed' || phase === 'dimmed') && currentName) {
      assignConstellation(currentName, true);
      if (reducedMotion.matches) { snapTravelers(); lineProgress = 1; }
      else { snapTravelers(); lineProgress = 1; }
    } else if (hadField && phase === 'traveling' && currentName) {
      assignConstellation(currentName, true);
    }
    void prevTravelers;
  }

  // Deterministic constellation shape in normalized space, then mapped to screen.
  function generatePattern(seed) {
    const rng = mulberry32(seed);
    const count = 8 + Math.floor(rng() * 5); // 8..12
    const pts = [];
    let ang = rng() * Math.PI * 2;
    let px = 0, py = 0;
    pts.push([0, 0]);
    for (let i = 1; i < count; i++) {
      ang += (rng() - 0.5) * 1.9;
      const step = 0.30 + rng() * 0.38;
      px += Math.cos(ang) * step;
      py += Math.sin(ang) * step * 0.85;
      // soft containment
      const d = Math.hypot(px, py);
      if (d > 1) { px *= 0.82; py *= 0.82; ang += Math.PI * (0.4 + rng() * 0.4); }
      pts.push([px, py]);
    }
    // center
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    let maxR = 0.001;
    pts.forEach(p => { maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cy)); });
    const norm = pts.map(p => [(p[0] - cx) / maxR, (p[1] - cy) / maxR]);

    // edges: chain + 1-2 branches to nearest
    const e = [];
    for (let i = 0; i < norm.length - 1; i++) e.push([i, i + 1]);
    const branches = 1 + Math.floor(rng() * 2);
    for (let b = 0; b < branches; b++) {
      const from = Math.floor(rng() * norm.length);
      let best = -1, bestD = Infinity;
      for (let j = 0; j < norm.length; j++) {
        if (j === from) continue;
        if (e.some(([a, c]) => (a === from && c === j) || (a === j && c === from))) continue;
        const d = Math.hypot(norm[from][0] - norm[j][0], norm[from][1] - norm[j][1]);
        if (d < bestD && d < 1.2) { bestD = d; best = j; }
      }
      if (best >= 0) e.push([from, best]);
    }
    return { pts: norm, edges: e };
  }

  function assignConstellation(name, keepBackground) {
    currentSeed = hashSeed(name);
    const { pts, edges: e } = generatePattern(currentSeed);
    edges = e;
    const cx = W / 2, cy = H * 0.44;
    const R = Math.min(W, H) * (W < 520 ? 0.32 : 0.30);
    // choose travelers deterministically: seeded shuffle of indices
    const rng = mulberry32(currentSeed ^ 0x9e3779b9);
    const order = stars.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    travelers = [];
    const dur = reducedMotion.matches ? 0 : 5200 + (currentSeed % 1500);
    for (let k = 0; k < pts.length; k++) {
      const s = stars[order[k % order.length]];
      s.isTraveler = true;
      s.sx = keepBackground ? s.x : s.x;
      s.sy = keepBackground ? s.y : s.y;
      // if fresh run, start from current pos
      if (!keepBackground) { s.sx = s.x; s.sy = s.y; }
      s.tx = cx + pts[k][0] * R;
      s.ty = cy + pts[k][1] * R;
      s.delay = (k / pts.length) * 0.35; // staggered 0..35%
      s.dur = dur / 1000;
      s.r = Math.max(s.r, 1.2);
      s.a = Math.max(s.a, 0.75);
      travelers.push(s);
    }
    // non-travelers stay
    stars.forEach(s => { if (!s.isTraveler) { s.tx = s.x; s.ty = s.y; } });
  }

  function snapTravelers() {
    travelers.forEach(s => { s.x = s.tx; s.y = s.ty; });
  }

  // ---------- render loop ----------
  let lastT = performance.now();
  function frame(now) {
    animId = requestAnimationFrame(frame);
    if (document.hidden) { lastT = now; return; }
    const t = (now - timeBase) / 1000;
    lastT = now;

    // bg
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);

    // faint distant particles drift
    const dim = 1 - dimAmount * 0.55;

    // travel progress
    let allArrived = true;
    if (phase === 'traveling') {
      const el = (now - travelStart) / 1000;
      travelers.forEach(s => {
        const local = (el - s.delay * s.dur) / (s.dur * (1 - 0.35));
        const p = Math.max(0, Math.min(1, local));
        if (p < 1) allArrived = false;
        const e = easeInOutCubic(p);
        s.x = s.sx + (s.tx - s.sx) * e;
        s.y = s.sy + (s.ty - s.sy) * e;
      });
      if (allArrived) {
        phase = 'formed';
        lineStart = now;
        if (reducedMotion.matches) lineProgress = 1;
        later(showConstellationLabel, 500);
        later(goScience, 4600);
      }
    }
    if (phase === 'formed' || phase === 'dimmed') {
      if (!reducedMotion.matches && lineProgress < 1) {
        lineProgress = Math.min(1, (now - lineStart) / 2600);
      }
    }
    // ease dim
    const targetDim = phase === 'dimmed' ? 1 : 0;
    dimAmount += (targetDim - dimAmount) * 0.03;

    // draw connections under stars
    if ((phase === 'formed' || phase === 'dimmed') && travelers.length && lineProgress > 0) {
      ctx.save();
      ctx.globalAlpha = (0.5 * lineProgress) * dim;
      ctx.strokeStyle = 'rgba(216,211,196,0.55)';
      ctx.lineWidth = 1;
      const segs = Math.floor(edges.length * lineProgress);
      const frac = edges.length * lineProgress - segs;
      for (let i = 0; i < segs; i++) {
        const [a, b] = edges[i];
        const A = travelers[a], B = travelers[b];
        if (!A || !B) continue;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      if (frac > 0 && segs < edges.length) {
        const [a, b] = edges[segs];
        const A = travelers[a], B = travelers[b];
        if (A && B) {
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(A.x + (B.x - A.x) * frac, A.y + (B.y - A.y) * frac);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // draw stars
    const twinkleOn = !reducedMotion.matches;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let alpha = s.a;
      if (twinkleOn) alpha = s.a * (0.62 + 0.38 * Math.sin(t * s.sp + s.ph));
      if (s.isTraveler) alpha = Math.min(1, alpha + 0.25);
      alpha *= dim;
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.isTraveler ? '#f2efe6' : '#cfd3da';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      // halo for travelers
      if (s.isTraveler && (phase === 'formed' || phase === 'dimmed' || phase === 'traveling')) {
        ctx.globalAlpha = alpha * 0.16;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // slow coordinate drift for chrome
    if (!frame._n || now - frame._n > 2000) {
      frame._n = now;
      const ra = (currentSeed % 3600) / 150 + (t / 360) % 1;
      void ra;
    }
  }

  // ---------- scene manager ----------
  function show(id) {
    Object.entries(scenes).forEach(([k, el]) => {
      const on = k === id;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
  }

  function catalogFor(name, seed) {
    const n = (seed % 9000) + 1000;
    const mag = (3.6 + (seed % 100) / 90).toFixed(1);
    return `ULY-${n} · mag ${mag} · field ${8 + (seed % 5)} stars`;
  }

  function fillName(s, name) {
    return s.split('{name}').join(name);
  }

  function openLetter(name) {
    currentName = name;
    const seed = hashSeed(name);
    const L = LETTERS[seed % LETTERS.length];
    letterDear.textContent = 'Dear ' + name + ',';
    letterSeal.textContent = (name.trim()[0] || '–').toUpperCase();
    letterP1.textContent = fillName(L[0], name);
    letterP2.textContent = fillName(L[1], name);
    letterP3.textContent = fillName(L[2], name);
    input.value = name;
    letterVeil.hidden = false;
    // next frame so the fade/rise transition plays
    requestAnimationFrame(() => requestAnimationFrame(() => {
      letterVeil.classList.add('is-open');
    }));
    letterOpen = true;
    document.body.classList.add('no-scroll');
    letterDear.focus({ preventScroll: true });
  }

  function closeLetter() {
    if (!letterOpen) return;
    letterOpen = false;
    letterVeil.classList.remove('is-open');
    letterVeil.hidden = true;
    document.body.classList.remove('no-scroll');
    // the letter is the finale — closing returns to the final screen beneath it
    if (phase === 'dimmed' && currentName) show('final');
    document.getElementById('final-line').focus({ preventScroll: true });
  }

  function beginObservation(rawName) {
    const name = sanitizeName(rawName);
    if (!name) {
      hint.textContent = 'Please enter a name — even a nickname will do.';
      input.focus();
      return;
    }
    hint.textContent = '';
    currentName = name;
    // reflect in URL without reload
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('name', name);
      window.history.replaceState({}, '', u.toString());
    } catch { /* ignore */ }

    // reset constellation state
    clearTimers();
    lineProgress = 0;
    phase = 'traveling';
    statusName.textContent = name;
    show('status');
    statusText.textContent = 'Scanning the observable sky…';
    meterFill.style.width = '12%';

    assignConstellation(name, false);
    // record start positions
    travelers.forEach(s => { s.sx = s.x; s.sy = s.y; });

    if (reducedMotion.matches) {
      statusText.textContent = 'Searching for a familiar pattern…';
      meterFill.style.width = '78%';
      snapTravelers();
      travelStart = performance.now();
      phase = 'formed';
      lineProgress = 1;
      later(showConstellationLabel, 600);
      later(goScience, 3800);
      return;
    }

    travelStart = performance.now() + 2600; // let status play first
    const seq = [
      ['Mapping stellar positions…', '38%', 1400],
      ['Searching for a familiar pattern…', '74%', 1500],
      ['Locking coordinates…', '92%', 1200],
    ];
    let acc = 900;
    seq.forEach(([msg, w, wait]) => {
      later(() => {
        statusText.textContent = msg;
        meterFill.style.width = w;
        // start travel on the "searching" beat
        if (msg.startsWith('Searching')) {
          show('status'); // keep status visible while stars move behind
          travelStart = performance.now();
          // fade status out gently after a beat, stars keep moving on empty stage
          later(() => { if (phase === 'traveling') show(null); }, 1600);
        }
      }, acc);
      acc += wait;
    });
  }

  function showConstellationLabel() {
    if (!currentName) return;
    constName.textContent = currentName;
    catalogLine.textContent = catalogFor(currentName, currentSeed);
    show('constellation');
    constName.focus({ preventScroll: true });
  }

  function goScience() {
    if (!currentName || phase !== 'formed') return;
    show('science');
    scienceLine.classList.remove('is-visible');
    scienceLine2.classList.remove('is-visible');
    scienceLine.focus({ preventScroll: true });
    later(() => scienceLine.classList.add('is-visible'), 150);
    later(() => scienceLine2.classList.add('is-visible'), reducedMotion.matches ? 400 : 2600);
    later(goFinal, reducedMotion.matches ? 3200 : 6200);
  }

  function goFinal() {
    if (!currentName) return;
    phase = 'dimmed';
    show('final');
    document.getElementById('final-line').focus({ preventScroll: true });
  }

  function restart() {
    if (letterOpen) {
      letterOpen = false;
      letterVeil.classList.remove('is-open');
      letterVeil.hidden = true;
      document.body.classList.remove('no-scroll');
    }
    clearTimers();
    currentName = '';
    lineProgress = 0;
    phase = 'idle';
    edges = [];
    travelers.forEach(s => { s.isTraveler = false; });
    travelers = [];
    // scatter fresh background so restart feels new
    stars.forEach(s => {
      s.x = Math.random() * W;
      s.y = Math.random() * H;
      s.tx = s.x; s.ty = s.y;
    });
    scienceLine.classList.remove('is-visible');
    scienceLine2.classList.remove('is-visible');
    copiedMsg.textContent = '';
    input.value = '';
    hint.textContent = '';
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('name');
      window.history.replaceState({}, '', u.pathname + u.search);
    } catch { /* ignore */ }
    show('landing');
    input.focus({ preventScroll: true });
  }

  // ---------- events ----------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    beginObservation(input.value);
  });
  continueBtn.addEventListener('click', () => {
    if (currentName && !letterOpen) openLetter(currentName);
  });
  restartBtn.addEventListener('click', restart);
  letterKeep.addEventListener('click', closeLetter);
  letterX.addEventListener('click', closeLetter);
  letterObserve.addEventListener('click', () => {
    letterOpen = false;
    letterVeil.classList.remove('is-open');
    letterVeil.hidden = true;
    document.body.classList.remove('no-scroll');
    restart();
  });
  letterVeil.addEventListener('click', (e) => {
    if (e.target === letterVeil) closeLetter();
  });
  document.addEventListener('keydown', (e) => {
    if (!letterOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLetter();
      return;
    }
    if (e.key === 'Tab') {
      // light focus trap inside the dialog
      const f = letterVeil.querySelectorAll('button');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  shareBtn.addEventListener('click', async () => {
    const name = currentName || sanitizeName(input.value) || '';
    let url = window.location.href;
    try {
      const u = new URL(window.location.href);
      if (name) u.searchParams.set('name', name);
      url = u.toString();
    } catch { /* ignore */ }
    try {
      await navigator.clipboard.writeText(url);
      copiedMsg.textContent = 'Copied to clipboard';
    } catch {
      // fallback without permissions
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copiedMsg.textContent = 'Copied to clipboard'; }
      catch { copiedMsg.textContent = url; }
      ta.remove();
    }
    later(() => { copiedMsg.textContent = ''; }, 2600);
  });

  window.addEventListener('resize', () => {
    // debounce lightly
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 120);
  });
  reducedMotion.addEventListener?.('change', () => {
    if (reducedMotion.matches && phase === 'traveling') {
      snapTravelers();
      phase = 'formed';
      lineProgress = 1;
    }
  });
  document.addEventListener('visibilitychange', () => { timeBase = performance.now(); });

  // ---------- chrome clocks ----------
  function tickClock() {
    try {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      clockEl.textContent = `LOCAL ${hh}:${mm} · CLEAR`;
      const seed = currentSeed || 1234;
      const raH = String(Math.floor((seed % 24))).padStart(2, '0');
      coordsEl.textContent = `RA ${raH}h ${String(seed % 60).padStart(2, '0')}m · Dec +${String(seed % 89).padStart(2, '0')}° 12′`;
    } catch { /* ignore */ }
  }

  // ---------- init ----------
  function init() {
    resize();
    show('landing');
    animId = requestAnimationFrame(frame);
    tickClock();
    setInterval(tickClock, 30000);

    // ?name= support
    try {
      const q = new URLSearchParams(window.location.search).get('name');
      const clean = sanitizeName(q || '');
      if (clean) {
        input.value = clean;
        sharedHint.hidden = false;
        input.focus({ preventScroll: true });
      }
    } catch { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  void animId; void lastT;
})();
