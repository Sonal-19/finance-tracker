// The scanner's canvas effects. While the photo is being read, a light sweeps
// over it; once the words come back, each one is lifted off the photo (its
// own pixels, cropped from the image), glows, turns into clean type, and the
// ones that became a field fly into that field. Everything is drawn on one
// full-screen canvas over the overlay, in viewport coordinates.

/** A word and its normalised box [left, top, right, bottom] on the image. */
export type FxWord = { t: string; b: number[] };

/** Words that became one field, and the element they fly into. */
export type FxTarget = {
  key: string;
  words: number[];
  el: () => HTMLElement | null;
};

/** The assistant-style glow: pink → violet → blue → cyan → amber. Decorative
 * only (never text on a surface), so they are not theme tokens. */
const GLOW = ["#ff4fd8", "#a35cff", "#4d8dff", "#2de2e6", "#ffb547"].map(
  (h) => [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
  ],
);

function glow(phase: number, alpha = 1) {
  const p = ((phase % 1) + 1) % 1;
  const f = p * GLOW.length;
  const a = GLOW[Math.floor(f) % GLOW.length]!;
  const b = GLOW[(Math.floor(f) + 1) % GLOW.length]!;
  const k = f - Math.floor(f);
  const c = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * k);
  return `rgba(${c(0)},${c(1)},${c(2)},${alpha})`;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const outBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
const inOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const outCubic = (t: number) => 1 - (1 - t) ** 3;
/** Progress of `now` through [start, start + len], 0–1. */
const span = (now: number, start: number, len: number) =>
  clamp((now - start) / len);

type Rect = { x: number; y: number; w: number; h: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
};

type Plan = {
  i: number;
  /** when this word starts, ms after the reveal begins */
  at: number;
  target: number | null;
  /** when it leaves for its field (key words) */
  flyAt: number;
  burst: boolean;
};

