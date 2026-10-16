'use strict';
// Exact finish, win detection, placement order, finished-player skipping.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { customState, L } = require('./helpers.js');

describe('exact roll to finish', () => {
  it('overshooting 57 is illegal; exact roll finishes', () => {
    const s = customState({ tokens: [[55, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 3, d2: null }).filter((m) => m.token === 0), []);
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    assert.equal(moves.length, 1);
    assert.equal(moves[0].to, 57);
    assert.equal(moves[0].finishes, true);
  });

  it('a token at 56 needs exactly 1', () => {
    const s = customState({ tokens: [[56, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    assert.deepEqual(L.getLegalMoves(s, 0, { d1: 2, d2: null }), []);
    const moves = L.getLegalMoves(s, 0, { d1: 1, d2: null });
    assert.equal(moves.length, 1);
    assert.equal(moves[0].finishes, true);
  });

  it('finished tokens (57) never move', () => {
    const s = customState({ tokens: [[57, 10, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 4, d2: null });
    assert.ok(moves.every((m) => m.token !== 0));
  });
});

describe('win detection and placements', () => {
  it('fourth token home records 1st place and skips the player', () => {
    const s = customState({ tokens: [[57, 57, 57, 55], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    const s2 = L.applyMove(s, 0, moves[0]);
    assert.deepEqual(s2.players[0].tokens, [57, 57, 57, 57]);
    assert.equal(s2.players[0].finished, true);
    assert.deepEqual(L.getPlacements(s2), [{ player: 0, place: 1 }]);
    assert.equal(s2.currentPlayer, 1); // finished player skipped
    assert.equal(L.isGameOver(s2), false);
  });

  it('full 4-player game ends at 3rd place; 4th is automatic', () => {
    let s = customState({
      tokens: [
        [57, 57, 57, 55],
        [57, 57, 57, 54],
        [57, 57, 57, 53],
        [10, -1, -1, -1],
      ],
    });
    // P0 finishes -> 1st
    s = L.applyMove(s, 0, L.getLegalMoves(s, 0, { d1: 2, d2: null })[0]);
    // P1 finishes -> 2nd (needs 3)
    s = L.applyMove(s, 1, L.getLegalMoves(s, 1, { d1: 3, d2: null })[0]);
    assert.deepEqual(L.getPlacements(s), [
      { player: 0, place: 1 },
      { player: 1, place: 2 },
    ]);
    assert.equal(L.isGameOver(s), false);
    // P2 finishes -> 3rd, game over, P3 auto 4th
    s = L.applyMove(s, 2, L.getLegalMoves(s, 2, { d1: 4, d2: null })[0]);
    assert.equal(L.isGameOver(s), true);
    assert.deepEqual(L.getPlacements(s), [
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 3 },
      { player: 3, place: 4 },
    ]);
    assert.throws(() => L.rollDice(s));
    assert.throws(() => L.passTurn(s));
  });

  it('2-player game ends when the first player finishes', () => {
    let s = customState({
      numPlayers: 2,
      tokens: [
        [57, 57, 57, 55],
        [20, -1, -1, -1],
      ],
    });
    s = L.applyMove(s, 0, L.getLegalMoves(s, 0, { d1: 2, d2: null })[0]);
    assert.equal(L.isGameOver(s), true);
    assert.deepEqual(L.getPlacements(s), [
      { player: 0, place: 1 },
      { player: 1, place: 2 },
    ]);
  });

  it('turn order cycles 0->1->0 in a 2-player game', () => {
    const s = customState({
      numPlayers: 2,
      tokens: [
        [5, -1, -1, -1],
        [8, -1, -1, -1],
      ],
    });
    const s2 = L.applyMove(s, 0, L.getLegalMoves(s, 0, { d1: 2, d2: null })[0]);
    assert.equal(s2.currentPlayer, 1);
    const s3 = L.applyMove(s2, 1, L.getLegalMoves(s2, 1, { d1: 2, d2: null })[0]);
    assert.equal(s3.currentPlayer, 0);
  });

  it('a finished player mid-turn-option ends their participation cleanly (2-dice)', () => {
    const s = customState({
      diceMode: 2,
      tokens: [[57, 57, 57, 55], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
    });
    const opts = L.getLegalMoves(s, 0, { d1: 2, d2: 4 });
    assert.ok(opts.length > 0);
    // first sub-move finishes the last token; second must be null
    const fin = opts.find((o) => o.steps[0] && o.steps[0].finishes);
    assert.ok(fin);
    assert.equal(fin.steps[1], null);
    const s2 = L.applyMove(s, 0, fin);
    assert.equal(s2.players[0].finished, true);
    assert.equal(s2.currentPlayer, 1);
  });
});
