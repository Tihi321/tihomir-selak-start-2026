// Mirrors tihomir-selak-2026/src/scripts/neural-field.ts, keep in sync.
// Neural field: drifting nodes, synapse edges, amber firing cascades and
// quantum "superposed" nodes, drawn on one fixed canvas behind the page.
// The nebula haze is static CSS (NeuralField.astro), not canvas, to keep
// full-screen fills out of the frame loop.

export interface FieldProbes {
  synapse: HTMLElement;
  phosphor: HTMLElement;
  carbon: HTMLElement;
}

type RGB = [number, number, number];

interface Node {
  x: number;
  y: number;
  layer: number;
  phase: number;
  quantum: boolean;
  flash: number; // time of last flash, -Infinity when never
  collapse: number; // time of last collapse, -Infinity when never
}

interface Pulse {
  from: number;
  to: number;
  start: number;
  dur: number;
  depth: number;
  active: boolean;
}

const LINK = 160;
const MAX_PULSES = 40;
const MAX_DEPTH = 3;
const REFIRE = [0.55, 0.3, 0.15];
const LAYER_SIZE = [0.9, 1.4, 2.1];
const LAYER_ALPHA = [0.55, 0.75, 1];
const LAYER_PARALLAX = [0.02, 0.05, 0.1];
const LAYER_SPEED = [0.6, 1, 1.5];
const MARGIN = 40;
const SPRITE = 64;
const COLLAPSE_MS = 600;
// Slow drift needs no more than ~30fps; the 2ms slack keeps 60Hz at every
// second frame instead of jittering between 2 and 3.
const FRAME_MS = 1000 / 30 - 2;
// Edges are batched into this many alpha levels: one stroke per level.
const EDGE_LEVELS = 16;

const started = new WeakSet<HTMLCanvasElement>();

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (t: number) => t * t * (3 - 2 * t);

function parseColor(value: string): RGB {
  const nums = value.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  if (value.startsWith('color(') && nums.length >= 3) {
    // color(srgb r g b) uses 0..1 channels
    return [nums[0]! * 255, nums[1]! * 255, nums[2]! * 255].map(
      Math.round,
    ) as RGB;
  }
  return nums.length >= 3 ? [nums[0]!, nums[1]!, nums[2]!] : [128, 128, 128];
}

function luminance([r, g, b]: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function makeSprite([r, g, b]: RGB): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g2 = c.getContext('2d');
  if (g2) {
    const grad = g2.createRadialGradient(
      SPRITE / 2,
      SPRITE / 2,
      0,
      SPRITE / 2,
      SPRITE / 2,
      SPRITE / 2,
    );
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    g2.fillStyle = grad;
    g2.fillRect(0, 0, SPRITE, SPRITE);
  }
  return c;
}

