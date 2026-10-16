// Ludo Royale — static premium board renderer (visual QA pass)
import { THEME, playerGradient, goldGradient } from "./theme.js";
import { GRID, TRACK, SAFE, START_OFFSET, HOME_COL, BASES, STARS, tokenCell } from "./geometry.js";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, rOuter, rInner, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = rot + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawSunburst(ctx, W, H) {
  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = THEME.gold;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
    ctx.lineTo(cx + Math.cos(a) * 620, cy + Math.sin(a) * 620);
    ctx.stroke();
  }
  for (const rad of [180, 300, 430, 560]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCellBase(ctx, x, y, s) {
  ctx.fillStyle = THEME.cell;
  ctx.fillRect(x, y, s, s);
  // engraved bevel: light top-left, dark bottom-right
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(x, y, s, 2);
  ctx.fillRect(x, y, 2, s);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y + s - 2, s, 2);
  ctx.fillRect(x + s - 2, y, 2, s);
}

export function computeView(canvas) {
  const W = canvas.width, H = canvas.height;
  const pad = 46;
  const s = (Math.min(W, H) - pad * 2) / GRID;
  const ox = (W - s * GRID) / 2, oy = (H - s * GRID) / 2;
  return { W, H, s, ox, oy, X: c => ox + c * s, Y: r => oy + r * s };
}

