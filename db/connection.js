const { MongoClient } = require('mongodb');

async function connectionDb() {
    const url = process.env.MONGODB_URI || process.env.DATABASSURL; // Check both
    if (!url) {
        throw new Error('MONGODB_URI or DATABASSURL is not defined in .env file');
    }

    try {
        const client = new MongoClient(url);
        await client.connect();
        console.log('✅ Connected to MongoDB');
        return client.db(); // Return database instance if needed
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error.message);
        process.exit(1); // Stop server if DB connection fails
    }
}

module.exports = connectionDb;
