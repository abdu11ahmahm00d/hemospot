/**
 * capture-demo.mjs - records the end-to-end walkthrough (T-015).
 *
 * Drives the real app in Chromium and records the screen: sign in, cases, a
 * case detail, the analysis result card, the chain of custody, search and the
 * report. Everything the video shows comes from the live database - the case,
 * the evidence and the cached analysis result are looked up through the REST
 * API first, so the script survives a rebuilt corpus.
 *
 * Usage:
 *   1. start the app:      npm run dev        (in app/)
 *   2. record:             npm run capture    (in demo/)
 *   3. convert:            ffmpeg -i demo/demo-walkthrough.webm ... demo/demo-walkthrough.mp4
 *
 * The persona password is read from sidecar/.env (all demo personas share the
 * worker password) - nothing secret is stored in this repository.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = process.env.DEMO_EMAIL ?? "nahin_lead@hemospot.local";
const OUT_DIR = path.join(here, "video");
const CASE_NUMBER = "DEMO-CORPUS";

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_0-9]+)\s*=\s*(.+)$/);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

const env = readEnv(path.join(root, "sidecar", ".env"));
const supabaseUrl = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = env.SUPABASE_ANON_KEY ?? "";
const password = process.env.DEMO_PASSWORD ?? env.WORKER_PASSWORD ?? "";

if (!supabaseUrl || !anonKey || !password) {
  console.error("sidecar/.env must provide SUPABASE_URL, SUPABASE_ANON_KEY and WORKER_PASSWORD");
  process.exit(1);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} -> HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function resolveFixtureIds() {
  const token = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  const headers = { apikey: anonKey, Authorization: `Bearer ${token.access_token}` };

  const cases = await api(`/rest/v1/cases?case_number=eq.${CASE_NUMBER}&select=id,title`, { headers });
  if (!cases.length) throw new Error(`case ${CASE_NUMBER} not found - run build-corpus.ps1 first`);
  const caseId = cases[0].id;

  const evidence = await api(`/rest/v1/evidence?case_id=eq.${caseId}&select=id,file_name`, { headers });
  if (!evidence.length) throw new Error(`no evidence in case ${CASE_NUMBER}`);

  const analyses = await api(
    `/rest/v1/analyses?select=id,verdict,confidence,evidence_id&evidence_id=in.(${evidence.map((e) => e.id).join(",")})`,
    { headers },
  );
  const ready = analyses.filter((a) => a.verdict && a.verdict !== "inconclusive");
  if (!ready.length) throw new Error("no analysed evidence in the corpus case");

  const withEvents = await api(
    `/rest/v1/custody_events?select=evidence_id&evidence_id=in.(${evidence.map((e) => e.id).join(",")})`,
    { headers },
  );
  const withChain = new Set(withEvents.map((event) => event.evidence_id));
  const chained = evidence.find((item) => withChain.has(item.id)) ?? evidence[0];

  return {
    caseId,
    analysisId: ready[0].id,
    evidenceId: chained.id,
    verdict: ready[0].verdict,
    confidence: ready[0].confidence,
  };
}

async function banner(page, text) {
  await page.evaluate((label) => {
    let element = document.getElementById("hemospot-demo-banner");
    if (!element) {
      element = document.createElement("div");
      element.id = "hemospot-demo-banner";
      element.style.cssText = [
        "position:fixed", "left:0", "right:0", "top:0", "z-index:2147483647",
        "background:#0f172a", "color:#e2e8f0", "padding:10px 18px",
        "font:600 15px/1.4 'Segoe UI',system-ui,sans-serif",
        "display:flex", "gap:14px", "align-items:center",
        "box-shadow:0 1px 0 rgba(255,255,255,.10)", "pointer-events:none",
      ].join(";");
      document.body.appendChild(element);
    }
    element.innerHTML = `<span style="opacity:.55;font-weight:600">HEMOSPOT</span><span>${label}</span>`;
  }, text);
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function main() {
  const ids = await resolveFixtureIds();
  console.log("fixture:", ids);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // The full Chromium build (not the headless shell) is what this machine has
  // installed; `npx playwright install chromium` also provides the shell.
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1600, height: 900 } },
  });
  const page = await context.newPage();

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await banner(page, "Sign in as the lead investigator");
  await page.waitForTimeout(2200);
    await settle(page, 800);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 30000 }).catch(() => {});
    await settle(page);
    await banner(page, "Dashboard - open cases, pending reviews, analysis queue");
  await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/cases`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await banner(page, "Cases - the case register");
  await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/cases/${ids.caseId}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await banner(page, `Case detail - ${CASE_NUMBER}, status, timeline`);
  await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/analyses`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await banner(page, "Analyses - every request and its state");
  await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/analyses/${ids.analysisId}`, { waitUntil: "domcontentloaded" });
    await settle(page, 2200);
    await banner(page, `Result card - ${ids.verdict} (${Number(ids.confidence).toFixed(2)}), explanation, model hash`);
  await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/evidence`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () => {
          const select = document.querySelector('select[aria-label="Case"]');
          return (
            select && Array.from(select.options).some((option) => option.text.includes("DEMO-CORPUS"))
          );
        },
        { timeout: 20000 },
      )
      .catch(() => {});
    await settle(page, 600);
    const evidenceCase = await page
      .$eval('select[aria-label="Case"]', (select) => {
        const option = Array.from(select.options).find((o) => o.text.includes("DEMO-CORPUS"));
        return option?.value ?? "";
      })
      .catch(() => "");
    if (evidenceCase) {
      await page.selectOption('select[aria-label="Case"]', evidenceCase).catch(() => {});
      await settle(page, 800);
    }
    await banner(page, "Evidence register - every item, its hash and its chain");
    await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/custody`, { waitUntil: "domcontentloaded" });
    // the option list is fetched asynchronously - wait for a corpus item to appear
    await page
      .waitForFunction(
        () => {
          const select = document.querySelector('select[aria-label="Evidence item"]');
          return (
            select && Array.from(select.options).some((option) => option.text.includes("DEMO-CORPUS"))
          );
        },
        { timeout: 20000 },
      )
      .catch(() => {});
    await settle(page, 600);
    const custodyValue = await page
      .$eval('select[aria-label="Evidence item"]', (select) => {
        const option = Array.from(select.options).find((o) => o.text.includes("DEMO-CORPUS"));
        return option?.value ?? "";
      })
      .catch(() => "");
    if (custodyValue) {
      await page.selectOption('select[aria-label="Evidence item"]', custodyValue).catch(() => {});
      await settle(page, 1500);
    }
    await banner(page, "Chain of custody - append-only, every handoff recorded");
    await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/search`, { waitUntil: "domcontentloaded" });
    await settle(page, 800);
    await page.fill('input[placeholder^="Case numbers"]', "demo");
    await page.click('button[type="submit"]');
    await settle(page, 1200);
    await banner(page, "Search - role-filtered, only what this user may see");
  await page.waitForTimeout(2200);

    await page.goto(`${APP_URL}/reports`, { waitUntil: "domcontentloaded" });
    await settle(page, 1000);
    const reportValue = await page
      .$eval("select", (select) => {
        const option = Array.from(select.options).find((o) => o.text.includes("DEMO-CORPUS"));
        return option?.value ?? "";
      })
      .catch(() => "");
    if (reportValue) {
      await page.selectOption("select", reportValue).catch(() => {});
      await settle(page, 1800);
    }
    await banner(page, "Case report - evidence, analyses and custody, exportable to PDF");
  await page.waitForTimeout(2200);
    await page.waitForTimeout(2500);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const source = await video.path();
      const target = path.join(OUT_DIR, "demo-walkthrough.webm");
      fs.copyFileSync(source, target);
      fs.rmSync(source, { force: true });
      console.log("video:", target);
    }
  }
}

main().catch((error) => {
  console.error("capture failed:", error.message);
  process.exit(1);
});