export function drawToken(ctx, cx, cy, r, player, selected = false) {
  const p = THEME.players[player];
  ctx.save();
  if (selected) {
    const pulse = 1 + 0.08 * Math.sin(Date.now() / 240);
    ctx.shadowColor = THEME.gold;
    ctx.shadowBlur = 26 * pulse;
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
  }
  // gold ring base
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = goldGradient(ctx, cx - r, cy - r, cx + r, cy + r);
  ctx.fill();
  // domed body
  const bodyR = r * 0.78;
  const bg = ctx.createRadialGradient(cx - bodyR * 0.35, cy - bodyR * 0.4, bodyR * 0.1, cx, cy, bodyR);
  bg.addColorStop(0, p.light);
  bg.addColorStop(0.55, p.base);
  bg.addColorStop(1, p.deep);
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowColor = "transparent";
  // top knob
  const kR = bodyR * 0.34;
  const kg = ctx.createRadialGradient(cx - kR * 0.3, cy - bodyR * 0.55 - kR * 0.3, kR * 0.1, cx, cy - bodyR * 0.55, kR);
  kg.addColorStop(0, "#ffffff");
  kg.addColorStop(0.4, p.light);
  kg.addColorStop(1, p.deep);
  ctx.beginPath();
  ctx.arc(cx, cy - bodyR * 0.55, kR, 0, Math.PI * 2);
  ctx.fillStyle = kg;
  ctx.fill();
  // specular dot
  ctx.beginPath();
  ctx.arc(cx - bodyR * 0.3, cy - bodyR * 0.35, bodyR * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();
  ctx.restore();
}

export function drawBoardBase(ctx, view) {
  const { W, H, s, ox, oy, X, Y } = view;

  // backdrop
  const bgG = ctx.createRadialGradient(W/2, H/2, 80, W/2, H/2, W*0.75);
  bgG.addColorStop(0, "#161C28");
  bgG.addColorStop(1, THEME.bg);
  ctx.fillStyle = bgG;
  ctx.fillRect(0, 0, W, H);
  drawSunburst(ctx, W, H);

  // board slab
  ctx.save();
  ctx.shadowColor = "rgba(212,175,55,0.28)";
  ctx.shadowBlur = 44;
  rr(ctx, ox - 14, oy - 14, s * GRID + 28, s * GRID + 28, 26);
  ctx.fillStyle = "#10141C";
  ctx.fill();
  ctx.restore();
  rr(ctx, ox - 14, oy - 14, s * GRID + 28, s * GRID + 28, 26);
  ctx.lineWidth = 3;
  ctx.strokeStyle = goldGradient(ctx, ox, oy, ox + s * GRID, oy + s * GRID);
  ctx.stroke();
  rr(ctx, ox - 7, oy - 7, s * GRID + 14, s * GRID + 14, 20);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(212,175,55,0.35)";
  ctx.stroke();

  // bases
  THEME.players.forEach((p, i) => {
    const b = BASES[i];
    const bx = X(b.x), by = Y(b.y), bw = s * 6, bh = s * 6;
    const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    g.addColorStop(0, "#1A2030");
    g.addColorStop(1, "#12161F");
    rr(ctx, bx + 3, by + 3, bw - 6, bh - 6, 18);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.base;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // art-deco corner ticks
    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    const t = 26;
    const corners = [[bx+10,by+10,1,1],[bx+bw-10,by+10,-1,1],[bx+10,by+bh-10,1,-1],[bx+bw-10,by+bh-10,-1,-1]];
    for (const [cx0, cy0, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx0, cy0 + sy * t); ctx.lineTo(cx0, cy0); ctx.lineTo(cx0 + sx * t, cy0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // token pads
    for (const [pcx, pcy] of b.pads) {
      const cx = X(pcx), cy = Y(pcy), pr = s * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = THEME.ivory;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });

  // track cells
  const startOf = {};
  START_OFFSET.forEach((g, p) => (startOf[g] = p));
  TRACK.forEach(([cx, cy], g) => {
    const x = X(cx), y = Y(cy);
    if (g in startOf) {
      const p = THEME.players[startOf[g]];
      ctx.save();
      ctx.shadowColor = p.base;
      ctx.shadowBlur = 18;
      ctx.fillStyle = playerGradient(ctx, p, x, y, x + s, y + s);
      ctx.fillRect(x, y, s, s);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x, y, s, 2.5);
    } else {
      drawCellBase(ctx, x, y, s);
    }
    if (SAFE.has(g) && !(g in startOf)) {
      // gold star on safe squares
      ctx.save();
      ctx.shadowColor = THEME.gold;
      ctx.shadowBlur = 10;
      star(ctx, x + s / 2, y + s / 2, s * 0.30, s * 0.13);
      ctx.fillStyle = goldGradient(ctx, x, y, x + s, y + s);
      ctx.fill();
      ctx.restore();
    }
  });

  // home columns
  HOME_COL.forEach((cells, p) => {
    const pl = THEME.players[p];
    cells.forEach(([cx, cy], idx) => {
      const x = X(cx), y = Y(cy);
      const fade = 1 - idx * 0.13;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      ctx.fillStyle = playerGradient(ctx, pl, x, y, x + s, y + s);
      ctx.fillRect(x, y, s, s);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y, s, 2);
    });
  });

  // home center: 4 triangles
  const hx = X(6), hy = Y(6), hs = s * 3, hcX = hx + hs / 2, hcY = hy + hs / 2;
  const tris = [
    [hx, hy, hx + hs, hy, hcX, hcY],                 // top -> P1 emerald
    [hx + hs, hy, hx + hs, hy + hs, hcX, hcY],       // right -> P2 topaz
    [hx + hs, hy + hs, hx, hy + hs, hcX, hcY],       // bottom -> P3 sapphire
    [hx, hy + hs, hx, hy, hcX, hcY],                 // left -> P0 ruby
  ];
  const triOrder = [1, 2, 3, 0];
  tris.forEach((tri, i) => {
    const p = THEME.players[triOrder[i]];
    ctx.beginPath();
    ctx.moveTo(tri[0], tri[1]); ctx.lineTo(tri[2], tri[3]); ctx.lineTo(tri[4], tri[5]);
    ctx.closePath();
    ctx.fillStyle = playerGradient(ctx, p, hx, hy, hx + hs, hy + hs);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = THEME.gold;
    ctx.stroke();
  });
  // crown jewel at center
  ctx.save();
  ctx.shadowColor = THEME.gold;
  ctx.shadowBlur = 16;
  star(ctx, hcX, hcY, s * 0.30, s * 0.13);
  ctx.fillStyle = goldGradient(ctx, hcX - s, hcY - s, hcX + s, hcY + s);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(246,226,122,0.7)";
  ctx.beginPath();
  ctx.arc(hcX, hcY, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return view;
}

export function drawStaticBoard(canvas, demoTokens = true) {
  const view = computeView(canvas);
  const { s, X, Y } = view;
  const ctx = canvas.getContext("2d");
  drawBoardBase(ctx, view);

  // demo tokens: a mid-game position to judge the look
  if (demoTokens) {
    const demo = [
      [0, 12, 0], [0, 41, 1], [0, -1, 2], [0, -1, 3],
      [1, 5, 0], [1, 27, 1], [1, -1, 2], [1, -1, 3],
      [2, 33, 0], [2, 52, 1], [2, -1, 2], [2, -1, 3],
      [3, 8, 0], [3, 20, 1], [3, -1, 2], [3, -1, 3],
    ];
    for (const [pl, d, padIdx] of demo) {
      const [ccx, ccy] = tokenCell(pl, d, padIdx);
      drawToken(ctx, X(ccx), Y(ccy), s * 0.40, pl, pl === 0 && d === 12);
    }
  }

  return { ctx, s, ox, oy };
}
