'use strict';
// Core engine: creation, dice, determinism, serialization, immutability.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { customState, findSeedForD1, L } = require('./helpers.js');

describe('createGame', () => {
  it('creates a 4-player 1-die game by default', () => {
    const s = L.createGame({ numPlayers: 4, diceMode: 1, seed: 42 });
    assert.equal(s.config.numPlayers, 4);
    assert.equal(s.config.diceMode, 1);
    assert.equal(s.players.length, 4);
    assert.equal(s.currentPlayer, 0);
    assert.deepEqual(s.players[0].tokens, [-1, -1, -1, -1]);
    assert.equal(s.gameOver, false);
    assert.deepEqual(s.placements, []);
  });

  it('supports 2 and 3 players', () => {
    assert.equal(L.createGame({ numPlayers: 2, diceMode: 1, seed: 1 }).players.length, 2);
    assert.equal(L.createGame({ numPlayers: 3, diceMode: 2, seed: 1 }).players.length, 3);
  });

  it('rejects invalid numPlayers / diceMode', () => {
    assert.throws(() => L.createGame({ numPlayers: 1, diceMode: 1, seed: 1 }));
    assert.throws(() => L.createGame({ numPlayers: 5, diceMode: 1, seed: 1 }));
    assert.throws(() => L.createGame({ numPlayers: 4, diceMode: 3, seed: 1 }));
  });

  it('state is plain JSON serializable', () => {
    const s = L.createGame({ numPlayers: 4, diceMode: 2, seed: 7 });
    const roundTripped = JSON.parse(JSON.stringify(s));
    assert.deepEqual(roundTripped, s);
  });
});

describe('rollDice', () => {
  it('rolls 1..6, d2 null in 1-die mode', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { d1, d2 } = L.rollDice(L.createGame({ numPlayers: 4, diceMode: 1, seed }));
      assert.ok(d1 >= 1 && d1 <= 6, `d1=${d1}`);
      assert.equal(d2, null);
    }
  });

  it('rolls two dice in 2-dice mode', () => {
    const { d1, d2 } = L.rollDice(L.createGame({ numPlayers: 4, diceMode: 2, seed: 9 }));
    assert.ok(d1 >= 1 && d1 <= 6);
    assert.ok(d2 >= 1 && d2 <= 6);
  });

  it('is deterministic for a fixed seed', () => {
    const a = L.createGame({ numPlayers: 4, diceMode: 2, seed: 1234 });
    const b = L.createGame({ numPlayers: 4, diceMode: 2, seed: 1234 });
    const ra = L.rollDice(a);
    const rb = L.rollDice(b);
    assert.equal(ra.d1, rb.d1);
    assert.equal(ra.d2, rb.d2);
    // different seeds diverge (overwhelmingly likely across 20 seeds)
    const seen = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const r = L.rollDice(L.createGame({ numPlayers: 4, diceMode: 2, seed }));
      seen.add(`${r.d1},${r.d2}`);
    }
    assert.ok(seen.size > 1);
  });

  it('advances the PRNG inside the returned state (immutable input)', () => {
    const s = L.createGame({ numPlayers: 4, diceMode: 1, seed: 5 });
    const before = s.rng;
    const { state: s2 } = L.rollDice(s);
    assert.equal(s.rng, before); // input untouched
    assert.notEqual(s2.rng, before);
  });

  it('increments the sixes chain on a 6', () => {
    const seed = findSeedForD1(6);
    const { state: s2, d1 } = L.rollDice(L.createGame({ numPlayers: 4, diceMode: 1, seed }));
    assert.equal(d1, 6);
    assert.equal(s2.turn.sixes, 1);
  });

  it('resets the sixes chain on a non-6', () => {
    const seed = findSeedForD1(3);
    const s = customState({ sixes: 2 });
    // swap in the crafted sixes count with a seed whose roll is not 6
    s.rng = L.createGame({ numPlayers: 4, diceMode: 1, seed }).rng;
    const { state: s2, d1 } = L.rollDice(s);
    assert.equal(d1, 3);
    assert.equal(s2.turn.sixes, 0);
  });

  it('throws when the game is over', () => {
    const s = customState({});
    s.gameOver = true;
    assert.throws(() => L.rollDice(s));
  });
});

describe('determinism + immutability', () => {
  function playScripted(seed, diceMode, turns) {
    let s = L.createGame({ numPlayers: 4, diceMode, seed });
    for (let i = 0; i < turns && !L.isGameOver(s); i++) {
      const p = s.currentPlayer;
      const { d1, d2, state: s2 } = L.rollDice(s);
      s = s2;
      const moves = L.getLegalMoves(s, p, { d1, d2 });
      s = moves.length === 0 ? L.passTurn(s) : L.applyMove(s, p, moves[0]);
    }
    return s;
  }

  it('same seed + same choices => identical state', () => {
    const a = playScripted(777, 1, 60);
    const b = playScripted(777, 1, 60);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    const c = playScripted(777, 2, 60);
    const d = playScripted(777, 2, 60);
    assert.equal(JSON.stringify(c), JSON.stringify(d));
  });

  it('applyMove / passTurn / rollDice do not mutate their input', () => {
    const s = customState({ tokens: [[5, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const snap = JSON.stringify(s);
    const moves = L.getLegalMoves(s, 0, { d1: 3, d2: null });
    L.applyMove(s, 0, moves[0]);
    assert.equal(JSON.stringify(s), snap);
    L.passTurn(s);
    assert.equal(JSON.stringify(s), snap);
    L.rollDice(s);
    assert.equal(JSON.stringify(s), snap);
  });

  it('state stays JSON-serializable deep into a game', () => {
    const s = playScripted(4242, 2, 120);
    assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  });
});

describe('passTurn', () => {
  it('advances to next player and resets chains', () => {
    const s = customState({ currentPlayer: 1, sixes: 2, doubles: 1 });
    const s2 = L.passTurn(s);
    assert.equal(s2.currentPlayer, 2);
    assert.deepEqual(s2.turn, { sixes: 0, doubles: 0 });
  });

  it('wraps around and skips finished players', () => {
    const s = customState({ currentPlayer: 3 });
    s.players[0].finished = true;
    s.players[1].finished = true;
    const s2 = L.passTurn(s);
    assert.equal(s2.currentPlayer, 2);
  });
});
