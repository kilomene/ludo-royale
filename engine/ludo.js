'use strict';

/**
 * Ludo Royale — pure rules engine.
 *
 * Zero dependencies, no DOM, vanilla Node. All game state is plain JSON
 * (numbers, arrays, strings, booleans, null) so it can be serialized with
 * JSON.stringify / JSON.parse at any point.
 *
 * Board model
 * -----------
 * - Players: 0=Red, 1=Green, 2=Yellow, 3=Blue. 2, 3 or 4 may be active.
 * - 52-cell main track, global indices 0..51.
 * - Start offsets: P0=0, P1=13, P2=26, P3=39.
 * - Safe squares (no capture, tokens coexist): 0, 8, 13, 21, 26, 34, 39, 47.
 * - Token distance d: -1 = in base; 0..50 = main track at global index
 *   (startOffset + d) % 52; 51..56 = own home column; 57 = finished.
 *
 * Randomness: mulberry32 PRNG, seed injectable. The PRNG's internal uint32
 * is stored inside the state (`state.rng`), so rolling dice is deterministic
 * and serializable. `rollDice` returns a NEW state (immutable style).
 *
 * Turn model
 * ----------
 * - 1-die mode: roll 1-6. A 6 may bring a token out (base -> d=0) and grants
 *   an extra roll. Three consecutive sixes forfeit the turn: the third 6
 *   makes no move. Capturing, or bringing a token home (d=57), also grants
 *   an extra roll.
 * - 2-dice mode: roll d1, d2; two sub-moves assignable to tokens in either
 *   order (same token may take both). A sub-move of 6 may bring a token out.
 *   Doubles grant an extra turn; three consecutive doubles forfeit the turn.
 *   Captures / home-finishes grant an extra roll, as in 1-die mode.
 *
 * API summary (see README.md for full docs):
 *   createGame({ numPlayers, diceMode, seed }) -> state
 *   rollDice(state) -> { d1, d2, state }
 *   getLegalMoves(state, playerIndex, dice) -> [ move ]
 *   getLegalSubMoves(state, playerIndex, dieValue) -> [ subMove ]
 *   enumerateTurnOptions(state, playerIndex, d1, d2) -> [ turnOption ]
 *   applyMove(state, playerIndex, move) -> newState   (immutable)
 *   passTurn(state) -> newState
 *   isGameOver(state) -> bool
 *   getPlacements(state) -> [ { player, place } ]
 */

const NUM_TOKENS = 4;
const TRACK_LEN = 52;
const START_OFFSETS = [0, 13, 26, 39];
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const BASE = -1;
const FINISHED = 57;
const HOME_COLUMN_START = 51;
const HOME_COLUMN_END = 56;

// ---------------------------------------------------------------------------
// PRNG (mulberry32, explicit state so it stays serializable)
// ---------------------------------------------------------------------------

/** Advance a mulberry32 state (uint32). Returns { value in [0,1), rng }. */
function rngNext(rng) {
  let a = (rng + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: a | 0 };
}

// ---------------------------------------------------------------------------
// State construction / cloning
// ---------------------------------------------------------------------------

function cloneState(state) {
  // Plain-JSON state: structuredClone is exact and fast on Node 24.
  return structuredClone(state);
}

/**
 * Create a new game.
 * @param {object} opts
 * @param {2|3|4} opts.numPlayers
 * @param {1|2} opts.diceMode
 * @param {number} [opts.seed] - defaults to Date.now() (non-deterministic)
 */
