/**
 * record-showcase.mjs - records one continuous take of the real app.
 *
 * The video is the app being used, not a mock-up: Chromium drives the live
 * React build against the live database, and every frame comes from the
 * browser's own compositor via a CDP screencast.
 *
 *   - the drawn cursor (demo/showcase-overlay.js) follows the pointer along
 *     an eased path, so movement reads as a hand rather than a teleport
 *   - typing is per character with a human delay distribution
 *   - route changes dissolve through the overlay's crossfade
 *   - every key press, click and navigation is timestamped into events.json,
 *     which the audio step turns into a synced sound bed
 *
 * Usage:
 *   OUT_DIR=<dir> APP_URL=http://localhost:5173 node record-showcase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const OUT_DIR = process.env.OUT_DIR ?? path.join(here, "showcase-out");
const EMAIL = process.env.DEMO_EMAIL ?? "nahin_lead@hemospot.local";
// The app centres every page in a max-w-4xl column, so a wide viewport leaves
// half the frame empty. The overlay scales the app root instead: it lays out
// for a narrower window and renders at full 1080p.
const CSS_WIDTH = 1920;
const CSS_HEIGHT = 1080;
const WIDTH = 1920;
const HEIGHT = 1080;
const APP_ZOOM = 1.5;
const CAPTURE_HZ = 30; // the capture clock; it matches the output rate
const OUT_FPS = 30;

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------- secrets
function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_0-9]+)\s*=\s*(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}
const sidecarEnv = readEnv(path.join(root, "sidecar", ".env"));
const PASSWORD = process.env.DEMO_PASSWORD ?? sidecarEnv.WORKER_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("no password: set DEMO_PASSWORD or sidecar/.env WORKER_PASSWORD");
  process.exit(1);
}

// ---------------------------------------------------------------- helpers
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const events = [];
let t0 = Date.now() / 1000;
function logEvent(kind, extra = {}) {
  events.push({ t: Date.now() / 1000 - t0, kind, ...extra });
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch({
  headless: false,
  channel: "chromium",
  args: [
    "--window-size=1920,1080",
    "--window-position=0,0",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--force-device-scale-factor=1",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: CSS_WIDTH, height: CSS_HEIGHT },
  deviceScaleFactor: 1,
  locale: "en-US",
});
await context.addInitScript({ path: path.join(here, "showcase-overlay.js") });
const page = await context.newPage();

// ---------------------------------------------------------------- screencast
const frames = [];
let captureStarted = false;
const client = await context.newCDPSession(page);
client.on("Page.screencastFrame", async (frame) => {
  frames.push({ ts: frame.metadata.timestamp, buf: Buffer.from(frame.data, "base64") });
  client.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
});

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[aria-label="Email"]', { timeout: 30000 });
// the overlay has to be alive before anything is recorded, or the take is a
// silent, static screen
await page.waitForFunction(() => window.__showcase && window.__showcase.ready === true, {
  timeout: 10000,
});
// lay the app out for a narrower window and render it at full resolution
await page.evaluate((zoom) => window.__showcase.setZoom(zoom), APP_ZOOM);
await page.waitForTimeout(1200); // let the first paint settle before we start recording

await client.send("Page.startScreencast", {
  format: "jpeg",
  quality: 82,
  maxWidth: WIDTH,
  maxHeight: HEIGHT,
  everyNthFrame: 1,
});
captureStarted = true;
// the clock the sound track is measured against starts with the video, not
// with the browser launch
t0 = Date.now() / 1000;

// ---------------------------------------------------------------- frames
// The frames go to disk as they are captured and are encoded afterwards.
// Encoding inside the capture loop puts the encoder on the critical path, and
// at 1080p it cannot keep up with the browser - the picture then drifts
// further and further behind the sound.
const framesDir = path.join(OUT_DIR, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

// ---------------------------------------------------------------- pacer
let capturing = true;
let framesWritten = 0;
const pacer = (async () => {
  const tick = 1 / CAPTURE_HZ;
  let next = Date.now() / 1000;
  let last = null;
  let reported = false;
  while (capturing) {
    const now = Date.now() / 1000;
    while (frames.length && frames[0].ts <= now) last = frames.shift();
    // if the browser cannot deliver fast enough, drop the backlog instead of
    // letting the picture drift later and later behind the sound
    if (frames.length > 10) frames.splice(0, frames.length - 10);
    if (last) {
      framesWritten += 1;
      const name = `f${String(framesWritten).padStart(6, "0")}.jpg`;
      fs.writeFileSync(path.join(framesDir, name), last.buf);
    }
    const behind = now - t0 - framesWritten / CAPTURE_HZ;
    if (!reported && behind > 2.5) {
      console.log(`  !! capture is ${behind.toFixed(1)}s behind real time`);
      reported = true;
    }
    next += tick;
    const waitMs = (next - Date.now() / 1000) * 1000;
    if (waitMs > 0) await delay(waitMs);
  }
})();

// ---------------------------------------------------------------- driving
const timeline = [];
let fatal = null;
async function step(name, fn, { timeout = 20000, critical = false } = {}) {
  if (fatal) return; // a critical step already broke the take
  const started = Date.now() / 1000 - t0;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`step timed out after ${timeout}ms`)), timeout),
      ),
    ]);
    timeline.push({ name, started, ended: Date.now() / 1000 - t0 });
    console.log(`  ${started.toFixed(1).padStart(5)}s  ${name}`);
  } catch (error) {
    timeline.push({ name, started, ended: Date.now() / 1000 - t0, error: String(error) });
    console.log(`  ${started.toFixed(1).padStart(5)}s  ${name}  FAILED: ${error}`);
    if (critical) fatal = `${name}: ${error}`;
  }
}

async function glide(x, y, ms = 650) {
  // The drawn cursor eases to the target on its own (the overlay animates it),
  // so the driver only has to move the real pointer to keep hover states in
  // step. One evaluate plus a handful of moves keeps a glide at its intended
  // length instead of three times it.
  const from = await page.evaluate(() => ({
    x: window.__showcase.__x ?? 960,
    y: window.__showcase.__y ?? 540,
  }));
  const steps = Math.max(8, Math.round(ms / 45));
  const started = Date.now();
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3);
    const arc = Math.sin(Math.PI * t) * 12 * (1 - t);
    const nx = from.x + (x - from.x) * eased - arc * 0.3;
    const ny = from.y + (y - from.y) * eased - arc;
    await page.mouse.move(nx, ny);
    const spent = Date.now() - started;
    const waitMs = (ms * t) - spent;
    if (waitMs > 0) await delay(waitMs);
  }
  await page.evaluate(([px, py]) => window.__showcase.setCursorTarget(px, py), [x, y]);
}

async function clickAt(x, y, ms = 650) {
  await glide(x, y, ms);
  await page.mouse.down();
  await delay(70);
  await page.mouse.up();
  logEvent("click");
  await delay(90);
}

async function boxOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clickElement(locator, ms = 650) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const { x, y } = await boxOf(locator);
  await clickAt(x, y, ms);
}

async function typeText(text, { min = 95, max = 185, spacePause = 130 } = {}) {
  for (const char of text) {
    await page.keyboard.type(char);
    logEvent("key", { char });
    let wait = min + Math.random() * (max - min);
    if (char === " ") wait += spacePause;
    await delay(wait);
  }
}

async function dwell(ms) {
  await delay(ms);
}

async function scrollTo(y, ms = 900) {
  await page.evaluate(([target, duration]) => window.__showcase.scrollTo(target, duration), [y, ms]);
}

async function navLink(name) {
  await clickElement(page.getByRole("link", { name, exact: true }), 700);
  logEvent("nav", { to: name });
  await delay(900);
}

// ---------------------------------------------------------------- the take
console.log("== recording the showcase take ==");

await step("the cursor arrives", async () => {
  await page.evaluate(() => window.__showcase.setCursor(1240, 700));
  await glide(520, 330, 1100);
});

await step("click the email field", async () => {
  await clickElement(page.locator('input[aria-label="Email"]'), 450);
});

await step("type the email", async () => {
  await typeText(EMAIL, { min: 90, max: 165, spacePause: 110 });
});

await step("click the password field", async () => {
  await clickElement(page.locator('input[aria-label="Password"]'), 450);
});

await step("type the password", async () => {
  // a password is typed deliberately: slower, and the field is masked
  await typeText(PASSWORD, { min: 135, max: 215, spacePause: 120 });
});

await step("press Sign in", async () => {
  await clickElement(page.getByRole("button", { name: /sign in/i }), 600);
});

await step(
  "the dashboard arrives",
  async () => {
    await page.waitForSelector("main h1", { timeout: 20000 });
    await page.waitForTimeout(1200);
    await glide(860, 430, 850);
  },
  { critical: true },
);

await step("read the dashboard", async () => {
  await glide(980, 520, 750);
  await dwell(700);
  await glide(760, 300, 700);
  await dwell(500);
});

await step("open Cases", async () => {
  await navLink("Cases");
  await page.waitForTimeout(600);
});

await step("pick the demo case", async () => {
  const card = page.locator('a[href^="/cases/"]').filter({ hasText: "DEMO-CORPUS" }).first();
  await card.waitFor({ timeout: 15000 });
  await clickElement(card, 800);
  await page.waitForTimeout(1400);
});

await step("read the case header", async () => {
  await glide(760, 250, 800);
  await dwell(700);
  await scrollTo(420, 900);
  await dwell(600);
});

await step("scroll to the evidence list", async () => {
  await scrollTo(980, 1000);
  await dwell(900);
  await glide(880, 500, 750);
  await dwell(500);
});

await step("open Analyses", async () => {
  await navLink("Analyses");
  await page.waitForTimeout(700);
});

await step("open the drop-pattern analysis", async () => {
  const card = page.locator('a[href^="/analyses/"]').filter({ hasText: "drop-pattern" }).first();
  await card.waitFor({ timeout: 15000 });
  await clickElement(card, 800);
  await page.waitForTimeout(2600);
});

await step("the finding", async () => {
  // the outlines are on by default: the photo arrives with the stains marked
  await glide(700, 420, 850);
  await dwell(1000);
  await scrollTo(520, 900);
  await dwell(900);
});

await step("read how it decided", async () => {
  await scrollTo(1080, 1000);
  await dwell(1000);
  await scrollTo(1500, 900);
  await dwell(900);
});

await step("open Chain of custody", async () => {
  await navLink("Chain of custody");
  await page.waitForTimeout(900);
});

await step("choose an evidence item", async () => {
  const select = page.locator('select[aria-label="Evidence item"]');
  await select.waitFor({ timeout: 15000 });
  const box = await boxOf(select);
  await clickAt(box.x, box.y, 650);
  await delay(450);
  await page.keyboard.press("ArrowDown");
  await delay(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1400);
  await scrollTo(360, 850);
  await dwell(800);
});

await step("open Search", async () => {
  await navLink("Search");
  await page.waitForTimeout(700);
});

await step("search for drop", async () => {
  const input = page.locator('input[aria-label="Search query"]');
  await clickElement(input, 500);
  await typeText("drop", { min: 120, max: 190 });
  await clickElement(page.getByRole("button", { name: /^search$/i }), 450);
  await page.waitForTimeout(1400);
  await glide(860, 480, 750);
  await dwell(700);
});

await step("open Reports", async () => {
  await navLink("Reports");
  await page.waitForTimeout(900);
});

await step("generate the report", async () => {
  const select = page.locator('select[aria-label="Report case"]');
  await select.waitFor({ timeout: 15000 });
  const box = await boxOf(select);
  await clickAt(box.x, box.y, 650);
  await delay(450);
  await page.keyboard.press("ArrowDown");
  await delay(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1600);
});

await step("download the PDF report", async () => {
  const button = page.getByRole("button", { name: /download pdf report/i });
  await button.waitFor({ timeout: 15000 });
  await clickElement(button, 650);
  // the document renders in the browser and arrives as a download
  await page
    .waitForEvent("download", { timeout: 2500 })
    .then(() => console.log("    (the PDF download fired)"))
    .catch(() => console.log("    (no download event - the button still changed state)"));
  await page.waitForTimeout(900);
});

await step("back to the finding", async () => {
  await navLink("Analyses");
  await page.waitForTimeout(700);
  const card = page.locator('a[href^="/analyses/"]').filter({ hasText: "drop-pattern" }).first();
  await card.waitFor({ timeout: 15000 });
  await clickElement(card, 700);
  await page.waitForTimeout(2200);
});

await step("hold on the finding", async () => {
  await glide(560, 430, 950);
  await dwell(1600);
  await glide(900, 620, 850);
  await dwell(1200);
});

await step("the recording ends", async () => {
  await dwell(600);
});

if (fatal) {
  console.log(`\nABORTED: ${fatal}`);
}

// ---------------------------------------------------------------- stop
capturing = false;
await pacer;
await client.send("Page.stopScreencast").catch(() => {});
await context.close();
await browser.close();

fs.writeFileSync(
  path.join(OUT_DIR, "events.json"),
  JSON.stringify({ t0, events, timeline }, null, 2),
);
const takeSeconds = Date.now() / 1000 - t0;
console.log(
  `\nframes: ${framesDir} (${framesWritten} frames, ` +
    `${(framesWritten / takeSeconds).toFixed(1)}/s against a wanted ${CAPTURE_HZ})`,
);
console.log(`take:   ${takeSeconds.toFixed(1)}s`);
console.log(`events: ${path.join(OUT_DIR, "events.json")} (${events.length})`);
