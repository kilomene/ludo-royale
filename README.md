# Ludo Royale 🎲
*The classic, gilded.*

A premium Ludo mobile game, built from scratch — full official rules,
one-or-two dice modes, three AI difficulties, and a midnight-casino luxe
design (near-black felt, champagne gold, jewel-tone metals).

## Features
- **Complete official Ludo rules** — 6 to leave base, extra turns on
  6 / capture / home-finish, three consecutive sixes (or doubles) forfeits
  the turn, ★ safe squares, blockades (impassable + uncapturable),
  exact roll to finish, 1st/2nd/3rd placements.
- **1 die or 2 dice** — full two-dice rules: split values across tokens,
  6 on either die brings out, doubles roll again.
- **2–4 players** — Pass & Play or vs AI.
- **AI: Casual / Sharp / Grandmaster** — Grandmaster evaluates captures,
  blockades, threats and 1-ply responses. It bites.
- **Premium design** — hand-drawn canvas art: glossy gold-ringed pawns,
  obsidian dice with gold pips, art-deco etched board, particle effects.

## Project layout
- `engine/` — pure-JS rules engine, zero dependencies. 67 unit tests +
  1200-game simulation, all green.
- `web/` — the game (canvas renderer, screens, AI, dice). `js/bundle.js`
  is built (see `qa/build-web.sh`); never edit it by hand.
- `android/` — WebView shell + no-Gradle APK build script.
- `qa/` — visual QA (puppeteer screenshots), interaction tests, builders.

## Build the web bundle
```bash
bash qa/build-web.sh   # engine -> ludo.esm.js -> web/js/bundle.js
```

## Build the APK (CI)
Pushes to `main` build `out/ludo-royale.apk` via GitHub Actions
(aapt2 → javac → d8 → zipalign → apksigner). Tags `v*` publish a release.

## Rules reference
In-app: **HOW TO PLAY** on the setup and pause screens.
