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

// GET /api/search-hospitals - Search hospitals using Google Maps
router.get("/", async (req, res) => {
  const { query, limit = 20, offset = 0 } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  const maxResults = parseInt(limit);
  const startFrom = parseInt(offset);

  console.log(
    `Searching for: ${query} | Limit: ${maxResults} | Offset: ${startFrom}`,
  );

  let browser;
  try {
    if (chromium) {
      // Use serverless Chrome
      browser = await puppeteer.launch({
        args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath({
          cacheDir: "/tmp",
        }),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      // Use standard Puppeteer
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for results to load
    await page.waitForSelector('[role="article"]', { timeout: 10000 });

    // Extract hospital/business information
    const results = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="article"]');
      const data = [];

      items.forEach((item) => {
        try {
          const nameEl = item.querySelector('[class*="fontHeadlineSmall"]');
          const ratingEl = item.querySelector(
            '[role="img"][aria-label*="stars"]',
          );
          const addressEl = item.querySelector(
            '[class*="fontBodyMedium"] > div:last-child',
          );
          const phoneEl = item.querySelector('[aria-label*="Phone"]');
          const websiteEl = item.querySelector('a[href*="http"]');

          data.push({
            name: nameEl ? nameEl.textContent.trim() : null,
            rating: ratingEl ? ratingEl.getAttribute("aria-label") : null,
            address: addressEl ? addressEl.textContent.trim() : null,
            phoneNumber: phoneEl ? phoneEl.textContent.trim() : null,
            websiteLink: websiteEl ? websiteEl.href : null,
          });
        } catch (error) {
          console.error("Error extracting item:", error);
        }
      });

      return data;
    });

    await browser.close();

    // Filter out null results and apply limit/offset
    const filteredResults = results
      .filter((item) => item.name)
      .slice(startFrom, startFrom + maxResults);

    res.status(200).json({
      success: true,
      count: filteredResults.length,
      query: query,
      results: filteredResults,
    });
  } catch (error) {
    console.error("Error searching hospitals:", error);
    if (browser) {
      await browser.close();
    }
    res.status(500).json({
      success: false,
      error: "Failed to search hospitals",
      message: error.message,
    });
  }
});

module.exports = router;
