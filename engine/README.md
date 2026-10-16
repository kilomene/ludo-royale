# Ludo Royale — Rules Engine

Pure-JavaScript, zero-dependency, DOM-free implementation of **complete official
Ludo rules**. Runs on vanilla Node (24+). This engine is the rules foundation
for the Ludo Royale mobile game; the UI is built on top of its public API.

## Rules implemented

### Board

- 4 players: `0` = Red, `1` = Green, `2` = Yellow, `3` = Blue. Games support
  2, 3, or 4 active players (players `0..numPlayers-1`).
- 52-cell main track, global indices `0..51`.
- Start offsets: P0 = 0, P1 = 13, P2 = 26, P3 = 39.
- Safe squares (no capture possible, tokens of any players coexist):
  `0, 8, 13, 21, 26, 34, 39, 47`. Every player's start square is safe.
- Each player has 4 tokens. A token's **distance** `d`:
  - `-1` — in base (off the board)
  - `0..50` — on the main track at global index `(startOffset + d) % 52`
  - `51..56` — in the player's own home column
  - `57` — finished (home triangle)

### Turn rules — 1 die

- Roll 1–6 (seeded PRNG, see below).
- A **6** may bring a token out of base (`-1 → 0`) and grants an **extra roll**.
- **Three consecutive sixes forfeit the turn**: the third 6 makes no move at
  all (moves already made earlier in the turn stand) and the turn ends.
- A token at `d` moves to `d + roll`. `d + roll > 57` is illegal — an **exact
  roll is required to finish**.
- Bring-out only on a 6. Stacking your own tokens on any square is legal.
- **Path blocking**: a move is illegal if any intermediate main-track square
  (`d+1 .. dest`, only squares with distance ≤ 50) holds **2+ tokens of a
  single opponent** (a blockade) — blockades cannot be passed. Safe squares
  never hold blockades against passers, and your own blockades never block you.
- **Landing** on the main track (`dest ≤ 50`):
  - safe square → always legal, never captures;
  - non-safe square → illegal if it holds an opponent blockade (2+ of one
    opponent); otherwise every opponent token there is **captured** (sent back
    to base, `d = -1`). Tokens of several opponents on one square are all
    captured.
- Home column (`51..56`): only your own tokens can be there; no captures;
  stacking is fine.
- **Capturing** an opponent's token grants an extra roll. Bringing a token
  **home** (`d = 57`) grants an extra roll.
- No legal move for a roll → the turn passes. (A 6 with no legal move still
  ends the turn and resets the sixes chain.)
- **Win**: all 4 tokens at `d = 57`. Placements are recorded in finish order
  (1st, 2nd, 3rd); the last remaining player is placed automatically and the
  game ends. Finished players are skipped in turn order thereafter.

### Turn rules — 2 dice

- Roll `d1`, `d2`. Two sub-moves: one of `d1` steps, one of `d2` steps,
  assignable to tokens in either order; the same token may take both.
- A sub-move of **6** may instead bring a token out of base (consumes that
  sub-move).
- **Doubles** (`d1 == d2`) grant an extra turn. **Three consecutive doubles
  forfeit the turn** (the third doubles roll makes no move).
- Each sub-move is validated with the same legality rules (blocking, capture,
  exact finish), applied sequentially to the evolving state. If the first
  sub-move has no legal option it is skipped; if neither has any, the turn
  passes.
- A 6 sub-move alone does **not** grant an extra turn (unlike 1-die mode).
  Captures and home-finishes during either sub-move grant an extra roll.

### Randomness & determinism

All dice rolls come from a **mulberry32** PRNG with an injectable seed. The
PRNG's internal state lives inside the game state (`state.rng`), so:

- the same seed always produces the same game given the same move choices;
- the state is fully serializable — `JSON.parse(JSON.stringify(state))`
  deep-equals the original at any point;
- all engine functions are **immutable**: inputs are never mutated; new state
  objects are returned.

## API

```js
const L = require('./ludo.js');
```

### `createGame({ numPlayers, diceMode, seed }) → state`

