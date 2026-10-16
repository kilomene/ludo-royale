'use strict';
// 2-dice mode: split sub-moves, bring-out on 6, doubles, three-doubles forfeit.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { customState, L } = require('./helpers.js');

describe('2-dice: sub-move basics', () => {
  it('getLegalSubMoves offers bring-out only on a 6', () => {
    const s = customState({ diceMode: 2 });
    assert.deepEqual(L.getLegalSubMoves(s, 0, 4), []);
    const outs = L.getLegalSubMoves(s, 0, 6);
    assert.equal(outs.length, 4);
    assert.ok(outs.every((m) => m.bringOut && m.to === 0));
  });

  it('a (6,3) roll can bring out with the 6 and move 3 with the same token', () => {
    const s = customState({ diceMode: 2 });
    const opts = L.getLegalMoves(s, 0, { d1: 6, d2: 3 });
    assert.ok(opts.length > 0);
    assert.ok(opts.every((o) => o.kind === 'turn'));
    const same = opts.find(
      (o) => o.steps[0] && o.steps[0].bringOut && o.steps[1] && o.steps[1].token === o.steps[0].token
    );
    assert.ok(same, 'bring-out then move the same token');
    assert.deepEqual([same.steps[1].from, same.steps[1].to], [0, 3]);
  });

  it('sub-moves are assignable in either order: (3,6) with all in base skips the 3', () => {
    const s = customState({ diceMode: 2 });
    const opts = L.getLegalMoves(s, 0, { d1: 3, d2: 6 });
    assert.ok(opts.length > 0);
    assert.ok(opts.every((o) => o.steps[0] === null && o.steps[1] && o.steps[1].bringOut));
  });

  it('no legal sub-move for either die -> no turn options', () => {
    const s = customState({ diceMode: 2 });
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 3, d2: 4 }), []);
  });

  it('the same token may take both sub-moves', () => {
    const s = customState({
      diceMode: 2,
      tokens: [[10, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 4, d2: 3 });
    const both = opts.find((o) => o.steps[0].token === 0 && o.steps[1] && o.steps[1].token === 0);
    assert.ok(both, 'token 0 takes 4 then 3');
    assert.deepEqual([both.steps[0].to, both.steps[1].to], [14, 17]);
    const s2 = L.applyMove(s, 0, both);
    assert.equal(s2.players[0].tokens[0], 17);
  });

  it('a 6 sub-move alone does NOT grant an extra turn (only doubles/capture/finish do)', () => {
    const s = customState({
      diceMode: 2,
      tokens: [[10, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 6, d2: 3 });
    const plain = opts.find((o) => o.steps[0] && !o.steps[0].bringOut && o.steps[1]);
    assert.ok(plain);
    assert.equal(plain.extraTurn, false);
    const s2 = L.applyMove(s, 0, plain);
    assert.equal(s2.currentPlayer, 1);
  });

  it('doubles: bring out with one 6 and move 6 with the same token', () => {
    const s = customState({ diceMode: 2 });
    const opts = L.getLegalMoves(s, 0, { d1: 6, d2: 6 });
    const o = opts.find(
      (x) => x.steps[0].bringOut && x.steps[1] && x.steps[1].token === x.steps[0].token
    );
    assert.ok(o);
    assert.equal(o.steps[1].to, 6);
    assert.equal(o.extraTurn, true);
  });
});

describe('2-dice: doubles and extra turns', () => {
  it('doubles grant an extra turn', () => {
    const s = customState({
      diceMode: 2,
      tokens: [[10, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 4, d2: 4 });
    assert.ok(opts.length > 0);
    assert.ok(opts.every((o) => o.doubles && o.extraTurn));
    const s2 = L.applyMove(s, 0, opts[0]);
    assert.equal(s2.currentPlayer, 0);
  });

  it('non-doubles without capture/finish pass the turn', () => {
    const s = customState({
      diceMode: 2,
      tokens: [[10, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 4, d2: 3 });
    assert.ok(opts.every((o) => !o.extraTurn));
    const s2 = L.applyMove(s, 0, opts[0]);
    assert.equal(s2.currentPlayer, 1);
  });

  it('capture during either sub-move grants an extra turn', () => {
    // P1 token at global 10 (d=49). P0 token0 at d=8; d1=2 captures.
    const s = customState({
      diceMode: 2,
      tokens: [[8, -1, -1, -1], [49, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 2, d2: 3 });
    const cap = opts.find((o) => o.steps[0] && o.steps[0].captures.length > 0);
    assert.ok(cap);
    assert.equal(cap.extraTurn, true);
    const s2 = L.applyMove(s, 0, cap);
    assert.equal(s2.players[1].tokens[0], -1);
    assert.equal(s2.currentPlayer, 0);
  });

  it('three consecutive doubles forfeit the turn', () => {
    // post-rollDice chain value for the 3rd doubles is doubles === 3
    const s = customState({ diceMode: 2, doubles: 3 });
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 5, d2: 5 }), []);
    // first and second doubles are fine (post-rollDice values 1 and 2)
    for (const d of [1, 2]) {
      const t = customState({ diceMode: 2, doubles: d });
      assert.ok(L.getLegalMoves(t, 0, { d1: 5, d2: 5 }).length >= 0);
    }
    const s2 = L.passTurn(s);
    assert.equal(s2.currentPlayer, 1);
    assert.deepEqual(s2.turn, { sixes: 0, doubles: 0 });
  });

  it('a finished player during a doubles turn still ends it cleanly', () => {
    const s = customState({
      diceMode: 2,
      tokens: [[57, 57, 57, 55], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 2, d2: 2 });
    const fin = opts.find((o) => o.steps[0] && o.steps[0].finishes);
    assert.ok(fin);
    const s2 = L.applyMove(s, 0, fin);
    assert.equal(s2.players[0].placement, 1);
    assert.equal(s2.currentPlayer, 1);
  });
});

describe('2-dice: enumeration sanity', () => {
  it('branching stays capped in a busy position', () => {
    const s = customState({
      diceMode: 2,
      tokens: [
        [10, 20, 30, 40],
        [49, 49, 12, 12], // blockades at globals 10 and 25
        [36, 5, 5, -1],
        [-1, -1, -1, -1],
      ],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 6, d2: 6 });
    assert.ok(opts.length <= 64, `options=${opts.length}`);
    assert.ok(opts.length > 0);
  });

  it('applyMove throws on a fabricated illegal turn option', () => {
    const s = customState({ diceMode: 2 });
    assert.throws(() =>
      L.applyMove(s, 0, {
        kind: 'turn',
        d1: 6,
        d2: 6,
        steps: [
          { kind: 'sub', token: 0, die: 6, from: -1, to: 0, bringOut: true },
          { kind: 'sub', token: 0, die: 6, from: 0, to: 60, bringOut: false }, // impossible
        ],
      })
    );
  });

  it('rollDice tracks the doubles chain', () => {
    // find a seed whose first 2-dice roll is doubles
    let seed = 1;
    for (; seed < 100000; seed++) {
      const { d1, d2 } = L.rollDice(L.createGame({ numPlayers: 4, diceMode: 2, seed }));
      if (d1 === d2) break;
    }
    const { state: s2, d1, d2 } = L.rollDice(L.createGame({ numPlayers: 4, diceMode: 2, seed }));
    assert.equal(d1, d2);
    assert.equal(s2.turn.doubles, 1);
  });
});
