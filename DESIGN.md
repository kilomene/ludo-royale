# LUDO ROYALE — Design Bible
Working title: **Ludo Royale**. Tagline: *"The classic, gilded."*

## Design language: Midnight Casino Luxe
A premium, expensive feel: deep near-black felt, champagne gold pinstriping,
jewel-tone player colors with metallic gradients, art-deco etched patterns.
Nothing flat, nothing neon-arcade. Everything has depth: bevels, glows,
soft shadows, brushed-metal gradients.

## Palette
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0B0D12` | app background |
| `--felt` | radial `#161C28` → `#0B0D12` | board surround |
| `--panel` | `#141824` | cards, dialogs |
| `--gold` | `#D4AF37` | pinstripes, stars, accents |
| `--gold-light` | `#F6E27A` | highlights, text accents |
| `--gold-deep` | `#8A6D1B` | gradient bases |
| `--ivory` | `#F5F1E6` | primary text |
| `--muted` | `#8B93A7` | secondary text |
| `--cell` | `#1E2430` | neutral track cells |
| `--cell-edge` | `#2C3444` | cell bevel light edge |

Player jewel tones (each has base / light / deep for metallic gradients):
- **P0 Ruby** `#C8102E` / `#FF5A6E` / `#7A0A1E`
- **P1 Emerald** `#0E9F6E` / `#3DDC97` / `#065F46`
- **P2 Topaz** `#E8A100` / `#FFD166` / `#8A5F00`
- **P3 Sapphire** `#2456E6` / `#6C8CFF` / `#142E86`

## Board
- 15×15 grid, rounded-rect board slab with 3px gold pinstripe + outer glow.
- Track cells: dark slate with 1px top-left bevel highlight (engraved look).
- Start squares: full jewel gradient + soft outer glow in player color.
- Safe/star squares: gold star icon etched on dark cell + thin gold ring.
- Home columns: 5 cells of jewel gradient fading toward home.
- Home center: 3×3 split into 4 triangles, jewel gradients, gold dividers,
  small crown glyph at the very center.
- Bases (corners): 6×6 jewel-tinted dark panels, art-deco corner flourishes,
  4 ivory-ringed token pads with subtle inner shadow.
- Background pattern: large low-opacity art-deco sunburst etched behind the
  board + thin concentric gold hairlines. Never noisy, never competing.

## Tokens (pawns)
Drawn, not image assets (crisp at any DPI):
- Circular gold-ring base, domed body with radial highlight (light from top-left),
  rim light on lower-right, small knob crown on top.
- Drop shadow: soft black blur offset down-right.
- States: idle (gentle bob), selected (pulsing gold halo), moving (hop arc),
  capturable-threat (subtle red-gold shimmer when an opponent could capture —
  hard-AI readability aid).

## Dice
- Obsidian dice: near-black rounded cube, gold pips with inner glow.
- Roll animation: tumble (rotation + squash-bounce + motion blur), 600ms,
  lands with a soft gold shockwave ring.
- 2-dice mode: both dice tumble with slight stagger.

## Typography
- Display: `"Playfair Display", Georgia, serif` — elegant, expensive.
- UI/body: system stack, letterspaced small caps for labels.
- Never more than 2 families. Gold-foil gradient text for the logo.

## Screens
1. **Splash**: black, gold-foil "LUDO ROYALE" with drawing-in pinstripe,
   two tumbling dice, "tap to enter".
2. **Setup**: players 2/3/4, dice 1/2 toggle, mode (Pass & Play / vs AI),
   AI difficulty (Casual / Sharp / Grandmaster), player color seats.
3. **Board**: top bar (logo mini, turn banner, sound/menu buttons),
   board canvas, bottom dice tray + "your move" hints.
4. **Pause overlay**: resume, restart, quit to menu, rules reference.
5. **Podium**: 1st/2nd/3rd with gold/silver/bronze, stats (captures, sixes,
   longest run), play-again.

## Motion
- Token move: hop arc per cell, 140ms/cell, ease-out; capture: burst of
  gold particles + victim token dissolves upward.
- Turn change: banner slides, active player's base glows.
- Win: gold confetti + slow zoom to home triangle.
- All animation skippable-safe (game never soft-locks if animation is
  interrupted).

## Audio (later pass)
- Soft felt thock per hop, dice rattle, chime on capture, fanfare on win.
- WebAudio synthesized (no assets, $0, offline-safe).

## Rules reference (in-app)
Full official rules, including: 6 to leave base, extra turn on 6/capture/
home-finish, three consecutive sixes (or doubles) forfeits turn, safe
squares, blockades (2+ same-color on non-safe = impassable + uncapturable),
exact roll to finish, placements.