- `numPlayers`: `2 | 3 | 4` (required-ish, defaults to 4)
- `diceMode`: `1 | 2` (defaults to 1)
- `seed`: any integer (defaults to `Date.now()` — non-deterministic)

Returns the initial state: all tokens in base, `currentPlayer: 0`.

### `rollDice(state) → { d1, d2, state, forfeit }`

Rolls for `state.currentPlayer`. Advances the seeded PRNG and updates the
consecutive-sixes / consecutive-doubles counters. `d2` is `null` in 1-die
mode. `state` is the **new** state (input untouched). `forfeit` is `true` on
the 3rd consecutive six / doubles — the caller should then `passTurn()`
(`getLegalMoves` returns `[]` for such a roll). Throws if the game is over.

### `getLegalMoves(state, playerIndex, dice) → [move]`

- `dice`: `{ d1, d2 }` as returned by `rollDice`, or a bare die number
  (treated as `d1` in 1-die mode).
- **1-die mode** → array of sub-moves, each fully resolved:
  `{ kind:'sub', token, die, from, to, bringOut, captures:[{player, token}],
  finishes, entersHomeColumn, extraTurn }`.
  `[]` when the turn is forfeited or nothing is legal.
- **2-dice mode** → array of full-turn options, each:
  `{ kind:'turn', d1, d2, doubles, steps:[sub|null, sub|null],
  captures, finishes, bringsOut, extraTurn }`.
  `steps[0]` consumes `d1`, `steps[1]` consumes `d2`; a `null` step means that
  sub-move had no legal option and is skipped. Branching is deduped and capped
  (default 64).

### `getLegalSubMoves(state, playerIndex, dieValue) → [subMove]`

Single-die options for one die value (1–6). Used directly by UIs/AIs that want
step-by-step 2-dice play, and internally by `getLegalMoves`.

### `enumerateTurnOptions(state, playerIndex, d1, d2, maxOptions=64) → [turnOption]`

Same as the 2-dice branch of `getLegalMoves`, exposed directly.

### `applyMove(state, playerIndex, move) → newState`

Applies a move from `getLegalMoves` (immutable). Re-validates the move and
**throws on anything illegal**. Handles captures, home-finishes, placement
recording, extra-turn continuation, and turn passing (next unfinished player,
chains reset). Throws if it isn't that player's turn or the game is over.

### `passTurn(state) → newState`

Pass the turn without moving (no legal move, or a forfeited roll). Advances to
the next unfinished player and resets the sixes/doubles chains.

### `isGameOver(state) → boolean`

True once all-but-one players have placed (the last place is automatic).

### `getPlacements(state) → [{ player, place }]`

Finish order sorted by place. Complete once the game is over.

### Helpers (exported)

- `applySubMovePure(state, playerIndex, sub) → { state, move }` — apply one
  sub-move with no turn bookkeeping (used for 2-dice enumeration / AI search).
- `globalOf(player, d)`, `isSafeGlobal(g)`, `tokenGlobalIndex(state, p, t)`
- Constants: `NUM_TOKENS`, `TRACK_LEN`, `START_OFFSETS`, `SAFE_SQUARES`,
  `BASE` (-1), `FINISHED` (57), `HOME_COLUMN_START`/`HOME_COLUMN_END`.

## Typical driver loop

```js
let s = L.createGame({ numPlayers: 4, diceMode: 1, seed: 12345 });
while (!L.isGameOver(s)) {
  const p = s.currentPlayer;
  const { d1, d2, state: s2, forfeit } = L.rollDice(s);
  s = s2;
  if (forfeit) { s = L.passTurn(s); continue; }
  const moves = L.getLegalMoves(s, p, { d1, d2 });
  s = moves.length === 0 ? L.passTurn(s) : L.applyMove(s, p, moves[0]);
}
console.log(L.getPlacements(s));
```

## Tests & simulation

- `test/` — 66 tests with `node:test` + `node:assert/strict`, zero deps.
  Run: `node --test 'test/*.test.js'`
- `simulate.js` — plays full random-vs-random games to shake out crashes and
  stuck states. Run: `node simulate.js [gamesPerMode=200] [seedBase=1000]`
