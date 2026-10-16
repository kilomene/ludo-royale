// 2-dice human flow QA: ROLL -> tap (die1) -> tap (die2), several turns.
// node human2.js
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
// select TWO DICE
await page.evaluate(() => {
  document.querySelector('#seg-dice button[data-v="2"]').click();
});
await page.click("#btn-start");
await new Promise(r => setTimeout(r, 800));

async function tapFirstHighlight() {
  const pt = await page.evaluate(() => {
    const g = window.__ludoGame;
    const keys = [...g.highlight];
    if (!keys.length) return null;
    const [p, t] = keys[0].split(":").map(Number);
    const q = g.pos[p][t];
    const { s, ox, oy } = g.view;
    const r = document.getElementById("board").getBoundingClientRect();
    return { x: r.left + (ox + q.x * s) / g.canvas.width * r.width,
             y: r.top + (oy + q.y * s) / g.canvas.height * r.height };
  });
  if (pt) { await page.mouse.click(pt.x, pt.y); return true; }
  return false;
}

let ok = 0;
for (let turn = 0; turn < 12; turn++) {
  await page.waitForFunction(
    () => { const g = window.__ludoGame; return g && !g.ui.rollBtn.disabled && g.state.currentPlayer === 0; },
    { timeout: 30000 }
  );
  const before = await page.evaluate(() => window.__ludoGame.state.moveCount);
  await page.click("#btn-roll");
  // stage 1 + stage 2 taps (up to 3 attempts each)
  for (let s = 0; s < 6; s++) {
    await new Promise(r => setTimeout(r, 1500));
    const moved = await page.evaluate(() => window.__ludoGame.state.moveCount > 0 && window.__ludoGame.ui.rollBtn.disabled === false && window.__ludoGame.state.currentPlayer !== 0);
    const hasHl = await page.evaluate(() => window.__ludoGame.highlight.size > 0);
    if (!hasHl) break;
    await tapFirstHighlight();
  }
  const after = await page.evaluate(() => window.__ludoGame.state.moveCount);
  console.log(`turn ${turn}: moves ${before}->${after}`);
  if (after >= before) ok++;
}
console.log("turns completed:", ok, "/12");
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "NO ERRORS");
await browser.close();
