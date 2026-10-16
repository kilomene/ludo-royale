// Human-interaction QA: real clicks — ROLL button + token taps.
// node human.js
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 480, height: 860 });
const errs = [];
page.on("pageerror", e => errs.push("PAGEERROR: " + e.message.split("\n")[0]));
page.on("console", m => { if (m.type() === "error" && !m.text().includes("404")) errs.push("CONSOLE: " + m.text().slice(0, 120)); });

await page.goto("http://127.0.0.1:8901/index.html?fast=1", { waitUntil: "networkidle0" });
await page.click("#btn-enter");
await new Promise(r => setTimeout(r, 400));
// 2 players, 1 die, vs AI (human = Ruby P0)
await page.click("#btn-start");
await new Promise(r => setTimeout(r, 800));

let humanMoves = 0;
for (let turn = 0; turn < 25; turn++) {
  // wait until it's human's roll phase (roll button enabled)
  await page.waitForFunction(
    () => { const g = window.__ludoGame; return g && !g.ui.rollBtn.disabled && g.state.currentPlayer === 0; },
    { timeout: 30000 }
  );
  const before = await page.evaluate(() => window.__ludoGame.state.moveCount);
  await page.click("#btn-roll");
  // wait for either highlight (choices) or move completion
  await new Promise(r => setTimeout(r, 2500));
  const hl = await page.evaluate(() => [...window.__ludoGame.highlight]);
  if (hl.length > 0) {
    // tap the first highlighted token: convert cell coords to screen px
    const tapped = await page.evaluate(() => {
      const g = window.__ludoGame;
      const key = [...g.highlight][0];
      const [p, t] = key.split(":").map(Number);
      const q = g.pos[p][t];
      const { s, ox, oy } = g.view;
      const r = document.getElementById("board").getBoundingClientRect();
      return { x: r.left + (ox + q.x * s) / g.canvas.width * r.width,
               y: r.top + (oy + q.y * s) / g.canvas.height * r.height };
    });
    await page.mouse.click(tapped.x, tapped.y);
    await new Promise(r => setTimeout(r, 1200));
  }
  const after = await page.evaluate(() => window.__ludoGame.state.moveCount);
  if (after > before) humanMoves++;
  console.log(`turn ${turn}: moves ${before}->${after} (highlight was ${hl.length})`);
}
console.log("human moves completed:", humanMoves);
await page.screenshot({ path: "/tmp/ludo-human.png" });
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "NO ERRORS");
await browser.close();
