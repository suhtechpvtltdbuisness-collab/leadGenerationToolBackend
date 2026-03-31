const express = require("express");
const router = express.Router();

const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME;

let puppeteer;
let chromium;

// ─── Utilities ────────────────────────────────────────────────────────────────

const EMAIL_REGEX_GLOBAL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const extractFirstValidEmail = (text = "") => {
  const blocked = ["example.com", "email.com", "domain.com"];
  for (const raw of (text.match(EMAIL_REGEX_GLOBAL) || [])) {
    const email = raw.trim().toLowerCase();
    const domain = email.split("@")[1] || "";
    if (!blocked.includes(domain)) return email;
  }
  return null;
};

/**
 * Is this result's address within the requested city/state?
 */
const isInLocation = (address, city, state) => {
  if (!address) return false;
  const addr = address.toLowerCase();
  if (state && state.trim() && !addr.includes(state.trim().toLowerCase())) return false;
  if (city && city.trim() && !addr.includes(city.trim().toLowerCase())) return false;
  return true;
};

// ─── Puppeteer / Chromium bootstrap ───────────────────────────────────────────

if (isProd) {
  try {
    chromium = require("@sparticuz/chromium");
    puppeteer = require("puppeteer-core");
    console.log("Using puppeteer-core with @sparticuz/chromium");
  } catch (_) {
    console.warn("Falling back to puppeteer");
    puppeteer = require("puppeteer");
  }
} else {
  puppeteer = require("puppeteer");
  console.log("Using puppeteer for local dev");
}

// ─── Shared browser-side helpers (serialized strings for page.evaluate) ───────

/**
 * cleanUrl: unwrap google redirect (google.com/url?q=TARGET) then validate.
 * Must be self-contained — no closures — because it's inlined into evaluate.
 */
const CLEAN_URL_SRC = `
function cleanUrl(href) {
  if (!href) return null;
  try {
    let url = new URL(href);
    if (
      (url.hostname === 'www.google.com' || url.hostname === 'google.com') &&
      url.pathname === '/url'
    ) {
      const q = url.searchParams.get('q');
      if (q) { try { url = new URL(q); } catch(_) { return null; } }
    }
    const host = (url.hostname || '').replace(/^www\\./, '').toLowerCase();
    const path = (url.pathname || '').toLowerCase();
    const googleHost =
      host === 'google.com' || host.endsWith('.google.com') ||
      host === 'g.page'    || host.endsWith('.g.page')    ||
      host === 'goo.gl'    || host === 'google.co.in';
    const mapsPath =
      path.startsWith('/maps')  || path.startsWith('/search') ||
      path.startsWith('/place') || path.startsWith('/intl');
    if (googleHost && mapsPath) return null;
    return url.toString();
  } catch(_) { return null; }
}
`;

// ─── Phase 1 helper: extract one card's data ──────────────────────────────────

const EXTRACT_CARD_SRC = `
function extractCard(item) {
  ${CLEAN_URL_SRC}
  const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/;
  const PHONE = /(\\+?\\d[\\d\\s().-]{7,}\\d)/;
  const blob  = item.textContent || '';

  const nameEl = item.querySelector('[class*="fontHeadlineSmall"]');
  const name   = nameEl?.textContent?.trim() || null;
  if (!name) return null;

  const ratingEl = item.querySelector('[role="img"][aria-label*="star"]');
  const rating   = ratingEl?.getAttribute('aria-label') || null;

  const addrEl  = item.querySelector('[class*="fontBodyMedium"]');
  const address = addrEl?.textContent?.trim() || null;

  const phoneEl    = item.querySelector('[aria-label*="Phone"]');
  const phoneNumber =
    phoneEl?.textContent?.trim() ||
    blob.match(PHONE)?.[0]?.trim() ||
    null;

  const mailtoEl = item.querySelector('a[href^="mailto:"]');
  const email =
    mailtoEl?.getAttribute('href')?.replace('mailto:', '')?.trim() ||
    blob.match(EMAIL)?.[0]?.trim() ||
    null;

  // Unwrap all http anchors → pick first real website
  const anchors = Array.from(item.querySelectorAll('a[href^="http"], a[href^="https"]'));
  const websiteLink = anchors.map(a => cleanUrl(a.href)).find(Boolean) || null;

  // Direct Maps place URL for parallel detail fetch
  const placeUrl = item.querySelector('a[href*="/maps/place"]')?.href || null;

  return { name, rating, address, phoneNumber, email, websiteLink, placeUrl };
}
`;

