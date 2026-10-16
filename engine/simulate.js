'use strict';
/**
 * Simulation harness: plays N full AI-vs-random games per dice mode to shake
 * out crashes, illegal states, and infinite loops in the rules engine.
 *
 * Usage: node simulate.js [gamesPerMode=200] [seedBase=1000]
 *
 * Move choice is random-but-seeded (own mulberry32), so every run is
 * reproducible. A per-game turn cap guards against infinite extra-turn loops;
 * hitting it is reported as an anomaly, not silently ignored.
 */
const L = require('./ludo.js');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_TURNS_PER_GAME = 3000;

function playOneGame({ numPlayers, diceMode, seed, choose }) {
  let s = L.createGame({ numPlayers, diceMode, seed });
  let turns = 0;
  let rolls = 0;
  while (!L.isGameOver(s)) {
    if (++turns > MAX_TURNS_PER_GAME) {
      return { ok: false, reason: 'turn-cap-exceeded', turns, rolls, seed };
    }
    const p = s.currentPlayer;
    const { d1, d2, state: s2, forfeit } = L.rollDice(s);
    s = s2;
    rolls++;
    if (forfeit) {
      s = L.passTurn(s);
      continue;
    }
    const moves = L.getLegalMoves(s, p, { d1, d2 });
    if (moves.length === 0) {
      s = L.passTurn(s);
      continue;
    }
    const mv = moves[Math.floor(choose() * moves.length)];
    s = L.applyMove(s, p, mv);
  }
  // Validate final placements.
  const placements = L.getPlacements(s);
  const places = placements.map((x) => x.place).sort((a, b) => a - b);
  const expected = Array.from({ length: numPlayers }, (_, i) => i + 1);
  if (JSON.stringify(places) !== JSON.stringify(expected)) {
    return { ok: false, reason: 'bad-placements', turns, rolls, seed, placements };
  }
  // Every player except the auto-placed last one must have all tokens home.
  const last = placements.find((x) => x.place === numPlayers);
  for (const pl of s.players) {
    const idx = s.players.indexOf(pl);
    if (last && idx === last.player) continue; // auto-placed: tokens stay put
    if (!pl.tokens.every((d) => d === 57)) {
      return { ok: false, reason: 'tokens-not-home', turns, rolls, seed };
    }
  }
  return { ok: true, turns, rolls, seed };
}

function runBatch({ games, numPlayers, diceMode, seedBase }) {
  const stats = { games, completed: 0, anomalies: [], totalTurns: 0, totalRolls: 0, maxTurns: 0 };
  for (let i = 0; i < games; i++) {
    const seed = seedBase + i;
    const choose = mulberry32(seed ^ 0x9e3779b9);
    try {
      const r = playOneGame({ numPlayers, diceMode, seed, choose });
      if (!r.ok) {
        stats.anomalies.push(r);
      } else {
        stats.completed++;
        stats.totalTurns += r.turns;
        stats.totalRolls += r.rolls;
        stats.maxTurns = Math.max(stats.maxTurns, r.turns);
      }
    } catch (err) {
      stats.anomalies.push({ ok: false, reason: 'exception', seed, error: err.message });
    }
  }
  return stats;
}

function main() {
  const gamesPerMode = parseInt(process.argv[2] || '200', 10);
  const seedBase = parseInt(process.argv[3] || '1000', 10);
  let failures = 0;
  for (const diceMode of [1, 2]) {
    for (const numPlayers of [2, 3, 4]) {
      const stats = runBatch({ games: gamesPerMode, numPlayers, diceMode, seedBase: seedBase + diceMode * 100000 + numPlayers * 10000 });
      const avgTurns = stats.completed ? (stats.totalTurns / stats.completed).toFixed(1) : '-';
      console.log(
        `diceMode=${diceMode} players=${numPlayers}: ` +
        `${stats.completed}/${stats.games} completed, avg turns ${avgTurns}, max turns ${stats.maxTurns}, ` +
        `anomalies ${stats.anomalies.length}`
      );
      for (const a of stats.anomalies.slice(0, 5)) {
        console.log('  ANOMALY:', JSON.stringify(a));
        failures++;
      }
      failures += stats.anomalies.length > 5 ? stats.anomalies.length - 5 : 0;
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} anomalies detected`);
    process.exit(1);
  }
  console.log('\nAll simulations clean.');
}

if (require.main === module) main();

module.exports = { playOneGame, runBatch };
