// Ludo Royale — screen flow + setup wiring
import { THEME } from "./theme.js";
import { drawDie } from "./dice.js";
import { GameController } from "./game.js";

const $ = id => document.getElementById(id);
const screens = ["screen-splash", "screen-setup", "screen-game"];
function show(name) {
  screens.forEach(s => $(s).classList.toggle("active", s === name));
  if (name === "screen-game") fitBoard();
}
function fitBoard() {
  const wrap = $("board-wrap"), canvas = $("board");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const size = Math.max(280, Math.min(w, h));
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
}
window.addEventListener("resize", () => { if ($("screen-game").classList.contains("active")) fitBoard(); });

// ---------- splash dice ----------
(function splashDice() {
  const c = $("splash-dice"), ctx = c.getContext("2d");
  let v = [3, 5], next = 1400, last = performance.now(), rot = 0;
  function frame(now) {
    if (!$("screen-splash").classList.contains("active")) { requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, c.width, c.height);
    const tumbling = now - last < 700;
    if (tumbling) {
      rot += 0.25;
      const f1 = 1 + Math.floor(Math.random() * 6), f2 = 1 + Math.floor(Math.random() * 6);
      const b = Math.abs(Math.sin((now - last) / 700 * Math.PI * 4)) * 14 * (1 - (now - last) / 700);
      drawDie(ctx, f1, 62, 55 - b, 84, rot);
      drawDie(ctx, f2, 158, 55 - b * 0.7, 84, -rot * 0.8);
    } else {
      drawDie(ctx, v[0], 62, 55, 84, -0.1);
      drawDie(ctx, v[1], 158, 55, 84, 0.08);
    }
    if (now - last > next) {
      last = now; next = 2200 + Math.random() * 1500;
      v = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ---------- setup state ----------
const setup = { players: 4, dice: 1, mode: "ai", difficulty: "sharp", humanSeat: 0 };

function seg(id, key, parse = Number) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    $(id).querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    setup[key] = parse(b.dataset.v);
    if (key === "mode") {
      $("group-difficulty").style.display = setup.mode === "ai" ? "" : "none";
    }
    renderSeats();
  });
}
seg("seg-players", "players");
seg("seg-dice", "dice");
seg("seg-mode", "mode", v => v);
seg("seg-diff", "difficulty", v => v);

const SEAT_NAMES = ["Ruby", "Emerald", "Topaz", "Sapphire"];
function renderSeats() {
  const box = $("seats");
  box.innerHTML = "";
  for (let i = 0; i < setup.players; i++) {
    const p = THEME.players[i];
    const d = document.createElement("div");
    d.className = "seat" + (setup.mode === "ai" && i === setup.humanSeat ? " you" : "");
    d.style.background = `linear-gradient(135deg, ${p.light}, ${p.base} 60%, ${p.deep})`;
    const isHuman = setup.mode === "pass" || i === setup.humanSeat;
    d.innerHTML = `<span class="tag">${isHuman ? "YOU" : "AI"}</span>`;
    d.title = SEAT_NAMES[i];
    if (setup.mode === "ai") {
      d.addEventListener("click", () => { setup.humanSeat = i; renderSeats(); });
    }
    box.appendChild(d);
  }
}
renderSeats();

// ---------- overlays ----------
function overlay(id, showIt) { $(id).classList.toggle("hidden", !showIt); }

let game = null;
function startGame() {
  if (game) game.destroy();
  const autoplay = new URLSearchParams(location.search).has("autoplay");
  const seats = [];
  for (let i = 0; i < setup.players; i++) {
    const isHuman = !autoplay && (setup.mode === "pass" || i === setup.humanSeat);
    seats.push({
      type: isHuman ? "human" : "ai",
      name: isHuman ? (setup.mode === "pass" ? `Player ${i + 1}` : "You") : `${SEAT_NAMES[i]} AI`,
    });
  }
  show("screen-game");
  // ensure layout settled before controller reads canvas size
  requestAnimationFrame(() => {
    game = new GameController({
      canvas: $("board"),
      ui: {
        rollBtn: $("btn-roll"), hint: $("hint"),
        turnText: $("turn-text"), turnDot: $("turn-dot"),
        diceCanvas: $("dice-canvas"),
      },
      config: {
        numPlayers: setup.players,
        diceMode: setup.dice,
        seats,
        difficulty: setup.difficulty,
        fast: new URLSearchParams(location.search).has("fast"),
      },
      onGameOver: showPodium,
    });
    window.__ludoGame = game; // QA handle
    window.__ludoPodium = showPodium; // QA handle
  });
}

function showPodium(placements, stats) {
  const medals = ["🥇", "🥈", "🥉", "4th"];
  $("podium-rows").innerHTML = placements.map((pl, i) => {
    const seat = game.config.seats[pl.player];
    const p = THEME.players[pl.player];
    return `<div class="podium-row"><span class="medal">${medals[i]}</span>
      <span class="who" style="color:${p.light}">${seat.name}</span>
      <span>${stats.captures[pl.player]} captures</span></div>`;
  }).join("");
  const sixes = Object.values(stats.sixes).reduce((a, b) => a + b, 0);
  $("podium-stats").innerHTML = `${sixes} sixes rolled this game · ${placements.length}-player battle`;
  $("overlay-podium").querySelector(".logo").textContent =
    game.config.seats[placements[0].player].type === "human" ? "VICTORY" : "DEFEAT";
  overlay("overlay-podium", true);
}

// ---------- buttons ----------
$("btn-enter").addEventListener("click", () => show("screen-setup"));
$("btn-start").addEventListener("click", startGame);
$("btn-pause").addEventListener("click", () => { if (game) game.setPaused(true); overlay("overlay-pause", true); });
$("btn-resume").addEventListener("click", () => { overlay("overlay-pause", false); if (game) game.setPaused(false); });
$("btn-quit").addEventListener("click", () => {
  overlay("overlay-pause", false);
  if (game) { game.destroy(); game = null; }
  show("screen-setup");
});
$("btn-rules").addEventListener("click", () => overlay("overlay-rules", true));
$("btn-rules2").addEventListener("click", () => overlay("overlay-rules", true));
$("btn-rules-close").addEventListener("click", () => overlay("overlay-rules", false));
$("btn-again").addEventListener("click", () => { overlay("overlay-podium", false); startGame(); });
$("btn-podium-menu").addEventListener("click", () => {
  overlay("overlay-podium", false);
  if (game) { game.destroy(); game = null; }
  show("screen-setup");
});
$("btn-sound").addEventListener("click", e => {
  const b = e.currentTarget;
  b.style.opacity = b.style.opacity === "0.35" ? "1" : "0.35";
});
