const express = require("express");
const router = express.Router();

// Check if running in production or serverless environment
const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME;

let puppeteer;
let chromium;

const EMAIL_REGEX_GLOBAL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const extractFirstValidEmail = (text = "") => {
  const matches = text.match(EMAIL_REGEX_GLOBAL) || [];
  const blockedDomains = ["example.com", "email.com", "domain.com"];

  for (const raw of matches) {
    const email = raw.trim().toLowerCase();
    const domain = email.split("@")[1] || "";
    if (!blockedDomains.includes(domain)) {
      return email;
    }
  }

  return null;
};

const resolveWebsiteUrl = (rawUrl) => {
  if (!rawUrl) return null;

  try {
    const first = new URL(rawUrl);

    // Google redirect links may include actual target in q=...
    if (
      (first.hostname === "www.google.com" ||
        first.hostname === "google.com") &&
      first.pathname === "/url"
    ) {
      const redirected = first.searchParams.get("q");
      if (redirected) {
        return new URL(redirected).toString();
      }
    }

    return first.toString();
  } catch (error) {
    return null;
  }
};

const scrapeEmailFromWebsite = async (browser, websiteUrl) => {
  const normalized = resolveWebsiteUrl(websiteUrl);
  if (!normalized) return null;

  let page;
  try {
    page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        ["image", "stylesheet", "font", "media"].includes(req.resourceType())
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const collectEmailFromCurrentPage = async () => {
      return page.evaluate(() => {
        const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

        const mailto = document.querySelector('a[href^="mailto:"]');
        const mailFromHref = mailto
          ?.getAttribute("href")
          ?.replace("mailto:", "")
          ?.trim();
        if (mailFromHref) {
          return mailFromHref;
        }

        const bodyText = document.body?.innerText || "";
        const fromText = bodyText.match(EMAIL_REGEX)?.[0] || null;
        if (fromText) {
          return fromText;
        }

        return null;
      });
    };

    await page.goto(normalized, {
      waitUntil: "domcontentloaded",
      timeout: 9000,
    });

    const directEmail = await collectEmailFromCurrentPage();
    const directClean = extractFirstValidEmail(directEmail || "");
    if (directClean) {
      await page.close();
      return directClean;
    }

    const candidatePaths = ["/contact", "/contact-us", "/about", "/about-us"];
    const base = new URL(normalized);

    for (const path of candidatePaths) {
      try {
        const candidateUrl = new URL(
          path,
          `${base.protocol}//${base.host}`,
        ).toString();
        await page.goto(candidateUrl, {
          waitUntil: "domcontentloaded",
          timeout: 7000,
        });

        const email = await collectEmailFromCurrentPage();
        const clean = extractFirstValidEmail(email || "");
        if (clean) {
          await page.close();
          return clean;
        }
      } catch (error) {
        // Ignore navigation failures for optional pages
      }
    }

    await page.close();
    return null;
  } catch (error) {
    if (page) {
      await page.close();
    }
    return null;
  }
};

// Try to use serverless Chrome in production
if (isProd) {
  try {
    chromium = require("@sparticuz/chromium");
    puppeteer = require("puppeteer-core");
    console.log("Using puppeteer-core with @sparticuz/chromium for serverless");
  } catch (error) {
    console.warn("Serverless Chrome not available, falling back to puppeteer");
    puppeteer = require("puppeteer");
  }
} else {
  puppeteer = require("puppeteer");
  console.log("Using puppeteer for local development");
}

