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
    
    // Ensure connection string has proper options for Vercel
    if (!url.includes('?')) {
        url += '?retryWrites=true&w=majority';
    }

    try {
        const options = {
            tls: true,
            tlsAllowInvalidCertificates: true,
            maxPoolSize: 10,
            minPoolSize: 1,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            family: 4, // Use IPv4, skip trying IPv6
        };
        
        client = new MongoClient(url, options);
        await client.connect();
        
        // Verify connection with ping
        await client.db().command({ ping: 1 });
        
        console.log('✅ Connected to MongoDB');
        db = client.db(); // Store database instance
        return db;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error.message);
        console.error('Full error:', error);
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
