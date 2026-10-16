// Ludo Royale — game controller: renders, animates, and orchestrates turns.
import * as L from "./ludo.esm.js";
import { THEME } from "./theme.js";
import { tokenCell } from "./geometry.js";
import { computeView, drawBoardBase, drawToken } from "./render-board.js";
import { DiceTray } from "./dice.js";
import { chooseMove, chooseSub } from "./ai.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sig = s => s ? `${s.token}:${s.from}:${s.to}:${s.bringOut ? 1 : 0}` : "null";

export class GameController {
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.ui = opts.ui; // { rollBtn, hint, turnText, turnDot, diceCanvas }
    this.config = opts.config; // { numPlayers, diceMode, seats: [{type,name}], difficulty }
    this.onGameOver = opts.onGameOver || (() => {});
    this.onQuit = opts.onQuit || (() => {});
    this.view = computeView(this.canvas);
    this.baseCache = document.createElement("canvas");
    this.baseCache.width = this.canvas.width;
    this.baseCache.height = this.canvas.height;
    drawBoardBase(this.baseCache.getContext("2d"), this.view);

    this.state = L.createGame({
      numPlayers: this.config.numPlayers,
      diceMode: this.config.diceMode,
      seed: (Date.now() ^ (Math.random() * 1e9)) | 0,
    });
    // rendered token positions in cell coords
    this.pos = [];
    for (let p = 0; p < this.config.numPlayers; p++) {
      this.pos[p] = [];
      for (let t = 0; t < 4; t++) {
        const [cx, cy] = tokenCell(p, -1, t);
        this.pos[p][t] = { x: cx, y: cy, hop: 0 };
      }
    }
    this.anims = [];      // active tweens
    this.particles = [];
    this.highlight = new Set(); // "p:t" tokens awaiting tap
    this.pickResolve = null;
    this.paused = false;
    this.over = false;
    this.fast = !!opts.config.fast;
    this.stats = { captures: {}, sixes: {} };
    for (let p = 0; p < this.config.numPlayers; p++) { this.stats.captures[p] = 0; this.stats.sixes[p] = 0; }

