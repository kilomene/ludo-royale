'use strict';
// Capture, safe squares, blockades (formation, cannot-land, cannot-pass).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { customState, L } = require('./helpers.js');

// P0 offset 0, P1 offset 13, P2 offset 26. Safe: 0,8,13,21,26,34,39,47.

describe('capture', () => {
  it('landing on a lone opponent token on a non-safe square captures it', () => {
    // P1 token0 at d=49 -> global (13+49)%52 = 10 (non-safe).
    const s = customState({ tokens: [[8, -1, -1, -1], [49, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    const cap = moves.find((m) => m.token === 0);
    assert.ok(cap, 'capture move exists');
    assert.deepEqual(cap.captures, [{ player: 1, token: 0 }]);
    assert.equal(cap.extraTurn, true); // capture grants an extra roll
    const s2 = L.applyMove(s, 0, cap);
    assert.equal(s2.players[0].tokens[0], 10);
    assert.equal(s2.players[1].tokens[0], -1); // sent back to base
    assert.equal(s2.currentPlayer, 0); // extra turn kept
  });

  it('captures tokens of multiple opponents on the same square', () => {
    // P1 d=49 -> global 10; P2 d=36 -> global (26+36)%52 = 10.
    const s = customState({ tokens: [[8, -1, -1, -1], [49, -1, -1, -1], [36, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    const cap = moves.find((m) => m.token === 0);
    assert.equal(cap.captures.length, 2);
    const s2 = L.applyMove(s, 0, cap);
    assert.equal(s2.players[1].tokens[0], -1);
    assert.equal(s2.players[2].tokens[0], -1);
  });

  it('own tokens are never captured; stacking is legal', () => {
    const s = customState({ tokens: [[8, 10, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    const m = moves.find((mv) => mv.token === 0);
    assert.ok(m);
    assert.deepEqual(m.captures, []);
    const s2 = L.applyMove(s, 0, m);
    assert.deepEqual(s2.players[0].tokens.slice(0, 2), [10, 10]); // stacked
  });
});

describe('safe squares', () => {
  it('landing on a safe square never captures, even with opponents present', () => {
    // P1 token0 at d=47 -> global (13+47)%52 = 8 (safe).
    const s = customState({ tokens: [[6, -1, -1, -1], [47, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    const m = moves.find((mv) => mv.token === 0);
    assert.ok(m, 'move onto safe square exists');
    assert.equal(m.to, 8);
    assert.deepEqual(m.captures, []);
    const s2 = L.applyMove(s, 0, m);
    assert.equal(s2.players[1].tokens[0], 47); // untouched
    assert.equal(s2.players[0].tokens[0], 8); // coexist
  });

  it('tokens of different players coexist on safe squares', () => {
    const s = customState({ tokens: [[8, -1, -1, -1], [47, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    // P0 token1 in base can... use P2: bring nothing; just verify no capture state persists.
    assert.equal(L.globalOf(0, 8), 8);
    assert.equal(L.globalOf(1, 47), 8);
    assert.ok(L.isSafeGlobal(8));
  });
});

describe('blockades', () => {
  it('cannot land on a square holding 2+ tokens of one opponent', () => {
    // P1 blockade at global 10 (d=49 x2).
    const s = customState({ tokens: [[8, -1, -1, -1], [49, 49, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 2, d2: null });
    assert.ok(!moves.some((m) => m.token === 0 && m.to === 10), 'landing on blockade is illegal');
  });

  it('cannot pass through a blockade', () => {
    // P1 blockade at global 10. P0 token0 at d=5, roll 6 -> dest d=11, path crosses d=10.
    const s = customState({ tokens: [[5, -1, -1, -1], [49, 49, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    const traveller = moves.filter((m) => m.token === 0 && !m.bringOut);
    assert.deepEqual(traveller, [], 'no move may pass the blockade');
  });

  it('a single opponent token does not block passing', () => {
    const s = customState({ tokens: [[5, -1, -1, -1], [49, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    const traveller = moves.find((m) => m.token === 0 && !m.bringOut);
    assert.ok(traveller, 'passing a lone token is legal');
    assert.equal(traveller.to, 11);
  });

  it('2+ own tokens on a SAFE square do not block anyone', () => {
    // P0 pair at d=8 (global 8, safe). P1 token at d=46 -> global 7; roll 3 crosses global 8.
    const s = customState({
      tokens: [[8, 8, -1, -1], [46, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
      currentPlayer: 1,
    });
    const moves = L.getLegalMoves(s, 1, { d1: 3, d2: null });
    const m = moves.find((mv) => mv.token === 0);
    assert.ok(m, 'passing a safe-square pair is legal');
    assert.equal(m.to, 49);
  });

  it('2+ opponent tokens on a SAFE square do not block passers either', () => {
    // P1 pair at d=47 (global 8, safe). P0 token at d=5, roll 4 -> dest d=9, path crosses d=8.
    const s = customState({ tokens: [[5, -1, -1, -1], [47, 47, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 4, d2: null });
    const m = moves.find((mv) => mv.token === 0);
    assert.ok(m, 'safe squares never hold blockades against passers');
    assert.equal(m.to, 9);
  });

  it('own blockades never block own tokens', () => {
    // P0 pair at d=9,10 (non-safe globals 9,10). P0 token0 at d=5, roll 6 passes through.
    const s = customState({ tokens: [[5, 9, 10, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 6, d2: null });
    const m = moves.find((mv) => mv.token === 0 && !mv.bringOut);
    assert.ok(m, 'own blockade does not block');
    assert.equal(m.to, 11);
  });

  it('a blockade can be formed and then blocks (two-step scenario)', () => {
    // P1 tokens at d=48,49 -> globals 9,10. Move second onto d=48 -> blockade at global 9.
    let s = customState({
      tokens: [[-1, -1, -1, -1], [48, 49, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
      currentPlayer: 1,
    });
    // P1 token1 at d=49, move back? No backward moves. Instead: token at d=47 roll 1.
    s.players[1].tokens = [47, 48, -1, -1];
    const moves = L.getLegalMoves(s, 1, { d1: 1, d2: null });
    const form = moves.find((m) => m.token === 0 && m.to === 48);
    assert.ok(form, 'can stack onto own token to form a blockade');
    const s2 = L.applyMove(s, 1, form);
    assert.deepEqual(s2.players[1].tokens.slice(0, 2), [48, 48]);
    // Now P0 at d=6 (global 6), roll 3 -> dest d=9 (global 9): blocked.
    s2.currentPlayer = 0;
    s2.players[0].tokens = [6, -1, -1, -1];
    const p0moves = L.getLegalMoves(s2, 0, { d1: 3, d2: null });
    assert.ok(!p0moves.some((m) => m.token === 0 && !m.bringOut), 'blockade now blocks');
  });
});

describe('home column', () => {
  it('entering and stacking in the home column is always legal, no captures', () => {
    const s = customState({ tokens: [[50, 51, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    const moves = L.getLegalMoves(s, 0, { d1: 1, d2: null });
    const m = moves.find((mv) => mv.token === 0);
    assert.ok(m);
    assert.equal(m.to, 51);
    assert.equal(m.entersHomeColumn, true);
    assert.deepEqual(m.captures, []);
    const s2 = L.applyMove(s, 0, m);
    assert.deepEqual(s2.players[0].tokens.slice(0, 2), [51, 51]);
  });

  it('tokenGlobalIndex returns null off the main track', () => {
    const s = customState({ tokens: [[-1, 5, 53, 57], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    assert.equal(L.tokenGlobalIndex(s, 0, 0), null); // base
    assert.equal(L.tokenGlobalIndex(s, 0, 1), 5);
    assert.equal(L.tokenGlobalIndex(s, 0, 2), null); // home column
    assert.equal(L.tokenGlobalIndex(s, 0, 3), null); // finished
  });
});
