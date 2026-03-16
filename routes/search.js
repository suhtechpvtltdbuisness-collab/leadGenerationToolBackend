const express = require("express");
const router = express.Router();

// Check if running in production or serverless environment
const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME;

let puppeteer;
let chromium;

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

    // Extract data from Google Maps
    const results = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="article"]');
      const data = [];

      items.forEach((item, index) => {
        try {
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

          // Get phone (if available)
          const phoneEl = item.querySelector('[aria-label*="Phone"]');
          const phoneNumber = phoneEl?.textContent?.trim() || null;

          // Get website (if available)
          const websiteEl = item.querySelector('a[href*="http"]');
          const websiteLink = websiteEl?.href || null;

          data.push({
            name,
            rating,
            address,
            phoneNumber,
            websiteLink,
          });
        } catch (error) {
          console.error("Extraction error:", error);
        }
      });

      return data;
    });

    await browser.close();

    // Filter valid results
    const validResults = results.filter((item) => item.name);

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