function createGame({ numPlayers = 4, diceMode = 1, seed = Date.now() } = {}) {
  if (![2, 3, 4].includes(numPlayers)) {
    throw new Error(`numPlayers must be 2, 3 or 4 (got ${numPlayers})`);
  }
  if (![1, 2].includes(diceMode)) {
    throw new Error(`diceMode must be 1 or 2 (got ${diceMode})`);
  }
  const players = [];
  for (let p = 0; p < numPlayers; p++) {
    players.push({ tokens: [BASE, BASE, BASE, BASE], finished: false, placement: 0 });
  }
  return {
    config: { numPlayers, diceMode, seed: seed >>> 0 },
    rng: seed >>> 0,
    players,
    currentPlayer: 0,
    turn: { sixes: 0, doubles: 0 },
    lastRoll: null,
    placements: [], // [{ player, place }] in finish order
    gameOver: false,
    moveCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

/** Global track index (0..51) for a player token at distance d (0..50). */
function globalOf(player, d) {
  return (START_OFFSETS[player] + d) % TRACK_LEN;
}

function isSafeGlobal(g) {
  return SAFE_SQUARES.has(g);
}

/**
 * Count, for each opponent of `player`, how many of their tokens sit on
 * global track square g. Returns { counts: Map(player->n), tokens: [...] }.
 */
function opponentsOn(state, player, g) {
  const counts = new Map();
  const tokens = [];
  for (let q = 0; q < state.config.numPlayers; q++) {
    if (q === player) continue;
    const toks = state.players[q].tokens;
    for (let t = 0; t < toks.length; t++) {
      const d = toks[t];
      if (d >= 0 && d <= 50 && globalOf(q, d) === g) {
        counts.set(q, (counts.get(q) || 0) + 1);
        tokens.push({ player: q, token: t });
      }
    }
  }
  return { counts, tokens };
}

/**
 * Path blocking: is the path from distance `fromD` (exclusive) to `destD`
 * (inclusive) blocked for `player`? Only main-track squares (distance <= 50)
 * are considered; safe squares never block; only a NON-SAFE square holding
 * 2+ tokens of a single opponent is a blockade. Own blockades never block.
 */
function isPathBlocked(state, player, fromD, destD) {
  const last = Math.min(destD, 50);
  for (let d = fromD + 1; d <= last; d++) {
    const g = globalOf(player, d);
    if (isSafeGlobal(g)) continue; // safe squares never hold blockades vs passers
    const { counts } = opponentsOn(state, player, g);
    for (const n of counts.values()) {
      if (n >= 2) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

/**
 * Roll the dice for the current player. Advances the seeded PRNG and updates
 * the consecutive-sixes / consecutive-doubles counters in the returned state.
 *
 * In 1-die mode returns { d1, d2: null, state }. In 2-dice mode { d1, d2, state }.
 * If the roll triggers a forfeit (3rd consecutive six / 3rd consecutive
 * doubles), `forfeit` is true and the caller should pass the turn with
 * passTurn() — getLegalMoves() will return [] for such a roll.
 */
function rollDice(state) {
  if (state.gameOver) throw new Error('rollDice: game is over');
  const s = cloneState(state);
  const r1 = rngNext(s.rng);
  s.rng = r1.rng;
  const d1 = 1 + Math.floor(r1.value * 6);
  let d2 = null;
  if (s.config.diceMode === 2) {
    const r2 = rngNext(s.rng);
    s.rng = r2.rng;
    d2 = 1 + Math.floor(r2.value * 6);
  }
  s.lastRoll = { d1, d2 };

  let forfeit = false;
  if (s.config.diceMode === 1) {
    if (d1 === 6) {
      s.turn.sixes += 1;
      if (s.turn.sixes >= 3) forfeit = true; // third six: no move, turn ends
    } else {
      s.turn.sixes = 0;
    }
  } else {
    if (d1 === d2) {
      s.turn.doubles += 1;
      if (s.turn.doubles >= 3) forfeit = true; // third doubles: no move, turn ends
    } else {
      s.turn.doubles = 0;
    }
  }
  return { d1, d2, state: s, forfeit };
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

/**
 * All legal single-die sub-moves for one token die value.
 * Each sub-move: { kind:'sub', token, die, from, to, bringOut, captures,
 *   finishes, entersHomeColumn }.
 * Captures only happen on non-safe main-track landings, and only when the
 * square does NOT hold a blockade (2+ of one opponent).
 */
function getLegalSubMoves(state, playerIndex, dieValue) {
  if (!Number.isInteger(dieValue) || dieValue < 1 || dieValue > 6) {
    throw new Error(`dieValue must be 1..6 (got ${dieValue})`);
  }
  const numPlayers = state.config.numPlayers;
  if (playerIndex < 0 || playerIndex >= numPlayers) {
    throw new Error(`bad playerIndex ${playerIndex}`);
  }
  const player = state.players[playerIndex];
  if (player.finished || state.gameOver) return [];

  const moves = [];
  for (let t = 0; t < NUM_TOKENS; t++) {
    const from = player.tokens[t];

    // Bring out of base: only on a 6. d=0 is the player's start square,
    // which is always safe, so no capture is possible.
    if (from === BASE) {
      if (dieValue === 6) {
        moves.push({
          kind: 'sub',
          token: t,
          die: dieValue,
          from,
          to: 0,
          bringOut: true,
          captures: [],
          finishes: false,
          entersHomeColumn: false,
        });
      }
      continue;
    }
    if (from === FINISHED) continue;

    const to = from + dieValue;
    if (to > FINISHED) continue; // exact roll required to finish

    if (isPathBlocked(state, playerIndex, from, to)) continue;

    if (to === FINISHED) {
      moves.push({
        kind: 'sub',
        token: t,
        die: dieValue,
        from,
        to,
        bringOut: false,
        captures: [],
        finishes: true,
        entersHomeColumn: false,
      });
      continue;
    }

    if (to >= HOME_COLUMN_START) {
      // Own home column: no opponents, no captures, stacking always fine.
      moves.push({
        kind: 'sub',
        token: t,
        die: dieValue,
        from,
        to,
        bringOut: false,
        captures: [],
        finishes: false,
        entersHomeColumn: true,
      });
      continue;
    }

    // Main-track landing.
    const g = globalOf(playerIndex, to);
    if (isSafeGlobal(g)) {
      moves.push({
        kind: 'sub',
        token: t,
        die: dieValue,
        from,
        to,
        bringOut: false,
        captures: [],
        finishes: false,
        entersHomeColumn: false,
      });
      continue;
    }
    const { counts, tokens } = opponentsOn(state, playerIndex, g);
    let blockade = false;
    for (const n of counts.values()) {
      if (n >= 2) { blockade = true; break; }
    }
    if (blockade) continue; // cannot land on (or pass, already checked) a blockade
    moves.push({
      kind: 'sub',
      token: t,
      die: dieValue,
      from,
      to,
      bringOut: false,
      captures: tokens, // all opponent tokens here are captured (no blockade possible)
      finishes: false,
      entersHomeColumn: false,
    });
  }
  return moves;
}

/**
 * Legal moves for a full dice roll.
 *
 * 1-die mode: returns the array of sub-moves for d1 (each with `extraTurn`
 * set: true when the roll was a 6, a capture happened, or a token finished).
 * Returns [] when the turn is forfeited (3rd six) or no move is legal.
 *
 * 2-dice mode: returns full-turn options, each:
 *   { kind:'turn', d1, d2, doubles, steps:[sub|null, sub|null],
 *     captures, finishes, bringsOut, extraTurn }
 * `steps[0]` consumes d1, `steps[1]` consumes d2; a null step means that
 * sub-move had no legal option and is skipped. Returns [] when neither
 * sub-move has a legal option or the turn is forfeited (3rd doubles).
 *
 * @param {object} state
 * @param {number} playerIndex
 * @param {object|number} dice - { d1, d2 } (d2 null in 1-die mode), or a
 *   plain die value (treated as d1 in 1-die mode).
 */
function getLegalMoves(state, playerIndex, dice) {
  const d1 = typeof dice === 'number' ? dice : dice.d1;
  const d2 = typeof dice === 'number' ? null : dice.d2;
  if (state.config.diceMode === 1) {
    // Forfeit: the third consecutive six makes no move.
    if (d1 === 6 && playerIndex === state.currentPlayer && state.turn.sixes >= 3) {
      return [];
    }
    const subs = getLegalSubMoves(state, playerIndex, d1);
    for (const m of subs) {
      m.extraTurn = d1 === 6 || m.captures.length > 0 || m.finishes;
    }
    return subs;
  }
  return enumerateTurnOptions(state, playerIndex, d1, d2);
}

// ---------------------------------------------------------------------------
// 2-dice turn enumeration
// ---------------------------------------------------------------------------

/**
 * Apply a single sub-move to a scratch state: token movement, captures,
 * home-finishes and placement recording — but NO turn advancement and NO
 * extra-turn bookkeeping (the caller decides that from the turn summary).
 * Returns { state, move } where move is the fully-resolved legal sub-move.
 * Throws if the sub-move is illegal.
 */
function applySubMovePure(state, playerIndex, sub) {
  const legal = getLegalSubMoves(state, playerIndex, sub.die);
  const match = legal.find(
    (m) => m.token === sub.token && m.from === sub.from && m.to === sub.to && !!m.bringOut === !!sub.bringOut
  );
  if (!match) {
    throw new Error(
      `illegal sub-move: player ${playerIndex} token ${sub.token} ${sub.from}->${sub.to} on die ${sub.die}`
    );
  }
  const s = cloneState(state);
  const player = s.players[playerIndex];
  player.tokens[sub.token] = match.to;
  for (const c of match.captures) {
    s.players[c.player].tokens[c.token] = BASE;
  }
  s.moveCount += 1;
  if (match.finishes) recordFinishIfWon(s, playerIndex);
  return { state: s, move: match };
}

/** If all 4 tokens of playerIndex are home, record placement / end game. */
function recordFinishIfWon(s, playerIndex) {
  const player = s.players[playerIndex];
  if (player.finished) return;
  if (player.tokens.every((d) => d === FINISHED)) {
    player.finished = true;
    player.placement = s.placements.length + 1;
    s.placements.push({ player: playerIndex, place: player.placement });
    if (s.placements.length === s.config.numPlayers - 1) {
      // Last remaining player takes the final place automatically.
      for (let q = 0; q < s.config.numPlayers; q++) {
        if (!s.players[q].finished) {
          s.players[q].finished = true;
          s.players[q].placement = s.config.numPlayers;
          s.placements.push({ player: q, place: s.config.numPlayers });
        }
      }
      s.gameOver = true;
    }
  }
}

/**
 * Enumerate sensible full-turn options for a 2-dice roll. Each option applies
 * d1 first, then d2, to the evolving state. Branching is naturally small
 * (<= 4 tokens per sub-move); options are deduped and capped.
 */
function enumerateTurnOptions(state, playerIndex, d1, d2, maxOptions = 64) {
  // Forfeit: third consecutive doubles makes no move.
  if (d1 === d2 && playerIndex === state.currentPlayer && state.turn.doubles >= 3) {
    return [];
  }
  const player = state.players[playerIndex];
  if (!player || player.finished || state.gameOver) return [];

  const firsts = getLegalSubMoves(state, playerIndex, d1);
  const secondsIfSkipped = getLegalSubMoves(state, playerIndex, d2);
  const options = [];
  const seen = new Set();
  const doubles = d1 === d2;

  const pushOption = (first, second) => {
    const key = [
      first ? `${first.token}:${first.from}>${first.to}` : 'x',
      second ? `${second.token}:${second.from}>${second.to}` : 'x',
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const captures = [
      ...(first ? first.captures : []),
      ...(second ? second.captures : []),
    ];
    const finishes = (first && first.finishes ? 1 : 0) + (second && second.finishes ? 1 : 0);
    const bringsOut = (first && first.bringOut ? 1 : 0) + (second && second.bringOut ? 1 : 0);
    options.push({
      kind: 'turn',
      d1,
      d2,
      doubles,
      steps: [first, second],
      captures,
      finishes,
      bringsOut,
      extraTurn: doubles || captures.length > 0 || finishes > 0,
    });
  };

  if (firsts.length === 0) {
    // First sub-move has no legal option: skipped; second may still play.
    for (const s2 of secondsIfSkipped) {
      if (options.length >= maxOptions) break;
      pushOption(null, s2);
    }
    return options;
  }

  for (const f of firsts) {
    if (options.length >= maxOptions) break;
    const { state: mid } = applySubMovePure(state, playerIndex, f);
    if (mid.players[playerIndex].finished || mid.gameOver) {
      // Player finished all tokens with the first sub-move: turn ends here.
      pushOption(f, null);
      continue;
    }
    const seconds = getLegalSubMoves(mid, playerIndex, d2);
    // Re-anchor the second sub-move's `from` to the ORIGINAL pre-turn state
    // when it moves the same token the first sub-move moved, so the option
    // reads cleanly? No — keep steps as computed on the evolving state;
    // applyMove re-validates sequentially, so evolving-state steps are correct.
    if (seconds.length === 0) {
      pushOption(f, null);
    } else {
      for (const s2 of seconds) {
        if (options.length >= maxOptions) break;
        pushOption(f, s2);
      }
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Applying moves / turn flow
// ---------------------------------------------------------------------------

/** Advance currentPlayer to the next unfinished player; reset turn counters. */
function advancePlayer(s) {
  const n = s.config.numPlayers;
  let next = s.currentPlayer;
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n;
    if (!s.players[next].finished) break;
  }
  s.currentPlayer = next;
  s.turn = { sixes: 0, doubles: 0 };
  s.lastRoll = null;
}

/**
 * Pass the turn without moving (no legal move, or forfeited roll).
 * Resets the sixes/doubles chain and moves to the next unfinished player.
 */
function passTurn(state) {
  if (state.gameOver) throw new Error('passTurn: game is over');
  const s = cloneState(state);
  advancePlayer(s);
  return s;
}

/**
 * Apply a move (immutable — input state is not mutated).
 *
 * 1-die move: { kind:'sub', token, die, ... } as returned by getLegalMoves.
 *   After the move: extra turn if the die was 6, a capture happened, or a
 *   token finished; otherwise the turn passes to the next unfinished player.
 *   A player who just placed (all tokens home) is skipped: turn advances.
 *
 * 2-dice move: { kind:'turn', steps:[sub|null, sub|null], ... }.
 *   Steps apply sequentially. Extra turn on doubles, any capture, or any
 *   home-finish; otherwise the turn passes.
 *
 * Throws on illegal moves.
 */
function applyMove(state, playerIndex, move) {
  if (state.gameOver) throw new Error('applyMove: game is over');
  if (playerIndex !== state.currentPlayer) {
    throw new Error(`applyMove: not player ${playerIndex}'s turn (current: ${state.currentPlayer})`);
  }
  if (!move || (move.kind !== 'sub' && move.kind !== 'turn')) {
    throw new Error('applyMove: move must be a sub-move or turn option from getLegalMoves');
  }

  if (move.kind === 'sub') {
    if (state.config.diceMode !== 1) {
      throw new Error('applyMove: single sub-moves only apply in 1-die mode');
    }
    const { state: s, move: resolved } = applySubMovePure(state, playerIndex, move);
    const finishedNow = s.players[playerIndex].finished;
    if (s.gameOver || finishedNow) {
      // Player placed (or game ended): they are skipped from now on.
      if (!s.gameOver) advancePlayer(s);
      return s;
    }
    const extraTurn = move.die === 6 || resolved.captures.length > 0 || resolved.finishes;
    if (!extraTurn) advancePlayer(s);
    // else: same player continues; turn.sixes / turn.doubles already updated by rollDice
    return s;
  }

  // 2-dice full-turn move.
  if (state.config.diceMode !== 2) {
    throw new Error('applyMove: turn options only apply in 2-dice mode');
  }
  let s = cloneState(state);
  let captures = 0;
  let finishes = 0;
  for (const step of move.steps) {
    if (!step) continue; // skipped sub-move
    const before = s.players[playerIndex].tokens.filter((d) => d === FINISHED).length;
    const applied = applySubMovePure(s, playerIndex, step);
    s = applied.state;
    const after = s.players[playerIndex].tokens.filter((d) => d === FINISHED).length;
    finishes += after - before;
    captures += applied.move.captures.length;
    if (s.gameOver) break;
  }
  if (s.gameOver || s.players[playerIndex].finished) {
    if (!s.gameOver) advancePlayer(s);
    return s;
  }
  const extraTurn = move.d1 === move.d2 || captures > 0 || finishes > 0;
  if (!extraTurn) advancePlayer(s);
  return s;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function isGameOver(state) {
  return state.gameOver;
}

/**
 * Placement order: [ { player, place } ] sorted by place (1st, 2nd, ...).
 * Complete once the game is over (last player is placed automatically).
 */
function getPlacements(state) {
  return state.placements
    .slice()
    .sort((a, b) => a.place - b.place)
    .map((p) => ({ player: p.player, place: p.place }));
}

/** Global track index of a token, or null when not on the main track. */
function tokenGlobalIndex(state, playerIndex, tokenIndex) {
  const d = state.players[playerIndex].tokens[tokenIndex];
  if (d >= 0 && d <= 50) return globalOf(playerIndex, d);
  return null;
}

module.exports = {
  // constants
  NUM_TOKENS,
  TRACK_LEN,
  START_OFFSETS,
  SAFE_SQUARES: Array.from(SAFE_SQUARES),
  BASE,
  FINISHED,
  HOME_COLUMN_START,
  HOME_COLUMN_END,
  // api
  createGame,
  rollDice,
  getLegalMoves,
  getLegalSubMoves,
  enumerateTurnOptions,
  applyMove,
  applySubMovePure,
  passTurn,
  isGameOver,
  getPlacements,
  tokenGlobalIndex,
  // helpers (exported for tests / UI)
  globalOf,
  isSafeGlobal,
};