// GET /api/search-hospitals - Simple and fast Google Maps search
router.get("/", async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "Query parameter is required",
    });
  }

  console.log(`🔍 Searching Google Maps for: "${query}"`);

  let browser;
  try {
    // Launch browser with minimal configuration for speed
    const launchOptions = {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      headless: chromium ? chromium.headless : "new",
    };

    if (chromium) {
      launchOptions.args = [...chromium.args, ...launchOptions.args];
      launchOptions.executablePath = await chromium.executablePath();
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Block images and stylesheets for faster loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to Google Maps search
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 12000,
    });

    // Wait for search results
    await page.waitForSelector('[role="article"]', { timeout: 6000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Auto-scroll search results to load the maximum available cards
    await page.evaluate(async () => {
      const wait = (ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

      const getItems = () => document.querySelectorAll('[role="article"]');

      const findScrollableContainer = () => {
        const firstItem = getItems()[0];
        if (!firstItem) return null;

        let node = firstItem.parentElement;
        while (node) {
          if (node.scrollHeight > node.clientHeight + 20) {
            return node;
          }
          node = node.parentElement;
        }

        return document.scrollingElement || document.body;
      };

      const scrollContainer = findScrollableContainer();
      if (!scrollContainer) return;

      let lastCount = getItems().length;
      let stalledRounds = 0;
      const maxRounds = 80;
      const maxStalledRounds = 8;
      const scrollDelayMs = 1200;

      for (let round = 0; round < maxRounds; round += 1) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "instant",
        });

        await wait(scrollDelayMs);

        const currentCount = getItems().length;
        if (currentCount <= lastCount) {
          stalledRounds += 1;
          if (stalledRounds >= maxStalledRounds) break;
        } else {
          stalledRounds = 0;
          lastCount = currentCount;
        }
      }
    });

    // Extract data from Google Maps list cards
    const results = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="article"]');
      const data = [];

      const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/;

      const normalizeWebsite = (href) => {
        if (!href) return null;

        try {
          const url = new URL(href);
          const host = (url.hostname || "").replace(/^www\./, "").toLowerCase();
          const path = (url.pathname || "").toLowerCase();

          // Ignore Google and Maps links - these are not business websites
          const isGoogleHost =
            host === "google.com" ||
            host.endsWith(".google.com") ||
            host === "g.page" ||
            host.endsWith(".g.page") ||
            host === "goo.gl";

          const isMapsPath =
            path.startsWith("/maps") ||
            path.startsWith("/search") ||
            path.startsWith("/place");

          if (isGoogleHost && isMapsPath) {
            return null;
          }

          return href;
        } catch (error) {
          return null;
        }
      };

      const findPhoneNumber = (item, textBlob) => {
        const phoneEl = item.querySelector('[aria-label*="Phone"]');
        const phoneFromElement = phoneEl?.textContent?.trim();
        if (phoneFromElement) return phoneFromElement;

        const phoneFromText = textBlob.match(PHONE_REGEX)?.[0]?.trim();
        return phoneFromText || null;
      };

      const findEmail = (item, textBlob) => {
        const mailtoEl = item.querySelector('a[href^="mailto:"]');
        const mailFromHref = mailtoEl
          ?.getAttribute("href")
          ?.replace("mailto:", "");
        if (mailFromHref) return mailFromHref.trim();

        const mailFromText = textBlob.match(EMAIL_REGEX)?.[0]?.trim();
        return mailFromText || null;
      };

      items.forEach((item, index) => {
        try {
          const textBlob = item.textContent || "";

          // Get name
          const nameEl = item.querySelector('[class*="fontHeadlineSmall"]');
          const name = nameEl?.textContent?.trim() || null;

          if (!name) return; // Skip if no name found

          // Get rating
          const ratingEl = item.querySelector(
            '[role="img"][aria-label*="star"]',
          );
          const rating = ratingEl?.getAttribute("aria-label") || null;

          // Get address - look for address in the text content
          const addressEl = item.querySelector('[class*="fontBodyMedium"]');
          const address = addressEl?.textContent?.trim() || null;

          // Get phone/email (if available)
          const phoneNumber = findPhoneNumber(item, textBlob);
          const email = findEmail(item, textBlob);

          // Get website (if available)
          const websiteCandidates = Array.from(
            item.querySelectorAll('a[href^="http"]'),
          );
          const websiteLink =
            websiteCandidates
              .map((a) => normalizeWebsite(a.href))
              .find(Boolean) || null;

          data.push({
            index,
            name,
            rating,
            address,
            phoneNumber,
            email,
            websiteLink,
          });
        } catch (error) {
          console.error("Extraction error:", error);
        }
      });

      return data;
    });

    // Open each place detail to enrich website/email/phone from detail panel
    const listCount = await page.$$eval(
      '[role="article"]',
      (nodes) => nodes.length,
    );
    const detailByIndex = {};

    for (let i = 0; i < listCount; i += 1) {
      try {
        const cards = await page.$$('[role="article"]');
        const card = cards[i];
        if (!card) continue;

        await card.click();

        // Short wait for detail panel to update (no navigation wait - maps is SPA)
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const detail = await page.evaluate(() => {
          const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
          const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/;

          // Extract Google Maps link from detail panel
          const getMapsLink = () => {
            const mapLinks = Array.from(
              document.querySelectorAll('a[href*="/maps/place"]'),
            );
            // Get the most recent/first valid maps link
            for (const mapLink of mapLinks) {
              if (
                mapLink?.href &&
                mapLink.href.includes("/place/") &&
                !mapLink.href.includes("Monarch")
              ) {
                return mapLink.href;
              }
            }
            return null;
          };

          const cleanWebsite = (href) => {
            if (!href) return null;

            try {
              const raw = new URL(href);
              let resolved = href;

              // Google redirect links often store target in "q"
              if (
                (raw.hostname === "www.google.com" ||
                  raw.hostname === "google.com") &&
                raw.pathname === "/url"
              ) {
                const redirected = raw.searchParams.get("q");
                if (redirected) {
                  resolved = redirected;
                }
              }

              const url = new URL(resolved);
              const host = (url.hostname || "")
                .replace(/^www\./, "")
                .toLowerCase();
              const path = (url.pathname || "").toLowerCase();

              const isGoogleHost =
                host === "google.com" ||
                host.endsWith(".google.com") ||
                host === "g.page" ||
                host.endsWith(".g.page") ||
                host === "goo.gl" ||
                host === "google.co.in";

              const isMapsPath =
                path.startsWith("/maps") ||
                path.startsWith("/search") ||
                path.startsWith("/place") ||
                path.startsWith("/intl");

              if (isGoogleHost && isMapsPath) {
                return null;
              }

              return url.toString();
            } catch (error) {
              return null;
            }
          };

          // Extract from detail panel - focus on right-side panel content
          const rightPanel =
            document.querySelector('[role="region"]') || document.body;
          const panelText = rightPanel?.innerText || "";

          // Get website from detail links
          const websiteAnchors = Array.from(
            rightPanel.querySelectorAll('a[href^="http"]') || [],
          );
          const websiteLink =
            websiteAnchors
              .map((a) => cleanWebsite(a.href))
              .find((url) => url && !url.includes("google")) || null;

          // Get phone from detail
          const phoneBtn = rightPanel.querySelector(
            'button[data-item-id^="phone:tel:"]',
          );
          const phoneFromBtn = phoneBtn
            ?.getAttribute("data-item-id")
            ?.replace("phone:tel:", "");
          const phoneNumber =
            (phoneFromBtn && decodeURIComponent(phoneFromBtn)) ||
            panelText.match(PHONE_REGEX)?.[0]?.trim() ||
            null;

          // Get email from detail
          const mailtoEl = rightPanel.querySelector('a[href^="mailto:"]');
          const email =
            mailtoEl?.getAttribute("href")?.replace("mailto:", "")?.trim() ||
            panelText.match(EMAIL_REGEX)?.[0]?.trim() ||
            null;

          return {
            mapsLink: getMapsLink(),
            websiteLink,
            phoneNumber,
            email,
          };
        });

        detailByIndex[i] = detail;
      } catch (detailError) {
        // Continue without failing the whole request if one detail card fails
        detailByIndex[i] = null;
      }
    }

    const enrichedResults = results.map((item) => {
      const detail = detailByIndex[item.index] || {};
      return {
        ...item,
        mapsLink: detail.mapsLink || null,
        phoneNumber: detail.phoneNumber || item.phoneNumber || null,
        email: (detail.email || item.email || null)?.toLowerCase?.() || null,
        websiteLink: detail.websiteLink || item.websiteLink || null,
      };
    });

    // Validation: detect and remove cached/duplicate data across results
    const seenDetail = {};
    const validEnrichedResults = enrichedResults.filter((item) => {
      const key = `${item.phoneNumber}|${item.email}|${item.websiteLink}`;

      // If we see the exact same combo twice, skip the duplicate
      if (seenDetail[key]) {
        console.warn(`⚠️ Skipping duplicate detail for ${item.name}`);
        return false;
      }

      seenDetail[key] = true;
      return true;
    });

    await browser.close();

    // Filter valid results
    const validResults = validEnrichedResults
      .filter((item) => item.name)
      .map((item) => {
        const { index, ...rest } = item;
        return rest;
      });

    console.log(`✅ Found ${validResults.length} results for "${query}"`);

    res.status(200).json({
      success: true,
      count: validResults.length,
      query: query,
      results: validResults,
    });
  } catch (error) {
    console.error("❌ Search error:", error.message);
    if (browser) {
      await browser.close();
    }
    res.status(500).json({
      success: false,
      error: "Failed to search",
      message: error.message,
    });
  }
});

module.exports = router;
