const mongoose = require("mongoose");

const globalMongoose = global;

if (!globalMongoose._mongooseCache) {
  globalMongoose._mongooseCache = {
    conn: null,
    promise: null,
    listenersAttached: false,
  };
}

const cache = globalMongoose._mongooseCache;

const attachConnectionListeners = () => {
  if (cache.listenersAttached) return;

  mongoose.connection.on("connected", () => {
    console.log("Mongoose connected to DB");
  });

  mongoose.connection.on("error", (err) => {
    console.error("Mongoose connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("Mongoose disconnected from DB");
  });

  cache.listenersAttached = true;
};

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  if (cache.conn && mongoose.connection.readyState === 1) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 120000,
        maxPoolSize: 10,
        minPoolSize: 1,
        keepAlive: true,
        keepAliveInitialDelay: 300000,
      })
      .then((conn) => {
        attachConnectionListeners();
        return conn;
      })
      .catch((error) => {
        cache.promise = null;
        throw error;
      });
  }

  try {
    const conn = await cache.promise;
    cache.conn = conn;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    cache.conn = null;
    cache.promise = null;
    throw error;
  }
};

// Helper function to get native MongoDB database instance
const getDb = async () => {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }

  return mongoose.connection.db;
};

module.exports = { connectDB, getDb };
