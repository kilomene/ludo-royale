'use strict';
// Shared test helpers (not a test file itself).
const L = require('../ludo.js');

/** Build a game state with tokens placed exactly as given. */
function customState({
  numPlayers = 4,
  diceMode = 1,
  seed = 1,
  tokens = null, // array per player of [d0,d1,d2,d3]
  currentPlayer = 0,
  sixes = 0,
  doubles = 0,
} = {}) {
  const s = L.createGame({ numPlayers, diceMode, seed });
  if (tokens) {
    tokens.forEach((toks, p) => {
      s.players[p].tokens = toks.slice();
    });
  }
  s.currentPlayer = currentPlayer;
  s.turn = { sixes, doubles };
  return s;
}

/** Find a seed whose first rollDice() in 1-die mode yields d1 === want. */
function findSeedForD1(want, diceMode = 1, maxTries = 100000) {
  for (let seed = 1; seed <= maxTries; seed++) {
    const s = L.createGame({ numPlayers: 4, diceMode, seed });
    const { d1 } = L.rollDice(s);
    if (d1 === want) return seed;
  }
  throw new Error(`no seed found for d1=${want}`);
}

module.exports = { customState, findSeedForD1, L };