export function startNeuralField(
  canvas: HTMLCanvasElement,
  probes: FieldProbes,
): void {
  if (started.has(canvas)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  started.add(canvas);

  const root = document.documentElement;
  const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const schemeMql = window.matchMedia('(prefers-color-scheme: dark)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes: Node[] = [];
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let pm = new Float32Array(0); // reading-comfort mask per projected node
  let head = new Int32Array(0);
  let next = new Int32Array(0);
  let cols = 0;
  let rows = 0;
  const pulses: Pulse[] = Array.from({ length: MAX_PULSES }, () => ({
    from: 0,
    to: 0,
    start: 0,
    dur: 0,
    depth: 0,
    active: false,
  }));
  const nb = new Int16Array(64);
  // Per alpha level: flat x1,y1,x2,y2 segment coordinates, grown on demand.
  const edgeBuf = Array.from(
    { length: EDGE_LEVELS },
    () => new Float32Array(256),
  );
  const edgeLen = new Int32Array(EDGE_LEVELS);

  let synapse: RGB = [95, 184, 230];
  let phosphor: RGB = [224, 164, 88];
  let isLight = false;
  let synapseSprite = makeSprite(synapse);
  let phosphorSprite = makeSprite(phosphor);

  let raf = 0;
  let last = 0;
  let clock = 0;
  let nextFire = 0;
  let resizeTimer = 0;

  const fieldOn = () => root.dataset.field !== 'off';
  const animated = () => !motionMql.matches && !document.hidden;

  function resolveColors() {
    synapse = parseColor(getComputedStyle(probes.synapse).color);
    phosphor = parseColor(getComputedStyle(probes.phosphor).color);
    isLight =
      luminance(parseColor(getComputedStyle(probes.carbon).color)) > 0.5;
    synapseSprite = makeSprite(synapse);
    phosphorSprite = makeSprite(phosphor);
  }

  function seed() {
    const narrow = width < 720;
    let count = Math.round((width * height) / 14000);
    if (narrow) count = Math.round(count * 0.6);
    count = Math.max(narrow ? 24 : 36, Math.min(110, count));
    nodes = Array.from({ length: count }, () => ({
      x: rand(0, width),
      y: rand(0, height),
      layer: Math.random() < 0.5 ? 0 : Math.random() < 0.6 ? 1 : 2,
      phase: rand(0, Math.PI * 2),
      quantum: Math.random() < 0.1,
      flash: -Infinity,
      collapse: -Infinity,
    }));
    px = new Float32Array(count);
    py = new Float32Array(count);
    pm = new Float32Array(count);
    next = new Int32Array(count);
    cols = Math.ceil((width + MARGIN * 2) / LINK);
    rows = Math.ceil((height + MARGIN * 2) / LINK);
    head = new Int32Array(cols * rows);
    for (const p of pulses) p.active = false;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    seed();
  }

  function release() {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas.width = 0;
    canvas.height = 0;
    nodes = [];
  }

  // Horizontal reading-comfort multiplier: calm over the text column.
  function mask(x: number): number {
    if (width < 720) return 0.5;
    const gutter = Math.max(16, Math.min(width * 0.04, 48));
    const wrapW = Math.min(width - gutter * 2, 1200);
    const wrapL = (width - wrapW) / 2;
    const left = width >= 1024 ? wrapL + wrapW / 6 : wrapL;
    const right = wrapL + wrapW;
    const feather = 90;
    const inside = smooth(
      Math.max(
        0,
        Math.min(
          1,
          Math.min((x - left) / feather + 0.5, (right - x) / feather + 0.5),
        ),
      ),
    );
    // 1 at the edges; ~0.55 (dark) / ~0.42 (light) over the column
    return 1 - inside * (isLight ? 0.58 : 0.45);
  }

  function flow(n: Node, dt: number, t: number) {
    const s = LAYER_SPEED[n.layer]! * 9;
    const vx =
      Math.sin(n.y * 0.006 + t * 0.13 + n.phase) +
      0.6 * Math.sin(n.x * 0.004 - t * 0.09);
    const vy =
      Math.cos(n.x * 0.006 + t * 0.11) +
      0.6 * Math.cos(n.y * 0.005 + t * 0.07 + n.phase);
    n.x += vx * s * dt;
    n.y += vy * s * dt;
    const w = width + MARGIN * 2;
    const h = height + MARGIN * 2;
    n.x = ((((n.x + MARGIN) % w) + w) % w) - MARGIN;
    n.y = ((((n.y + MARGIN) % h) + h) % h) - MARGIN;
  }

  function project() {
    const scroll = window.scrollY;
    const h = height + MARGIN * 2;
    head.fill(-1);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const y =
        ((((n.y + scroll * LAYER_PARALLAX[n.layer]! + MARGIN) % h) + h) % h) -
        MARGIN;
      px[i] = n.x;
      py[i] = y;
      pm[i] = mask(n.x);
      const cx = Math.min(
        cols - 1,
        Math.max(0, Math.floor((n.x + MARGIN) / LINK)),
      );
      const cy = Math.min(
        rows - 1,
        Math.max(0, Math.floor((y + MARGIN) / LINK)),
      );
      const cell = cy * cols + cx;
      next[i] = head[cell]!;
      head[cell] = i;
    }
  }

  // Fills nb with neighbours of i (optionally only j > i); returns the count.
  function neighbours(i: number, onlyGreater: boolean): number {
    const cx = Math.min(
      cols - 1,
      Math.max(0, Math.floor((px[i]! + MARGIN) / LINK)),
    );
    const cy = Math.min(
      rows - 1,
      Math.max(0, Math.floor((py[i]! + MARGIN) / LINK)),
    );
    let count = 0;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1); gy++) {
      for (
        let gx = Math.max(0, cx - 1);
        gx <= Math.min(cols - 1, cx + 1);
        gx++
      ) {
        for (let j = head[gy * cols + gx]!; j !== -1; j = next[j]!) {
          if (j === i || (onlyGreater && j < i) || count >= nb.length) continue;
          if (Math.abs(nodes[j]!.layer - nodes[i]!.layer) > 1) continue;
          const dx = px[j]! - px[i]!;
          const dy = py[j]! - py[i]!;
          if (dx * dx + dy * dy < LINK * LINK) nb[count++] = j;
        }
      }
    }
    return count;
  }

  function spawn(from: number, to: number, depth: number, t: number) {
    const p = pulses.find((q) => !q.active);
    if (!p) return;
    p.from = from;
    p.to = to;
    p.depth = depth;
    p.start = t;
    p.dur = rand(0.4, 0.7);
    p.active = true;
  }

  function fire(i: number, depth: number, t: number, skip: number) {
    const count = neighbours(i, false);
    let sent = 0;
    const offset = Math.floor(Math.random() * Math.max(1, count));
    for (let k = 0; k < count && sent < 3; k++) {
      const j = nb[(k + offset) % count]!;
      if (j === skip) continue;
      spawn(i, j, depth, t);
      sent++;
    }
    nodes[i]!.flash = t;
  }

  function stepPulses(t: number) {
    if (t >= nextFire && nodes.length) {
      fire(Math.floor(Math.random() * nodes.length), 0, t, -1);
      nextFire = t + rand(0.35, 0.9);
    }
    for (const p of pulses) {
      if (!p.active || t - p.start < p.dur) continue;
      p.active = false;
      const n = nodes[p.to];
      if (!n) continue;
      n.flash = t;
      if (n.quantum) n.collapse = t;
      if (p.depth < MAX_DEPTH && Math.random() < REFIRE[p.depth]!) {
        fire(p.to, p.depth + 1, t, p.from);
      }
    }
  }

  function draw(t: number, withPulses: boolean) {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    ctx!.globalCompositeOperation = isLight ? 'source-over' : 'lighter';
    const gain = isLight ? 0.9 : 1;
    const [sr, sg, sb] = synapse;
    const edgeColor = `rgb(${sr},${sg},${sb})`;
    const phosphorColor = `rgb(${phosphor[0]!},${phosphor[1]!},${phosphor[2]!})`;

    // Edges, bucketed by alpha so each level is a single path + stroke
    edgeLen.fill(0);
    for (let i = 0; i < nodes.length; i++) {
      const count = neighbours(i, true);
      for (let k = 0; k < count; k++) {
        const j = nb[k]!;
        const dx = px[j]! - px[i]!;
        const dy = py[j]! - py[i]!;
        const fall = 1 - Math.sqrt(dx * dx + dy * dy) / LINK;
        const a =
          (isLight ? fall * fall * 0.5 : Math.pow(fall, 1.4) * 1.1) *
          gain *
          ((pm[i]! + pm[j]!) / 2) *
          Math.min(
            LAYER_ALPHA[nodes[i]!.layer]!,
            LAYER_ALPHA[nodes[j]!.layer]!,
          );
        const level = Math.min(EDGE_LEVELS, Math.round(a * EDGE_LEVELS));
        if (level === 0) continue;
        const b = level - 1;
        let buf = edgeBuf[b]!;
        const len = edgeLen[b]!;
        if (len + 4 > buf.length) {
          const grown = new Float32Array(buf.length * 2);
          grown.set(buf);
          buf = edgeBuf[b] = grown;
        }
        buf[len] = px[i]!;
        buf[len + 1] = py[i]!;
        buf[len + 2] = px[j]!;
        buf[len + 3] = py[j]!;
        edgeLen[b] = len + 4;
      }
    }
    ctx!.strokeStyle = edgeColor;
    ctx!.lineWidth = isLight ? 1 : 0.9;
    for (let b = 0; b < EDGE_LEVELS; b++) {
      const len = edgeLen[b]!;
      if (len === 0) continue;
      const buf = edgeBuf[b]!;
      ctx!.globalAlpha = (b + 1) / EDGE_LEVELS;
      ctx!.beginPath();
      for (let k = 0; k < len; k += 4) {
        ctx!.moveTo(buf[k]!, buf[k + 1]!);
        ctx!.lineTo(buf[k + 2]!, buf[k + 3]!);
      }
      ctx!.stroke();
    }

    // Nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const m = pm[i]! * gain;
      const size = LAYER_SIZE[n.layer]!;
      const base = LAYER_ALPHA[n.layer]! * m;
      const c = Math.max(0, 1 - ((t - n.collapse) * 1000) / COLLAPSE_MS);
      const flash = Math.max(0, 1 - (t - n.flash) / 0.8);

      if (n.quantum) {
        const cloud = (1 - c) * base;
        const r = 26 + 4 * Math.sin(t * 0.8 + n.phase);
        ctx!.globalAlpha = cloud * 0.35;
        ctx!.drawImage(synapseSprite, px[i]! - r, py[i]! - r, r * 2, r * 2);
        for (let g = 0; g < 3; g++) {
          const ph = t * (0.5 + g * 0.17) + n.phase + (g * Math.PI * 2) / 3;
          const fade = 0.5 + 0.5 * Math.sin(t * 0.6 + g * 2 + n.phase);
          ctx!.globalAlpha = cloud * fade * 0.9;
          ctx!.fillStyle = edgeColor;
          ctx!.beginPath();
          ctx!.arc(
            px[i]! + Math.cos(ph) * 14,
            py[i]! + Math.sin(ph * 1.3) * 9,
            size * 0.8,
            0,
            6.2832,
          );
          ctx!.fill();
        }
        if (c > 0) {
          ctx!.globalAlpha = c * Math.min(1, base * 1.4);
          ctx!.fillStyle = phosphorColor;
          ctx!.beginPath();
          ctx!.arc(px[i]!, py[i]!, size * 1.6, 0, 6.2832);
          ctx!.fill();
        }
      } else {
        if (n.layer > 0) {
          const gr = size * 3.5;
          ctx!.globalAlpha = base * (isLight ? 0.25 : 0.55);
          ctx!.drawImage(
            synapseSprite,
            px[i]! - gr,
            py[i]! - gr,
            gr * 2,
            gr * 2,
          );
        }
        ctx!.globalAlpha = Math.min(1, base * 1.1);
        ctx!.fillStyle = edgeColor;
        ctx!.beginPath();
        ctx!.arc(px[i]!, py[i]!, size, 0, 6.2832);
        ctx!.fill();
      }

      if (flash > 0) {
        const r = 10 + size * 5 * (1 - flash) + size * 3;
        ctx!.globalAlpha = Math.min(1, flash * 0.9 * Math.max(m, 0.4));
        ctx!.drawImage(phosphorSprite, px[i]! - r, py[i]! - r, r * 2, r * 2);
      }
    }

    // Pulses with a short fading trail
    if (withPulses) {
      ctx!.fillStyle = phosphorColor;
      for (const p of pulses) {
        if (!p.active) continue;
        const k = (t - p.start) / p.dur;
        for (let s = 0; s < 4; s++) {
          const kk = k - s * 0.06;
          if (kk < 0) break;
          const x = px[p.from]! + (px[p.to]! - px[p.from]!) * kk;
          const y = py[p.from]! + (py[p.to]! - py[p.from]!) * kk;
          ctx!.globalAlpha = (1 - s * 0.2) * gain * Math.max(mask(x), 0.55);
          ctx!.beginPath();
          ctx!.arc(x, y, 2.6 - s * 0.4, 0, 6.2832);
          ctx!.fill();
        }
      }
    }
    ctx!.globalAlpha = 1;
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    // rAF timestamps can trail performance.now(), so clamp the first dt at 0
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    for (const n of nodes) flow(n, dt, clock);
    project();
    stepPulses(clock);
    draw(clock, true);
  }

  function staticFrame() {
    project();
    draw(0, false);
  }

  // Single place that reconciles field on/off, visibility and reduced motion.
  function sync() {
    if (!fieldOn()) {
      release();
      return;
    }
    if (canvas.width === 0 || nodes.length === 0) resize();
    cancelAnimationFrame(raf);
    raf = 0;
    if (motionMql.matches) {
      staticFrame();
    } else if (animated()) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function recolor() {
    resolveColors();
    if (fieldOn() && motionMql.matches) staticFrame();
  }

  resolveColors();
  sync();

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.attributeName === 'data-theme') recolor();
    }
    sync();
  }).observe(root, {
    attributes: true,
    attributeFilter: ['data-field', 'data-theme'],
  });

  schemeMql.addEventListener('change', recolor);
  motionMql.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!fieldOn()) return;
      resize();
      sync();
    }, 150);
  });
}
