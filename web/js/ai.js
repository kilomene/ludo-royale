// Ludo Royale — AI opponents (casual / sharp / grandmaster)
import * as L from "./ludo.esm.js";

const SAFE = new Set(L.SAFE_SQUARES);

// Opponent tokens that could capture global square g on their next roll
// (i.e. sitting 1..6 squares behind g on the main track).
function capturersOn(state, player, g) {
  const out = [];
  for (let op = 0; op < state.players.length; op++) {
    if (op === player) continue;
    state.players[op].tokens.forEach((d, t) => {
      if (d < 0 || d > 50) return;
      const og = L.globalOf(op, d);
      const behind = (g - og + 52) % 52;
      if (behind >= 1 && behind <= 6) out.push({ op, t, behind });
    });
  }
  return out;
}

function tokenGlobal(state, player, t) {
  const d = state.players[player].tokens[t];
  return d >= 0 && d <= 50 ? L.globalOf(player, d) : null;
}

// Static positional score of one of my tokens
function tokenScore(state, player, t) {
  const d = state.players[player].tokens[t];
  if (d === -1) return 0;
  if (d === 57) return 130;
  if (d >= 51) return 55 + d; // home column: deep = better
  const g = L.globalOf(player, d);
  let s = d * 0.9; // progress
  if (SAFE.has(g)) s += 28;
  else {
    // blockade?
    const mates = state.players[player].tokens.filter((x, i) => i !== t && x === d).length;
    if (mates > 0) s += 24;
    else if (capturersOn(state, player, g).length > 0) s -= 52; // hanging
  }
  return s;
}

function positionScore(state, player) {
  let s = 0;
  for (let t = 0; t < 4; t++) s += tokenScore(state, player, t);
  // slight penalty for opponent progress (race awareness)
  for (let op = 0; op < state.players.length; op++) {
    if (op === player) continue;
    for (const d of state.players[op].tokens) if (d > 0) s -= Math.min(d, 57) * 0.12;
  }
  return s;
}

// Score a 1-die sub-move by simulating it
function scoreSub(state, player, sub, deep) {
  const { state: ns } = L.applySubMovePure(state, player, sub);
  let s = positionScore(ns, player) - positionScore(state, player);
  if (sub.bringOut) s += 50;
  s += (sub.captures?.length || 0) * 120;
  if (sub.finishes) s += 95;
  if (sub.extraTurn) s += 18;
  if (deep) {
    // 1-ply: penalize leaving tokens immediately capturable
    for (let t = 0; t < 4; t++) {
      const g = tokenGlobal(ns, player, t);
      if (g !== null && !SAFE.has(g)) {
        const threat = capturersOn(ns, player, g);
        if (threat.length) s -= 55 + threat.length * 10;
      }
    }
    // reward creating a blockade
    if (sub.to <= 50 && !SAFE.has(L.globalOf(player, sub.to))) {
      const mates = ns.players[player].tokens.filter(d => d === sub.to).length;
      if (mates >= 2) s += 22;
    }
  }
  return s;
}

// Score a 2-dice turn option
function scoreTurn(state, player, opt, deep) {
  const ns = L.applyMove(state, player, opt);
  let s = positionScore(ns, player) - positionScore(state, player);
  s += (opt.captures?.length || 0) * 120;
  s += (opt.finishes || 0) * 95;
  s += (opt.bringsOut || 0) * 50;
  if (opt.extraTurn) s += 18;
  if (deep) {
    for (let t = 0; t < 4; t++) {
      const g = tokenGlobal(ns, player, t);
      if (g !== null && !SAFE.has(g) && capturersOn(ns, player, g).length) s -= 55;
    }
  }
  return s;
}

export function chooseMove(state, player, moves, diceMode, difficulty = "sharp") {
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  if (difficulty === "casual") {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  const deep = difficulty === "grandmaster";
  const noise = difficulty === "sharp" ? 10 : 0;
  let best = moves[0], bestS = -Infinity;
  for (const mv of moves) {
    const s =
      (diceMode === 1
        ? scoreSub(state, player, mv, deep)
        : scoreTurn(state, player, mv, deep)) +
      (noise ? (Math.random() * 2 - 1) * noise : 0);
    if (s > bestS) { bestS = s; best = mv; }
  }
  return best;
}

// Pick a single sub-move (for step-by-step 2-dice UI/AI)
export function chooseSub(state, player, subs, difficulty = "sharp") {
  if (!subs.length) return null;
  if (subs.length === 1) return subs[0];
  if (difficulty === "casual") return subs[Math.floor(Math.random() * subs.length)];
  const deep = difficulty === "grandmaster";
  let best = subs[0], bestS = -Infinity;
  for (const sub of subs) {
    const s = scoreSub(state, player, sub, deep) + (deep ? 0 : (Math.random() * 2 - 1) * 10);
    if (s > bestS) { bestS = s; best = sub; }
  }
  return best;
}
