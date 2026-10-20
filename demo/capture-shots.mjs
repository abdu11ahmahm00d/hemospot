/**
 * capture-shots.mjs - screenshots of the real UI for the brag video.
 *
 * Same plumbing as capture-demo.mjs (the T-015 walkthrough recorder): it signs
 * in as a real persona, resolves the demo case, its evidence and its analyses
 * through the REST API, then photographs the live screens. Every pixel in the
 * brag video comes from this app running against the live database.
 *
 * Usage:
 *   SHOTS_DIR=<dir> node capture-shots.mjs
 *
 * The persona password is read from sidecar/.env - nothing secret is stored here.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL = process.env.DEMO_EMAIL ?? "nahin_lead@hemospot.local";
const OUT_DIR = process.env.SHOTS_DIR ?? path.join(here, "shots");
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
  if (!cases.length) throw new Error(`case ${CASE_NUMBER} not found`);
  const caseId = cases[0].id;

  const evidence = await api(`/rest/v1/evidence?case_id=eq.${caseId}&select=id,file_name`, { headers });
  if (!evidence.length) throw new Error(`no evidence in case ${CASE_NUMBER}`);
  const evidenceIds = evidence.map((e) => e.id);

  const analyses = await api(
    `/rest/v1/analyses?select=id,verdict,confidence,stain_count,evidence_id&evidence_id=in.(${evidenceIds.join(",")})`,
    { headers },
  );
  // The money shot wants a definitive verdict with stains on the photo. Impact
  // first (it is the class the corpus is rare in), then the most confident.
  const definitive = analyses.filter((a) => a.verdict && a.verdict !== "inconclusive");
  const scored = definitive.sort((a, b) => {
    const rank = (row) => (row.verdict === "impact" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return Number(b.stain_count ?? 0) - Number(a.stain_count ?? 0);
  });
  const analysis = scored[0];
  if (!analysis) throw new Error("no definitive analysis in the corpus case");

  const withEvents = await api(
    `/rest/v1/custody_events?select=evidence_id&evidence_id=in.(${evidenceIds.join(",")})`,
    { headers },
  );
  const withChain = new Set(withEvents.map((event) => event.evidence_id));
  const chained = evidence.find((item) => withChain.has(item.id)) ?? evidence[0];

  // The honest branch: an analysis the engine refused to guess about.
  const inconclusive = analyses.find((a) => a.verdict === "inconclusive");

  return {
    caseId,
    analysisId: analysis.id,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    stainCount: analysis.stain_count,
    evidenceId: chained.id,
    evidenceName: chained.file_name,
    inconclusiveId: inconclusive?.id ?? null,
  };
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${name}.png`);
}

async function main() {
  const ids = await resolveFixtureIds();
  console.log("fixture:", ids);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await settle(page, 1500);
    await shot(page, "01-login");

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 30000 }).catch(() => {});
    await settle(page, 1500);
    await shot(page, "02-dashboard");

    await page.goto(`${APP_URL}/cases`, { waitUntil: "domcontentloaded" });
    await settle(page, 1200);
    await shot(page, "03-cases");

    await page.goto(`${APP_URL}/cases/${ids.caseId}`, { waitUntil: "domcontentloaded" });
    await settle(page, 1200);
    await shot(page, "04-case-detail");

    await page.goto(`${APP_URL}/analyses/${ids.analysisId}`, { waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    await shot(page, "05-analysis");

    // The photo with its stain outlines, cropped tight - the hook image.
    const photo = page.locator('div.relative.overflow-hidden.rounded-md.border').first();
    if (await photo.count()) {
      await photo.screenshot({ path: path.join(OUT_DIR, "06-overlay.png") });
      console.log("  06-overlay.png");
    }

    // The result card on its own - label, confidence, per-class bars, reasons.
    const card = page.locator("div.rounded-xl.border", { hasText: "confidence" }).first();
    if (await card.count()) {
      await card.screenshot({ path: path.join(OUT_DIR, "07-result-card.png") });
      console.log("  07-result-card.png");
    }

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
    const evidenceCase = await page
      .$eval('select[aria-label="Case"]', (select) => {
        const option = Array.from(select.options).find((o) => o.text.includes("DEMO-CORPUS"));
        return option?.value ?? "";
      })
      .catch(() => "");
    if (evidenceCase) {
      await page.selectOption('select[aria-label="Case"]', evidenceCase).catch(() => {});
      await settle(page, 1200);
    }
    await shot(page, "08-evidence");

    await page.goto(`${APP_URL}/custody`, { waitUntil: "domcontentloaded" });
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
    const custodyValue = await page
      .$eval('select[aria-label="Evidence item"]', (select) => {
        const options = Array.from(select.options);
        // Prefer a corpus item that actually has a chain; the drill/verify
        // fixtures also live in the list and are empty.
        const withChain = options.find((o) => o.text.includes("small-spatter"));
        const fallback = options.find(
          (o) => o.text.includes("DEMO-CORPUS") && !/drill-proof|verify-/.test(o.text),
        );
        return (withChain ?? fallback ?? options[0])?.value ?? "";
      })
      .catch(() => "");
    if (custodyValue) {
      await page.selectOption('select[aria-label="Evidence item"]', custodyValue).catch(() => {});
      await settle(page, 1500);
    }
    await shot(page, "09-custody");

    // The custody chain card on its own - the append-only timeline.
    const chain = page.locator("div.rounded-xl.border", { hasText: "append-only" }).first();
    if (await chain.count()) {
      await chain.screenshot({ path: path.join(OUT_DIR, "11-chain.png") });
      console.log("  11-chain.png");
    }

    await page.goto(`${APP_URL}/analyses`, { waitUntil: "domcontentloaded" });
    await settle(page, 1500);
    await shot(page, "12-analyses-list");

    if (ids.inconclusiveId) {
      await page.goto(`${APP_URL}/analyses/${ids.inconclusiveId}`, { waitUntil: "domcontentloaded" });
      await settle(page, 2000);
      await shot(page, "13-inconclusive");
      const inCard = page.locator("div.rounded-xl.border", { hasText: "nconclusive" }).first();
      if (await inCard.count()) {
        await inCard.screenshot({ path: path.join(OUT_DIR, "14-inconclusive-card.png") });
        console.log("  14-inconclusive-card.png");
      }
    }

    await page.goto(`${APP_URL}/search`, { waitUntil: "domcontentloaded" });
    await settle(page, 800);
    await page.fill('input[placeholder^="Case numbers"]', "demo");
    await page.click('button[type="submit"]');
    await settle(page, 1500);
    await shot(page, "10-search");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("capture failed:", error.message);
  process.exit(1);
});
