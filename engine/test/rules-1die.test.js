'use strict';
// 1-die mode: bring-out, sixes chain, forfeit, extra turns, no-move pass.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { customState, L } = require('./helpers.js');

describe('1-die: bring-out', () => {
  it('bring-out happens only on a 6', () => {
    const s = customState({});
    for (const d of [1, 2, 3, 4, 5]) {
      assert.deepEqual(L.getLegalMoves(s, 0, { d1: d, d2: null }), [], `d1=${d}`);
    }
    const sixes = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    assert.equal(sixes.length, 4);
    for (const m of sixes) {
      assert.equal(m.bringOut, true);
      assert.equal(m.from, -1);
      assert.equal(m.to, 0);
      assert.equal(m.die, 6);
    }
  });

  it('on a 6 the player may also move an existing token instead', () => {
    const s = customState({ tokens: [[10, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    const bringOuts = moves.filter((m) => m.bringOut);
    const regular = moves.filter((m) => !m.bringOut);
    assert.equal(bringOuts.length, 3); // 3 tokens still in base
    assert.equal(regular.length, 1); // token 0: 10 -> 16
    assert.deepEqual([regular[0].from, regular[0].to], [10, 16]);
  });

  it('bring-out lands on the safe start square (no capture possible)', () => {
    // Opponent sits on global 0 (P0's start). P1 token at d=39 -> global (13+39)%52 = 0.
    const s = customState({ tokens: [[-1, -1, -1, -1], [39, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    const s2 = L.applyMove(s, 0, moves[0]);
    assert.equal(s2.players[0].tokens[moves[0].token], 0);
    assert.equal(s2.players[1].tokens[0], 39); // untouched: safe square
    assert.deepEqual(moves[0].captures, []);
  });
});

describe('1-die: three-sixes forfeit', () => {
  it('third consecutive six yields no moves', () => {
    // NB: getLegalMoves is always called AFTER rollDice, which has already
    // incremented the chain — so the forfeit state is sixes === 3.
    const s = customState({ sixes: 3 });
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 6, d2: null }), []);
  });

  it('first and second six still move normally', () => {
    for (const sixes of [1, 2]) {
      // post-rollDice chain values for the 1st and 2nd six
      const s = customState({ sixes });
      assert.ok(L.getLegalMoves(s, 0, { d1: 6, d2: null }).length > 0);
    }
  });

  it('a 6 with no legal move ends the turn and resets the chain', () => {
    // All tokens one step from home: a 6 overshoots everywhere, nothing in base.
    const s = customState({ tokens: [[56, 56, 56, 56], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], sixes: 1 });
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 6, d2: null }), []);
    const s2 = L.passTurn(s);
    assert.equal(s2.currentPlayer, 1);
    assert.deepEqual(s2.turn, { sixes: 0, doubles: 0 });
  });

  it('moves made before the third six stand; the third six moves nothing', () => {
    // P0 rolls 6 (moves), rolls 6 (moves), rolls 6 -> forfeit.
    let s = customState({});
    // first six: bring out
    let moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    s = L.applyMove(s, 0, moves[0]);
    assert.equal(s.currentPlayer, 0); // extra roll
    s.turn.sixes = 1; // as rollDice would have set
    // second six: move token 0 -> 6
    moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    const advance = moves.find((m) => !m.bringOut);
    s = L.applyMove(s, 0, advance);
    assert.equal(s.players[0].tokens[0], 6); // earlier moves stand
    s.turn.sixes = 3; // as rollDice would have set after the third 6
    // third six: forfeited
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 6, d2: null }), []);
    s = L.passTurn(s);
    assert.equal(s.currentPlayer, 1);
    assert.equal(s.players[0].tokens[0], 6);
  });
});

describe('1-die: extra turns', () => {
  it('rolling 6 grants an extra roll', () => {
    const s = customState({});
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    assert.ok(moves.every((m) => m.extraTurn));
    const s2 = L.applyMove(s, 0, moves[0]);
    assert.equal(s2.currentPlayer, 0);
  });

  it('a plain non-6 move passes the turn', () => {
    const s = customState({ tokens: [[5, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 3, d2: null });
    assert.equal(moves.length, 1);
    assert.equal(moves[0].extraTurn, false);
    const s2 = L.applyMove(s, 0, moves[0]);
    assert.equal(s2.players[0].tokens[0], 8);
    assert.equal(s2.currentPlayer, 1);
  });

  it('bringing a token home (d=57) grants an extra roll', () => {
    const s = customState({ tokens: [[55, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    assert.equal(moves.length, 1);
    assert.equal(moves[0].finishes, true);
    assert.equal(moves[0].extraTurn, true);
    const s2 = L.applyMove(s, 0, moves[0]);
    assert.equal(s2.players[0].tokens[0], 57);
    assert.equal(s2.currentPlayer, 0);
  });
});

describe('1-die: applyMove validation', () => {
  it('throws on an illegal move', () => {
    const s = customState({});
    assert.throws(() => L.applyMove(s, 0, { kind: 'sub', token: 0, die: 3, from: -1, to: 2, bringOut: false }));
  });

  it("throws when it is not the player's turn", () => {
    const s = customState({});
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    assert.throws(() => L.applyMove(s, 1, moves[0]));
  });

  it('getLegalMoves accepts a bare die number', () => {
    const s = customState({});
    assert.equal(L.getLegalMoves(s, 0, 6).length, 4);
    assert.deepEqual(L.getLegalMoves(s, 0, 4), []);
  });
});
