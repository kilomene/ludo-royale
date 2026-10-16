// Visual QA screenshots: node shot.js <url> <out.png> [width] [height] [waitMs]
import puppeteer from "puppeteer";

const [url, out, w = 1080, h = 1080, waitMs = 2000] = process.argv.slice(2);
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h) });
page.on("console", m => { if (m.type() === "error") console.log("[page]", m.text()); });
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
await new Promise(r => setTimeout(r, Number(waitMs)));
await page.screenshot({ path: out });
console.log("saved", out);
await browser.close();
