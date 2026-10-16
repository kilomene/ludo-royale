// Ludo Royale — design tokens (see ../../DESIGN.md)
export const THEME = {
  bg: "#0B0D12",
  panel: "#141824",
  gold: "#D4AF37",
  goldLight: "#F6E27A",
  goldDeep: "#8A6D1B",
  ivory: "#F5F1E6",
  muted: "#8B93A7",
  cell: "#1E2430",
  cellEdge: "#2C3444",
  players: [
    { name: "Ruby",    base: "#C8102E", light: "#FF5A6E", deep: "#7A0A1E" },
    { name: "Emerald", base: "#0E9F6E", light: "#3DDC97", deep: "#065F46" },
    { name: "Topaz",   base: "#E8A100", light: "#FFD166", deep: "#8A5F00" },
    { name: "Sapphire",base: "#2456E6", light: "#6C8CFF", deep: "#142E86" },
  ],
  fontDisplay: '"Playfair Display", Georgia, "Times New Roman", serif',
  fontUI: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

// vertical metallic gradient for a player color
export function playerGradient(ctx, p, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, p.light);
  g.addColorStop(0.45, p.base);
  g.addColorStop(1, p.deep);
  return g;
}

export function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, THEME.goldLight);
  g.addColorStop(0.5, THEME.gold);
  g.addColorStop(1, THEME.goldDeep);
  return g;
}
