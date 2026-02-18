const { MongoClient } = require('mongodb');

let db = null;

async function connectionDb() {
    let url = process.env.MONGODB_URI || process.env.DATABASSURL; // Check both
    if (!url) {
        throw new Error('MONGODB_URI or DATABASSURL is not defined in .env file');
    }
    
    // Remove quotes if present
    url = url.replace(/^["']|["']$/g, '');

    try {
        const client = new MongoClient(url, {
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
        process.exit(1); // Stop server if DB connection fails
    }
}

// Function to get the database instance
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call connectionDb() first.');
    }
    return db;
}

module.exports = { connectionDb, getDb };