// ─── Phase 2 helper: extract detail panel from a place page ────────────────────

const DETAIL_EXTRACT_SRC = `
function extractDetail() {
  ${CLEAN_URL_SRC}
  const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/;
  const PHONE = /(\\+?\\d[\\d\\s().-]{7,}\\d)/;

  const panel = document.querySelector('[role="main"]') ||
                document.querySelector('[role="region"]') ||
                document.body;
  const text  = panel?.innerText || '';

  // Website – priority: data-item-id="authority" button (official Maps widget)
  const authEl = panel.querySelector('a[data-item-id="authority"]');
  let websiteLink = authEl ? cleanUrl(authEl.href) : null;
  if (!websiteLink) {
    const all = Array.from(panel.querySelectorAll('a[href^="http"], a[href^="https"]'));
    websiteLink = all.map(a => cleanUrl(a.href)).find(u => u && !u.includes('google')) || null;
  }

  // Phone – priority: data-item-id button
  const phoneBtn = panel.querySelector('button[data-item-id^="phone:tel:"]');
  const rawPhone = phoneBtn?.getAttribute('data-item-id')?.replace('phone:tel:', '');
  const phoneNumber =
    (rawPhone && decodeURIComponent(rawPhone)) ||
    text.match(PHONE)?.[0]?.trim() ||
    null;

  // Email
  const mailEl = panel.querySelector('a[href^="mailto:"]');
  const email  =
    mailEl?.getAttribute('href')?.replace('mailto:', '')?.trim() ||
    text.match(EMAIL)?.[0]?.trim() ||
    null;

  // Maps link
  const mapsLink = window.location.href.includes('/maps/place/')
    ? window.location.href
    : (panel.querySelector('a[href*="/maps/place"]')?.href || null);

  return { websiteLink, phoneNumber, email, mapsLink };
}
`;

// ─── Phase 2: open one detail page and extract ────────────────────────────────

