// Ludo Royale — 15x15 board geometry (classic Ludo layout)
// All coordinates in grid cells; multiply by CELL for pixels.

export const GRID = 15;

// Main track: 52 cells in travel order, starting at Red's start square.
export const TRACK = [
  [1,6],[2,6],[3,6],[4,6],[5,6],
  [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
  [7,0],
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],
  [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
  [14,7],
  [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],
  [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
  [7,14],
  [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],
  [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  [0,7],
  [0,6],
];

// Global track indices that are safe (no capture)
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Player start offsets on the main track
export const START_OFFSET = [0, 13, 26, 39];

// Home columns: 5 cells each, in travel order (d = 51..56)
export const HOME_COL = [
  [[1,7],[2,7],[3,7],[4,7],[5,7]],          // P0 Ruby
  [[7,1],[7,2],[7,3],[7,4],[7,5]],          // P1 Emerald
  [[13,7],[12,7],[11,7],[10,7],[9,7]],      // P2 Topaz
  [[7,13],[7,12],[7,11],[7,10],[7,9]],      // P3 Sapphire
];

// Base corners: 6x6 panels + 4 token pad positions (in cell coords, center-based)
export const BASES = [
  { x: 0, y: 0, pads: [[1.7,1.7],[4.3,1.7],[1.7,4.3],[4.3,4.3]] }, // P0 top-left
  { x: 9, y: 0, pads: [[10.7,1.7],[13.3,1.7],[10.7,4.3],[13.3,4.3]] }, // P1 top-right
  { x: 9, y: 9, pads: [[10.7,10.7],[13.3,10.7],[10.7,13.3],[13.3,13.3]] }, // P2 bottom-right
  { x: 0, y: 9, pads: [[1.7,10.7],[4.3,10.7],[1.7,13.3],[4.3,13.3]] }, // P3 bottom-left
];

// Star (safe, non-start) squares for decoration
export const STARS = [8, 21, 34, 47].map(i => TRACK[i]);

// Convert a token distance d to a pixel-center position for a player.
// d: -1 = base (padIndex required), 0..50 main track, 51..56 home column, 57 = home triangle
export function tokenCell(player, d, padIndex = 0) {
  if (d === -1) {
    const [px, py] = BASES[player].pads[padIndex];
    return [px, py];
  }
  if (d <= 50) {
    const g = (START_OFFSET[player] + d) % 52;
    const [cx, cy] = TRACK[g];
    return [cx + 0.5, cy + 0.5];
  }
  if (d <= 56) {
    const [cx, cy] = HOME_COL[player][d - 51];
    return [cx + 0.5, cy + 0.5];
  }
  return [7.5, 7.5]; // home triangle center
}

export function trackGlobalIndex(player, d) {
  return (START_OFFSET[player] + d) % 52;
}
