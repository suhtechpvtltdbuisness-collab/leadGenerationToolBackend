const { MongoClient } = require("mongodb");
require("dotenv").config();

let client;
let db;

// Helper to build Mongo client options, including TLS for production
const buildClientOptions = () => {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  const allowInvalidTls = process.env.ALLOW_INVALID_TLS === "true";

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  };

  if (isProd) {
    // For mongodb+srv URIs TLS is usually implied, but we set it explicitly
    options.tls = true;

    // When ALLOW_INVALID_TLS=true, relax TLS validation similar to
    // `ssl: { rejectUnauthorized: false }` but using supported v7 options.
    if (allowInvalidTls) {
      options.tlsAllowInvalidCertificates = true;
    }
  }

  return options;
};

const getMongoUri = () => {
  const uri = process.env.MONGODB_URI || process.env.DATABASSURL;
  if (!uri) {
    throw new Error(
      "MongoDB connection string is not defined. Set MONGODB_URI or DATABASSURL in your environment.",
    );
  }
  return uri;
};

// Establish a single shared connection for the process
const connectionDb = async () => {
  if (db) {
    return db;
  }

  const uri = getMongoUri();

  if (!client) {
    client = new MongoClient(uri, buildClientOptions());
  }

  try {
    await client.connect();

    // If a DB name is provided, use it, otherwise let the driver pick the default
    const dbName = process.env.MONGODB_DB || undefined;
    db = client.db(dbName);

    console.log(`✅ Connected to MongoDB${dbName ? ` (db: ${dbName})` : ""}`);
    return db;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    // Re-throw so the caller (server startup) can decide to abort
    throw error;
  }
};

// Lazy getter used in request handlers; ensures connection is established
const getDb = async () => {
  if (db) {
    return db;
  }
  return connectionDb();
};

module.exports = {
  connectionDb,
  getDb,
};