const fetchDetail = async (browser, placeUrl) => {
  if (!placeUrl) return null;
  let page;
  try {
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(placeUrl, { waitUntil: "domcontentloaded", timeout: 12000 });

    // Wait for panel to hydrate (use selector — avoids unnecessary fixed delay)
    try {
      await page.waitForSelector('[role="main"]', { timeout: 5000 });
    } catch (_) {}

    // eslint-disable-next-line no-eval
    const detail = await page.evaluate(eval(`(function(){ ${DETAIL_EXTRACT_SRC} return extractDetail(); })`));
    await page.close();
    return detail;
  } catch (err) {
    if (page) { try { await page.close(); } catch (_) {} }
    return null;
  }
};

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const { query, city, state } = req.query;

  if (!query || query.trim() === "") {
    return res.status(400).json({ success: false, error: "Query parameter is required" });
  }

  console.log(`🔍 query="${query}" city="${city || "-"}" state="${state || "-"}"`);

  let browser;
  try {
    // ── Launch ──────────────────────────────────────────────────────────────
    const baseArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "--disable-translate",
    ];

    const launchOptions = {
      args: chromium ? [...chromium.args, ...baseArgs] : baseArgs,
      headless: chromium ? chromium.headless : "new",
    };
    if (chromium) launchOptions.executablePath = await chromium.executablePath();

    browser = await puppeteer.launch(launchOptions);

    // ── Phase 1: Open Maps list, scroll + capture progressively ─────────────
    const listPage = await browser.newPage();

    await listPage.setRequestInterception(true);
    listPage.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Build location-aware query
    let hint = "";
    if (city && city.trim()) hint += ` ${city.trim()}`;
    if (state && state.trim()) hint += ` ${state.trim()}`;
    const fullQuery = `${query.trim()}${hint}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(fullQuery)}`;
    console.log(`🌐 ${searchUrl}`);

    await listPage.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await listPage.waitForSelector('[role="article"]', { timeout: 8000 });
    // Small pause for initial JS hydration
    await new Promise((r) => setTimeout(r, 800));

    // ── KEY FIX: capture cards INTO a global JS variable AS we scroll ────────
    // Google Maps uses virtual/recycling scroll — cards scroll OUT of the DOM.
    // By capturing each card the moment it appears (before it's recycled),
    // we get ALL results instead of only what's visible at the end.
    await listPage.evaluate(() => {
      window.__gmCards  = []; // accumulated results
      window.__gmSeen   = new Set(); // dedup by name
    });

    console.log("📜 Progressive scroll-capture started...");

    const captured = await listPage.evaluate(async () => {
      // === Inline helpers ===
      function cleanUrl(href) {
        if (!href) return null;
        try {
          let url = new URL(href);
          if (
            (url.hostname === "www.google.com" || url.hostname === "google.com") &&
            url.pathname === "/url"
          ) {
            const q = url.searchParams.get("q");
            if (q) { try { url = new URL(q); } catch (_) { return null; } }
          }
          const host = (url.hostname || "").replace(/^www\./, "").toLowerCase();
          const path = (url.pathname || "").toLowerCase();
          const googleHost =
            host === "google.com" || host.endsWith(".google.com") ||
            host === "g.page"     || host.endsWith(".g.page")     ||
            host === "goo.gl"     || host === "google.co.in";
          const mapsPath =
            path.startsWith("/maps")  || path.startsWith("/search") ||
            path.startsWith("/place") || path.startsWith("/intl");
          if (googleHost && mapsPath) return null;
          return url.toString();
        } catch (_) { return null; }
      }

      function extractCard(item) {
        const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
        const blob  = item.textContent || "";

        const nameEl = item.querySelector('[class*="fontHeadlineSmall"]');
        const name   = nameEl?.textContent?.trim() || null;
        if (!name) return null;

        const ratingEl = item.querySelector('[role="img"][aria-label*="star"]');
        const rating   = ratingEl?.getAttribute("aria-label") || null;

        const addrEl  = item.querySelector('[class*="fontBodyMedium"]');
        const address = addrEl?.textContent?.trim() || null;

        const phoneEl = item.querySelector('[aria-label*="Phone"]');
        const phoneNumber =
          phoneEl?.textContent?.trim() ||
          blob.match(PHONE)?.[0]?.trim() ||
          null;

        const mailtoEl = item.querySelector('a[href^="mailto:"]');
        const email =
          mailtoEl?.getAttribute("href")?.replace("mailto:", "")?.trim() ||
          blob.match(EMAIL)?.[0]?.trim() ||
          null;

        const anchors     = Array.from(item.querySelectorAll('a[href^="http"], a[href^="https"]'));
        const websiteLink = anchors.map(a => cleanUrl(a.href)).find(Boolean) || null;
        const placeUrl    = item.querySelector('a[href*="/maps/place"]')?.href || null;

        return { name, rating, address, phoneNumber, email, websiteLink, placeUrl };
      }

      function captureVisible() {
        let found = 0;
        document.querySelectorAll('[role="article"]').forEach((item) => {
          const data = extractCard(item);
          if (data && !window.__gmSeen.has(data.name)) {
            window.__gmSeen.add(data.name);
            data.index = window.__gmCards.length;
            window.__gmCards.push(data);
            found++;
          }
        });
        return found;
      }

      // Find the scrollable panel (try ARIA label first, then DOM walk)
      function findScrollable() {
        const byLabel = [
          '[aria-label*="Search results"]',
          '[aria-label*="Results for"]',
          '[role="feed"]',
        ]
          .map(s => document.querySelector(s))
          .find(el => el && el.scrollHeight > el.clientHeight + 50);

        if (byLabel) return byLabel;

        const first = document.querySelector('[role="article"]');
        if (!first) return document.scrollingElement || document.body;
        let node = first.parentElement;
        while (node && node !== document.documentElement) {
          if (node.scrollHeight > node.clientHeight + 50) return node;
          node = node.parentElement;
        }
        return document.scrollingElement || document.body;
      }

      const wait = ms => new Promise(r => setTimeout(r, ms));

      // Initial capture before scrolling
      captureVisible();

      const container = findScrollable();
      let stalledRounds = 0;
      const MAX_STALLED = 8;    // bail after 8 rounds with no new cards
      const SCROLL_DELAY = 600; // ms between scrolls — fast but reliable
      const MAX_ROUNDS   = 200; // safety cap (~2 min scroll max)

      for (let round = 0; round < MAX_ROUNDS; round++) {
        container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
        await wait(SCROLL_DELAY);

        const newFound = captureVisible();

        if (newFound === 0) {
          stalledRounds++;
          if (stalledRounds >= MAX_STALLED) break;
        } else {
          stalledRounds = 0;
        }
      }

      return window.__gmCards;
    });

    await listPage.close();
    console.log(`📦 Progressive capture: ${captured.length} unique cards found`);

    // ── Phase 2: Parallel detail fetch in batches of 8 ───────────────────────
    const BATCH_SIZE = 8;
    const detailMap  = {};

    for (let start = 0; start < captured.length; start += BATCH_SIZE) {
      const batch = captured.slice(start, start + BATCH_SIZE);
      const batchNum = Math.floor(start / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(captured.length / BATCH_SIZE);
      console.log(`⚡ Detail batch ${batchNum}/${totalBatches} (items ${start + 1}–${Math.min(start + BATCH_SIZE, captured.length)})`);

      await Promise.all(
        batch.map(async (card) => {
          // Skip detail fetch if we already have all fields from the list card
          if (card.phoneNumber && card.websiteLink) {
            detailMap[card.index] = {
              mapsLink: card.placeUrl,
              websiteLink: card.websiteLink,
              phoneNumber: card.phoneNumber,
              email: card.email,
            };
            return;
          }
          const detail = await fetchDetail(browser, card.placeUrl);
          detailMap[card.index] = detail;
        })
      );
    }

    // ── Phase 3: Merge list data + detail data ────────────────────────────────
    const enriched = captured.map((card) => {
      const d = detailMap[card.index] || {};
      return {
        index:       card.index,
        name:        card.name,
        rating:      card.rating,
        address:     card.address,
        phoneNumber: d.phoneNumber  || card.phoneNumber  || null,
        email:       ((d.email || card.email || null))?.toLowerCase?.() || null,
        websiteLink: d.websiteLink  || card.websiteLink  || null,
        mapsLink:    d.mapsLink     || card.placeUrl      || null,
      };
    });

    // ── Deduplicate by phone+email+website ────────────────────────────────────
    const seen = new Set();
    const deduped = enriched.filter((item) => {
      const key = `${item.phoneNumber}|${item.email}|${item.websiteLink}`;
      if (seen.has(key)) { console.warn(`⚠️  Dup skipped: ${item.name}`); return false; }
      seen.add(key);
      return true;
    });

    await browser.close();

    // ── Build final list ──────────────────────────────────────────────────────
    let results = deduped
      .filter((item) => item.name)
      .map(({ index, ...rest }) => rest);

    // Location filter: drop results from wrong city/state
    if ((state && state.trim()) || (city && city.trim())) {
      const before  = results.length;
      results       = results.filter((item) => isInLocation(item.address, city, state));
      const removed = before - results.length;
      if (removed > 0) {
        console.log(`🗺️  Location filter: removed ${removed}, kept ${results.length}`);
      }
    }

    // Re-number serially after filter
    results = results.map((item, i) => ({ serialNumber: i + 1, ...item }));

    console.log(`✅ Returning ${results.length} results`);

    return res.status(200).json({
      success: true,
      count:   results.length,
      query,
      city:    city  || null,
      state:   state || null,
      results,
    });
  } catch (error) {
    console.error("❌ Search error:", error.message);
    if (browser) { try { await browser.close(); } catch (_) {} }
    return res.status(500).json({
      success: false,
      error:   "Failed to search",
      message: error.message,
    });
  }
});

module.exports = router;