    this.tray = new DiceTray(this.ui.diceCanvas);
    this.canvas.addEventListener("pointerdown", e => this.onTap(e));
    this.ui.rollBtn.addEventListener("click", () => this.onRollClick());
    this.rollResolve = null;
    this.raf = requestAnimationFrame(t => this.frame(t));
    this.run();
  }

  S(ms) { return sleep(this.fast ? Math.max(12, ms * 0.05) : ms); }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.over = true;
  }
  setPaused(v) { this.paused = v; }

  // ---------- rendering ----------
  frame(t) {
    if (this.over) return;
    const { ctx, view } = this;
    const { s, X, Y } = view;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.baseCache, 0, 0);
    // process tweens
    this.anims = this.anims.filter(a => !a.step(t));
    // group tokens by cell for stacking offsets
    const groups = new Map();
    for (let p = 0; p < this.pos.length; p++)
      for (let tt = 0; tt < 4; tt++) {
        const q = this.pos[p][tt];
        if (q.hidden) continue;
        const key = `${Math.round(q.x * 4)},${Math.round(q.y * 4)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push([p, tt]);
      }
    for (const [, members] of groups) {
      members.forEach(([p, tt], i) => {
        const q = this.pos[p][tt];
        let ox = 0, oy = 0;
        if (members.length > 1) {
          const k = 0.22;
          ox = (i % 2 === 0 ? -k : k); oy = (i < 2 ? -k : k);
        }
        const lift = q.hop ? Math.sin(q.hop * Math.PI) * 0.28 : 0;
        const sel = this.highlight.has(`${p}:${tt}`);
        drawToken(ctx, X(q.x + ox), Y(q.y + oy - lift), s * 0.40, p, sel);
      });
    }
    // particles
    this.particles = this.particles.filter(pt => {
      const age = (t - pt.t0) / pt.life;
      if (age >= 1) return false;
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.008;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(X(pt.x), Y(pt.y), s * 0.05 * (1 - age * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });
    this.raf = requestAnimationFrame(tt => this.frame(tt));
  }

  burst(cellX, cellY, color, n = 14, spread = 0.09) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random() * 0.7) * spread;
      this.particles.push({
        x: cellX, y: cellY,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.05,
        t0, life: 500 + Math.random() * 500, color,
      });
    }
  }

  // ---------- input ----------
  onTap(e) {
    if (!this.pickResolve || this.paused) return;
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * this.canvas.width;
    const py = (e.clientY - r.top) / r.height * this.canvas.height;
    const { s, ox, oy } = this.view;
    const cx = (px - ox) / s, cy = (py - oy) / s;
    let best = null, bestD = 0.55;
    for (const key of this.highlight) {
      const [p, tt] = key.split(":").map(Number);
      const q = this.pos[p][tt];
      const d = Math.hypot(q.x - cx, q.y - cy);
      if (d < bestD) { bestD = d; best = { p, t: tt }; }
    }
    if (best) {
      const resolve = this.pickResolve;
      this.pickResolve = null;
      this.highlight.clear();
      resolve(best);
    }
  }

  awaitPick(candidates) {
    // candidates: [{p, t, sub}] — highlight those tokens, resolve with chosen sub
    this.highlight = new Set(candidates.map(c => `${c.p}:${c.t}`));
    return new Promise(res => {
      this.pickResolve = ({ p, t }) => {
        const c = candidates.find(c => c.p === p && c.t === t);
        res(c ? c.sub : candidates[0].sub);
      };
    });
  }

  onRollClick() {
    if (this.rollResolve) {
      const r = this.rollResolve;
      this.rollResolve = null;
      r();
    }
  }
  awaitRoll() {
    this.ui.rollBtn.disabled = false;
    this.ui.hint.textContent = "Your turn — roll!";
    return new Promise(res => { this.rollResolve = res; });
  }

  // ---------- animation ----------
  pathCells(player, from, to) {
    const cells = [];
    if (from === -1) {
      cells.push(tokenCell(player, 0));
      return cells;
    }
    for (let d = from + 1; d <= to; d++) cells.push(tokenCell(player, d, 0));
    return cells;
  }

  async animateSub(player, sub) {
    const t = sub.token;
    const cells = this.pathCells(player, sub.from, sub.to);
    const q = this.pos[player][t];
    for (const [cx, cy] of cells) {
      const sx = q.x, sy = q.y;
      const t0 = performance.now(), dur = this.fast ? 22 : 135;
      await new Promise(res => {
        const step = now => {
          const k = Math.min(1, (now - t0) / dur);
          q.x = sx + (cx - sx) * k;
          q.y = sy + (cy - sy) * k;
          q.hop = k;
          k < 1 ? requestAnimationFrame(step) : (q.hop = 0, res());
        };
        requestAnimationFrame(step);
      });
    }
    // captures: victims dissolve back to base
    for (const cap of sub.captures || []) {
      const vq = this.pos[cap.player][cap.token];
      const [bx, by] = tokenCell(cap.player, -1, cap.token);
      this.burst(vq.x, vq.y, THEME.goldLight, 16);
      const sx = vq.x, sy = vq.y, t0 = performance.now(), dur = this.fast ? 70 : 450;
      await new Promise(res => {
        const step = now => {
          const k = Math.min(1, (now - t0) / dur);
          vq.x = sx + (bx - sx) * k;
          vq.y = sy + (by - sy) * k - Math.sin(k * Math.PI) * 0.9;
          k < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
      vq.x = bx; vq.y = by;
    }
    if (sub.finishes) {
      const [hx, hy] = tokenCell(player, 57);
      this.burst(hx, hy, THEME.players[player].light, 22);
      // token stays visible at home center, slightly shrunk visually by stacking
    }
  }

  syncPositions() {
    // hard-sync rendered positions to engine state (safety net)
    for (let p = 0; p < this.pos.length; p++)
      for (let t = 0; t < 4; t++) {
        const d = this.state.players[p].tokens[t];
        const [cx, cy] = tokenCell(p, d, t);
        const q = this.pos[p][t];
        q.x = cx; q.y = cy; q.hop = 0; q.hidden = false;
      }
  }

  // ---------- turn flow ----------
  setBanner(p) {
    const seat = this.config.seats[p];
    this.ui.turnText.textContent = `${seat.name} to play`;
    this.ui.turnDot.style.background = THEME.players[p].base;
    this.ui.turnDot.style.color = THEME.players[p].base;
  }

  async run() {
    await this.S(400);
    while (!L.isGameOver(this.state) && !this.over) {
      while (this.paused && !this.over) await this.S(200);
      if (this.over) break;
      const p = this.state.currentPlayer;
      this.setBanner(p);
      try {
        if (this.config.seats[p].type === "ai") await this.aiTurn(p);
        else await this.humanTurn(p);
      } catch (err) {
        console.error("turn error", err);
        this.state = L.passTurn(this.state);
      }
      this.syncPositions();
    }
    if (!this.over) {
      this.over = true;
      this.onGameOver(L.getPlacements(this.state), this.stats);
    }
  }

  async doRoll(p) {
    const r = L.rollDice(this.state);
    this.state = r.state;
    if (r.d1 === 6 || r.d2 === 6) this.stats.sixes[p]++;
    await this.tray.roll(r.d2 == null ? [r.d1] : [r.d1, r.d2], this.fast);
    return r;
  }

  async humanTurn(p) {
    await this.awaitRoll();
    this.ui.rollBtn.disabled = true;
    const r = await this.doRoll(p);
    if (r.forfeit) {
      this.ui.hint.textContent = this.state.config.diceMode === 2 ? "Three doubles — turn lost!" : "Three sixes — turn lost!";
      await this.S(1400);
      this.state = L.passTurn(this.state);
      return;
    }
    const moves = L.getLegalMoves(this.state, p, { d1: r.d1, d2: r.d2 });
    if (!moves.length) {
      this.ui.hint.textContent = "No moves — turn passes";
      await this.S(1100);
      this.state = L.passTurn(this.state);
      return;
    }
    if (this.state.config.diceMode === 1) {
      let sub;
      if (moves.length === 1) sub = moves[0];
      else {
        this.ui.hint.textContent = "Tap a glowing token";
        const cands = moves.map(m => ({ p, t: m.token, sub: m }));
        sub = await this.awaitPick(cands);
      }
      await this.animateSub(p, sub);
      this.state = L.applyMove(this.state, p, sub);
      if (sub.captures?.length) { this.stats.captures[p] += sub.captures.length; this.ui.hint.textContent = "Captured!"; }
    } else {
      await this.humanTurn2Dice(p, r, moves);
    }
    this.ui.hint.textContent = "";
  }

  async humanTurn2Dice(p, r, options) {
    // stage 1: pick first sub-move (d1)
    const seen = new Map();
    for (const o of options) {
      const s0 = o.steps[0];
      if (!s0) continue;
      const k = sig(s0);
      if (!seen.has(k)) seen.set(k, s0);
    }
    let first = [...seen.values()];
    if (first.length === 0) {
      // d1 unusable anywhere: play d2 directly
      const subs2 = L.getLegalSubMoves(this.state, p, r.d2);
      let sub2 = subs2.length === 1 ? subs2[0] : null;
      if (subs2.length > 1) {
        this.ui.hint.textContent = `Tap a token (die: ${r.d2})`;
        sub2 = await this.awaitPick(subs2.map(s => ({ p, t: s.token, sub: s })));
      }
      if (sub2) {
        await this.animateSub(p, sub2);
        if (sub2.captures?.length) this.stats.captures[p] += sub2.captures.length;
      }
      const k2 = sig(sub2);
      const opt = options.find(o => !o.steps[0] && sig(o.steps[1]) === k2) || options[0];
      this.state = L.applyMove(this.state, p, opt);
      this.ui.hint.textContent = "";
      return;
    }
    let sub1;
    if (first.length === 1) sub1 = first[0];
    else {
      this.ui.hint.textContent = `Tap a token (die: ${r.d1})`;
      sub1 = await this.awaitPick(first.map(s => ({ p, t: s.token, sub: s })));
    }
    const { state: scratch } = L.applySubMovePure(this.state, p, sub1);
    await this.animateSub(p, sub1);
    if (sub1.captures?.length) this.stats.captures[p] += sub1.captures.length;
    // stage 2: pick second sub-move (d2) on scratch state
    const subs2 = L.getLegalSubMoves(scratch, p, r.d2);
    let sub2 = null;
    if (subs2.length === 1) sub2 = subs2[0];
    else if (subs2.length > 1) {
      this.ui.hint.textContent = `Tap a token (die: ${r.d2})`;
      sub2 = await this.awaitPick(subs2.map(s => ({ p, t: s.token, sub: s })));
    }
    if (sub2) {
      await this.animateSub(p, sub2);
      if (sub2.captures?.length) this.stats.captures[p] += sub2.captures.length;
    }
    // find the full turn option matching our two picks
    const k1 = sig(sub1), k2 = sig(sub2);
    const opt = options.find(o => sig(o.steps[0]) === k1 && sig(o.steps[1]) === k2)
      || options.find(o => sig(o.steps[0]) === k1);
    this.state = L.applyMove(this.state, p, opt);
    this.ui.hint.textContent = "";
  }

  async aiTurn(p) {
    const diff = this.config.difficulty;
    await this.S(650);
    const r = await this.doRoll(p);
    if (r.forfeit) {
      this.ui.hint.textContent = `${this.config.seats[p].name}: three ${this.state.config.diceMode === 2 ? "doubles" : "sixes"}!`;
      await this.S(1200);
      this.state = L.passTurn(this.state);
      this.ui.hint.textContent = "";
      return;
    }
    const moves = L.getLegalMoves(this.state, p, { d1: r.d1, d2: r.d2 });
    if (!moves.length) {
      this.ui.hint.textContent = `${this.config.seats[p].name}: no moves`;
      await this.S(900);
      this.state = L.passTurn(this.state);
      this.ui.hint.textContent = "";
      return;
    }
    if (this.state.config.diceMode === 1) {
      const sub = chooseMove(this.state, p, moves, 1, diff);
      await this.animateSub(p, sub);
      this.state = L.applyMove(this.state, p, sub);
      if (sub.captures?.length) this.stats.captures[p] += sub.captures.length;
    } else {
      const opt = chooseMove(this.state, p, moves, 2, diff);
      for (const sub of opt.steps) {
        if (!sub) continue;
        await this.animateSub(p, sub);
        if (sub.captures?.length) this.stats.captures[p] += sub.captures.length;
        await this.S(250);
      }
      this.state = L.applyMove(this.state, p, opt);
    }
    await this.S(350);
  }
}
