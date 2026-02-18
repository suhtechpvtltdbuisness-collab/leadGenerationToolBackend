const { MongoClient } = require("mongodb");

let db = null;
let client = null;

async function connectionDb() {
  // Return existing connection if available
  if (db) {
    return db;
  }

  let url = process.env.MONGODB_URI; // Check both
  if (!url) {
    throw new Error("MONGODB_URI or DATABASSURL is not defined in .env file");
  }

  // Remove quotes if present
  url = url.replace(/^["']|["']$/g, "");

  // Ensure connection string has proper options for production
  if (!url.includes("?")) {
    url += "?retryWrites=true&w=majority";
  }

  // Add SSL parameters if not present (for MongoDB Atlas)
  if (!url.includes("ssl=") && !url.includes("tls=")) {
    url += url.includes("?") ? "&ssl=true" : "?ssl=true";
  }

  try {
    const options = {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    };

    client = new MongoClient(url, options);
    await client.connect();

    // Verify connection with ping
    await client.db().command({ ping: 1 });

    console.log("✅ Connected to MongoDB");
    db = client.db(); // Store database instance
    return db;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
    console.error("Full error:", error);
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
