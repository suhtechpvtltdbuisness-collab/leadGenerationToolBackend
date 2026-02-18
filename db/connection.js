const { MongoClient } = require('mongodb');

let db = null;
let client = null;

async function connectionDb() {
    // Return existing connection if available
    if (db) {
        return db;
    }
    
    let url = process.env.MONGODB_URI || process.env.DATABASSURL; // Check both
    if (!url) {
        throw new Error('MONGODB_URI or DATABASSURL is not defined in .env file');
    }
    
    // Remove quotes if present
    url = url.replace(/^["']|["']$/g, '');

    try {
        client = new MongoClient(url, {
            ssl: true,
            tls: true,
            tlsInsecure: true,
            directConnection: false,
            serverSelectionTimeoutMS: 10000,
        });
        await client.connect();
        console.log('✅ Connected to MongoDB');
        db = client.db(); // Store database instance
        return db;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error.message);
        throw error; // Throw error instead of exiting (for serverless)
    }
}

// Function to get the database instance (auto-connects for serverless)
async function getDb() {
    if (!db) {
        await connectionDb();
    }
    return db;
}

module.exports = { connectionDb, getDb };
