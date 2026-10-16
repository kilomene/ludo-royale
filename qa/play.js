// Full-game QA: all-AI game, screenshots at intervals, reports errors.
// node play.js [seconds] [out.png]
import puppeteer from "puppeteer";

const secs = Number(process.argv[2] || 45);
const out = process.argv[3] || "/tmp/ludo-game.png";
const errors = [];

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 480, height: 860 });
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://127.0.0.1:8901/index.html?autoplay=1", { waitUntil: "networkidle0" });
await page.click("#btn-enter");
await new Promise(r => setTimeout(r, 500));
await page.click("#btn-start");
console.log("game started, watching", secs + "s...");
await new Promise(r => setTimeout(r, (secs / 2) * 1000));
await page.screenshot({ path: "/tmp/ludo-game-mid.png" });
await new Promise(r => setTimeout(r, (secs / 2) * 1000));
await page.screenshot({ path: out });

// inspect game state
const info = await page.evaluate(() => {
  const g = window.__ludoGame;
  if (!g) return { error: "no game handle" };
  return {
    over: g.over,
    currentPlayer: g.state.currentPlayer,
    moveCount: g.state.moveCount,
    tokens: g.state.players.map(pl => pl.tokens.join(",")),
  };
});
console.log("state:", JSON.stringify(info));
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
await browser.close();
