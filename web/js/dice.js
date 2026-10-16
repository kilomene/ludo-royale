// Ludo Royale — obsidian dice renderer + tumble animation
import { THEME } from "./theme.js";

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawDie(ctx, value, cx, cy, size, rot = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const s = size, h = s / 2;
  // obsidian face
  const g = ctx.createLinearGradient(-h, -h, h, h);
  g.addColorStop(0, "#2A2F3D");
  g.addColorStop(0.5, "#12151D");
  g.addColorStop(1, "#05060A");
  ctx.shadowColor = "rgba(212,175,55,0.35)";
  ctx.shadowBlur = size * 0.18;
  rr(ctx, -h, -h, s, s, s * 0.22);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  // gold rim
  rr(ctx, -h, -h, s, s, s * 0.22);
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.strokeStyle = "rgba(212,175,55,0.55)";
  ctx.stroke();
  // pips
  const pr = size * 0.075, off = size * 0.26;
  for (const [px, py] of PIPS[value]) {
    const x = px * off, y = py * off;
    const pg = ctx.createRadialGradient(x - pr * 0.3, y - pr * 0.3, pr * 0.1, x, y, pr);
    pg.addColorStop(0, "#FFF7D6");
    pg.addColorStop(0.5, THEME.goldLight);
    pg.addColorStop(1, THEME.goldDeep);
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();
  }
  ctx.restore();
}

// DiceTray: owns a small canvas, renders 1-2 dice, animates rolls.
export class DiceTray {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 76, h = canvas.clientHeight || 76;
    canvas.width = w * dpr; canvas.height = h * dpr;
    this.W = canvas.width; this.H = canvas.height;
    this.values = [6];
    this.anim = null;
    this.draw();
  }
  set(values) {
    this.values = values;
    this.anim = null;
    this.draw();
  }
  draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    if (this.anim) { this.anim.draw(ctx, W, H); return; }
    const n = this.values.length;
    const size = n === 1 ? H * 0.8 : H * 0.52;
    if (n === 1) {
      drawDie(ctx, this.values[0], W / 2, H / 2, size);
    } else {
      drawDie(ctx, this.values[0], W * 0.30, H * 0.42, size, -0.12);
      drawDie(ctx, this.values[1], W * 0.70, H * 0.58, size, 0.10);
    }
  }
  // Animated roll. Resolves when dice settle. easeOut tumble ~700ms.
  roll(values, fast = false) {
    return new Promise(resolve => {
      const start = performance.now(), dur = fast ? 130 : 720;
      const n = values.length;
      const size = n === 1 ? this.H * 0.8 : this.H * 0.52;
      const faces = values.map(() => 1 + Math.floor(Math.random() * 6));
      this.anim = {
        draw: (ctx, W, H) => {
          const t = Math.min(1, (performance.now() - start) / dur);
          const e = 1 - Math.pow(1 - t, 3);
          const bounce = Math.abs(Math.sin(t * Math.PI * 5)) * (1 - t) * H * 0.10;
          const rot = (1 - e) * (Math.PI * 4);
          const face = t > 0.82 ? values[0] : faces[0];
          const face2 = t > 0.82 ? values[1] : faces[1];
          const sc = 0.75 + 0.25 * e;
          if (n === 1) {
            drawDie(ctx, face, W / 2, H / 2 - bounce, size * sc, rot);
          } else {
            drawDie(ctx, face, W * 0.30, H * 0.42 - bounce, size * sc, rot - 0.12);
            drawDie(ctx, face2, W * 0.70, H * 0.58 - bounce * 0.7, size * sc, -rot + 0.10);
          }
          if (t >= 1) {
            // gold shockwave on landing
            this.shock = { t0: performance.now() };
          }
        },
      };
      const tick = () => {
        this.draw();
        // shockwave ring
        if (this.shock) {
          const st = (performance.now() - this.shock.t0) / 450;
          if (st < 1) {
            const { ctx, W, H } = this;
            ctx.save();
            ctx.globalAlpha = (1 - st) * 0.7;
            ctx.strokeStyle = THEME.gold;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, (0.3 + st * 0.5) * Math.max(W, H), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          } else this.shock = null;
        }
        if (performance.now() - start < dur + 480) requestAnimationFrame(tick);
        else { this.set(values); resolve(); }
      };
      tick();
    });
  }
}
