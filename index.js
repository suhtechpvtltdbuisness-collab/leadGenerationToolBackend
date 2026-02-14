const express = require('express');
const cors = require('cors');
const { connectionDb, getDb } = require('./db/connection');
const { validateLead } = require('./db/schema');
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

// Log all requests to debug 404s
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.get('/health', (req, res) => {
    res.send('hii from lead generation backend');
});

// API Endpoint to store leads (single or multiple)
app.post('/api/leads', async (req, res) => {
    console.log('📥 Received POST request to /api/leads');
    try {
        const db = getDb();
        const leadsCollection = db.collection('leads');

        // Handle both single lead and array of leads
        const leadsData = Array.isArray(req.body) ? req.body : [req.body];

        if (leadsData.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'At least one lead is required'
            });
        }

        const validatedLeads = leadsData.map(lead => validateLead(lead));
        const result = await leadsCollection.insertMany(validatedLeads);

        res.status(201).json({
            success: true,
            message: `${result.insertedCount} lead(s) stored successfully`,
            insertedCount: result.insertedCount,
            insertedIds: result.insertedIds
        });
    } catch (error) {
        console.error('Error storing lead:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// API Endpoint to get all leads
app.get('/api/leads', async (req, res) => {
    console.log('📤 Received GET request to /api/leads');
    try {
        const db = getDb();
        const leadsCollection = db.collection('leads');

        // Fetch all leads, sorted by latest created
        const leads = await leadsCollection.find({}).sort({ createdAt: -1 }).toArray();

        res.status(200).json({
            success: true,
            count: leads.length,
            leads: leads
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch leads'
        });
    }
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
        await connectionDb();
        if (!process.env.VERCEL) {
            const server = app.listen(PORT, '0.0.0.0', () => {
                console.log(`🚀 LeadFlow Backend running on http://0.0.0.0:${PORT}`);
                console.log(`📡 Registered Routes: GET /health, POST /api/leads, GET /api/search-hospitals`);
            });

            server.on('error', (e) => {
                if (e.code === 'EADDRINUSE') {
                    console.error(`❌ Port ${PORT} is already in use by another process!`);
                    process.exit(1);
                }
            });
        }
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();

// Custom 404 handler to debug
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.url} not found on LeadFlow Backend`,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;


