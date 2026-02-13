const express = require('express');
const cors = require('cors');
const connectiondb = require('./db/connection');
require('dotenv').config();

// Determine if we are in production (Vercel)
const isProd = process.env.NODE_ENV === 'production';

let puppeteer;
let chromium;

if (isProd) {
    puppeteer = require('puppeteer-core');
    chromium = require('@sparticuz/chromium');
} else {
    puppeteer = require('puppeteer');
}

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.send('hii from lead generation backend');
});

// API Endpoint to search hospitals
app.get('/api/search-hospitals', async (req, res) => {
    const { query, limit = 20, offset = 0 } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    const maxResults = parseInt(limit);
    const startFrom = parseInt(offset);

    console.log(`Searching for: ${query} | Limit: ${maxResults} | Offset: ${startFrom}`);

    let browser;
    try {
        if (isProd) {
            browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });
        } else {
            browser = await puppeteer.launch({
                headless: "new",
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        }

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Wait for at least one result highlight class to appear
        try {
            await page.waitForSelector('.hfpxzc', { timeout: 10000 });
        } catch (e) {
            console.log('Results selector not found within timeout.');
        }

        // Function to extract results
        const extractResults = async () => {
            return await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('div[role="article"]'));
                return items.map(item => {
                    const nameLink = item.querySelector('a.hfpxzc');
                    const name = nameLink?.getAttribute('aria-label') || item.querySelector('.qBF1Pd')?.innerText || 'No Name';
                    const details = Array.from(item.querySelectorAll('.W4Efsd')).map(d => d.innerText) || [];
                    const rating = item.querySelector('.MW4T7d')?.innerText || 'No Rating';
                    const address = details.find(d => d.includes(',') || /\d+/.test(d)) || 'No Address';
                    const phone = details.find(d => d.includes('+') || /^\d{5,}/.test(d.replace(/\s/g, ''))) || 'No Phone';
                    const websiteLink = item.querySelector('a[data-value="Website"]') ||
                        item.querySelector('a[aria-label*="Website"]') ||
                        Array.from(item.querySelectorAll('a')).find(a => a.href && !a.href.includes('google.com/maps'));
                    return { name, rating, address, phone, website: websiteLink?.href || 'No Website' };
                }).filter(h => h.name !== 'No Name');
            });
        };

        let allResults = [];
        let previousCount = -1;
        let retryCount = 0;

        // Loop to scroll and fetch until we reach the limit
        while (allResults.length < (maxResults + startFrom)) {
            allResults = await extractResults();
            console.log(`Extracted: ${allResults.length} / Target: ${maxResults + startFrom}`);

            if (allResults.length === previousCount) {
                retryCount++;
                if (retryCount > 3) break;
            } else {
                retryCount = 0;
            }
            previousCount = allResults.length;

            // Scroll the feed container
            await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) {
                    feed.scrollBy(0, 1500);
                } else {
                    window.scrollBy(0, 1500);
                }
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const paginatedData = allResults.slice(startFrom, startFrom + maxResults);

        await browser.close();
        res.json({
            success: true,
            total_found: allResults.length,
            count: paginatedData.length,
            limit: maxResults,
            offset: startFrom,
            data: paginatedData
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error('Scraping Error:', error);
        res.status(500).json({ success: false, error: 'Failed to scrape data' });
    }
});

// Start Server after DB Connection (only if not on Vercel)
const startServer = async () => {
    try {
        await connectiondb();
        if (!process.env.VERCEL) {
            app.listen(PORT, () => {
                console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
            });
        }
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();

module.exports = app;