export const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export class ScanFx {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #img: HTMLImageElement;
  #raf = 0;
  #particles: Particle[] = [];
  #font = "system-ui, sans-serif";
  #scanStart = 0;
  #mode: "idle" | "scan" | "reveal" = "idle";
  #reveal: {
    start: number;
    words: FxWord[];
    targets: FxTarget[];
    plans: Plan[];
    arrived: Set<number>;
    end: number;
    onArrive: (key: string) => void;
    done: () => void;
  } | null = null;

  constructor(canvas: HTMLCanvasElement, img: HTMLImageElement) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d")!;
    this.#img = img;
    this.#font = getComputedStyle(document.body).fontFamily || this.#font;
  }

  /** The canvas matches the viewport, at the screen's pixel density. */
  #fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    if (
      this.#canvas.width !== Math.round(w * dpr) ||
      this.#canvas.height !== Math.round(h * dpr)
    ) {
      this.#canvas.width = Math.round(w * dpr);
      this.#canvas.height = Math.round(h * dpr);
    }
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  /** Where the photo's pixels actually are (the <img> is object-contain). */
  #photoRect(): Rect {
    const r = this.#img.getBoundingClientRect();
    const c = this.#canvas.getBoundingClientRect();
    const nw = this.#img.naturalWidth || 1;
    const nh = this.#img.naturalHeight || 1;
    const scale = Math.min(r.width / nw, r.height / nh);
    const w = nw * scale;
    const h = nh * scale;
    return {
      x: r.left - c.left + (r.width - w) / 2,
      y: r.top - c.top + (r.height - h) / 2,
      w,
      h,
    };
  }

  #emit(x: number, y: number, n: number, spread = 1.6, hue = Math.random()) {
    if (this.#particles.length > 700) return;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * spread;
      this.#particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.4,
        life: 0,
        max: 500 + Math.random() * 600,
        size: 0.8 + Math.random() * 2.2,
        hue: hue + Math.random() * 0.3,
      });
    }
  }

  #drawParticles(dt: number, now: number) {
    const ctx = this.#ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.#particles = this.#particles.filter((p) => {
      p.life += dt;
      if (p.life > p.max) return false;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vy -= 0.004 * dt;
      p.vx *= 0.985;
      const k = 1 - p.life / p.max;
      ctx.fillStyle = glow(p.hue + now / 2000, k * 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.restore();
  }

  /** A glowing line sweeping over the photo while it is being read. */
  #drawBeam(now: number, y: number, r: Rect, alpha = 1) {
    const ctx = this.#ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const trail = Math.min(90, r.h * 0.25);
    const g = ctx.createLinearGradient(0, y - trail, 0, y);
    g.addColorStop(0, glow(now / 1600, 0));
    g.addColorStop(1, glow(now / 1600, 0.28 * alpha));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, y - trail, r.w, trail);
    const line = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    for (let k = 0; k <= 4; k++)
      line.addColorStop(k / 4, glow(now / 1400 + k / 4, alpha));
    ctx.fillStyle = line;
    ctx.shadowColor = glow(now / 1400, alpha);
    ctx.shadowBlur = 18;
    ctx.fillRect(r.x, y - 1.5, r.w, 3);
    ctx.restore();
  }

  #loop = (() => {
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const { w, h } = this.#fit();
      this.#ctx.clearRect(0, 0, w, h);
      if (this.#mode === "scan") this.#frameScan(now);
      else if (this.#mode === "reveal") this.#frameReveal(now);
      this.#drawParticles(dt, now);
      if (this.#mode !== "idle" || this.#particles.length)
        this.#raf = requestAnimationFrame(frame);
      else this.#raf = 0;
    };
    return () => {
      if (this.#raf) return;
      last = performance.now();
      this.#raf = requestAnimationFrame(frame);
    };
  })();

  /** The waiting animation, until reveal() or stop(). */
  scan() {
    this.#mode = "scan";
    this.#scanStart = performance.now();
    this.#loop();
  }

  #frameScan(now: number) {
    const r = this.#photoRect();
    if (r.w < 2) return;
    const t = (now - this.#scanStart) / 1300;
    // Ping-pong, eased at the ends.
    const p = (1 - Math.cos(t * Math.PI)) / 2;
    const y = r.y + r.h * p;
    this.#drawBeam(now, y, r);
    if (Math.random() < 0.6)
      this.#emit(r.x + Math.random() * r.w, y, 1, 0.6, now / 1600);
  }

  /**
   * Lifts every word off the photo and sends field words to their fields.
   * `onArrive(key)` fires as each field's words land; resolves when done.
   */
  reveal(
    words: FxWord[],
    targets: FxTarget[],
    onArrive: (key: string) => void,
  ) {
    if (prefersReducedMotion() || !words.length) {
      this.#mode = "idle";
      for (const t of targets) onArrive(t.key);
      return Promise.resolve();
    }
    const owner = new Map<number, number>();
    targets.forEach((t, k) => {
      for (const i of t.words) if (!owner.has(i)) owner.set(i, k);
    });
    // Reading order: a sweep from the top, a touch of left-to-right.
    const SWEEP = 750;
    const plans: Plan[] = words.map((w, i) => ({
      i,
      at: clamp(w.b[1]!) * SWEEP + clamp(w.b[0]!) * 90 + Math.random() * 60,
      target: owner.get(i) ?? null,
      flyAt: 0,
      burst: false,
    }));
    const gather = Math.max(...plans.map((p) => p.at)) + 700;
    const order = [
      ...new Set(plans.filter((p) => p.target !== null).map((p) => p.target!)),
    ];
    for (const p of plans)
      if (p.target !== null) p.flyAt = gather + order.indexOf(p.target) * 140;
    const end = Math.max(
      gather + order.length * 140 + 900,
      ...plans.map((p) => p.at + 1500),
    );

    return new Promise<void>((done) => {
      this.#reveal = {
        start: performance.now(),
        words,
        targets,
        plans,
        arrived: new Set(),
        end,
        onArrive,
        done,
      };
      this.#mode = "reveal";
      this.#loop();
    });
  }

  /** Jump to the end (a tap during the animation). */
  skip() {
    const r = this.#reveal;
    if (!r) return;
    r.targets.forEach((t, k) => {
      if (!r.arrived.has(k)) {
        r.arrived.add(k);
        r.onArrive(t.key);
      }
    });
    this.#finish();
  }

  #finish() {
    const r = this.#reveal;
    this.#reveal = null;
    this.#mode = "idle";
    r?.done();
  }

  #frameReveal(now: number) {
    const r = this.#reveal!;
    const el = now - r.start;
    const photo = this.#photoRect();
    if (photo.w < 2) return;
    const ctx = this.#ctx;
    const big = r.words.length > 160;

    // The reading line finishes its pass from top to bottom.
    const sweep = span(el, 0, 800);
    if (sweep < 1)
      this.#drawBeam(
        now,
        photo.y + photo.h * outCubic(sweep),
        photo,
        1 - sweep * 0.6,
      );

    // Where each target's text starts, and the size it will be.
    const dest = r.targets.map((t) => {
      const node = t.el();
      if (!node) return null;
      const b = node.getBoundingClientRect();
      const c = this.#canvas.getBoundingClientRect();
      const size = Number.parseFloat(getComputedStyle(node).fontSize) || 16;
      const pad = Number.parseFloat(getComputedStyle(node).paddingLeft) || 0;
      return {
        x: b.left - c.left + Math.max(pad, 4),
        y: b.top - c.top + b.height / 2,
        size,
        right: b.right - c.left,
      };
    });
    // Each target group's own box on the photo, to keep the words' layout.
    const groups = r.targets.map((t) => {
      const bs = t.words.map((i) => r.words[i]!.b);
      if (!bs.length) return null;
      return {
        left: Math.min(...bs.map((b) => b[0]!)) * photo.w + photo.x,
        h: (bs.reduce((s, b) => s + (b[3]! - b[1]!), 0) / bs.length) * photo.h,
      };
    });

    for (const p of r.plans) {
      const w = r.words[p.i]!;
      const [l, t, rr, bb] = w.b as [number, number, number, number];
      const bw = (rr - l) * photo.w;
      const bh = (bb - t) * photo.h;
      if (bw < 1 || bh < 1) continue;
      const cx = photo.x + ((l + rr) / 2) * photo.w;
      const cy = photo.y + ((t + bb) / 2) * photo.h;
      const local = el - p.at;
      if (local < 0) continue;
      const key = p.target !== null;
      const hue = p.i * 0.071 + now / 1800;

      // 1. light up, 2. lift towards the viewer, 3. become type.
      const lit = span(local, 0, 180);
      const lift = outBack(span(local, 120, 520));
      const morph = inOut(span(local, 380, 320));
      const scale = 1 + (key ? 0.5 : 0.18) * lift;
      let x = cx;
      let y = cy - (key ? 16 : 6) * lift;
      let size = bh * 0.86 * scale;
      let alpha = 1;

      if (!key) {
        // Everything else drifts up and dissolves into sparks.
        const fade = span(local, 950, 550);
        y -= 34 * outCubic(fade);
        alpha = 1 - fade;
        if (fade > 0 && !p.burst) {
          p.burst = true;
          if (!big || p.i % 3 === 0) this.#emit(x, y, big ? 2 : 4, 1.2, hue);
        }
        if (alpha <= 0) continue;
      } else {
        const fly = inOut(span(el, p.flyAt, 820));
        const d = dest[p.target!];
        const g = groups[p.target!];
        if (fly > 0 && d && g) {
          const k = d.size / Math.max(g.h * 0.86, 1);
          const tx = Math.min(
            d.x + (cx - bw / 2 - g.left) * k + (bw * k) / 2,
            d.right - 8,
          );
          const ty = d.y;
          // A gentle arc up and over.
          const mx = (x + tx) / 2;
          const my = Math.min(y, ty) - 60;
          const u = 1 - fly;
          x = u * u * x + 2 * u * fly * mx + fly * fly * tx;
          y = u * u * y + 2 * u * fly * my + fly * fly * ty;
          size = size + (d.size - size) * fly;
          alpha = fly > 0.92 ? 1 - (fly - 0.92) / 0.08 : 1;
          if (fly >= 1 && !r.arrived.has(p.target!)) {
            r.arrived.add(p.target!);
            r.onArrive(r.targets[p.target!]!.key);
          }
          if (fly >= 1 && !p.burst) {
            p.burst = true;
            this.#emit(tx, ty, 10, 2.2, hue);
          }
          if (alpha <= 0) continue;
        }
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // The highlight that marks the word on the photo.
      if (lit > 0 && lift < 1) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = glow(hue, 0.22 * lit * (1 - lift));
        ctx.beginPath();
        ctx.roundRect(cx - bw / 2 - 3, cy - bh / 2 - 2, bw + 6, bh + 4, 4);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      const sw = bw * scale;
      const sh = bh * scale;
      // The word's own pixels, lifted off the paper on a glowing plate.
      if (morph < 1 && lift > 0) {
        ctx.shadowColor = glow(hue, 0.9);
        ctx.shadowBlur = (key || !big ? 22 : 8) * lift;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath();
        ctx.roundRect(x - sw / 2 - 3, y - sh / 2 - 2, sw + 6, sh + 4, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * (1 - morph);
        const nw = this.#img.naturalWidth;
        const nh = this.#img.naturalHeight;
        ctx.drawImage(
          this.#img,
          l * nw,
          t * nh,
          (rr - l) * nw,
          (bb - t) * nh,
          x - sw / 2,
          y - sh / 2,
          sw,
          sh,
        );
        ctx.globalAlpha = alpha;
      }

      // …and the same word as type, glowing in the assistant colours.
      if (morph > 0) {
        ctx.font = `700 ${size}px ${this.#font}`;
        const tw = ctx.measureText(w.t).width;
        // Keep it about as wide as the word was.
        if (!key && tw > sw * 1.25) {
          size *= (sw * 1.25) / tw;
          ctx.font = `700 ${size}px ${this.#font}`;
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = alpha * morph;
        const grad = ctx.createLinearGradient(x - tw / 2, y, x + tw / 2, y);
        grad.addColorStop(0, glow(hue));
        grad.addColorStop(0.5, glow(hue + 0.2));
        grad.addColorStop(1, glow(hue + 0.4));
        ctx.shadowColor = glow(hue + 0.1, 0.85);
        ctx.shadowBlur = key || !big ? 16 : 0;
        ctx.fillStyle = grad;
        ctx.fillText(w.t, x, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.globalAlpha = alpha * morph * 0.35;
        ctx.fillText(w.t, x, y);
      }
      ctx.restore();
    }

    if (el >= r.end) {
      // Any field whose element never showed up still gets its value.
      r.targets.forEach((t, k) => {
        if (!r.arrived.has(k)) {
          r.arrived.add(k);
          r.onArrive(t.key);
        }
      });
      this.#finish();
    }
  }

  stop() {
    this.#mode = "idle";
    this.#reveal = null;
  }

  destroy() {
    this.stop();
    this.#particles = [];
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }
}
